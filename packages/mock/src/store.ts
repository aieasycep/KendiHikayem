/**
 * store.ts — mock'un belleğe yazan durumu.
 *
 * Mock salt okunur bir fixture yığını DEĞİLDİR: hikaye oluşturursanız kitaplıkta
 * görünür, iskeleti onaylarsanız durum ilerler, sayfa metnini düzenlerseniz ses
 * `stale` olur. FE bu davranış olmadan gerçek akışı prova edemez.
 *
 * Uzun işler ZAMANA BAĞLI ilerler: `GET /v1/jobs/:id` her çağrıldığında geçen
 * süreye göre bir sonraki adımı döner (`jobSpeed` ile hızlandırılmış). Yani
 * polling yolu da SSE yolu da aynı senaryoyu oynatır.
 */

import type {
  Child,
  ConsentState,
  Entitlements,
  Job,
  JobKind,
  Me,
  Order,
  ReadingPreferences,
  Story,
  StoryExport,
  StorySummary,
  VoiceProfile,
} from '@kendihikayem/contract';

import {
  CHILDREN,
  CONSENT_STATE_GRANTED,
  CREDIT_ENTRIES,
  ENTITLEMENTS,
  EXPORTS,
  ME,
  ORDERS,
  PROGRESS_SCRIPTS,
  STORIES,
  STORY_SUMMARIES,
  VOICE_PROFILES,
} from './fixtures';
import { mockConfig } from './scenarios';

export interface JobRuntime {
  id: string;
  kind: JobKind;
  startedAtMs: number;
  storyId?: string;
  voiceProfileId?: string;
  orderId?: string;
  /** Bu adımda kalıcı olarak dur ve onay bekle (⏸ KAPI 1). */
  waitApprovalAtEnd?: boolean;
  /** Sağlayıcı arızası senaryosunda hangi adımda çöksün. */
  failAtStep?: number;
}

export interface IdempotencyRecord {
  path: string;
  bodyHash: string;
  status: number;
  body: string;
}

export interface MockState {
  me: Me;
  entitlements: Entitlements;
  consents: ConsentState;
  children: Child[];
  stories: Map<string, Story>;
  summaries: Map<string, StorySummary>;
  voiceProfiles: VoiceProfile[];
  orders: Order[];
  exports: StoryExport[];
  credits: { balance: number; entries: typeof CREDIT_ENTRIES };
  jobs: Map<string, JobRuntime>;
  readingPreferences: ReadingPreferences;
  /** storyId → kaldığı yer */
  progress: Map<string, { pageNo: number; positionMs: number; renditionId?: string }>;
  /** `${voiceProfileId}:${step}` → deneme sayısı */
  takeAttempts: Map<string, number>;
  idempotency: Map<string, IdempotencyRecord>;
  eventSeq: number;
  /**
   * Mock'un doğduğu an. Aşamalı görsel teslimi buna göre ilerler
   * (fixtures/story.ts → `advanceGeneratingImages`). `resetStore()` bunu da
   * sıfırlar; senaryo baştan izlenebilsin.
   */
  startedAtMs: number;
}

const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  typography: { fontFamily: 'Andika', sizePt: 20, lineHeight: 1.5 },
  wordHighlight: true,
  bedtimeMode: { enabled: true, fadeStartsAtPage: 10, targetEndVolume: 0.35 },
  autoPageTurn: true,
};

function seed(): MockState {
  return {
    me: structuredClone(ME),
    entitlements: structuredClone(ENTITLEMENTS),
    consents: structuredClone(CONSENT_STATE_GRANTED),
    children: structuredClone(CHILDREN),
    stories: new Map(STORIES.map((story) => [story.id as string, structuredClone(story)])),
    summaries: new Map(
      STORY_SUMMARIES.map((summary) => [summary.id as string, structuredClone(summary)]),
    ),
    voiceProfiles: structuredClone(VOICE_PROFILES),
    orders: structuredClone(ORDERS),
    exports: structuredClone(EXPORTS),
    credits: { balance: 340, entries: structuredClone(CREDIT_ENTRIES) },
    jobs: new Map(),
    readingPreferences: structuredClone(DEFAULT_READING_PREFERENCES),
    progress: new Map([[STORIES[0]!.id as string, { pageNo: 3, positionMs: 42_000 }]]),
    takeAttempts: new Map(),
    idempotency: new Map(),
    eventSeq: 0,
    startedAtMs: Date.now(),
  };
}

let state: MockState = seed();

export function store(): MockState {
  return state;
}

/** Testler arasında çağırın; mock'u ilk günkü hâline döndürür. */
export function resetStore(): void {
  state = seed();
}

export function nextSeq(): number {
  state.eventSeq += 1;
  return state.eventSeq;
}

