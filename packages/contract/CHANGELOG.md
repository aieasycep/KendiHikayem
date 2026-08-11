# @kendihikayem/contract — değişiklik günlüğü

Sözleşme 10 ajanın tek ortak gerçeğidir. Buradaki her kırıcı değişiklik 10 pakette iş demektir.
Değişiklik talebi: `docs/contract-rfc/NNN-baslik.md` (istenen tip + gerekçe + hangi ekran).
Karar mercii: A0-CONTRACT.

**Kural:** şema değişirse `pnpm --filter @kendihikayem/contract openapi:write` çalıştırılır ve
üretilen `openapi.snapshot.yaml` commit'lenir. `contract:check` bu dosyayı yeniden üretip
byte düzeyinde karşılaştırır; fark varsa CI kırılır.

---

## 0.2.0 — 2026-08-11 · YAŞ BANTLARI YENİDEN TANIMLANDI

### Kırıcı

- **`AgeBand` = `'0-2' | '3-5' | '6-8'`** (önceki: `'3-5' | '6-8' | '9-12'`).
  Ürün doğumdan başlıyor, üst uç kalkıyor. `9-12` üretimden çıktı; taşıyan
  kayıtlar `6-8`'e taşındı (`packages/db/migrations/0002_age_band_0_2_backfill.sql`).
  Etkilenen şemalar: `childSchema`, `storySchema`, `storySummarySchema`,
  `createStoryReqSchema`, `storyThemeSchema.ageBands`, `systemVoiceSchema.ageBands`,
  `catalog.themes` ve `catalog.characterOptions` sorgu parametreleri.
- **`pageCountSchema` genişledi:** `6 | 8 | 12 | 14 | 16`. 6 ve 8 YALNIZCA `0-2`
  içindir; `0-2` için 12/14/16 gönderen istek `422 VALIDATION_FAILED` alır.

### Eklendi

- `AGE_BANDS` (sıralı liste) ve `AGE_BAND_HINTS_TR` — arayüz bantları elle dizmesin.
- `PAGE_COUNT_OPTIONS_BY_AGE_BAND`, `DEFAULT_PAGE_COUNT_BY_AGE_BAND`,
  `WORDS_PER_PAGE_BY_AGE_BAND`, `isPageCountAllowed()`, `clampPageCount()`.

### Sapma (bilinçli)

Uzunluk kuralı `createStoryReqSchema` üzerine `.refine()` olarak KONULMADI: `ZodEffects`
ts-rest'in gövde tipi çıkarımını ve `@ts-rest/open-api` üretimini bozuyor. Kural veri
olarak taşınır; sunucu ve istemci ayrı ayrı uygular. `0-2` için 12 sayfa reddi
`packages/mock` testleriyle korunuyor.

---

## 0.1.0 — 2026-08-11 · İLK DONDURMA (Faz 0)

82 kullanıcı ucu (`apiContract`) + 12 ops ucu (`opsContract`). Kaynak: `docs/SPEC-API.md` §5.

### Eklendi

- **Hata taksonomisi (tek union).** `ErrorCode` 37 kod içerir; ses kalite kodları
  (`GURULTULU`, `COK_HIZLI` …) ayrı bir union değil, aynı evrenin parçasıdır.
  `ERROR_CATALOG` her kod için `messageTr` (kullanıcıya doğrudan gösterilir),
  varsayılan HTTP durumu, `retryable` ve grup bilgisi taşır. Testler her mesajın
  SOMUT TALİMATLA bittiğini zorunlu kılar.
- **Markalı kimlikler.** `StoryId`, `ChildId`, `VoiceProfileId` … Yanıt tarafı markalıdır
  (yanlış kimliği geçirmek derlenmez), istek tarafı düz `string`'dir (istemci rahat eder).
- **`JobRef` + 15 olaylı SSE union'ı.** `Last-Event-ID` ile replay; `seq` her olayda.
  İlerleme yüzde değil, `progress.labelTr` metnidir ("Elif'in odası çiziliyor").
- **İki aşamalı hikaye + iki kapı.** `POST /v1/stories` yalnızca iskelet üretir;
  `outline/approve` (KAPI 1) pahalı aşamayı başlatır; `approve` (KAPI 2) seslendirme
  ve baskının ön koşuludur.
- **Ses onboarding'i (SPEC §7'nin 11 adımı).** Sunucu üretimi okuma metinleri (TTL 15 dk,
  tek kullanımlık), take başına anında kalite ölçümü, `VOICE_QUALITY_THRESHOLDS` sabitleri,
  önizleme/kabul/tek pasaj yenileme ve `sideEffectsTr` ile silme zinciri.
