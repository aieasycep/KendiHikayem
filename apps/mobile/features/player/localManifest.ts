/**
 * features/player/localManifest.ts — sesi olmayan hikaye için SESSİZ okuma manifesti.
 *
 * "Ses opsiyonel" (SPEC §11.0): hikayenin hiç seslendirmesi yoksa bile Dinle/Oku
 * deneyimi çalışır — kelime vurgusu doğal okuma temposunda sanal saatle akar,
 * sayfalar kendiliğinden döner, uyku modu kararır. Zamanlama, mock ile aynı
 * sezgiyle üretilir: Türkçede hece sayısı ≈ sesli harf sayısı.
 *
 * Bu manifest CİHAZDA üretilir: ağ yok, maliyet yok.
 */

import type { PlayerManifest, PlayerPage, PlayerToken, Story } from '@kendihikayem/contract';

const MS_PER_SYLLABLE = 210; // sesli okumadan birazcık yavaş — ebeveyn kendi okuyor olabilir
const MS_WORD_GAP = 60;
const MS_SENTENCE_PAUSE = 380;
const MS_PAGE_PAUSE = 1_000;

const TURKISH_VOWELS = /[aeıioöuüâîû]/g;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const SENTENCE_PATTERN = /[^.!?…]+[.!?…]*/g;

function syllableCount(word: string): number {
  const matches = word.toLocaleLowerCase('tr-TR').match(TURKISH_VOWELS);
  return Math.max(1, matches?.length ?? 1);
}

function buildPage(pageNo: number, text: string, image: PlayerPage['image'], startMs: number): PlayerPage {
  const sentences: PlayerPage['sentences'] = [];
  for (const match of text.matchAll(SENTENCE_PATTERN)) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (value.length === 0) continue;
    sentences.push({
      i: sentences.length,
      charStart: (match.index ?? 0) + lead,
      charEnd: (match.index ?? 0) + lead + value.length,
      startMs: 0,
      endMs: 0,
    });
  }

  const tokens: PlayerToken[] = [];
  let cursor = startMs;
  const words = [...text.matchAll(WORD_PATTERN)];
  words.forEach((match, index) => {
    const value = match[0];
    const charStart = match.index ?? 0;
    const duration = syllableCount(value) * MS_PER_SYLLABLE;
    const sentence = sentences.find((s) => charStart >= s.charStart && charStart < s.charEnd);
    const next = words[index + 1];
    const isSentenceEnd =
      sentence !== undefined && (next === undefined || (next.index ?? 0) >= sentence.charEnd);
    tokens.push({
      i: index,
      t: value,
      charStart,
      charEnd: charStart + value.length,
      s: cursor,
      e: cursor + duration,
      isSentenceEnd,
    });
    cursor += duration + MS_WORD_GAP;
    if (isSentenceEnd) cursor += MS_SENTENCE_PAUSE;
  });

  for (const sentence of sentences) {
    const inside = tokens.filter(
      (t) => t.charStart >= sentence.charStart && t.charStart < sentence.charEnd,
    );
    sentence.startMs = inside[0]?.s ?? startMs;
    sentence.endMs = inside[inside.length - 1]?.e ?? startMs;
  }

  return { pageNo, image, textTr: text, startMs, endMs: cursor, sentences, tokens };
}

/** Metni hazır sayfalardan sessiz okuma manifesti üretir. */
export function buildSilentManifest(story: Story): PlayerManifest | undefined {
  const readyPages = story.pages.filter(
    (page) => page.textTr !== undefined && page.textTr.length > 0,
  );
  if (readyPages.length === 0) return undefined;

  const pages: PlayerPage[] = [];
  let cursor = 0;
  for (const page of readyPages) {
    const image =
      page.image ??
      ({
        url: 'https://local.invalid/yok.webp',
        mimeType: 'image/webp',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      } as PlayerPage['image']);
    const built = buildPage(page.pageNo, page.textTr ?? '', image, cursor);
    pages.push(built);
    cursor = built.endMs + MS_PAGE_PAUSE;
  }
  const last = pages[pages.length - 1];
  if (last === undefined) return undefined;

  return {
    storyId: story.id,
    renditionId: story.id as unknown as PlayerManifest['renditionId'],
    titleTr: story.title ?? `${story.heroName} masalı`,
    voice: { kind: 'system', label: 'Sessiz okuma' } as PlayerManifest['voice'],
    audio: {
      url: 'https://local.invalid/sessiz.m4a',
      mimeType: 'audio/mp4',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    } as PlayerManifest['audio'],
    totalDurationMs: last.endMs,
    alignment: { source: 'sentence_estimate', granularity: 'word' },
    typography: { fontFamily: 'Andika', sizePt: 20, lineHeight: 1.5 },
    bedtimeMode: {
      enabled: true,
      fadeStartsAtPage: Math.max(1, pages.length - 2),
      targetEndVolume: 0.35,
    },
    wordHighlightDefault: story.ageBand !== '3-5',
    pages,
  } as PlayerManifest;
}
