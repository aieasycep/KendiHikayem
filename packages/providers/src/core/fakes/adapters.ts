/**
 * core/fakes/adapters.ts — deterministic doubles for all six provider interfaces.
 *
 * AI provider APIs are unreachable in this environment and no keys exist, so these are not
 * a nicety: they are how the whole pipeline runs end to end today. A3–A6 will add real
 * implementations of the same interfaces beside them; nothing outside this folder needs to
 * change when they do, because the router only knows the interface.
 *
 * Each fake produces plausible Turkish-shaped output, prices itself through the same
 * `PriceBook` the estimator uses, and honours `FailurePlan`.
 */

import type {
  AlignAdapter,
  AlignInput,
  AlignOutput,
  CreateVoiceInput,
  CreateVoiceOutput,
  ImageAdapter,
  ImageGenerateInput,
  ImageGenerateOutput,
  LlmAdapter,
  LlmCompleteInput,
  LlmCompleteOutput,
  ModerationAdapter,
  ModerationCheckInput,
  ModerationCheckOutput,
  PrintAdapter,
  PrintQuoteInput,
  PrintQuoteOutput,
  PrintStatusOutput,
  PrintSubmitInput,
  PrintSubmitOutput,
  SynthesizeInput,
  SynthesizeOutput,
  TtsAdapter,
  WordTiming,
} from '../adapters';
import type { AdapterResult, ProviderCallContext, ProviderUsage } from '../types';
import {
  type PriceBook,
  DEFAULT_PRICE_BOOK,
  priceImageCall,
  priceLlmCall,
  priceTtsCall,
  roundUsd,
} from '../pricing';
import { ProviderError } from '../errors';
import {
  BaseFakeAdapter,
  type FakeAdapterOptions,
  estimateTokens,
  seededBytes,
  seededRandom,
  sha256Hex,
} from './support';

export interface FakeAdapterConfig extends FakeAdapterOptions {
  priceBook?: PriceBook;
}

/* ── LLM ───────────────────────────────────────────────────────────────────── */

/** Words the fake stitches into output so Turkish rendering paths get exercised. */
const TR_WORDS = [
  'yağmur',
  'ağaç',
  'gökyüzü',
  'ışık',
  'çilek',
  'düş',
  'sığınak',
  'uğurböceği',
  'şarkı',
  'öykü',
];

export class FakeLlmAdapter extends BaseFakeAdapter implements LlmAdapter {
  readonly kind = 'llm' as const;
  private readonly priceBook: PriceBook;

  constructor(config: FakeAdapterConfig) {
    super(config);
    this.priceBook = config.priceBook ?? DEFAULT_PRICE_BOOK;
  }

