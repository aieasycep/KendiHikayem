# KendiHikayem — SPEC-API

> NORMATİF. `packages/contract` (Zod + ts-rest) bu bölüme birebir uyar. Tek yazarı A0.
> Tam bağlam: `docs/SPEC.md`

---

## 5. API Sözleşmesi

**Konvansiyonlar:** Taban `https://api.kendihikayem.com/v1`. Auth `Authorization: Bearer <jwt>`. Para/kaynak harcayan her POST `Idempotency-Key` ister. Uzun iş → `202 + { job: JobRef }`. Listeler cursor-paginated. Tüm hatalar tek şekil. `X-Client-Version` zorunlu (sunucu `426` ile eski istemciyi kesebilir).

### 5.1 Ortak temeller

```ts
export type Id = string;          // uuid
export type IsoDate = string;     // '2026-08-10T12:00:00Z'
export type Cursor = string;
export type AgeBand = '3-5' | '6-8' | '9-12';
export type Tier = 'draft' | 'quality';

export interface Paginated<T> { items: T[]; nextCursor: Cursor | null; total?: number }

/** Tüm 4xx/5xx yanıtları TAM OLARAK bu şekle sahiptir. Başka hata gövdesi yoktur. */
export interface ApiError {
  code: ErrorCode;
  messageTr: string;         // KULLANICIYA DOĞRUDAN GÖSTERİLEBİLİR
  detail?: string;           // İngilizce, teknik; UI'da gösterilmez
  field?: string;
  retryable: boolean;
  retryAfterSec?: number;
  traceId: string;
}

export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT'
  | 'VALIDATION_FAILED' | 'IDEMPOTENCY_KEY_REUSED'
  | 'QUOTA_EXCEEDED' | 'COST_CAP_REACHED' | 'INSUFFICIENT_CREDITS' | 'PLAN_UPGRADE_REQUIRED'
  | 'CONSENT_REQUIRED' | 'CONSENT_REVOKED' | 'PHONE_VERIFICATION_REQUIRED'
  | 'VOICE_QUALITY_LOW' | 'VOICE_SCRIPT_MISMATCH' | 'VOICE_LIMIT_REACHED'
  | 'INVALID_NAME' | 'INJECTION_DETECTED' | 'CONTENT_BLOCKED' | 'AGE_POLICY_VIOLATION'
  | 'STORY_NOT_APPROVED' | 'JOB_NOT_CANCELLABLE'
  | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED' | 'INTERNAL';

/** Uzun süren HER işlem bunu döner. FE'nin tek "bekleme" primitifi. */
export interface JobRef { jobId: Id; kind: JobKind; etaMs?: number; eventsUrl: string }

export type JobKind =
  | 'story_outline' | 'story_fill' | 'story_page_rewrite'
  | 'voice_create' | 'voice_delete'
  | 'image_character_sheet' | 'image_book' | 'image_page'
  | 'audio_render' | 'pdf_build' | 'print_submit'
  | 'export_mp4' | 'privacy_export' | 'privacy_delete';

export type JobStatus =
  | 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  id: Id; kind: JobKind; status: JobStatus;
  progress: { current: number; total: number; labelTr: string };  // label TÜRKÇE
  etaMs?: number;
  storyId?: Id; voiceProfileId?: Id; orderId?: Id;
  steps: { stepKey: string; status: string; attempt: number }[];
  result?: JobResult; error?: ApiError;
  costPreview?: CostPreview;
  queuedAt: IsoDate; startedAt?: IsoDate; finishedAt?: IsoDate;
}

export type JobResult =
  | { kind: 'story';  storyId: Id }
  | { kind: 'voice';  voiceProfileId: Id }
  | { kind: 'audio';  renditionId: Id; durationMs: number }
  | { kind: 'book';   buildId: Id }
  | { kind: 'export'; media: SignedMedia };

export interface CostPreview {
  credits: number;
  breakdown: { llm: number; image: number; tts: number };
  willConsumeQuota: boolean;
}

/** FE asla S3 anahtarı görmez. */
export interface SignedMedia {
  url: string; mimeType: string; expiresAt: IsoDate;
  sizeBytes?: number; width?: number; height?: number; durationMs?: number;
}
```

### 5.2 SSE olay union'ı

