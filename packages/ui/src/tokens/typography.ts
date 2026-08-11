/**
 * typography.ts — tip ölçeği.
 *
 * ERİŞİLEBİLİRLİK TABANI (SPEC §11.0): gövde metni 18 pt'nin altına İNMEZ.
 * Okuyan kişi çoğu zaman telefonu kol mesafesinde tutan yorgun bir ebeveyndir.
 *
 * MARKA FONTLARI (onaylanan Figma tasarımı): başlıklar **Fraunces** (serif,
 * hikaye kitabı hissi), gövde **Nunito** (yumuşak, çok okunaklı sans). İkisi de
 * SIL OFL; `@expo-google-fonts/*` paketlerinden APK'ya gömülür ve kök layout
 * `expo-font` ile yükler. Fontlar YÜKLENENE KADAR uygulama BEKLEMEZ:
 * `typeScale` sistem fontuyla çalışır, yükleme bitince tema `brandTypeScale`e
 * geçer (ThemeProvider `fontsReady`). Böylece splash asla fonta takılmaz.
 *
 * Okuyucu (P01) ve baskı önizlemesi için `readerFontFamily()` sözleşmedeki
 * `ReaderFont` adını RN fontFamily'ye çevirir; font paketlenmemişse sistem
 * fontuna sessizce düşer — ekran asla boş kalmaz.
 */

import { Platform, type TextStyle } from 'react-native';

export type TypeVariant =
  | 'display' // kapak başlığı, oynatıcı başlığı
  | 'title' // ekran başlığı
  | 'heading' // bölüm başlığı
  | 'body' // gövde — 18 pt taban
  | 'bodyStrong'
  | 'label' // buton, chip, sekme
  | 'caption'; // yardımcı satır — yalnız ikincil bilgi, asla tek başına talimat

/**
 * Gömülü font ailelerinin RN adları. Kök layout `useFonts` çağrısında TAM BU
 * İSİMLERLE yükler; sonraki ajanlar özel metin stillerinde bu sabiti kullanır,
 * elle 'Nunito_400Regular' yazmaz.
 */
export const fontFamilies = {
  /** Fraunces 600 — display/title/heading. */
  display: 'Fraunces_600SemiBold',
  /** Nunito 400 — gövde metni. */
  body: 'Nunito_400Regular',
  /** Nunito 500 — ikincil satırlar, meta bilgisi. */
  bodyMedium: 'Nunito_500Medium',
  /** Nunito 600 — yarı kalın etiketler. */
  bodySemiBold: 'Nunito_600SemiBold',
  /** Nunito 700 — vurgu, buton, sekme etiketi. */
  bodyBold: 'Nunito_700Bold',
  /** Nunito 800 — küçük ama çok vurgulu metin (hero rozeti). */
  bodyExtraBold: 'Nunito_800ExtraBold',
} as const;

/** Sistem fontu ölçeği — fontlar yüklenmeden önceki güvenli varsayılan. */
export const typeScale: Record<TypeVariant, TextStyle> = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.4 },
  title: { fontSize: 26, lineHeight: 33, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  body: { fontSize: 18, lineHeight: 27, fontWeight: '400' },
  bodyStrong: { fontSize: 18, lineHeight: 27, fontWeight: '700' },
  label: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
};

/**
 * Marka fontu ölçeği — Fraunces başlıklar, Nunito gövde.
 *
 * `fontWeight` BİLEREK yok: expo-font her kesimi kendi adıyla kaydeder
 * (Nunito_700Bold zaten kalındır); Android'de aile adının yanına bir de
 * fontWeight vermek sentetik ikinci kalınlaştırma yapabilir.
 */
export const brandTypeScale: Record<TypeVariant, TextStyle> = {
  display: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: 26,
    lineHeight: 33,
    letterSpacing: -0.2,
  },
  heading: { fontFamily: fontFamilies.display, fontSize: 20, lineHeight: 27 },
  body: { fontFamily: fontFamilies.body, fontSize: 18, lineHeight: 27 },
  bodyStrong: { fontFamily: fontFamilies.bodyBold, fontSize: 18, lineHeight: 27 },
  label: { fontFamily: fontFamilies.bodyBold, fontSize: 16, lineHeight: 21 },
  caption: { fontFamily: fontFamilies.bodyMedium, fontSize: 14, lineHeight: 19 },
};

/**
 * Sözleşmedeki okuyucu fontu adları (audio.ts `readerFontSchema`).
 * Font dosyası pakete eklenmişse adıyla döner; eklenmemişse `undefined` döner ve
 * RN sistem fontunu kullanır. Disleksi dostu seçenek görünürde kalır, uygulama
 * font dosyası eklendiği gün kendiliğinden devreye girer.
 */
const BUNDLED_READER_FONTS = new Set<string>([]);

export function readerFontFamily(font: string): string | undefined {
  if (BUNDLED_READER_FONTS.has(font)) return font;
  return undefined;
}

/**
 * Okuyucu tipografisi: sözleşmedeki `Typography` (sizePt + lineHeight çarpanı)
 * değerini RN stiline çevirir. Punto kullanıcı tercihiyle 18–30 arası değişir.
 */
export function readerTextStyle(options: {
  fontFamily: string;
  sizePt: number;
  lineHeight: number;
}): TextStyle {
  const fontSize = Math.max(18, Math.min(34, options.sizePt));
  return {
    fontFamily: readerFontFamily(options.fontFamily),
    fontSize,
    lineHeight: Math.round(fontSize * Math.max(1.2, Math.min(2.2, options.lineHeight))),
    // Android'de fontWeight '500' bazı cihazlarda yuvarlanır; okuyucuda normal ağırlık.
    fontWeight: Platform.select({ ios: '500', default: '400' }),
  };
}
