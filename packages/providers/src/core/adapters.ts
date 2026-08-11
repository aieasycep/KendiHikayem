/**
 * core/adapters.ts — the six provider interfaces.
 *
 * A2 owns these signatures; A3 (LLM), A4 (image), A5 (voice/TTS) and A6 (print) write the
 * real implementations behind them. `core/fakes/` already implements all six, so the whole
 * system runs end to end before a single vendor key exists.
 *
 * Two rules the shapes encode on purpose:
 *   1. Every method takes a `ProviderCallContext` whose `requestId` is stable across
 *      retries — provider-side dedupe is level-3 idempotency's outer edge.
 *   2. Every method returns `AdapterResult<T>`: the value AND its `ProviderUsage[]`.
 *      There is no way to call a provider and "forget" to price the call.
 */

import type { AgeBand, Tier } from '@kendihikayem/contract';

import type {
  AdapterInfo,
  AdapterResult,
  ProviderCallContext,
} from './types';

/* ── LLM ───────────────────────────────────────────────────────────────────── */

/**
 * Which stage of the story pipeline is calling. The purpose selects the model id and the
 * price row; the caller never names a model (SPEC §3 rule 6).
 */
export type LlmPurpose =
  /** Stage 1, the cheap gate: skeleton only (~$0.03). */
  | 'outline'
  /** Stage 2, the expensive fill — only after the parent approved the skeleton. */
  | 'fill'
  /** Age-rubric judge (SPEC §10.4 K4c). */
  | 'judge'
  /** CHARACTER_DNA canon, frozen after generation (SPEC §8.1 ①). */
  | 'character_dna'
  /** Per-page illustration prompt (SPEC §8.2 step 4 audits its output). */
  | 'illustration_prompt'
  /** Single-page rewrite requested by the parent (P02). */
  | 'page_rewrite';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /**
   * Marks a prompt prefix as cacheable. SPEC §6.2 rule 2: nothing volatile (date, uuid,
   * child name) may appear inside a cacheable block or the cache silently never hits.
   */
  cacheable?: boolean;
}

export interface LlmCompleteInput {
  purpose: LlmPurpose;
  messages: LlmMessage[];
  maxOutputTokens: number;
  temperature?: number;
  /** Reasoning effort where the vendor supports it (config: `LLM_FILL_EFFORT`). */
  effort?: 'low' | 'medium' | 'high';
  responseFormat?: 'text' | 'json';
  /** Batch API — 50% cheaper, higher latency. Default for anything a user is not watching. */
  batch?: boolean;
  stopSequences?: string[];
}

export interface LlmTokenUsage {
  input: number;
  output: number;
  /**
   * Tokens served from the vendor's prompt cache. SPEC §6.2: a sustained zero here means a
   * silent cache invalidator sneaked into the system prompt → alarm, not a shrug.
   */
  cachedInput: number;
}

export interface LlmCompleteOutput {
  text: string;
  finishReason: 'stop' | 'length' | 'refusal' | 'tool_use';
  tokens: LlmTokenUsage;
  /** The model id actually used, as configured. Written to `job_steps.provider_model`. */
  model: string;
}

