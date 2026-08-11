/**
 * processors/print-gateway.ts — the database seam for the print pipeline.
 *
 * The processors below (`print.ts`) orchestrate: build the PDF, run the preflight, mint the
 * QR tokens, submit to the printer, follow the status. WHERE the rows live is this file's
 * problem, and it is a port so the orchestration can be tested without a database — the PDF
 * pipeline is heavy enough on its own.
 *
 * `PgPrintGateway` speaks raw SQL against the frozen schema (`packages/db/src/schema/
 * orders.ts`, `stories.ts`, `assets.ts`). Raw rather than the Drizzle query builder because
 * the columns are frozen and the statements here are read-mostly and shaped by joins that
 * read better as SQL than as a builder chain.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';

export type ImageStatus =
  | 'pending'
  | 'generating'
  | 'qa_failed'
  | 'manual_review'
  | 'ready'
  | 'failed';

export interface PrintStoryPage {
  pageNo: number;
  textTr: string;
  /** Print rendition when A4 has produced one, otherwise the screen asset. */
  imageAssetId?: string;
  imageStatus: ImageStatus;
  widthPx?: number;
  heightPx?: number;
}

export interface PrintBuildContext {
  buildId: string;
  storyId: string;
  formatCode: string;
  revision: number;
  dedicationTr?: string;
  qrRenditionId?: string;
  titleTr: string;
  heroName: string;
  ageBand: string;
  lessonTr?: string;
  blurbTr?: string;
  coverAssetId?: string;
  coverWidthPx?: number;
  coverHeightPx?: number;
  pages: PrintStoryPage[];
  /** Existing tokens, so a rebuild does not invalidate the codes already printed. */
  existingQrTokens: Record<number, string>;
  orderNo?: string;
}

export interface SavedArtifact {
  /** `assets.id` of the stored PDF. */
  assetId: string;
  bucket: string;
  key: string;
  bytes: number;
  sha256: string;
}

export interface SaveBuildInput {
  buildId: string;
  spineMm: number;
  checks: { dpiOk: boolean; fontsEmbedded: boolean; safeZoneOk: boolean; bleedOk: boolean };
  warningsTr: string[];
  interior?: SavedArtifact;
  cover?: SavedArtifact;
  preview?: SavedArtifact;
  status: 'ready' | 'failed';
  error?: { code: string; messageTr: string };
}

export interface PrintOrderContext {
  orderId: string;
  orderNo: string;
  status: string;
  bookBuildId: string;
  formatCode: string;
  quantity: number;
  withdrawalWaiverAccepted: boolean;
  withdrawalWaiverShownAt?: Date;
  withdrawalWaiverDocId?: string;
  distanceContractDocId?: string;
  createdAt: Date;
  shipTo: {
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    district?: string;
    postalCode?: string;
    phone: string;
    country: 'TR';
  };
  giftNoteTr?: string;
  /** Signed URLs the printer can fetch. */
  files?: { interiorPdfUrl: string; coverPdfUrl: string };
  printJob?: { id: string; status: string; providerOrderId?: string };
}

export type PdfAssetKind = 'pdf_interior' | 'pdf_cover' | 'pdf_preview' | 'pdf_digital';

export interface StoreArtifactInput {
  kind: PdfAssetKind;
  bucket: string;
  key: string;
  bytes: number;
  sha256: string;
  ownerUserId?: string;
  /**
   * ⚠️ Print files are ORDER DOCUMENTS. They are what proves what was sent to the printer
   * when a parent disputes a book, so they are kept for ten years (SPEC §12, 6502/tax).
   */
  retentionClass?: 'standard' | 'legal_hold_10y';
  purgeAfter?: Date;
}

export interface PrintGateway {
  loadBuildContext(buildId: string): Promise<PrintBuildContext | undefined>;
  /** Inserts the `assets` row for a produced PDF and returns its id. */
  storeArtifact(input: StoreArtifactInput): Promise<string>;
  saveBuild(input: SaveBuildInput): Promise<void>;
  /** Writes `page_audio_links`; existing (build, page) rows are left alone. */
  savePageAudioLinks(
    buildId: string,
    renditionId: string,
    tokens: Record<number, string>,
  ): Promise<void>;
  loadOrder(orderId: string): Promise<PrintOrderContext | undefined>;
  upsertPrintJob(input: {
    orderId: string;
    provider: string;
    providerOrderId?: string;
    status: string;
    files?: { interiorUrl?: string; coverUrl?: string };
    event?: Record<string, unknown>;
    trackingCarrier?: string;
    trackingNo?: string;
    operatorNote?: string;
  }): Promise<string>;
  setOrderStatus(orderId: string, status: string): Promise<void>;
}

/* ── Postgres implementation ───────────────────────────────────────────────── */

interface BuildRow {
  [key: string]: unknown;
  build_id: string;
  story_id: string;
  format_code: string;
  revision: number;
  dedication_tr: string | null;
  qr_rendition_id: string | null;
  title_tr: string | null;
  age_band: string | null;
  lesson_tr: string | null;
  hero_name: string | null;
}

