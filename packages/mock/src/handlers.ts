/**
 * handlers.ts — sözleşmedeki HER uç için MSW 2 handler'ı.
 *
 * ⚠️ KASITLI KIRILMA
 * `resolvers` haritası `satisfies Record<EndpointKey, Resolver>` ile yazılmıştır ve
 * `EndpointKey` doğrudan sözleşmeden türetilir. Kontrata yeni bir uç eklenip burası
 * güncellenmezse `pnpm --filter @kendihikayem/mock typecheck` KIRILIR. Mock'suz uç
 * sisteme giremez; FE bir ucu "yok" diye atlayamaz.
 *
 * Her handler ayrıca ortak POLİTİKA katmanından geçer: gecikme, `x-client-version`
 * ve `Idempotency-Key` denetimi, idempotent tekrar oynatma, senaryo hataları.
 */

import { delay, http, HttpResponse, type DefaultBodyType, type HttpResponseResolver, type PathParams, type RequestHandler } from 'msw';

import type { z } from 'zod';

import {
  DEFAULT_PAGE_COUNT_BY_AGE_BAND,
  PAGE_COUNT_OPTIONS_BY_AGE_BAND,
  ageBandSchema,
  apiErrorFrom,
  childSchema,
  endpoints,
  httpStatusFor,
  isPageCountAllowed,
  orderSchema,
  type ApiError,
  type EndpointKey,
  type ErrorCode,
  type IsoDate,
  type Story,
} from '@kendihikayem/contract';

import {
  ART_STYLES,
  BOOK_BUILD,
  BOOK_FORMATS,
  CHARACTER_OPTIONS,
  DATA_MAP,
  ELIF_STORY,
  EXPORTS,
  GUEST_ME,
  IDS,
  INTERESTS,
  PLANS,
  ORDER,
  PRIVACY_REQUESTS,
  PUBLIC_PAGE_AUDIO,
  QUOTE,
  RENDITIONS,
  SYSTEM_VOICES,
  TAKE_ACCEPTED,
  TAKE_NOISY,
  THEMES,
  VOICE_PROFILES,
  VOICE_SCRIPT,
  buildPlayerManifest,
  legalDocument,
  advanceGeneratingImages,
  mockAudio,
  mockUuid,
  nextMockUuid,
  rewriteMediaForScenario,
} from './fixtures';
import { mockConfig, nextLatencyMs, shouldInjectNetworkError } from './scenarios';
import { jobEventStream, sessionEventStream, sseDisabledResponse } from './sse';
import { findStory, getJobSnapshot, spendCredits, startJob, store, upsertStory } from './store';

type Resolver = HttpResponseResolver<PathParams, DefaultBodyType, DefaultBodyType>;

/* ── Yardımcılar ─────────────────────────────────────────────── */

async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.clone().json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Tek JSON çıkış noktası. `rewriteMediaForScenario` BURADA uygulanır: `medya_404`
 * senaryosu açıkken hangi ucun hangi alanında medya olduğunu bilmeye gerek
 * kalmadan bütün gövde taranır ve demo adresleri ölü CDN'e çevrilir. Senaryo
 * kapalıyken gövdeye dokunulmaz.
 */
function ok<T>(data: T, status = 200): Response {
  return HttpResponse.json(rewriteMediaForScenario(data) as DefaultBodyType, {
    status,
  }) as unknown as Response;
}

function fail(code: ErrorCode, extra: Partial<ApiError> = {}): Response {
  const error = apiErrorFrom(code, { traceId: `mock-${Date.now().toString(36)}`, ...extra });
  return HttpResponse.json(error as unknown as DefaultBodyType, {
    status: httpStatusFor(code),
  }) as unknown as Response;
}

function paginated<T>(items: T[]): Response {
  return ok({ items, nextCursor: null, total: items.length });
}

function nowIso(): IsoDate {
  return new Date().toISOString().replace('.000Z', 'Z') as IsoDate;
}

function param(params: PathParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? '') : ((value as string | undefined) ?? '');
}

function jobRef(jobId: string, kind: Parameters<typeof startJob>[0]['kind'], etaMs?: number) {
  return { jobId, kind, etaMs, eventsUrl: `/v1/jobs/${jobId}/events` };
}

/** Senaryoya göre üretim uçlarının önünü kesen ortak kontrol. */
function productionGate(): Response | null {
  const { scenario } = mockConfig();
  if (scenario === 'kredi_yok') return fail('INSUFFICIENT_CREDITS');
  if (scenario === 'maliyet_tavani') return fail('COST_CAP_REACHED');
  return null;
}

function consentGate(): Response | null {
  if (mockConfig().scenario === 'riza_yok') return fail('CONSENT_REQUIRED');
  const consents = store().consents;
  if (!consents.ses_biyometrik.granted || !consents.yurtdisi_aktarim.granted) {
    return fail('CONSENT_REQUIRED');
  }
  return null;
}

/**
 * İstek gövdesini SÖZLEŞME ŞEMASIYLA doğrular. Mock'un gevşek davranıp
 * üretimin katı davranması, FE'nin en geç öğrendiği hata sınıfıdır.
 */
function validate<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): { data: z.infer<S> } | { error: Response } {
  const result = schema.safeParse(value);
  if (result.success) return { data: result.data };
  const issue = result.error.issues[0];
  return {
    error: fail('VALIDATION_FAILED', {
      field: issue?.path.join('.'),
      detail: issue?.message,
    }),
  };
}

