/**
 * runtime.ts — everything a processor needs, assembled once at boot.
 *
 * Explicit dependency container rather than module-level singletons: a test builds one of
 * these with fake adapters, a zero-latency clock and a real database, and exercises the
 * same code path production runs. No `if (test)` branches anywhere in the pipeline.
 */

import type { Database, DbHandle } from '@kendihikayem/db';
import { createDbFromEnv } from '@kendihikayem/db';
import type { Env } from '@kendihikayem/config';
import { useRedisTls } from '@kendihikayem/config';
import { createBucketedObjectStore } from '@kendihikayem/media';
import {
  type AdapterRegistry,
  type CostLedger,
  type PriceBook,
  CircuitBreakerRegistry,
  DEFAULT_PRICE_BOOK,
  ProviderRouter,
  type TtsSettings,
  createFakeRegistry,
  createImageAdapterRoute,
  createLlmRoute,
  createModerationRoute,
  createPrintAdapter,
  createVoiceRoute,
  parsePrintSkuMap,
  ttsSettingsFromEnv,
} from '@kendihikayem/providers';

import { PgCostLedger } from './cost/ledger.pg';
import type { CostCaps } from './cost/reservation';
import { QueueRegistry, type QueueSetupOptions, connectionFromUrl } from './queues';
import { InMemoryObjectStore, type ObjectStore } from './processors/audio-storage';

export interface WorkerRuntime {
  /** The validated configuration this process booted with. Read by the image pipeline
   *  for the provider route, the object store and the QA thresholds. */
  env: Env;
  db: Database;
  /** Present only when this process opened the pool; tests pass their own handle. */
  dbHandle?: DbHandle;
  queues: QueueRegistry;
  adapters: AdapterRegistry;
  routers: {
    llm: ProviderRouter<AdapterRegistry['llm']>;
    image: ProviderRouter<AdapterRegistry['image']>;
    tts: ProviderRouter<AdapterRegistry['tts']>;
    moderation: ProviderRouter<AdapterRegistry['moderation']>;
    align: ProviderRouter<AdapterRegistry['align']>;
    print: ProviderRouter<AdapterRegistry['print']>;
  };
  ledger: CostLedger;
  priceBook: PriceBook;
  caps: CostCaps;
  breakers: CircuitBreakerRegistry;
  /** Where audio bytes live. Injected so the erasure test can inspect what actually remains. */
  objectStore: ObjectStore;
  /**
   * ⚠️ KVKK (SPEC §2, §10.1). Raw voice recordings go in their OWN bucket under their own
   * customer-managed key, never beside ordinary media. Passing the bucket per call is what
   * stops a reference clip from being written next to a page illustration by accident.
   */
  buckets: { media: string; voiceRaw: string; voiceKmsAlias?: string };
  /** Voice pipeline settings, resolved once from config (model ids, chunking, loudness). */
  ttsSettings: TtsSettings;
  close(): Promise<void>;
}

export interface BuildRuntimeOptions {
  env: Env;
  /** Reuse an already-open database (tests, or a process that also serves HTTP). */
  db?: Database;
  adapters?: AdapterRegistry;
  ledger?: CostLedger;
  priceBook?: PriceBook;
  queues?: QueueRegistry;
  /** Fakes only: shrink simulated provider latency to zero in tests. */
  fakeLatencyMs?: number;
  /**
   * Defaults to the driver-backed store built from `MEDIA_STORAGE_DRIVER`. Tests pass
   * `InMemoryObjectStore` so the deletion-chain test can inspect what actually remains.
   */
  objectStore?: ObjectStore;
  /**
   * Tests that hand over their own adapters get the in-memory store by default too — a
   * test should not have to remember to opt out of touching the disk.
   */
  inMemoryStorage?: boolean;
}

/**
 * Caps come from `packages/config`, which is the only place allowed to read `process.env`.
 * They are values, not constants — a cap you cannot change without a deploy is a cap that
 * gets raised by disabling it.
 */
export function capsFromEnv(env: Env): CostCaps {
  return {
    maxCostUsdPerRequest: env.COST_CAP_PER_STORY_USD,
    dailyGlobalUsdCap: env.COST_CAP_DAILY_USD,
    reservationTtlMinutes: 30,
  };
}

/**
 * The queue connection, from configuration. One place, because `apps/api` and the worker
 * halves must reach the SAME Redis — in `PROCESS_MODE=all` they share the registry outright,
 * and when they are split apart a divergence here is a queue that silently swallows work.
 */
