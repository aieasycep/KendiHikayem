/**
 * tts/alignment.ts — ⭐ the karaoke timeline.
 *
 * `PlayerManifest.tokens` is what makes a word light up under a child's finger while the
 * parent's own voice reads it. The mobile engine (`features/player/karaoke.ts`) does binary
 * search over these tokens on every animation frame, so the shape below is a hard contract:
 * `s`/`e` are milliseconds FROM THE START OF THE AUDIO FILE, and `charStart`/`charEnd` index
 * the PAGE TEXT the reader is displaying.
 *
 * Three sources, in descending order of truth (contract `alignment.source`):
 *
 *   provider          — the TTS vendor returned character timings. Free and exact.
 *   forced_alignment  — an ASR aligner timed our text against the audio.
 *   sentence_estimate — no timings anywhere: distribute the duration by syllable weight.
 *                       Word highlighting is switched OFF client-side and sentence-level
 *                       highlighting is used instead, which is why the estimate never has
 *                       to be perfect — it has to be honest about its granularity.
 */

import type { PlayerToken } from '@kendihikayem/contract';

import type { WordTiming } from '../core/adapters';
import type { ElevenAlignment } from './elevenlabs/wire';
import { sentenceSpans, spokenWeight, tokenizeWithSpans } from './text/turkish';

/**
 * Character timings → word timings.
 *
 * ⚠️ TURKISH. The vendor hands back one entry per character, and where a word ends is our
 * problem. Turkish attaches suffixes to proper nouns across an apostrophe — Elif'in,
 * Ankara'ya — and a naive "split on non-letters" makes "Elif" and "in" two words, so the
 * child's own name blinks twice in the middle of the sentence. `tokenizeWithSpans` keeps
 * apostrophe-suffixed forms whole, and the timing of such a token spans both halves.
 */
export function wordTimingsFromCharacters(
  alignment: ElevenAlignment,
  offsetMs = 0,
): WordTiming[] {
  const text = alignment.characters.join('');
  const spans = tokenizeWithSpans(text);
  const timings: WordTiming[] = [];

  for (const span of spans) {
    const startSeconds = alignment.character_start_times_seconds[span.charStart];
    // The end time of the LAST character, not the start of the next one: trailing
    // punctuation and spaces carry their own timing and would pad every word.
    const endSeconds = alignment.character_end_times_seconds[span.charEnd - 1];
    if (startSeconds === undefined || endSeconds === undefined) continue;

    timings.push({
      word: span.text,
      startMs: Math.round(startSeconds * 1000) + offsetMs,
      endMs: Math.round(endSeconds * 1000) + offsetMs,
      confidence: 1,
    });
  }

  return timings;
}

/**
 * Distributes a known duration over words by syllable weight.
 *
 * Turkish is syllable-timed and one vowel is one syllable, so this estimate is far better
 * than the character-proportional one an English-first implementation would reach for:
 * "gördüklerimizden" is 16 characters but 6 syllables, "stres" is 5 characters and 1.
 * Character-proportional timing stretches the first and clips the second, and by the end of
 * a page the highlight is visibly ahead of the voice.
 *
 * Sentence-final punctuation gets a share of the time too — a reader pauses at a full stop,
 * and without that the last word of every sentence appears to run long.
 */
export function estimateWordTimings(
  text: string,
  durationMs: number,
  options: { offsetMs?: number; sentencePauseMs?: number } = {},
): WordTiming[] {
  const offsetMs = options.offsetMs ?? 0;
  const sentencePauseMs = options.sentencePauseMs ?? 320;
  const spans = tokenizeWithSpans(text);
  if (spans.length === 0 || durationMs <= 0) return [];

  const sentences = sentenceSpans(text);
  const sentenceEnds = new Set(sentences.map((sentence) => sentence.charEnd));

  const weights = spans.map((span) => spokenWeight(span.text));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const pauseCount = spans.filter((span) => endsSentence(span.charEnd, sentenceEnds)).length;
  const pauseBudget = Math.min(durationMs * 0.25, pauseCount * sentencePauseMs);
  const speechBudget = Math.max(1, durationMs - pauseBudget);

  const timings: WordTiming[] = [];
  let cursor = offsetMs;
  for (const [index, span] of spans.entries()) {
    const share = (weights[index]! / totalWeight) * speechBudget;
    const startMs = Math.round(cursor);
    const endMs = Math.round(cursor + share);
    timings.push({ word: span.text, startMs, endMs, confidence: 0.4 });
    cursor = endMs;
    if (endsSentence(span.charEnd, sentenceEnds) && pauseCount > 0) {
      cursor += pauseBudget / pauseCount;
    }
  }

  return timings;
}

