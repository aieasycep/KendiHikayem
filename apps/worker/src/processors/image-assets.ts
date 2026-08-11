/**
 * processors/image-assets.ts — rendered pixels → object store → `assets` rows → signed URL.
 *
 * Two invariants this file exists to hold:
 *
 *   1. EVERY BINARY HAS EXACTLY ONE `assets` ROW. `packages/db`'s header is explicit that
 *      nothing else in the schema stores a bucket key, and the purge cron reads only
 *      `assets_purge_idx`. An object written without a row is an object that never gets
 *      deleted — which, for a child's illustration, is a KVKK problem, not a tidiness one.
 *   2. STORE FIRST, RECORD SECOND, POINT LAST. Bytes land in the store, then the `assets`
 *      row, then `story_pages.image_asset_id`. A crash between steps leaves an orphaned
 *      object (reclaimable) rather than a story pointing at bytes that do not exist
 *      (a broken page in a parent's library).
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import { buildScreenRenditions, storageKeys, type ObjectStore, type Rendition } from '@kendihikayem/media';

import { sha256Hex } from '../jobs/hashing';

/** `assets.kind`. */
export type ImageAssetKind =
  | 'image_style_plate'
  | 'image_character_sheet'
  | 'image_face_ref'
  | 'image_page_2k'
  | 'image_page_4k'
  | 'image_page_screen';

export interface StoreImageInput {
  db: Database;
  store: ObjectStore;
  userId: string;
  kind: ImageAssetKind;
  key: string;
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  sha256?: string;
  provider?: string;
  /** `standard` for anything a parent can see; the purge job reads this. */
  retentionClass?: 'ephemeral_30d' | 'standard' | 'legal_hold_10y';
}

