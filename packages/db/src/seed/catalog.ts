/**
 * Catalogue seed — the editorially curated tables from schema/catalog.ts, plus the legal
 * documents and plans every environment needs before a single story can be generated.
 *
 * This is not sample data: without a theme, an art style and a book format, the generator
 * has nothing to build a prompt from. It is upserted, so re-running the seed refreshes the
 * copy without duplicating rows.
 */
import type { Database } from '../client';
import {
  artStyles,
  bookFormats,
  characterBuilderOptions,
  legalDocuments,
  plans,
  storyThemes,
  systemVoices,
  voiceScripts,
} from '../schema/index';
import { seedId, sha256 } from './ids';

const EPOCH = new Date('2026-01-01T00:00:00Z');

/* ── legal documents ──────────────────────────────────────────────────────── */

const LEGAL_BODIES = {
  aydinlatma_ses: `# Ses Verisi Aydınlatma Metni

KendiHikayem olarak, masalların sizin sesinizle seslendirilebilmesi için ses kaydınızı
işliyoruz. Ses kaydınız KVKK m.6 anlamında **özel nitelikli kişisel veri** (biyometrik veri)
sayılır ve yalnızca açık rızanızla işlenir.

- Ham ses kaydınız ayrı bir depolama alanında, ayrı bir şifreleme anahtarıyla saklanır.
- Ham kayıt en geç **30 gün** içinde imha edilir; yalnızca ses modeliniz saklanır.
- Rızanızı dilediğiniz an geri alabilirsiniz; geri aldığınızda ses modeliniz ve
  sağlayıcıdaki kopyası silinir.`,
  riza_ses_biyometrik: `# Ses Klonlama Açık Rıza Metni

Aşağıdaki işlemlere açık rıza veriyorum:

1. Sesimin kaydedilmesi ve sesimden bir ses modeli üretilmesi.
2. Bu modelin yalnızca benim hesabımdaki masalların seslendirilmesinde kullanılması.
3. Modelin üretimi için ses kaydımın yurt dışındaki hizmet sağlayıcıya aktarılması.

Sesin bana ait olduğunu ve reşit olduğumu beyan ederim. Rızamı geri alma hakkım saklıdır.`,
  aydinlatma_cocuk: `# Çocuk Verisi Aydınlatma Metni

Çocuğunuza ait olarak yalnızca **ad**, **doğum yılı** ve seçtiğiniz ilgi alanları işlenir.
Fotoğraf toplanmaz; masal kahramanı, seçtiğiniz görsel özelliklerden üretilir.
Tam doğum tarihi hiçbir aşamada istenmez.`,
  mesafeli_satis: `# Mesafeli Satış Sözleşmesi

Bu sözleşme, KendiHikayem üzerinden verdiğiniz basılı kitap siparişine ilişkindir.
Ürün, siparişinize özel olarak üretilen kişiselleştirilmiş bir üründür.`,
  on_bilgilendirme: `# Ön Bilgilendirme Formu ve Cayma Hakkı İstisnası

6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca, **tüketicinin
istekleri veya kişisel ihtiyaçları doğrultusunda hazırlanan mallara** ilişkin cayma hakkı
kullanılamaz. Kitabınız çocuğunuzun adı, görünümü ve seçtiğiniz masal ile üretildiğinden
bu istisna kapsamındadır.

Bu bilgilendirmeyi sipariş onayından **önce** okuduğunuzu ve kabul ettiğinizi
onaylamanız gerekmektedir.`,
} as const;

export async function seedLegalDocuments(db: Database): Promise<number> {
  const rows = (Object.keys(LEGAL_BODIES) as (keyof typeof LEGAL_BODIES)[]).map((kind) => {
    const bodyMd = LEGAL_BODIES[kind];
    return {
      id: seedId(`legal:${kind}`),
      kind,
      version: '2026-01-01.1',
      locale: 'tr-TR',
      bodyMd,
      bodySha256: sha256(bodyMd),
      publishedAt: EPOCH,
      effectiveFrom: EPOCH,
    };
  });

  await db
    .insert(legalDocuments)
    .values(rows)
    .onConflictDoUpdate({
      target: legalDocuments.id,
      set: { bodyMd: rows[0]!.bodyMd, bodySha256: rows[0]!.bodySha256 },
    });
  return rows.length;
}

