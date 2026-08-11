/**
 * llm/mock-story.ts — the mock-mode story model.
 *
 * `API_MODE=mock` has to produce something the REST of the pipeline can be judged on: a
 * skeleton the approval screen can render, pages the Turkish quality gate can grade, a
 * judge verdict the safety layer can act on. The generic fake in `core/fakes` returns
 * plausible-looking noise, which is right for exercising retries and pricing and useless
 * for exercising the gate — a gate tested only against noise proves nothing.
 *
 * So this adapter writes real, if formulaic, Turkish: correct name inflection (through the
 * same `@kendihikayem/shared` helpers the gate checks with), per-band word counts, a
 * refrain for the 0-2 band, a warm close. It passes the quality gate honestly — and
 * `story-generation.test.ts` proves the gate still rejects deliberately broken text, so the
 * pass is not a tautology.
 *
 * Deterministic: same prompt ⇒ same story, which is what makes `content_cache` testable.
 */

import { createHash } from 'node:crypto';

import { accusative, capitalizeTr, dative, possessive } from '@kendihikayem/shared';

import type {
  LlmAdapter,
  LlmCompleteInput,
  LlmCompleteOutput,
  LlmPurpose,
} from '../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderName, ProviderUsage } from '../core/types';
import { type PriceBook, DEFAULT_PRICE_BOOK, priceLlmCall, roundUsd } from '../core/pricing';

type Band = '0-2' | '3-5' | '6-8';

export interface MockStoryLlmAdapterOptions {
  /** Model ids from config, so `provider_usage` looks the same shape as in production. */
  models: Record<LlmPurpose, string>;
  priceBook?: PriceBook;
  provider?: ProviderName;
  /** Simulated latency; 0 in tests. */
  latencyMs?: number;
}

export class MockStoryLlmAdapter implements LlmAdapter {
  readonly kind = 'llm' as const;
  readonly provider: ProviderName;
  private readonly options: MockStoryLlmAdapterOptions;
  private readonly priceBook: PriceBook;

  constructor(options: MockStoryLlmAdapterOptions) {
    this.options = options;
    this.provider = options.provider ?? 'fake';
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
  }

  modelFor(purpose: LlmPurpose): string {
    return this.options.models[purpose];
  }

