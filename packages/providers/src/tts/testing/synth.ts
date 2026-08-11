/**
 * tts/testing/synth.ts — a speech-shaped signal generator.
 *
 * The voice quality gate is the one part of this pipeline that can be proven correct
 * WITHOUT a vendor key: it looks at waveforms, not at an API. To prove it, we need
 * recordings that are wrong in a specific, known way — a take made next to a television, a
 * take that clips, a take read too fast — and no such corpus can be downloaded here.
 *
 * So we synthesise it. This is not a vocoder and does not need to be: the gate measures
 * energy, periodicity, spectrum and timing, and a glottal pulse train shaped by formant
 * resonators reproduces all four with the right statistics. Every generator is seeded, so a
 * failing assertion is reproducible rather than flaky.
 *
 * Kept in `src/` rather than in a test folder because it is also how the dev seed and the
 * ops smoke check produce sample audio without shipping real people's voices.
 */

import type { AudioBuffer } from '../audio/wav';

export interface SpeechOptions {
  sampleRate?: number;
  /** Median fundamental. ~110 Hz reads as an adult male, ~210 Hz as an adult female. */
  f0Hz?: number;
  /** Syllables per second. Turkish bedtime reading sits near 4.2; 7 sounds rushed. */
  syllablesPerSecond?: number;
  seconds: number;
  /** Peak amplitude in [0,1] before any degradation is applied. */
  amplitude?: number;
  /** Share of the take spent in inter-sentence pauses. */
  pauseRatio?: number;
  /**
   * Vocal-tract length scaling of the formants. A taller speaker has a longer tract and
   * therefore lower formants at the same pitch — 0.85 reads as an adult male next to a 1.0
   * adult female. Two voices that differ ONLY in pitch are not two speakers, they are one
   * speaker singing, which is why the speaker-count check wants this dimension too.
   */
  formantScale?: number;
  seed?: number;
}

/** Deterministic PRNG (mulberry32). Reproducible failures beat realistic noise. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three-formant resonator bank, roughly the Turkish vowel space (a, e, i, o, u). */
const VOWEL_FORMANTS: ReadonlyArray<readonly [number, number, number]> = [
  [730, 1090, 2440], // a
  [530, 1840, 2480], // e
  [270, 2290, 3010], // i
  [570, 840, 2410], // o
  [300, 870, 2240], // u
];

/**
 * Generates speech-like mono audio: a syllable train of voiced vowels separated by short
 * consonant gaps, grouped into sentences with longer pauses between them.
 */
export function synthesizeSpeech(options: SpeechOptions): AudioBuffer {
  const sampleRate = options.sampleRate ?? 44100;
  const f0 = options.f0Hz ?? 165;
  const rate = options.syllablesPerSecond ?? 4.2;
  const amplitude = options.amplitude ?? 0.5;
  const pauseRatio = options.pauseRatio ?? 0.18;
  const random = seeded(options.seed ?? 7);

  const length = Math.round(options.seconds * sampleRate);
  const out = new Float32Array(length);

  const syllableMs = 1000 / rate;
  const voicedMs = syllableMs * 0.86; // the rest is the stop/gap between syllables
  let cursor = 0;
  let syllableIndex = 0;

  while (cursor < length) {
    // Sentence structure: 6–11 syllables, then a pause. Gives the VAD real offsets to
    // measure reverb decay against, which a continuous tone would never provide.
    const syllablesInSentence = 6 + Math.floor(random() * 6);

    for (let i = 0; i < syllablesInSentence && cursor < length; i += 1) {
      const base = VOWEL_FORMANTS[syllableIndex % VOWEL_FORMANTS.length]!;
      const scale = options.formantScale ?? 1;
      const formants = [base[0] * scale, base[1] * scale, base[2] * scale] as const;
      // Intonation: a declining contour across the sentence, plus a little jitter.
      const contour = 1 + 0.12 * (1 - i / syllablesInSentence) + (random() - 0.5) * 0.04;
      const voicedSamples = Math.round((voicedMs / 1000) * sampleRate);
      renderSyllable(out, cursor, voicedSamples, {
        sampleRate,
        f0: f0 * contour,
        formants,
        amplitude: 0.8 + random() * 0.2,
      });

      // Every third syllable opens with a fricative (Turkish is rich in s/ş/f/h). Without
      // this the signal has no energy above ~3 kHz and every take would look like it came
      // through a telephone — the exact thing `DAR_BANT_GENISLIGI` is meant to catch.
      if (syllableIndex % 3 === 0) {
        renderFricative(out, cursor, Math.round(0.045 * sampleRate), sampleRate, random, scale);
      }

      cursor += Math.round((syllableMs / 1000) * sampleRate);
      syllableIndex += 1;
    }

    cursor += Math.round(((syllableMs * pauseRatio * 6) / 1000) * sampleRate);
  }

  // Normalise last: the resonator bank has its own gain, so `amplitude` would otherwise be
  // a suggestion rather than the peak level the tests reason about in dBFS.
  scaleToPeak(out, amplitude);
  return { sampleRate, channels: [out], length };
}