export function queueOptionsFromEnv(env: Env): QueueSetupOptions {
  return {
    connection: connectionFromUrl(env.REDIS_URL, {
      tls: useRedisTls(env.REDIS_URL, env.REDIS_TLS),
    }),
    prefix: env.QUEUE_PREFIX,
  };
}

/**
 * Where audio and print bytes live, from configuration.
 *
 * ⚠️ Until this existed, `buildRuntime` fell back to `InMemoryObjectStore` in EVERY
 * environment, so a production worker wrote each narration into a `Map` and lost it on the
 * next restart. The in-memory store stays the default for tests — the deletion-chain test
 * has to be able to inspect what remains — but a process that booted from real config gets
 * a real store.
 *
 * Bucket-per-call, not bucket-per-store: ⚠️ KVKK (SPEC §2, §10.1) keeps raw voice takes in
 * their own bucket, and making the bucket a parameter is what stops a reference clip from
 * landing beside a page illustration.
 */
export function bucketedObjectStoreFromEnv(env: Env): ObjectStore {
  return createBucketedObjectStore({
    config: {
      driver: env.MEDIA_STORAGE_DRIVER,
      localRoot: env.MEDIA_LOCAL_ROOT,
      // A dedicated media signing key when one exists; the session secret otherwise. Both
      // are secrets of the same blast radius (see `processors/image-context.ts`).
      signingSecret: env.MEDIA_URL_SIGNING_SECRET ?? env.AUTH_SECRET,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      kmsKeyId: env.S3_KMS_KEY_ID,
    },
    // The raw-voice bucket's objects carry their retention class as object metadata, so the
    // purge sweep can classify an object whose `assets` row is gone.
    retentionByBucket: { [env.S3_BUCKET_VOICE_RAW]: 'ephemeral_30d' },
  });
}

/**
 * Builds the fake registry from CONFIGURED model ids. The fakes report those ids in
 * `provider_usage.model`, so the ledger looks the same shape it will in production and the
 * cost queries do not need rewriting when the real adapters land.
 */
export function fakeAdaptersFromEnv(env: Env, latencyMs = 0): AdapterRegistry {
  return createFakeRegistry({
    models: {
      llm: env.LLM_MODEL_FILL,
      image: env.IMAGE_MODEL_PRIMARY,
      tts: env.TTS_MODEL_QUALITY,
      moderation: env.MODERATION_MODEL,
      align: 'whisperx-tr',
      print: env.PRINT_ADAPTER,
    },
    latencyMs,
    voiceSlotLimit: env.VOICE_SLOT_LIMIT,
  });
}