  async complete(
    input: LlmCompleteInput,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<LlmCompleteOutput>> {
    if (this.options.latencyMs) await sleep(this.options.latencyMs);

    const prompt = input.messages.map((message) => message.content).join('\n');
    const text = this.render(input.purpose, prompt);

    // Token accounting mirrors the real adapter's shape: a cacheable system block is
    // reported as cache-read so the ledger and the cache alarm have something to read.
    const cacheable = input.messages
      .filter((message) => message.cacheable)
      .map((message) => message.content)
      .join('\n');
    const cachedInput = estimateTokens(cacheable);
    const inputTokens = Math.max(1, estimateTokens(prompt) - cachedInput);
    const outputTokens = estimateTokens(text);

    const costUsd = roundUsd(
      priceLlmCall(
        this.priceBook,
        input.purpose,
        { input: inputTokens, output: outputTokens, cachedInput },
        input.batch ?? false,
      ),
    );

    const model = this.modelFor(input.purpose);
    const usage: ProviderUsage = {
      provider: this.provider,
      model,
      operation: 'llm.complete',
      billingUnit: 'token',
      billedUnits: inputTokens + cachedInput + outputTokens,
      unitPriceUsd: costUsd / Math.max(1, inputTokens + outputTokens),
      costUsd,
      cacheHit: cachedInput > 0,
      latencyMs: this.options.latencyMs ?? 0,
    };

    return {
      value: {
        text,
        finishReason: 'stop',
        tokens: { input: inputTokens, output: outputTokens, cachedInput },
        model,
      },
      usage: [usage],
    };
  }

  private render(purpose: LlmPurpose, prompt: string): string {
    switch (purpose) {
      case 'outline':
        return JSON.stringify(buildOutline(parseParentBlock(prompt)));
      case 'fill':
        return JSON.stringify(buildFill(parseOutlineBlock(prompt)));
      case 'page_rewrite':
        return JSON.stringify(buildRewrite(parseRewriteBlock(prompt)));
      case 'judge':
        return JSON.stringify({ uygun: true, ihlaller: [], not: 'Rubrik ihlali bulunmadı.' });
      default:
        // character_dna / illustration_prompt belong to A4; a neutral English line keeps
        // their steps runnable in mock mode without pretending to be their adapter.
        return JSON.stringify({ prompt_en: 'soft watercolour storybook illustration' });
    }
  }
}

/* ── prompt parsing ────────────────────────────────────────────────────────── */

interface ParentContext {
  heroName: string;
  ageBand: Band;
  pageCount: number;
  themeCode: string;
}

function parseParentBlock(prompt: string): ParentContext {
  // ⚠️ The attribute is part of the pattern on purpose: the SYSTEM prompt also mentions
  // `<ebeveyn_girdisi>` (when it tells the model that the block is data), and a laxer
  // regex matches that instead and swallows everything up to the real closing tag.
  const raw = /<ebeveyn_girdisi\s+guven="[^"]*">\s*([\s\S]*?)\s*<\/ebeveyn_girdisi>/u.exec(
    prompt,
  )?.[1];
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const heroName = typeof parsed['kahraman_adi'] === 'string' ? parsed['kahraman_adi'] : 'Elif';
  const ageBand = asBand(parsed['yas_bandi']);
  const pageCount =
    typeof parsed['sayfa_sayisi'] === 'number' && parsed['sayfa_sayisi'] > 0
      ? Math.floor(parsed['sayfa_sayisi'])
      : ageBand === '0-2'
        ? 8
        : 12;
  const themeCode = typeof parsed['tema_kodu'] === 'string' ? parsed['tema_kodu'] : 'cesaret';
  return { heroName: capitalizeTr(heroName), ageBand, pageCount, themeCode };
}

interface OutlineContext extends ParentContext {
  titleTr: string;
  scenes: Array<{ pageNo: number; summary: string }>;
}