interface PageRow {
  [key: string]: unknown;
  page_no: number;
  text_tr: string | null;
  image_asset_id: string | null;
  image_status: string;
  width: number | null;
  height: number | null;
}

export class PgPrintGateway implements PrintGateway {
  constructor(private readonly db: Database) {}

  async loadBuildContext(buildId: string): Promise<PrintBuildContext | undefined> {
    const buildRows = await this.db.execute<BuildRow>(sql`
      select b.id              as build_id,
             b.story_id        as story_id,
             b.format_code     as format_code,
             b.revision        as revision,
             b.dedication_tr   as dedication_tr,
             b.qr_rendition_id as qr_rendition_id,
             s.title           as title_tr,
             s.age_band        as age_band,
             s.lesson_tr       as lesson_tr,
             s.hero_name       as hero_name
        from book_builds b
        join stories s on s.id = b.story_id
       where b.id = ${buildId}
    `);
    const build = buildRows[0];
    if (!build) return undefined;

    // Page 0 is the cover by convention: `story_pages` has no separate cover row and the
    // unique key is (story_id, page_no), so the cover is simply the page before page 1.
    const pageRows = await this.db.execute<PageRow>(sql`
      select p.page_no,
             p.text_tr,
             coalesce(p.image_print_asset_id, p.image_asset_id) as image_asset_id,
             p.image_status,
             a.width_px  as width,
             a.height_px as height
        from story_pages p
        left join assets a
               on a.id = coalesce(p.image_print_asset_id, p.image_asset_id)
       where p.story_id = ${build.story_id}
       order by p.page_no
    `);

    const linkRows = await this.db.execute<{
      [key: string]: unknown;
      page_no: number;
      token: string;
    }>(sql`
      select page_no, token from page_audio_links
       where book_build_id = ${buildId} and revoked_at is null
    `);
    const existingQrTokens: Record<number, string> = {};
    for (const row of linkRows) existingQrTokens[row.page_no] = row.token;

    const cover = pageRows.find((row) => row.page_no === 0);
    const storyPages = pageRows.filter((row) => row.page_no > 0);

    return {
      buildId: build.build_id,
      storyId: build.story_id,
      formatCode: build.format_code,
      revision: build.revision,
      ...(build.dedication_tr ? { dedicationTr: build.dedication_tr } : {}),
      ...(build.qr_rendition_id ? { qrRenditionId: build.qr_rendition_id } : {}),
      titleTr: build.title_tr ?? 'Masal',
      heroName: build.hero_name ?? '',
      ageBand: build.age_band ?? '3-5',
      ...(build.lesson_tr ? { lessonTr: build.lesson_tr } : {}),
      ...(cover?.image_asset_id ? { coverAssetId: cover.image_asset_id } : {}),
      ...(cover?.width ? { coverWidthPx: cover.width } : {}),
      ...(cover?.height ? { coverHeightPx: cover.height } : {}),
      pages: storyPages.map((row) => ({
        pageNo: row.page_no,
        textTr: row.text_tr ?? '',
        ...(row.image_asset_id ? { imageAssetId: row.image_asset_id } : {}),
        imageStatus: (row.image_status as ImageStatus) ?? 'pending',
        ...(row.width ? { widthPx: row.width } : {}),
        ...(row.height ? { heightPx: row.height } : {}),
      })),
      existingQrTokens,
    };
  }

  async storeArtifact(input: StoreArtifactInput): Promise<string> {
    const rows = await this.db.execute<{ [key: string]: unknown; id: string }>(sql`
      insert into assets (
        owner_user_id, kind, bucket, storage_key, mime_type, size_bytes, sha256,
        retention_class, purge_after
      ) values (
        ${input.ownerUserId ?? null},
        ${input.kind},
        ${input.bucket},
        ${input.key},
        'application/pdf',
        ${input.bytes},
        ${input.sha256},
        ${input.retentionClass ?? 'legal_hold_10y'},
        ${input.purgeAfter ? input.purgeAfter.toISOString() : null}
      )
      on conflict (bucket, storage_key) do update
        set size_bytes = excluded.size_bytes, sha256 = excluded.sha256
      returning id
    `);
    return String(rows[0]?.id ?? '');
  }

  async saveBuild(input: SaveBuildInput): Promise<void> {
    await this.db.execute(sql`
      update book_builds
         set status = ${input.status},
             spine_mm = ${input.spineMm},
             checks = ${JSON.stringify(input.checks)}::jsonb,
             warnings = coalesce(
               (select array_agg(value)
                  from jsonb_array_elements_text(${JSON.stringify(input.warningsTr)}::jsonb) as value),
               '{}'::text[]
             ),
             interior_pdf_asset_id = coalesce(${input.interior?.assetId ?? null}, interior_pdf_asset_id),
             cover_pdf_asset_id = coalesce(${input.cover?.assetId ?? null}, cover_pdf_asset_id),
             preview_pdf_asset_id = coalesce(${input.preview?.assetId ?? null}, preview_pdf_asset_id),
             error = ${input.error ? JSON.stringify(input.error) : null}::jsonb,
             ready_at = case when ${input.status} = 'ready' then now() else ready_at end
       where id = ${input.buildId}
    `);
  }