/** The sha256 of the consent text, so `consents.document_sha256` is a real hash. */
export const consentDocumentSha = sha256(LEGAL_BODIES.riza_ses_biyometrik);

/* ── story themes ─────────────────────────────────────────────────────────── */

export async function seedStoryThemes(db: Database): Promise<number> {
  const rows = [
    {
      code: 'uyku_oncesi',
      titleTr: 'Uyku Öncesi',
      subtitleTr: 'Yavaşlayan, yumuşayan, uykuya bırakan bir masal',
      archetype: 'Yolculuk → dinlenme',
      ageBands: ['0-2', '3-5', '6-8'],
      icon: 'moon',
      promptPack: {
        tempo: 'yavaş',
        cumle_uzunlugu: 'kısa',
        nakarat: 'Ay ışığı usulca perdeden süzüldü.',
        cozum_bicimi: 'Kahraman güvenli bir yere döner ve uykuya dalar.',
        yasak: ['ani gürültü', 'kovalamaca', 'karanlıkta yalnız kalma'],
        son_sayfa: 'Çocuğun adıyla biten, fısıltı tonunda tek cümle.',
      },
      sampleFirstLineTr: 'Gökyüzü uykuya hazırlanırken, küçük bir ışık pencereye dokundu.',
      isReligious: false,
      culturalTag: null,
      sortOrder: 10,
    },
    {
      code: 'ilk_gun_okul',
      titleTr: 'Okulun İlk Günü',
      subtitleTr: 'Heyecanı korkuya bırakmayan bir başlangıç',
      archetype: 'Eşikten geçiş → kabul',
      ageBands: ['6-8'],
      icon: 'backpack',
      promptPack: {
        tempo: 'orta',
        cumle_uzunlugu: 'orta',
        cozum_bicimi: 'Kahraman bir arkadaş edinir; korku yerini merağa bırakır.',
        yasak: ['alay etme', 'öğretmenin azarlaması'],
        duygu_yayi: ['merak', 'hafif_endise', 'cozulme', 'sicak_kapanis'],
      },
      sampleFirstLineTr: 'Çantanın fermuarı, sabahın ilk sesiydi.',
      isReligious: false,
      culturalTag: null,
      sortOrder: 20,
    },
    {
      code: 'kardes_geliyor',
      titleTr: 'Kardeşim Geliyor',
      subtitleTr: 'Kıskançlığı yok saymayan, ona yer açan bir masal',
      archetype: 'Kayıp sanılan → paylaşılan yer',
      ageBands: ['0-2', '3-5', '6-8'],
      icon: 'heart',
      promptPack: {
        tempo: 'yavaş',
        cumle_uzunlugu: 'kısa',
        cozum_bicimi: 'Kahramanın yeri küçülmez, büyür.',
        yasak: ['ebeveynin kahramanı azarlaması', 'kıskançlığın ayıplanması'],
      },
      sampleFirstLineTr: 'Evde yeni bir sessizlik vardı, henüz adı yoktu.',
      isReligious: false,
      culturalTag: null,
      sortOrder: 30,
    },
    {
      code: '23_nisan',
      titleTr: '23 Nisan',
      subtitleTr: 'Bayrak, tören ve bir çocuğun günü',
      archetype: 'Hazırlık → sahne → paylaşma',
      ageBands: ['6-8'],
      icon: 'flag',
      promptPack: {
        tempo: 'canlı',
        cumle_uzunlugu: 'orta',
        cozum_bicimi: 'Kahraman sahnede yalnız değildir.',
        yasak: ['siyasi söylem', 'yarışma/kazanan-kaybeden kurgusu'],
      },
      sampleFirstLineTr: 'Okulun bahçesinde rüzgâr, bayrakları tek tek selamladı.',
      isReligious: false,
      culturalTag: 'milli_gun',
      sortOrder: 40,
    },
    {
      code: 'ramazan_aksami',
      titleTr: 'Ramazan Akşamı',
      subtitleTr: 'Sofra kurulurken geçen sıcak bir bekleyiş',
      archetype: 'Bekleyiş → buluşma',
      ageBands: ['6-8'],
      icon: 'lantern',
      promptPack: {
        tempo: 'yavaş',
        cumle_uzunlugu: 'orta',
        cozum_bicimi: 'Bekleyiş, paylaşmayla sona erer.',
        yasak: ['ibadet zorunluluğu anlatımı', 'mezhepsel ayrım', 'öğüt verici kapanış'],
      },
      sampleFirstLineTr: 'Sokak lambaları yanmadan önce, mutfaktan bir koku çıktı.',
      isReligious: true,
      culturalTag: 'dini_gun',
      sortOrder: 50,
    },
    {
      code: 'karanliktan_korkma',
      titleTr: 'Karanlıktan Korkmuyorum',
      subtitleTr: 'Korkuyu küçümsemeden küçülten bir masal',
      archetype: 'Karşılaşma → sahiplenme',
      ageBands: ['3-5', '6-8'],
      icon: 'lamp',
      promptPack: {
        tempo: 'yavaş',
        cumle_uzunlugu: 'kısa',
        cozum_bicimi: 'Karanlık kaybolmaz; kahraman onunla anlaşır.',
        yasak: ['canavar', 'ani karanlık', 'yalnız bırakılma'],
      },
      sampleFirstLineTr: 'Işık kapandığında oda hemen bitmiyordu, sadece yavaşlıyordu.',
      isReligious: false,
      culturalTag: null,
      sortOrder: 60,
    },
    /*
     * The two themes below exist only for `0-2`. Without them the band would fall back to
     * whatever older themes happen to list it, and a toddler would be handed a plot. At
     * this age there is no conflict to resolve: the "story" is a naming ritual with a
     * refrain, so the prompt pack forbids a problem rather than prescribing one.
     */
    {
      code: 'gunluk_ritim',
      titleTr: 'Günün Ritmi',
      subtitleTr: 'Uyanmak, yemek, banyo, uyku — tanıdık sıra',
      archetype: 'Tekrar → tanıma',
      ageBands: ['0-2'],
      icon: 'sun',
      promptPack: {
        tempo: 'çok yavaş',
        cumle_uzunlugu: 'tek cümle',
        sayfa_basina_kelime: [6, 14],
        nakarat: 'Sonra ne oldu? Sonra {cocuk} güldü.',
        cozum_bicimi: 'Gün, başladığı yatakta biter; çatışma yoktur.',
        yasak: ['çatışma', 'kayıp', 'ayrılık', 'sürpriz olay', 'yan karakter kalabalığı'],
        son_sayfa: 'Çocuğun adı + "iyi geceler" — fısıltı tonunda.',
      },
      sampleFirstLineTr: 'Güneş uyandı. {cocuk} da uyandı.',
      isReligious: false,
      culturalTag: null,
      sortOrder: 5,
    },
    {
      code: 'sesler_ve_hayvanlar',
      titleTr: 'Sesler ve Hayvanlar',
      subtitleTr: 'Miyav, hav, mö — birlikte söylenen sayfalar',
      archetype: 'Çağırma → yanıt',
      ageBands: ['0-2', '3-5'],
      icon: 'paw',
      promptPack: {
        tempo: 'oyuncu',
        cumle_uzunlugu: 'tek cümle',
        sayfa_basina_kelime: [6, 14],
        nakarat: 'Kim var orada?',
        cozum_bicimi: 'Her sayfada bir hayvan seslenir; son sayfada hepsi uyur.',
        yasak: ['korkutucu hayvan', 'kovalamaca', 'karanlık'],
        son_sayfa: 'Bütün sesler susar, {cocuk} uyur.',
      },
      sampleFirstLineTr: 'Kim var orada? Miyav!',
      isReligious: false,
      culturalTag: null,
      sortOrder: 6,
    },
  ];

  await db
    .insert(storyThemes)
    .values(rows)
    .onConflictDoUpdate({
      target: storyThemes.code,
      set: { titleTr: storyThemes.titleTr },
    });
  return rows.length;
}

