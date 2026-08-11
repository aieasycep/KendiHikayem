/**
 * colors.ts — KendiHikayem renk tokenları.
 *
 * TASARIM ANAYASASI (SPEC §11.0): bu bir YATMA SAATİ uygulamasıdır. Kullanıcı
 * yorgun bir ebeveyn, ışıklar kısık, çocuk yanı başında. Renkler bu sahneye göre
 * seçildi:
 *
 *  - GÜNDÜZ paleti: sıcak krem zemin, yanık turuncu birincil eylem. Beyaz değil
 *    krem — saf beyaz düşük ışıkta gözü alır.
 *  - GECE paleti (oynatıcının varsayılanı): koyu erik-lacivert zemin, kayısı
 *    birincil. Saf siyah değil — OLED'de saf siyah/parlak beyaz karşıtlığı
 *    karanlık odada rahatsız eder.
 *
 * Tüm metin/zemin çiftleri WCAG AA (≥ 4.5:1) hedefler; contrast.test.ts bunu
 * makine kontrolüne bağlar. Renk eklerken testi de güncelleyin.
 */

/** Ham palet. Bileşenler bunu DEĞİL, `light`/`dark` semantik rollerini kullanır. */
export const palette = {
  // sıcak nötrler (gündüz)
  cream50: '#FDF7ED',
  cream100: '#F6EDDD',
  cream200: '#EBDCC4',
  brown900: '#2E2113',
  brown700: '#5C4A36',
  brown500: '#84705A',

  // gece nötrleri
  night950: '#141021',
  night900: '#1B1530',
  night800: '#251D40',
  night700: '#332A52',
  mist100: '#F2EBDF',
  mist300: '#CFC4E0',
  mist500: '#9D8FBC',

  // marka
  ember600: '#B24E0A', // yanık turuncu — gündüz birincil
  ember700: '#96430B',
  apricot300: '#F2B27C', // kayısı — gece birincil
  apricot200: '#F7C99E',
  amber300: '#FFD27D', // karaoke vurgusu (gece)
  amber700: '#8A5A00', // karaoke vurgusu (gündüz)

  teal700: '#0E6A63', // ikincil vurgu (gündüz)
  teal300: '#7FD1C8', // ikincil vurgu (gece)

  // durum renkleri
  success700: '#22683B',
  success300: '#8FD8A8',
  danger700: '#A32F2F',
  danger300: '#F1A0A0',
  warning700: '#805408',
  warning300: '#F0C878',
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

/** Gündüz — kitaplık, ayarlar, baskı akışı. */
export const light: ColorRoles = {
  background: palette.cream50,
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: palette.cream100,
  border: palette.cream200,
  ink: palette.brown900,
  inkMuted: palette.brown700,
  inkOnPrimary: '#FFFFFF',
  primary: palette.ember600,
  primaryPressed: palette.ember700,
  accent: palette.teal700,
  highlight: palette.amber700,
  textDim: palette.brown500,
  success: palette.success700,
  danger: palette.danger700,
  warning: palette.warning700,
  scrim: 'rgba(20, 16, 33, 0.55)',
  shimmer: 'rgba(46, 33, 19, 0.08)',
};

/** Gece — oynatıcının varsayılanı, uyku moduna zemin. */
export const dark: ColorRoles = {
  background: palette.night950,
  surface: palette.night900,
  surfaceRaised: palette.night800,
  surfaceMuted: palette.night800,
  border: palette.night700,
  ink: palette.mist100,
  inkMuted: palette.mist300,
  inkOnPrimary: palette.night950,
  primary: palette.apricot300,
  primaryPressed: palette.apricot200,
  accent: palette.teal300,
  highlight: palette.amber300,
  textDim: palette.mist500,
  success: palette.success300,
  danger: palette.danger300,
  warning: palette.warning300,
  scrim: 'rgba(20, 16, 33, 0.72)',
  shimmer: 'rgba(242, 235, 223, 0.08)',
};