export function buildRuntime(options: BuildRuntimeOptions): WorkerRuntime {
  const { env } = options;

  const dbHandle = options.db ? undefined : createDbFromEnv(env);
  const db = options.db ?? dbHandle!.db;

  const queues = options.queues ?? new QueueRegistry(queueOptionsFromEnv(env));

  // API_MODE=live will select the real adapters here once A3–A6 land. Until then every
  // path runs on the deterministic fakes — including in `live`, loudly, rather than
  // pretending a key exists.
  const adapters = options.adapters ?? fakeAdaptersFromEnv(env, options.fakeLatencyMs ?? 0);
  const ledger = options.ledger ?? new PgCostLedger(db);
  const priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
  const breakers = new CircuitBreakerRegistry();

  const routerOptions = { ledger, breakers };

  return {
    env,
    db,
    ...(dbHandle ? { dbHandle } : {}),
    queues,
    adapters,
    routers: {
      // ⭐ Story text. In `mock` the route is the deterministic Turkish story double, in
      // `live` it is Anthropic plus (optionally) the configured fallback vendor — one env
      // var, no code change. A test that injects its own registry keeps that registry.
      llm: new ProviderRouter(
        options.adapters ? [adapters.llm] : createLlmRoute({ env, priceBook }),
        routerOptions,
      ),
      // ⭐ Illustration is the first route with a real adapter behind it. In `mock` (and
      // whenever a caller injected its own registry, i.e. a test) this stays the double;
      // in `live` the factory builds the Gemini adapter plus any configured fallback.
      image: new ProviderRouter(
        options.adapters || env.API_MODE !== 'live'
          ? [adapters.image]
          : createImageAdapterRoute({
              mode: env.API_MODE,
              primary: env.IMAGE_PROVIDER_PRIMARY,
              fallback: env.IMAGE_PROVIDER_FALLBACK,
              models: {
                primary: env.IMAGE_MODEL_PRIMARY,
                fallback: env.IMAGE_MODEL_FALLBACK,
              },
              google: {
                apiKey: env.GOOGLE_GENAI_API_KEY,
                baseUrl: env.GOOGLE_GENAI_BASE_URL,
                apiVersion: env.GOOGLE_GENAI_API_VERSION,
                timeoutMs: env.IMAGE_REQUEST_TIMEOUT_MS,
              },
              // The image processors swap in a store-backed resolver; this default only
              // matters if something calls the router without going through them.
              references: { async resolve() { throw new Error('no reference resolver'); } },
            }),
        routerOptions,
      ),
      // ⭐ The parent's own voice. `mock` keeps the deterministic double (and the demo
      // lullaby the app already plays); `live` builds ElevenLabs plus, when its key is also
      // present, the Cartesia fallback SPEC §7 step 8 calls for — one env var, no code
      // change. A test that injected its own registry keeps that registry.
      tts: new ProviderRouter(
        options.adapters || env.API_MODE !== 'live'
          ? [adapters.tts]
          : (createVoiceRoute({ env, priceBook }).tts as [AdapterRegistry['tts']]),
        routerOptions,
      ),
      // Free, on the critical path, and never optional (SPEC §10.4 K2/K4b).
      moderation: new ProviderRouter(
        options.adapters || env.API_MODE !== 'live'
          ? [adapters.moderation]
          : createModerationRoute({ env }),
        routerOptions,
      ),
      // Forced alignment (WhisperX, self-hosted) recovers word timings when the TTS vendor
      // returns none, and transcribes the spoken consent clip for the liveness check. With
      // no `WHISPERX_URL` configured the live route is empty, so the fake stays — and the
      // consent gate treats an unverifiable clip as a refusal rather than as a pass.
      align: new ProviderRouter(
        options.adapters || env.API_MODE !== 'live' || !env.WHISPERX_URL
          ? [adapters.align]
          : (createVoiceRoute({ env, priceBook }).align as [AdapterRegistry['align']]),
        routerOptions,
      ),
      // ⭐ The printer. `manual_tr` (the MVP) is not built here: it needs the ops-backed
      // job store, so `apps/worker/src/processors/print.ts` constructs it with the gateway.
      // An API-driven partner needs nothing but config, so it IS built here — which is what
      // makes SPEC §9's "cloudprinter geçişi tek satır config" literally true.
      print: new ProviderRouter(
        options.adapters || env.API_MODE !== 'live' || env.PRINT_ADAPTER === 'manual_tr'
          ? [adapters.print]
          : [
              createPrintAdapter({
                adapter: env.PRINT_ADAPTER,
                apiMode: 'live',
                http: {
                  baseUrl: env.PRINT_PROVIDER_BASE_URL ?? '',
                  ...(env.PRINT_PROVIDER_API_KEY ? { apiKey: env.PRINT_PROVIDER_API_KEY } : {}),
                  skuByFormat: parsePrintSkuMap(env.PRINT_SKU_MAP),
                  ...(env.PRINT_WEBHOOK_SECRET
                    ? { webhookSecret: env.PRINT_WEBHOOK_SECRET }
                    : {}),
                },
              }),
            ],
        routerOptions,
      ),
    },
    ledger,
    priceBook,
    caps: capsFromEnv(env),
    breakers,
    /**
     * A caller that injected its own adapters is a test (see the `routers` block above,
     * which reads the same signal), and a test must not write a narration to disk or to a
     * bucket. Everything else — including `API_MODE=mock` in a real deployment — gets the
     * configured driver, because losing the bytes is not part of what `mock` mocks.
     */
    objectStore:
      options.objectStore ??
      (options.inMemoryStorage ?? Boolean(options.adapters)
        ? new InMemoryObjectStore()
        : bucketedObjectStoreFromEnv(env)),
    buckets: {
      media: env.S3_BUCKET_MEDIA,
      voiceRaw: env.S3_BUCKET_VOICE_RAW,
      ...(env.S3_VOICE_KMS_KEY_ID ? { voiceKmsAlias: env.S3_VOICE_KMS_KEY_ID } : {}),
    },
    ttsSettings: ttsSettingsFromEnv(env),
    async close() {
      await queues.close();
      await dbHandle?.close();
    },
  };
}