  async savePageAudioLinks(
    buildId: string,
    renditionId: string,
    tokens: Record<number, string>,
  ): Promise<void> {
    for (const [pageNo, token] of Object.entries(tokens)) {
      await this.db.execute(sql`
        insert into page_audio_links (book_build_id, page_no, token, rendition_id)
        values (${buildId}, ${Number(pageNo)}, ${token}, ${renditionId})
        on conflict (book_build_id, page_no) do nothing
      `);
    }
  }

  async loadOrder(orderId: string): Promise<PrintOrderContext | undefined> {
    const orderRows = await this.db.execute<Record<string, unknown>>(sql`
      select o.*, b.format_code as format_code,
             j.id as print_job_id, j.status as print_job_status,
             j.provider_order_id as provider_order_id
        from orders o
        join book_builds b on b.id = o.book_build_id
        left join print_jobs j on j.order_id = o.id
       where o.id = ${orderId}
       order by j.created_at desc nulls last
       limit 1
    `);
    const row = orderRows[0];
    if (!row) return undefined;

    return {
      orderId: String(row['id']),
      orderNo: String(row['order_no']),
      status: String(row['status']),
      bookBuildId: String(row['book_build_id']),
      formatCode: String(row['format_code']),
      quantity: Number(row['quantity'] ?? 1),
      withdrawalWaiverAccepted: Boolean(row['withdrawal_waiver_accepted']),
      ...(row['withdrawal_waiver_shown_at']
        ? { withdrawalWaiverShownAt: new Date(String(row['withdrawal_waiver_shown_at'])) }
        : {}),
      ...(row['withdrawal_waiver_doc_id']
        ? { withdrawalWaiverDocId: String(row['withdrawal_waiver_doc_id']) }
        : {}),
      ...(row['distance_contract_doc_id']
        ? { distanceContractDocId: String(row['distance_contract_doc_id']) }
        : {}),
      createdAt: new Date(String(row['created_at'])),
      shipTo: {
        fullName: String(row['recipient_name']),
        line1: String(row['address_line1']),
        ...(row['address_line2'] ? { line2: String(row['address_line2']) } : {}),
        city: String(row['city']),
        district: String(row['district']),
        ...(row['postal_code'] ? { postalCode: String(row['postal_code']) } : {}),
        phone: String(row['recipient_phone']),
        country: 'TR',
      },
      ...(row['gift_note_tr'] ? { giftNoteTr: String(row['gift_note_tr']) } : {}),
      ...(row['print_job_id']
        ? {
            printJob: {
              id: String(row['print_job_id']),
              status: String(row['print_job_status']),
              ...(row['provider_order_id']
                ? { providerOrderId: String(row['provider_order_id']) }
                : {}),
            },
          }
        : {}),
    };
  }

  async upsertPrintJob(input: {
    orderId: string;
    provider: string;
    providerOrderId?: string;
    status: string;
    files?: { interiorUrl?: string; coverUrl?: string };
    event?: Record<string, unknown>;
    trackingCarrier?: string;
    trackingNo?: string;
    operatorNote?: string;
  }): Promise<string> {
    const existingRows = await this.db.execute<{ [key: string]: unknown; id: string }>(sql`
      select id from print_jobs where order_id = ${input.orderId} order by created_at desc limit 1
    `);

    const event = input.event ? JSON.stringify([input.event]) : '[]';
    const current = existingRows[0];
    if (!current) {
      const insertedRows = await this.db.execute<{ [key: string]: unknown; id: string }>(sql`
        insert into print_jobs (order_id, provider, provider_order_id, status, files, events, submitted_at)
        values (
          ${input.orderId},
          ${input.provider},
          ${input.providerOrderId ?? null},
          ${input.status},
          ${input.files ? JSON.stringify(input.files) : null}::jsonb,
          ${event}::jsonb,
          case when ${input.status} in ('submitted','accepted') then now() else null end
        )
        returning id
      `);
      return String(insertedRows[0]?.id ?? '');
    }

    await this.db.execute(sql`
      update print_jobs
         set status = ${input.status},
             provider_order_id = coalesce(${input.providerOrderId ?? null}, provider_order_id),
             files = coalesce(${input.files ? JSON.stringify(input.files) : null}::jsonb, files),
             tracking_carrier = coalesce(${input.trackingCarrier ?? null}, tracking_carrier),
             tracking_no = coalesce(${input.trackingNo ?? null}, tracking_no),
             operator_note = coalesce(${input.operatorNote ?? null}, operator_note),
             events = events || ${event}::jsonb,
             shipped_at = case when ${input.status} = 'shipped' then now() else shipped_at end
       where id = ${current.id}
    `);
    return current.id;
  }

  async setOrderStatus(orderId: string, status: string): Promise<void> {
    await this.db.execute(sql`
      update orders
         set status = ${status},
             cancelled_at = case when ${status} = 'cancelled' then now() else cancelled_at end
       where id = ${orderId}
    `);
  }
}
