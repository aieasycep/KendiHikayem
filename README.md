# KendiHikayem

Çocuğunuza özel bir masal. Sizin sesinizle.

**KendiHikayem**, ebeveynin çocuğuna özel bir masal ürettiği, bu masalı **kendi klonlanmış
sesiyle** seslendirdiği, masala özgün görseller ürettiren ve isterse **baskıya hazır bir
kitaba** dönüştüren bir uygulamadır. Türkiye pazarı için, tamamen Türkçe. Abonelik yok.

Tam teknik spesifikasyon: [`docs/SPEC.md`](docs/SPEC.md) ·
API sözleşmesi: [`docs/SPEC-API.md`](docs/SPEC-API.md) ·
Veri modeli: [`docs/SPEC-DATA-MODEL.md`](docs/SPEC-DATA-MODEL.md)

---

## 📱 APK nasıl indirilir ve telefona nasıl kurulur?

Her derleme sonunda GitHub, kurulabilir bir **Android APK** dosyası üretir. Aşağıdaki
adımlar bir Android telefonda test etmek içindir. iPhone'a bu yöntemle kurulum yapılamaz.

### 1. APK'yı indirin

1. GitHub'da bu depoyu açın, üstteki **Actions** sekmesine tıklayın.
2. Sol taraftaki listeden **Android APK** iş akışını seçin.
3. En üstteki (en yeni) çalışmaya tıklayın. Yanında yeşil ✅ olmalı.
   - Henüz hiç çalışma yoksa: sağdaki **Run workflow** düğmesine basıp dalı seçin ve
     başlatın. Derleme yaklaşık 10–20 dakika sürer.
4. Açılan sayfayı en alta kaydırın. **Artifacts** başlığının altında
   **`kendihikayem-debug-apk`** yazan bir dosya göreceksiniz. Üzerine tıklayın; bir `.zip`
   dosyası inecek.
