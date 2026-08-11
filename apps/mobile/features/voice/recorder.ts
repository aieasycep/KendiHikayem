/**
 * useVoiceRecorder — the ONLY microphone entry point in the app.
 *
 * Wraps expo-audio's `useAudioRecorder` with:
 *   · runtime RECORD_AUDIO permission handling (denied state surfaces in UI)
 *   · a recording-friendly audio mode (`allowsRecording`, plays in silent mode)
 *   · a 120 ms metering stream feeding the live dB meter (features/voice/meter.ts)
 *   · a hard duration cap so a forgotten recorder cannot run for minutes
 *
 * There is deliberately NO file-picker path anywhere: the contract only accepts
 * `source: 'in_app_microphone'` and this hook is how that stays true.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';

import { computeMeterStats, normalizeDb, type MeterStats } from './meter';

/**
 * Mono 44.1 kHz AAC — ElevenLabs IVC reference sweet spot; metering ON for the
 * live dB meter. Based on RecordingPresets.HIGH_QUALITY, channels reduced to 1
 * (the server mixes to 48 kHz mono WAV anyway, SPEC §7 adım 8).
 */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY!,
  numberOfChannels: 1,
  isMeteringEnabled: true,
};

export type MicPermission = 'unknown' | 'granted' | 'denied';

export interface FinishedRecording {
  /** null when the platform produced no file (extremely rare). */
  uri: string | null;
  durationMs: number;
  stats: MeterStats;
}

interface MeterState {
  stats: MeterStats;
  /** Last ~40 normalized dB samples for the bar visual. */
  recentDb: number[];
}

export interface VoiceRecorderApi {
  permission: MicPermission;
  isRecording: boolean;
  /** Milliseconds recorded so far (live). */
  durationMs: number;
  /** Rolling stats for the meter UI; recomputed every metering tick. */
  stats: MeterStats;
  recentDb: number[];
  start: () => Promise<boolean>;
  /** Resolves with the finished take; undefined when nothing was recording. */
  stop: () => Promise<FinishedRecording | undefined>;
}

const EMPTY_METER: MeterState = { stats: computeMeterStats([]), recentDb: [] };

export function useVoiceRecorder(maxDurationMs = 60_000): VoiceRecorderApi {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 120);

  const [permission, setPermission] = useState<MicPermission>('unknown');
  const samplesRef = useRef<number[]>([]);
  const [meter, setMeter] = useState<MeterState>(EMPTY_METER);
  const stopGuard = useRef(false);

  // Feed the meter while recording. `durationMillis` advances every poll tick,
  // so this effect runs once per tick even when the level itself is unchanged.
  useEffect(() => {
    if (!state.isRecording) return;
    samplesRef.current.push(normalizeDb(state.metering));
    setMeter({
      stats: computeMeterStats(samplesRef.current),
      recentDb: samplesRef.current.slice(-40),
    });
  }, [state.isRecording, state.metering, state.durationMillis]);

  const start = useCallback(async (): Promise<boolean> => {
    const response = await requestRecordingPermissionsAsync();
    if (!response.granted) {
      setPermission('denied');
      return false;
    }
    setPermission('granted');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    samplesRef.current = [];
    setMeter(EMPTY_METER);
    stopGuard.current = false;
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }, [recorder]);

  const stop = useCallback(async (): Promise<FinishedRecording | undefined> => {
    if (stopGuard.current) return undefined;
    stopGuard.current = true;
    const durationMs = Math.round(recorder.currentTime * 1000);
    await recorder.stop();
    // Recording no longer needs the mic; release it for playback screens.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    // Stats are computed from the ref INSIDE the callback — never a stale render.
    return { uri: recorder.uri, durationMs, stats: computeMeterStats(samplesRef.current) };
  }, [recorder]);

  // Hard cap: stop automatically when the limit is hit.
  useEffect(() => {
    if (!state.isRecording) return;
    if (state.durationMillis >= maxDurationMs) void stop();
  }, [state.isRecording, state.durationMillis, maxDurationMs, stop]);

  return {
    permission,
    isRecording: state.isRecording,
    durationMs: state.durationMillis,
    stats: meter.stats,
    recentDb: meter.recentDb,
    start,
    stop,
  };
}
