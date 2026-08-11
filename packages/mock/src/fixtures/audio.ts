/**
 * audio.ts — seslendirmeler ve okuyucu manifesti.
 *
 * Kelime zaman damgaları ELLE yazılmaz; metinden DETERMİNİSTİK olarak hesaplanır.
 * Türkçede hece sayısı ≈ sesli harf sayısıdır; süre bunun üzerinden kurulur.
 * Sonuç, gerçek hizalamanın istatistiksel dokusuna yakın veri üretir: karaoke
 * vurgusunun ritmi mock'ta da inandırıcı görünür ve her çalıştırmada aynıdır.
 */

import {
  audioRenditionSummarySchema,
  playerManifestSchema,
  publicPageAudioSchema,
  type AudioRenditionSummary,
  type PlayerManifest,
  type PlayerPage,
  type PlayerToken,
  type PublicPageAudio,
} from '@kendihikayem/contract';

import { IDS, } from './ids';
import { mockAudio, mockImage } from './media';
import { SAMPLE_STORY, SAMPLE_STORY_PAGES } from './story-text';

/* ── Zamanlama modeli ────────────────────────────────────────── */

const MS_PER_SYLLABLE = 190;
const MS_WORD_GAP = 55;
const MS_SENTENCE_PAUSE = 340;
const MS_PAGE_PAUSE = 800;

const TURKISH_VOWELS = /[aeıioöuüâîû]/g;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const SENTENCE_PATTERN = /[^.!?…]+[.!?…]*/g;

function syllableCount(word: string): number {
  const matches = word.toLocaleLowerCase('tr-TR').match(TURKISH_VOWELS);
  return Math.max(1, matches?.length ?? 1);
}

interface SentenceRange {
  i: number;
  charStart: number;
  charEnd: number;
}

function sentenceRanges(text: string): SentenceRange[] {
  const ranges: SentenceRange[] = [];
  for (const match of text.matchAll(SENTENCE_PATTERN)) {
    const raw = match[0];
    const trimmedStart = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (value.length === 0) continue;
    ranges.push({
      i: ranges.length,
      charStart: (match.index ?? 0) + trimmedStart,
      charEnd: (match.index ?? 0) + trimmedStart + value.length,
    });
  }
  return ranges;
}

/** Bir sayfanın token'larını ve cümle aralıklarını üretir; bitiş zamanını döndürür. */
function buildPage(pageNo: number, text: string, startMs: number): PlayerPage {
  const sentences = sentenceRanges(text);
  const tokens: PlayerToken[] = [];
  let cursor = startMs;

  const wordMatches = [...text.matchAll(WORD_PATTERN)];
  wordMatches.forEach((match, index) => {
    const value = match[0];
    const charStart = match.index ?? 0;
    const charEnd = charStart + value.length;
    const duration = syllableCount(value) * MS_PER_SYLLABLE;
    const sentence = sentences.find((s) => charStart >= s.charStart && charStart < s.charEnd);
    const nextMatch = wordMatches[index + 1];
    const isSentenceEnd =
      sentence !== undefined &&
      (nextMatch === undefined || (nextMatch.index ?? 0) >= sentence.charEnd);

    tokens.push({
      i: index,
      t: value,
      charStart,
      charEnd,
      s: cursor,
      e: cursor + duration,
      isSentenceEnd,
    });

    cursor += duration + MS_WORD_GAP;
    if (isSentenceEnd) cursor += MS_SENTENCE_PAUSE;
  });

  const sentenceTimings = sentences.map((sentence) => {
    const inside = tokens.filter(
      (token) => token.charStart >= sentence.charStart && token.charStart < sentence.charEnd,
    );
    return {
      i: sentence.i,
      charStart: sentence.charStart,
      charEnd: sentence.charEnd,
      startMs: inside[0]?.s ?? startMs,
      endMs: inside[inside.length - 1]?.e ?? startMs,
    };
  });

  return {
    pageNo,
    image: mockImage(`story/elif/sayfa-${pageNo}`, 2048, 2048),
    textTr: text,
    startMs,
    endMs: cursor,
    sentences: sentenceTimings,
    tokens,
  };
}

