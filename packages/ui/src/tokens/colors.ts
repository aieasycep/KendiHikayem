/**
 * colors.ts — KendiHikayem renk tokenları.
 *
 * KAYNAK: onaylanan Figma tasarımı (`design/figma/src/index.css`). Değerler
 * oradan birebir alınmıştır; yalnızca WCAG AA'yı geçemeyen metin renkleri
 * koyulaştırılmıştır (aşağıda tek tek işaretli). ROL İSİMLERİ DEĞİŞMEDİ —
 * 32 ekran bu isimleri tüketiyor; palet değişince ekranlar kendiliğinden
 * yeni tasarıma geçer.
 *
 *  - GÜNDÜZ paleti: sıcak krem zemin (#FAF8F4), masal moru birincil eylem
 *    (#7C5CBF), mercan vurgu. Beyaz değil krem — saf beyaz düşük ışıkta gözü alır.
 *  - GECE paleti (oynatıcının varsayılanı): lacivert gece zemini (#0D1B2E),
 *    açık mor birincil. Saf siyah değil — OLED'de saf siyah/parlak beyaz
 *    karşıtlığı karanlık odada rahatsız eder.
 *
 * Tüm metin/zemin çiftleri WCAG AA (≥ 4.5:1) hedefler; contrast.test.ts bunu
 * makine kontrolüne bağlar. Renk eklerken testi de güncelleyin.
 */

/** Ham palet. Bileşenler bunu DEĞİL, `light`/`dark` semantik rollerini kullanır. */
export const palette = {
  // sıcak nötrler (gündüz) — Figma: --background/--card/--muted/--border/--foreground
  cream: '#FAF8F4',
  warmWhite: '#FFF9F2',
  sand: '#F2EDE6',
  linen: '#E8E0D4',
  ink900: '#2C2825',
  taupe600: '#7A6D62', // Figma --muted-foreground (#8A7D72) AA için koyulaştırıldı
  taupe500: '#8A7D72',

  // marka morları — Figma: --primary/--secondary/--ring
  purple600: '#7C5CBF',
  purple700: '#6A4CA8',
  purple800: '#5A4190',
  lavender: '#B09CE0',
  lavenderMist: '#EDE8F8',
  lavenderPale: '#D4C8F0',

  // yardımcı renkler — Figma yardımcı paleti
  dustyBlue: '#7BA7C9',
  peach: '#F5C4A8',
  sage: '#8DB89A',
  coral: '#F08B6E',
  coral700: '#B85336', // koyulaştırılmış mercan — metin olarak AA geçer
  amber300: '#FFD27D', // karaoke vurgusu (gece)
  amber700: '#8A5A00', // karaoke vurgusu (gündüz)

  // gece paleti — Figma: --night-*
  night950: '#0D1B2E', // --night-bg
  night900: '#162035', // --night-card
  night800: '#1E2D45', // --night-surface
  night700: '#2C3D5C', // gece kenarlığı (night-surface bir kademe açık)
  nightMuted: '#6B7A94', // --night-muted
  nightMutedBright: '#8B9BB5', // --night-muted AA için açıldı (metin rolü)
  nightPurple: '#9B7FD4', // --night-purple
  nightBlue: '#4A7FB5', // --night-blue
  deepPlum: '#1A0F3C', // splash degrade başlangıcı
  royalPurple: '#2D1B69', // splash / hero degrade orta noktası
  moonGold: '#FFDC96', // splash ayı ve kitap logosu

  // durum renkleri
  success700: '#22683B',
  success300: '#8FD8A8',
  danger700: '#A32F2F',
  danger300: '#F1A0A0',
  warning700: '#805408',
  warning300: '#F0C878',

  /* ── @deprecated eski isimler — yeni palete köprü ─────────────
   * Eski turuncu/krem paletin anahtarları. Ekranlar semantik rolleri
   * kullandığı için normalde buraya dokunulmaz; derleme kırılmasın diye
   * en yakın yeni değere işaret ederler. YENİ KODDA KULLANMAYIN. */
  cream50: '#FAF8F4',
  cream100: '#F2EDE6',
  cream200: '#E8E0D4',
  brown900: '#2C2825',
  brown700: '#7A6D62',
  brown500: '#8A7D72',
  mist100: '#E8E0D4',
  mist300: '#8B9BB5',
  mist500: '#6B7A94',
  ember600: '#7C5CBF',
  ember700: '#6A4CA8',
  apricot300: '#9B7FD4',
  apricot200: '#B09CE0',
  teal700: '#B85336',
  teal300: '#7BA7C9',
} as const;

/**
 * Semantik renk rolleri. Ekran kodu yalnızca bu arayüzü görür; palet değişirse
 * ekranlar değişmez.
 */
export interface ColorRoles {
  /** Ekran zemini. */
  background: string;
  /** Kart / liste zemini. */
  surface: string;
  /** Zeminden bir kademe kalkık yüzey (sheet, seçili kart). */
  surfaceRaised: string;
  /** Bastırılmış yüzey (skeleton, pasif chip). */
  surfaceMuted: string;
  /** Çizgiler. */
  border: string;
  /** Ana metin. */
  ink: string;
  /** İkincil metin. AA'yı background üzerinde korur. */
  inkMuted: string;
  /** Ters metin (birincil butonun üstü). */
  inkOnPrimary: string;
  /** Birincil eylem. Her ekranda TEK birincil buton (SPEC §11.0). */
  primary: string;
  primaryPressed: string;
  /** İkincil vurgu (bağlantı, seçim durumu). */
  accent: string;
  /** Karaoke aktif kelime rengi. */
  highlight: string;
  /** Karaoke'de henüz okunmamış kelimeler. */
  textDim: string;
  success: string;
  danger: string;
  warning: string;
  /** Fotoğraf üstü karartma şeridi (oynatıcı metin paneli). */
  scrim: string;
  /** Skeleton parlaması. */
  shimmer: string;
}

/** Gündüz — ana sayfa, kitaplık, ayarlar, baskı akışı. */
export const light: ColorRoles = {
  background: palette.cream,
  surface: '#FFFFFF',
  surfaceRaised: palette.lavenderMist,
  surfaceMuted: palette.sand,
  border: palette.linen,
  ink: palette.ink900,
  inkMuted: palette.taupe600,
  inkOnPrimary: '#FFFFFF',
  primary: palette.purple600,
  primaryPressed: palette.purple700,
  accent: palette.coral700,
  highlight: palette.amber700,
  textDim: palette.taupe500,
  success: palette.success700,
  danger: palette.danger700,
  warning: palette.warning700,
  scrim: 'rgba(13, 27, 46, 0.55)',
  shimmer: 'rgba(44, 40, 37, 0.08)',
};

/** Gece — oynatıcının varsayılanı, uyku moduna zemin. */
export const dark: ColorRoles = {
  background: palette.night950,
  surface: palette.night900,
  surfaceRaised: palette.night800,
  surfaceMuted: palette.night800,
  border: palette.night700,
  ink: palette.linen,
  inkMuted: palette.nightMutedBright,
  inkOnPrimary: palette.night950,
  primary: palette.nightPurple,
  primaryPressed: palette.lavender,
  accent: palette.dustyBlue,
  highlight: palette.amber300,
  textDim: palette.nightMuted,
  success: palette.success300,
  danger: palette.danger300,
  warning: palette.warning300,
  scrim: 'rgba(4, 10, 20, 0.72)',
  shimmer: 'rgba(232, 224, 212, 0.08)',
};
