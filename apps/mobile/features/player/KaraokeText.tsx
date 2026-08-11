/**
 * KaraokeText — sayfa metnini kelime vurgusuyla basar.
 *
 * Renk düzeni (gece paleti):
 *   okunmuş  → ink (sıcak kırık beyaz)
 *   AKTİF    → highlight (kehribar) + kalın
 *   gelecek  → textDim (soluk)
 * Vurgu kapalıyken tüm metin ink. Cümle granülaritesinde aktif cümle ink,
 * diğerleri soluk.
 *
 * Segmentler sayfa başına BİR KEZ hesaplanır (memo); her kelime değişiminde
 * yalnızca renkler değişir.
 */

import { Text as RNText, type TextStyle } from 'react-native';
import { useMemo, type ReactElement } from 'react';

import type { PlayerPage } from '@kendihikayem/contract';
import { readerTextStyle, useTheme } from '@kendihikayem/ui';

interface Segment {
  text: string;
  /** null → kelimeler arası boşluk/noktalama. */
  tokenIndex: number | null;
  sentenceIndex: number | null;
}

function buildSegments(page: PlayerPage): Segment[] {
  const text = page.textTr;
  const segments: Segment[] = [];
  let cursor = 0;

  const sentenceOf = (charStart: number): number | null => {
    for (const sentence of page.sentences) {
      if (charStart >= sentence.charStart && charStart < sentence.charEnd) return sentence.i;
    }
    return null;
  };

  for (const token of page.tokens) {
    if (token.charStart > cursor) {
      const gap = text.slice(cursor, token.charStart);
      segments.push({ text: gap, tokenIndex: null, sentenceIndex: sentenceOf(cursor) });
    }
    segments.push({
      text: text.slice(token.charStart, token.charEnd),
      tokenIndex: token.i,
      sentenceIndex: sentenceOf(token.charStart),
    });
    cursor = token.charEnd;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), tokenIndex: null, sentenceIndex: sentenceOf(cursor) });
  }
  if (segments.length === 0) segments.push({ text, tokenIndex: null, sentenceIndex: null });
  return segments;
}

export interface KaraokeTextProps {
  page: PlayerPage;
  /** -1 = vurgu yok. */
  activeTokenIndex: number;
  activeSentenceIndex: number;
  highlightEnabled: boolean;
  typography: { fontFamily: string; sizePt: number; lineHeight: number };
}

export function KaraokeText({
  page,
  activeTokenIndex,
  activeSentenceIndex,
  highlightEnabled,
  typography,
}: KaraokeTextProps): ReactElement {
  const { colors } = useTheme();
  const segments = useMemo(() => buildSegments(page), [page]);
  const baseStyle = useMemo<TextStyle>(() => readerTextStyle(typography), [typography]);

  const wordMode = highlightEnabled && page.tokens.length > 0;
  const sentenceMode = highlightEnabled && !wordMode && page.sentences.length > 0;

  const colorFor = (segment: Segment): TextStyle => {
    if (wordMode && segment.tokenIndex !== null) {
      if (segment.tokenIndex === activeTokenIndex) {
        return { color: colors.highlight, fontWeight: '800' };
      }
      if (activeTokenIndex >= 0 && segment.tokenIndex < activeTokenIndex) {
        return { color: colors.ink };
      }
      return { color: activeTokenIndex >= 0 ? colors.textDim : colors.ink };
    }
    if (sentenceMode && segment.sentenceIndex !== null && activeSentenceIndex >= 0) {
      return {
        color: segment.sentenceIndex === activeSentenceIndex ? colors.ink : colors.textDim,
      };
    }
    return { color: colors.ink };
  };

  return (
    <RNText style={baseStyle} accessibilityLabel={page.textTr}>
      {segments.map((segment, index) => (
        <RNText key={index} style={colorFor(segment)}>
          {segment.text}
        </RNText>
      ))}
    </RNText>
  );
}
