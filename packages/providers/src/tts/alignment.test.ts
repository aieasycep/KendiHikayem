/**
 * The karaoke timeline, chunking and the slot policy.
 *
 * These three are what the mobile player, the invoice and the 660-slot ceiling respectively
 * depend on, and all three are pure functions — so unlike the vendor conversation, they can
 * be proven correct here and stay proven.
 */

import { describe, expect, it } from 'vitest';

import { alignmentFor } from './elevenlabs/fixtures';
import {
  enforceMonotonic,
  estimateWordTimings,
  tokenizePage,
  wordTimingsFromCharacters,
} from './alignment';
import { chunkStory } from './chunking';
import { planEviction, type VoiceBinding } from './slots';
import { readBackSimilarity, tokenize } from './text/turkish';

/* ── Turkish word boundaries ───────────────────────────────────────────────── */

describe('Turkish tokenisation', () => {
  it("keeps an apostrophe-suffixed proper noun as ONE word", () => {
    // The child's own name blinking twice mid-sentence is the bug this prevents.
    expect(tokenize("Elif'in kitabı Ankara'ya gönderildi.")).toEqual([
      "Elif'in",
      'kitabı',
      "Ankara'ya",
      'gönderildi',
    ]);
  });

  it('handles the curly apostrophe a phone keyboard produces', () => {
    expect(tokenize('Elif’in defteri')).toEqual(['Elif’in', 'defteri']);
  });

  it('keeps long agglutinated words whole', () => {
    expect(tokenize('gördüklerimizden bahsettiğimizde')).toEqual([
      'gördüklerimizden',
      'bahsettiğimizde',
    ]);
  });

  it('compares read-backs with Turkish casing, not ASCII casing', () => {
    // `toLowerCase()` maps "I" to "i" instead of "ı", so IŞIK/ışık would look different.
    expect(readBackSimilarity('IŞIK ıslak', 'ışık ıslak')).toBe(1);
  });

  it('forgives a transcriber that drops the apostrophe', () => {
    expect(readBackSimilarity("Elif'in kitabı", 'Elifin kitabı')).toBe(1);
  });

  it('still rejects a genuinely different sentence', () => {
    expect(readBackSimilarity('Mavi bardağın içinde yedi düğme var', 'Bugün hava çok güzel')).toBeLessThan(
      0.4,
    );
  });
});

/* ── Provider character timings → word timings ─────────────────────────────── */

describe('provider alignment', () => {
  const TEXT = "Elif'in ağacı rüzgârda sallandı.";

  it('spans both halves of an apostrophe-suffixed word', () => {
    const timings = wordTimingsFromCharacters(alignmentFor(TEXT));

    expect(timings.map((t) => t.word)).toEqual(["Elif'in", 'ağacı', 'rüzgârda', 'sallandı']);
    // "Elif'in" is 7 characters at ~55 ms each: the token covers the suffix too, so its
    // duration must be far longer than the 4 characters of "Elif" alone.
    expect(timings[0]!.endMs - timings[0]!.startMs).toBeGreaterThan(300);
  });

  it('shifts every timing by the chunk offset', () => {
    const timings = wordTimingsFromCharacters(alignmentFor(TEXT), 12_000);
    expect(timings[0]!.startMs).toBeGreaterThanOrEqual(12_000);
  });

  it('does not let trailing punctuation pad the last word', () => {
    const withStop = wordTimingsFromCharacters(alignmentFor('Merhaba dünya.'));
    const withoutStop = wordTimingsFromCharacters(alignmentFor('Merhaba dünya'));
    const lastWith = withStop[withStop.length - 1]!;
    const lastWithout = withoutStop[withoutStop.length - 1]!;
    expect(lastWith.endMs - lastWith.startMs).toBe(lastWithout.endMs - lastWithout.startMs);
  });
});

/* ── The sentence estimate ─────────────────────────────────────────────────── */