- **`PlayerManifest`.** Okuyucunun tek çağrısı: sayfa → cümle → kelime zaman damgaları.
- **`Idempotency-Key`** yazan TÜM uçlarda zorunlu.
- **Rıza kanıt zinciri.** Aydınlatma görüntüleme (`implicit_view`) ve açık rıza
  (`explicit_checkbox`) ayrı kayıtlar; `documentSha256` ile hangi metne onay verildiği
  kanıtlanır; `consentSideEffects` ucu geri almanın sonuçlarını ÖNCEDEN Türkçe verir.
- **6502 kanıt zinciri.** `QuoteRes.withdrawalNoticeTr` + `withdrawalWaiverAccepted: true`
  literal tipi + onaylanan belge kimlikleri.
- **`endpoints` manifestosu.** Yol/yöntem/yetki/idempotency/maliyet/SSE + hangi ekranda
  kullanıldığı. `EndpointKey` sözleşmeden türetilir: yeni uç eklenip manifest
  güncellenmezse hem contract hem mock DERLENMEZ.
- **`createApiClient()` + `newIdempotencyKey()`.** Her uygulamanın `initClient` kalıbını
  yeniden yazmasını ve `x-client-version` başlığını unutmasını engeller.
- **İsim allowlist'i** SPEC §10.4 K1 ile birebir: en fazla üç sözcük, yalnızca Türkçe
  harfler, sözcükler boşluk/kesme/tire ile ayrılır.

### SPEC-API'den bilinçli sapmalar

| # | Sapma | Gerekçe |
|---|---|---|
| 1 | Para alanları (`totalTry`, `basePriceTry` …) **KURUŞ cinsinden tam sayı** ve `MoneyTry` ile markalı. Biçimlendirme `formatTryTr()`. | SPEC birimi hiç söylemiyordu. Kayan noktalı para 10 ajanlık projede sessiz yuvarlama hatası üretir. Alan adları SPEC ile aynı bırakıldı. |
| 2 | `Idempotency-Key` SPEC'te yalnızca "Idem" işaretli uçlarda zorunluydu; sözleşmede **tüm yazma uçlarında** zorunlu. | A0 brief'i. Ek maliyeti yok, çift OTP/çift sipariş sınıfını tümden kapatıyor. Maliyet taşıyan uçlar manifestte `costly: true` ile ayrıca işaretli. |
| 3 | `IDEMPOTENCY_CONFLICT` **ve** `IDEMPOTENCY_KEY_REUSED` ayrı kodlardır. | İlki "aynı anahtar + farklı gövde", ikincisi "anahtar başka bir işlem için kullanıldı". İki farklı kullanıcı mesajı gerekiyor. |
| 4 | `MODERATION_BLOCKED` (üretilen çıktı) ile `CONTENT_BLOCKED` (kullanıcı girdisi) ayrı. `VOICE_SLOT_EXHAUSTED` (sağlayıcı kapasitesi, retryable) ile `VOICE_LIMIT_REACHED` (kullanıcı kotası) ayrı. | Aynı ekranda tamamen farklı iki eylem gerektiriyorlar. |
| 5 | SSE union'ına `page.ready`, `image.ready`, `audio.chunk.ready` eklendi. | A0 brief'i istedi; üçü de aşamalı teslimin farklı aşamalarını taşıyor ve SPEC'teki olaylarla çakışmıyor. |
| 6 | `Order.status` serbest `string` yerine enum. | FE'nin `switch` yazabilmesi için. Durum listesi SPEC §9 akışından türetildi. |
| 7 | Eklenen uçlar: `GET /v1/consents/:subject/side-effects`, `GET /v1/voice/profiles/:id`, `GET|PUT /v1/me/reading-preferences`, `GET /v1/catalog/interests`. | Sırasıyla A02, V07, A06 ve S02 ekranları SPEC §11'de var ama uçları tabloda yoktu. |
| 8 | `openapi.snapshot.yaml` üretilirken tekrar eden şemalar `components/schemas` altına taşınır. | Ham çıktı 2,8 MB idi; okunamaz ve her değişiklikte devasa diff üretiyordu. Şimdi 318 KB. |
| 9 | Abonelik uçları (`billing.subscription`, `billing.cancel`) yerinde ama MVP'de aboneliksiz. | Ürün kararı: kredi paketi + tek seferlik baskı. Uçlar SPEC tablosuyla uyum için korundu. |

### Kırıcı olmayan notlar

- `.d.ts` üretilmez: paket kaynak olarak tüketilir (`main: ./src/index.ts` + tsconfig paths).
  ts-rest'in çıkarsanan router tipleri bildirim dosyasına serileştirilemeyecek kadar büyüktür.
- `pnpm build` sözleşmeyi CommonJS'e derler; bunun tek amacı `contract:check`'in ek bir
  çalıştırıcıya (tsx vb.) bağımlı olmadan `node` ile çalışabilmesidir.