5. **Bu `.zip` dosyasını telefonunuza aktarın** (WhatsApp'tan kendinize gönderebilir,
   Google Drive'a atabilir veya USB kablosuyla kopyalayabilirsiniz).

### 2. Telefonda kurun

1. Telefonda `.zip` dosyasını açın (çoğu telefonun **Dosyalar** uygulaması bunu yapar).
   İçinden **`app-debug.apk`** çıkacak.
2. `app-debug.apk` dosyasına dokunun.
3. Android şöyle bir uyarı verecek:
   *"Güvenlik nedeniyle telefonunuz bu kaynaktan gelen bilinmeyen uygulamaların
   yüklenmesine izin vermiyor."*
   → **Ayarlar**'a dokunun → **Bu kaynaktan yüklemeye izin ver** seçeneğini açın → geri
   dönün.
4. **Yükle** deyin. Bitince **Aç**.

> ℹ️ **"Yine de yükle"** uyarısı normaldir. Bu bir test (debug) sürümüdür; Google Play
> üzerinden gelmediği için Android sizi uyarır. Uygulama telefonunuzdan hiçbir veri
> göndermez — bu sürüm tamamen demo verisiyle çalışır (`API_MODE=mock`).

### 3. Ne göreceksiniz?

Bu ilk sürüm **gezinme iskeletidir**: ekranlar ve alt sekmeler çalışır, kitaplıkta
**"DEMO" etiketli örnek bir masal** vardır. Masal üretimi, ses klonlama ve baskı akışı
henüz bağlı değildir — o ekranlarda hangi ajanın neyi tamamlayacağını anlatan kesikli
çerçeveli notlar göreceksiniz.

### Sık karşılaşılan sorunlar

| Belirti | Sebep / çözüm |
|---|---|
| "Uygulama yüklenmedi" | İndirdiğiniz APK bozulmuş olabilir; `.zip`'i tekrar açıp APK'yı yeniden çıkarın. |
| Artifacts bölümü boş | Derleme başarısız olmuştur. Çalışmanın içindeki kırmızı adıma bakın. |
| Artifact indirilemiyor | Artifact'ler **30 gün** sonra silinir. Yeni bir çalışma başlatın. |
| Eski sürüm açılıyor | Önce eski uygulamayı kaldırın, sonra yeni APK'yı kurun. |

---

## Kurulum (geliştirici)

**Gereksinimler:** Node 22 (`.nvmrc`), pnpm 10.33.0, JDK 17+ (yalnızca yerel Android
derlemesi için), Docker (yalnızca yerel altyapı için).

```bash
pnpm install                 # pnpm-lock.yaml kilitli sürümlerle kurar
cp .env.example .env         # değerleri doldurun (mock modda çoğu boş kalabilir)

pnpm -w typecheck            # tüm paketlerde tsc --noEmit
pnpm -w lint                 # ESLint 9 + mimari sınır kuralları
pnpm -w test                 # Vitest

pnpm infra:up                # postgres + valkey + minio (docker compose)
pnpm infra:down
```

Mobil uygulamayı çalıştırmak için:

```bash
pnpm --filter @kendihikayem/mobile start        # Expo geliştirme sunucusu
pnpm --filter @kendihikayem/mobile android      # yerel Android derlemesi (Android SDK ister)
```

> ⚠️ `apps/mobile/android/` ve `apps/mobile/ios/` klasörleri **commit'lenmez**.
> `expo prebuild` bunları her seferinde yeniden üretir (CNG — Continuous Native Generation).

### `API_MODE` — tek anahtar

| Değer | Anlamı |
|---|---|
| `mock` | Hiçbir dış servise çıkılmaz. Tüm veri `packages/mock` fixture'larından gelir. Ajanlar ve APK derlemesi bu modda çalışır. |
| `live` | Gerçek sağlayıcılar çağrılır. `packages/config` şeması eksik anahtar varsa **açılışta** hata verir. |

Mobil tarafta karşılığı `EXPO_PUBLIC_API_MODE`'dur ve derleme anında JS paketine gömülür.

---

## Depo yapısı

```
apps/
  mobile/    Expo + expo-router uygulaması (Android/iOS)
  web/       Next.js 15 PWA                          — iskelet
  ops/       Yönetim paneli                          — iskelet
  api/       Fastify 5 + ts-rest HTTP katmanı        — iskelet
  worker/    BullMQ işçileri                         — iskelet
packages/
  contract/  ⭐ Zod + ts-rest sözleşmesi — TEK yazar: A0-CONTRACT
  mock/      MSW handler'ları ve Türkçe fixture'lar
  db/        Drizzle şema, migration, seed
  ui/        Tasarım sistemi (yalnızca F2 yazar)
  shared/    ✅ Türkçe yardımcıları (isim çekimleme, hece, okunabilirlik) — DOLU
  config/    ✅ zod ile doğrulanan env şeması — DOLU
  providers/ AI sağlayıcı adaptörleri
  media/     ffmpeg (ses) + sharp (görsel)
  pdf/       Baskıya hazır kitap üretimi
  safety/    İçerik güvenliği katmanları
infra/docker/compose.yml   postgres 16 · valkey 8 · minio
.github/workflows/         android.yml (APK) · ci.yml (typecheck+lint+test)
```

### Mimari sınırlar — konvansiyon değil, derleme hatası

`eslint.config.mjs` içindeki `eslint-plugin-boundaries` kuralı şunu **zorlar**
(`docs/SPEC.md` §3):

- `apps/mobile`, `apps/web`, `apps/ops` **yalnızca** `packages/{contract,mock,ui,shared}`
  import edebilir. `packages/{db,providers,safety,config,media,pdf}` importu **hatadır**.
- Sağlayıcı SDK'ları (`openai`, `@anthropic-ai/*`, `elevenlabs`, `iyzipay` …) yalnızca
  `packages/providers` altında import edilebilir.
- Sunucu kütüphaneleri (`fastify`, `bullmq`, `drizzle-orm`, `pg` …) istemci uygulamasına
  giremez.
- Model adı koda gömülemez; `packages/config` üzerinden okunur.

Bu kurallar `pnpm -w lint` ile ve her PR'da `ci.yml` ile denetlenir.

---

## Ajan sahiplik tablosu

Her dizinin **tek** sahibi vardır. Başka bir ajanın dizinine yazmayın; ihtiyacınız olan
sözleşme değişikliğini `docs/contract-rfc/NNN-baslik.md` olarak açın (ayrıntı: SPEC §12).

| Ajan | Sorumluluk | Sahip olduğu yollar | Durum |
|---|---|---|---|
| **A0-İSKELET** | Monorepo temeli, ESLint sınırları, APK/CI zinciri, Expo iskeleti, `config` + `shared` | kök, `.github/**`, `infra/**`, `apps/mobile/**`, `packages/{config,shared}/**` | ✅ tamam |
| **A0-CONTRACT** | Zod/ts-rest sözleşmesi, OpenAPI snapshot, hata taksonomisi, SSE union'ı, MSW mock + TR fixture | `packages/{contract,mock}/**` | ⬜ sırada |
| **A0-DB** | Drizzle şema, migration, seed | `packages/db/**` | ⬜ sırada |
| **A1** | Kimlik, oturum, çocuk profilleri, rıza motoru, KVKK talepleri | `apps/api/src/routes/v1/{auth,me,children,consents,privacy}.ts` | ⬜ |
| **A2** | BullMQ flow'ları, idempotency, maliyet defteri, SSE hub, cron'lar | `apps/worker/src/{flows,schedulers}/**`, `packages/providers/core/**` | ⬜ |
| **A3** | Hikaye üretimi (2 aşamalı LLM), içerik güvenliği K1–K6 | `packages/safety/**`, `packages/providers/{llm,moderation}/**` | ⬜ |
| **A4** | Görsel üretimi, karakter tutarlılığı, görsel QA | `packages/providers/image/**`, `packages/media/image/**` | ⬜ |
| **A5** | Ses klonlama, TTS, hizalama, `PlayerManifest` | `packages/providers/{tts,align}/**`, `packages/media/audio/**` | ⬜ |
| **A6** | Baskıya hazır PDF, iyzico, siparişler, ops API | `packages/pdf/**`, `packages/providers/print/**` | ⬜ |
| **F1** | Onboarding, ses kaydı UI'ı, sihirbaz (S01–S11, V01–V09, W01–W07) | `apps/web/app/(onboarding)/**`, `apps/web/app/(app)/{ses,sihirbaz}/**` | ⬜ |
| **F2** | Oynatıcı, kitaplık, baskı akışı, ayarlar, `packages/ui` | `apps/web/app/(app)/{kitaplik,hikaye,bastir,ayarlar}/**`, `packages/ui/**` | ⬜ |
| **F3** | Ops paneli (O01–O05) | `apps/ops/**` | ⬜ |
| **E1** | TR kalite değerlendirmesi, kör dinleme testi, güvenlik regresyonu | `evals/**` | ⬜ |

---

## Türkçe isim çekimleme — neden bu kadar önemli?

Ürünün her ekranında çocuğun adı geçer: *"Elif'in masalı"*, *"Elif'e özel"*,
*"Elif'i dinle"*. **Yanlış bir ek kullanıcı güvenini anında yok eder.**
`packages/shared` bunu ünlü uyumu, ünsüz yumuşaması ve kesme işareti kurallarıyla çözer:

```ts
import { possessive, dative, accusative, locative, ablative } from '@kendihikayem/shared';

possessive('Elif');   // "Elif'in"      possessive('Su');     // "Su'yun"   (y kaynaştırma)
possessive('Ayşe');   // "Ayşe'nin"     possessive('Göksu');  // "Göksu'nun" (son ünlü belirler)
possessive('Ahmet');  // "Ahmet'in"     — özel adda yumuşama YAZILMAZ ("Ahmed'in" değil)
dative('Oğuz');       // "Oğuz'a"       accusative('Çağla');  // "Çağla'yı"
locative('Zeynep');   // "Zeynep'te"    ablative('Berk');     // "Berk'ten"
```

127 test bu davranışı koruyor: `pnpm --filter @kendihikayem/shared test`

---

## Kurallar

- Kod ve kod yorumları **İngilizce**; kullanıcıya görünen tüm metinler **Türkçe**.
- `packages/contract` içine **yalnızca A0-CONTRACT** yazar.
- `.env` asla commit'lenmez. Yeni bir env değişkeni eklerken `.env.example` **ve**
  `packages/config/src/env.ts` birlikte güncellenir.
- Çocuğun fotoğrafı hiçbir akışta istenmez (SPEC §1).
