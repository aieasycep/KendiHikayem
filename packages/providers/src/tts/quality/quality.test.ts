/**
 * The evidence for SPEC §7 step 7.
 *
 * Each test synthesises a recording that is wrong in exactly one way and asserts the exact
 * contract error code — and therefore the exact Turkish sentence — the parent will be shown.
 * A regression here means a parent being told to switch off the television when the real
 * problem was that they held the phone too close to their mouth.
 *
 * ⚠️ The corpus is SYNTHETIC (see ../testing/synth.ts). It proves that the measurements and
 * the thresholds behave as specified on signals whose defects are known exactly. It does
 * NOT prove calibration against real Turkish recordings made on real phones — that needs a
 * field corpus, and is tracked as an open item.
 */

import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, VOICE_QUALITY_THRESHOLDS } from '@kendihikayem/contract';

import { decodeWav, encodeWav } from '../audio/wav';
import { evaluateReference, evaluateTake } from './gate';
import { measureTake } from './measure';
import {
  addNoise,
  attenuate,
  bandLimit,
  clip,
  mixSpeakers,
  padSilence,
  reverberate,
  synthesizeSpeech,
  type SpeechOptions,
} from '../testing/synth';

/**
 * The real passage 1 from the voice-onboarding fixtures: 65 words of bedtime narration.
 * Read over 28 s that is ~146 wpm, comfortably inside the 110–180 band, so any rate
 * complaint in these tests comes from the degradation and not from the script.
 */
const PASSAGE_TR =
  'Yağmur, çatının üstünde usul usul yürüyordu. Değirmenin arkasındaki söğüt ağacı, ıslanan ' +
  'dallarını ağır ağır salladı. Dağların ardından çıkan ay, bahçedeki bütün gölgeleri ' +
  'yumuşacık örttü. Küçük ırmağın şırıltısı, uykuya çağıran bir ninniye benziyordu. Sıcacık ' +
  'yorganın altında, bütün gün koşturmuş ayaklar dinleniyordu artık. Göz kapakları ' +
  'ağırlaştıkça ağırlaşıyor, rüyaların kapısı usulca aralanıyordu. Uzaktaki çatıdan bir ' +
  'baykuş iki kez seslendi ve sonra sustu. Bahçedeki ıhlamur ağacı, yağmurun son ' +
  'damlalarını yapraklarından yavaşça süzdü.';

/** A parent reading passage 1 properly: 28 s, bedtime pace, phone at arm's length. */
function goodTake(overrides: Partial<SpeechOptions> = {}) {
  return synthesizeSpeech({
    seconds: 28,
    f0Hz: 190,
    syllablesPerSecond: 6.2,
    amplitude: 0.42,
    seed: 3,
    ...overrides,
  });
}

function evaluate(
  audio: ReturnType<typeof synthesizeSpeech>,
  options: { transcript?: string; expected?: string; step?: 'passage_1' | 'consent_clip' } = {},
) {
  const quality = measureTake({
    audio,
    expectedText: options.expected ?? PASSAGE_TR,
    ...(options.transcript !== undefined ? { transcript: options.transcript } : {}),
  });
  const gate = evaluateTake({
    quality,
    step: options.step ?? 'passage_1',
    transcriptAvailable: options.transcript !== undefined,
  });
  return { quality, gate };
}

