/**
 * processors/image-context.ts — everything the image processors need, assembled once.
 *
 * The image pipeline touches four things the rest of the worker does not: the illustration
 * adapter route, the object store, the QA thresholds and the story's cast/style rows. They
 * are gathered here so the processors read as pipeline logic rather than as plumbing, and
 * so a test can build a context with a temporary directory and a fake adapter and exercise
 * the real code path.
 */

import { sql } from 'drizzle-orm';
import type { Env } from '@kendihikayem/config';
import type { Database } from '@kendihikayem/db';
import {
  CachingReferenceResolver,
  ProviderRouter,
  adoptCharacterDna,
  createImageAdapterRoute,
  type ImageAdapter,
  type ImageReference,
  type ResolvedReference,
  type CharacterDna,
  type StyleDna,
} from '@kendihikayem/providers';
import {
  createObjectStore,
  type ObjectStore,
  type QaThresholds,
  type IdentityScorer,
} from '@kendihikayem/media';

import { sha256Hex } from '../jobs/hashing';

/* ── configuration ─────────────────────────────────────────────────────────── */

export interface ImagePipelineConfig {
  qa: QaThresholds;
  maxAttempts: number;
  signedUrlTtlSec: number;
  print: {
    trimMm: number;
    bleedMm: number;
    safeMm: number;
    dpi: number;
    colourSpace: 'srgb' | 'cmyk';
    iccProfilePath?: string | undefined;
  };
}

export function imagePipelineConfigFromEnv(env: Env): ImagePipelineConfig {
  return {
    qa: {
      textScoreMax: env.IMAGE_QA_TEXT_SCORE_MAX,
      paletteDeltaEMax: env.IMAGE_QA_PALETTE_DELTA_E_MAX,
      safeZoneMax: env.IMAGE_QA_SAFE_ZONE_MAX,
      identityCosineMin: env.IMAGE_QA_FACE_THRESHOLD,
      strict: env.IMAGE_QA_STRICT,
    },
    maxAttempts: env.IMAGE_QA_MAX_ATTEMPTS,
    signedUrlTtlSec: env.MEDIA_SIGNED_URL_TTL_SEC,
    print: {
      trimMm: env.PRINT_TRIM_MM,
      bleedMm: env.PRINT_BLEED_MM,
      safeMm: env.PRINT_SAFE_MM,
      dpi: env.PRINT_TARGET_DPI,
      colourSpace: env.PRINT_COLOR_SPACE,
      iccProfilePath: env.PRINT_ICC_PROFILE_PATH,
    },
  };
}

/**
 * The adapter route for illustrations.
 *
 * ⭐ THE ONE SWITCH. `API_MODE=mock` ⇒ the deterministic double; `live` ⇒ the real Gemini
 * adapter built from `IMAGE_PROVIDER_PRIMARY` and the configured model ids. No processor
 * below knows the difference.
 */
export function imageAdapterRouteFromEnv(
  env: Env,
  references: { resolve(reference: ImageReference): Promise<ResolvedReference> },
): ImageAdapter[] {
  return createImageAdapterRoute({
    mode: env.API_MODE,
    primary: env.IMAGE_PROVIDER_PRIMARY,
    fallback: env.IMAGE_PROVIDER_FALLBACK,
    models: { primary: env.IMAGE_MODEL_PRIMARY, fallback: env.IMAGE_MODEL_FALLBACK },
    google: {
      apiKey: env.GOOGLE_GENAI_API_KEY,
      baseUrl: env.GOOGLE_GENAI_BASE_URL,
      apiVersion: env.GOOGLE_GENAI_API_VERSION,
      timeoutMs: env.IMAGE_REQUEST_TIMEOUT_MS,
    },
    references,
  });
}

export function objectStoreFromEnv(env: Env): ObjectStore {
  return createObjectStore({
    driver: env.MEDIA_STORAGE_DRIVER,
    bucket: env.S3_BUCKET_MEDIA,
    localRoot: env.MEDIA_LOCAL_ROOT,
    // A dedicated media signing key when one exists; the session secret otherwise. Both
    // are secrets of the same blast radius, and requiring a second one to boot would push
    // people towards the filesystem driver with no signing at all.
    signingSecret: env.MEDIA_URL_SIGNING_SECRET ?? env.AUTH_SECRET,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    kmsKeyId: env.S3_KMS_KEY_ID,
  });
}

/**
 * Resolves `assets.id` → bytes through the object store.
 *
 * Wrapped in `CachingReferenceResolver` by `buildImageContext`: one book renders thirteen
 * pages against the same three reference images, and fetching them thirteen times each is
 * 39 downloads of 4K artwork to save nothing.
 */
export class StoredAssetReferenceResolver {
  constructor(
    private readonly db: Database,
    private readonly store: ObjectStore,
  ) {}

  async resolve(reference: ImageReference): Promise<ResolvedReference> {
    const rows = await this.db.execute<{ storage_key: string; mime_type: string }>(sql`
      select storage_key, mime_type from assets where id = ${reference.assetId}
    `);
    const row = rows[0];
    if (!row) {
      throw new Error(`reference asset ${reference.assetId} (${reference.kind}) has no row`);
    }
    return { bytes: await this.store.get(row.storage_key), mimeType: row.mime_type };
  }
}