function endsSentence(charEnd: number, sentenceEnds: ReadonlySet<number>): boolean {
  // A sentence span ends at its last non-space character; the word before the full stop
  // therefore ends 0–2 characters earlier depending on the punctuation that follows it.
  return sentenceEnds.has(charEnd) || sentenceEnds.has(charEnd + 1) || sentenceEnds.has(charEnd + 2);
}

/* ── Manifest projection ───────────────────────────────────────────────────── */

export interface PageTokenization {
  tokens: PlayerToken[];
  sentences: Array<{
    i: number;
    charStart: number;
    charEnd: number;
    startMs: number;
    endMs: number;
  }>;
}

/**
 * Projects word timings onto ONE page's text, producing the `PlayerPage` arrays.
 *
 * Timings are matched to the page's own tokens positionally rather than by string equality.
 * The vendor may normalise what it read ("3." → "üçüncü"), and a text comparison would drop
 * the timing for exactly the words most likely to be normalised. Position is stable as long
 * as the same text was sent for synthesis, which the chunker guarantees.
 */
export function tokenizePage(
  pageText: string,
  timings: readonly WordTiming[],
  options: { indexOffset?: number } = {},
): PageTokenization {
  const spans = tokenizeWithSpans(pageText);
  const sentences = sentenceSpans(pageText);
  const indexOffset = options.indexOffset ?? 0;

  const tokens: PlayerToken[] = spans.map((span, index) => {
    const timing = timings[index];
    const sentenceEnd = sentences.some(
      (sentence) => span.charEnd >= sentence.charEnd - 2 && span.charEnd <= sentence.charEnd,
    );
    return {
      i: indexOffset + index,
      t: span.text,
      charStart: span.charStart,
      charEnd: span.charEnd,
      s: timing?.startMs ?? 0,
      e: timing?.endMs ?? 0,
      isSentenceEnd: sentenceEnd,
    };
  });

  const sentenceRanges = sentences.map((sentence) => {
    const inside = tokens.filter(
      (token) => token.charStart >= sentence.charStart && token.charEnd <= sentence.charEnd,
    );
    const first = inside[0];
    const last = inside[inside.length - 1];
    return {
      i: sentence.index,
      charStart: sentence.charStart,
      charEnd: sentence.charEnd,
      // A sentence with no timed words (punctuation only) gets a zero-length range, and the
      // mobile engine skips those explicitly rather than highlighting nothing forever.
      startMs: first?.s ?? 0,
      endMs: last?.e ?? first?.s ?? 0,
    };
  });

  return { tokens, sentences: sentenceRanges };
}

/**
 * Enforces monotonicity across a whole rendition.
 *
 * Chunks are synthesised independently and then concatenated with a silence gap, so the
 * seam between two chunks is the one place a vendor rounding error can put word N+1 before
 * word N. The karaoke engine binary-searches these timings and assumes they ascend; one
 * inverted pair sends the highlight backwards mid-sentence.
 */
export function enforceMonotonic(tokens: PlayerToken[]): PlayerToken[] {
  let previousEnd = 0;
  for (const token of tokens) {
    if (token.s < previousEnd) token.s = previousEnd;
    if (token.e < token.s) token.e = token.s;
    previousEnd = token.e;
  }
  return tokens;
}
