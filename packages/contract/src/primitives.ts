/**
 * primitives.ts — sözleşmenin çekirdek yapı taşları.
 *
 * Bu dosyada tanımlananlar HER endpoint tarafından paylaşılır: markalı kimlikler,
 * hata taksonomisi (tek union + Türkçe kullanıcı mesajı), sayfalama, uzun iş referansı,
 * imzalı medya ve para birimi.
 *
 * NORMATİF KAYNAK: docs/SPEC-API.md §5.1. Sapmalar CHANGELOG.md'de gerekçesiyle listelidir.
 *
 * KURAL 1 — Tüm 4xx/5xx yanıtları TAM OLARAK `ApiError` şeklindedir. Başka hata gövdesi yoktur.
 * KURAL 2 — `messageTr` doğrudan kullanıcıya gösterilir; `detail` asla gösterilmez.
 * KURAL 3 — Para birimi taşıyan her alan KURUŞ cinsinden tam sayıdır (bkz. `moneyTrySchema`).
 */

import { initContract } from '@ts-rest/core';
import { z } from 'zod';

/**
 * ts-rest sözleşme fabrikası. Durumsuzdur; tüm domain dosyaları bunu paylaşır ki
 * `c.type`, `c.otherResponse` gibi yardımcılar her yerde aynı olsun.
 */
export const c = initContract();

/* ────────────────────────────────────────────────────────────────────────────
 * Markalı kimlikler (branded types)
 *
 * `z.infer` (yanıt tarafı) markalı bir string üretir: `StoryId` yerine `ChildId`
 * geçirmek DERLENMEZ. `z.input` (istek tarafı) düz `string`'dir; yani istemci
 * gövde/param alanlarına düz string yazabilir, yanıttan gelen değerler ise tiplidir.
 * ──────────────────────────────────────────────────────────────────────────── */

const brandedId = <B extends string>(_brand: B) => z.string().uuid().brand<B>();

export const userIdSchema = brandedId('UserId');
export const childIdSchema = brandedId('ChildId');
export const storyIdSchema = brandedId('StoryId');
export const storyPageIdSchema = brandedId('StoryPageId');
export const storyCharacterIdSchema = brandedId('StoryCharacterId');
export const voiceProfileIdSchema = brandedId('VoiceProfileId');
export const voiceScriptIdSchema = brandedId('VoiceScriptId');
export const jobIdSchema = brandedId('JobId');
export const renditionIdSchema = brandedId('RenditionId');
export const bookBuildIdSchema = brandedId('BookBuildId');
export const orderIdSchema = brandedId('OrderId');
export const assetIdSchema = brandedId('AssetId');
export const legalDocumentIdSchema = brandedId('LegalDocumentId');
export const privacyRequestIdSchema = brandedId('PrivacyRequestId');
export const reportIdSchema = brandedId('ReportId');
export const exportIdSchema = brandedId('ExportId');

export type UserId = z.infer<typeof userIdSchema>;
export type ChildId = z.infer<typeof childIdSchema>;
export type StoryId = z.infer<typeof storyIdSchema>;
export type StoryPageId = z.infer<typeof storyPageIdSchema>;
export type StoryCharacterId = z.infer<typeof storyCharacterIdSchema>;
export type VoiceProfileId = z.infer<typeof voiceProfileIdSchema>;
export type VoiceScriptId = z.infer<typeof voiceScriptIdSchema>;
export type JobId = z.infer<typeof jobIdSchema>;
export type RenditionId = z.infer<typeof renditionIdSchema>;
export type BookBuildId = z.infer<typeof bookBuildIdSchema>;
export type OrderId = z.infer<typeof orderIdSchema>;
export type AssetId = z.infer<typeof assetIdSchema>;
export type LegalDocumentId = z.infer<typeof legalDocumentIdSchema>;
export type PrivacyRequestId = z.infer<typeof privacyRequestIdSchema>;
export type ReportId = z.infer<typeof reportIdSchema>;
export type ExportId = z.infer<typeof exportIdSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Skaler tipler
 * ──────────────────────────────────────────────────────────────────────────── */

/** ISO-8601, her zaman UTC: '2026-08-10T12:00:00Z'. */
export const isoDateSchema = z.string().datetime().brand<'IsoDate'>();
export type IsoDate = z.infer<typeof isoDateSchema>;

