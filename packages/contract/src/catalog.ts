/**
 * catalog.ts — sunucudan gelen seçim kartları: temalar, sanat stilleri,
 * Karakter Kurucu alanları, sistem sesleri, kitap formatları.
 *
 * NEDEN SUNUCUDAN: kullanıcı serbest üslup/karakter metni giremez (SPEC §8.1 ②).
 * Serbest giriş = karakter tutarsızlığı + moderasyon riski. Katalog aynı zamanda
 * uygulama güncellemesi olmadan tema eklemeyi mümkün kılar.
 *
 * Bu uçlar AUTH GEREKTİRMEZ: landing (S01) ve sihirbazın ilk adımları misafirken çalışır.
 */

import {
  ageBandSchema,
  c,
  commonErrorResponses,
  moneyTrySchema,
  signedMediaSchema,
} from './primitives';
import { z } from 'zod';

export const storyThemeSchema = z.object({
  code: z.string().min(1),
  titleTr: z.string().min(1),
  subtitleTr: z.string().optional(),
  /** Emoji ya da ikon kodu — istemci kart üzerinde gösterir. */
  icon: z.string().min(1),
  ageBands: z.array(ageBandSchema).min(1),
  /** Dini içerik: varsayılan KAPALI, ebeveyn açıkça seçer. */
  isReligious: z.boolean(),
  culturalTag: z.string().optional(),
  /** Kartın altındaki örnek ilk cümle — kullanıcı ne alacağını görür. */
  sampleFirstLineTr: z.string().min(1),
});
export type StoryTheme = z.infer<typeof storyThemeSchema>;

export const artStyleSchema = z.object({
  code: z.string().min(1),
  titleTr: z.string().min(1),
  descriptionTr: z.string().optional(),
  preview: signedMediaSchema,
  /** Vektörel stiller baskıda daha keskin çıkar. */
  isVector: z.boolean(),
});
export type ArtStyle = z.infer<typeof artStyleSchema>;

/**
 * Karakter Kurucu formu. FOTOĞRAF İSTENMEZ — ekranda bu cümle birebir yazar.
 * Alanlar sunucudan gelir; her seçeneğin kanonik İngilizce karşılığı sunucuda tutulur.
 */
export const characterOptionsSchema = z.object({
  fields: z.array(
    z.object({
      field: z.string().min(1),
      labelTr: z.string().min(1),
      /** Tek seçim mi çok seçim mi. */
      multiple: z.boolean().default(false),
      required: z.boolean().default(false),
      options: z.array(
        z.object({
          code: z.string().min(1),
          labelTr: z.string().min(1),
          /** Ten/saç/göz rengi gibi alanlarda örnek renk. */
          swatchHex: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        }),
      ),
    }),
  ),
  /** "Çocuğunuzun fotoğrafını istemiyoruz." — ekranda gösterilecek güven metni. */
  privacyNoteTr: z.string().min(1),
});
export type CharacterOptions = z.infer<typeof characterOptionsSchema>;

export const systemVoiceSchema = z.object({
  code: z.string().min(1),
  displayName: z.string().min(1),
  descriptionTr: z.string().min(1),
  gender: z.enum(['kadin', 'erkek', 'notr']),
  sample: signedMediaSchema,
  ageBands: z.array(ageBandSchema).min(1),
});
export type SystemVoice = z.infer<typeof systemVoiceSchema>;

export const bookFormatSchema = z.object({
  code: z.string().min(1),
  titleTr: z.string().min(1),
  /** [genişlik, yükseklik] mm — trim ölçüsü, bleed hariç. */
  trimMm: z.tuple([z.number().int().min(50), z.number().int().min(50)]),
  pageCount: z.number().int().min(12).max(64),
  bindingTr: z.string().min(1),
  paperTr: z.string().min(1),
  /** KURUŞ. Kargo ve adet çarpanı hariç taban fiyat. */
  basePriceTry: moneyTrySchema,
  preview: signedMediaSchema,
  etaBusinessDays: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
});
export type BookFormat = z.infer<typeof bookFormatSchema>;

/** İlgi alanı etiketi — çocuk profilinde ve sihirbazda kullanılır. */
export const interestSchema = z.object({
  code: z.string().min(1),
  labelTr: z.string().min(1),
  icon: z.string().min(1),
});
export type Interest = z.infer<typeof interestSchema>;

export const catalogContract = c.router({
  themes: {
    method: 'GET',
    path: '/v1/catalog/themes',
    summary: 'Tema kartları (S03) — auth gerektirmez',
    query: z.object({
      ageBand: ageBandSchema.optional(),
      includeReligious: z.coerce.boolean().optional(),
    }),
    responses: {
      200: z.object({ items: z.array(storyThemeSchema) }),
      ...commonErrorResponses,
    },
  },

  artStyles: {
    method: 'GET',
    path: '/v1/catalog/art-styles',
    summary: 'Sanat stili kartları (S05)',
    responses: { 200: z.object({ items: z.array(artStyleSchema) }), ...commonErrorResponses },
  },

  characterOptions: {
    method: 'GET',
    path: '/v1/catalog/character-options',
    summary: 'Karakter Kurucu alanları (S04)',
    query: z.object({ ageBand: ageBandSchema.optional() }),
    responses: { 200: characterOptionsSchema, ...commonErrorResponses },
  },

  systemVoices: {
    method: 'GET',
    path: '/v1/catalog/system-voices',
    summary: 'Sistem sesleri — ses klonlama olmadan da tam ürün',
    responses: { 200: z.object({ items: z.array(systemVoiceSchema) }), ...commonErrorResponses },
  },

  bookFormats: {
    method: 'GET',
    path: '/v1/catalog/book-formats',
    summary: 'Baskı formatları (B01)',
    responses: { 200: z.object({ items: z.array(bookFormatSchema) }), ...commonErrorResponses },
  },

  interests: {
    method: 'GET',
    path: '/v1/catalog/interests',
    summary: 'İlgi alanı etiketleri (S02 / çocuk profili)',
    responses: { 200: z.object({ items: z.array(interestSchema) }), ...commonErrorResponses },
  },
});