```ts
/** GET /v1/events (oturuma bağlı) veya GET /v1/jobs/:id/events (Last-Event-ID destekli).
 *  SÖZLEŞME KURALI: SSE İSTEĞE BAĞLIDIR. FE her zaman GET /v1/jobs/:id polling'e
 *  düşebilir (2 sn, exponential backoff). Gerçek teslimat kanalı push + e-posta. */
export type ServerEvent =
  | { seq: number; type: 'job.progress';          at: IsoDate; job: Job }
  | { seq: number; type: 'job.awaiting_approval'; at: IsoDate; jobId: Id;
      approvalKind: 'skeleton' | 'final' }
  | { seq: number; type: 'job.completed';         at: IsoDate; job: Job }
  | { seq: number; type: 'job.failed';            at: IsoDate; job: Job }
  | { seq: number; type: 'step.retrying';         at: IsoDate; stepKey: string;
      attempt: number; reason: ErrorCode }
  | { seq: number; type: 'page.image.ready';      at: IsoDate; storyId: Id;
      pageNo: number; image: SignedMedia }              // aşamalı teslim
  | { seq: number; type: 'story.updated';         at: IsoDate; storyId: Id; status: StoryStatus }
  | { seq: number; type: 'audio.ready';           at: IsoDate; storyId: Id; renditionId: Id }
  | { seq: number; type: 'voice.ready';           at: IsoDate; voiceProfileId: Id }
  | { seq: number; type: 'order.updated';         at: IsoDate; orderId: Id; status: string }
  | { seq: number; type: 'entitlements.updated';  at: IsoDate; entitlements: Entitlements }
  | { seq: number; type: 'heartbeat';             at: IsoDate };
```

### 5.3 Domain tipleri

