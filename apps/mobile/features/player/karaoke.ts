/**
 * features/player/karaoke.ts — karaoke vurgu motoru (SAF fonksiyonlar).
 *
 * SPEC §11.1 P01: "PlayerManifest.tokens üzerinde ikili arama + rAF. ML yok,
 * ağ yok, offline çalışır." Bu dosyada React yoktur; her fonksiyon deterministik
 * ve testlidir (karaoke.test.ts). rAF döngüsü `useKaraoke.ts`'dedir.
 *
 * Zaman modeli: tüm ms değerleri SES DOSYASININ BAŞINDAN itibarendir
 * (sayfa değil) — manifest böyle üretilir (contract/audio.ts).
 */

import type { PlayerManifest, PlayerPage, PlayerToken } from '@kendihikayem/contract';

/* ── İkili arama ─────────────────────────────────────────────── */

/**
 * Verilen anda AKTİF token'ın dizideki yeri. Token aralıkları [s, e) kabul
 * edilir; iki kelime arasındaki boşlukta (önceki bitti, yenisi başlamadı)
 * ÖNCEKİ kelime aktif kalır — vurgunun titremesini önler.
 * Konum ilk kelimeden önceyse -1.
 */
export function activeTokenIndex(tokens: readonly PlayerToken[], positionMs: number): number {
  if (tokens.length === 0) return -1;
  const first = tokens[0];
  if (first === undefined || positionMs < first.s) return -1;

  let low = 0;
  let high = tokens.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = tokens[mid];
    if (candidate !== undefined && candidate.s <= positionMs) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Verilen anda hangi sayfa (dizin). Sayfalar arası boşlukta önceki sayfa kalır. */
export function pageIndexAtMs(pages: readonly PlayerPage[], positionMs: number): number {
  if (pages.length === 0) return 0;
  let low = 0;
  let high = pages.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = pages[mid];
    if (candidate !== undefined && candidate.startMs <= positionMs) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Cümle vurgusu (granularity 'sentence' olduğunda). -1 = cümle başlamadı.
 *
 * Zamanlaması olmayan (startMs === endMs) cümleler ATLANIR: hizalayıcı bir
 * cümleye zaman verememişse (örn. yalnız noktalama) vurgu ona hiç uğramaz.
 * Bu yüzden dizi monotonik varsayılmaz ve erken çıkış yapılmaz.
 */
export function activeSentenceIndex(page: PlayerPage, positionMs: number): number {
  let active = -1;
  for (const sentence of page.sentences) {
    if (sentence.endMs <= sentence.startMs) continue;
    if (sentence.startMs <= positionMs) active = sentence.i;
  }
  return active;
}

/* ── Vurgu görünürlüğü ───────────────────────────────────────── */

/**
 * Kelime vurgusu bu manifest'te açılabilir mi?
 * `alignment.granularity !== 'word'` ise tokens boştur ve vurgu KAPANIR;
 * ses yine çalar (contract/audio.ts sözleşme notu).
 */
export function canWordHighlight(manifest: Pick<PlayerManifest, 'alignment'>): boolean {
  return manifest.alignment.granularity === 'word';
}

export function canSentenceHighlight(manifest: Pick<PlayerManifest, 'alignment'>): boolean {
  return (
    manifest.alignment.granularity === 'word' || manifest.alignment.granularity === 'sentence'
  );
}

/* ── Uyku modu eğrileri ──────────────────────────────────────── */

export interface BedtimeInput {
  /** 1 tabanlı geçerli sayfa numarası. */
  pageNo: number;
  totalPages: number;
  /** Manifest'ten: kararmanın başladığı sayfa. */
  fadeStartsAtPage: number;
  /** Manifest'ten: bitişte hedef ses (0..1). */
  targetEndVolume: number;
}

function fadeProgress({ pageNo, totalPages, fadeStartsAtPage }: BedtimeInput): number {
  const start = Math.min(fadeStartsAtPage, totalPages);
  if (pageNo < start) return 0;
  const span = Math.max(1, totalPages - start);
  return Math.min(1, (pageNo - start) / span);
}

/**
 * Uyku modunda ses çarpanı. Kademeli, sayfa bazlı; son sayfada
 * `targetEndVolume`'a iner. Uyku modu kapalıysa çağıran 1 kullanır.
 */
export function bedtimeVolume(input: BedtimeInput): number {
  const progress = fadeProgress(input);
  const eased = progress * progress; // yavaş başla, sona doğru derinleş
  return 1 - (1 - input.targetEndVolume) * eased;
}

/**
 * Uyku modunda ekran karartma katmanının opaklığı (0..0.6).
 * Son iki sayfada belirginleşir; hiçbir zaman tam karartmaz — ebeveyn
 * kontrolleri görmeye devam eder.
 */
export function bedtimeDim(input: BedtimeInput): number {
  const progress = fadeProgress(input);
  return Math.min(0.6, progress * 0.6);
}

/**
 * Uyku modunda tempo (playbackRate). Son 2 sayfada %8 yavaşlar — fark
 * edilmeyecek kadar az, ama ninni etkisi yaratacak kadar var.
 */
export function bedtimeRate(input: BedtimeInput): number {
  const { pageNo, totalPages } = input;
  if (totalPages < 2) return 1;
  if (pageNo >= totalPages) return 0.92;
  if (pageNo === totalPages - 1) return 0.96;
  return 1;
}

/* ── Sayfa içi ilerleme ──────────────────────────────────────── */

/** 0..1 — sayfa göstergesi ve ilerleme çubuğu için. */
export function pageProgress(page: PlayerPage, positionMs: number): number {
  const span = page.endMs - page.startMs;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (positionMs - page.startMs) / span));
}
