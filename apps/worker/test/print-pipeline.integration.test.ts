/**
 * print-pipeline.integration.test.ts — the print queue against a REAL database.
 *
 * What is real here: PostgreSQL (the migrated schema), the layout engine, the preflight and
 * the PDF renderer — the interior PDF this test produces is the same file a printer would
 * receive. What is faked: the page images (the demo compositions, resampled by sharp) and
 * the print partner (`manual_tr` over an in-memory store — there is no printer API).
 *
 * The two cases that matter are the two ends of the gate:
 *   · print-resolution images  → `book_builds.status = 'ready'`, three PDFs stored as
 *     `legal_hold_10y` assets, one revocable QR token per page;
 *   · the same story at 1024 px → `status = 'failed'`, Turkish warnings naming the page,
 *     and NO files — so the order cannot be opened.
 */

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { Database, DbHandle } from '@kendihikayem/db';
import {
  KARE21_24_SERT,
  mmToPx,
  pageCanvasMm,
  type LoadedPrintImage,
  type PrintImageRequest,
  type PrintImageSource,
} from '@kendihikayem/pdf';
import { demoAssetPath } from '@kendihikayem/pdf/demo/story';
import { SharpPrintImageSource } from '@kendihikayem/pdf/demo/sharp-image-source';
import { InMemoryManualPrintStore, ManualTrPrintAdapter } from '@kendihikayem/providers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InMemoryObjectStore } from '../src/processors/audio-storage';
import { PgPrintGateway } from '../src/processors/print-gateway';
import { pdfBuild, setPrintDeps } from '../src/processors/print';
import { buildPrintOrderFlow } from '../src/flows/print.flow';
import { buildRuntime, fakeAdaptersFromEnv, type WorkerRuntime } from '../src/runtime';
import { createTestUser, openDb, testEnv } from './helpers';

const PRINT_PX = mmToPx(pageCanvasMm(KARE21_24_SERT).widthMm);

async function databaseAvailable(): Promise<boolean> {
  try {
    const handle = openDb(1);
    await handle.db.execute(sql`select 1`);
    await handle.close();
    return true;
  } catch {
    return false;
  }
}

const hasDatabase = await databaseAvailable();
const suite = hasDatabase ? describe : describe.skip;

interface Seeded {
  userId: string;
  storyId: string;
  buildId: string;
  assetIds: string[];
}

async function insertAsset(db: Database, widthPx: number, heightPx: number): Promise<string> {
  const rows = await db.execute<{ [key: string]: unknown; id: string }>(sql`
    insert into assets (kind, bucket, storage_key, mime_type, width_px, height_px, sha256)
    values ('image_page_4k', 'kh-media', ${`test/${randomUUID()}.jpg`}, 'image/jpeg',
            ${widthPx}, ${heightPx}, ${randomUUID().replace(/-/g, '')})
    returning id
  `);
  return String(rows[0]?.id);
}

async function seedStory(db: Database, userId: string, imagePx: number): Promise<Seeded> {
  await db.execute(sql`
    insert into book_formats (code, title_tr, trim_w_mm, trim_h_mm, bleed_mm, safe_mm,
                              page_count, binding, paper, color_profile, target_dpi, base_price_try)
    values ('kare21_24_sert', '21×21 cm • 24 sayfa • sert kapak', 210, 210, 5, 20,
            24, 'sert_kapak', '170 gr mat kuşe', 'srgb', 300, 899.00)
    on conflict (code) do nothing
  `);

  const storyRows = await db.execute<{ [key: string]: unknown; id: string }>(sql`
    insert into stories (user_id, title, age_band, art_style_code, hero_name, page_count,
                         lesson_tr, request_input, status, approved_at)
    values (${userId}, 'Elif ve Tavan Arasındaki Işık', '6-8', 'suluboya', 'Elif', 12,
            'Korkuyla birlikte bir adım daha atabilmek cesarettir.', '{}'::jsonb, 'ready', now())
    returning id
  `);
  const storyId = String(storyRows[0]?.id);

  const assetIds: string[] = [];
  // Page 0 is the cover; the cover sheet is far wider than a page, so it needs more pixels.
  const coverAsset = await insertAsset(
    db,
    imagePx >= 2000 ? 5580 : imagePx,
    imagePx >= 2000 ? 3001 : imagePx,
  );
  assetIds.push(coverAsset);
  await db.execute(sql`
    insert into story_pages (story_id, page_no, text_tr, image_asset_id, image_status)
    values (${storyId}, 0, '', ${coverAsset}, 'ready')
  `);

  for (let pageNo = 1; pageNo <= 12; pageNo += 1) {
    const assetId = await insertAsset(db, imagePx, imagePx);
    assetIds.push(assetId);
    await db.execute(sql`
      insert into story_pages (story_id, page_no, text_tr, image_asset_id, image_status, emotion)
      values (
        ${storyId},
        ${pageNo},
        ${`Elif ${pageNo}. sayfada merdivenin bir basamağını daha çıktı; Fındık’ı sıkıca tuttu.`},
        ${assetId},
        'ready',
        'merak'
      )
    `);
  }

  const buildRows = await db.execute<{ [key: string]: unknown; id: string }>(sql`
    insert into book_builds (story_id, format_code, revision, status, dedication_tr)
    values (${storyId}, 'kare21_24_sert', 1, 'building',
            'Karanlıktan korkup yine de merdiveni çıkan bütün çocuklara.')
    returning id
  `);

  return { userId, storyId, buildId: String(buildRows[0]?.id), assetIds };
}

