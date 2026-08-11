/**
 * core/fakes/index.ts — a complete `AdapterRegistry` of doubles.
 *
 * `apps/worker` builds this when `API_MODE=mock` (the default). Swapping in the real
 * adapters later is a change to the factory, not to any processor.
 */

import type { AdapterRegistry } from '../adapters';
import type { PriceBook } from '../pricing';
import { DEFAULT_PRICE_BOOK } from '../pricing';
import type { FailurePlan } from './support';
import {
  FakeAlignAdapter,
  FakeImageAdapter,
  FakeLlmAdapter,
  FakeModerationAdapter,
  FakePrintAdapter,
  FakeTtsAdapter,
} from './adapters';

export * from './support';
export * from './adapters';

export interface FakeRegistryOptions {
  /**
   * Model ids, sourced from `packages/config` in production (`LLM_MODEL_FILL`,
   * `IMAGE_MODEL_PRIMARY`, …). Never literals in code — see SPEC §3 rule 6.
   */
  models: {
    llm: string;
    image: string;
    tts: string;
    moderation: string;
    align: string;
    print: string;
  };
  latencyMs?: number;
  latencyJitterMs?: number;
  failures?: FailurePlan;
  priceBook?: PriceBook;
  voiceSlotLimit?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createFakeRegistry(options: FakeRegistryOptions): AdapterRegistry {
  const shared = {
    ...(options.latencyMs !== undefined ? { latencyMs: options.latencyMs } : {}),
    ...(options.latencyJitterMs !== undefined
      ? { latencyJitterMs: options.latencyJitterMs }
      : {}),
    ...(options.failures !== undefined ? { failures: options.failures } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    priceBook: options.priceBook ?? DEFAULT_PRICE_BOOK,
  };

  return {
    llm: new FakeLlmAdapter({ ...shared, model: options.models.llm }),
    image: new FakeImageAdapter({ ...shared, model: options.models.image }),
    tts: new FakeTtsAdapter({
      ...shared,
      model: options.models.tts,
      ...(options.voiceSlotLimit !== undefined ? { slotLimit: options.voiceSlotLimit } : {}),
    }),
    moderation: new FakeModerationAdapter({ ...shared, model: options.models.moderation }),
    align: new FakeAlignAdapter({ ...shared, model: options.models.align }),
    print: new FakePrintAdapter({ ...shared, model: options.models.print }),
  };
}