describe('a clean take', () => {
  it('passes every threshold and is not asked to be re-recorded', () => {
    const { quality, gate } = evaluate(goodTake());

    expect(quality.snrDb).toBeGreaterThanOrEqual(VOICE_QUALITY_THRESHOLDS.snrDbMin);
    expect(quality.clippingPct).toBeLessThanOrEqual(VOICE_QUALITY_THRESHOLDS.clippingPctMax);
    expect(quality.peakDbfs).toBeGreaterThan(VOICE_QUALITY_THRESHOLDS.peakDbfsMin);
    expect(quality.peakDbfs).toBeLessThan(VOICE_QUALITY_THRESHOLDS.peakDbfsMax);
    expect(quality.wordsPerMinute).toBeGreaterThanOrEqual(
      VOICE_QUALITY_THRESHOLDS.wordsPerMinuteMin,
    );
    expect(quality.wordsPerMinute).toBeLessThanOrEqual(VOICE_QUALITY_THRESHOLDS.wordsPerMinuteMax);
    expect(quality.speakerCount).toBe(1);

    expect(gate.issues).toEqual([]);
    expect(gate.accepted).toBe(true);
    expect(gate.badge).toBe('mukemmel');
  });

  it('survives a WAV encode/decode round trip without changing the verdict', () => {
    const audio = goodTake();
    const restored = decodeWav(encodeWav(audio.channels, { sampleRate: audio.sampleRate }));
    const before = measureTake({ audio, expectedText: PASSAGE_TR });
    const after = measureTake({ audio: restored, expectedText: PASSAGE_TR });

    expect(after.durationMs).toBe(before.durationMs);
    expect(after.peakDbfs).toBeCloseTo(before.peakDbfs, 1);
    expect(after.wordsPerMinute).toBeCloseTo(before.wordsPerMinute, 0);
  });
});

describe('a recording made in a noisy room', () => {
  it('reports GURULTULU and tells the parent to switch the television off', () => {
    // 12 dB SNR: perfectly audible speech, unusable for cloning. Threshold is 20 dB.
    const { quality, gate } = evaluate(addNoise(goodTake(), 12));

    expect(quality.snrDb).toBeLessThan(VOICE_QUALITY_THRESHOLDS.snrDbMin);
    expect(gate.issues).toContain('GURULTULU');
    expect(gate.accepted).toBe(false);
    expect(gate.guidanceTr).toBe(ERROR_CATALOG.GURULTULU.messageTr);
  });

  it('does not also blame the room or the reading pace', () => {
    // Noise degrades voice-activity detection, so silence ratio, reverberation and rate all
    // become unreliable at once. Reporting them alongside would send the parent to fix
    // three things when one of them is the problem.
    const { gate } = evaluate(addNoise(goodTake(), 12));
    expect(gate.issues).toEqual(['GURULTULU']);
  });

  it('accepts a merely imperfect room (30 dB SNR)', () => {
    const { gate } = evaluate(addNoise(goodTake(), 30));
    expect(gate.issues).toEqual([]);
    expect(gate.accepted).toBe(true);
  });
});

describe('a recording that clips', () => {
  it('reports KLIPLENME and asks for distance, not for quiet', () => {
    const { quality, gate } = evaluate(clip(goodTake(), 8));

    expect(quality.clippingPct).toBeGreaterThan(VOICE_QUALITY_THRESHOLDS.clippingPctMax);
    expect(gate.issues).toContain('KLIPLENME');
    expect(gate.accepted).toBe(false);
    expect(gate.guidanceTr).toBe(ERROR_CATALOG.KLIPLENME.messageTr);
  });
});

describe('a recording made too far from the microphone', () => {
  it('reports COK_SESSIZ', () => {
    const { quality, gate } = evaluate(attenuate(goodTake(), 0.02));

    expect(quality.peakDbfs).toBeLessThan(VOICE_QUALITY_THRESHOLDS.peakDbfsMin);
    expect(gate.issues).toContain('COK_SESSIZ');
    expect(gate.guidanceTr).toBe(ERROR_CATALOG.COK_SESSIZ.messageTr);
  });
});

