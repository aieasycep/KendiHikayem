/**
 * typography.ts — tip ölçeği.
 *
 * ERİŞİLEBİLİRLİK TABANI (SPEC §11.0): gövde metni 18 pt'nin altına İNMEZ.
 * Okuyan kişi çoğu zaman telefonu kol mesafesinde tutan yorgun bir ebeveyndir.
 *
 * Font aileleri: uygulama fontu sistem fontudur (ekstra indirme yok, TR glifleri
 * garantili). Okuyucu (P01) ve baskı önizlemesi için `readerFontFamily()` sözleşmedeki
 * `ReaderFont` adını RN fontFamily'ye çevirir; font paketlenmemişse sistem fontuna
 * sessizce düşer — ekran asla boş kalmaz.
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