describe('the syllable-weighted estimate', () => {
  const TEXT = 'Stres yoktu. Gördüklerimizden bahsettiğimizde herkes güldü.';

  it('gives a six-syllable word more time than a one-syllable word', () => {
    const timings = estimateWordTimings(TEXT, 6_000);
    const stres = timings.find((t) => t.word === 'Stres')!;
    const long = timings.find((t) => t.word === 'Gördüklerimizden')!;

    // Character-proportional timing would make these nearly equal (5 vs 16 characters);
    // syllable-weighted timing makes the second roughly five times longer, which is what a
    // Turkish speaker actually does.
    expect(long.endMs - long.startMs).toBeGreaterThan((stres.endMs - stres.startMs) * 3);
  });

  it('fills the requested duration and stays inside it', () => {
    const timings = estimateWordTimings(TEXT, 6_000);
    expect(timings[0]!.startMs).toBe(0);
    expect(timings[timings.length - 1]!.endMs).toBeLessThanOrEqual(6_000);
    expect(timings[timings.length - 1]!.endMs).toBeGreaterThan(4_500);
  });

  it('leaves a pause at the full stop', () => {
    const timings = estimateWordTimings(TEXT, 6_000);
    const yoktu = timings.find((t) => t.word === 'yoktu')!;
    const next = timings.find((t) => t.word === 'Gördüklerimizden')!;
    expect(next.startMs - yoktu.endMs).toBeGreaterThan(150);
  });

  it('marks itself as low confidence so the caller can degrade the highlight', () => {
    expect(estimateWordTimings(TEXT, 6_000)[0]!.confidence).toBeLessThan(0.6);
  });
});

/* ── PlayerPage projection ─────────────────────────────────────────────────── */

describe('page tokenisation for the reader', () => {
  const PAGE = "Elif'in ağacı sallandı. Rüzgâr durdu!";

  it('produces tokens whose char offsets index the page text', () => {
    const timings = wordTimingsFromCharacters(alignmentFor(PAGE));
    const { tokens } = tokenizePage(PAGE, timings);

    for (const token of tokens) {
      expect(PAGE.slice(token.charStart, token.charEnd)).toBe(token.t);
    }
  });

  it('marks the last word of each sentence', () => {
    const timings = wordTimingsFromCharacters(alignmentFor(PAGE));
    const { tokens, sentences } = tokenizePage(PAGE, timings);

    expect(tokens.filter((token) => token.isSentenceEnd).map((token) => token.t)).toEqual([
      'sallandı',
      'durdu',
    ]);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]!.startMs).toBeGreaterThan(sentences[0]!.startMs);
  });

  it('continues the token index across pages', () => {
    const timings = wordTimingsFromCharacters(alignmentFor(PAGE));
    const second = tokenizePage(PAGE, timings, { indexOffset: 40 });
    expect(second.tokens[0]!.i).toBe(40);
  });

  it('repairs a backwards timing at a chunk seam', () => {
    // The player binary-searches these and assumes they ascend; one inverted pair sends the
    // highlight backwards in the middle of a sentence.
    const tokens = enforceMonotonic([
      { i: 0, t: 'bir', charStart: 0, charEnd: 3, s: 0, e: 500, isSentenceEnd: false },
      { i: 1, t: 'iki', charStart: 4, charEnd: 7, s: 420, e: 900, isSentenceEnd: false },
    ]);
    expect(tokens[1]!.s).toBe(500);
    expect(tokens[1]!.e).toBeGreaterThanOrEqual(tokens[1]!.s);
  });
});

/* ── Chunking ──────────────────────────────────────────────────────────────── */

describe('chunking', () => {
  const pages = [
    { pageNo: 1, textTr: 'Birinci sayfa. İki cümlesi var.' },
    { pageNo: 2, textTr: 'İkinci sayfa burada.' },
  ];

  it('makes one chunk per page when pages are short', () => {
    const chunks = chunkStory(pages, { maxChars: 1800 });
    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.pageNo)).toEqual([1, 2]);
  });

  it('gives each chunk its neighbours as prosody context', () => {
    const chunks = chunkStory(pages, { maxChars: 1800 });
    expect(chunks[0]!.previousText).toBeUndefined();
    expect(chunks[0]!.nextText).toContain('İkinci sayfa');
    expect(chunks[1]!.previousText).toContain('İki cümlesi');
  });

  it('splits a long page at sentence ends, never mid-sentence', () => {
    const long = 'Cümle bir burada bitiyor. Cümle iki de burada bitiyor. Üçüncüsü de öyle.';
    const chunks = chunkStory([{ pageNo: 1, textTr: long }], { maxChars: 30 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.trim()).toMatch(/[.!?]$/u);
    }
    // Every word survives the split.
    expect(chunks.map((chunk) => chunk.text).join(' ').replace(/\s+/gu, ' ')).toBe(long);
  });
});