describe('a room with hard surfaces', () => {
  it('reports YANKILI when the reflections outlast the threshold', () => {
    const { quality, gate } = evaluate(reverberate(goodTake(), 250, 0.08));

    expect(quality.reverbMs).toBeDefined();
    expect(quality.reverbMs!).toBeGreaterThan(VOICE_QUALITY_THRESHOLDS.reverbMsMax);
    expect(gate.issues).toContain('YANKILI');
    expect(gate.guidanceTr).toBe(ERROR_CATALOG.YANKILI.messageTr);
  });

  it('does not flag a normal soft-furnished bedroom', () => {
    const { quality, gate } = evaluate(reverberate(goodTake(), 180, 0.05));

    expect(quality.reverbMs!).toBeLessThanOrEqual(VOICE_QUALITY_THRESHOLDS.reverbMsMax);
    expect(gate.issues).toEqual([]);
  });
});

describe('reading pace', () => {
  it('reports COK_HIZLI when the parent races through the passage', () => {
    // The same 65 words in 15 s instead of 28.
    const { quality, gate } = evaluate(goodTake({ seconds: 15, syllablesPerSecond: 9.5 }));

    expect(quality.wordsPerMinute).toBeGreaterThan(VOICE_QUALITY_THRESHOLDS.wordsPerMinuteMax);
    expect(gate.issues).toContain('COK_HIZLI');
    expect(gate.guidanceTr).toContain('yavaş');
  });

  it('reports COK_YAVAS when the passage is drawn out', () => {
    const { quality, gate } = evaluate(goodTake({ seconds: 42, syllablesPerSecond: 3.4 }));

    expect(quality.wordsPerMinute).toBeLessThan(VOICE_QUALITY_THRESHOLDS.wordsPerMinuteMin);
    expect(gate.issues).toContain('COK_YAVAS');
  });
});

describe('a recording with a second person in the room', () => {
  it('reports BIRDEN_FAZLA_KONUSMACI, which outranks every other complaint', () => {
    const parent = goodTake({ f0Hz: 205 });
    const other = synthesizeSpeech({
      seconds: 28,
      f0Hz: 108,
      syllablesPerSecond: 6.4,
      amplitude: 0.4,
      // A longer vocal tract: the timbre difference that corroborates the pitch difference.
      formantScale: 0.84,
      seed: 21,
    });
    const { quality, gate } = evaluate(mixSpeakers(parent, other, 5));

    expect(quality.speakerCount).toBe(2);
    expect(gate.issues[0]).toBe('BIRDEN_FAZLA_KONUSMACI');
    expect(gate.accepted).toBe(false);
  });

  it('does not accuse one expressive reader of having company', () => {
    // Same voice, wide intonation range and a slow, dramatic delivery.
    const { quality } = evaluate(goodTake({ seconds: 42, syllablesPerSecond: 3.4, seed: 9 }));
    expect(quality.speakerCount).toBe(1);
  });
});

describe('a recording that stops early', () => {
  it('reports COK_KISA and does not additionally complain about the pace', () => {
    // Reading rate is words-of-the-script over time; when only part of the script was read
    // the rate is arithmetic about something that did not happen.
    const { gate } = evaluate(padSilence(goodTake({ seconds: 8 }), 500, 14_000));

    expect(gate.issues).toContain('COK_KISA');
    expect(gate.issues).not.toContain('COK_HIZLI');
    expect(gate.guidanceTr).toBe(ERROR_CATALOG.COK_KISA.messageTr);
  });
});

describe('a band-limited microphone', () => {
  it('warns about DAR_BANT_GENISLIGI without rejecting the take', () => {
    const { quality, gate } = evaluate(bandLimit(goodTake(), 3400));

    expect(quality.bandwidthHz).toBeLessThan(VOICE_QUALITY_THRESHOLDS.bandwidthHzMin);
    expect(gate.issues).toContain('DAR_BANT_GENISLIGI');
    // SPEC §7 marks this row "(uyarı)": advisory, not blocking.
    expect(gate.accepted).toBe(true);
  });

  it('does not fire on a full-band phone microphone', () => {
    const { quality } = evaluate(goodTake());
    expect(quality.bandwidthHz).toBeGreaterThanOrEqual(VOICE_QUALITY_THRESHOLDS.bandwidthHzMin);
  });
});