  async complete(
    input: LlmCompleteInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<LlmCompleteOutput>> {
    const latencyMs = await this.simulate('llm.complete', ctx.requestId);

    const promptText = input.messages.map((m) => m.content).join('\n');
    const seed = sha256Hex(`${input.purpose}|${promptText}`);
    const rand = seededRandom(seed);

    const cacheablePrefix = input.messages
      .filter((m) => m.cacheable)
      .map((m) => m.content)
      .join('\n');

    const inputTokens = estimateTokens(promptText);
    const cachedInput = estimateTokens(cacheablePrefix);
    const outputTokens = Math.min(
      input.maxOutputTokens,
      Math.max(64, Math.floor(input.maxOutputTokens * (0.4 + rand() * 0.4))),
    );

    const text =
      input.responseFormat === 'json'
        ? JSON.stringify({
            purpose: input.purpose,
            seed: seed.slice(0, 12),
            items: Array.from({ length: 3 }, (_, i) => ({
              index: i + 1,
              tr: TR_WORDS[Math.floor(rand() * TR_WORDS.length)] ?? 'öykü',
            })),
          })
        : Array.from(
            { length: 24 },
            () => TR_WORDS[Math.floor(rand() * TR_WORDS.length)] ?? 'öykü',
          ).join(' ');

    const costUsd = roundUsd(
      priceLlmCall(
        this.priceBook,
        input.purpose,
        {
          input: Math.max(0, inputTokens - cachedInput),
          output: outputTokens,
          cachedInput,
        },
        input.batch ?? false,
      ),
    );

    const usage: ProviderUsage[] = [
      {
        provider: this.provider,
        model: this.model,
        operation: 'llm.complete',
        billingUnit: 'token',
        billedUnits: inputTokens + outputTokens,
        unitPriceUsd: costUsd / Math.max(1, inputTokens + outputTokens),
        costUsd,
        cacheHit: false,
        latencyMs,
      },
    ];

    return {
      value: {
        text,
        finishReason: 'stop',
        tokens: { input: inputTokens, output: outputTokens, cachedInput },
        model: this.model,
      },
      usage,
    };
  }
}

/* ── Image ─────────────────────────────────────────────────────────────────── */

const IMAGE_DIMENSIONS: Record<ImageGenerateInput['resolution'], number> = {
  preview_1k: 1024,
  screen_2k: 2048,
  print_4k: 4096,
};

export class FakeImageAdapter extends BaseFakeAdapter implements ImageAdapter {
  readonly kind = 'image' as const;
  private readonly priceBook: PriceBook;

  constructor(config: FakeAdapterConfig) {
    super(config);
    this.priceBook = config.priceBook ?? DEFAULT_PRICE_BOOK;
  }

  async generate(
    input: ImageGenerateInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<ImageGenerateOutput>> {
    const latencyMs = await this.simulate('image.generate', ctx.requestId);

    // Mirrors the real constraint from SPEC §8.2: safety must be explicitly requested.
    if (input.safety.blockLevel === 'BLOCK_NONE') {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'image.generate',
        detail: 'BLOCK_NONE is not permitted for a children product',
      });
    }

    const seed = sha256Hex(
      [input.purpose, input.promptEn, input.resolution, ...input.references.map((r) => r.assetId)].join(
        '|',
      ),
    );
    const size = IMAGE_DIMENSIONS[input.resolution];
    const bytes = seededBytes(seed, 512);
    const costUsd = roundUsd(priceImageCall(this.priceBook, input.resolution, 1, input.batch));

    return {
      value: {
        image: {
          bytes,
          mimeType: 'image/png',
          width: size,
          height: input.aspectRatio === '1:1' ? size : Math.round(size * 0.75),
          sha256: sha256Hex(bytes),
        },
        model: this.model,
      },
      usage: [
        {
          provider: this.provider,
          model: this.model,
          operation: 'image.generate',
          billingUnit: 'image',
          billedUnits: 1,
          unitPriceUsd: costUsd,
          costUsd,
          cacheHit: false,
          latencyMs,
        },
      ],
    };
  }
}

/* ── TTS ───────────────────────────────────────────────────────────────────── */

export interface FakeTtsConfig extends FakeAdapterConfig {
  /** Mirrors `VOICE_SLOT_LIMIT`; exercises the LRU-eviction path (SPEC §7 step 8). */
  slotLimit?: number;
}

export class FakeTtsAdapter extends BaseFakeAdapter implements TtsAdapter {
  readonly kind = 'tts' as const;
  private readonly priceBook: PriceBook;
  private readonly slotLimit: number;
  private readonly voices = new Set<string>();

  constructor(config: FakeTtsConfig) {
    super(config);
    this.priceBook = config.priceBook ?? DEFAULT_PRICE_BOOK;
    this.slotLimit = config.slotLimit ?? 660;
  }

  async createVoice(
    input: CreateVoiceInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<CreateVoiceOutput>> {
    const latencyMs = await this.simulate('tts.voice.create', ctx.requestId);

    if (!input.consentId) {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'tts.voice.create',
        detail: 'refusing to clone a voice without recorded consent',
      });
    }
    if (this.voices.size >= this.slotLimit) {
      throw new ProviderError({
        kind: 'slot_exhausted',
        provider: this.provider,
        operation: 'tts.voice.create',
        detail: `voice slot ceiling reached (${this.slotLimit})`,
      });
    }