/* ── art styles ───────────────────────────────────────────────────────────── */

export async function seedArtStyles(db: Database): Promise<number> {
  const rows = [
    {
      code: 'suluboya',
      titleTr: 'Suluboya',
      styleDnaEn:
        'soft watercolour children book illustration, visible paper grain, wet-on-wet ' +
        'bleeding edges, muted warm palette of ochre, dusty rose and sage, gentle rounded ' +
        'shapes, no harsh outlines, generous negative space',
      negativePromptEn:
        'photorealistic, 3d render, harsh contrast, text, letters, watermark, logo, ' +
        'extra fingers, deformed hands, scary, dark horror tones',
      isVector: false,
      sortOrder: 10,
    },
    {
      code: 'duz_vektor',
      titleTr: 'Düz Vektör',
      styleDnaEn:
        'flat vector children illustration, bold simple shapes, limited palette of six ' +
        'colours, thick uniform outlines, geometric composition, matte fills, no gradients',
      negativePromptEn:
        'photorealistic, texture noise, gradient mesh, text, letters, watermark, ' +
        'extra limbs, uncanny faces',
      isVector: true,
      sortOrder: 20,
    },
    {
      code: 'yumusak_pastel',
      titleTr: 'Yumuşak Pastel',
      styleDnaEn:
        'soft pastel crayon illustration, chalky texture, warm cream background, ' +
        'hand-drawn imperfect lines, cosy bedtime mood, low contrast, rounded characters',
      negativePromptEn:
        'photorealistic, neon colours, harsh shadows, text, letters, watermark, ' +
        'distorted anatomy',
      isVector: false,
      sortOrder: 30,
    },
  ];

  await db
    .insert(artStyles)
    .values(rows)
    .onConflictDoUpdate({ target: artStyles.code, set: { titleTr: artStyles.titleTr } });
  return rows.length;
}