describe('the read-back check', () => {
  it('accepts a transcript that matches the script', () => {
    const { quality, gate } = evaluate(goodTake(), { transcript: PASSAGE_TR });

    expect(quality.asrSimilarity!).toBeGreaterThanOrEqual(
      VOICE_QUALITY_THRESHOLDS.asrSimilarityMin,
    );
    expect(gate.issues).not.toContain('METIN_ESLESMEDI');
  });

  it('tolerates a transcriber that drops punctuation and apostrophes', () => {
    const { quality } = evaluate(goodTake(), {
      transcript: PASSAGE_TR.replace(/[.,]/gu, '').toLocaleLowerCase('tr-TR'),
    });
    expect(quality.asrSimilarity!).toBeGreaterThanOrEqual(
      VOICE_QUALITY_THRESHOLDS.asrSimilarityMin,
    );
  });

  it('reports METIN_ESLESMEDI when a different text was read', () => {
    const { gate } = evaluate(goodTake(), {
      transcript: 'Bugün hava çok güzel ve markete gidip biraz ekmek almam gerekiyor.',
    });
    expect(gate.issues).toContain('METIN_ESLESMEDI');
  });
});

describe('the consent clip is a liveness check, not a quality check', () => {
  const SENTENCE = 'Mavi bardağın içinde yedi tane sarı düğme duruyor.';
  const consentClip = () =>
    synthesizeSpeech({ seconds: 12, f0Hz: 190, syllablesPerSecond: 6.2, amplitude: 0.42, seed: 5 });

  it('refuses to accept it when no transcript could be produced', () => {
    // ⚠️ Fails CLOSED. An unverified consent clip is not consent, and "the ASR provider was
    // down" is not a reason to clone somebody's voice anyway.
    const quality = measureTake({ audio: consentClip(), expectedText: SENTENCE });
    const gate = evaluateTake({ quality, step: 'consent_clip', transcriptAvailable: false });

    expect(gate.livenessOk).toBe(false);
    expect(gate.accepted).toBe(false);
    expect(gate.guidanceTr).toBe(ERROR_CATALOG.VOICE_SCRIPT_MISMATCH.messageTr);
  });

  it('refuses when a different sentence was read back', () => {
    const quality = measureTake({
      audio: consentClip(),
      expectedText: SENTENCE,
      transcript: 'Kırmızı kutunun üstünde üç tane mavi kalem var.',
    });
    const gate = evaluateTake({ quality, step: 'consent_clip', transcriptAvailable: true });

    expect(gate.livenessOk).toBe(false);
    expect(gate.accepted).toBe(false);
  });

  it('accepts when the random sentence was actually read back', () => {
    const quality = measureTake({
      audio: consentClip(),
      expectedText: SENTENCE,
      transcript: 'mavi bardağın içinde yedi tane sarı düğme duruyor',
    });
    const gate = evaluateTake({ quality, step: 'consent_clip', transcriptAvailable: true });

    expect(gate.livenessOk).toBe(true);
  });
});

describe('the stitched reference', () => {
  it('refuses a reference that is under the 100 s minimum', () => {
    const verdict = evaluateReference({ totalMs: 74_000, perTakeScores: [0.9, 0.9, 0.9] });
    expect(verdict.ok).toBe(false);
    expect(verdict.capturedSec).toBe(74);
    expect(verdict.reasonTr).toContain('74 sn');
  });

  it('refuses four takes that individually passed but are collectively poor', () => {
    const verdict = evaluateReference({
      totalMs: 110_000,
      perTakeScores: [0.42, 0.38, 0.45, 0.4],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasonTr).toBe(ERROR_CATALOG.VOICE_QUALITY_LOW.messageTr);
  });

  it('accepts 110 s of good takes', () => {
    const verdict = evaluateReference({
      totalMs: 110_000,
      perTakeScores: [0.82, 0.79, 0.9, 0.85],
    });
    expect(verdict.ok).toBe(true);
  });
});