    const providerVoiceId = `fakevoice_${sha256Hex(ctx.requestId).slice(0, 16)}`;
    this.voices.add(providerVoiceId);

    return {
      value: { providerVoiceId, model: this.model },
      usage: [
        {
          provider: this.provider,
          model: this.model,
          operation: 'tts.voice.create',
          billingUnit: 'request',
          billedUnits: 1,
          unitPriceUsd: 0,
          costUsd: 0,
          cacheHit: false,
          latencyMs,
        },
      ],
    };
  }

  async deleteVoice(providerVoiceId: string, ctx: ProviderCallContext): Promise<AdapterResult<void>> {
    const latencyMs = await this.simulate('tts.voice.delete', ctx.requestId);
    this.voices.delete(providerVoiceId);
    return {
      value: undefined,
      usage: [
        {
          provider: this.provider,
          model: this.model,
          operation: 'tts.voice.delete',
          billingUnit: 'request',
          billedUnits: 1,
          unitPriceUsd: 0,
          costUsd: 0,
          cacheHit: false,
          latencyMs,
        },
      ],
    };
  }

  async synthesize(
    input: SynthesizeInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<SynthesizeOutput>> {
    const latencyMs = await this.simulate('tts.synth', ctx.requestId);

    const characters = input.text.length;
    // ~14 Turkish characters per second of narration at a bedtime pace.
    const durationMs = Math.round((characters / 14) * 1000);
    const costUsd = roundUsd(priceTtsCall(this.priceBook, input.tier, characters));
    const bytes = seededBytes(sha256Hex(`${input.voice.providerVoiceId}|${input.text}`), 256);

    return {
      value: {
        audio: bytes,
        mimeType: 'audio/mpeg',
        durationMs,
        billedCharacters: characters,
        model: this.model,
        alignment: fakeAlignment(input.text, durationMs),
      },
      usage: [
        {
          provider: this.provider,
          model: this.model,
          operation: 'tts.synth',
          billingUnit: 'character',
          billedUnits: characters,
          unitPriceUsd: costUsd / Math.max(1, characters),
          costUsd,
          cacheHit: false,
          latencyMs,
        },
      ],
    };
  }

  async slotUsage(): Promise<{ used: number; limit: number }> {
    return { used: this.voices.size, limit: this.slotLimit };
  }
}

function fakeAlignment(text: string, durationMs: number): WordTiming[] {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  const per = Math.max(1, Math.floor(durationMs / words.length));
  return words.map((word, index) => ({
    word,
    startMs: index * per,
    endMs: (index + 1) * per,
    confidence: 0.99,
  }));
}

/* ── Moderation ────────────────────────────────────────────────────────────── */

/**
 * Deterministic block list so the safety pipeline has something to trip on before the real
 * moderation vendor exists. `packages/safety` owns the production lists (SPEC §10.4).
 */
const FAKE_BLOCK_TERMS = ['__block__', 'silah', 'kan'];

export class FakeModerationAdapter extends BaseFakeAdapter implements ModerationAdapter {
  readonly kind = 'moderation' as const;

  async check(
    input: ModerationCheckInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<ModerationCheckOutput>> {
    const latencyMs = await this.simulate('moderation.check', ctx.requestId);

    const haystack = (input.text ?? '').toLocaleLowerCase('tr-TR');
    const hit = FAKE_BLOCK_TERMS.find((term) => haystack.includes(term));

    return {
      value: {
        verdict: hit ? 'block' : 'pass',
        categories: hit ? { violence: true } : {},
        scores: { violence: hit ? 0.97 : 0.01 },
        model: this.model,
      },
      usage: [
        {
          provider: this.provider,
          model: this.model,
          operation: 'moderation.check',
          billingUnit: 'request',
          billedUnits: 1,
          unitPriceUsd: 0,
          costUsd: 0,
          cacheHit: false,
          latencyMs,
        },
      ],
    };
  }
}

/* ── Alignment ─────────────────────────────────────────────────────────────── */

export class FakeAlignAdapter extends BaseFakeAdapter implements AlignAdapter {
  readonly kind = 'align' as const;
  private readonly priceBook: PriceBook;

