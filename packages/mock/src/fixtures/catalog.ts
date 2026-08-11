/**
 * catalog.ts — tema, sanat stili, karakter kurucu, sistem sesleri, kitap formatı.
 * Metinlerin tamamı ürün diliyle yazılmıştır; ekrandaki kartlarda birebir görünür.
 */

import {
  artStyleSchema,
  bookFormatSchema,
  characterOptionsSchema,
  interestSchema,
  storyThemeSchema,
  systemVoiceSchema,
  type ArtStyle,
  type BookFormat,
  type CharacterOptions,
  type Interest,
  type StoryTheme,
  type SystemVoice,
} from '@kendihikayem/contract';

import { mockAudio, mockImage } from './media';

export const THEMES: StoryTheme[] = [
  {
    code: 'cesaret',
    titleTr: 'Cesaret',
    subtitleTr: 'Korkuyla tanışmak ve bir adım atmak',
    icon: '🦁',
    ageBands: ['3-5', '6-8'],
    isReligious: false,
    sampleFirstLineTr: 'Merdivenin ilk basamağı gıcırdadı ama ayakları durmadı.',
  },
  {
    code: 'dostluk',
    titleTr: 'Dostluk',
    subtitleTr: 'Paylaşmak, beklemek, yanında olmak',
    icon: '🤝',
    ageBands: ['3-5', '6-8'],
    isReligious: false,
    sampleFirstLineTr: 'İki kişilik salıncakta üçüncü bir yer nasıl açılır?',
  },
  {
    code: 'merak',
    titleTr: 'Merak ve Keşif',
    subtitleTr: 'Sorular sormaktan korkmayan çocuklar',
    icon: '🔭',
    ageBands: ['6-8'],
    isReligious: false,
    sampleFirstLineTr: 'Bahçedeki o küçük delik nereye gidiyordu acaba?',
  },
  {
    code: 'uyku_zamani',
    titleTr: 'Uyku Zamanı',
    subtitleTr: 'Yumuşak, sakin, gözleri ağırlaştıran',
    icon: '🌙',
    ageBands: ['0-2', '3-5', '6-8'],
    isReligious: false,
    sampleFirstLineTr: 'Ay, perdenin arasından içeri usulca süzüldü.',
  },
  {
    code: 'aile',
    titleTr: 'Aile',
    subtitleTr: 'Anneanne mutfağı, dede bahçesi, kardeş kavgası',
    icon: '🏡',
    ageBands: ['0-2', '3-5', '6-8'],
    isReligious: false,
    culturalTag: 'turkiye',
    sampleFirstLineTr: 'Anneannenin mutfağından mis gibi bir kokuydu gelen.',
  },
  {
    code: 'dogayi_koru',
    titleTr: 'Doğayı Koru',
    subtitleTr: 'Bir fidan, bir kuş, bir dere',
    icon: '🌳',
    ageBands: ['6-8'],
    isReligious: false,
    sampleFirstLineTr: 'Derenin sesi bu yaz neden bu kadar kısılmıştı?',
  },
  {
    code: 'ilk_gun',
    titleTr: 'İlk Gün',
    subtitleTr: 'Okul, taşınmak, yeni bir başlangıç',
    icon: '🎒',
    ageBands: ['3-5', '6-8'],
    isReligious: false,
    sampleFirstLineTr: 'Yeni sınıfın kapısı, dünyanın en ağır kapısıydı.',
  },
  {
    code: 'masal_diyari',
    titleTr: 'Masal Diyarı',
    subtitleTr: 'Keloğlan tadında, bizden bir masal',
    icon: '🪄',
    ageBands: ['3-5', '6-8'],
    isReligious: false,
    culturalTag: 'anadolu',
    sampleFirstLineTr: 'Evvel zaman içinde, kalbur saman içinde...',
  },
  {
    code: 'bayram',
    titleTr: 'Bayram Sabahı',
    subtitleTr: 'El öpmek, şeker toplamak, kalabalık sofralar',
    icon: '🕌',
    ageBands: ['3-5', '6-8'],
    isReligious: true,
    culturalTag: 'turkiye',
    sampleFirstLineTr: 'Bayram sabahı ayakkabılar kapının önünde ışıl ışıldı.',
  },
  {
    code: 'kucuk_kahraman',
    titleTr: 'Küçük Kahraman',
    subtitleTr: 'Sorumluluk almak, birine yardım etmek',
    icon: '⭐',
    ageBands: ['6-8'],
    isReligious: false,
    sampleFirstLineTr: 'O gün kimse fark etmedi ama biri bir şeyi düzeltti.',
  },

  /*
   * ── 0-2 bandına ÖZEL temalar ────────────────────────────────────────────
   *
   * Bu dört tema olmasaydı `0-2` yalnızca `uyku_zamani` + `aile` görürdü:
   * ana sayfa öneri satırı (`themes.slice(0, 3)`) ve kategori satırı
   * (`slice(0, 6)`) yarı boş kalırdı. Daha önemlisi bebeğe kurgu verilmiş
   * olurdu — bu yaşta "hikaye" bir olay değil, adlandırma ve tekrar ritüelidir:
   * çatışma yok, tek cümlelik sayfa, her sayfada dönen bir nakarat.
   */
  {
    code: 'gunluk_ritim',
    titleTr: 'Günün Ritmi',
    subtitleTr: 'Uyanmak, yemek, banyo, uyku — tanıdık sıra',
    icon: '🌞',
    ageBands: ['0-2'],
    isReligious: false,
    sampleFirstLineTr: 'Güneş uyandı. Sen de uyandın.',
  },
  {
    code: 'sesler_ve_hayvanlar',
    titleTr: 'Sesler ve Hayvanlar',
    subtitleTr: 'Miyav, hav, mö — birlikte söylenen sayfalar',
    icon: '🐄',
    ageBands: ['0-2', '3-5'],
    isReligious: false,
    sampleFirstLineTr: 'Kim var orada? Miyav!',
  },
  {
    code: 'ilk_kelimeler',
    titleTr: 'İlk Kelimeler',
    subtitleTr: 'El, ayak, burun — göster ve söyle',
    icon: '👋',
    ageBands: ['0-2'],
    isReligious: false,
    sampleFirstLineTr: 'Bu senin elin. Şap şap!',
  },
  {
    code: 'kucuk_kucuk',
    titleTr: 'Küçük Küçük',
    subtitleTr: 'Bir kaşık, bir kedi, bir yastık — dünyanın ilk turu',
    icon: '🧸',
    ageBands: ['0-2'],
    isReligious: false,
    sampleFirstLineTr: 'Küçük bir kaşık. Küçük bir el.',
  },
].map((theme) => storyThemeSchema.parse(theme));

