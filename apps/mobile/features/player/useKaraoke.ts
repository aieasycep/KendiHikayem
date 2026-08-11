/**
 * features/player/useKaraoke.ts — rAF döngüsü.
 *
 * Her karede motorun saatini okur, ikili aramayla aktif sayfa/kelime/cümleyi
 * bulur ve YALNIZCA DEĞİŞTİĞİNDE state günceller. Kelime başına tek render:
 * 12 sayfalık masalda dakikada ~150 hafif render — RN için rahat bir bütçe.
 */

import { useEffect, useRef, useState } from 'react';

import type { PlayerManifest } from '@kendihikayem/contract';

import { activeSentenceIndex, activeTokenIndex, pageIndexAtMs } from './karaoke';
import type { PlayerEngine } from './engine';

export interface KaraokeState {
  pageIndex: number;
  /** -1 = henüz kelime yok ya da vurgu kapalı. */
  tokenIndex: number;
  /** -1 = cümle yok. Cümle granülaritesinde kullanılır. */
  sentenceIndex: number;
  /** Kaba konum (yaklaşık 400 ms'de bir güncellenir) — ilerleme çubuğu için. */
  positionMs: number;
}

export function useKaraoke(
  manifest: PlayerManifest | undefined,
  engine: PlayerEngine,
  options: { highlightEnabled: boolean },
): KaraokeState {
  const { highlightEnabled } = options;
  const [state, setState] = useState<KaraokeState>({
    pageIndex: 0,
    tokenIndex: -1,
    sentenceIndex: -1,
    positionMs: 0,
  });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (manifest === undefined) return;
    let frame = 0;
    let lastCoarseUpdate = 0;

    const tick = (): void => {
      const positionMs = engine.readPositionMs();
      const pages = manifest.pages;
      const pageIndex = pageIndexAtMs(pages, positionMs);
      const page = pages[pageIndex];

      let tokenIndex = -1;
      let sentenceIndex = -1;
      if (page !== undefined && highlightEnabled) {
        tokenIndex = activeTokenIndex(page.tokens, positionMs);
        if (page.tokens.length === 0) sentenceIndex = activeSentenceIndex(page, positionMs);
      }

      const now = performance.now();
      const coarse = now - lastCoarseUpdate > 400;
      const previous = stateRef.current;
      if (
        previous.pageIndex !== pageIndex ||
        previous.tokenIndex !== tokenIndex ||
        previous.sentenceIndex !== sentenceIndex ||
        coarse
      ) {
        if (coarse) lastCoarseUpdate = now;
        setState({ pageIndex, tokenIndex, sentenceIndex, positionMs });
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [manifest, engine, highlightEnabled]);

  return state;
}