/** Opak sayfalama imleci. İçeriği sözleşme dışıdır, istemci yorumlamaz. */
export const cursorSchema = z.string().min(1).brand<'Cursor'>();
export type Cursor = z.infer<typeof cursorSchema>;

export const ageBandSchema = z.enum(['3-5', '6-8', '9-12']);
export type AgeBand = z.infer<typeof ageBandSchema>;

/** `draft` = ucuz/hızlı önizleme, `quality` = teslim kalitesi. */
export const tierSchema = z.enum(['draft', 'quality']);
export type Tier = z.infer<typeof tierSchema>;

/**
 * Para. ⚠️ BİRİM: KURUŞ (tam sayı). 899,00 TL → 89900.
 * SPEC-API alan adları `...Try` olarak kalır ama değer daima kuruştur; kayan nokta
 * ile para taşımak 10 ajanlık bir projede sessiz yuvarlama hatası demektir.
 * Ekranda göstermek için `formatTryTr()` kullanın.
 */
export const moneyTrySchema = z.number().int().min(0).brand<'KurusTRY'>();
export type MoneyTry = z.infer<typeof moneyTrySchema>;

export const CURRENCY_CODE = 'TRY' as const;

/** 89900 → "899,00 TL". Binlik ayıracı nokta, ondalık ayıracı virgül (tr-TR). */
export function formatTryTr(kurus: number): string {
  const negative = kurus < 0;
  const abs = Math.abs(Math.round(kurus));
  const lira = Math.floor(abs / 100).toString();
  const kurusPart = (abs % 100).toString().padStart(2, '0');
  const grouped = lira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${kurusPart} TL`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hata taksonomisi — TEK union, her kodun Türkçe kullanıcı mesajı var
 *
 * `messageTr` kuralı: SOMUT TALİMAT içerir. "Bir hata oluştu" YASAK.
 * Kullanıcı mesajı okuduktan sonra NE YAPACAĞINI bilmelidir.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Ses kaydı (take) kalite kontrolünde üretilen kodlar. `SubmitTakeRes.issues`
 * dizisinde döner ve aynı zamanda `ErrorCode` union'ının bir alt kümesidir —
 * sözleşmede tek bir hata evreni vardır (SPEC §7 adım 7 eşikleri).
 */
export const TAKE_ISSUE_CODES = [
  'COK_KISA',
  'COK_UZUN',
  'GURULTULU',
  'KLIPLENME',
  'COK_SESSIZ',
  'YANKILI',
  'COK_HIZLI',
  'COK_YAVAS',
  'METIN_ESLESMEDI',
  'BIRDEN_FAZLA_KONUSMACI',
  'DAR_BANT_GENISLIGI',
] as const;

const TRANSPORT_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_FAILED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_CONFLICT',
  'CLIENT_UPDATE_REQUIRED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL',
] as const;

const QUOTA_ERROR_CODES = [
  'QUOTA_EXCEEDED',
  'COST_CAP_REACHED',
  'INSUFFICIENT_CREDITS',
  'PLAN_UPGRADE_REQUIRED',
] as const;

const CONSENT_ERROR_CODES = [
  'CONSENT_REQUIRED',
  'CONSENT_REVOKED',
  'PHONE_VERIFICATION_REQUIRED',
] as const;

const VOICE_ERROR_CODES = [
  'VOICE_QUALITY_LOW',
  'VOICE_SCRIPT_MISMATCH',
  'VOICE_LIMIT_REACHED',
  'VOICE_SLOT_EXHAUSTED',
] as const;

const CONTENT_ERROR_CODES = [
  'INVALID_NAME',
  'INJECTION_DETECTED',
  'CONTENT_BLOCKED',
  'MODERATION_BLOCKED',
  'AGE_POLICY_VIOLATION',
] as const;

const FLOW_ERROR_CODES = ['STORY_NOT_APPROVED', 'JOB_NOT_CANCELLABLE'] as const;

export const ERROR_CODES = [
  ...TRANSPORT_ERROR_CODES,
  ...QUOTA_ERROR_CODES,
  ...CONSENT_ERROR_CODES,
  ...VOICE_ERROR_CODES,
  ...CONTENT_ERROR_CODES,
  ...FLOW_ERROR_CODES,
  ...TAKE_ISSUE_CODES,
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const takeIssueSchema = z.enum(TAKE_ISSUE_CODES);
export type TakeIssue = z.infer<typeof takeIssueSchema>;

export type ErrorGroup =
  | 'transport'
  | 'quota'
  | 'consent'
  | 'voice'
  | 'content'
  | 'flow'
  | 'take';

export interface ErrorCodeMeta {
  /** Varsayılan HTTP durumu. Sunucu bunu değiştirebilir ama gövde şekli değişmez. */
  status: number;
  /** Aynı isteğin tekrar denenmesi mantıklı mı? (istemci otomatik retry kararı) */
  retryable: boolean;
  group: ErrorGroup;
  /** Kullanıcıya doğrudan gösterilen Türkçe mesaj — somut talimat içerir. */
  messageTr: string;
}

/**
 * Hata kataloğu. Sunucu `messageTr` alanını buradan doldurur; istemci ağ hatası gibi
 * yanıtsız durumlarda `apiErrorFrom()` ile aynı metni üretir. Tek metin kaynağı.
 */
export const ERROR_CATALOG: Record<ErrorCode, ErrorCodeMeta> = {
  /* ── taşıma / oturum ────────────────────────────────────────── */
  UNAUTHENTICATED: {
    status: 401,
    retryable: false,
    group: 'transport',
    messageTr: 'Oturumunuzun süresi doldu. Telefon numaranızla tekrar giriş yapın.',
  },
  FORBIDDEN: {
    status: 403,
    retryable: false,
    group: 'transport',
    messageTr: 'Bu içerik sizin hesabınıza ait değil. Doğru hesapla giriş yapıp tekrar deneyin.',
  },
  NOT_FOUND: {
    status: 404,
    retryable: false,
    group: 'transport',
    messageTr: 'Aradığınız içerik bulunamadı. Silinmiş olabilir; kitaplığınıza dönüp tekrar deneyin.',
  },
  CONFLICT: {
    status: 409,
    retryable: false,
    group: 'transport',
    messageTr: 'Bu içerik başka bir yerden değişti. Ekranı aşağı çekip yenileyin, sonra tekrar deneyin.',
  },
  VALIDATION_FAILED: {
    status: 422,
    retryable: false,
    group: 'transport',
    messageTr: 'Bazı bilgiler eksik veya hatalı. İşaretli alanı düzeltip tekrar gönderin.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    retryable: false,
    group: 'transport',
    messageTr: 'Bu istek zaten işlendi; ikinci kez ücretlendirilmediniz. Sonucu görmek için ekranı yenileyin.',
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    retryable: false,
    group: 'transport',
    messageTr: 'Aynı işlem farklı bilgilerle yeniden gönderildi. Ekranı yenileyip baştan deneyin.',
  },
  CLIENT_UPDATE_REQUIRED: {
    status: 426,
    retryable: false,
    group: 'transport',
    messageTr: 'Uygulamanın bu sürümü artık desteklenmiyor. Mağazadan güncelledikten sonra devam edin.',
  },
  RATE_LIMITED: {
    status: 429,
    retryable: true,
    group: 'transport',
    messageTr: 'Çok sık denediniz. Birkaç saniye bekleyip tekrar deneyin.',
  },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    retryable: true,
    group: 'transport',
    messageTr:
      'Üretim servisimize şu an ulaşılamıyor. İşiniz kuyrukta duruyor, hazır olunca bildirim göndereceğiz.',
  },
  INTERNAL: {
    status: 500,
    retryable: true,
    group: 'transport',
    messageTr: 'Beklenmedik bir sorun oldu ve ekibimize bildirildi. Birkaç dakika sonra tekrar deneyin.',
  },

  /* ── kota / maliyet ─────────────────────────────────────────── */
  QUOTA_EXCEEDED: {
    status: 429,
    retryable: false,
    group: 'quota',
    messageTr: 'Bu dönemki hikaye hakkınız doldu. Kredi paketi alarak hemen devam edebilirsiniz.',
  },
  COST_CAP_REACHED: {
    status: 429,
    retryable: false,
    group: 'quota',
    messageTr:
      'Aylık üretim bütçeniz doldu; işlem hiç başlatılmadı, krediniz harcanmadı. Kredi paketi ekleyin ya da yeni dönemi bekleyin.',
  },
  INSUFFICIENT_CREDITS: {
    status: 402,
    retryable: false,
    group: 'quota',
    messageTr: 'Krediniz bu hikaye için yetmiyor. Kredi paketi alıp kaldığınız yerden devam edin.',
  },
  PLAN_UPGRADE_REQUIRED: {
    status: 402,
    retryable: false,
    group: 'quota',
    messageTr: 'Bu özellik mevcut paketinizde yok. Paketi yükselttiğinizde aynı ekrandan devam edersiniz.',
  },

  /* ── rıza / doğrulama ───────────────────────────────────────── */
  CONSENT_REQUIRED: {
    status: 403,
    retryable: false,
    group: 'consent',
    messageTr:
      'Devam etmek için ses izinlerini onaylamanız gerekiyor. "Ses İzinleri" ekranındaki iki kutuyu da işaretleyin.',
  },
  CONSENT_REVOKED: {
    status: 403,
    retryable: false,
    group: 'consent',
    messageTr:
      'İzninizi geri aldığınız için bu özellik kapalı. Ayarlar → Gizlilik ve İzinler ekranından yeniden izin verebilirsiniz.',
  },
  PHONE_VERIFICATION_REQUIRED: {
    status: 403,
    retryable: false,
    group: 'consent',
    messageTr:
      'Bu adım için telefon doğrulaması gerekiyor. Numaranızı girip size göndereceğimiz 6 haneli kodu onaylayın.',
  },

  /* ── ses ────────────────────────────────────────────────────── */
  VOICE_QUALITY_LOW: {
    status: 422,
    retryable: false,
    group: 'voice',
    messageTr:
      'Kayıtların kalitesi ses klonlamak için yeterli değil. Sessiz bir odada, telefonu 20 cm uzakta tutarak pasajları yeniden okuyun.',
  },
  VOICE_SCRIPT_MISMATCH: {
    status: 422,
    retryable: false,
    group: 'voice',
    messageTr: 'Okuduğunuz metin ekrandakiyle eşleşmedi. Ekrandaki cümleyi baştan sona, olduğu gibi okuyun.',
  },
  VOICE_LIMIT_REACHED: {
    status: 409,
    retryable: false,
    group: 'voice',
    messageTr: 'Ses profili hakkınız doldu. Yeni bir ses eklemek için önce mevcut seslerden birini silin.',
  },
  VOICE_SLOT_EXHAUSTED: {
    status: 503,
    retryable: true,
    group: 'voice',
    messageTr:
      'Ses üretimi şu an çok yoğun. Kaydınız kuyruğa alındı; sesiniz hazır olduğunda bildirim göndereceğiz.',
  },

  /* ── içerik güvenliği ───────────────────────────────────────── */
  INVALID_NAME: {
    status: 422,
    retryable: false,
    group: 'content',
    messageTr:
      'Bu isim kullanılamıyor. Yalnızca harf, boşluk ve kesme işareti içeren 1-30 karakterlik bir isim yazın.',
  },
  INJECTION_DETECTED: {
    status: 422,
    retryable: false,
    group: 'content',
    messageTr:
      'Yazdığınız metinde uygulamaya verilmiş komut gibi görünen ifadeler var. Hikaye fikrinizi kendi cümlelerinizle, sade biçimde yazın.',
  },
  CONTENT_BLOCKED: {
    status: 422,
    retryable: false,
    group: 'content',
    messageTr:
      'Bu fikir çocuklar için uygun bulunmadı. Korku, şiddet veya yetişkin temalarını çıkarıp yeniden yazın.',
  },
  MODERATION_BLOCKED: {
    status: 422,
    retryable: false,
    group: 'content',
    messageTr:
      'Üretilen metin güvenlik kontrolünden geçemedi ve krediniz harcanmadı. Temayı biraz değiştirip tekrar deneyin.',
  },
  AGE_POLICY_VIOLATION: {
    status: 422,
    retryable: false,
    group: 'content',
    messageTr:
      'Bu içerik seçtiğiniz yaş grubu için uygun değil. Yaş bandını yükseltin veya daha yumuşak bir tema seçin.',
  },

  /* ── akış ───────────────────────────────────────────────────── */
  STORY_NOT_APPROVED: {
    status: 409,
    retryable: false,
    group: 'flow',
    messageTr:
      'Önce hikayeyi onaylamanız gerekiyor. Hikaye ekranında "Onayla" deyip seslendirme ve baskıya geçebilirsiniz.',
  },
  JOB_NOT_CANCELLABLE: {
    status: 409,
    retryable: false,
    group: 'flow',
    messageTr: 'Bu işlem tamamlanmak üzere, artık durdurulamıyor. Bitmesini bekleyin.',
  },

  /* ── ses kaydı kalite kontrolü (SPEC §7 adım 7) ─────────────── */
  COK_KISA: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Kayıt çok kısa kaldı. Metnin tamamını okuyup bitirdikten sonra durdurun.',
  },
  COK_UZUN: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Kayıt gereğinden uzun. Metni bir kez okumanız yeterli; bitince hemen durdurun.',
  },
  GURULTULU: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Arka planda gürültü var. Televizyon, klima veya vantilatör varsa kapatıp yeniden okuyun.',
  },
  KLIPLENME: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Sesiniz cihazda bozuluyor. Telefonu ağzınızdan biraz uzaklaştırıp daha alçak sesle okuyun.',
  },
  COK_SESSIZ: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Sesiniz çok kısık geldi. Telefonu 20 cm uzağınızda tutup normal konuşma sesinizle okuyun.',
  },
  YANKILI: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Odada yankı var. Halı, perde veya yatak gibi yumuşak yüzeylerin olduğu bir odada tekrar deneyin.',
  },
  COK_HIZLI: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Biraz daha yavaş okuyun; masal anlatır gibi, cümle sonlarında kısa duraklayın.',
  },
  COK_YAVAS: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Biraz daha akıcı okuyun; kelimeleri uzatmadan, günlük konuşma temponuzda ilerleyin.',
  },
  METIN_ESLESMEDI: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Okuduklarınız ekrandaki metinle tam eşleşmedi. Metni satır satır takip ederek yeniden okuyun.',
  },
  BIRDEN_FAZLA_KONUSMACI: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr: 'Kayıtta birden fazla kişi duyuluyor. Yalnız olduğunuz sessiz bir odada tekrar deneyin.',
  },
  DAR_BANT_GENISLIGI: {
    status: 422,
    retryable: false,
    group: 'take',
    messageTr:
      'Mikrofonunuz sesin tizlerini kesiyor. Kulaklık takılıysa çıkarıp telefonun kendi mikrofonuyla deneyin.',
  },
};

/** Tüm 4xx/5xx yanıtları TAM OLARAK bu şekle sahiptir. Başka hata gövdesi yoktur. */
export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  /** KULLANICIYA DOĞRUDAN GÖSTERİLEBİLİR. */
  messageTr: z.string().min(1),
  /** İngilizce, teknik; UI'da GÖSTERİLMEZ, yalnızca log/Sentry. */
  detail: z.string().optional(),
  /** Hangi alan hatalı (form doğrulama). Örn. 'hero.name'. */
  field: z.string().optional(),
  retryable: z.boolean(),
  retryAfterSec: z.number().int().min(0).optional(),
  traceId: z.string().min(1),
  /** Yalnızca take/kalite hatalarında: aynı anda birden çok sorun bulunabilir. */
  issues: z.array(takeIssueSchema).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Katalogdan tam bir `ApiError` üretir. Sunucu da istemci de (ağ hatası,
 * zaman aşımı gibi yanıtsız durumlar için) aynı fonksiyonu kullanır —
 * böylece kullanıcı aynı olayda hep aynı Türkçe metni görür.
 */
export function apiErrorFrom(
  code: ErrorCode,
  overrides: Partial<Omit<ApiError, 'code'>> = {},
): ApiError {
  const meta = ERROR_CATALOG[code];
  return {
    code,
    messageTr: meta.messageTr,
    retryable: meta.retryable,
    traceId: 'trace-yok',
    ...overrides,
  };
}

/** Katalogdaki varsayılan HTTP durumu. Sunucu tarafı yönlendirme için. */
export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CATALOG[code].status;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sayfalama
 * ──────────────────────────────────────────────────────────────────────────── */

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: cursorSchema.nullable(),
    total: z.number().int().min(0).optional(),
  });

export interface Paginated<T> {
  items: T[];
  nextCursor: Cursor | null;
  total?: number;
}

/** Her liste endpoint'inin ortak query'si. */
export const pageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Medya
 * ──────────────────────────────────────────────────────────────────────────── */

/** FE asla S3 anahtarı görmez; yalnızca süreli imzalı URL. */
export const signedMediaSchema = z.object({
  url: z.string().url(),
  mimeType: z.string().min(1),
  expiresAt: isoDateSchema,
  sizeBytes: z.number().int().min(0).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  durationMs: z.number().int().min(0).optional(),
});
export type SignedMedia = z.infer<typeof signedMediaSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Uzun işler
 * ──────────────────────────────────────────────────────────────────────────── */

export const jobKindSchema = z.enum([
  'story_outline',
  'story_fill',
  'story_page_rewrite',
  'voice_create',
  'voice_delete',
  'image_character_sheet',
  'image_book',
  'image_page',
  'audio_render',
  'pdf_build',
  'print_submit',
  'export_mp4',
  'privacy_export',
  'privacy_delete',
]);
export type JobKind = z.infer<typeof jobKindSchema>;

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/**
 * Uzun süren HER işlem bunu döner. FE'nin tek "bekleme" primitifi.
 * `eventsUrl` SSE adresidir; SSE İSTEĞE BAĞLIDIR — istemci her zaman
 * `GET /v1/jobs/:id` polling'e düşebilir (2 sn, exponential backoff).
 */
export const jobRefSchema = z.object({
  jobId: jobIdSchema,
  kind: jobKindSchema,
  etaMs: z.number().int().min(0).optional(),
  eventsUrl: z.string().min(1),
});
export type JobRef = z.infer<typeof jobRefSchema>;

/**
 * İlerleme YÜZDE değil, NE OLDUĞU olarak taşınır.
 * `labelTr` ekranda birebir gösterilir: "Elif'in odası çiziliyor".
 * `current`/`total` yalnızca ilerleme çubuğu içindir ve tek başına gösterilmez.
 */
export const jobProgressSchema = z.object({
  current: z.number().int().min(0),
  total: z.number().int().min(0),
  labelTr: z.string().min(1),
});
export type JobProgress = z.infer<typeof jobProgressSchema>;

export const costPreviewSchema = z.object({
  credits: z.number().int().min(0),
  breakdown: z.object({
    llm: z.number().int().min(0),
    image: z.number().int().min(0),
    tts: z.number().int().min(0),
  }),
  willConsumeQuota: z.boolean(),
});
export type CostPreview = z.infer<typeof costPreviewSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * Ortak yanıtlar ve başlıklar
 * ──────────────────────────────────────────────────────────────────────────── */

export const okSchema = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof okSchema>;

/**
 * Her istekte gönderilen başlıklar.
 * `x-client-version` ZORUNLUDUR: sunucu eski istemciyi `426 CLIENT_UPDATE_REQUIRED`
 * ile kesebilir (SPEC-API §5 konvansiyonlar).
 */
export const baseHeadersSchema = z.object({
  'x-client-version': z.string().min(1),
  authorization: z.string().optional(),
});

/**
 * Yazan (POST/PATCH/DELETE) HER endpoint için zorunlu.
 * Aynı anahtar + aynı gövde → aynı yanıt (tekrar ücretlendirme yok).
 * Aynı anahtar + farklı gövde → `409 IDEMPOTENCY_CONFLICT`.
 */
export const idempotencyHeadersSchema = z.object({
  'idempotency-key': z.string().min(8).max(128),
});

/** SSE yeniden bağlanma: istemci son gördüğü `seq` değerini geri gönderir. */
export const sseHeadersSchema = z.object({
  'last-event-id': z.string().optional(),
});

/**
 * Her route'a otomatik eklenen hata yanıtları (ts-rest `commonResponses`).
 * Gövde şekli tek: `ApiError`.
 */
export const commonErrorResponses = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
  426: apiErrorSchema,
  429: apiErrorSchema,
  500: apiErrorSchema,
  503: apiErrorSchema,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Ortak doğrulayıcılar
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * İnsan ismi allowlist'i (SPEC-API §5.3 `CreateStoryReq.hero.name`).
 * Türkçe harfler + boşluk + kesme/tire. Rakam, emoji, noktalama YOK —
 * isim alanı prompt enjeksiyonunun en kolay girişidir.
 */
export const HUMAN_NAME_PATTERN = /^[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü' -]{0,29}$/u;

export const humanNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(HUMAN_NAME_PATTERN, ERROR_CATALOG.INVALID_NAME.messageTr);

/** Serbest metin: kullanıcı fikri. Model için SALT VERİ, asla talimat değil. */
export const freeIdeaSchema = z.string().trim().max(200);

/** E.164 benzeri TR numarası: +905321234567 */
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Telefon numarası +90... biçiminde olmalı');

export const localeSchema = z.enum(['tr-TR']);
export const timezoneSchema = z.string().min(1);

/** SHA-256, küçük harf hex — hangi hukuki metne onay verildiğinin kanıtı. */
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'sha256 64 haneli küçük harf hex olmalı');
