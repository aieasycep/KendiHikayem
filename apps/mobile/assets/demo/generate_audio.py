"""generate_audio.py — demo APK'sına gömülen ninni müziğini üretir.

    pip install lameenc && python3 apps/mobile/assets/demo/generate_audio.py

⚠️ DÜRÜSTLÜK NOTU
Bu ortamda Türkçe konuşma sentezi YOK. Sahte konuşma üretmek kullanıcıyı
yanıltır ("bu benim sesim mi olacak?"), o yüzden ÜRETİLMEDİ. Onun yerine
programatik olarak enstrümantal bir ninni bestelendi: sinüs tabanlı çan/celesta
tınısı, yumuşak bas, yavaş akan bir ped. Yatma saatine uygun tempo (≈54 BPM),
F majör pentatonik.

Neden bu kadar uzun: oynatıcının karaoke zaman çizelgesi metinden hesaplanıyor
(packages/mock/src/fixtures/audio.ts). Ses dosyası TAM O SÜREDE olmalı ki
kelime vurgusu, ilerleme çubuğu, 15 sn atlama ve uyku modu gerçekten senkron
çalışsın. Bu yüzden süre elle seçilmedi; fixture'dan gelen 330.470 ms'tir.

Parça sonuna doğru (uyku modunun solmaya başladığı yer) melodi seyrekleşir ve
ses kısılır — "Zamanlayıcı" açıkken ekranın karartmasıyla aynı eğri.
"""

from __future__ import annotations

import array
import math
import os
import random
import struct
import sys
import wave

SR = 44_100
OUT = os.path.dirname(os.path.abspath(__file__))

# packages/mock/src/fixtures/audio.ts → SAMPLE_STORY_DURATION_MS
STORY_MS = 330_470
# PLAYER_PAGES[5].endMs - startMs (basılı kitaptaki QR'ın açtığı 6. sayfa)
PAGE6_MS = 26_000
# mockAudio('voice/...', 15_000) — ses profili önizlemesi ve sistem sesi örnekleri
SAMPLE_MS = 15_000

BITRATE_KBPS = 48