```ts
// ── Kimlik & rıza ──────────────────────────────────────────────
export interface Me {
  id: Id; isGuest: boolean; displayName?: string;
  phoneMasked?: string; emailMasked?: string;
  locale: string; timezone: string; marketingOptIn: boolean;
  entitlements: Entitlements;
  consentState: ConsentState;
  flags: Record<string, boolean>;        // sunucu tarafı özellik bayrakları
}

export interface Entitlements {
  planCode: string; periodStart: IsoDate; periodEnd: IsoDate;
  stories: { used: number; limit: number | null };
  credits: number;
  voiceProfiles: { used: number; limit: number };
  costCap: { usedUsd: number; capUsd: number; blocked: boolean };
  canCloneVoice: boolean;
}

export type ConsentSubject =
  'ses_biyometrik' | 'yurtdisi_aktarim' | 'cocuk_verisi' | 'pazarlama' | 'aydinlatma_goruntuleme';

export interface ConsentStatus {
  granted: boolean; grantedAt?: IsoDate; revokedAt?: IsoDate;
  documentVersion?: string; needsRenewal: boolean;   // metin sürümü değiştiyse
}
export type ConsentState = Record<Exclude<ConsentSubject,'aydinlatma_goruntuleme'>, ConsentStatus>;

export interface LegalDocument {
  id: Id; kind: string; version: string; bodyMd: string; sha256: string; effectiveFrom: IsoDate;
}

// ── Çocuk & katalog ────────────────────────────────────────────
export interface Child {
  id: Id; givenName: string; nickname?: string; ageBand: AgeBand;
  birthYear?: number; genderPresentation?: 'kiz'|'erkek'|'belirtilmemis';
  interests: string[]; defaultCharacterId?: Id; storyCount: number;
}

export interface StoryTheme {
  code: string; titleTr: string; subtitleTr?: string; icon: string;
  ageBands: AgeBand[]; isReligious: boolean; culturalTag?: string; sampleFirstLineTr: string;
}
export interface ArtStyle { code: string; titleTr: string; preview: SignedMedia; isVector: boolean }
export interface SystemVoice {
  code: string; displayName: string; descriptionTr: string;
  gender: 'kadin'|'erkek'|'notr'; sample: SignedMedia;
}
export interface CharacterOptions {
  fields: { field: string; labelTr: string;
            options: { code: string; labelTr: string; swatchHex?: string }[] }[];
}
export interface BookFormat {
  code: string; titleTr: string; trimMm: [number, number];
  pageCount: number; binding: string; basePriceTry: number; preview: SignedMedia;
}

// ── Ses ────────────────────────────────────────────────────────
export interface VoiceProfile {
  id: Id; displayName: string; relation: 'anne'|'baba'|'diger';
  status: 'draft'|'recording'|'processing'|'preview_ready'|'ready'|'failed'|'revoked';
  qualityScore?: number;                        // 0..1
  qualityBadge?: 'mukemmel'|'iyi'|'kabul_edilebilir';
  preview?: SignedMedia;
  storiesUsingCount: number;
  createdAt: IsoDate; acceptedAt?: IsoDate; failureReasonTr?: string;
}

/** ⭐ Metinler SUNUCUDAN gelir: hem enjeksiyon hem canlılık kontrolü için. */
export interface VoiceScriptBundle {
  scriptId: Id; expiresAt: IsoDate;             // TTL 15 dk, tek kullanımlık
  consentClip: {
    step: 'consent_clip';
    randomSentenceTr: string;                   // canlılık kanıtı, sunucu üretimi
    consentStatementTr: string;                 // "Ben Ayşe Yılmaz, sesimin ... izin veriyorum."
    targetSec: number;                          // 12
  };
  passages: ReferencePassage[];                 // 4 adet, toplam 100–120 sn
  totalTargetSec: number;
  guidanceTr: string[];
}
export interface ReferencePassage {
  step: 'passage_1'|'passage_2'|'passage_3'|'passage_4';
  titleTr: string;                              // "Sakin anlatım"
  toneHintTr: string;
  bodyTr: string;                               // ~60-75 kelime, masal tonu, ğıöüşç yoğun
  targetSec: number;
}

export interface TakeQuality {
  snrDb: number; peakDbfs: number; clippingPct: number;
  silenceRatio: number; wordsPerMinute: number; bandwidthHz: number;
  reverbMs?: number; asrSimilarity?: number; score: number;   // 0..1
}
export type TakeIssue =
  | 'COK_KISA' | 'COK_UZUN' | 'GURULTULU' | 'KLIPLENME' | 'COK_SESSIZ'
  | 'YANKILI' | 'COK_HIZLI' | 'COK_YAVAS' | 'METIN_ESLESMEDI' | 'BIRDEN_FAZLA_KONUSMACI';

export interface SubmitTakeRes {
  accepted: boolean;
  quality: TakeQuality;
  issues: TakeIssue[];
  guidanceTr: string;                           // tek cümlelik somut düzeltme
  canRetry: boolean; attemptsLeft: number;
  progress: { completedSteps: string[]; nextStep?: string;
              capturedSec: number; targetSec: number };
}

// ── Hikaye ─────────────────────────────────────────────────────
export type StoryStatus =
  | 'draft' | 'outline_generating' | 'outline_ready' | 'outline_rejected'
  | 'content_generating' | 'content_ready' | 'images_generating'
  | 'ready' | 'approved' | 'failed';

export interface CreateStoryReq {
  childId?: Id;
  hero: { name: string; isChild: boolean };     // allowlist: ^[A-Za-zÇĞİÖŞÜçğıöşü]...$, 1–30
  ageBand: AgeBand;
  themeCode?: string;
  freeIdeaTr?: string;                          // ≤200 kar, spotlighting ile SALT VERİ
  artStyleCode: string;
  pageCount: 12 | 14 | 16;
  characterBuilder: Record<string, string>;     // { ten_tonu:'acik_bugday', ... } — FOTOĞRAF YOK
  lessonHintTr?: string;
  culturalTags?: string[];
  religiousOptIn?: boolean;                     // varsayılan false
  reuseCharacterId?: Id;                        // "Elif'in kahramanı" tekrar
}

export interface StoryOutline {
  titleTr: string; lessonTr: string;
  scenes: { pageNo: number; summaryTr: string; emotion: string }[];
}
export interface StoryCharacter {
  id: Id; role: string; nameTr: string; isPrimary: boolean;
  sheet?: SignedMedia;
  variants?: { id: string; image: SignedMedia }[];   // ebeveyn birini seçer
}
export interface StoryPage {
  id: Id; pageNo: number; textTr?: string; summaryTr?: string;
  emotion?: string; wordCount?: number;
  image?: SignedMedia; safeZone: 'bottom'|'top'|'left'|'right';
  imageStatus: 'pending'|'generating'|'qa_failed'|'manual_review'|'ready'|'failed';
  editedByUser: boolean;
}
export interface Story {
  id: Id; title?: string; status: StoryStatus;
  childId?: Id; heroName: string; ageBand: AgeBand;
  themeCode?: string; artStyleCode: string; pageCount: number; lessonTr?: string;
  characters: StoryCharacter[];
  outline?: StoryOutline;
  pages: StoryPage[];
  audio: AudioRenditionSummary[];
  activeJobs: JobRef[];
  cover?: SignedMedia;
  approvedAt?: IsoDate; createdAt: IsoDate; readyAt?: IsoDate;
}
export interface StorySummary {
  id: Id; title: string; cover?: SignedMedia; childName?: string;
  ageBand: AgeBand; status: StoryStatus; hasAudio: boolean; voiceLabels: string[];
  isFavorite: boolean; printedCount: number; createdAt: IsoDate;
}

// ── Seslendirme & okuyucu ──────────────────────────────────────
export interface AudioRenditionSummary {
  id: Id; voiceKind: 'cloned'|'system'; voiceLabel: string;
  status: 'queued'|'running'|'succeeded'|'failed'|'stale';
  durationMs?: number; tier: Tier;
  alignment: { source: 'provider'|'forced_alignment'|'sentence_estimate'|'none';
               granularity: 'word'|'sentence'|'page'|'none' };
  isDefault: boolean; createdAt: IsoDate;
}

/** ⭐ Okuyucunun TEK veri kaynağı: tek çağrı, tam senkron veri. */
export interface PlayerManifest {
  storyId: Id; renditionId: Id; titleTr: string;
  voice: { kind: 'cloned'|'system'; label: string; profileId?: Id };
  audio: SignedMedia; totalDurationMs: number;
  alignment: { source: string; granularity: 'word'|'sentence'|'page'|'none' };
  typography: { fontFamily: 'Andika'|'Nunito'|'Lexend'|'OpenDyslexic';
                sizePt: number; lineHeight: number };
  bedtimeMode: { fadeStartsAtPage: number; targetEndVolume: number };
  pages: PlayerPage[];
}
export interface PlayerPage {
  pageNo: number; image: SignedMedia; textTr: string;
  startMs: number; endMs: number;
  sentences: { i: number; charStart: number; charEnd: number; startMs: number; endMs: number }[];
  tokens: PlayerToken[];                        // granularity !== 'word' ise boş dizi
}
export interface PlayerToken {
  i: number; t: string; charStart: number; charEnd: number;
  s: number; e: number; isSentenceEnd: boolean;
}

// ── Baskı & ticaret ────────────────────────────────────────────
export interface BookBuild {
  id: Id; storyId: Id; formatCode: string; revision: number;
  status: 'building'|'ready'|'failed';
  spreads: { index: number; left: SignedMedia; right: SignedMedia }[];
  previewPdf?: SignedMedia; digitalPdf?: SignedMedia;
  spineMm?: number;
  checks: { dpiOk: boolean; fontsEmbedded: boolean; safeZoneOk: boolean; bleedOk: boolean };
  warningsTr: string[];
  qr: { enabled: boolean; renditionLabel?: string };
}

export interface QuoteRes {
  unitPriceTry: number; shippingTry: number; discountTry: number; totalTry: number;
  installmentOptions: { count: number; monthlyTry: number; totalTry: number }[];
  etaBusinessDays: [number, number];
  withdrawalNoticeTr: string;         // ⭐ FE bunu ZORUNLU basar (6502)
  withdrawalDocId: Id; distanceContractDocId: Id;
}
export interface CreateOrderReq {
  buildId: Id; quantity: number;
  shipping: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string;
              district: string; city: string; postalCode?: string };
  giftNoteTr?: string;
  withdrawalWaiverAccepted: true;     // ⚠️ LİTERAL true — false ile DERLENMEZ
  withdrawalDocId: Id; distanceContractDocId: Id;
  installment?: number;
}
export interface Order {
  id: Id; orderNo: string; status: string;
  storyTitle: string; cover?: SignedMedia;
  quantity: number; totalTry: number;
  etaDeliveryAt?: IsoDate;
  tracking?: { carrier: string; number: string; url: string };
  timeline: { at: IsoDate; statusTr: string }[];
  createdAt: IsoDate;
}

// ── Halka açık (QR) ────────────────────────────────────────────
export interface PublicPageAudio {
  storyTitleTr: string; pageNo: number; textTr: string;
  voiceLabel: string; audio: SignedMedia; tokens: PlayerToken[]; brandingUrl: string;
}
```