/* ── character builder ────────────────────────────────────────────────────── */

export async function seedCharacterBuilderOptions(db: Database): Promise<number> {
  const raw: Array<[field: string, code: string, labelTr: string, dnaEn: string, hex?: string]> = [
    ['ten_tonu', 'acik', 'Açık ten', 'fair skin', '#F5DCC4'],
    ['ten_tonu', 'bugday', 'Buğday ten', 'warm olive skin', '#D9A87C'],
    ['ten_tonu', 'esmer', 'Esmer ten', 'deep brown skin', '#8D5524'],
    ['sac_rengi', 'siyah', 'Siyah', 'black hair', '#1B1B1B'],
    ['sac_rengi', 'kahverengi', 'Kahverengi', 'brown hair', '#6B4423'],
    ['sac_rengi', 'sari', 'Sarı', 'blonde hair', '#E3C16F'],
    ['sac_rengi', 'kizil', 'Kızıl', 'auburn hair', '#A83E28'],
    ['sac_tipi', 'duz', 'Düz', 'straight hair'],
    ['sac_tipi', 'dalgali', 'Dalgalı', 'wavy hair'],
    ['sac_tipi', 'kivircik', 'Kıvırcık', 'curly hair'],
    ['sac_uzunluk', 'kisa', 'Kısa', 'short hair'],
    ['sac_uzunluk', 'omuz', 'Omuz hizası', 'shoulder-length hair'],
    ['sac_uzunluk', 'uzun', 'Uzun', 'long hair'],
    ['goz_rengi', 'kahverengi', 'Kahverengi', 'brown eyes', '#5B3A1E'],
    ['goz_rengi', 'yesil', 'Yeşil', 'green eyes', '#3E7A4E'],
    ['goz_rengi', 'ela', 'Ela', 'hazel eyes', '#8A6B3A'],
    ['gozluk', 'var', 'Gözlüklü', 'wearing round glasses'],
    ['gozluk', 'yok', 'Gözlüksüz', 'no glasses'],
    ['cil', 'var', 'Çilli', 'freckles across the nose'],
    ['cil', 'yok', 'Çilsiz', 'clear skin, no freckles'],
    ['kiyafet', 'sari_tulum', 'Sarı tulum', 'yellow dungarees over a white tee'],
    ['kiyafet', 'kirmizi_elbise', 'Kırmızı elbise', 'red dress with small white dots'],
    ['kiyafet', 'mavi_esofman', 'Mavi eşofman', 'blue tracksuit with a star on the chest'],
    ['favori_oyuncak', 'pelus_ayi', 'Peluş ayı', 'a small worn teddy bear'],
    ['favori_oyuncak', 'tahta_tren', 'Tahta tren', 'a wooden toy train'],
    ['favori_oyuncak', 'kirmizi_top', 'Kırmızı top', 'a red rubber ball'],
  ];

  const rows = raw.map(([field, code, labelTr, dnaEn, swatchHex], i) => ({
    id: seedId(`cbo:${field}:${code}`),
    field,
    code,
    labelTr,
    dnaEn,
    swatchHex: swatchHex ?? null,
    sortOrder: i,
  }));

  await db.insert(characterBuilderOptions).values(rows).onConflictDoNothing();
  return rows.length;
}