async function createJob(db: Database, userId: string, storyId: string): Promise<string> {
  const rows = await db.execute<{ [key: string]: unknown; id: string }>(sql`
    insert into jobs (user_id, kind, story_id, status, input, idempotency_key, request_hash,
                      correlation_id)
    values (${userId}, 'pdf_build', ${storyId}, 'running', '{}'::jsonb, ${randomUUID()},
            ${randomUUID().replace(/-/g, '')}, ${randomUUID()})
    returning id
  `);
  return String(rows[0]?.id);
}

suite('baskı hattı — gerçek veritabanı, gerçek PDF', () => {
  let handle: DbHandle;
  let db: Database;
  let runtime: WorkerRuntime;
  let objectStore: InMemoryObjectStore;
  let userId: string;

  beforeAll(async () => {
    handle = openDb(4);
    db = handle.db;
    const env = testEnv();
    objectStore = new InMemoryObjectStore();
    runtime = buildRuntime({
      env,
      db,
      adapters: fakeAdaptersFromEnv(env, 0),
      objectStore,
    });
    userId = (await createTestUser(db)).userId;
  }, 60_000);

  afterAll(async () => {
    setPrintDeps(undefined);
    await runtime.queues.close().catch(() => undefined);
    await handle?.close();
  });

  it(
    'baskıya hazır görsellerle iç blok, kapak ve önizlemeyi üretip kaydeder',
    async () => {
      const seeded = await seedStory(db, userId, PRINT_PX);
      const jobId = await createJob(db, seeded.userId, seeded.storyId);

      setPrintDeps({
        gateway: new PgPrintGateway(db),
        // Asset id → demo file. In production A4's rendition pipeline sits here.
        images: new DemoAssetSource(seeded.assetIds),
        fileUrl: (bucket, key) => `https://cdn.test/${bucket}/${key}`,
      });

      const result = (await pdfBuild(runtime, {
        data: {
          jobId,
          userId: seeded.userId,
          correlationId: 'trace-print',
          kind: 'pdf_build',
          ref: { buildId: seeded.buildId, storyId: seeded.storyId, includeQr: false },
        },
      } as never)) as { status: string; pages: number; spineMm: number };

      expect(result.status).toBe('succeeded');
      expect(result.pages).toBe(24);
      expect(result.spineMm).toBe(8.4);

      const builds = await db.execute<{ [key: string]: unknown }>(sql`
        select status, spine_mm, checks, warnings,
               interior_pdf_asset_id, cover_pdf_asset_id, preview_pdf_asset_id
          from book_builds where id = ${seeded.buildId}
      `);
      const build = builds[0]!;
      expect(build['status']).toBe('ready');
      expect(Number(build['spine_mm'])).toBeCloseTo(8.4, 2);
      expect(build['checks']).toEqual({
        dpiOk: true,
        fontsEmbedded: true,
        safeZoneOk: true,
        bleedOk: true,
      });
      expect(build['warnings']).toEqual([]);
      expect(build['interior_pdf_asset_id']).toBeTruthy();
      expect(build['cover_pdf_asset_id']).toBeTruthy();
      expect(build['preview_pdf_asset_id']).toBeTruthy();

      // The PDFs are order documents: ten-year legal hold, not ordinary media.
      const assets = await db.execute<{ [key: string]: unknown }>(sql`
        select kind, retention_class, size_bytes, mime_type
          from assets
         where id in (${build['interior_pdf_asset_id']}, ${build['cover_pdf_asset_id']})
      `);
      expect(assets).toHaveLength(2);
      for (const asset of assets) {
        expect(asset['retention_class']).toBe('legal_hold_10y');
        expect(asset['mime_type']).toBe('application/pdf');
        expect(Number(asset['size_bytes'])).toBeGreaterThan(10_000);
      }

      // The bytes really exist and really are a PDF.
      const stored = await objectStore.get(
        runtime.buckets.media,
        `book-builds/${seeded.buildId}/r1/interior.pdf`,
      );
      expect(stored).toBeDefined();
      expect(Buffer.from(stored!.slice(0, 5)).toString('latin1')).toBe('%PDF-');
    },
    300_000,
  );

  it(
    'karekod açıkken sayfa başına iptal edilebilir bir jeton üretir ve yeniden üretimde AYNI jetonu korur',
    async () => {
      const seeded = await seedStory(db, userId, PRINT_PX);
      const renditionRows = await db.execute<{ [key: string]: unknown; id: string }>(sql`
        insert into audio_renditions (story_id, voice_kind, system_voice_code, provider, model,
                                      tier, status)
        values (${seeded.storyId}, 'system', 'zeynep_sicak', 'fake', 'fake-tts', 'draft', 'succeeded')
        returning id
      `);
      const renditionId = String(renditionRows[0]?.id);
      await db.execute(sql`
        update book_builds set qr_rendition_id = ${renditionId} where id = ${seeded.buildId}
      `);

      setPrintDeps({
        gateway: new PgPrintGateway(db),
        images: new DemoAssetSource(seeded.assetIds),
        fileUrl: (bucket, key) => `https://cdn.test/${bucket}/${key}`,
      });

      const payload = {
        userId: seeded.userId,
        correlationId: 'trace-qr',
        kind: 'pdf_build',
        ref: { buildId: seeded.buildId, storyId: seeded.storyId, includeQr: true },
      };

      const firstJob = await createJob(db, seeded.userId, seeded.storyId);
      await pdfBuild(runtime, { data: { ...payload, jobId: firstJob } } as never);

      const firstTokens = await db.execute<{ [key: string]: unknown; page_no: number; token: string }>(
        sql`select page_no, token from page_audio_links where book_build_id = ${seeded.buildId} order by page_no`,
      );
      expect(firstTokens).toHaveLength(12);
      expect(new Set(firstTokens.map((row) => row.token)).size).toBe(12);
      for (const row of firstTokens) expect(row.token).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);

      // A rebuild must NOT invalidate codes that may already be printed on paper.
      const secondJob = await createJob(db, seeded.userId, seeded.storyId);
      await pdfBuild(runtime, { data: { ...payload, jobId: secondJob } } as never);

      const secondTokens = await db.execute<{ [key: string]: unknown; page_no: number; token: string }>(
        sql`select page_no, token from page_audio_links where book_build_id = ${seeded.buildId} order by page_no`,
      );
      expect(secondTokens.map((row) => row.token)).toEqual(firstTokens.map((row) => row.token));
    },
    300_000,
  );

  it(
    'düşük çözünürlüklü görsellerde kitabı KİLİTLER: dosya yok, Türkçe uyarı var',
    async () => {
      const seeded = await seedStory(db, userId, 1024);
      const jobId = await createJob(db, seeded.userId, seeded.storyId);

      setPrintDeps({
        gateway: new PgPrintGateway(db),
        images: new DemoAssetSource(seeded.assetIds),
        fileUrl: (bucket, key) => `https://cdn.test/${bucket}/${key}`,
      });

      const result = (await pdfBuild(runtime, {
        data: {
          jobId,
          userId: seeded.userId,
          correlationId: 'trace-lowres',
          kind: 'pdf_build',
          ref: { buildId: seeded.buildId, storyId: seeded.storyId, includeQr: false },
        },
      } as never)) as { status: string; warnings: string[] };

      expect(result.status).toBe('preflight_failed');

      const builds = await db.execute<{ [key: string]: unknown }>(sql`
        select status, checks, warnings, interior_pdf_asset_id, error
          from book_builds where id = ${seeded.buildId}
      `);
      const build = builds[0]!;
      expect(build['status']).toBe('failed');
      expect(build['interior_pdf_asset_id']).toBeNull();
      expect((build['checks'] as { dpiOk: boolean }).dpiOk).toBe(false);

      const warnings = build['warnings'] as string[];
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.join(' ')).toMatch(/Masalın \d+\. sayfasındaki görsel/);
      expect(warnings.join(' ')).toContain('DPI');
    },
    300_000,
  );
});

