/**
 * Embedded demo content for the very first APK.
 *
 * These are NOT the project's mock fixtures — packages/mock (owned by A0-CONTRACT) is the
 * real MSW/fixture source and will replace this file. This exists so that a tester who
 * sideloads the debug APK has something to open instead of an empty library.
 *
 * Every demo item is flagged `isDemo` and rendered with a visible "DEMO" badge so that a
 * placeholder can never be mistaken for a story the user actually generated.
 */

export type AgeBand = '3-5' | '6-8' | '9-12';

export interface DemoPage {
  pageNo: number;
  textTr: string;
}

export interface DemoStory {
  id: string;
  isDemo: true;
  titleTr: string;
  childName: string;
  ageBand: AgeBand;
  themeTr: string;
  artStyleTr: string;
  /** Back-cover blurb shown on the library card and at the top of the story screen. */
  blurbTr: string;
  lessonTr: string;
  voiceLabelTr: string;
  pageCount: number;
  durationMinutes: number;
  createdAt: string;
  pages: DemoPage[];
}

export const DEMO_STORY: DemoStory = {
  id: 'demo-1',
  isDemo: true,
  titleTr: 'Elif ve Tavan Arasındaki Işık',
  childName: 'Elif',
  ageBand: '3-5',
  themeTr: 'Cesaret',
  artStyleTr: 'Suluboya',
  blurbTr:
    'Elif bir gece tavan arasından gelen yumuşacık bir ışık fark eder. Merdivenin ilk basamağı gıcırdar, ikincisi de. Elif korkar ama merakı korkusundan biraz daha büyüktür. Yukarıda onu bekleyen şey, hiç ummadığı kadar sıcak bir arkadaşlıktır.',
  lessonTr: 'Korkmak ayıp değildir; korkuyla birlikte bir adım daha atabilmek cesarettir.',
  voiceLabelTr: 'Örnek anlatıcı',
  pageCount: 12,
  durationMinutes: 6,
  createdAt: '2026-08-01T19:30:00Z',
  pages: [
    {
      pageNo: 1,
      textTr:
        'Elif yatağına uzandığında evin bütün ışıkları çoktan sönmüştü. Tavan arasından gelen o küçük parıltıyı ilk kez o gece gördü.',
    },
    {
      pageNo: 2,
      textTr:
        'Yorganını çenesine kadar çekti. "Sadece bir yıldızdır," dedi kendi kendine. Ama yıldızlar tavan arasında yaşamazdı ki.',
    },
    {
      pageNo: 3,
      textTr:
        'Merdivenin ilk basamağı gıcırdadı. Elif durdu, bekledi. Kalbi kulaklarında atıyordu ama ayakları bir basamak daha çıktı.',
    },
  ],
};

export const DEMO_STORIES: DemoStory[] = [DEMO_STORY];

/** Voice profiles shown on the "Ses" screen while the real API is not wired up. */
export const DEMO_VOICE_PROFILES = [
  {
    id: 'demo-voice-1',
    isDemo: true as const,
    displayNameTr: 'Örnek anlatıcı',
    relationTr: 'Sistem sesi',
    statusTr: 'Hazır',
    qualityBadgeTr: 'İyi',
  },
];