def midi_hz(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


# ── Tek nota sentezi ──────────────────────────────────────────────────────────

_note_cache: dict[tuple, array.array] = {}


def bell(note: int, dur_s: float, gain: float, bright: float = 1.0) -> array.array:
    """Çan/celesta tınısı: birkaç harmonik + üstel sönüm + hafif detune."""
    key = ("bell", note, round(dur_s, 3), round(gain, 3), round(bright, 2))
    cached = _note_cache.get(key)
    if cached is not None:
        return cached
    n = int(dur_s * SR)
    buf = array.array("d", bytes(8 * n))
    f0 = midi_hz(note)
    partials = [(1.0, 1.0, 1.05), (2.0, 0.30 * bright, 0.72), (3.0, 0.13 * bright, 0.50), (4.17, 0.05 * bright, 0.34)]
    for mult, amp, tau in partials:
        for detune in (0.9985, 1.0015):
            w = 2 * math.pi * f0 * mult * detune / SR
            decay = math.exp(-1.0 / (tau * SR))
            env = 1.0
            phase = 0.0
            a = amp * gain * 0.5
            for i in range(n):
                buf[i] += a * env * math.sin(phase)
                phase += w
                env *= decay
    # 5 ms atak — tıklama olmasın
    attack = int(0.005 * SR)
    for i in range(attack):
        buf[i] *= i / attack
    _note_cache[key] = buf
    return buf


def bass(note: int, dur_s: float, gain: float) -> array.array:
    key = ("bass", note, round(dur_s, 3), round(gain, 3))
    cached = _note_cache.get(key)
    if cached is not None:
        return cached
    n = int(dur_s * SR)
    buf = array.array("d", bytes(8 * n))
    f0 = midi_hz(note)
    for mult, amp, tau in ((1.0, 1.0, 1.4), (2.0, 0.18, 0.8)):
        w = 2 * math.pi * f0 * mult / SR
        decay = math.exp(-1.0 / (tau * SR))
        env = 1.0
        phase = 0.0
        a = amp * gain
        for i in range(n):
            buf[i] += a * env * math.sin(phase)
            phase += w
            env *= decay
    attack = int(0.04 * SR)
    for i in range(attack):
        buf[i] *= i / attack
    _note_cache[key] = buf
    return buf


def pad(notes: list[int], dur_s: float, gain: float) -> array.array:
    """Yavaş açılıp kapanan yumuşak ped — akorun altındaki 'oda tonu'."""
    key = ("pad", tuple(notes), round(dur_s, 3), round(gain, 3))
    cached = _note_cache.get(key)
    if cached is not None:
        return cached
    n = int(dur_s * SR)
    buf = array.array("d", bytes(8 * n))
    fade = int(n * 0.42)
    for note in notes:
        w = 2 * math.pi * midi_hz(note) / SR
        phase = 0.0
        a = gain / len(notes)
        for i in range(n):
            buf[i] += a * math.sin(phase)
            phase += w
    for i in range(n):
        if i < fade:
            env = i / fade
        elif i > n - fade:
            env = (n - i) / fade
        else:
            env = 1.0
        buf[i] *= env * env
    _note_cache[key] = buf
    return buf


def mix_into(master: array.array, src: array.array, at_s: float, gain: float = 1.0) -> None:
    start = int(at_s * SR)
    if start >= len(master):
        return
    end = min(len(master), start + len(src))
    for i in range(end - start):
        master[start + i] += src[i] * gain


# ── Beste ─────────────────────────────────────────────────────────────────────

# F majör: I – vi – IV – V (F, Dm, Bb, C). Akor sesleri (MIDI).
CHORDS = [
    [53, 57, 60],  # F3 A3 C4
    [50, 53, 57],  # D3 F3 A3
    [46, 50, 53],  # Bb2 D3 F3
    [48, 52, 55],  # C3 E3 G3
]
ROOTS = [41, 38, 34, 36]  # F2 D2 Bb1 C2
# F majör pentatonik, iki oktav
SCALE = [65, 67, 69, 72, 74, 77, 79, 81, 84, 86]


def compose(total_ms: int, bars: int, seed: int, sleepy_from: float = 0.78) -> array.array:
    """Ninniyi üretir. `sleepy_from` oranından sonra melodi seyrekleşir, ses kısılır."""
    total_s = total_ms / 1000.0
    n = int(round(total_s * SR))
    master = array.array("d", bytes(8 * n))
    bar_s = total_s / bars
    beat_s = bar_s / 4
    rnd = random.Random(seed)

    for b in range(bars):
        t0 = b * bar_s
        pos = b / bars
        chord = CHORDS[b % 4]
        root = ROOTS[b % 4]

        # bütün parça boyunca yumuşayan genel eğri (uyku modu ile aynı his)
        if pos < sleepy_from:
            level = 1.0
        else:
            level = 1.0 - 0.62 * ((pos - sleepy_from) / (1 - sleepy_from))
        # giriş: ilk iki tam çevrim yavaşça açılır
        if b < 8:
            level *= 0.45 + 0.55 * (b / 8)

        mix_into(master, pad(chord, bar_s * 1.05, 0.075 * level), t0)
        mix_into(master, bass(root, min(bar_s * 0.95, 3.4), 0.16 * level), t0)

        # melodi yoğunluğu: başta ve sonda seyrek, ortada dolgun
        if b < 4:
            slots = [0.0, 2.0]
        elif pos > sleepy_from:
            slots = [0.0, 2.5] if b % 2 == 0 else [1.0]
        else:
            patterns = [
                [0.0, 1.0, 2.0, 3.0],
                [0.0, 1.5, 2.0, 3.5],
                [0.0, 0.5, 2.0, 2.5, 3.5],
                [0.0, 1.0, 2.5],
                [0.0, 1.0, 2.0, 2.5, 3.0],
            ]
            slots = patterns[rnd.randrange(len(patterns))]

        prev_index = rnd.randrange(2, 6)
        for k, slot in enumerate(slots):
            if k == 0:
                # vuruş 1: akor sesine yakın bir pentatonik nota
                candidates = [s for s in SCALE if s % 12 in {c % 12 for c in chord}]
                note = candidates[rnd.randrange(len(candidates))]
                prev_index = SCALE.index(note)
            else:
                step = rnd.choice((-2, -1, -1, 1, 1, 2))
                prev_index = max(0, min(len(SCALE) - 1, prev_index + step))
                note = SCALE[prev_index]
            gain = 0.22 if k == 0 else 0.15
            gain *= level * (0.85 + 0.3 * rnd.random())
            dur = min(2.8, bar_s * 0.75)
            at = t0 + slot * beat_s
            mix_into(master, bell(note, dur, gain), at)
            # ince bir yankı hissi — aynı notanın kısılmış gecikmeleri
            mix_into(master, bell(note, dur * 0.7, gain * 0.30), at + 0.19)
            mix_into(master, bell(note, dur * 0.5, gain * 0.14), at + 0.38)

    # son 3 saniyede tamamen sönsün (kesik bitmesin)
    tail = int(3.0 * SR)
    for i in range(max(0, n - tail), n):
        master[i] *= (n - i) / tail
    return master


# ── Çıkış ─────────────────────────────────────────────────────────────────────


def to_pcm16(master: array.array) -> bytes:
    peak = max(1e-9, max(abs(v) for v in master))
    # tepe -1.5 dBFS; sıkıştırma yok, ninni dinamik kalsın
    scale = 0.84 / peak
    out = array.array("h", bytes(2 * len(master)))
    for i, v in enumerate(master):
        s = int(v * scale * 32767)
        out[i] = 32767 if s > 32767 else (-32768 if s < -32768 else s)
    return out.tobytes()


def write_mp3(pcm: bytes, path: str) -> int:
    import lameenc

    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE_KBPS)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    with open(path, "wb") as fh:
        fh.write(data)
    return len(data)