/* ── LRU eviction ──────────────────────────────────────────────────────────── */

describe('voice slot eviction', () => {
  const policy = { limit: 10, highWater: 0.9, idleHours: 72 };
  const now = new Date('2026-08-11T12:00:00Z');

  function binding(id: string, overrides: Partial<VoiceBinding> = {}): VoiceBinding {
    return {
      id,
      voiceProfileId: `profile-${id}`,
      provider: 'elevenlabs',
      providerVoiceId: `voice-${id}`,
      state: 'active',
      occupiesSlot: true,
      isEphemeral: false,
      lastUsedAt: new Date('2026-08-11T11:00:00Z'),
      createdAt: new Date('2026-08-01T00:00:00Z'),
      ...overrides,
    };
  }

  it('evicts the least recently used voice when room is needed', () => {
    const plan = planEviction(
      [
        binding('a', { lastUsedAt: new Date('2026-08-11T10:00:00Z') }),
        binding('b', { lastUsedAt: new Date('2026-08-01T10:00:00Z') }), // coldest
        binding('c', { lastUsedAt: new Date('2026-08-11T11:59:00Z') }),
      ],
      policy,
      { needed: 1, now },
    );

    expect(plan.reason).toBe('make_room');
    expect(plan.evict.map((b) => b.id)).toEqual(['b']);
  });

  it('treats a never-played voice as the coldest of all', () => {
    const plan = planEviction(
      [
        binding('a', { lastUsedAt: new Date('2026-08-01T10:00:00Z') }),
        binding('never', { lastUsedAt: null, createdAt: new Date('2026-07-01T00:00:00Z') }),
      ],
      policy,
      { needed: 1, now },
    );
    expect(plan.evict[0]!.id).toBe('never');
  });

  it('never evicts a voice that is still being created', () => {
    // It belongs to a parent watching the "sesiniz hazırlanıyor" screen right now.
    const plan = planEviction(
      [binding('creating', { state: 'creating' }), binding('old', { lastUsedAt: new Date(0) })],
      policy,
      { needed: 2, now },
    );
    expect(plan.evict.map((b) => b.id)).toEqual(['old']);
  });

  it('never evicts the profile it is making room for', () => {
    const target = binding('target', { lastUsedAt: new Date(0) });
    const plan = planEviction([target, binding('other')], policy, {
      needed: 1,
      now,
      protect: [target.voiceProfileId],
    });
    expect(plan.evict.map((b) => b.id)).toEqual(['other']);
  });

  it('sheds down to the high-water mark before anyone has to wait', () => {
    const bindings = Array.from({ length: 10 }, (_, i) =>
      binding(`v${i}`, { lastUsedAt: new Date(2026, 0, i + 1) }),
    );
    const plan = planEviction(bindings, policy, { now });

    expect(plan.reason).toBe('high_water');
    expect(plan.evict).toHaveLength(1); // 10 used, threshold 9
    expect(plan.evict[0]!.id).toBe('v0'); // the oldest
  });

  it('reclaims only genuinely cold voices when there is room to spare', () => {
    const plan = planEviction(
      [
        binding('warm', { lastUsedAt: new Date('2026-08-11T09:00:00Z') }),
        binding('cold', { lastUsedAt: new Date('2026-08-01T09:00:00Z') }),
      ],
      policy,
      { now },
    );
    expect(plan.reason).toBe('idle');
    expect(plan.evict.map((b) => b.id)).toEqual(['cold']);
  });

  it('leaves inline-embedding bindings alone — deleting them frees no slot', () => {
    const plan = planEviction([binding('inline', { occupiesSlot: false })], policy, {
      needed: 1,
      now,
    });
    expect(plan.evict).toEqual([]);
  });
});
