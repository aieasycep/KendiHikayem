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
import {
  type AdapterRegistry,
  type CostLedger,
  type PriceBook,
  CircuitBreakerRegistry,
  DEFAULT_PRICE_BOOK,
  ProviderRouter,
  createFakeRegistry,
} from '@kendihikayem/providers';

import { PgCostLedger } from './cost/ledger.pg';
import type { CostCaps } from './cost/reservation';
import { QueueRegistry, connectionFromUrl } from './queues';

export interface WorkerRuntime {
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

  const queues =
    options.queues ??
    new QueueRegistry({
      connection: connectionFromUrl(env.REDIS_URL),
      prefix: env.QUEUE_PREFIX,
    });

  // API_MODE=live will select the real adapters here once A3–A6 land. Until then every
  // path runs on the deterministic fakes — including in `live`, loudly, rather than
  // pretending a key exists.
  const adapters = options.adapters ?? fakeAdaptersFromEnv(env, options.fakeLatencyMs ?? 0);
  const ledger = options.ledger ?? new PgCostLedger(db);
  const priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
  const breakers = new CircuitBreakerRegistry();

  const routerOptions = { ledger, breakers };

  return {
    db,
    ...(dbHandle ? { dbHandle } : {}),
    queues,
    adapters,
    routers: {
      // Single-element routes today. `VOICE_PRIMARY` → `VOICE_FALLBACK` becomes
      // `[primary, fallback]` the moment two real adapters exist; nothing else changes.
      llm: new ProviderRouter([adapters.llm], routerOptions),
      image: new ProviderRouter([adapters.image], routerOptions),
      tts: new ProviderRouter([adapters.tts], routerOptions),
      moderation: new ProviderRouter([adapters.moderation], routerOptions),
      align: new ProviderRouter([adapters.align], routerOptions),
      print: new ProviderRouter([adapters.print], routerOptions),
    },
    ledger,
    priceBook,
    caps: capsFromEnv(env),
    breakers,
    async close() {
      await queues.close();
      await dbHandle?.close();
    },
  };
}
