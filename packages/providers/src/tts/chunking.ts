/**
 * tts/chunking.ts — where the narration is cut, and why it matters twice.
 *
 * 1. PROSODY (SPEC §7 step 10). A chunk boundary is a place where the vendor restarts its
 *    intonation. Cutting mid-sentence produces an audible stumble in the middle of a line
 *    a child is following with their finger, so boundaries land on page and paragraph
 *    edges, and — only if a single paragraph is too long — on sentence ends. NEVER inside
 *    a sentence.
 *
 * 2. MONEY (SPEC §6.2 rule 4). The chunk is the unit of `content_cache`. When a parent
 *    edits page 3 of a twelve-page book, only the chunks whose text changed have a new
 *    hash; the other eleven resolve from cache at zero cost. Smaller chunks mean a cheaper
 *    edit — which is why the cap is set below the vendor's own limit rather than at it.
 *
 * The two pressures point in opposite directions (fewer boundaries = better prosody, more
 * boundaries = cheaper edits), and page boundaries are where they agree: the reader already
 * pauses there, and it is the granularity at which a parent edits.
 */

import { sentenceSpans } from './text/turkish';

export interface ChunkSourcePage {
  pageNo: number;
  textTr: string;
}

export interface TextChunk {
  index: number;
  /** The page this chunk belongs to. Drives `audio_page_marks` and progressive playback. */
  pageNo: number;
  text: string;
  /** Offsets into that page's text, so word timings can be projected back onto the page. */
  charStart: number;
  charEnd: number;
  /** Tail of the previous chunk — sent as `previous_text` for prosody continuity. */
  previousText?: string;
  /** Head of the next chunk — sent as `next_text`. */
  nextText?: string;
}

export interface ChunkOptions {
  maxChars: number;
  /** How much neighbouring text to send as prosody context. */
  contextChars?: number;
}

/**
 * Splits a story into synthesis chunks.
 *
 * A page normally becomes exactly one chunk: a 6–8 age band page is ~60 words, far inside
 * any vendor limit, and one-page-one-chunk makes the cache key line up with the thing a
 * parent edits. Only an unusually long page is split further, and then only at sentence
 * ends.
 */
export function chunkStory(pages: readonly ChunkSourcePage[], options: ChunkOptions): TextChunk[] {
  const contextChars = options.contextChars ?? 200;
  const chunks: TextChunk[] = [];

  for (const page of pages) {
    const text = page.textTr.trim();
    if (text.length === 0) continue;

    for (const piece of splitPage(text, options.maxChars)) {
      chunks.push({
        index: chunks.length,
        pageNo: page.pageNo,
        text: piece.text,
        charStart: piece.charStart,
        charEnd: piece.charEnd,
      });
    }
  }

  // Context is attached after the fact so it never affects the split decision itself.
  for (const [index, chunk] of chunks.entries()) {
    const previous = chunks[index - 1];
    const next = chunks[index + 1];
    if (previous) chunk.previousText = tail(previous.text, contextChars);
    if (next) chunk.nextText = head(next.text, contextChars);
  }

  return chunks;
}

function splitPage(
  text: string,
  maxChars: number,
): Array<{ text: string; charStart: number; charEnd: number }> {
  if (text.length <= maxChars) return [{ text, charStart: 0, charEnd: text.length }];

  // Paragraphs first: a blank line is an author's own pause.
  const paragraphs = splitByBlankLines(text);
  const pieces: Array<{ text: string; charStart: number; charEnd: number }> = [];

  for (const paragraph of paragraphs) {
    if (paragraph.text.length <= maxChars) {
      pieces.push(paragraph);
      continue;
    }
    // Still too long: fall back to sentence boundaries. A sentence longer than the cap on
    // its own is emitted whole — an audible stumble mid-sentence is worse than a long
    // request, and the vendor's real limit is far above this cap anyway.
    let current: { text: string; charStart: number; charEnd: number } | undefined;
    for (const sentence of sentenceSpans(paragraph.text)) {
      const absoluteStart = paragraph.charStart + sentence.charStart;
      const absoluteEnd = paragraph.charStart + sentence.charEnd;
      if (current && current.text.length + sentence.text.length + 1 <= maxChars) {
        current.text = `${current.text} ${sentence.text}`;
        current.charEnd = absoluteEnd;
      } else {
        if (current) pieces.push(current);
        current = { text: sentence.text, charStart: absoluteStart, charEnd: absoluteEnd };
      }
    }
    if (current) pieces.push(current);
  }

  return pieces.length > 0 ? pieces : [{ text, charStart: 0, charEnd: text.length }];
}

function splitByBlankLines(
  text: string,
): Array<{ text: string; charStart: number; charEnd: number }> {
  const out: Array<{ text: string; charStart: number; charEnd: number }> = [];
  const pattern = /\n\s*\n/gu;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const end = match.index ?? 0;
    const piece = text.slice(cursor, end).trim();
    if (piece.length > 0) {
      const offset = text.indexOf(piece, cursor);
      out.push({ text: piece, charStart: offset, charEnd: offset + piece.length });
    }
    cursor = end + match[0].length;
  }
  const rest = text.slice(cursor).trim();
  if (rest.length > 0) {
    const offset = text.indexOf(rest, cursor);
    out.push({ text: rest, charStart: offset, charEnd: offset + rest.length });
  }
  return out;
}

function tail(text: string, count: number): string {
  return text.length <= count ? text : text.slice(text.length - count);
}

function head(text: string, count: number): string {
  return text.length <= count ? text : text.slice(0, count);
}

/**
 * The per-chunk cache identity: the text, the voice, the tier and the model.
 *
 * The model belongs in the key and its absence would be a quiet betrayal — swap the TTS
 * model and every parent would keep hearing narration produced by a model they are no
 * longer paying for, forever, because the cache would keep answering.
 */
export function chunkCacheParams(input: {
  tier: string;
  providerVoiceId: string;
  model: string;
  outputFormat: string;
}): Record<string, string> {
  return {
    tier: input.tier,
    voice: input.providerVoiceId,
    model: input.model,
    format: input.outputFormat,
  };
}
