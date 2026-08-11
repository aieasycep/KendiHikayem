/**
 * story.ts — üç hikaye fixture'ı, üç FARKLI durumda.
 *
 * Amaç: FE'nin yalnızca "mutlu yol"u değil, ürünün gerçekten ürettiği ara
 * durumları da mock'la görebilmesi.
 *
 *   1. Elif ve Tavan Arasındaki Işık → `approved`: 12 sayfa tam, iki ses, kapak.
 *   2. Ahmet ve Kaybolan Deniz Feneri → `images_generating`: ilk 4 sayfa hazır,
 *      kalanı üretimde (AŞAMALI TESLİM ekranı).
 *   3. Zeynep ve Kaybolan Ninni → `outline_ready`: ⏸ KAPI 1'de bekliyor,
 *      3 karakter varyantı seçim bekliyor (S09 ekranı).
 */

import {
  storyCharacterSchema,
  storyOutlineSchema,
  storyPageSchema,
  storySchema,
  storySummarySchema,
  type Story,
  type StoryCharacter,
  type StoryOutline,
  type StoryPage,
  type StorySummary,
} from '@kendihikayem/contract';

import { IDS, storyPageId } from './ids';
import { mockImage } from './media';
import { SAMPLE_STORY, SAMPLE_STORY_PAGES, SECOND_STORY } from './story-text';
import { RENDITIONS } from './audio';

/* ── Karakterler ─────────────────────────────────────────────── */

export const ELIF_CHARACTER: StoryCharacter = storyCharacterSchema.parse({
  id: IDS.characterElif,
  role: 'kahraman',
  nameTr: 'Elif',
  isPrimary: true,
  sheet: mockImage('character/elif-sheet', 2048, 2048),
  variants: [
    { id: 'v1', image: mockImage('character/elif-v1', 1024, 1024), selected: true },
    { id: 'v2', image: mockImage('character/elif-v2', 1024, 1024) },
    { id: 'v3', image: mockImage('character/elif-v3', 1024, 1024) },
  ],
  reusable: true,
});

export const FINDIK_CHARACTER: StoryCharacter = storyCharacterSchema.parse({
  id: IDS.characterFindik,
  role: 'yardimci',
  nameTr: 'Fındık',
  isPrimary: false,
  sheet: mockImage('character/findik-sheet', 2048, 2048),
  reusable: true,
});

/* ── 1. Hikaye: tam ─────────────────────────────────────────── */

export const ELIF_PAGES: StoryPage[] = SAMPLE_STORY_PAGES.map((page) =>
  storyPageSchema.parse({
    id: storyPageId(IDS.storyElifIsik, page.pageNo),
    pageNo: page.pageNo,
    textTr: page.textTr,
    summaryTr: page.summaryTr,
    emotion: page.emotion,
    wordCount: page.textTr.trim().split(/\s+/).length,
    image: mockImage(`story/elif/sayfa-${page.pageNo}`, 2048, 2048),
    safeZone: page.safeZone,
    imageStatus: 'ready',
    editedByUser: false,
    revision: 0,
  }),
);

export const ELIF_OUTLINE: StoryOutline = storyOutlineSchema.parse({
  titleTr: SAMPLE_STORY.titleTr,
  lessonTr: SAMPLE_STORY.lessonTr,
  scenes: SAMPLE_STORY_PAGES.map((page) => ({
    pageNo: page.pageNo,
    summaryTr: page.summaryTr,
    emotion: page.emotion,
  })),
});

export const ELIF_STORY: Story = storySchema.parse({
  id: IDS.storyElifIsik,
  title: SAMPLE_STORY.titleTr,
  status: 'approved',
  childId: IDS.childElif,
  heroName: 'Elif',
  ageBand: '6-8',
  themeCode: 'cesaret',
  artStyleCode: 'suluboya',
  pageCount: 12,
  lessonTr: SAMPLE_STORY.lessonTr,
  characters: [ELIF_CHARACTER, FINDIK_CHARACTER],
  outline: ELIF_OUTLINE,
  pages: ELIF_PAGES,
  audio: RENDITIONS,
  activeJobs: [],
  cover: mockImage('story/elif/kapak', 2048, 2048),
  isFavorite: true,
  approvedAt: '2026-08-04T21:12:00Z',
  createdAt: '2026-08-04T20:44:00Z',
  readyAt: '2026-08-04T20:58:00Z',
});

/* ── 2. Hikaye: aşamalı teslim ──────────────────────────────── */