export interface StoredImageAsset {
  assetId: string;
  key: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

/** Writes bytes, then the row. Returns `assets.id`. */
export async function storeImageAsset(input: StoreImageInput): Promise<StoredImageAsset> {
  const sha256 = input.sha256 ?? sha256Hex(Buffer.from(input.bytes).toString('base64'));

  await input.store.put({
    key: input.key,
    body: input.bytes,
    contentType: input.mimeType,
    retentionClass: input.retentionClass ?? 'standard',
    sha256,
  });

  const rows = await input.db.execute<{ id: string }>(sql`
    insert into assets (owner_user_id, kind, bucket, storage_key, mime_type, size_bytes,
                        sha256, width_px, height_px, provider, retention_class)
    values (${input.userId}, ${input.kind}, ${input.store.bucket}, ${input.key},
            ${input.mimeType}, ${input.bytes.byteLength}, ${sha256},
            ${input.width}, ${input.height}, ${input.provider ?? null},
            ${input.retentionClass ?? 'standard'})
    on conflict (bucket, storage_key) do update
      set size_bytes = excluded.size_bytes,
          sha256     = excluded.sha256,
          width_px   = excluded.width_px,
          height_px  = excluded.height_px,
          mime_type  = excluded.mime_type
    returning id
  `);

  return {
    assetId: rows[0]!.id,
    key: input.key,
    width: input.width,
    height: input.height,
    sizeBytes: input.bytes.byteLength,
    mimeType: input.mimeType,
  };
}

export interface PageRenditionResult {
  /** The rendition the reader shows, and what `story_pages.image_asset_id` points at. */
  primary: StoredImageAsset;
  all: Array<StoredImageAsset & { rendition: string }>;
}

/**
 * Fans one rendered page out into its screen renditions and stores every one.
 *
 * `story_pages.image_asset_id` points at the READER rendition, not the retina one: it is
 * what the app requests first, and a library that opens fast on a mid-range Android phone
 * over a Turkish mobile network is the difference between a used product and an installed one.
 */
export async function storePageRenditions(input: {
  db: Database;
  store: ObjectStore;
  userId: string;
  storyId: string;
  /** `undefined` = the cover. */
  pageNo?: number;
  image: Uint8Array;
  provider?: string;
}): Promise<PageRenditionResult> {
  const { renditions } = await buildScreenRenditions(input.image);
  const stored: Array<StoredImageAsset & { rendition: string }> = [];

  for (const rendition of renditions) {
    const key = keyFor(input.storyId, input.pageNo, rendition);
    const asset = await storeImageAsset({
      db: input.db,
      store: input.store,
      userId: input.userId,
      kind: 'image_page_screen',
      key,
      bytes: rendition.bytes,
      mimeType: rendition.mimeType,
      width: rendition.width,
      height: rendition.height,
      ...(input.provider ? { provider: input.provider } : {}),
    });
    stored.push({ ...asset, rendition: rendition.name });
  }

  const primary =
    stored.find((s) => s.rendition === 'reader') ??
    stored.find((s) => s.rendition === 'retina') ??
    stored[0];
  if (!primary) throw new Error('no renditions were produced');

  return { primary, all: stored };
}

function keyFor(storyId: string, pageNo: number | undefined, rendition: Rendition): string {
  const ext = rendition.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
  return pageNo === undefined
    ? storageKeys.coverScreen(storyId, rendition.name, ext)
    : storageKeys.pageScreen(storyId, pageNo, rendition.name, ext);
}

/* ── story_pages state ─────────────────────────────────────────────────────── */

export type ImageStatus = 'pending' | 'generating' | 'qa_failed' | 'manual_review' | 'ready' | 'failed';

/**
 * Moves a page's image state, optionally bumping the attempt counter.
 *
 * `image_attempts` is incremented in SQL rather than read-modify-written, so two workers
 * racing on the same page cannot both write "attempt 2" — which would make the retry
 * budget silently infinite.
 */
export async function setPageImageStatus(
  db: Database,
  input: {
    storyId: string;
    pageNo: number;
    status: ImageStatus;
    incrementAttempts?: boolean;
    imageAssetId?: string;
    imagePrintAssetId?: string;
    imageQa?: Record<string, unknown>;
    promptSha256?: string;
    illustrationPromptEn?: string;
  },
): Promise<void> {
  await db.execute(sql`
    update story_pages
       set image_status = ${input.status},
           image_attempts = image_attempts + ${input.incrementAttempts ? 1 : 0},
           image_asset_id = coalesce(${input.imageAssetId ?? null}, image_asset_id),
           image_print_asset_id = coalesce(${input.imagePrintAssetId ?? null}, image_print_asset_id),
           image_qa = coalesce(${input.imageQa ? JSON.stringify(input.imageQa) : null}::jsonb, image_qa),
           prompt_sha256 = coalesce(${input.promptSha256 ?? null}, prompt_sha256),
           illustration_prompt_en = coalesce(${input.illustrationPromptEn ?? null}, illustration_prompt_en),
           updated_at = now()
     where story_id = ${input.storyId} and page_no = ${input.pageNo}
  `);
}

/** Points `story_characters` at its rendered sheet and face crop. */
export async function setCharacterAssets(
  db: Database,
  characterId: string,
  input: { characterSheetAssetId?: string; faceRefAssetId?: string; sheetVariants?: unknown },
): Promise<void> {
  await db.execute(sql`
    update story_characters
       set character_sheet_asset_id = coalesce(${input.characterSheetAssetId ?? null}, character_sheet_asset_id),
           face_ref_asset_id = coalesce(${input.faceRefAssetId ?? null}, face_ref_asset_id),
           sheet_variants = coalesce(${input.sheetVariants ? JSON.stringify(input.sheetVariants) : null}::jsonb, sheet_variants)
     where id = ${characterId}
  `);
}

export async function setStylePlateAsset(
  db: Database,
  artStyleCode: string,
  assetId: string,
): Promise<void> {
  await db.execute(sql`
    update art_styles set style_plate_asset_id = ${assetId} where code = ${artStyleCode}
  `);
}

/**
 * The `SignedMedia` shape the contract's `page.image.ready` event carries.
 *
 * ⚠️ `provisional` is proposed in `docs/contract-rfc/001-medya-durumu.md` and is NOT in the
 * frozen contract yet, so it is not emitted. Until it lands, a page whose best attempt is
 * being shown while ops reviews it is indistinguishable on the wire from a final one — the
 * gap the RFC exists to close.
 */
export async function signedMediaFor(
  store: ObjectStore,
  key: string,
  ttlSec: number,
  meta: { width: number; height: number; sizeBytes: number; mimeType: string },
): Promise<{
  url: string;
  expiresAt: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}> {
  const signed = await store.signedUrl(key, ttlSec);
  return {
    url: signed.url,
    expiresAt: signed.expiresAt,
    mimeType: meta.mimeType,
    width: meta.width,
    height: meta.height,
    sizeBytes: meta.sizeBytes,
  };
}