/* ── book formats ─────────────────────────────────────────────────────────── */

export async function seedBookFormats(db: Database): Promise<number> {
  const rows = [
    {
      code: 'kare21_24_sert',
      titleTr: '21×21 cm · 24 sayfa · Sert kapak',
      trimWMm: '210.00',
      trimHMm: '210.00',
      bleedMm: '5.00',
      safeMm: '20.00',
      pageCount: 24,
      binding: 'sert_kapak',
      paper: '150 g mat kuşe',
      colorProfile: 'srgb',
      targetDpi: 300,
      basePriceTry: '749.00',
    },
    {
      code: 'kare21_24_amerikan',
      titleTr: '21×21 cm · 24 sayfa · Amerikan cilt',
      trimWMm: '210.00',
      trimHMm: '210.00',
      bleedMm: '5.00',
      safeMm: '20.00',
      pageCount: 24,
      binding: 'amerikan',
      paper: '150 g mat kuşe',
      colorProfile: 'srgb',
      targetDpi: 300,
      basePriceTry: '549.00',
    },
  ];

  await db
    .insert(bookFormats)
    .values(rows)
    .onConflictDoUpdate({ target: bookFormats.code, set: { titleTr: bookFormats.titleTr } });
  return rows.length;
}

/* ── system voices ────────────────────────────────────────────────────────── */

export async function seedSystemVoices(db: Database): Promise<number> {
  const rows = [
    {
      code: 'zeynep_sicak',
      displayName: 'Zeynep',
      descriptionTr: 'Sıcak, yavaş, uyku öncesi için',
      gender: 'kadin',
      provider: 'mock',
      providerVoiceId: 'mock-voice-zeynep',
      ageBands: ['0-2', '3-5', '6-8'],
      sortOrder: 10,
    },
    {
      code: 'mert_dingin',
      displayName: 'Mert',
      descriptionTr: 'Dingin, alçak tonlu anlatım',
      gender: 'erkek',
      provider: 'mock',
      providerVoiceId: 'mock-voice-mert',
      ageBands: ['0-2', '3-5', '6-8'],
      sortOrder: 20,
    },
    {
      code: 'deniz_notr',
      displayName: 'Deniz',
      descriptionTr: 'Nötr tonlu, canlı anlatım',
      gender: 'notr',
      provider: 'mock',
      providerVoiceId: 'mock-voice-deniz',
      ageBands: ['3-5', '6-8'],
      sortOrder: 30,
    },
  ];

  await db
    .insert(systemVoices)
    .values(rows)
    .onConflictDoUpdate({ target: systemVoices.code, set: { displayName: systemVoices.displayName } });
  return rows.length;
}

/* ── voice scripts ────────────────────────────────────────────────────────── */