def mp3_duration_ms(path: str) -> float:
    """MP3 çerçevelerini sayarak süreyi ÖLÇER (dosyanın gerçekten çalınabilir
    olduğunu da doğrular: bozuk çerçeve varsa burada patlar)."""
    bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
    rates = [44100, 48000, 32000, 0]
    data = open(path, "rb").read()
    i = 0
    frames = 0
    sample_rate = 0
    if data[:3] == b"ID3":
        size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        i = 10 + size
    while i + 4 <= len(data):
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue
        version = (data[i + 1] >> 3) & 0x03  # 3 = MPEG1
        layer = (data[i + 1] >> 1) & 0x03  # 1 = Layer III
        br = bitrates[(data[i + 2] >> 4) & 0x0F]
        sr = rates[(data[i + 2] >> 2) & 0x03]
        pad_bit = (data[i + 2] >> 1) & 0x01
        if version != 3 or layer != 1 or br == 0 or sr == 0:
            i += 1
            continue
        sample_rate = sr
        frames += 1
        i += int(144 * br * 1000 / sr) + pad_bit
    return frames * 1152 * 1000.0 / (sample_rate or SR)


def write_wav_probe(pcm: bytes, path: str) -> None:
    with wave.open(path, "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(SR)
        fh.writeframes(pcm)


JOBS = [
    # (dosya, süre ms, bar sayısı, seed, uyku eğrisinin başladığı oran)
    ("ninni-masal", STORY_MS, 74, 20260811, 0.78),
    ("ninni-sayfa-06", PAGE6_MS, 6, 606, 0.85),
    ("ninni-ornek-sicak", SAMPLE_MS, 4, 4041, 0.80),
    ("ninni-ornek-parlak", SAMPLE_MS, 5, 9091, 0.85),
]


def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    total = 0
    for name, ms, bars, seed, sleepy in JOBS:
        if only is not None and only not in name:
            continue
        _note_cache.clear()
        master = compose(ms, bars, seed, sleepy)
        pcm = to_pcm16(master)
        path = os.path.join(OUT, f"{name}.mp3")
        size = write_mp3(pcm, path)
        total += size
        measured = mp3_duration_ms(path)
        print(
            f"{name:20s} hedef {ms/1000:7.3f} sn  ölçülen {measured/1000:7.3f} sn  "
            f"{size/1024:7.1f} KB  {BITRATE_KBPS} kbps mono {SR} Hz"
        )
    print(f"\n{'TOPLAM':20s} {total/1024:7.1f} KB")


if __name__ == "__main__":
    main()