export const ART_STYLES: ArtStyle[] = [
  {
    code: 'suluboya',
    titleTr: 'Suluboya',
    descriptionTr: 'Yumuşak geçişler, sıcak toprak tonları, el yapımı doku',
    preview: mockImage('style/suluboya', 512, 512),
    isVector: false,
  },
  {
    code: 'pastel',
    titleTr: 'Yumuşak Pastel',
    descriptionTr: 'Puslu renkler, kalın kenarlar, uyku öncesi için ideal',
    preview: mockImage('style/pastel', 512, 512),
    isVector: false,
  },
  {
    code: 'kesik_kagit',
    titleTr: 'Kesik Kâğıt',
    descriptionTr: 'Katman katman kâğıt kolaj, güçlü siluetler',
    preview: mockImage('style/kesik-kagit', 512, 512),
    isVector: true,
  },
  {
    code: 'cizgi_defter',
    titleTr: 'Defter Çizimi',
    descriptionTr: 'İnce kalem çizgileri, noktalı gölgeler, sade renk',
    preview: mockImage('style/cizgi-defter', 512, 512),
    isVector: true,
  },
  {
    code: 'anadolu_minyatur',
    titleTr: 'Anadolu Motifleri',
    descriptionTr: 'Kilim desenleri, çini mavisi, geleneksel süslemeler',
    preview: mockImage('style/anadolu', 512, 512),
    isVector: false,
  },
].map((style) => artStyleSchema.parse(style));