const AHMET_PAGE_TEXTS = [
  SECOND_STORY.firstPageTr,
  'Yol boyunca martılar bağırıyordu. Ahmet fenerin demir kapısına vardığında kapı aralıktı. İçerisi zifiri karanlıktı ve tuz kokuyordu. "Kimse yok mu?" diye seslendi. Sesi merdivenlerde yankılandı, sonra sustu. Karanlık, cevabı olmayan bir soru gibiydi.',
  'Yukarıdan tıkırtı geliyordu. Ahmet basamakları teker teker çıktı. En üstte, dev lambanın yanında yaşlı fenerci Rıza Amca oturuyordu; eli sarılıydı. "Ampulü değiştiremedim evladım," dedi utanarak. "Kimseden yardım istemeye de utandım."',
  'Ahmet bir an düşündü. Sonra cebindeki el fenerini yaktı ve iskeleye doğru üç kez salladı. Bu, balıkçıların "buraya gelin" işaretiydi. Aşağıda önce bir el feneri, sonra beş, sonra bütün kasaba yanıp söndü.',
];

const AHMET_SCENES = [
  'Fener yanmaz, kasaba telaşlanır; Ahmet tek başına yola çıkar.',
  'Ahmet fenere varır, kapı aralıktır, içerisi karanlıktır.',
  'Yukarıda yaralı fenerci Rıza Amca yardım istemeye utandığını söyler.',
  'Ahmet el feneriyle kasabaya işaret verir.',
  'Balıkçılar merdivenleri tırmanır, herkes bir iş üstlenir.',
  'Yeni ampul çok ağırdır; tek başına taşınamaz.',
  'Ahmet halat düğümünü dedesinden öğrendiği gibi atar.',
  'Ampul yerine oturur ama kablo eksiktir.',
  'Rıza Amca sağlam eliyle tarif eder, çocuklar uygular.',
  'Fener bir kez titrer ve söner; herkes sessizleşir.',
  'İkinci denemede fener yanar, deniz aydınlanır.',
  'Rıza Amca yardım istemenin utanılacak bir şey olmadığını öğrenir.',
];

export const AHMET_PAGES: StoryPage[] = AHMET_SCENES.map((summary, index) => {
  const pageNo = index + 1;
  const hasContent = pageNo <= 4;
  return storyPageSchema.parse({
    id: storyPageId(IDS.storyAhmetDeniz, pageNo),
    pageNo,
    textTr: hasContent ? AHMET_PAGE_TEXTS[index] : undefined,
    summaryTr: summary,
    emotion: hasContent ? 'kararlilik' : 'merak',
    wordCount: hasContent ? AHMET_PAGE_TEXTS[index]!.trim().split(/\s+/).length : undefined,
    image: hasContent ? mockImage(`story/ahmet/sayfa-${pageNo}`, 2048, 2048) : undefined,
    safeZone: 'bottom',
    imageStatus: hasContent ? 'ready' : pageNo === 5 ? 'generating' : 'pending',
    editedByUser: false,
    revision: 0,
  });
});

export const AHMET_STORY: Story = storySchema.parse({
  id: IDS.storyAhmetDeniz,
  title: SECOND_STORY.titleTr,
  status: 'images_generating',
  childId: IDS.childAhmet,
  heroName: 'Ahmet',
  ageBand: '6-8',
  themeCode: 'dostluk',
  artStyleCode: 'pastel',
  pageCount: 12,
  lessonTr: SECOND_STORY.lessonTr,
  characters: [
    storyCharacterSchema.parse({
      id: storyPageId(IDS.storyAhmetDeniz, 90),
      role: 'kahraman',
      nameTr: 'Ahmet',
      isPrimary: true,
      sheet: mockImage('character/ahmet-sheet', 2048, 2048),
      reusable: true,
    }),
  ],
  outline: storyOutlineSchema.parse({
    titleTr: SECOND_STORY.titleTr,
    lessonTr: SECOND_STORY.lessonTr,
    scenes: AHMET_SCENES.map((summaryTr, index) => ({
      pageNo: index + 1,
      summaryTr,
      emotion: 'kararlilik',
    })),
  }),
  pages: AHMET_PAGES,
  audio: [],
  activeJobs: [
    { jobId: IDS.jobFill, kind: 'image_book', etaMs: 240_000, eventsUrl: `/v1/jobs/${IDS.jobFill}/events` },
  ],
  cover: mockImage('story/ahmet/kapak', 2048, 2048),
  isFavorite: false,
  createdAt: '2026-08-10T19:02:00Z',
});

/* ── 3. Hikaye: ⏸ KAPI 1'de bekliyor ────────────────────────── */

