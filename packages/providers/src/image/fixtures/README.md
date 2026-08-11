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

| Dosya | Senaryo | Beklenen davranış |
|---|---|---|
| `generate-success.json` | 200, tek `inlineData` parçası | Görsel + 1 ücretli usage satırı |
| `generate-success-with-text-part.json` | 200, önce metin sonra görsel parçası | Metin parçası yok sayılır, görsel bulunur |
| `blocked-prompt-feedback.json` | 200, `promptFeedback.blockReason` | `blockedReason`, hata DEĞİL — prompt sanitize + 1 retry |
| `blocked-finish-reason.json` | 200, `finishReason: IMAGE_SAFETY` | `blockedReason`, ücretsiz usage satırı |
| `error-429-rate-limited.json` | 429 + `RetryInfo.retryDelay: 23s` | `rate_limited`, `retryAfterMs = 23000` |
| `error-429-quota-exhausted.json` | 429, kota/faturalandırma metni | `quota_exhausted` — aynı sağlayıcıda beklemek anlamsız, yedeğe geç |
| `error-401-unauthenticated.json` | 401 | `auth`, retry EDİLMEZ |
| `error-400-invalid-argument.json` | 400 | `invalid_request`, retry EDİLMEZ |
| `error-503-unavailable.json` | 503 | `unavailable`, retry edilir |
| `malformed-no-image.json` | 200 ama görsel yok | `unavailable` (zarf değişikliği varsayımı) |