### 5.4 Endpoint tablosu

| Method + Yol | Auth | Body / Query | Yanıt | Not |
|---|---|---|---|---|
| `POST /v1/auth/guest` | – | `{deviceId}` | `{accessToken, user: Me}` | Değer önce, hesap sonra |
| `POST /v1/auth/otp/start` | – | `{channel, destination}` | `{challengeId, expiresInSec, resendAfterSec}` | rate-limit |
| `POST /v1/auth/otp/verify` | – | `{challengeId, code, deviceId, mergeGuestToken?}` | `{accessToken, refreshToken, user, isNewUser}` | misafir birleştirme |
| `POST /v1/auth/refresh` / `logout` | ✓ | `{refreshToken}` | token / `{ok}` | |
| `GET /v1/me` | ✓ | – | `Me` | |
| `PATCH /v1/me` | ✓ | `{displayName?, marketingOptIn?, timezone?}` | `Me` | marketingOptIn → İYS |
| `DELETE /v1/me` | ✓ | `{confirmText:'SIL', reason?}` | `202 {job}` | Apple 5.1.1(v) |
| `GET /v1/legal/:kind/current` | – | – | `LegalDocument` | |
| `GET /v1/consents` | ✓ | – | `ConsentState` | |
| `POST /v1/consents` | ✓ | `{subject, granted, documentId}` | `{consentState}` | **her subject AYRI çağrı** |
| `DELETE /v1/consents/:subject` | ✓ | – | `{consentState, sideEffectsTr[], jobId?}` | sonuçlar önce TR gösterilir |
| `GET /v1/children` · `POST` · `PATCH /:id` · `DELETE /:id` | ✓ | `Child` alanları | `Child` / `Paginated<Child>` | fotoğraf alanı YOK |
| `GET /v1/catalog/themes?ageBand` | – | – | `{items: StoryTheme[]}` | landing için auth'suz |
| `GET /v1/catalog/art-styles` · `character-options` · `system-voices` · `book-formats` | – | – | ilgili tip | |
| `POST /v1/uploads/presign` | ✓ | `{kind, mimeType, sizeBytes, sha256}` | `{assetId, uploadUrl, headers, expiresAt}` | tarayıcı doğrudan S3'e |
| `GET /v1/voice/profiles` | ✓ | – | `{items: VoiceProfile[], limit}` | |
| `POST /v1/voice/profiles` | ✓ | `{displayName, relation}` | `{profile, consentRequired[]}` | |
| `GET /v1/voice/profiles/:id/script` | ✓ | – | `VoiceScriptBundle` | sunucu üretimi, TTL 15dk |
| `POST /v1/voice/profiles/:id/takes` | ✓ | `{step, assetId, scriptId}` | `SubmitTakeRes` | **anında kalite geri bildirimi** |
| `POST /v1/voice/profiles/:id/submit` | ✓ `Idem` | – | `202 {job}` | klon + önizleme |
| `POST /v1/voice/profiles/:id/accept` · `redo` | ✓ | `{fromStep?}` | `VoiceProfile` / `VoiceScriptBundle` | tek pasaj yeniden |
| `DELETE /v1/voice/profiles/:id` | ✓ | – | `202 {job, affectedStoryIds[]}` | sağlayıcıda da siler |
| `POST /v1/stories` | ✓ `Idem` | `CreateStoryReq` | `202 {storyId, job, creditCost}` | **AŞAMA 1** |
| `GET /v1/stories` · `/:id` | ✓ | filtreler | `Paginated<StorySummary>` / `Story` | |
| `POST /v1/stories/:id/character-variants/select` | ✓ | `{characterId, variantId}` | `StoryCharacter` | |
| `POST /v1/stories/:id/outline/approve` | ✓ `Idem` | `{edits?}` | `202 {job}` | ⏸ **KAPI 1** — pahalı aşama burada başlar |
| `POST /v1/stories/:id/outline/reject` | ✓ | `{reasonTr?}` | `202 {job}` | |
| `PATCH /v1/stories/:id/pages/:pageNo` | ✓ | `{textTr}` | `StoryPage` | moderasyondan geçer, sesi `stale` yapar |
| `POST /v1/stories/:id/pages/:pageNo/rewrite` · `reillustrate` | ✓ `Idem` | `{instructionTr?}` | `202 {job}` | tek sayfa, tüm kitap değil |
| `POST /v1/stories/:id/pages/:pageNo/revert` | ✓ | `{revision}` | `StoryPage` | |
| `POST /v1/stories/:id/approve` | ✓ | `{}` | `Story` | ⏸ **KAPI 2** — TTS/baskı ön koşulu |
| `POST /v1/stories/:id/sequel` · `favorite` · `DELETE` | ✓ | – | ilgili | |
| `POST /v1/stories/:id/audio` | ✓ `Idem` | `{voiceKind, voiceProfileId\|systemVoiceCode, tier?}` | `202 {renditionId, job, cached}` | `approvedAt` null → `409 STORY_NOT_APPROVED` |
| `GET /v1/stories/:id/audio` | ✓ | – | `AudioRenditionSummary[]` | |
| `GET /v1/stories/:id/player?renditionId` | ✓ | – | `PlayerManifest` | okuyucunun tek çağrısı |
| `POST /v1/stories/:id/audio/:rid/default` · `DELETE /v1/audio/renditions/:id` | ✓ | – | `{ok}` | |
| `POST /v1/stories/:id/progress` | ✓ | `{renditionId, positionMs, pageNo}` | `{ok}` | kaldığın yer |
| `GET /v1/jobs/:id` · `GET /v1/jobs?storyId&status` | ✓ | – | `Job` / `Paginated<Job>` | polling yolu |
| `GET /v1/jobs/:id/events` · `GET /v1/events` | ✓ | `Last-Event-ID` | SSE `ServerEvent` | opsiyonel |
| `POST /v1/jobs/:id/cancel` | ✓ | – | `Job` | |
| `GET /v1/entitlements` · `POST /v1/estimates` | ✓ | `{operation, params}` | `Entitlements` / `CostPreview` | kredi düşmeden önce göster |
| `POST /v1/stories/:id/book-builds` | ✓ `Idem` | `{formatCode, dedicationTr?, includeQr, qrRenditionId?}` | `202 {buildId, job}` | 4K yeniden üretim |
| `GET /v1/book-builds/:id` | ✓ | – | `BookBuild` | spread önizleme |
| `POST /v1/orders/quote` | ✓ | `{buildId, quantity, city, district}` | `QuoteRes` | cayma ibaresi burada |
| `POST /v1/orders` | ✓ `Idem` | `CreateOrderReq` | `{order, payment:{provider:'iyzico', redirectUrl}}` | `withdrawalWaiverAccepted !== true` → 400 |
| `GET /v1/orders` · `/:id` · `POST /:id/cancel` | ✓ | – | `Order` | |
| `GET /v1/billing/plans` · `subscription` · `credits` · `POST /checkout` · `POST /cancel` | ✓ | – | ilgili | |
| `POST /v1/stories/:id/exports` · `GET /v1/stories/:id/exports` | ✓ `Idem` | `{kind:'pdf'\|'mp4'}` | `202 {job}` / liste | |
| `POST /v1/privacy/requests` · `GET` · `POST /export` | ✓ | `{kind}` | `DataSubjectRequest` / `202 {job}` | KVKK m.11 |
| `GET /v1/privacy/data-map` | ✓ | – | `{categories[]}` | işleyici listesi |
| `POST /v1/support/report` | opsiyonel | `{targetType, targetId?, reason, detailTr, contactEmail?}` | `{reportId, slaHours:72}` | Apple 1.2; **oturumsuz ihbar** |
| `GET /p/:token` | – | – | `PublicPageAudio` | basılı kitaptaki QR |
| `/v1/ops/*` | admin | – | – | ayrı router (`@kh/contract/ops`) |
| `POST /v1/webhooks/{iyzico,print}` | imza | – | – | **contract'ta YOK** — `routes/internal/` |

---

