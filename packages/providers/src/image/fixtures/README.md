# Görsel sağlayıcı yanıt fixture'ları

**Bunlar canlı bir çağrıdan KAYDEDİLMEDİ.** Bu ortamda AI sağlayıcı API'leri bloklu ve
anahtar yok. Dosyalar, sağlayıcının yayımlanmış `generateContent` sözleşmesinden
(zarf yapısı, alan adları, `google.rpc` hata detayları) yeniden kurulmuş **şekil
fixture'larıdır**.

Ne kanıtlarlar:

- `protocol.ts` bu zarfları doğru ayrıştırıyor (görsel baytları, blok sebebi, token sayımı),
- `errors.ts` HTTP durum + `status` + `RetryInfo` üçlüsünü doğru `ProviderErrorKind`'a eşliyor,
- adaptör bu yanıtlar karşısında doğru `provider_usage` satırını ve doğru
  `ImageGenerateOutput` değerini üretiyor.

Ne kanıtlamazlar: sağlayıcının **bugün** bu zarfı döndürdüğünü. Anahtar geldiğinde ilk iş
tek bir stil plakası üretip yanıtı buraya **gerçekten kaydetmek** olmalı; zarf değiştiyse
değişen tek dosya `protocol.ts`'tir.

## ⭐ Ücretsiz katmanın 429'u neden iki ayrı fixture

Google, **dakikalık kısıtlamayı** ve **günlük hakkın bitmesini** aynı HTTP durumu ve
harfi harfine aynı cümleyle ("You exceeded your current quota, please check your plan and
billing details") bildirir. İkisini yalnızca yapısal `QuotaFailure.quotaId` ayırır
(`…PerMinute…` / `…PerDay…`).

Fark ucuz değil: dakikalık kısıtı `quota_exhausted` sayarsak router yeniden denemez ve
18 saniye sonra sorunsuz üretilecek bir sayfa kaybedilir; günlük hakkın bitmesini
`rate_limited` sayarsak üç deneme + yedek + kuyruk tekrarı boyunca kesin bir "hayır" için
ebeveynin akşamından dakikalar harcanır. Sınıflandırma `src/google/quota.ts` içinde,
üç Google adaptörü için ortak.

| Dosya | Senaryo | Beklenen davranış |
|---|---|---|
| `generate-success.json` | 200, tek `inlineData` parçası | Görsel + 1 ücretli usage satırı |
| `generate-success-with-text-part.json` | 200, önce metin sonra görsel parçası | Metin parçası yok sayılır, görsel bulunur |
| `blocked-prompt-feedback.json` | 200, `promptFeedback.blockReason` | `blockedReason`, hata DEĞİL — prompt sanitize + 1 retry |
| `blocked-finish-reason.json` | 200, `finishReason: IMAGE_SAFETY` | `blockedReason`, ücretsiz usage satırı |
| `error-429-rate-limited.json` | 429 + `RetryInfo.retryDelay: 23s` | `rate_limited`, `retryAfterMs = 23000` |
| `error-429-quota-exhausted.json` | 429, kota/faturalandırma metni | `quota_exhausted` — aynı sağlayıcıda beklemek anlamsız, yedeğe geç |
| `error-429-free-tier-minute.json` | ⭐ 429, ücretsiz katman **dakikalık** kısıt | `rate_limited` (retry EDİLİR), `retryAfterMs = 18000` |
| `error-429-free-tier-day.json` | ⭐ 429, ücretsiz katman **günlük** hak bitti | `quota_exhausted` (retry EDİLMEZ) |
| `error-401-unauthenticated.json` | 401 | `auth`, retry EDİLMEZ |
| `error-400-invalid-argument.json` | 400 | `invalid_request`, retry EDİLMEZ |
| `error-503-unavailable.json` | 503 | `unavailable`, retry edilir |
| `malformed-no-image.json` | 200 ama görsel yok | `unavailable` (zarf değişikliği varsayımı) |