const ZEYNEP_SCENES = [
  'Zeynep uyumak istemez; ninnisini kaybettiğini söyler.',
  'Yastığın altına bakar, ninni orada değildir.',
  'Perdenin arkasında ay ışığı bir iz bırakmıştır.',
  'Ay, ninniyi rüzgârın aldığını fısıldar.',
  'Zeynep terliklerini giyer, balkona çıkar.',
  'Rüzgâr ninninin ilk cümlesini geri verir.',
  'Kedi Pamuk ikinci cümleyi mırıldanır.',
  'Bahçedeki nar ağacı üçüncü cümleyi hışırdar.',
  'Zeynep cümleleri sırayla dizmeye çalışır.',
  'Sıra karışır, ninni komik bir şarkıya döner; Zeynep güler.',
  'Annesi balkona gelir ve doğru sırayı hatırlatır.',
  'Ninni tamamlanır, Zeynep annesinin kucağında uyuyakalır.',
];

export const ZEYNEP_OUTLINE: StoryOutline = storyOutlineSchema.parse({
  titleTr: 'Zeynep ve Kaybolan Ninni',
  lessonTr: 'Kaybolan şeyler bazen sevdiklerimizle birlikte yeniden bulunur.',
  scenes: ZEYNEP_SCENES.map((summaryTr, index) => ({
    pageNo: index + 1,
    summaryTr,
    emotion: index >= 9 ? 'huzur' : 'merak',
  })),
});

export const ZEYNEP_STORY: Story = storySchema.parse({
  id: IDS.storyZeynepTaslak,
  title: 'Zeynep ve Kaybolan Ninni',
  status: 'outline_ready',
  childId: IDS.childZeynep,
  heroName: 'Zeynep',
  ageBand: '3-5',
  themeCode: 'uyku_zamani',
  artStyleCode: 'pastel',
  pageCount: 12,
  lessonTr: ZEYNEP_OUTLINE.lessonTr,
  characters: [
    storyCharacterSchema.parse({
      id: storyPageId(IDS.storyZeynepTaslak, 90),
      role: 'kahraman',
      nameTr: 'Zeynep',
      isPrimary: true,
      variants: [
        { id: 'v1', image: mockImage('character/zeynep-v1', 1024, 1024) },
        { id: 'v2', image: mockImage('character/zeynep-v2', 1024, 1024) },
        { id: 'v3', image: mockImage('character/zeynep-v3', 1024, 1024) },
      ],
      reusable: false,
    }),
  ],
  outline: ZEYNEP_OUTLINE,
  pages: ZEYNEP_SCENES.map((summaryTr, index) =>
    storyPageSchema.parse({
      id: storyPageId(IDS.storyZeynepTaslak, index + 1),
      pageNo: index + 1,
      summaryTr,
      emotion: 'merak',
      safeZone: 'bottom',
      imageStatus: 'pending',
      editedByUser: false,
      revision: 0,
    }),
  ),
  audio: [],
  activeJobs: [
    {
      jobId: IDS.jobOutline,
      kind: 'story_outline',
      eventsUrl: `/v1/jobs/${IDS.jobOutline}/events`,
    },
  ],
  isFavorite: false,
  createdAt: '2026-08-10T19:26:00Z',
});

export const STORIES: Story[] = [ELIF_STORY, AHMET_STORY, ZEYNEP_STORY];

export const STORY_SUMMARIES: StorySummary[] = [
  {
    id: ELIF_STORY.id,
    title: ELIF_STORY.title!,
    cover: ELIF_STORY.cover,
    childName: 'Elif',
    ageBand: '6-8',
    status: 'approved',
    hasAudio: true,
    voiceLabels: ['Anne', 'Sistem sesi — Deniz'],
    isFavorite: true,
    printedCount: 1,
    lastReadPageNo: 3,
    createdAt: ELIF_STORY.createdAt,
  },
  {
    id: AHMET_STORY.id,
    title: AHMET_STORY.title!,
    cover: AHMET_STORY.cover,
    childName: 'Ahmet',
    ageBand: '6-8',
    status: 'images_generating',
    hasAudio: false,
    voiceLabels: [],
    isFavorite: false,
    printedCount: 0,
    createdAt: AHMET_STORY.createdAt,
  },
  {
    id: ZEYNEP_STORY.id,
    title: ZEYNEP_STORY.title!,
    childName: 'Zeynep',
    ageBand: '3-5',
    status: 'outline_ready',
    hasAudio: false,
    voiceLabels: [],
    isFavorite: false,
    printedCount: 0,
    createdAt: ZEYNEP_STORY.createdAt,
  },
].map((summary) => storySummarySchema.parse(summary));