export async function seedVoiceScripts(db: Database): Promise<number> {
  const rows = [
    {
      id: seedId('voice_script:mic_test'),
      step: 'mic_test',
      version: '1',
      titleTr: 'Mikrofon denemesi',
      bodyTr: 'Bir, iki, üç. Şimdi biraz daha yakından konuşuyorum. Çayı ocağa koydum.',
      targetSec: 8,
      toneHint: 'sakin',
    },
    {
      id: seedId('voice_script:consent_clip'),
      step: 'consent_clip',
      version: '1',
      titleTr: 'Sesli rıza',
      bodyTr:
        'Ben, bu sesin bana ait olduğunu ve on sekiz yaşından büyük olduğumu beyan ' +
        'ediyorum. Sesimden bir masal sesi üretilmesine açık rıza veriyorum.',
      targetSec: 12,
      toneHint: 'sakin',
    },
    {
      id: seedId('voice_script:passage_1'),
      step: 'passage_1',
      version: '1',
      titleTr: 'Sakin anlatım',
      bodyTr:
        'Gökyüzü yavaşça karardı. Küçük ışık, çıngıraklı bir sessizlikle pencereye ' +
        'süzüldü. Ağaçların gölgesi uzadı, çimen ıslak ve yumuşaktı. Uykunun eşiğinde, ' +
        'her şey biraz daha yavaş oluyordu.',
      targetSec: 25,
      toneHint: 'sakin',
    },
    {
      id: seedId('voice_script:passage_2'),
      step: 'passage_2',
      version: '1',
      titleTr: 'Heyecanlı anlatım',
      bodyTr:
        'Çığlık çığlığa koştular! Şaşkın bir yağmur başladı, güğümler devrildi, ' +
        'kuşlar havalandı. Öğle güneşi çatıda parlıyordu ve hiç kimse durmak istemiyordu.',
      targetSec: 22,
      toneHint: 'heyecanli',
    },
    {
      id: seedId('voice_script:passage_3'),
      step: 'passage_3',
      version: '1',
      titleTr: 'Fısıltı',
      bodyTr:
        'Şşş... Duyuyor musun? Çok yakında, çok yavaş. Işığı söndürmeden önce bir şey ' +
        'daha söyleyeceğim: yarın yine buradayız.',
      targetSec: 15,
      toneHint: 'fisilti',
    },
    {
      id: seedId('voice_script:passage_4'),
      step: 'passage_4',
      version: '1',
      titleTr: 'Diyalog',
      bodyTr:
        '"Nereye gidiyorsun?" diye sordu tilki. "Şuraya, ağacın öbür yanına," dedi ' +
        'küçük kirpi. "Peki ben de gelebilir miyim?" "Gel, ama çok yavaş yürüyeceğiz."',
      targetSec: 20,
      toneHint: 'diyalog',
    },
  ];

  await db.insert(voiceScripts).values(rows).onConflictDoNothing();
  return rows.length;
}

/* ── plans ────────────────────────────────────────────────────────────────── */

/**
 * No subscription product exists (SPEC §1): everything is a one-off credit pack or a
 * single printed book. `plans` still carries the cost cap, because the cap is what the
 * reservation protocol in schema/billing.ts checks — even the free tier needs one.
 */
export async function seedPlans(db: Database): Promise<number> {
  const rows = [
    {
      code: 'ucretsiz',
      titleTr: 'Ücretsiz Deneme',
      priceTry: '0.00',
      period: 'once',
      storyQuota: 1,
      voiceQuota: 1,
      imageTier: 'preview',
      ttsTier: 'draft',
      monthlyCostCapUsd: '2.00',
      features: { filigran: true, baski: false, indirme: false },
    },
    {
      code: 'kredi_5',
      titleTr: '5 Masal Kredisi',
      priceTry: '499.00',
      period: 'once',
      storyQuota: 5,
      voiceQuota: 2,
      imageTier: 'standard',
      ttsTier: 'quality',
      monthlyCostCapUsd: '18.00',
      features: { filigran: false, baski: true, indirme: true },
    },
    {
      code: 'kredi_20',
      titleTr: '20 Masal Kredisi',
      priceTry: '1699.00',
      period: 'once',
      storyQuota: 20,
      voiceQuota: 2,
      imageTier: 'standard',
      ttsTier: 'quality',
      monthlyCostCapUsd: '60.00',
      features: { filigran: false, baski: true, indirme: true, oncelik: true },
    },
  ];

  await db
    .insert(plans)
    .values(rows)
    .onConflictDoUpdate({ target: plans.code, set: { titleTr: plans.titleTr } });
  return rows.length;
}