/** Shaped noise burst — the /s/, /ş/, /f/ energy that lives between 4 and 11 kHz. */
function renderFricative(
  out: Float32Array,
  offset: number,
  count: number,
  sampleRate: number,
  random: () => number,
  scale = 1,
): void {
  let highpassed = 0;
  let previous = 0;
  let lowpassed = 0;
  let lowpassed2 = 0;
  const highAlpha = 1 / (1 + (2 * Math.PI * 4000 * scale) / sampleRate);
  // Band-limited at 11 kHz: real sibilance dies out well below Nyquist, and a fricative
  // that ran flat to 22 kHz would make every take measure a 21 kHz "bandwidth".
  const cutoff = 11_000 * scale;
  const lowAlpha = (2 * Math.PI * cutoff) / sampleRate / (1 + (2 * Math.PI * cutoff) / sampleRate);

  for (let i = 0; i < count; i += 1) {
    const at = offset + i;
    if (at >= out.length) break;
    const white = random() * 2 - 1;
    highpassed = highAlpha * (highpassed + white - previous);
    previous = white;
    lowpassed += lowAlpha * (highpassed - lowpassed);
    lowpassed2 += lowAlpha * (lowpassed - lowpassed2);
    const envelope = Math.sin((Math.PI * i) / count);
    out[at] = (out[at] ?? 0) + lowpassed2 * envelope * 0.7;
  }
}

function scaleToPeak(samples: Float32Array, target: number): void {
  let peak = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
  }
  if (peak <= 0) return;
  const gain = target / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] ?? 0) * gain;
}

function renderSyllable(
  out: Float32Array,
  offset: number,
  count: number,
  spec: {
    sampleRate: number;
    f0: number;
    formants: readonly [number, number, number];
    amplitude: number;
  },
): void {
  const period = spec.sampleRate / spec.f0;
  // Excitation: a glottal pulse train (periodic → the pitch tracker sees a real F0).
  const excitation = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const phase = (i % period) / period;
    excitation[i] = Math.exp(-6 * phase) - 0.35;
  }

  const filtered = new Float32Array(count);
  for (const [index, frequency] of spec.formants.entries()) {
    const gain = 1 / (index + 1.4);
    resonate(excitation, filtered, frequency, index === 0 ? 90 : 130, spec.sampleRate, gain);
  }

  for (let i = 0; i < count; i += 1) {
    const at = offset + i;
    if (at >= out.length) break;
    // Raised-cosine envelope: no clicks at syllable edges, which would smear the spectrum.
    const envelope = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, count - 1));
    out[at] = (out[at] ?? 0) + (filtered[i] ?? 0) * envelope * spec.amplitude;
  }
}

/** Two-pole resonator, accumulating into `out`. */
function resonate(
  input: Float32Array,
  out: Float32Array,
  frequency: number,
  bandwidth: number,
  sampleRate: number,
  gain: number,
): void {
  const r = Math.exp((-Math.PI * bandwidth) / sampleRate);
  const theta = (2 * Math.PI * frequency) / sampleRate;
  const a1 = 2 * r * Math.cos(theta);
  const a2 = -r * r;
  const b0 = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * theta) + r * r);

  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const y = b0 * (input[i] ?? 0) + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    out[i] = (out[i] ?? 0) + y * gain;
  }
}

/* ── Degradations: each one is a real recording mistake ────────────────────── */

/** Background noise at a target SNR — the television-left-on take. */
export function addNoise(audio: AudioBuffer, snrDb: number, seed = 11): AudioBuffer {
  const random = seeded(seed);
  return mapChannels(audio, (samples) => {
    const signal = rmsOf(samples);
    const noiseRms = signal / 10 ** (snrDb / 20);
    const out = new Float32Array(samples.length);
    // Pink-ish noise: a running average of white noise. Broadband hiss would be measured
    // as a *higher* bandwidth, which is the opposite of what a real room does.
    let previous = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const white = random() * 2 - 1;
      previous = 0.72 * previous + 0.28 * white;
      out[i] = (samples[i] ?? 0) + previous * noiseRms * 3.2;
    }
    return out;
  });
}