export interface LlmAdapter extends AdapterInfo {
  readonly kind: 'llm';
  complete(
    input: LlmCompleteInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<LlmCompleteOutput>>;
}

/* ── Image ─────────────────────────────────────────────────────────────────── */

export type ImagePurpose = 'style_plate' | 'character_sheet' | 'page' | 'cover';

/**
 * Screen vs print is the single biggest cost lever in the product (SPEC §6.2 rule 1):
 * 2K on screen, 4K only once a printed book is actually ordered.
 */
export type ImageResolution = 'preview_1k' | 'screen_2k' | 'print_4k';

export type ImageReferenceKind =
  | 'style_plate'
  | 'character_sheet'
  | 'face_ref'
  | 'previous_page';

export interface ImageReference {
  kind: ImageReferenceKind;
  /** `assets.id`; the adapter resolves it to bytes or a signed URL itself. */
  assetId: string;
  url?: string;
}

export interface ImageGenerateInput {
  purpose: ImagePurpose;
  /** English. Every model is measurably better with English image prompts (SPEC §8.2). */
  promptEn: string;
  negativePromptEn?: string;
  references: ImageReference[];
  aspectRatio: '1:1' | '4:3' | '3:4' | '16:9';
  resolution: ImageResolution;
  batch: boolean;
  /**
   * ⚠️ Required, not optional: Gemini ships with safety filtering OFF by default
   * (SPEC §8.2 step 5). Making this mandatory means nobody can forget it.
   */
  safety: { blockLevel: 'BLOCK_MOST' | 'BLOCK_SOME' | 'BLOCK_NONE' };
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  /** sha256 of `bytes` — the content_cache key component and the QA audit trail. */
  sha256: string;
}

export interface ImageGenerateOutput {
  image: GeneratedImage;
  model: string;
  /** Set when the vendor refused; the caller sanitises the prompt and retries once. */
  blockedReason?: string;
}

export interface ImageAdapter extends AdapterInfo {
  readonly kind: 'image';
  generate(
    input: ImageGenerateInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<ImageGenerateOutput>>;
}

/* ── TTS / voice ───────────────────────────────────────────────────────────── */

export interface VoiceReferenceClip {
  assetId: string;
  url?: string;
  bytes?: Uint8Array;
  durationMs: number;
}

export interface CreateVoiceInput {
  /** 90–120 s of loudness-normalised 48 kHz mono, never more than 3 min (SPEC §7 step 8). */
  reference: VoiceReferenceClip[];
  /** `consents.id` of the biometric consent. Refuse to clone without it. */
  consentId: string;
  /**
   * Delete the vendor-side voice as soon as synthesis finishes, freeing a slot from the
   * 660-slot ceiling (SPEC §7 step 10, R5).
   */
  ephemeral: boolean;
  labels?: Record<string, string>;
}

export interface CreateVoiceOutput {
  providerVoiceId: string;
  model: string;
  expiresAt?: string;
}

export type VoiceSelection =
  | { kind: 'cloned'; providerVoiceId: string }
  /** `system_voices.provider_voice_id`, chosen from the catalog. */
  | { kind: 'system'; providerVoiceId: string };

export interface SynthesizeInput {
  /** One chunk. Chunks split on paragraph/page boundaries, never mid-sentence (SPEC §7). */
  text: string;
  voice: VoiceSelection;
  tier: Tier;
  /** Prosody continuity across chunk boundaries. */
  previousText?: string;
  nextText?: string;
  languageCode: 'tr';
  outputFormat: 'mp3_44100_128' | 'pcm_48000' | 'opus_48000';
}

export interface SynthesizeOutput {
  audio: Uint8Array;
  mimeType: string;
  durationMs: number;
  /** Billed characters as the vendor counts them — not `text.length` if they differ. */
  billedCharacters: number;
  model: string;
  /** Some vendors return timings for free; if absent, AlignAdapter earns its keep. */
  alignment?: WordTiming[];
}

export interface TtsAdapter extends AdapterInfo {
  readonly kind: 'tts';
  createVoice(
    input: CreateVoiceInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<CreateVoiceOutput>>;
  deleteVoice(providerVoiceId: string, ctx: ProviderCallContext): Promise<AdapterResult<void>>;
  synthesize(
    input: SynthesizeInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<SynthesizeOutput>>;
  /** Remaining vendor slots, when the vendor exposes it. Drives LRU eviction. */
  slotUsage?(ctx: ProviderCallContext): Promise<{ used: number; limit: number }>;
}

/* ── Moderation ────────────────────────────────────────────────────────────── */

/** Mirrors `MODERATION_SURFACE` in packages/db. */
export type ModerationSurface =
  | 'parent_input'
  | 'story_text'
  | 'illustration_prompt'
  | 'image_output'
  | 'voice_script'
  | 'user_edit';

export interface ModerationCheckInput {
  surface: ModerationSurface;
  text?: string;
  image?: { bytes: Uint8Array; mimeType: string };
  /** The rubric tightens with the age band (SPEC §10.4). */
  ageBand?: AgeBand;
}

export interface ModerationCheckOutput {
  verdict: 'pass' | 'flag' | 'block';
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  model: string;
}

export interface ModerationAdapter extends AdapterInfo {
  readonly kind: 'moderation';
  check(
    input: ModerationCheckInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<ModerationCheckOutput>>;
}

/* ── Alignment ─────────────────────────────────────────────────────────────── */

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface AlignInput {
  audio: { bytes: Uint8Array; mimeType: string };
  /** The text that was spoken. Forced alignment, not free transcription. */
  text: string;
  languageCode: 'tr';
}

export interface AlignOutput {
  words: WordTiming[];
  /** Word-for-word similarity, used by the voice consent gate (`VOICE_SCRIPT_MISMATCH`). */
  similarity?: number;
  model: string;
  durationMs: number;
}

export interface AlignAdapter extends AdapterInfo {
  readonly kind: 'align';
  align(input: AlignInput, ctx: ProviderCallContext): Promise<AdapterResult<AlignOutput>>;
}

/* ── Print ─────────────────────────────────────────────────────────────────── */

export interface PrintQuoteInput {
  /** `book_formats.code`, e.g. the single MVP square hardcover. */
  formatCode: string;
  pageCount: number;
  quantity: number;
  destination: { country: 'TR'; city: string; postalCode?: string };
}

export interface PrintQuoteOutput {
  /** KURUŞ — money is always an integer in this repo (contract primitives rule 3). */
  unitPriceKurus: number;
  shippingKurus: number;
  totalKurus: number;
  etaBusinessDays: number;
  quoteRef: string;
  provider: string;
}

export interface PrintSubmitInput {
  orderId: string;
  formatCode: string;
  quantity: number;
  files: { interiorPdfUrl: string; coverPdfUrl: string };
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
}

export interface PrintSubmitOutput {
  externalId: string;
  status: 'queued' | 'submitted' | 'accepted';
}

export interface PrintStatusOutput {
  externalId: string;
  status: 'queued' | 'submitted' | 'accepted' | 'printing' | 'shipped' | 'error' | 'cancelled';
  trackingUrl?: string;
  carrier?: string;
  message?: string;
}

export interface PrintAdapter extends AdapterInfo {
  readonly kind: 'print';
  quote(input: PrintQuoteInput, ctx: ProviderCallContext): Promise<AdapterResult<PrintQuoteOutput>>;
  submit(
    input: PrintSubmitInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintSubmitOutput>>;
  status(externalId: string, ctx: ProviderCallContext): Promise<AdapterResult<PrintStatusOutput>>;
  cancel(externalId: string, ctx: ProviderCallContext): Promise<AdapterResult<{ ok: boolean }>>;
}

/* ── Registry ──────────────────────────────────────────────────────────────── */

/** What a fully wired process holds. `apps/worker` builds one of these at boot. */
export interface AdapterRegistry {
  llm: LlmAdapter;
  image: ImageAdapter;
  tts: TtsAdapter;
  moderation: ModerationAdapter;
  align: AlignAdapter;
  print: PrintAdapter;
}