export const CHARACTER_OPTIONS: CharacterOptions = characterOptionsSchema.parse({
  privacyNoteTr:
    'Çocuğunuzun fotoğrafını istemiyoruz. Kahramanı birlikte, seçeneklerden kuruyoruz.',
  fields: [
    {
      field: 'ten_tonu',
      labelTr: 'Ten tonu',
      required: true,
      options: [
        { code: 'acik', labelTr: 'Açık', swatchHex: '#F6E0CE' },
        { code: 'acik_bugday', labelTr: 'Açık buğday', swatchHex: '#EAC79B' },
        { code: 'bugday', labelTr: 'Buğday', swatchHex: '#D3A06B' },
        { code: 'esmer', labelTr: 'Esmer', swatchHex: '#A9744B' },
        { code: 'koyu', labelTr: 'Koyu', swatchHex: '#6E4529' },
      ],
    },
    {
      field: 'sac_rengi',
      labelTr: 'Saç rengi',
      required: true,
      options: [
        { code: 'siyah', labelTr: 'Siyah', swatchHex: '#1E1A17' },
        { code: 'koyu_kahve', labelTr: 'Koyu kahve', swatchHex: '#4A2F1B' },
        { code: 'kestane', labelTr: 'Kestane', swatchHex: '#7B4B2A' },
        { code: 'sari', labelTr: 'Sarı', swatchHex: '#D9A441' },
        { code: 'kizil', labelTr: 'Kızıl', swatchHex: '#B4542A' },
      ],
    },
    {
      field: 'sac_modeli',
      labelTr: 'Saç modeli',
      required: true,
      options: [
        { code: 'kisa_duz', labelTr: 'Kısa düz' },
        { code: 'omuz_dalgali', labelTr: 'Omuz hizası dalgalı' },
        { code: 'at_kuyrugu', labelTr: 'At kuyruğu' },
        { code: 'kivircik', labelTr: 'Kıvırcık' },
        { code: 'orgulu', labelTr: 'Örgülü' },
      ],
    },
    {
      field: 'goz_rengi',
      labelTr: 'Göz rengi',
      options: [
        { code: 'kahve', labelTr: 'Kahverengi', swatchHex: '#5A3A22' },
        { code: 'ela', labelTr: 'Ela', swatchHex: '#8A7B3F' },
        { code: 'yesil', labelTr: 'Yeşil', swatchHex: '#4C7A4A' },
        { code: 'mavi', labelTr: 'Mavi', swatchHex: '#4A6FA5' },
      ],
    },
    {
      field: 'kiyafet',
      labelTr: 'Kıyafet',
      options: [
        { code: 'salopet', labelTr: 'Salopet' },
        { code: 'esofman', labelTr: 'Eşofman' },
        { code: 'elbise', labelTr: 'Elbise' },
        { code: 'kazak_kot', labelTr: 'Kazak ve kot' },
      ],
    },
    {
      field: 'aksesuar',
      labelTr: 'Yanındaki arkadaş',
      multiple: true,
      options: [
        { code: 'pelus_tilki', labelTr: 'Peluş tilki' },
        { code: 'pelus_ayi', labelTr: 'Peluş ayı' },
        { code: 'kedi', labelTr: 'Kedi' },
        { code: 'gozluk', labelTr: 'Gözlük' },
        { code: 'yok', labelTr: 'Yok' },
      ],
    },
  ],
});

export const SYSTEM_VOICES: SystemVoice[] = [
  {
    code: 'deniz',
    displayName: 'Deniz',
    descriptionTr: 'Sıcak kadın sesi, sakin tempo — uyku öncesi için',
    gender: 'kadin',
    sample: mockAudio('voice/deniz', 15_000),
    ageBands: ['0-2', '3-5', '6-8'],
  },
  {
    code: 'kerem',
    displayName: 'Kerem',
    descriptionTr: 'Derin erkek sesi, masalcı tonu',
    gender: 'erkek',
    sample: mockAudio('voice/kerem', 15_000),
    ageBands: ['3-5', '6-8'],
  },
  {
    code: 'nur',
    displayName: 'Nur',
    descriptionTr: 'Neşeli kadın sesi, hareketli hikayeler için',
    gender: 'kadin',
    sample: mockAudio('voice/nur', 15_000),
    ageBands: ['0-2', '3-5'],
  },
  {
    code: 'ege',
    displayName: 'Ege',
    descriptionTr: 'Genç, nötr ton — maceralarda enerjik',
    gender: 'notr',
    sample: mockAudio('voice/ege', 15_000),
    ageBands: ['6-8'],
  },
].map((voice) => systemVoiceSchema.parse(voice));

export const BOOK_FORMATS: BookFormat[] = [
  {
    code: 'kare21_24_sert',
    titleTr: '21×21 cm · Sert kapak · 24 sayfa',
    trimMm: [210, 210],
    pageCount: 24,
    bindingTr: 'Sert kapak, mat selefon',
    paperTr: '170 gr mat kuşe iç sayfa',
    basePriceTry: 89900,
    preview: mockImage('format/kare21', 800, 800),
    etaBusinessDays: [5, 9],
  },
  {
    code: 'kare21_24_yumusak',
    titleTr: '21×21 cm · Yumuşak kapak · 24 sayfa',
    trimMm: [210, 210],
    pageCount: 24,
    bindingTr: 'Yumuşak kapak, mat selefon',
    paperTr: '150 gr mat kuşe iç sayfa',
    basePriceTry: 64900,
    preview: mockImage('format/kare21-yumusak', 800, 800),
    etaBusinessDays: [4, 8],
  },
].map((format) => bookFormatSchema.parse(format));

export const INTERESTS: Interest[] = [
  { code: 'dinozor', labelTr: 'Dinozorlar', icon: '🦕' },
  { code: 'uzay', labelTr: 'Uzay', icon: '🚀' },
  { code: 'hayvanlar', labelTr: 'Hayvanlar', icon: '🐾' },
  { code: 'futbol', labelTr: 'Futbol', icon: '⚽' },
  { code: 'muzik', labelTr: 'Müzik', icon: '🎵' },
  { code: 'deniz', labelTr: 'Deniz', icon: '🌊' },
  { code: 'resim', labelTr: 'Resim yapmak', icon: '🎨' },
  { code: 'bilim', labelTr: 'Deneyler', icon: '🔬' },
  { code: 'dans', labelTr: 'Dans', icon: '💃' },
  { code: 'yemek', labelTr: 'Mutfak', icon: '🥣' },
].map((interest) => interestSchema.parse(interest));