function hashText(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/* ── Çözücüler ───────────────────────────────────────────────── */

export const resolvers = {
  /* ── Kimlik ──────────────────────────────────────────────── */
  'auth.guest': () =>
    ok({ accessToken: 'mock-misafir-jetonu', expiresInSec: 3_600, user: GUEST_ME }),

  'auth.otpStart': async ({ request }) => {
    const payload = await readBody<{ destination?: string }>(request);
    const destination = payload.destination ?? '+905321234567';
    return ok({
      challengeId: 'mock-challenge-1',
      expiresInSec: 180,
      resendAfterSec: 45,
      destinationMasked: destination.replace(/(\+\d{2}\s?\d)\d{6}(\d{2})/, '$1** *** ** $2'),
    });
  },

  'auth.otpVerify': async ({ request }) => {
    const payload = await readBody<{ code?: string }>(request);
    if (payload.code !== '123456') {
      return fail('VALIDATION_FAILED', {
        field: 'code',
        messageTr: 'Kod hatalı. Mock ortamında doğrulama kodu 123456’dır.',
      });
    }
    return ok({
      accessToken: 'mock-erisim-jetonu',
      refreshToken: 'mock-yenileme-jetonu',
      expiresInSec: 3_600,
      user: store().me,
      isNewUser: false,
    });
  },

  'auth.refresh': () =>
    ok({
      accessToken: 'mock-erisim-jetonu-2',
      refreshToken: 'mock-yenileme-jetonu-2',
      expiresInSec: 3_600,
    }),

  'auth.logout': () => ok({ ok: true }),

  'auth.me': () => ok(store().me),

  'auth.updateMe': async ({ request }) => {
    const patch = await readBody<Record<string, unknown>>(request);
    const state = store();
    state.me = { ...state.me, ...patch } as typeof state.me;
    return ok(state.me);
  },

  'auth.deleteMe': async ({ request }) => {
    const payload = await readBody<{ confirmText?: string }>(request);
    if (payload.confirmText !== 'SIL') {
      return fail('VALIDATION_FAILED', {
        field: 'confirmText',
        messageTr: 'Hesabı silmek için kutuya büyük harflerle SIL yazın.',
      });
    }
    const job = startJob({ id: nextMockUuid(), kind: 'privacy_delete' });
    return ok(
      {
        job: jobRef(job.id, 'privacy_delete'),
        sideEffectsTr: [
          'Hesabınız ve 3 hikayeniz 30 gün içinde tamamen silinecek.',
          'Anne ses profiliniz sağlayıcıdan da silinecek.',
          'Basılı sipariş kayıtları vergi mevzuatı gereği saklanacak.',
        ],
      },
      202,
    );
  },

  /* ── Çocuklar ────────────────────────────────────────────── */
  'children.list': () => paginated(store().children),

  'children.create': async ({ request }) => {
    const payload = await readBody<Record<string, unknown>>(request);
    const parsed = validate(childSchema, {
      id: nextMockUuid(),
      interests: [],
      storyCount: 0,
      createdAt: nowIso(),
      ...payload,
    });
    if ('error' in parsed) return parsed.error;
    store().children = [...store().children, parsed.data];
    return ok(parsed.data, 201);
  },

  'children.update': async ({ request, params }) => {
    const childId = param(params, 'childId');
    const patch = await readBody<Record<string, unknown>>(request);
    const state = store();
    const index = state.children.findIndex((child) => (child.id as string) === childId);
    if (index < 0) return fail('NOT_FOUND');
    const updated = { ...state.children[index]!, ...patch };
    state.children = state.children.map((child, i) => (i === index ? updated : child));
    return ok(updated);
  },

  'children.remove': ({ params }) => {
    const childId = param(params, 'childId');
    const state = store();
    if (!state.children.some((child) => (child.id as string) === childId)) return fail('NOT_FOUND');
    state.children = state.children.filter((child) => (child.id as string) !== childId);
    return ok({
      ok: true,
      sideEffectsTr: ['Profil silindi. Hikayeler kitaplığınızda kalmaya devam edecek.'],
    });
  },

  /* ── Katalog ─────────────────────────────────────────────── */
  'catalog.themes': ({ request }) => {
    const url = new URL(request.url);
    const ageBand = url.searchParams.get('ageBand');
    const includeReligious = url.searchParams.get('includeReligious') === 'true';
    const items = THEMES.filter(
      (theme) =>
        (ageBand === null || theme.ageBands.includes(ageBand as (typeof theme.ageBands)[number])) &&
        (includeReligious || !theme.isReligious),
    );
    return ok({ items });
  },

  'catalog.artStyles': () => ok({ items: ART_STYLES }),
  'catalog.characterOptions': () => ok(CHARACTER_OPTIONS),
  'catalog.systemVoices': () => ok({ items: SYSTEM_VOICES }),
  'catalog.bookFormats': () => ok({ items: BOOK_FORMATS }),
  'catalog.interests': () => ok({ items: INTERESTS }),

  /* ── Ses ─────────────────────────────────────────────────── */
  'voice.uploadsPresign': async ({ request }) => {
    const payload = await readBody<{ source?: string }>(request);
    if (payload.source !== 'in_app_microphone') {
      return fail('VALIDATION_FAILED', {
        field: 'source',
        messageTr: 'Yalnızca uygulama içi mikrofon kaydı gönderilebilir. Kaydı ekrandan alın.',
      });
    }
    return ok({
      assetId: IDS.asset,
      uploadUrl: 'https://s3.mock.kendihikayem.com/voice-raw/mock-put',
      headers: { 'content-type': 'audio/mp4', 'x-amz-server-side-encryption': 'aws:kms' },
      expiresAt: '2026-08-10T20:00:00Z',
    });
  },

  'voice.listProfiles': () => ok({ items: store().voiceProfiles, limit: 2 }),

  'voice.getProfile': ({ params }) => {
    const id = param(params, 'voiceProfileId');
    const profile = store().voiceProfiles.find((item) => (item.id as string) === id);
    return profile ? ok(profile) : fail('NOT_FOUND');
  },

  'voice.createProfile': async ({ request }) => {
    const gate = consentGate();
    const payload = await readBody<{ displayName?: string; relation?: string }>(request);
    const missing = gate
      ? (['ses_biyometrik', 'yurtdisi_aktarim'] as const)
      : ([] as readonly string[]);
    const profile = {
      ...VOICE_PROFILES[1]!,
      id: nextMockUuid() as (typeof VOICE_PROFILES)[number]['id'],
      displayName: payload.displayName ?? 'Yeni ses',
      relation: (payload.relation ?? 'diger') as (typeof VOICE_PROFILES)[number]['relation'],
      status: 'draft' as const,
      qualityScore: undefined,
      qualityBadge: undefined,
      preview: undefined,
      storiesUsingCount: 0,
      createdAt: nowIso() as (typeof VOICE_PROFILES)[number]['createdAt'],
      acceptedAt: undefined,
    };
    store().voiceProfiles = [...store().voiceProfiles, profile];
    return ok({ profile, consentRequired: missing }, 201);
  },

  'voice.script': () => {
    const gate = consentGate();
    if (gate) return gate;
    return ok(VOICE_SCRIPT);
  },

  'voice.submitTake': async ({ request, params }) => {
    const gate = consentGate();
    if (gate) return gate;
    const payload = await readBody<{ step?: string; scriptId?: string }>(request);
    if (payload.scriptId !== (VOICE_SCRIPT.scriptId as string)) {
      return fail('VOICE_SCRIPT_MISMATCH', {
        messageTr:
          'Okuma metninizin süresi doldu. Ekranı yenileyip yeni metinle tekrar kaydedin.',
      });
    }
    if (mockConfig().scenario === 'gurultulu_kayit') return ok(TAKE_NOISY);

    const key = `${param(params, 'voiceProfileId')}:${payload.step ?? 'consent_clip'}`;
    const attempts = (store().takeAttempts.get(key) ?? 0) + 1;
    store().takeAttempts.set(key, attempts);
    /** İlk deneme gürültülü, ikinci deneme kabul: FE her iki kartı da görür. */
    return ok(attempts === 1 ? TAKE_NOISY : TAKE_ACCEPTED);
  },

  'voice.submit': ({ params }) => {
    const gate = consentGate() ?? productionGate();
    if (gate) return gate;
    const voiceProfileId = param(params, 'voiceProfileId');
    const job = startJob({ id: nextMockUuid(), kind: 'voice_create', voiceProfileId });
    return ok({ job: jobRef(job.id, 'voice_create', 24_000) }, 202);
  },

  'voice.accept': ({ params }) => {
    const id = param(params, 'voiceProfileId');
    const state = store();
    const index = state.voiceProfiles.findIndex((item) => (item.id as string) === id);
    if (index < 0) return fail('NOT_FOUND');
    const updated = {
      ...state.voiceProfiles[index]!,
      status: 'ready' as const,
      acceptedAt: nowIso() as (typeof VOICE_PROFILES)[number]['acceptedAt'],
    };
    state.voiceProfiles = state.voiceProfiles.map((item, i) => (i === index ? updated : item));
    return ok(updated);
  },

  'voice.redo': () => ok(VOICE_SCRIPT),

  'voice.remove': ({ params }) => {
    const id = param(params, 'voiceProfileId');
    const state = store();
    const profile = state.voiceProfiles.find((item) => (item.id as string) === id);
    if (!profile) return fail('NOT_FOUND');
    state.voiceProfiles = state.voiceProfiles.filter((item) => (item.id as string) !== id);
    const job = startJob({ id: nextMockUuid(), kind: 'voice_delete', voiceProfileId: id });
    return ok(
      {
        job: jobRef(job.id, 'voice_delete', 7_000),
        affectedStoryIds: [IDS.storyElifIsik],
        sideEffectsTr: [
          `${profile.displayName} ses profiliniz ve ${profile.storiesUsingCount} hikayenin sesi silinecek.`,
          'Hikayeleriniz kalacak, sistem sesine dönecek.',
          'Ham kayıtlarınız sağlayıcıdan da silinecek.',
        ],
      },
      202,
    );
  },

  /* ── Hikaye ──────────────────────────────────────────────── */
  'stories.create': async ({ request }) => {
    const gate = productionGate();
    if (gate) return gate;
    const payload = await readBody<{
      hero?: { name?: string };
      ageBand?: string;
      themeCode?: string;
      artStyleCode?: string;
      pageCount?: number;
      childId?: string;
    }>(request);

    const storyId = nextMockUuid();
    const heroName = payload.hero?.name ?? 'Elif';
    spendCredits(6, `${heroName} için iskelet üretimi`, storyId);

    /*
     * Uzunluk banda bağlıdır: sunucu `0-2` için 12 sayfayı 422 ile reddeder.
     * Mock aynı kuralı uygular — aksi halde istemci hatasız görünür ve gerçek
     * API'ye geçtiğinde patlar. Bant geçersizse sözleşmenin izin verdiği tek
     * güvenli varsayılana düşeriz.
     */
    const parsedBand = ageBandSchema.safeParse(payload.ageBand);
    const ageBand = parsedBand.success ? parsedBand.data : '6-8';
    if (payload.pageCount !== undefined && !isPageCountAllowed(ageBand, payload.pageCount)) {
      return fail('VALIDATION_FAILED', {
        field: 'pageCount',
        messageTr: `${ageBand} yaş için ${PAGE_COUNT_OPTIONS_BY_AGE_BAND[ageBand].join(' veya ')} sayfa seçebilirsiniz.`,
      });
    }

    const story = {
      ...structuredClone(ELIF_STORY),
      id: storyId as typeof ELIF_STORY.id,
      title: `${heroName} ve Yeni Macera`,
      status: 'outline_generating' as const,
      heroName,
      childId: (payload.childId ?? undefined) as typeof ELIF_STORY.childId,
      ageBand: ageBand as typeof ELIF_STORY.ageBand,
      themeCode: payload.themeCode ?? 'cesaret',
      artStyleCode: payload.artStyleCode ?? 'suluboya',
      pageCount: payload.pageCount ?? DEFAULT_PAGE_COUNT_BY_AGE_BAND[ageBand],
      pages: [],
      audio: [],
      outline: undefined,
      approvedAt: undefined,
      isFavorite: false,
      createdAt: nowIso() as typeof ELIF_STORY.createdAt,
    };

    const job = startJob({
      id: nextMockUuid(),
      kind: 'story_outline',
      storyId,
      waitApprovalAtEnd: true,
    });
    story.activeJobs = [jobRef(job.id, 'story_outline', 18_000)] as typeof story.activeJobs;
    upsertStory(story);

    return ok(
      {
        storyId,
        job: jobRef(job.id, 'story_outline', 18_000),
        creditCost: 6,
        fullCostPreview: {
          credits: 60,
          breakdown: { llm: 12, image: 40, tts: 8 },
          willConsumeQuota: true,
        },
      },
      202,
    );
  },

  'stories.list': ({ request }) => {
    const url = new URL(request.url);
    const childId = url.searchParams.get('childId');
    const status = url.searchParams.get('status');
    const onlyFavorites = url.searchParams.get('onlyFavorites') === 'true';
    const items = [...store().summaries.values()].filter((summary) => {
      const story = findStory(summary.id as string);
      if (story) tickImageDelivery(story);
      if (childId && (story?.childId as string | undefined) !== childId) return false;
      if (status && summary.status !== status) return false;
      if (onlyFavorites && !summary.isFavorite) return false;
      return true;
    });
    return paginated(items);
  },

  'stories.get': ({ params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    tickImageDelivery(story);
    return ok(story);
  },

  'stories.selectCharacterVariant': async ({ request, params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    const payload = await readBody<{ characterId?: string; variantId?: string }>(request);
    const character = story.characters.find(
      (item) => (item.id as string) === payload.characterId,
    );
    if (!character) return fail('NOT_FOUND');
    const updated = {
      ...character,
      variants: character.variants?.map((variant) => ({
        ...variant,
        selected: variant.id === payload.variantId,
      })),
    };
    story.characters = story.characters.map((item) =>
      (item.id as string) === (character.id as string) ? updated : item,
    );
    upsertStory(story);
    return ok(updated);
  },

  'stories.approveOutline': ({ params }) => {
    const gate = productionGate();
    if (gate) return gate;
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    if (story.status !== 'outline_ready' && story.status !== 'outline_generating') {
      return fail('CONFLICT', {
        messageTr: 'Bu hikayenin iskeleti zaten onaylandı. Kitaplığınızdan takip edebilirsiniz.',
      });
    }

    spendCredits(54, `${story.heroName} — hikaye ve görseller`, story.id as string);
    story.status = 'content_generating';
    const job = startJob({ id: nextMockUuid(), kind: 'story_fill', storyId: story.id as string });
    story.activeJobs = [jobRef(job.id, 'story_fill', 90_000)] as typeof story.activeJobs;
    upsertStory(story);

    return ok(
      {
        job: jobRef(job.id, 'story_fill', 90_000),
        charged: { credits: 54, breakdown: { llm: 10, image: 38, tts: 6 }, willConsumeQuota: true },
      },
      202,
    );
  },

  'stories.rejectOutline': async ({ request, params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    const payload = await readBody<{ regenerate?: boolean }>(request);
    if (payload.regenerate === false) {
      story.status = 'outline_rejected';
      upsertStory(story);
      return ok({ status: 'outline_rejected' }, 202);
    }
    story.status = 'outline_generating';
    const job = startJob({
      id: nextMockUuid(),
      kind: 'story_outline',
      storyId: story.id as string,
      waitApprovalAtEnd: true,
    });
    upsertStory(story);
    return ok({ job: jobRef(job.id, 'story_outline', 18_000), status: 'outline_generating' }, 202);
  },

  'stories.updatePage': async ({ request, params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    const pageNo = Number.parseInt(param(params, 'pageNo'), 10);
    const page = story.pages.find((item) => item.pageNo === pageNo);
    if (!page) return fail('NOT_FOUND');
    const payload = await readBody<{ textTr?: string }>(request);
    if ((payload.textTr ?? '').toLowerCase().includes('kan')) {
      return fail('MODERATION_BLOCKED');
    }
    const updated = {
      ...page,
      textTr: payload.textTr ?? page.textTr,
      wordCount: (payload.textTr ?? '').trim().split(/\s+/).length,
      editedByUser: true,
      revision: page.revision + 1,
    };
    story.pages = story.pages.map((item) => (item.pageNo === pageNo ? updated : item));
    /** Metin değişti → o hikayenin sesleri eskidi. */
    story.audio = story.audio.map((rendition) => ({
      ...rendition,
      status: 'stale' as const,
      stalePageNos: [...(rendition.stalePageNos ?? []), pageNo],
    }));
    upsertStory(story);
    return ok(updated);
  },

  'stories.rewritePage': ({ params }) => {
    const gate = productionGate();
    if (gate) return gate;
    const storyId = param(params, 'storyId');
    const job = startJob({ id: nextMockUuid(), kind: 'story_page_rewrite', storyId });
    return ok({ job: jobRef(job.id, 'story_page_rewrite', 7_000) }, 202);
  },

  'stories.reillustratePage': ({ params }) => {
    const gate = productionGate();
    if (gate) return gate;
    const storyId = param(params, 'storyId');
    const job = startJob({ id: nextMockUuid(), kind: 'image_page', storyId });
    return ok({ job: jobRef(job.id, 'image_page', 9_000) }, 202);
  },

  'stories.revertPage': ({ params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    const pageNo = Number.parseInt(param(params, 'pageNo'), 10);
    const original = ELIF_STORY.pages.find((item) => item.pageNo === pageNo);
    if (!original) return fail('NOT_FOUND');
    story.pages = story.pages.map((item) => (item.pageNo === pageNo ? original : item));
    upsertStory(story);
    return ok(original);
  },

  'stories.approve': ({ params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    if (story.status !== 'ready' && story.status !== 'approved') {
      return fail('CONFLICT', {
        messageTr: 'Hikaye henüz hazır değil. Üretim bitince onaylayıp seslendirmeye geçin.',
      });
    }
    story.status = 'approved';
    story.approvedAt = nowIso() as typeof story.approvedAt;
    upsertStory(story);
    return ok(story);
  },

  'stories.sequel': ({ params }) => {
    const gate = productionGate();
    if (gate) return gate;
    const source = findStory(param(params, 'storyId'));
    if (!source) return fail('NOT_FOUND');
    const storyId = nextMockUuid();
    const job = startJob({
      id: nextMockUuid(),
      kind: 'story_outline',
      storyId,
      waitApprovalAtEnd: true,
    });
    const sequel = {
      ...structuredClone(source),
      id: storyId as typeof source.id,
      title: `${source.heroName} ve Yeni Macera`,
      status: 'outline_generating' as const,
      pages: [],
      audio: [],
      outline: undefined,
      approvedAt: undefined,
      createdAt: nowIso() as typeof source.createdAt,
    };
    upsertStory(sequel);
    return ok({ storyId, job: jobRef(job.id, 'story_outline', 18_000), creditCost: 6 }, 202);
  },

  'stories.favorite': async ({ request, params }) => {
    const storyId = param(params, 'storyId');
    const story = findStory(storyId);
    if (!story) return fail('NOT_FOUND');
    const payload = await readBody<{ isFavorite?: boolean }>(request);
    story.isFavorite = payload.isFavorite ?? !story.isFavorite;
    upsertStory(story);
    return ok({ id: storyId, isFavorite: story.isFavorite });
  },

  'stories.remove': ({ params }) => {
    const storyId = param(params, 'storyId');
    const state = store();
    if (!state.stories.has(storyId)) return fail('NOT_FOUND');
    state.stories.delete(storyId);
    state.summaries.delete(storyId);
    return ok({ ok: true });
  },

  /* ── Seslendirme ve okuyucu ──────────────────────────────── */
  'audio.create': async ({ request, params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    if (!story.approvedAt) return fail('STORY_NOT_APPROVED');
    const gate = productionGate();
    if (gate) return gate;

    const payload = await readBody<{ voiceKind?: string; voiceProfileId?: string }>(request);
    if (payload.voiceKind === 'cloned') {
      const consentGateResult = consentGate();
      if (consentGateResult) return consentGateResult;
    }

    const renditionId = nextMockUuid();
    const job = startJob({
      id: nextMockUuid(),
      kind: 'audio_render',
      storyId: story.id as string,
    });
    return ok({ renditionId, job: jobRef(job.id, 'audio_render', 36_000), cached: false }, 202);
  },

  'audio.list': ({ params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    return ok({ items: story.audio.length > 0 ? story.audio : [] });
  },

  'audio.player': ({ request, params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    if (story.audio.length === 0) {
      return fail('NOT_FOUND', {
        messageTr: 'Bu hikayenin sesi henüz hazır değil. Sesler ekranından bir ses seçip oluşturun.',
      });
    }
    const url = new URL(request.url);
    const renditionId = url.searchParams.get('renditionId') ?? (RENDITIONS[0]!.id as string);
    return ok(buildPlayerManifest(renditionId));
  },

  'audio.setDefault': ({ params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    const renditionId = param(params, 'renditionId');
    story.audio = story.audio.map((rendition) => ({
      ...rendition,
      isDefault: (rendition.id as string) === renditionId,
    }));
    upsertStory(story);
    return ok({ ok: true });
  },

  'audio.removeRendition': ({ params }) => {
    const renditionId = param(params, 'renditionId');
    for (const story of store().stories.values()) {
      story.audio = story.audio.filter((rendition) => (rendition.id as string) !== renditionId);
      upsertStory(story);
    }
    return ok({ ok: true });
  },

  'audio.progress': async ({ request, params }) => {
    const storyId = param(params, 'storyId');
    const payload = await readBody<{ pageNo?: number; positionMs?: number; renditionId?: string }>(
      request,
    );
    store().progress.set(storyId, {
      pageNo: payload.pageNo ?? 1,
      positionMs: payload.positionMs ?? 0,
      renditionId: payload.renditionId,
    });
    const summary = store().summaries.get(storyId);
    if (summary) {
      store().summaries.set(storyId, { ...summary, lastReadPageNo: payload.pageNo ?? 1 });
    }
    return ok({ ok: true });
  },

  'audio.readingPreferences': () => ok(store().readingPreferences),

  'audio.updateReadingPreferences': async ({ request }) => {
    const patch = await readBody<Record<string, unknown>>(request);
    const state = store();
    state.readingPreferences = { ...state.readingPreferences, ...patch } as typeof state.readingPreferences;
    return ok(state.readingPreferences);
  },

  'audio.publicPage': ({ params }) => {
    const token = param(params, 'token');
    if (token.length < 6) return fail('NOT_FOUND');
    return ok(PUBLIC_PAGE_AUDIO);
  },

  /* ── İşler ───────────────────────────────────────────────── */
  'jobs.get': ({ params }) => {
    const snapshot = getJobSnapshot(param(params, 'jobId'));
    if (!snapshot) return fail('NOT_FOUND');
    applyJobSideEffects(param(params, 'jobId'));
    return ok(snapshot.job);
  },

  'jobs.list': () => {
    const items = [...store().jobs.keys()]
      .map((jobId) => getJobSnapshot(jobId)?.job)
      .filter((job): job is NonNullable<typeof job> => job !== undefined);
    return paginated(items);
  },

  'jobs.cancel': ({ params }) => {
    const jobId = param(params, 'jobId');
    const snapshot = getJobSnapshot(jobId);
    if (!snapshot) return fail('NOT_FOUND');
    if (snapshot.finished) return fail('JOB_NOT_CANCELLABLE');
    store().jobs.delete(jobId);
    return ok({ ...snapshot.job, status: 'cancelled' });
  },

  'events.jobEvents': ({ request, params }) => {
    if (!mockConfig().sseEnabled) return sseDisabledResponse();
    return jobEventStream(param(params, 'jobId'), request.headers.get('last-event-id') ?? undefined);
  },

  'events.stream': ({ request }) => {
    if (!mockConfig().sseEnabled) return sseDisabledResponse();
    return sessionEventStream(request.headers.get('last-event-id') ?? undefined);
  },

  /* ── Kredi ve ödeme ──────────────────────────────────────── */
  'billing.entitlements': () => ok(store().entitlements),

  'billing.estimate': async ({ request }) => {
    const payload = await readBody<{ operation?: string }>(request);
    const table: Record<string, { credits: number; llm: number; image: number; tts: number }> = {
      story_outline: { credits: 6, llm: 6, image: 0, tts: 0 },
      story_fill: { credits: 54, llm: 10, image: 38, tts: 6 },
      page_rewrite: { credits: 3, llm: 3, image: 0, tts: 0 },
      page_reillustrate: { credits: 5, llm: 0, image: 5, tts: 0 },
      audio_render: { credits: 25, llm: 0, image: 0, tts: 25 },
      book_build: { credits: 90, llm: 0, image: 90, tts: 0 },
      export_mp4: { credits: 8, llm: 0, image: 4, tts: 4 },
    };
    const entry = table[payload.operation ?? 'story_outline'] ?? table.story_outline!;
    return ok({
      credits: entry.credits,
      breakdown: { llm: entry.llm, image: entry.image, tts: entry.tts },
      willConsumeQuota: true,
    });
  },

  'billing.plans': () => ok({ items: PLANS }),
  'billing.subscription': () => ok({ subscription: null }),

  'billing.credits': () =>
    ok({
      balance: store().credits.balance,
      entries: store().credits.entries,
      nextCursor: null,
    }),

  'billing.checkout': () =>
    ok({
      provider: 'iyzico',
      redirectUrl: 'https://sandbox.iyzipay.com/mock/checkout/kh-2026-0001',
      checkoutRef: 'kh-checkout-0001',
      expiresAt: '2026-08-10T20:30:00Z',
    }),

  'billing.cancel': () =>
    fail('CONFLICT', {
      messageTr: 'Aktif aboneliğiniz yok. Kredileriniz süresizdir, iptal etmenize gerek yok.',
    }),

  /* ── Baskı ve ticaret ────────────────────────────────────── */
  'print.createBookBuild': ({ params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    if (!story.approvedAt) return fail('STORY_NOT_APPROVED');
    const gate = productionGate();
    if (gate) return gate;
    const job = startJob({ id: nextMockUuid(), kind: 'pdf_build', storyId: story.id as string });
    return ok({ buildId: IDS.bookBuild, job: jobRef(job.id, 'pdf_build', 53_000) }, 202);
  },

  'print.getBookBuild': ({ params }) => {
    const buildId = param(params, 'buildId');
    return buildId === (IDS.bookBuild as string) ? ok(BOOK_BUILD) : fail('NOT_FOUND');
  },

  'print.quote': async ({ request }) => {
    const payload = await readBody<{ quantity?: number }>(request);
    const quantity = payload.quantity ?? 1;
    return ok({
      ...QUOTE,
      totalTry: QUOTE.unitPriceTry * quantity + QUOTE.shippingTry,
      installmentOptions: QUOTE.installmentOptions.map((option) => ({
        ...option,
        monthlyTry: Math.round((QUOTE.unitPriceTry * quantity + QUOTE.shippingTry) / option.count),
        totalTry: QUOTE.unitPriceTry * quantity + QUOTE.shippingTry,
      })),
    });
  },

  'print.createOrder': async ({ request }) => {
    const payload = await readBody<{ withdrawalWaiverAccepted?: boolean; quantity?: number }>(
      request,
    );
    if (payload.withdrawalWaiverAccepted !== true) {
      return fail('VALIDATION_FAILED', {
        field: 'withdrawalWaiverAccepted',
        messageTr:
          'Siparişi tamamlamak için cayma hakkı bilgilendirmesini onaylamanız gerekiyor. Kutuyu işaretleyin.',
      });
    }
    const parsed = validate(orderSchema, {
      ...structuredClone(ORDER),
      id: nextMockUuid(),
      orderNo: `KH-2026-${(Math.floor(Math.random() * 9000) + 1000).toString()}`,
      status: 'odeme_bekliyor',
      quantity: payload.quantity ?? 1,
      etaDeliveryAt: undefined,
      tracking: undefined,
      timeline: [{ at: nowIso(), statusTr: 'Siparişiniz alındı' }],
      createdAt: nowIso(),
    });
    if ('error' in parsed) return parsed.error;
    const order = parsed.data;
    store().orders = [order, ...store().orders];
    return ok(
      {
        order,
        payment: {
          provider: 'iyzico',
          redirectUrl: 'https://sandbox.iyzipay.com/mock/odeme/kh-2026-0042',
          expiresAt: '2026-08-10T20:30:00Z',
        },
      },
      201,
    );
  },

  'print.listOrders': () => paginated(store().orders),

  'print.getOrder': ({ params }) => {
    const orderId = param(params, 'orderId');
    const order = store().orders.find((item) => (item.id as string) === orderId);
    return order ? ok(order) : fail('NOT_FOUND');
  },

  'print.cancelOrder': ({ params }) => {
    const orderId = param(params, 'orderId');
    const state = store();
    const order = state.orders.find((item) => (item.id as string) === orderId);
    if (!order) return fail('NOT_FOUND');
    if (order.status === 'baskida' || order.status === 'kargoya_verildi') {
      return fail('CONFLICT', {
        messageTr:
          'Kitabınız baskıya girdiği için iptal edilemiyor. Sorununuz varsa destek ekibine yazın.',
      });
    }
    const cancelled = {
      ...order,
      status: 'iptal_edildi' as const,
      timeline: [...order.timeline, { at: nowIso() as never, statusTr: 'Siparişiniz iptal edildi' }],
    };
    state.orders = state.orders.map((item) => (item === order ? cancelled : item));
    return ok(cancelled);
  },

  'print.createExport': async ({ request, params }) => {
    const story = findStory(param(params, 'storyId'));
    if (!story) return fail('NOT_FOUND');
    const payload = await readBody<{ kind?: 'pdf' | 'mp4' }>(request);
    const kind = payload.kind ?? 'pdf';
    const job = startJob({
      id: nextMockUuid(),
      kind: kind === 'mp4' ? 'export_mp4' : 'pdf_build',
      storyId: story.id as string,
    });
    return ok({ exportId: mockUuid(75), job: jobRef(job.id, job.kind, 28_000) }, 202);
  },

  'print.listExports': () => ok({ items: EXPORTS }),

  /* ── Hukuk ve gizlilik ───────────────────────────────────── */
  'privacy.legalCurrent': ({ params }) =>
    ok(legalDocument(param(params, 'kind') as Parameters<typeof legalDocument>[0])),

  'privacy.consentsGet': () => ok(store().consents),

  'privacy.consentsRecord': async ({ request }) => {
    const payload = await readBody<{ subject?: string; granted?: boolean }>(request);
    const state = store();
    if (payload.subject && payload.subject !== 'aydinlatma_goruntuleme') {
      const subject = payload.subject as keyof typeof state.consents;
      state.consents = {
        ...state.consents,
        [subject]: {
          granted: payload.granted ?? false,
          grantedAt: payload.granted ? nowIso() : undefined,
          revokedAt: payload.granted ? undefined : nowIso(),
          needsRenewal: false,
        },
      } as typeof state.consents;
    }
    return ok({ consentState: state.consents, recordedAt: nowIso() });
  },

  'privacy.consentSideEffects': ({ params }) => {
    const subject = param(params, 'subject');
    const isVoice = subject === 'ses_biyometrik' || subject === 'yurtdisi_aktarim';
    return ok({
      subject,
      sideEffectsTr: isVoice
        ? [
            'Anne ses profiliniz ve 4 hikayenin sesi silinecek.',
            'Hikayeleriniz kalacak, sistem sesine dönecek.',
            'Bu işlem geri alınamaz; sesinizi yeniden kaydetmeniz gerekir.',
          ]
        : ['Bu izni geri aldığınızda ilgili özellik kapanacak.'],
      affectedStoryIds: isVoice ? [IDS.storyElifIsik] : [],
      affectedVoiceProfileIds: isVoice ? [IDS.voiceAnne] : [],
      irreversible: isVoice,
    });
  },

  'privacy.consentRevoke': ({ params }) => {
    const subject = param(params, 'subject') as keyof ReturnType<typeof store>['consents'];
    const state = store();
    state.consents = {
      ...state.consents,
      [subject]: { granted: false, revokedAt: nowIso(), needsRenewal: false },
    } as typeof state.consents;
    const job = startJob({ id: nextMockUuid(), kind: 'voice_delete' });
    return ok({
      consentState: state.consents,
      sideEffectsTr: [
        'Anne ses profiliniz ve 4 hikayenin sesi siliniyor.',
        'Hikayeleriniz kalacak, sistem sesine dönecek.',
      ],
      jobId: job.id,
    });
  },

  'privacy.privacyRequestCreate': async ({ request }) => {
    const payload = await readBody<{ kind?: string; detailTr?: string }>(request);
    const created = {
      ...PRIVACY_REQUESTS[0]!,
      id: nextMockUuid() as (typeof PRIVACY_REQUESTS)[number]['id'],
      kind: (payload.kind ?? 'bilgi_talebi') as (typeof PRIVACY_REQUESTS)[number]['kind'],
      status: 'alindi' as const,
      detailTr: payload.detailTr,
      createdAt: nowIso() as (typeof PRIVACY_REQUESTS)[number]['createdAt'],
      dueAt: '2026-09-09T19:30:00Z' as (typeof PRIVACY_REQUESTS)[number]['dueAt'],
      resolvedAt: undefined,
      responseTr: undefined,
      export: undefined,
    };
    return ok(created, 201);
  },

  'privacy.privacyRequestList': () => paginated(PRIVACY_REQUESTS),

  'privacy.privacyExport': () => {
    const job = startJob({ id: nextMockUuid(), kind: 'privacy_export' });
    return ok({ job: jobRef(job.id, 'privacy_export', 12_000) }, 202);
  },

  'privacy.dataMap': () => ok({ categories: DATA_MAP }),

  'privacy.supportReport': () =>
    ok(
      {
        reportId: IDS.report,
        slaHours: 72,
        messageTr:
          'İhbarınızı aldık. En geç 72 saat içinde inceleyip size dönüş yapacağız. Takip numaranız kayıtlıdır.',
      },
      201,
    ),
} satisfies Record<EndpointKey, Resolver>;

/**
 * Aşamalı teslim saati. Mock'un doğduğu andan bu yana geçen süreye göre
 * `images_generating` hikayelerinin sayfa görsellerini ilerletir; hikaye
 * gerçekten "hazırlanıyor → hazır" geçişini yaşar. `resetStore()` saati de
 * sıfırlar, yani senaryo baştan izlenebilir.
 */
function tickImageDelivery(story: Story): void {
  const state = store();
  if (advanceGeneratingImages(story, Date.now() - state.startedAtMs, mockConfig().jobSpeed)) {
    upsertStory(story);
  }
}

/* ── İş tamamlandığında durum geçişleri ──────────────────────── */

/**
 * Mock'ta arka plan işçisi yoktur; bu yüzden bir iş "bitmiş" sayıldığında ilgili
 * varlığın durumunu ilk okuyan istek ilerletir. Sonuç FE açısından aynıdır:
 * polling ya da SSE ile beklerken hikaye gerçekten durum değiştirir.
 */
function applyJobSideEffects(jobId: string): void {
  const runtime = store().jobs.get(jobId);
  const snapshot = getJobSnapshot(jobId);
  if (!runtime || !snapshot || !snapshot.finished) return;

  if (runtime.storyId) {
    const story = findStory(runtime.storyId);
    if (story) {
      if (runtime.kind === 'story_outline' && story.status === 'outline_generating') {
        story.status = 'outline_ready';
        story.outline = ELIF_STORY.outline;
        story.characters = ELIF_STORY.characters;
        story.pages = ELIF_STORY.pages.map((page) => ({
          ...page,
          textTr: undefined,
          image: undefined,
          imageStatus: 'pending' as const,
        }));
        story.activeJobs = [];
        upsertStory(story);
      } else if (runtime.kind === 'story_fill' && story.status === 'content_generating') {
        story.status = 'ready';
        story.pages = ELIF_STORY.pages;
        story.cover = ELIF_STORY.cover;
        story.readyAt = nowIso() as typeof story.readyAt;
        story.activeJobs = [];
        upsertStory(story);
      } else if (runtime.kind === 'audio_render' && story.audio.length === 0) {
        story.audio = RENDITIONS;
        upsertStory(story);
      }
    }
  }

  if (runtime.kind === 'voice_create' && runtime.voiceProfileId) {
    const state = store();
    state.voiceProfiles = state.voiceProfiles.map((profile) =>
      (profile.id as string) === runtime.voiceProfileId
        ? {
            ...profile,
            status: 'preview_ready' as const,
            qualityScore: 0.86,
            qualityBadge: 'iyi' as const,
            preview: mockAudio('voice/yeni-onizleme', 15_000),
          }
        : profile,
    );
  }
}

/* ── Politika sarmalayıcısı ──────────────────────────────────── */

function withPolicy(key: EndpointKey, resolver: Resolver): Resolver {
  const meta = endpoints[key];

  return async (info) => {
    const { request } = info;

    if (!meta.sse) {
      await delay(nextLatencyMs());
      if (shouldInjectNetworkError()) return fail('PROVIDER_UNAVAILABLE', { retryAfterSec: 5 });
    }

    if (mockConfig().strictHeaders) {
      if (!request.headers.get('x-client-version')) {
        return fail('VALIDATION_FAILED', {
          field: 'x-client-version',
          detail: 'X-Client-Version header is mandatory on every request (SPEC-API §5).',
          messageTr:
            'İstemci sürümü gönderilmedi. Uygulamayı güncelleyin veya API istemcisini yeniden başlatın.',
        });
      }
      if (meta.idempotent && !request.headers.get('idempotency-key')) {
        return fail('VALIDATION_FAILED', {
          field: 'idempotency-key',
          detail: 'Idempotency-Key header is mandatory on every write endpoint.',
          messageTr:
            'İşlem anahtarı gönderilmedi. Uygulamayı yeniden başlatıp tekrar deneyin.',
        });
      }
    }

    const idempotencyKey = request.headers.get('idempotency-key');
    if (meta.idempotent && idempotencyKey) {
      const bodyText = await request.clone().text();
      const record = store().idempotency.get(idempotencyKey);
      if (record) {
        if (record.path !== meta.path) return fail('IDEMPOTENCY_KEY_REUSED');
        if (record.bodyHash !== hashText(bodyText)) return fail('IDEMPOTENCY_CONFLICT');
        return new Response(record.body, {
          status: record.status,
          headers: { 'content-type': 'application/json', 'x-mock-replayed': 'true' },
        });
      }

      const response = await resolver(info);
      const clone = (response as Response).clone();
      store().idempotency.set(idempotencyKey, {
        path: meta.path,
        bodyHash: hashText(bodyText),
        status: clone.status,
        body: await clone.text(),
      });
      return response;
    }

    return resolver(info);
  };
}

/* ── Handler dizisi ──────────────────────────────────────────── */

/**
 * MSW yolları `*` ile başlar: mock hem `https://api.kendihikayem.com` hem de
 * `http://10.0.2.2:3001` (Android emülatörü) taban adresini yakalar.
 */
export function createHandlers(): RequestHandler[] {
  return (Object.keys(resolvers) as EndpointKey[]).map((key) => {
    const meta = endpoints[key];
    const path = `*${meta.path}`;
    const resolver = withPolicy(key, resolvers[key]);

    switch (meta.method) {
      case 'GET':
        return http.get(path, resolver);
      case 'POST':
        return http.post(path, resolver);
      case 'PUT':
        return http.put(path, resolver);
      case 'PATCH':
        return http.patch(path, resolver);
      case 'DELETE':
        return http.delete(path, resolver);
      default:
        return http.all(path, resolver);
    }
  });
}

export const handlers: RequestHandler[] = createHandlers();
