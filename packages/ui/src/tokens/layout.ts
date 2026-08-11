/**
 * layout.ts — boşluk, yarıçap, gölge, dokunma hedefi ve hareket tokenları.
 *
 * TEK ELLE KULLANIM: yatma saatinde ebeveynin bir kolu çoğu zaman çocuğun
 * altındadır. Dokunma hedefleri 48dp tabanlıdır; birincil eylemler ekranın alt
 * yarısına yerleşir (bileşen değil ekran kararı, ama token bunu mümkün kılar).
 */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 32,
  /** Kapak görselleri — kitap hissi için hafif köşe. */
  cover: 12,
  pill: 999,
} as const;

/** Minimum dokunma hedefi (Android erişilebilirlik yönergesi). */
export const touchTarget = {
  minHeight: 48,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

/**
 * Hareket süreleri (ms). Yatma saati uygulamasında hareket YUMUŞAKTIR:
 * sıçrayan yaylar yok, kısa ve sakin geçişler var.
 */
export const motion = {
  /** Bası geri bildirimi, chip seçimi. */
  quick: 120,
  /** Sheet açılışı, sayfa içi geçiş. */
  standard: 240,
  /** Sayfa çevirme, çapraz söndürme. */
  gentle: 420,
  /** Uyku modu karartması — fark edilmeyecek kadar yavaş. */
  drowsy: 1800,
} as const;

/**
 * Gölge yerine kenarlık + hafif elevation: koyu temada gölge görünmez,
 * kenarlık her iki temada da yüzey ayrımını taşır.
 */
export const elevation = {
  card: { borderWidth: 1 },
  raised: { borderWidth: 1, elevation: 3 },
} as const;