/* ── İş simülasyonu ──────────────────────────────────────────── */

export function startJob(runtime: Omit<JobRuntime, 'startedAtMs'>): JobRuntime {
  const job: JobRuntime = { ...runtime, startedAtMs: Date.now() };
  if (mockConfig().scenario === 'saglayici_arizasi' && job.failAtStep === undefined) {
    job.failAtStep = 1;
  }
  state.jobs.set(job.id, job);
  return job;
}

export interface JobSnapshot {
  job: Job;
  stepIndex: number;
  finished: boolean;
}

/** Geçen süreye göre işin o anki hâlini üretir. */
export function snapshotJob(runtime: JobRuntime, nowMs = Date.now()): JobSnapshot {
  const script = PROGRESS_SCRIPTS[runtime.kind];
  const speed = Math.max(1, mockConfig().jobSpeed);
  const elapsed = (nowMs - runtime.startedAtMs) * speed;

  let consumed = 0;
  let stepIndex = script.length - 1;
  for (let i = 0; i < script.length; i += 1) {
    consumed += script[i]!.realMs;
    if (elapsed < consumed) {
      stepIndex = i;
      break;
    }
  }

  const totalMs = script.reduce((sum, step) => sum + step.realMs, 0);
  const finished = elapsed >= totalMs;
  const failed = runtime.failAtStep !== undefined && stepIndex >= runtime.failAtStep;

  let status: Job['status'] = 'running';
  if (failed) status = 'failed';
  else if (finished) status = runtime.waitApprovalAtEnd ? 'waiting_approval' : 'succeeded';

  const step = script[stepIndex]!;
  const job: Job = {
    id: runtime.id as Job['id'],
    kind: runtime.kind,
    status,
    progress: {
      current: finished ? script.length : stepIndex + 1,
      total: script.length,
      labelTr: runtime.waitApprovalAtEnd && finished ? 'İskelet hazır — onayınızı bekliyor' : step.labelTr,
    },
    etaMs: Math.max(0, Math.round((totalMs - Math.min(elapsed, totalMs)) / speed)),
    storyId: runtime.storyId as Job['storyId'],
    voiceProfileId: runtime.voiceProfileId as Job['voiceProfileId'],
    orderId: runtime.orderId as Job['orderId'],
    steps: script.map((item, index) => ({
      stepKey: item.labelTr,
      status:
        index < stepIndex || finished
          ? 'succeeded'
          : index === stepIndex
            ? failed
              ? 'failed'
              : 'running'
            : 'pending',
      attempt: 1,
    })),
    queuedAt: new Date(runtime.startedAtMs).toISOString().replace('.000Z', 'Z') as Job['queuedAt'],
    startedAt: new Date(runtime.startedAtMs + 500)
      .toISOString()
      .replace('.000Z', 'Z') as Job['startedAt'],
  };

  return { job, stepIndex, finished: finished || failed };
}

export function getJobSnapshot(jobId: string): JobSnapshot | undefined {
  const runtime = state.jobs.get(jobId);
  if (!runtime) return undefined;
  return snapshotJob(runtime);
}

/* ── Yardımcılar ─────────────────────────────────────────────── */

export function findStory(storyId: string): Story | undefined {
  return state.stories.get(storyId);
}

export function upsertStory(story: Story): void {
  state.stories.set(story.id as string, story);
  const existing = state.summaries.get(story.id as string);
  state.summaries.set(story.id as string, {
    ...(existing ?? {
      id: story.id,
      title: story.title ?? 'İsimsiz hikaye',
      ageBand: story.ageBand,
      hasAudio: false,
      voiceLabels: [],
      isFavorite: false,
      printedCount: 0,
      createdAt: story.createdAt,
    }),
    id: story.id,
    title: story.title ?? existing?.title ?? 'İsimsiz hikaye',
    status: story.status,
    cover: story.cover,
    isFavorite: story.isFavorite,
    hasAudio: story.audio.length > 0,
    voiceLabels: story.audio.map((rendition) => rendition.voiceLabel),
  } as StorySummary);
}

/** Kredi düşer ve deftere satır yazar. Yetmezse false döner. */
export function spendCredits(amount: number, reasonTr: string, storyId?: string): boolean {
  if (state.credits.balance < amount) return false;
  state.credits.balance -= amount;
  state.entitlements = {
    ...state.entitlements,
    credits: state.credits.balance,
  };
  state.credits.entries = [
    {
      id: `cr-${state.credits.entries.length + 1}`,
      at: new Date().toISOString().replace('.000Z', 'Z'),
      delta: -amount,
      balanceAfter: state.credits.balance,
      reasonTr,
      kind: 'hikaye',
      storyId,
    } as (typeof CREDIT_ENTRIES)[number],
    ...state.credits.entries,
  ];
  return true;
}