  constructor(config: FakeAdapterConfig) {
    super(config);
    this.priceBook = config.priceBook ?? DEFAULT_PRICE_BOOK;
  }

  async align(input: AlignInput, ctx: ProviderCallContext): Promise<AdapterResult<AlignOutput>> {
    const latencyMs = await this.simulate('align.transcribe', ctx.requestId);

    const durationMs = Math.round((input.text.length / 14) * 1000);
    const minutes = durationMs / 60_000;
    const costUsd = roundUsd(this.priceBook.align.perMinuteUsd * minutes);

    return {
      value: {
        words: fakeAlignment(input.text, durationMs),
        similarity: 0.97,
        model: this.model,
        durationMs,
      },
      usage: [
        {
          provider: this.provider,
          model: this.model,
          operation: 'align.transcribe',
          billingUnit: 'second',
          billedUnits: Math.round(durationMs / 1000),
          unitPriceUsd: this.priceBook.align.perMinuteUsd / 60,
          costUsd,
          cacheHit: false,
          latencyMs,
        },
      ],
    };
  }
}

/* ── Print ─────────────────────────────────────────────────────────────────── */

export class FakePrintAdapter extends BaseFakeAdapter implements PrintAdapter {
  readonly kind = 'print' as const;
  private readonly submitted = new Map<string, PrintStatusOutput['status']>();

  async quote(
    input: PrintQuoteInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintQuoteOutput>> {
    const latencyMs = await this.simulate('print.quote', ctx.requestId);

    // KURUŞ, always integers (contract primitives rule 3).
    const unitPriceKurus = 32_000 + input.pageCount * 250;
    const shippingKurus = 6_500;
    return {
      value: {
        unitPriceKurus,
        shippingKurus,
        totalKurus: unitPriceKurus * input.quantity + shippingKurus,
        etaBusinessDays: 7,
        quoteRef: `fq_${sha256Hex(ctx.requestId).slice(0, 12)}`,
        provider: this.provider,
      },
      usage: [this.freeUsage('print.quote', latencyMs)],
    };
  }

  async submit(
    input: PrintSubmitInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintSubmitOutput>> {
    const latencyMs = await this.simulate('print.submit', ctx.requestId);
    const externalId = `fpj_${sha256Hex(input.orderId).slice(0, 12)}`;
    this.submitted.set(externalId, 'submitted');
    return {
      value: { externalId, status: 'submitted' },
      usage: [this.freeUsage('print.submit', latencyMs)],
    };
  }

  async status(
    externalId: string,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintStatusOutput>> {
    const latencyMs = await this.simulate('print.status', ctx.requestId);
    return {
      value: { externalId, status: this.submitted.get(externalId) ?? 'queued' },
      usage: [this.freeUsage('print.status', latencyMs)],
    };
  }

  async cancel(
    externalId: string,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<{ ok: boolean }>> {
    const latencyMs = await this.simulate('print.cancel', ctx.requestId);
    this.submitted.set(externalId, 'cancelled');
    return { value: { ok: true }, usage: [this.freeUsage('print.cancel', latencyMs)] };
  }

  private freeUsage(
    operation: ProviderUsage['operation'],
    latencyMs: number,
  ): ProviderUsage {
    return {
      provider: this.provider,
      model: this.model,
      operation,
      billingUnit: 'request',
      billedUnits: 1,
      unitPriceUsd: 0,
      costUsd: 0,
      cacheHit: false,
      latencyMs,
    };
  }
}