function parseOutlineBlock(prompt: string): OutlineContext {
  const heroName = capitalizeTr(/Kahraman:\s*(.+)/u.exec(prompt)?.[1]?.trim() ?? 'Elif');
  const titleTr = /Başlık:\s*(.+)/u.exec(prompt)?.[1]?.trim() ?? `${possessive(heroName)} Masalı`;
  const scenes = [...prompt.matchAll(/^(\d+)\.\s+(.+?)\s*\[ton:/gmu)].map((match) => ({
    pageNo: Number.parseInt(match[1] ?? '1', 10),
    summary: (match[2] ?? '').trim(),
  }));
  const ageBand = bandFromRules(prompt);
  return {
    heroName,
    ageBand,
    pageCount: scenes.length,
    themeCode: 'cesaret',
    titleTr,
    scenes,
  };
}

interface RewriteContext {
  heroName: string;
  ageBand: Band;
  pageNo: number;
  summary: string;
}

function parseRewriteBlock(prompt: string): RewriteContext {
  const pageNo = Number.parseInt(/sayfa\s+(\d+)/iu.exec(prompt)?.[1] ?? '1', 10);
  const summary = /Sahne:\s*(.+)/u.exec(prompt)?.[1]?.trim() ?? 'Kahraman yeni bir adım atar.';
  // The hero's name is the capitalised word the scene summary starts with, when there is
  // one; otherwise fall back. Good enough for a double, and deterministic.
  const heroName = capitalizeTr(/^([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/u.exec(summary)?.[1] ?? 'Elif');
  return { heroName, ageBand: bandFromRules(prompt), pageNo, summary };
}

/** The band is recoverable from the system prompt's own header line. */
function bandFromRules(prompt: string): Band {
  if (prompt.includes('0-2 yaş')) return '0-2';
  if (prompt.includes('3-5 yaş')) return '3-5';
  return '6-8';
}

function asBand(value: unknown): Band {
  return value === '0-2' || value === '3-5' || value === '6-8' ? value : '6-8';
}

/* ── stage 1: outline ──────────────────────────────────────────────────────── */

const SCENE_BEATS_TR: readonly string[] = [
  'akşam olur, ev sessizleşir',
  'küçük bir merak uyanır',
  'ilk adım atılır, kalp hızlanır',
  'yeni bir arkadaşla karşılaşılır',
  'bir zorluk çıkar, pes etmek kolaydır',
  'bir kez daha denenir',
  'yardım istenir ve gelir',
  'birlikte bir yol bulunur',
  'küçük bir zafer yaşanır',
  'sevinç paylaşılır',
  'eve dönülür, içeride sıcaklık vardır',
  'gün kapanır, uyku gelir',
  'sabah yeniden hatırlanır',
  'anlatılan şey bir daha yaşanır',
  // Not "alışkanlık": the in-repo fake moderation adapter (core/fakes) matches its block
  // terms as SUBSTRINGS, so "alış-KAN-lık" trips its "kan" rule in mock mode. Our own
  // denylist matches whole words and stems precisely to avoid that class of false
  // positive (banlists.tr.ts), but this double has to live with the other double.
  'küçük bir düzen kurulur',
  'gece yeniden iner, herkes uyur',
];

const EMOTIONS: readonly string[] = [
  'sakin',
  'merak',
  'hafif_endise',
  'cozulme',
  'nese',
  'sicak_kapanis',
];

function buildOutline(context: ParentContext): unknown {
  const { heroName, pageCount, ageBand } = context;
  const scenes = Array.from({ length: pageCount }, (_, index) => {
    const beat = SCENE_BEATS_TR[Math.floor((index * SCENE_BEATS_TR.length) / pageCount)] ?? SCENE_BEATS_TR[0]!;
    return {
      sayfa_no: index + 1,
      sahne_ozeti: `${heroName} için ${beat}.`,
      duygusal_ton: emotionFor(index, pageCount),
    };
  });

  return {
    kitap_meta: {
      baslik:
        ageBand === '0-2'
          ? `${dative(heroName)} İyi Geceler`
          : `${possessive(heroName)} Küçük Cesareti`,
      ogrenilen_ders:
        ageBand === '0-2'
          ? 'Gün biter, herkes uyur; uyku güvenlidir.'
          : 'Korkmak ayıp değildir; korkuyla birlikte bir adım daha atmak cesarettir.',
      duygusal_yay: 'Tedirginlikten güvene.',
    },
    karakter_kanonu: [
      {
        rol: 'kahraman',
        ad: heroName,
        gorsel_tarif_en:
          'a small child with warm brown eyes, short dark wavy hair, a soft mustard jumper, ' +
          'blue trousers and red canvas shoes, gentle round face, calm expression',
      },
      {
        rol: 'hayvan',
        ad: 'Fındık',
        gorsel_tarif_en:
          'a small orange plush fox with one slightly bent ear, cream belly, stitched smile, ' +
          'worn velvet texture, always carried under the arm',
      },
    ],
    karakter_varyantlari: [
      {
        varyant_id: 'v1',
        ozet_tr: 'Saçları dalgalı, sarı kazaklı.',
        gorsel_tarif_en: 'wavy dark hair, mustard jumper, red shoes, soft daylight',
      },
      {
        varyant_id: 'v2',
        ozet_tr: 'Saçları toplu, yeşil tulumlu.',
        gorsel_tarif_en: 'hair in a bun, green dungarees, white shirt, soft daylight',
      },
      {
        varyant_id: 'v3',
        ozet_tr: 'Kısa saçlı, mavi montlu.',
        gorsel_tarif_en: 'short hair, blue quilted coat, striped scarf, soft daylight',
      },
    ],
    kapak_fikri: {
      ozet_tr: `${heroName} elinde küçük bir ışıkla, kapının önünde duruyor.`,
      gorsel_tarif_en:
        'the child standing in a doorway holding a small warm light, plush fox under the arm, ' +
        'soft watercolour, no text, no letters',
    },
    sayfalar: scenes,
  };
}

function emotionFor(index: number, total: number): string {
  if (index === total - 1) return 'sicak_kapanis';
  if (index === 0) return 'sakin';
  return EMOTIONS[index % EMOTIONS.length] ?? 'sakin';
}

/* ── stage 2: fill ─────────────────────────────────────────────────────────── */

/**
 * Sentence pools, written to satisfy the same rules the gate measures: short clauses, no
 * pronoun subjects, no "ve" chaining, no English idioms, concrete vocabulary.
 */
const OPENERS_TR: readonly string[] = [
  'Ev sessizdi.',
  'Pencereden ince bir ışık sızıyordu.',
  'Perdenin arkası karanlıktı.',
  'Sokak lambası usulca yanıyordu.',
  'Mutfakta çay kokusu vardı.',
  'Yorgan sıcacıktı.',
];

const MIDDLES_TR: readonly string[] = [
  'Ayaklarının altında tahta gıcırdadı.',
  'Kalbi hızlı hızlı atıyordu.',
  'Parmakları soğuk kapıya değdi.',
  'Yavaşça derin bir nefes aldı.',
  'Fındık kucağındaydı, kulağı hep kıvrık.',
  'Karanlıkta minik bir ışık titredi.',
  'Adımlarını saymaya başladı.',
  'Toz zerreleri ışıkta parladı.',
  'Koridorun sonundaki merdiven gümüş gibiydi.',
  'Yorganın ucunu iki eliyle tuttu.',
  'Dışarıda rüzgâr yaprakları savurdu.',
  'Duvardaki gölge yavaşça kısaldı.',
];

/** Used when a page still falls short of the band's minimum. Varied, so no line repeats. */
const PADDING_TR: readonly string[] = [
  'Yatağın yanındaki lamba usulca yanıyordu.',
  'Mutfaktan tarçın kokusu geliyordu.',
  'Pencerenin kenarında küçük bir saksı duruyordu.',
  'Halının üstünde tek bir oyuncak kalmıştı.',
  'Saat sessizce ilerledi.',
];

const FEELINGS_TR: readonly string[] = [
  'Korkuyordu, ama merakı biraz daha büyüktü.',
  'İçinden sıcak bir cesaret geçti.',
  'Bir an durdu, sonra devam etti.',
  'Yanağına ılık bir hava değdi.',
  'Gülümsedi, omuzları gevşedi.',
];

const CLOSERS_TR: readonly string[] = [
  'Sonra her şey yerli yerine oturdu.',
  'Odaya yeniden sessizlik indi.',
  'Işık usulca söndü.',
  'Yorganın altı sıcacıktı.',
];

const WARM_CLOSE_TR = 'İyi geceler.';

function buildFill(context: OutlineContext): unknown {
  const { heroName, ageBand, scenes } = context;
  const pages = scenes.map((scene, index) => {
    const isLast = index === scenes.length - 1;
    const metin =
      ageBand === '0-2'
        ? babyPage(heroName, index, isLast, scenes.length)
        : storyPage(heroName, ageBand, scene.summary, index, isLast);
    return { sayfa_no: scene.pageNo, metin, kelime_sayisi: countWords(metin) };
  });
  return { sayfalar: pages };
}

/** 0-2: one short sentence plus the refrain. The refrain IS the book. */
const BABY_SUBJECTS: readonly string[] = ['ay', 'kuşlar', 'kedi', 'kaşık', 'toplar', 'ayı', 'lamba'];
const BABY_ACTIONS: readonly string[] = [
  'yerine gitti',
  'yuvaya girdi',
  'minderine kıvrıldı',
  'sepete girdi',
  'yastığa yattı',
  'usulca durdu',
];

function babyPage(heroName: string, index: number, isLast: boolean, total = 8): string {
  if (isLast) return `İyi geceler ${heroName}. Yarın yine oynarız.`;
  // The child appears once more near the end, as the reference lullaby does: the band's
  // quality gate wants the name on a fifth of the pages, not on every page.
  if (index === total - 2) return `${heroName} esnedi. Uyku geldi. İyi geceler ${heroName}.`;
  const subject = BABY_SUBJECTS[index % BABY_SUBJECTS.length] ?? 'ay';
  const action = BABY_ACTIONS[index % BABY_ACTIONS.length] ?? 'yerine gitti';
  const opener = index === 0 ? 'Gökyüzü karardı. ' : '';
  return `${opener}${capitalizeTr(subject)} ${action}. İyi geceler ${subject}.`;
}

/** 3-5 and 6-8: sentences are added until the band's word window is satisfied. */
function storyPage(
  heroName: string,
  ageBand: Band,
  summary: string,
  index: number,
  isLast: boolean,
): string {
  const [minWords, maxWords] = ageBand === '3-5' ? [25, 45] : [40, 70];
  const pool = [
    `${heroName} ${summaryVerbPhrase(summary, index)}.`,
    pick(OPENERS_TR, index),
    pick(MIDDLES_TR, index),
    pick(MIDDLES_TR, index + 5),
    pick(MIDDLES_TR, index + 9),
    pick(FEELINGS_TR, index),
    `Yatağın yanındaki lamba ${accusative(heroName)} bekliyordu.`,
    isLast
      ? `${possessive(heroName)} yüzünde küçük bir gülümseme kaldı. ${WARM_CLOSE_TR}`
      : pick(CLOSERS_TR, index),
  ];

  const sentences: string[] = [];
  let words = 0;
  for (const sentence of pool) {
    const next = words + countWords(sentence);
    if (words >= minWords && next > maxWords) break;
    sentences.push(sentence);
    words = next;
    if (words >= maxWords) break;
  }

  // Still short: pad with DIFFERENT concrete lines. Repeating one line would technically
  // satisfy the word count and would read like a bug, which is not a useful double.
  for (let padIndex = 0; words < minWords && padIndex < PADDING_TR.length; padIndex += 1) {
    const extra = pick(PADDING_TR, index + padIndex);
    sentences.splice(Math.max(0, sentences.length - 1), 0, extra);
    words += countWords(extra);
  }

  return sentences.join(' ');
}

/** Turns "Elif için akşam olur, ev sessizleşir." into a clause with the hero as subject. */
function summaryVerbPhrase(summary: string, index: number): string {
  const cleaned = summary.replace(/^.*? için\s*/u, '').replace(/[.!?]+$/u, '');
  const first = cleaned.split(',')[0]?.trim() ?? 'bir adım attı';
  const rendered = first.length > 0 ? first : 'bir adım attı';
  return index % 2 === 0 ? `${rendered} diye düşündü` : `${rendered} sırasında durdu`;
}

/* ── single page rewrite ───────────────────────────────────────────────────── */

function buildRewrite(context: RewriteContext): unknown {
  const metin = storyPage(context.heroName, context.ageBand, context.summary, context.pageNo, false);
  return { sayfa_no: context.pageNo, metin, kelime_sayisi: countWords(metin) };
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

function pick<T>(pool: readonly T[], index: number): T {
  return pool[index % pool.length] as T;
}

function countWords(text: string): number {
  return (text.match(/[a-zA-ZçğıiöşüÇĞİÖŞÜ0-9]+(?:['’][a-zA-ZçğıiöşüÇĞİÖŞÜ]+)?/gu) ?? []).length;
}

function estimateTokens(text: string): number {
  // Turkish runs ~3 characters per token; close enough for a double's accounting.
  return Math.max(1, Math.ceil(text.length / 3));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stable id so two identical prompts produce two identical stories. */
export function mockStoryFingerprint(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}
