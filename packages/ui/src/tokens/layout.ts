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

/**
 * Yarıçap ölçeği — Figma `--radius: 16px` tabanlı: sm = taban-4, md = taban,
 * lg = taban+4, xl = taban+8 (hero kart 24).
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  /** Kapak görselleri — kitap hissi için hafif köşe. */
  cover: 14,
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
 * Kenarlık + tasarımdaki yumuşak gölge: kenarlık koyu temada yüzey ayrımını
 * taşır, gölge gündüz temasında kartlara Figma'daki "kalkık kâğıt" hissini verir.
 * (Figma: 0 2px 8px rgba(0,0,0,0.04) / 0 4px 16px rgba(0,0,0,0.06)).
 */
export const elevation = {
  card: {
    borderWidth: 1,
    shadowColor: '#2C2825',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    borderWidth: 1,
    shadowColor: '#2C2825',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;