export interface ImageContext {
  db: Database;
  store: ObjectStore;
  router: ProviderRouter<ImageAdapter>;
  references: CachingReferenceResolver;
  config: ImagePipelineConfig;
  identityScorer?: IdentityScorer;
}

/* ── story rows the pipeline reads ─────────────────────────────────────────── */

export interface StoryImageContext {
  storyId: string;
  artStyleCode: string;
  ageBand: string;
  style: StyleDna;
  knownArtStyleCodes: string[];
  /** The hero's frozen canon, adopted from `story_characters.canon_en` — never re-rendered. */
  character?: CharacterDna;
  characterId?: string;
  characterSheetAssetId?: string;
  faceRefAssetId?: string;
  stylePlateAssetId?: string;
}

/**
 * Loads the story's style row, its cast and its reference assets.
 *
 * ⚠️ The canon is ADOPTED, not re-rendered: `story_characters.canon_en` is frozen at cast
 * time and the page prompts must contain exactly those bytes, even if this repo's renderer
 * has changed since (see `assertCanonUnchanged`).
 */
export async function loadStoryImageContext(
  db: Database,
  storyId: string,
): Promise<StoryImageContext> {
  const storyRows = await db.execute<{ art_style_code: string; age_band: string }>(sql`
    select art_style_code, age_band from stories where id = ${storyId}
  `);
  const story = storyRows[0];
  if (!story) throw new Error(`story ${storyId} not found`);

  const styleRows = await db.execute<{
    code: string;
    style_dna_en: string;
    negative_prompt_en: string;
    style_plate_asset_id: string | null;
  }>(sql`
    select code, style_dna_en, negative_prompt_en, style_plate_asset_id
      from art_styles where code = ${story.art_style_code}
  `);
  const styleRow = styleRows[0];
  if (!styleRow) throw new Error(`art style ${story.art_style_code} not found`);

  const allStyles = await db.execute<{ code: string }>(sql`
    select code from art_styles where is_active order by code
  `);

  const characterRows = await db.execute<{
    id: string;
    canon_en: string;
    character_sheet_asset_id: string | null;
    face_ref_asset_id: string | null;
  }>(sql`
    select id, canon_en, character_sheet_asset_id, face_ref_asset_id
      from story_characters
     where story_id = ${storyId}
     order by is_primary desc, created_at
     limit 1
  `);
  const character = characterRows[0];

  return {
    storyId,
    artStyleCode: story.art_style_code,
    ageBand: story.age_band,
    style: {
      code: styleRow.code,
      styleDnaEn: styleRow.style_dna_en,
      negativePromptEn: styleRow.negative_prompt_en,
      ...(styleRow.style_plate_asset_id ? { stylePlateAssetId: styleRow.style_plate_asset_id } : {}),
    },
    knownArtStyleCodes: allStyles.map((row) => row.code),
    ...(character
      ? {
          character: adoptCharacterDna(character.canon_en, sha256Hex),
          characterId: character.id,
          ...(character.character_sheet_asset_id
            ? { characterSheetAssetId: character.character_sheet_asset_id }
            : {}),
          ...(character.face_ref_asset_id ? { faceRefAssetId: character.face_ref_asset_id } : {}),
        }
      : {}),
    ...(styleRow.style_plate_asset_id ? { stylePlateAssetId: styleRow.style_plate_asset_id } : {}),
  };
}

/** Type alias, not an interface: `db.execute<T>` constrains T to `Record<string, unknown>`. */
export type StoryPageRow = {
  id: string;
  page_no: number;
  text_tr: string | null;
  scene_summary_tr: string | null;
  illustration_prompt_en: string | null;
  prompt_sha256: string | null;
  emotion: string | null;
  time_of_day: string | null;
  camera: string | null;
  text_safe_zone: string;
  image_status: string;
  image_attempts: number;
};

export async function loadStoryPage(
  db: Database,
  storyId: string,
  pageNo: number,
): Promise<StoryPageRow | undefined> {
  const rows = await db.execute<StoryPageRow>(sql`
    select id, page_no, text_tr, scene_summary_tr, illustration_prompt_en, prompt_sha256,
           emotion, time_of_day, camera, text_safe_zone, image_status, image_attempts
      from story_pages
     where story_id = ${storyId} and page_no = ${pageNo}
  `);
  return rows[0];
}

/** Builds the context from the worker runtime. */
export function buildImageContext(input: {
  db: Database;
  env: Env;
  store?: ObjectStore;
  /** Override the route in tests; otherwise built from `API_MODE`. */
  adapters?: ImageAdapter[];
  routerOptions?: ConstructorParameters<typeof ProviderRouter>[1];
  identityScorer?: IdentityScorer;
}): ImageContext {
  const store = input.store ?? objectStoreFromEnv(input.env);
  const references = new CachingReferenceResolver(
    new StoredAssetReferenceResolver(input.db, store),
  );
  const route = input.adapters ?? imageAdapterRouteFromEnv(input.env, references);

  return {
    db: input.db,
    store,
    references,
    router: new ProviderRouter<ImageAdapter>(route, input.routerOptions ?? {}),
    config: imagePipelineConfigFromEnv(input.env),
    ...(input.identityScorer ? { identityScorer: input.identityScorer } : {}),
  };
}