function buildPages(): PlayerPage[] {
  const pages: PlayerPage[] = [];
  let cursor = 0;
  for (const page of SAMPLE_STORY_PAGES) {
    const built = buildPage(page.pageNo, page.textTr, cursor);
    pages.push(built);
    cursor = built.endMs + MS_PAGE_PAUSE;
  }
  return pages;
}

const PLAYER_PAGES = buildPages();
export const SAMPLE_STORY_DURATION_MS = PLAYER_PAGES[PLAYER_PAGES.length - 1]!.endMs;

/* ── Seslendirmeler ──────────────────────────────────────────── */

export const RENDITIONS: AudioRenditionSummary[] = [
  {
    id: IDS.renditionAnne,
    voiceKind: 'cloned',
    voiceLabel: 'Anne',
    voiceProfileId: IDS.voiceAnne,
    status: 'succeeded',
    durationMs: SAMPLE_STORY_DURATION_MS,
    tier: 'quality',
    alignment: { source: 'provider', granularity: 'word' },
    isDefault: true,
    createdAt: '2026-08-04T21:20:00Z',
  },
  {
    id: IDS.renditionSistem,
    voiceKind: 'system',
    voiceLabel: 'Sistem sesi — Deniz',
    status: 'succeeded',
    durationMs: SAMPLE_STORY_DURATION_MS + 4_200,
    tier: 'quality',
    alignment: { source: 'forced_alignment', granularity: 'word' },
    isDefault: false,
    createdAt: '2026-08-04T20:59:00Z',
  },
].map((rendition) => audioRenditionSummarySchema.parse(rendition));

export function buildPlayerManifest(renditionId: string): PlayerManifest {
  const rendition = RENDITIONS.find((item) => item.id === renditionId) ?? RENDITIONS[0]!;
  return playerManifestSchema.parse({
    storyId: IDS.storyElifIsik,
    renditionId: rendition.id,
    titleTr: SAMPLE_STORY.titleTr,
    voice: {
      kind: rendition.voiceKind,
      label: rendition.voiceLabel,
      profileId: rendition.voiceProfileId,
    },
    audio: mockAudio(
      `story/elif/${rendition.voiceKind === 'cloned' ? 'anne' : 'sistem'}`,
      rendition.durationMs ?? SAMPLE_STORY_DURATION_MS,
    ),
    totalDurationMs: rendition.durationMs ?? SAMPLE_STORY_DURATION_MS,
    alignment: rendition.alignment,
    typography: { fontFamily: 'Andika', sizePt: 20, lineHeight: 1.5 },
    bedtimeMode: { enabled: true, fadeStartsAtPage: 10, targetEndVolume: 0.35 },
    wordHighlightDefault: true,
    resume: { pageNo: 3, positionMs: PLAYER_PAGES[2]!.startMs + 1_200 },
    pages: PLAYER_PAGES,
  });
}

export const PLAYER_MANIFEST: PlayerManifest = buildPlayerManifest(IDS.renditionAnne);

/** Basılı kitaptaki QR'ın açtığı sayfa (oturumsuz). */
export const PUBLIC_PAGE_AUDIO: PublicPageAudio = publicPageAudioSchema.parse({
  storyTitleTr: SAMPLE_STORY.titleTr,
  pageNo: 6,
  textTr: SAMPLE_STORY_PAGES[5]!.textTr,
  voiceLabel: 'Anne',
  audio: mockAudio('story/elif/anne-sayfa-6', PLAYER_PAGES[5]!.endMs - PLAYER_PAGES[5]!.startMs),
  image: mockImage('story/elif/sayfa-6', 2048, 2048),
  tokens: PLAYER_PAGES[5]!.tokens.map((token) => ({
    ...token,
    s: token.s - PLAYER_PAGES[5]!.startMs,
    e: token.e - PLAYER_PAGES[5]!.startMs,
  })),
  brandingUrl: 'https://kendihikayem.com/qr',
});