describe('baskı akışı — sıralama', () => {
  it('PDF üretilmeden matbaaya gidilemez: submit, build çocuğuna bağlı', () => {
    const flow = buildPrintOrderFlow({
      jobId: 'job-print-1',
      userId: 'user-1',
      correlationId: 'trace-1',
      storyId: 'story-1',
      buildId: 'build-1',
      orderId: 'order-1',
    });

    expect(flow.name).toBe('print.submit');
    expect(flow.children).toHaveLength(1);
    expect(flow.children?.[0]?.name).toBe('pdf.build');
    // ⚠️ Görsel akışının tersi: dosya üretilemezse EBEVEYN ÖDEDİĞİ HÂLDE matbaaya
    // gidilmemeli, o yüzden ebeveyn iş de düşer.
    expect(flow.children?.[0]?.opts?.failParentOnFailure).toBe(true);
  });

  it('sipariş kimliği olmadan akış kurulamaz', () => {
    expect(() =>
      buildPrintOrderFlow({
        jobId: 'j',
        userId: 'u',
        correlationId: 'c',
        storyId: 's',
        buildId: 'b',
      }),
    ).toThrow(/orderId/);
  });
});

describe('manual_tr — iş emri', () => {
  it('operatör göndermeden durum "kuyrukta" kalır', async () => {
    const store = new InMemoryManualPrintStore();
    const adapter = new ManualTrPrintAdapter({
      store,
      formats: {
        kare21_24_sert: {
          titleTr: '21×21 cm • 24 sayfa • sert kapak',
          pageCount: 24,
          trimMm: [210, 210],
          bleedMm: 5,
          paperTr: '170 gr mat kuşe',
          bindingTr: 'Sert kapak',
        },
      },
      spineMmFor: () => 8.4,
    });

    const { value } = await adapter.submit(
      {
        orderId: 'KH-2026-000001',
        formatCode: 'kare21_24_sert',
        quantity: 1,
        files: { interiorPdfUrl: 'https://cdn/ic.pdf', coverPdfUrl: 'https://cdn/kapak.pdf' },
        shipTo: {
          fullName: 'Ayşe Yılmaz',
          line1: 'Bağdat Cad. 12',
          city: 'İstanbul',
          district: 'Kadıköy',
          phone: '+905321234567',
          country: 'TR',
        },
      },
      { requestId: 'r1', correlationId: 'c1' },
    );

    expect(value.status).toBe('queued');
    expect(store.list()[0]?.workOrderTextTr).toContain('BASKI İŞ EMRİ');
  });
});

/**
 * Maps the seeded asset ids onto the demo illustrations and resamples them with sharp.
 *
 * The sharp source is shared across tests on purpose: resampling 13 pictures to print size
 * is the slowest thing in this file, and every test uses the same pictures. Keying the
 * cache on the FILE (not the asset id) is what makes the reuse work.
 */
const demoImages = new SharpPrintImageSource({ allowUpscale: true, quality: 78 });

class DemoAssetSource implements PrintImageSource {
  private readonly byAssetId = new Map<string, string>();

  constructor(assetIds: string[]) {
    // assetIds[0] is the cover, then pages 1..12.
    this.byAssetId.set(assetIds[0] ?? '', demoAssetPath('elif-kapak.webp'));
    assetIds.slice(1).forEach((assetId, index) => {
      this.byAssetId.set(
        assetId,
        demoAssetPath(`elif-sayfa-${String(index + 1).padStart(2, '0')}.webp`),
      );
    });
  }

  async load(request: PrintImageRequest): Promise<LoadedPrintImage> {
    const file = this.byAssetId.get(request.ref.ref);
    if (!file) throw new Error(`no demo file mapped for asset ${request.ref.ref}`);
    return demoImages.load({ ...request, ref: { ...request.ref, ref: file } });
  }
}