/** Drives the signal into the rails — the phone-held-too-close take. */
export function clip(audio: AudioBuffer, gain = 4, ceiling = 1): AudioBuffer {
  return mapChannels(audio, (samples) => {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      out[i] = Math.max(-ceiling, Math.min(ceiling, (samples[i] ?? 0) * gain));
    }
    return out;
  });
}

/** Scales the whole take down — the phone-across-the-room take. */
export function attenuate(audio: AudioBuffer, factor: number): AudioBuffer {
  return mapChannels(audio, (samples) => {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) out[i] = (samples[i] ?? 0) * factor;
    return out;
  });
}

/**
 * Schroeder reverberator (4 combs + 2 all-passes) tuned by decay time — the tiled-bathroom
 * take. Produces a genuine exponential decay tail, which is what `reverbTimeMs` measures.
 */
export function reverberate(audio: AudioBuffer, rt60Ms: number, mix = 0.55): AudioBuffer {
  return mapChannels(audio, (samples) => {
    const sampleRate = audio.sampleRate;
    const combDelaysMs = [29.7, 37.1, 41.1, 43.7];
    const wet = new Float32Array(samples.length);

    for (const delayMs of combDelaysMs) {
      const delay = Math.max(1, Math.round((delayMs / 1000) * sampleRate));
      // Feedback chosen so the comb decays 60 dB in rt60Ms.
      const feedback = Math.min(0.98, 10 ** ((-3 * delayMs) / rt60Ms));
      const buffer = new Float32Array(delay);
      let index = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const delayed = buffer[index] ?? 0;
        wet[i] = (wet[i] ?? 0) + delayed / combDelaysMs.length;
        buffer[index] = (samples[i] ?? 0) + delayed * feedback;
        index = (index + 1) % delay;
      }
    }

    for (const delayMs of [5, 1.7]) {
      const delay = Math.max(1, Math.round((delayMs / 1000) * sampleRate));
      const buffer = new Float32Array(delay);
      let index = 0;
      for (let i = 0; i < wet.length; i += 1) {
        const delayed = buffer[index] ?? 0;
        const input = wet[i] ?? 0;
        const output = -0.7 * input + delayed;
        buffer[index] = input + 0.7 * output;
        wet[i] = output;
        index = (index + 1) % delay;
      }
    }

    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      out[i] = (samples[i] ?? 0) * (1 - mix) + (wet[i] ?? 0) * mix;
    }
    return out;
  });
}

/** Low-passes to a telephone-ish band — the Bluetooth-headset take. */
export function bandLimit(audio: AudioBuffer, cutoffHz: number): AudioBuffer {
  return mapChannels(audio, (samples) => {
    const out = new Float32Array(samples.length);
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / audio.sampleRate;
    const alpha = dt / (rc + dt);
    let previous = 0;
    // Four cascaded one-poles ≈ 24 dB/octave, steep enough to actually remove the band.
    for (let pass = 0; pass < 4; pass += 1) {
      previous = 0;
      const source = pass === 0 ? samples : out;
      for (let i = 0; i < samples.length; i += 1) {
        previous += alpha * ((source[i] ?? 0) - previous);
        out[i] = previous;
      }
    }
    return out;
  });
}

/** Interleaves two voices — the partner-answered-a-question take. */
export function mixSpeakers(a: AudioBuffer, b: AudioBuffer, switchSeconds = 2.5): AudioBuffer {
  const length = Math.min(a.length, b.length);
  const out = new Float32Array(length);
  const block = Math.round(switchSeconds * a.sampleRate);
  const left = a.channels[0] ?? new Float32Array(length);
  const right = b.channels[0] ?? new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const useSecond = Math.floor(i / block) % 2 === 1;
    out[i] = useSecond ? (right[i] ?? 0) : (left[i] ?? 0);
  }
  return { sampleRate: a.sampleRate, channels: [out], length };
}

/** Pads with digital silence — the "started recording early, wandered off" take. */
export function padSilence(audio: AudioBuffer, leadingMs: number, trailingMs: number): AudioBuffer {
  const lead = Math.round((leadingMs / 1000) * audio.sampleRate);
  const trail = Math.round((trailingMs / 1000) * audio.sampleRate);
  const source = audio.channels[0] ?? new Float32Array(0);
  const out = new Float32Array(lead + source.length + trail);
  out.set(source, lead);
  return { sampleRate: audio.sampleRate, channels: [out], length: out.length };
}

function mapChannels(audio: AudioBuffer, fn: (samples: Float32Array) => Float32Array): AudioBuffer {
  const channels = audio.channels.map(fn);
  return { sampleRate: audio.sampleRate, channels, length: channels[0]?.length ?? 0 };
}

function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / Math.max(1, samples.length));
}
