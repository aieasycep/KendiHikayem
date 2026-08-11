/**
 * features/player/engine.ts — oynatma saati (clock) motoru.
 *
 * İki mod:
 *  - 'audio'  → expo-audio çalar; saat, oynatıcının 250 ms'lik durum güncellemeleri
 *               arasında performance.now() ile ENTERPOLE edilir (karaoke kelime
 *               sınırları 250 ms'ten incedir).
 *  - 'silent' → ses dosyası yüklenemedi (mock CDN 404 verir, gerçekte de imzalı
 *               URL süresi dolabilir) YA DA hikayenin sesi hiç yok. Saat sanal
 *               akar: vurgu, otomatik sayfa çevirme ve uyku modu SESSİZ de çalışır.
 *               "Ses opsiyonel" (SPEC §11.0) burada gerçekleşir.
 *
 * Ekran hiçbir zaman "ses yüklenemedi" diye bloklanmaz; en kötü durumda sessiz
 * okuma moduna düşer ve bunu küçük bir rozetle söyler.
 */

import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type EngineMode = 'audio' | 'silent';

export interface PlayerEngine {
  /** Sürekli okunabilen konum (ms). rAF döngüsü bunu okur; state DEĞİLDİR. */
  readPositionMs: () => number;
  playing: boolean;
  ended: boolean;
  mode: EngineMode;
  /** Ses gerçekten yüklendi mi (silent modda false). */
  audioReady: boolean;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seekTo: (positionMs: number) => void;
  /** Uyku modu: 0..1. */
  setVolume: (volume: number) => void;
  /** Uyku modu: 0.9..1. */
  setRate: (rate: number) => void;
  /** Bitti ekranından "baştan dinle". */
  restart: () => void;
}

interface ClockRef {
  baseMs: number;
  baseAt: number;
  playing: boolean;
  rate: number;
}

/** Ses yüklenmesi bu süreyi aşarsa sessiz moda düşülür. */
const AUDIO_LOAD_TIMEOUT_MS = 6_000;

export function usePlayerEngine(options: {
  /** Yerel (indirilmiş) ya da uzak ses adresi. undefined → doğrudan sessiz mod. */
  audioUri: string | undefined;
  totalDurationMs: number;
  /** Bittiğinde çağrılır (uyku modu: otomatik durur). */
  onEnded?: () => void;
}): PlayerEngine {
  const { audioUri, totalDurationMs, onEnded } = options;

  const player = useAudioPlayer(
    useMemo(() => (audioUri !== undefined ? { uri: audioUri } : null), [audioUri]),
    { updateInterval: 250 },
  );
  const status = useAudioPlayerStatus(player);

  const [mode, setMode] = useState<EngineMode>(audioUri === undefined ? 'silent' : 'audio');
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);

  const clock = useRef<ClockRef>({ baseMs: 0, baseAt: 0, playing: false, rate: 1 });
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Hoparlörden, sessiz anahtarına rağmen çal (yatma saati: telefon sessizde olur).
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  // Ses belirli sürede yüklenmezse sessiz moda geç.
  useEffect(() => {
    if (audioUri === undefined) {
      setMode('silent');
      return;
    }
    setMode('audio');
    const timer = setTimeout(() => {
      if (!status.isLoaded) setMode('silent');
    }, AUDIO_LOAD_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUri]);

  const audioReady = mode === 'audio' && status.isLoaded;

  // Gerçek oynatıcı durumu → saat senkronu.
  useEffect(() => {
    if (mode !== 'audio' || !status.isLoaded) return;
    clock.current = {
      baseMs: status.currentTime * 1000,
      baseAt: performance.now(),
      playing: status.playing,
      rate: clock.current.rate,
    };
    setPlaying(status.playing);
    if (status.didJustFinish && !endedRef.current) {
      endedRef.current = true;
      setEnded(true);
      setPlaying(false);
      onEndedRef.current?.();
    }
  }, [mode, status.isLoaded, status.currentTime, status.playing, status.didJustFinish]);

  const readPositionMs = useCallback((): number => {
    const c = clock.current;
    const raw = c.playing ? c.baseMs + (performance.now() - c.baseAt) * c.rate : c.baseMs;
    return Math.max(0, Math.min(totalDurationMs, raw));
  }, [totalDurationMs]);

  // Sanal modda bitişi rAF üzerinden değil, hafif bir aralıkla yakala.
  useEffect(() => {
    if (mode !== 'silent') return;
    const interval = setInterval(() => {
      if (!clock.current.playing || endedRef.current) return;
      if (readPositionMs() >= totalDurationMs) {
        clock.current = { ...clock.current, baseMs: totalDurationMs, playing: false };
        endedRef.current = true;
        setPlaying(false);
        setEnded(true);
        onEndedRef.current?.();
      }
    }, 300);
    return () => {
      clearInterval(interval);
    };
  }, [mode, readPositionMs, totalDurationMs]);

  const play = useCallback((): void => {
    endedRef.current = false;
    setEnded(false);
    if (audioReady) {
      player.play();
      setPlaying(true);
      clock.current = { ...clock.current, playing: true, baseAt: performance.now() };
    } else {
      clock.current = {
        ...clock.current,
        baseMs: readPositionMs(),
        baseAt: performance.now(),
        playing: true,
      };
      setPlaying(true);
    }
  }, [audioReady, player, readPositionMs]);

  const pause = useCallback((): void => {
    if (audioReady) player.pause();
    clock.current = { ...clock.current, baseMs: readPositionMs(), playing: false };
    setPlaying(false);
  }, [audioReady, player, readPositionMs]);

  const toggle = useCallback((): void => {
    if (clock.current.playing) pause();
    else play();
  }, [pause, play]);

  const seekTo = useCallback(
    (positionMs: number): void => {
      const clamped = Math.max(0, Math.min(totalDurationMs, positionMs));
      endedRef.current = false;
      setEnded(false);
      clock.current = { ...clock.current, baseMs: clamped, baseAt: performance.now() };
      if (audioReady) void player.seekTo(clamped / 1000).catch(() => undefined);
    },
    [audioReady, player, totalDurationMs],
  );

  const setVolume = useCallback(
    (volume: number): void => {
      if (audioReady) player.volume = Math.max(0, Math.min(1, volume));
    },
    [audioReady, player],
  );

  const setRate = useCallback(
    (rate: number): void => {
      // Saat tabanını sabitle, sonra hızı değiştir (konum sıçramasın).
      clock.current = {
        ...clock.current,
        baseMs: readPositionMs(),
        baseAt: performance.now(),
        rate,
      };
      if (audioReady) player.setPlaybackRate(rate);
    },
    [audioReady, player, readPositionMs],
  );

  const restart = useCallback((): void => {
    seekTo(0);
    play();
  }, [seekTo, play]);

  return {
    readPositionMs,
    playing,
    ended,
    mode,
    audioReady,
    toggle,
    play,
    pause,
    seekTo,
    setVolume,
    setRate,
    restart,
  };
}
