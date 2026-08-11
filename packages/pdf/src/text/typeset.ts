/**
 * text/typeset.ts — line breaking, measured in the same engine that prints.
 *
 * The layout stage produces FINISHED lines: every line already knows its text, its width
 * and its baseline. Two things depend on that:
 *
 *   · the preflight can check "is the text inside the safe zone" geometrically, on the real
 *     line boxes, instead of guessing from the paragraph;
 *   · the renderer becomes dumb — it draws what it is given and cannot re-wrap differently.
 *
 * Breaking is greedy with Turkish hyphenation as the fallback, then a hard cut as the last
 * resort (a single word longer than the column, e.g. a very long compound name).
 */

import type { LoadedFont } from '../fonts/registry';
import { HYPHEN, hyphenationPoints, normalizeTypographyTr } from './turkish';

export type TextAlign = 'left' | 'center' | 'right';

export interface TypesetStyle {
  font: LoadedFont;
  sizePt: number;
  /** Baseline-to-baseline distance. SPEC §9: punto + 4–6 pt for early readers. */
  leadingPt: number;
  align?: TextAlign;
  /** Turkish hyphenation on narrow columns; off for titles. */
  hyphenate?: boolean;
  /** Extra space between paragraphs, in points. */
  paragraphSpacingPt?: number;
}

export interface TypesetLine {
  text: string;
  widthPt: number;
  /** Index of the paragraph this line came from — the renderer adds paragraph spacing. */
  paragraph: number;
  /** True when the line ends with a hyphen we inserted. */
  hyphenated: boolean;
}

export interface TypesetResult {
  lines: TypesetLine[];
  /** Width of the longest line. */
  widthPt: number;
  /** Total block height: lines × leading + paragraph spacing. */
  heightPt: number;
  sizePt: number;
  leadingPt: number;
  /** True when a word had to be cut mid-syllable — a warning-worthy layout. */
  hardBroken: boolean;
}

const SPACE = ' ';

function splitParagraphs(text: string): string[] {
  return normalizeTypographyTr(text)
    .split(/\n{1,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Longest hyphenated prefix of `word` that still fits in `available`. */
function breakWord(
  word: string,
  available: number,
  style: TypesetStyle,
): { head: string; tail: string } | undefined {
  if (style.hyphenate === false) return undefined;
  const points = hyphenationPoints(word);
  const letters = [...word];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i] ?? 0;
    const head = `${letters.slice(0, point).join('')}${HYPHEN}`;
    if (style.font.widthOf(head, style.sizePt) <= available) {
      return { head, tail: letters.slice(point).join('') };
    }
  }
  return undefined;
}

/** Cuts a word that fits nowhere. Never pretty, but better than spilling off the page. */
function hardBreak(
  word: string,
  available: number,
  style: TypesetStyle,
): { head: string; tail: string } {
  const letters = [...word];
  let count = 1;
  while (
    count < letters.length &&
    style.font.widthOf(`${letters.slice(0, count + 1).join('')}${HYPHEN}`, style.sizePt) <=
      available
  ) {
    count += 1;
  }
  return {
    head: `${letters.slice(0, count).join('')}${HYPHEN}`,
    tail: letters.slice(count).join(''),
  };
}

/** Breaks `text` into lines that fit `widthPt`. */
export function typeset(text: string, widthPt: number, style: TypesetStyle): TypesetResult {
  const lines: TypesetLine[] = [];
  let hardBroken = false;

  splitParagraphs(text).forEach((paragraph, paragraphIndex) => {
    const queue = paragraph.split(/\s+/).filter((word) => word.length > 0);
    let current = '';

    const flush = (hyphenated = false): void => {
      if (current === '') return;
      lines.push({
        text: current,
        widthPt: style.font.widthOf(current, style.sizePt),
        paragraph: paragraphIndex,
        hyphenated,
      });
      current = '';
    };

    while (queue.length > 0) {
      const word = queue.shift() as string;
      const candidate = current === '' ? word : `${current}${SPACE}${word}`;
      if (style.font.widthOf(candidate, style.sizePt) <= widthPt) {
        current = candidate;
        continue;
      }

      // Does not fit. Try to hyphenate into the remaining space on this line.
      const prefixWidth =
        current === '' ? 0 : style.font.widthOf(`${current}${SPACE}`, style.sizePt);
      const available = widthPt - prefixWidth;
      const split = breakWord(word, available, style);
      if (split) {
        current = current === '' ? split.head : `${current}${SPACE}${split.head}`;
        flush(true);
        queue.unshift(split.tail);
        continue;
      }

      if (current !== '') {
        // Start a fresh line and retry the whole word there.
        flush();
        queue.unshift(word);
        continue;
      }

      // Empty line and the word still does not fit: cut it.
      const cut = hardBreak(word, widthPt, style);
      hardBroken = true;
      current = cut.head;
      flush(true);
      queue.unshift(cut.tail);
    }
    flush();
  });

  const paragraphSpacing = style.paragraphSpacingPt ?? 0;
  const paragraphBreaks =
    lines.length === 0
      ? 0
      : lines.reduce(
          (count, line, index) =>
            index > 0 && line.paragraph !== lines[index - 1]?.paragraph ? count + 1 : count,
          0,
        );

  return {
    lines,
    widthPt: lines.reduce((max, line) => Math.max(max, line.widthPt), 0),
    heightPt: lines.length * style.leadingPt + paragraphBreaks * paragraphSpacing,
    sizePt: style.sizePt,
    leadingPt: style.leadingPt,
    hardBroken,
  };
}

export interface FitOptions {
  /** Never shrink below this — legibility for the age band beats fitting (SPEC §9). */
  minSizePt: number;
  stepPt?: number;
  /** Keeps leading proportional to the size while shrinking. */
  leadingRatio?: number;
  maxLines?: number;
}

export interface FitResult extends TypesetResult {
  /** True when even `minSizePt` did not fit — the caller must warn, not silently clip. */
  overflow: boolean;
}

/**
 * Shrink-to-fit. Story pages differ in length by a factor of three; a fixed size either
 * wastes half the page or runs off it. The size floor is the age band's legibility floor,
 * and when the text still does not fit we say so (`overflow`) rather than clipping.
 */
export function typesetToFit(
  text: string,
  box: { widthPt: number; heightPt: number },
  style: TypesetStyle,
  options: FitOptions,
): FitResult {
  const step = options.stepPt ?? 0.5;
  const leadingRatio = options.leadingRatio ?? style.leadingPt / style.sizePt;

  let sizePt = style.sizePt;
  let result = typeset(text, box.widthPt, style);

  while (
    (result.heightPt > box.heightPt ||
      (options.maxLines !== undefined && result.lines.length > options.maxLines)) &&
    sizePt - step >= options.minSizePt
  ) {
    sizePt = Math.round((sizePt - step) * 100) / 100;
    result = typeset(text, box.widthPt, {
      ...style,
      sizePt,
      leadingPt: Math.round(sizePt * leadingRatio * 100) / 100,
    });
  }

  const overflow =
    result.heightPt > box.heightPt ||
    (options.maxLines !== undefined && result.lines.length > options.maxLines);
  return { ...result, overflow };
}
