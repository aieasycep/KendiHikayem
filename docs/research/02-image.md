# Araştırma — Görsel Üretim ve Karakter Tutarlılığı

> Ağustos 2026. Kaynak URL'leri metin içinde.

---

# Çocuk Kitabı İllüstrasyonu — Görsel Model Araştırması (Ağustos 2026)

## 0. Önce metodoloji uyarısı (dürüstlük notu)

**Resmî fiyat sayfalarına erişemedim.** `bfl.ai`, `ai.google.dev`, `replicate.com`, `openrouter.ai`, `pricepertoken.com`, `docs.bfl.ml` — hepsi bu ortamdaki egress proxy tarafından bloklandı. Aşağıdaki tüm fiyatlar **üçüncü taraf agregatör/blog kaynaklarından** geliyor (2026 tarihli). Finansal modelleme yapmadan önce her fiyatı sağlayıcının resmî sayfasından **doğrulayın**. Kesin olmayan her kalemi `[DOĞRULANMADI]` ile işaretledim.

**İkinci uyarı — görevdeki model listesi eskimiş.** Ağustos 2026 itibarıyla:
- "Nano Banana / Gemini 2.5 Flash Image" → **emekli**, yerine Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) geçti
- "gpt-image-1" → **23 Ekim 2026'da retire ediliyor**, yerine gpt-image-2 / gpt-image-1.5
- "Flux 1.1 Pro / Flux Kontext" → FLUX.2 ailesi (pro/max/flex/klein/dev) ile değişti
- Görevde hiç geçmeyen ama **bu ürün için en güçlü rakiplerden** biri: **Seedream (ByteDance) 4.5 / 5.0 Pro**

---

## 1. TL;DR — Karar

| Karar | Öneri |
|---|---|
| **Ana model** | **Gemini 3 Pro Image (Nano Banana Pro)** — 14 referans görsel, 5 karaktere kadar kimlik koruma, native 4K (baskıya upscale'siz yeter), sınıfının en iyi metin render'ı |
| **Ucuz tier / fallback** | **Nano Banana 2** (~$0.10/2K) veya **Seedream 5.0 Pro** (~$0.045–0.09) |
| **Stil çeşitliliği** | FLUX.2 [pro] (10 referans, 4MP native) — farklı estetik isteyen kullanıcılar için |
| **Düz vektör üslubu** | Recraft V3 — **gerçek SVG çıktı = sonsuz çözünürlük**, baskı için benzersiz avantaj |
| **Fotoğraf yükleme** | **MVP'de KOYMAYIN.** En büyük hukuki + politika riski. Alternatif pipeline aşağıda. |
| **Görselde metin** | **Üretmeyin.** Türkçe metni PDF'te gerçek vektör yazı katmanı olarak bindirin. |
| **12 sayfalık kitabın görsel maliyeti** | **~$1.20 – $4.40** (model ve retry oranına göre) |

---

## 2. Model kartları

### 2.1 Google — Gemini 3 Pro Image / "Nano Banana Pro" ⭐ ÖNERİLEN

**1) Karakter tutarlılığı yöntemi**
Referans görsel tabanlı, LoRA/eğitim yok. **14 input görsele kadar**, çıktıda **5 karaktere kadar kimlik koruma**. ([Gate.AI](https://gate.ai/blog/nano-banana-pro-specs-pricing-api-access-use-cases), [DataStudios](https://www.datastudios.org/post/nano-banana-pro-full-report-and-review-of-the-google-s-gemini-3-ai-image-generation-engine-compar))
Kalite: 2026 topluluk benchmark'larında **karakter tutarlılığında en güçlü aile** olarak anılıyor — "aynı yüz, edit ve re-render'lar arasında aynı kalıyor" ([Atlas Cloud benchmark](https://www.atlascloud.ai/blog/tips/2026-ai-image-api-benchmark-gpt-image-2-vs-nano-banana-2-pro-vs-seedream-5-0)). Ama %100 değil — "genelde tutturuyor ama her zaman değil" ([Medium review](https://medium.com/@leucopsis/nano-banana-pro-googles-gemini-3-pro-image-model-a-review-11cbaee32ee1)).
⚠️ **Seed parametresi yok** → determinizm sadece referans görsel + sabit prompt ile sağlanıyor.

**2) Çözünürlük / baskı**
1K (1024²), 2K (2048²), **4K (native 4096×4096, ~16.8MP)**. 10 sabit en-boy oranı: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9. ([AI Free API](https://www.aifreeapi.com/en/posts/nano-banana-pro-maximum-resolution))

> **Baskı matematiği (20×20 cm, 3mm bleed):**
> Trim: 20 cm ÷ 2.54 × 300 = **2362 px** · Bleed dahil 20.6 cm = **2433 px**
> → 2K (2048px) @ 20cm = **260 DPI** ❌ (1.2× upscale gerek)
> → **4K (4096px) @ 20cm = 520 DPI** ✅ (upscale'e hiç gerek yok, sadece downsample)

**3) Görselde metin**
Sınıf lideri. Üçüncü taraf testlerde **%94–96 metin doğruluğu**, çok dilli ve uzun pasaj desteği ([Nano Banana Pro incelemeleri](https://gptimg.co/blog/what-is-nano-banana-pro)). Türkçe özel benchmark **bulamadım** — `ş ğ ı İ` gliflerinde hata riski `[DOĞRULANMADI]`.

**4) Fiyat** `[DOĞRULANMADI — resmî sayfadan teyit edin]`
- 1K/2K: **$0.134/görsel** · 4K: **$0.24/görsel**
- Token: $2/M input, $12/M output
- **Batch API: %50 indirim** → 2K ≈ $0.067 (kitap üretimi async olduğu için bu ürün için ideal)
([glbgpt](https://www.glbgpt.com/hub/how-much-is-nano-banana-pro/), [PixMind](https://www.pixmind.io/posts/nano-banana-pro-pricing-guide-2026))

**5) İçerik politikası** — bkz. Bölüm 4 (kritik)

**6) Üslup**
Style plate (referans görsel) + sabit stil metni ile kilitlenir. 14 referans slotundan birini kalıcı "stil plakası"na ayırın.

---

### 2.2 Google — Nano Banana 2 (Gemini 3.1 Flash Image) — ucuz tier

- **Kimlik koruma: 4 karakter + 10 obje**, multi-reference anlama ([Atlas Cloud](https://www.atlascloud.ai/blog/guides/best-ai-image-editing-models-2026))
- Çözünürlük: 512px → **4K**
- Hız: **2–5 sn/görsel** (Seedream 5 Pro'nun 86–110 sn'sine karşı) — UX için büyük fark
- Fiyat `[DOĞRULANMADI]`: 0.5K $0.045 → 2K **$0.101** → 4K **$0.15**; Batch %50 indirim ([AI Free API](https://www.aifreeapi.com/en/posts/nano-banana-2-pricing), [Flowith](https://flowith.io/blog/nano-banana-2-pricing-api-pro-features/))
- Metin doğruluğu: %91.2 (GPT Image 2'nin %98.5'inin altında)
- **Nano Banana 2 Lite** (gemini-3.1-flash-lite-image): ~**$0.034/1K**, batch $0.0168 — Google'ın en ucuzu, 4 sn latency ([Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/), [kie.ai](https://kie.ai/blog/nano-banana-2-lite-google-image-model))

**Kullanım:** Ücretsiz/preview tier'da taslak sayfa üretimi → kullanıcı onaylayınca Pro ile final.

---

### 2.3 OpenAI — GPT Image 2 (Nisan 2026)

**1) Karakter tutarlılığı:** Referans görsel + mask-based inpainting. Ajanik reasoning var. Ancak **kimlik korumada Nano Banana ailesinin gerisinde** kabul ediliyor — "karakter/IP tutarlılığı için Nano Banana 2 seç" ortak tavsiye ([Atlas Cloud](https://www.atlascloud.ai/blog/guides/best-ai-image-editing-models-2026)).
⚠️ `input_fidelity` parametresi **kaldırıldı** — gpt-image-1 kodunuzda varsa hata alırsınız ([CometAPI](https://www.cometapi.com/how-to-use-and-prompt-gpt-image-2/)).

**2) Çözünürlük:** **Native 2K (2048px'e kadar)**. Kısıt: max kenar ≤3840px, kenarlar 16'nın katı, oran ≤3:1, toplam 0.65–8.3MP. → Kare için teorik tavan ~2880×2880 (8.29MP) = **366 DPI @ 20cm** ✅ ama bu benim kısıtlardan çıkardığım hesap, `[DOĞRULANMADI]`. Güvenli varsayım: 2048² = 260 DPI, upscale gerekir. ([YingTu](https://yingtu.ai/en/blog/gpt-image-2-4k-image-generation))

**3) Metin: en iyisi.** %98.5 doğruluk ([Atlas Cloud benchmark](https://www.atlascloud.ai/blog/tips/2026-ai-image-api-benchmark-gpt-image-2-vs-nano-banana-2-pro-vs-seedream-5-0)). Kapak başlığı görselin içine gömülecekse bu model.

**4) Fiyat** `[DOĞRULANMADI]`: Low $0.005 · **Medium $0.041** · **High $0.165**. Token: $5/M text-in, $8/M image-in, $30/M image-out ([Unifically](https://unifically.com/blogs/gpt-image-2), [WaveSpeed](https://wavespeed.ai/blog/posts/gpt-image-2-pricing-2026/))

**5) Politika — bu ürün için en kısıtlayıcı.** Fotogerçekçi minör görselleri **varsayılan olarak bloke**. Resmî tavsiye: **illüstrasyon/çizgi üslubu kullanın ve "realistic, close-up, detailed, photorealistic" kelimelerinden kaçının** ([Microsoft Q&A / Azure OpenAI](https://learn.microsoft.com/en-ie/answers/questions/5884023/azure-ai-foundry-moderation-blocked-for-safe-child)). `moderation: "low"` parametresi var ama community'de **over-refusal şikayetleri** sürüyor ([OpenAI forum](https://community.openai.com/t/api-issue-moderation-over-refusals-on-gpt-image-2-with-moderation-low-where-chatgpt-always-succeeds/1388964)).
Ayrıca: **13 yaş altı çocuk kişisel verisi işleyecekseniz önce API'de Zero Data Retention aktive etmek zorunlu** ([OpenAI Under-18 API Guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)).

---

### 2.4 Black Forest Labs — FLUX.2

**1) Karakter tutarlılığı:** **10 referans görsele kadar** multi-reference sistemi, "LoRA eğitimi olmadan kimlik kilitleme" ([Together AI](https://www.together.ai/blog/flux-2-multi-reference-image-generation-now-available-on-together-ai), [ToolGate](https://toolgate.ai/flux-2-pro/)). **Seed parametresi var** → tekrarlanabilirlik avantajı.
FLUX.2 [pro] için "8 referans" diyen kaynak da var — sayı sürüme göre değişiyor `[DOĞRULANMADI]`.

**2) Çözünürlük:** **Native 4MP** (kare ≈ 2048² = 260 DPI @ 20cm) → **upscale gerekli**.

**3) Metin:** Nano Banana Pro ve GPT Image 2'nin gerisinde. Kapak metni için kullanmayın.

**4) Fiyat** — megapiksel bazlı, `[DOĞRULANMADI]`:
- FLUX.2 [klein] 4B: **$0.014**/görsel (en ucuz)
- FLUX.2 [pro]: **$0.03/MP** text-to-image, **editing/multi-ref $0.045'ten** başlıyor
- FLUX.2 [max]: **$0.07'den**
- ⚠️ **Önemli tuzak:** multi-reference'ta **gönderdiğiniz referans görseller de megapiksel olarak faturalanıyor.** 3 referanslı 4MP çıktı gerçekte $0.09–0.12 civarına çıkabilir ([Dynalord](https://dynalord.com/blog/flux-2-pricing), [Flowith](https://flowith.io/blog/flux-2-pro-pricing-2026-dev-vs-pro-vs-schnell-api/))

**5) Politika:** CSAM/minör istismarı ve rızasız kimlik taklidi yasak. **Kritik madde: "Geliştiriciler, Şartlara aykırı Input gönderimini engellemek için makul içerik tarama mekanizmaları uygulamak zorundadır."** — yani **moderasyon yükümlülüğü size devrediliyor** ([BFL Usage Policy](https://bfl.ai/legal/usage-policy), [Developer ToS](https://bfl.ai/legal/developer-terms-of-service)).

**6) Self-host:** FLUX.2 [klein] 4B **Apache 2.0** (ticari kullanım serbest). **FLUX.2 [dev] non-commercial — ticari üründe kullanamazsınız** ([Thunder Compute](https://www.thundercompute.com/blog/best-open-source-image-generation-models)).

---

### 2.5 ByteDance — Seedream 4.5 / 5.0 Pro (görevde yoktu, ama ciddi aday)

- **10 referans görsele kadar**, "sequential multi-image generation" — **tek çağrıda tutarlı seri üretim**. Bu bir kitap için mimari olarak çok uygun ([WaveSpeed](https://wavespeed.ai/models/bytedance/seedream-v4/sequential))
- Çözünürlük: 4.0 → 4K (4096×3072); **5.0 Pro → 2K/3K (4K yok)**; **5.0 Lite → 2K/3K/4K** ([Atlas Cloud](https://www.atlascloud.ai/models/seedream-5.0-pro))
  → 3K (3072px) @ 20cm = **390 DPI** ✅
- Fiyat `[DOĞRULANMADI]`: Seedream 4.5 **$0.04** (boyuttan bağımsız) · 5.0 Pro **$0.045** (≤2.36MP) / **$0.09** (>2.36MP) · ilk referans ücretsiz, ek her referans **+$0.003**
- Metin: %89.5 — en zayıflardan
- ⚠️ **Yavaş: 86–110 sn/görsel.** Async pipeline şart.
- ⚠️ **ByteDance/Çin merkezli sağlayıcı** — çocuk verisi + KVKK/GDPR açısından hukuk ekibinize sorun. Veri lokasyonu ve DPA durumunu doğrulayın.

---

### 2.6 Ideogram 3.0

- **`character_reference_images` parametresi** — tek referans görselle yüz/saç/karakteristik koruma. API'de açıkça belgelenmiş, en "temiz" karakter API'lerinden ([Ideogram docs](https://developer.ideogram.ai/api-reference/api-reference/generate-v3))
- **Ama karakter referansı fiyatı 3x'liyor:** Turbo/Default/Quality $0.03/$0.06/$0.09 → karakter ref ile **$0.10/$0.15/$0.20** ([Ideogram API pricing](https://ideogram.ai/api-pricing/), [Puter](https://developer.puter.com/tutorials/ideogram-api-pricing/))
- Çözünürlük: ~1–2MP sınıfı → **baskı için mutlaka upscale**
- Metin: iyi (Ideogram'ın tarihsel gücü), ama Nano Banana Pro'yu geçmiyor
- **Verdict:** Nano Banana Pro'dan pahalı, çözünürlüğü düşük. Bu ürün için geçin.

---

### 2.7 Recraft V3 — düz vektör üslubu için gizli kahraman

- **Tek gerçek SVG/vektör üreten major model** → **çözünürlük sorunu tamamen ortadan kalkıyor.** Düz vektör üsluplu bir kitap için 300 DPI, 600 DPI, poster boyu — hepsi ücretsiz ([ToolChase](https://toolchase.com/blog/ai-vector-design-recraft-guide/))
- **Custom Style:** kendi görsellerinizden yeniden kullanılabilir bir stil oluşturuyorsunuz → **üslup kilitlemenin en deterministik yolu** ([Recraft API blog](https://www.recraft.ai/blog/discover-the-power-of-recrafts-image-generation-api))
- Fiyat `[DOĞRULANMADI]`: V3 raster **$0.04** · V3 vektör **$0.08** · Recraft 20B raster $0.022 / vektör $0.044 ([Recraft pricing](https://www.recraft.ai/pricing?tab=api))
- **Zayıf yanı: karakter referansı yok.** Karakter tutarlılığı sadece custom style + detaylı prompt ile — anlatısal sahnelerde Nano Banana Pro seviyesinde değil.
- **Crisp Upscale** ayrı bir ürün olarak da değerli (aşağıda)

---

### 2.8 Midjourney — API durumu

- **Resmî Developer API 2025 sonunda çıktı**, 2026'da **Enterprise planlarda** erişilebilir ([AI Tools DevPro](https://aitoolsdevpro.com/ai-tools/midjourney-guide/))
- `--cref` **V7 ve V8'de artık desteklenmiyor** → yerine **Omni Reference (`--oref` + `--ow`)**
- **Verdict: MVP için kullanmayın.** Enterprise gate, resmî olmayan proxy'ler (PiAPI, ImaginePro) ToS ihlali riski taşıyor, çocuk verisi işleyen bir üründe bunu yapmayın.

---

### 2.9 Self-host (SDXL / SD3.5 / FLUX / Qwen / Z-Image) + IP-Adapter / InstantID / LoRA

| Yaklaşım | Tutarlılık | Maliyet | Verdict |
|---|---|---|---|
| **Karakter LoRA** (10–30 görsel dataset) | **En yüksek** — near-perfect | Cloud eğitim **$0.50–1.50/LoRA**, yerel ~1 saat 24GB GPU | Ölçekte harika, **MVP'de çok yavaş** (kullanıcı 20 dk bekleyemez) |
| IP-Adapter / InstantID (SDXL) | Orta | Ucuz | 2026'da frontier modellerin multi-ref'ine göre geride |
| FLUX ControlNet/IP-Adapter | Zayıf — "Flux'ta düzgün ControlNet ve IP-Adapter yok" ([comfyworkflows](https://comfyworkflows.com/workflows/8e74d2d3-be0f-4d09-9e05-741fe0ebca72)) | — | Geçin |

**Lisans tuzağı:** FLUX.1 schnell + FLUX.2 klein 4B + Qwen-Image = **Apache 2.0, çıktıyı satabilirsiniz.** FLUX.2 dev = **non-commercial.** ([Thunder Compute](https://www.thundercompute.com/blog/best-open-source-image-generation-models))

**Öneri:** MVP'de self-host YOK. V2'de "premium karakter" özelliği olarak LoRA (fal.ai FLUX.2 LoRA training) değerlendirin. Ama bir çocuğun fotoğrafından LoRA eğitmek → politika + KVKK riskini katlar.

---

## 3. Karşılaştırma tablosu

| Model | Karakter tut. | Max çöz. | 20cm@300DPI? | Metin | $/görsel | 13 görsel |
|---|---|---|---|---|---|---|
| **Nano Banana Pro 4K** | ⭐⭐⭐⭐⭐ (14 ref/5 kar.) | 4096² | ✅ native | ⭐⭐⭐⭐⭐ | $0.24 | **$3.12** |
| **Nano Banana Pro 2K** | ⭐⭐⭐⭐⭐ | 2048² | ❌ 260dpi | ⭐⭐⭐⭐⭐ | $0.134 | **$1.74** |
| **NBP 2K + Batch** | ⭐⭐⭐⭐⭐ | 2048² | ❌ | ⭐⭐⭐⭐⭐ | ~$0.067 | **$0.87** |
| **Nano Banana 2 4K** | ⭐⭐⭐⭐ (4 kar.) | 4K | ✅ | ⭐⭐⭐⭐ | $0.15 | **$1.95** |
| **NB2 Lite 1K** | ⭐⭐⭐ | 1024² | ❌ | ⭐⭐⭐ | $0.034 | **$0.44** |
| **GPT Image 2 high** | ⭐⭐⭐ | 2048² (~2880 teorik) | ⚠️ | ⭐⭐⭐⭐⭐ | $0.165 | **$2.15** |
| **GPT Image 2 medium** | ⭐⭐⭐ | 2048² | ❌ | ⭐⭐⭐⭐ | $0.041 | **$0.53** |
| **Seedream 5.0 Pro 3K** | ⭐⭐⭐⭐ (10 ref) | 3072px | ✅ 390dpi | ⭐⭐ | $0.09 | **$1.17** |
| **Seedream 4.5** | ⭐⭐⭐⭐ | 4K | ✅ | ⭐⭐ | $0.04 | **$0.52** |
| **FLUX.2 pro (multi-ref)** | ⭐⭐⭐⭐ (10 ref) | 4MP | ❌ 260dpi | ⭐⭐⭐ | ~$0.09* | **$1.17*** |
| **Ideogram 3.0 Q + charref** | ⭐⭐⭐⭐ (1 ref) | ~2MP | ❌ | ⭐⭐⭐⭐ | $0.20 | **$2.60** |
| **Recraft V3 vektör** | ⭐⭐ | ∞ (SVG) | ✅✅ sonsuz | ⭐⭐⭐ | $0.08 | **$1.04** |

\* referans görsellerin de faturalandığı tahmini `[DOĞRULANMADI]`
13 görsel = 12 iç sayfa + 1 kapak. **Retry faktörü 1.4× eklerseniz** üst sınır ~$4.40.

**Karakter sayfası + stil plakası + varyantlar için +3–6 üretim** ekleyin (~+$0.40–1.50).

> **Gerçekçi birim maliyet: kitap başına $1.50 – $5.00 görsel.** Türkiye'de kişiselleştirilmiş basılı çocuk kitabı perakende fiyatının (~600–1.200 TL) yanında **ihmal edilebilir** — asıl maliyet baskı + kargo. Bu, en kaliteli modeli seçmenizi rahatlıkla mümkün kılıyor.

---

## 4. 🔴 İÇERİK POLİTİKASI — En kritik bölüm

### 4.1 Kurgusal çocuk karakteri ÜRETMEK: ✅ Sorun yok
Tüm sağlayıcılarda **illüstrasyon/çizgi üslubunda** kurgusal çocuk karakteri üretmek serbest. Gemini "kurgusal insan karakterleri, stilize portreler ve illüstre insanlar" üretebiliyor ([laozhang](https://blog.laozhang.ai/en/posts/gemini-image-generation-people-restriction)). OpenAI'nin resmî tavsiyesi bile **"çocuk içeren içerik için illüstrasyon/cartoon üslubu kullanın"**.

### 4.2 GERÇEK çocuk fotoğrafını referans yüklemek: 🔴 YÜKSEK RİSK

| Sağlayıcı | Durum |
|---|---|
| **Google (Gemini app)** | Açıkça reddediyor: *"The image you provided contains a minor, which isn't allowed by our content policies"* ([Gemini Community](https://support.google.com/gemini/thread/425876076/)) |
| **Google (API)** | 4 kategori `BLOCK_NONE` yapılabiliyor **ama** `IMAGE_SAFETY`, `CSAM`, `SPII` çıktı filtreleri **hiçbir ayarla kapatılamıyor** ve üretilen görseli de analiz ediyor ([Apiyi safety guide](https://help.apiyi.com/en/nano-banana-2-content-safety-image-generation-failure-guide-en.html)). App ile API farklı enforcement yüzeyi — API'de geçebilir ama **politika riski aynı**. |
| **OpenAI** | Fotogerçekçi minör **varsayılan bloke**. 13 yaş altı kişisel veri işlemek için **önce ZDR aktive etmek zorunlu** ([Under-18 API Guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)) |
| **BFL/FLUX** | Minörlere zarar yasak + **geliştiriciye input tarama yükümlülüğü** ([Usage Policy](https://bfl.ai/legal/usage-policy)) |
| **Hepsi** | CSAM tespitinde NCMEC'e bildirim + kalıcı ban ([OpenAI](https://openai.com/index/combating-online-child-sexual-exploitation-abuse/)) |

### 4.3 KVKK / GDPR katmanı (hukuk danışmanı şart — bu hukuki tavsiye değildir)
- Çocuk yüz fotoğrafı = kişisel veri; işleme için **veli açık rızası** gerekir
- KVKK aydınlatma metni + açık rıza akışı + saklama süresi + silme hakkı
- GDPR Art. 8 (çocuk rızası) + Art. 9 (biyometrik işleme yapılıyorsa özel nitelikli veri)
- Sağlayıcı seçimi = veri yurt dışına aktarım kararı (ByteDance/Çin özellikle dikkat)

### 4.4 ✅ ÖNERİLEN ÇÖZÜM — üç kademeli

**MVP (fotoğrafsız — bunu yapın):**
"Karakter Kurucu" formu → yaş, cinsiyet, ten tonu (palet seçici), saç rengi/tipi/uzunluğu, göz rengi, gözlük, çil/ben, favori kıyafet, favori oyuncak → LLM bunu **CHARACTER_DNA** metnine çevirir → 4 karakter varyantı üretilir → ebeveyn birini seçer.
**Duygusal değer neredeyse aynı, risk sıfır.** Ayrıca ebeveyn "seçme" hissiyle daha çok bağlanıyor.

**V1.5 (fotoğraf → sadece metin çıkarımı):**
Fotoğraf yüklenir → **vision modeli fotoğrafı sadece TARİF eder** (saç rengi, göz rengi, ten tonu, gözlük var/yok) → CHARACTER_DNA metnine dönüşür → **fotoğraf anında silinir, görsel modele ASLA referans olarak gönderilmez.**
Bu, "minörün benzerliğini üretme" problemini tamamen ortadan kaldırır. Yine de veli açık rızası + ZDR + anında silme gerekir. **Sağlayıcının vision API'sinde minör fotoğrafı analizinin de reddedilip reddedilmediğini ampirik test edin** `[DOĞRULANMADI]`.

**V2 (gerçek image-to-image) — sadece hukuk onayıyla:**
Veli açık rızası + KVKK aydınlatma + ZDR + sıfır saklama + yaş doğrulama + kendi input moderasyon katmanınız + sağlayıcı ile yazılı mutabakat.

### 4.5 Veri işleme notları
- **Gemini paid tier / Vertex AI: prompt ve yanıtlar model eğitiminde kullanılmıyor.** Sadece kötüye kullanım tespiti için sınırlı süre loglanıyor. Vertex AI'da onaylı projeler için tam ZDR mümkün ([Google ZDR docs](https://ai.google.dev/gemini-api/docs/zdr), [Meetily](https://meetily.ai/llm-privacy/gemini))
- **Ücretsiz AI Studio tier'ı farklı sözleşme** — üretimde asla kullanmayın
- **Üçüncü taraf proxy'lerden (kie.ai, laozhang, apiyi vb.) kaçının** — %79 ucuz görünüyorlar ama çocuk verisi bir aracıdan geçer, DPA yok, ToS ihlali riski var
- Google modelleri çıktıya **SynthID görünmez filigran** ekliyor. API çıktısında **görünür** filigran olup olmadığını test edin `[DOĞRULANMADI]`

---

## 5. Çözünürlük & upscale stratejisi

### Hedef
| Sayfa | Trim | +3mm bleed | Gereken px |
|---|---|---|---|
| 20×20 cm | 2362×2362 | 20.6×20.6 cm | **2433×2433** |
| 21×21 cm | 2480×2480 | — | 2551×2551 |
| Kapak (yayma, 20×20, sırt 6mm) | ~41×20 cm | — | ~4913×2433 |

### Karar ağacı
1. **4K native üretebiliyorsanız (Nano Banana Pro / NB2 / Seedream 4.5) → upscale YOK.** 4096px üret, 2433px'e **downsample** et (Lanczos). Downsample her zaman upscale'den keskindir.
2. **2K'da kaldıysanız → 1.19× gerekiyor.** Çok küçük bir fark; en güvenlisi **Recraft Crisp Upscale** veya **Real-ESRGAN 2× → downsample**.
3. **Vektör üslubu seçtiyseniz → Recraft SVG, problem yok.**

### Upscaler seçimi — ÇOK ÖNEMLİ UYARI
| Upscaler | Tip | Bu ürün için |
|---|---|---|
| **Recraft Crisp Upscale** | Restoratif — *"içeriği değiştirmeden çözünürlüğü artırır"* | ✅ **EN İYİ SEÇİM** (düz/flat illüstrasyon) |
| **Real-ESRGAN** (anime/illustration variant) | Açık kaynak, restoratif | ✅ Ucuz, self-host edilebilir, line art'ta iyi ([Replicate super-resolution](https://replicate.com/collections/super-resolution)) |
| **Topaz API** | 5 model (general/low-res/**CGI**/high-fidelity/text), 6× kadar | ✅ Kaliteli ama abonelik: $149–499/yıl ([Topaz API](https://www.topazlabs.com/api)) |
| **Clarity Upscaler** | **Kreatif — detay ekler** | 🔴 **KULLANMAYIN** — yüzü yeniden çizer, karakter tutarlılığını bozar |
| **Magnific / Recraft *Creative* Upscale** | Kreatif | 🔴 Aynı sebep |

> **Kural: Bir kitap serisinde asla "kreatif/hallucinating" upscaler kullanmayın.** 12 sayfada 12 farklı yüz elde edersiniz. Sadece restoratif upscaler.

---

## 6. Görselde metin — kesin öneri: ÜRETMEYİN

**Metni PDF'te gerçek vektör yazı katmanı olarak bindirin.** Nedenleri:

1. **Türkçe glif riski.** `ş ğ ı İ Ç Ö Ü` — hiçbir sağlayıcı Türkçe-özel benchmark yayınlamıyor. Nano Banana Pro %94–96 genel doğrulukta ama bir kitapta **%4 hata = 12 sayfada yarım sayfa yanlış yazım** = ebeveyn iadesi.
2. **Düzeltilebilirlik.** Ebeveyn "Elif" yerine "Elîf" yazsın derse metin katmanını değiştirirsiniz; görseli yeniden üretmezsiniz (ve karakter tutarlılığını riske atmazsınız).
3. **Baskı kalitesi.** 300 DPI raster metin ≠ vektör metin. Matbaa çıktısında fark net görülür.
4. **Tipografi kontrolü.** Türkçe heceleme, satır arası, punto, aile içi tutarlılık.
5. **Maliyet.** Metin düzeltmesi = 0 API çağrısı.

**Uygulama:** Her sayfa prompt'una **"no text, no letters, no words, no signage"** negatifi + **"keep the bottom 25% visually calm as empty space for a text overlay"** kompozisyon direktifi ekleyin. Sonra ReportLab/PDFKit/Prince ile gerçek yazı katmanı bindirin.

**Kapak:** Başlığı görsele gömmek isterseniz **GPT Image 2** (%98.5) veya **Nano Banana Pro** (%94–96) kullanın, **ama** yine de vektör overlay'i A/B test edin. Ben overlay öneriyorum.

---

## 7. Üslup (art style) sabitleme

### Üç katmanlı kilit

**Katman 1 — STYLE_DNA metni** (her prompt'a birebir kopyalanan sabit blok)
**Katman 2 — Style Plate** (üretilmiş bir referans illüstrasyon, her çağrıda referans slotu olarak gönderilir)
**Katman 3 — Sağlayıcı stil özelliği:** Recraft Custom Style (kendi görsellerinizden kalıcı stil), Ideogram style reference, FLUX seed sabitleme

### Hazır STYLE_DNA şablonları

```
STYLE_WATERCOLOUR:
"soft watercolour picture-book illustration, visible cold-press paper grain,
gentle wet-on-wet colour blooms, warm muted palette of terracotta, sage green,
cream and dusty blue, loose sepia ink linework, hand-painted texture,
generous white space, no digital gradients, no airbrush"

STYLE_3D_PIXAR:
"stylized 3D character render for family animation, soft subsurface skin shading,
large expressive eyes, rounded friendly shapes, appealing squash-and-stretch
proportions, cinematic soft key light plus warm rim light, shallow depth of field,
subtle ambient occlusion, feature-film quality"

STYLE_FLAT_VECTOR:
"flat vector illustration, bold clean geometric shapes, zero gradients,
strict 6-colour palette (#F2C14E #E8871E #2A9D8F #264653 #F4F1DE #E76F51),
uniform 4px outlines, screen-print paper texture overlay, mid-century
children's book poster feel"

STYLE_CRAYON:
"waxy crayon and coloured pencil children's illustration, visible directional
stroke texture, slightly imperfect hand-drawn outlines, warm paper-white ground,
naive perspective, soft saturated primaries"
```

**Kural:** Kullanıcıya 4–6 hazır üslup sunun, **serbest metin üslup girişi vermeyin.** Serbest giriş = tutarsızlık + moderasyon riski.

---

## 8. 🎯 MVP PIPELINE — adım adım

**Model:** Gemini 3 Pro Image (Nano Banana Pro), Google Gemini API **paid tier** (veya kurumsallaşınca Vertex AI + ZDR).
**Fallback:** Nano Banana 2 (aynı API ailesi, tek satır model değişimi) → Seedream 5.0 Pro (farklı sağlayıcı, sağlık kontrolü için).
**Mimari not:** Baştan **provider abstraction layer** yazın. Son 12 ayda bu alanda 3 kuşak model değişti; kodunuz tek sağlayıcıya çivilenmesin.

---

### Adım 0 — Hikâye → Sahne dökümü
LLM ile hikâye metnini **12 sayfaya** böl. Her sayfa için üret:
```json
{
  "page": 3,
  "text_tr": "Elif kapıyı araladı. İçeride minik bir ışık dans ediyordu.",
  "scene_en": "Elif slowly pushes open a heavy wooden attic door; a small
               glowing firefly-like light floats in the dusty dark beyond.",
  "emotion": "curious, slightly nervous",
  "time_of_day": "dusk",
  "camera": "medium shot, slightly low angle",
  "text_safe_zone": "bottom"
}
```
> `scene_en` **İngilizce** olsun — tüm modeller İngilizce prompt'ta belirgin şekilde daha iyi. Türkçe sadece son kullanıcı metninde.

---

### Adım 1 — Karakter kurucu (fotoğrafsız) → CHARACTER_DNA
Form çıktısını LLM ile **değişmez kanonik metne** çevir:
```
CHARACTER_DNA:
"ELIF — a 6-year-old girl. Shoulder-length wavy dark-brown hair with a small
yellow clip on the left side. Warm brown almond eyes. Light olive skin.
A few freckles across the nose. Round cheeks, small gap between front teeth
when smiling. Wears a red dungaree with small yellow star pattern over a white
long-sleeve tee, and blue canvas sneakers. Always carries FINDIK, a small
orange plush fox with a cream-coloured belly and one slightly bent ear."
```
**Bu metin projede tek bir yerde saklanır ve her prompt'a değiştirilmeden kopyalanır.** Sayfa başına yeniden yazılmaz. Tutarlılığın %50'si burada.

---

### Adım 2 — Style Plate üretimi (1 çağrı)
```
Single hero illustration for a children's picture book, 1:1.
{STYLE_DNA}
Scene: an empty cosy attic at dusk with a round window, dust motes in a
warm shaft of light, wooden floorboards, a few cardboard boxes.
No characters, no people, no animals.
No text, no letters, no words, no watermark, no border.
```
Resolution: 2K. Çıktıyı `style_plate.png` olarak sakla → **her sonraki çağrıda referans görsel #3**.

---

### Adım 3 — Character Sheet (model sheet) üretimi (2–4 varyant)
```
Character model sheet for a children's picture book. ONE character only.

CHARACTER: {CHARACTER_DNA}

LAYOUT: full-body front view on the left, full-body 3/4 view in the centre,
full-body side view on the right, all standing in a neutral relaxed pose at
identical scale and identical eye level. Below them, a row of four head-and-
shoulders close-ups showing: happy, curious, surprised, sleepy.

BACKGROUND: plain light grey (#EDEDED), completely flat, no shadow cast on
the background, no props, no environment.

LIGHTING: even soft frontal light, no dramatic shadows.

STYLE: {STYLE_DNA}

Absolutely NO text, NO letters, NO labels, NO arrows, NO watermark, NO border.
```
Resolution: **4K** (yüz detayı referans kalitesi için önemli).
Referans slotu: `style_plate.png`.

→ Ebeveyne 3 varyant göster, **birini seçtir**. Seçilen = `character_sheet.png`.

---

### Adım 3b — Face crop (kod, API değil)
`character_sheet.png`'in **ön yüz close-up'ını kırp** → `face_ref.png` (1024×1024).
İki ayrı referans (tam boy + yüz yakın) kimlik korumasını gözle görülür artırıyor.

---

### Adım 4 — Sayfa üretimi (12 çağrı, paralel)

**Referans görseller (her çağrıda aynı sırayla):**
1. `character_sheet.png` — kim
2. `face_ref.png` — yüz kimliği
3. `style_plate.png` — nasıl görünecek
4. *(opsiyonel)* `page_{n-1}.png` — anlatısal süreklilik (ortam/kıyafet devamı)

**Prompt şablonu:**
```
Children's picture book interior illustration. Page {N} of 12. Square 1:1.

CHARACTER — must match reference images 1 and 2 EXACTLY. Same face shape,
same eyes, same hair colour and cut, same clip, same freckles, same outfit,
same body proportions, same plush fox. Do not redesign the character.
{CHARACTER_DNA}

STYLE — must match reference image 3 EXACTLY. Same colour palette, same
brush/line technique, same level of detail, same paper texture.
{STYLE_DNA}

SCENE: {scene_en}
MOOD: {emotion}. LIGHT: {time_of_day}.

COMPOSITION: {camera}. {CHARACTER_NAME} occupies roughly the left third of
the frame, facing right into the open space. Keep the bottom 25% of the image
visually calm and low-contrast (plain floor / grass / water) — this area is
reserved for a text overlay and must contain no important detail.

DO NOT INCLUDE: any text, letters, words, numbers, signage, speech bubbles,
book titles, watermarks, logos, frames or borders; no additional people or
characters beyond those described; nothing frightening, violent, sad-scary,
or dangerous; no photorealism; no adult themes.
```

**Parametreler:** `aspect_ratio: "1:1"`, `resolution: "2K"` (önizleme) → onaydan sonra `"4K"` (baskı).
**Batch API** kullanın (%50 indirim) — kitap zaten async üretiliyor.

---

### Adım 5 — Otomatik QA (bunu atlarsanız ürün çöker)

| Kontrol | Yöntem | Eşik | Aksiyon |
|---|---|---|---|
| **Kimlik** | Yüz embedding'i (InsightFace/ArcFace) `face_ref.png` ile kosinüs benzerliği | < 0.62 `[kalibre edin]` | Retry (max 2), sonra insan kuyruğu |
| **Metin sızıntısı** | OCR (Tesseract/PaddleOCR) | herhangi bir karakter | Retry |
| **Palet kaymaası** | Dominant 5 renk, style_plate ile ΔE | ΔE > 20 | Retry |
| **Text safe zone** | Alt %25'te varyans/kenar yoğunluğu | yüksek | Retry veya metin kutusunu taşı |
| **Güvenlik** | Sağlayıcı block reason | herhangi | Prompt sanitize + retry, 2. hatada insana |

Retry bütçesi: sayfa başına max 2 → maliyet çarpanı ~1.4×.

---

### Adım 6 — Baskı hazırlığı
1. 4K üretim → **2433×2433'e downsample** (Lanczos), bleed dahil
2. **Metin katmanını vektör olarak bindir** (Türkçe font: örn. Nunito, Quicksand, Merriweather Sans — `ş ğ ı İ` glifleri tam olan bir font seçin ve **matbaaya font'u embed edilmiş PDF gönderin**)
3. **CMYK dönüşümü** — matbaanın ICC profili (yoksa ISO Coated v2 / Fogra39)
4. **3mm bleed** + güvenli alan 5mm içeride
5. **PDF/X-1a** (en uyumlu) veya PDF/X-4
6. Kapak yayması: arka kapak + sırt (sayfa sayısı × kağıt kalınlığı) + ön kapak tek parça

---

## 9. Riskler ve doğrulanmamış noktalar

| # | Risk | Ne yapmalı |
|---|---|---|
| 1 | **Tüm fiyatlar üçüncü taraf kaynaklı** | Sözleşme öncesi Google/OpenAI/BFL resmî pricing sayfalarından teyit edin |
| 2 | **Türkçe glif doğruluğu bilinmiyor** | Metni overlay yapın; ölçmeye gerek kalmaz |
| 3 | **Gemini API'nin minör fotoğrafı reddetme oranı ölçülmedi** | MVP'de fotoğraf yok → sorun ortadan kalkıyor |
| 4 | **Nano Banana Pro'da görünür filigran var mı?** | Paid API'de 10 test görseli üretip bakın |
| 5 | **GPT Image 2'nin gerçek max kare çözünürlüğü** (2048 mi, ~2880 mi) | Ampirik test |
| 6 | **Seed yok (Gemini)** → tam determinizm imkânsız | QA + retry katmanı bunu telafi ediyor |
| 7 | **Model kuşakları 4–6 ayda değişiyor** | Provider abstraction layer, model adı config'te |
| 8 | **KVKK/GDPR** | Hukuk danışmanı — bu rapor hukuki tavsiye değildir |
| 9 | **Seedream = ByteDance** (veri yurt dışı) | Fallback olarak bile kullanacaksanız DPA/veri lokasyonu netleştirin |
| 10 | **Üçüncü taraf proxy'ler %79 ucuz** ama ToS + veri riski | Çocuk verisi olan bir üründe kullanmayın |

---

## 10. Kaynaklar

**Google / Nano Banana**
- [Nano Banana Pro Pricing: Free Limits & API Costs (2026)](https://www.glbgpt.com/hub/how-much-is-nano-banana-pro/)
- [Nano Banana Pro: Complete Specifications, Pricing, API Access (2026) — Gate.AI](https://gate.ai/blog/nano-banana-pro-specs-pricing-api-access-use-cases)
- [Nano Banana Pro Maximum Resolution Guide — AI Free API](https://www.aifreeapi.com/en/posts/nano-banana-pro-maximum-resolution)
- [Nano Banana Pro Pricing Guide 2026 — PixMind](https://www.pixmind.io/posts/nano-banana-pro-pricing-guide-2026)
- [Nano Banana Pro — Google DeepMind](https://deepmind.google/models/gemini-image/pro/) · [Google Blog](https://blog.google/innovation-and-ai/products/nano-banana-pro/)
- [Start building with Nano Banana 2 Lite and Gemini Omni Flash — Google Blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/)
- [Nano Banana 2 Pricing Fully Decoded — AI Free API](https://www.aifreeapi.com/en/posts/nano-banana-2-pricing)
- [Nano Banana 2 Lite Release Deep Dive — kie.ai](https://kie.ai/blog/nano-banana-2-lite-google-image-model)
- [Nano Banana 2 Content Safety Mechanism Guide — Apiyi](https://help.apiyi.com/en/nano-banana-2-content-safety-image-generation-failure-guide-en.html)
- [Nano Banana Pro Aspect Ratio Guide — AI Free API](https://www.aifreeapi.com/en/posts/nano-banana-pro-aspect-ratio-guide)
- [Gemini image generation and responsible AI — Google Cloud](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/gemini-image-responsible-ai)
- [Generative AI Prohibited Use Policy — Google](https://support.google.com/gemini/answer/16625148?hl=en)
- ["The image you provided contains a minor" — Gemini Community](https://support.google.com/gemini/thread/425876076/)
- [Zero data retention in the Gemini Developer API](https://ai.google.dev/gemini-api/docs/zdr) · [Gemini Data Retention Policy 2026 — Meetily](https://meetily.ai/llm-privacy/gemini)
- [Gemini image generation people restriction — LaoZhang](https://blog.laozhang.ai/en/posts/gemini-image-generation-people-restriction)

**OpenAI**
- [GPT Image 2 API Pricing $0.03–$0.06 — Unifically](https://unifically.com/blogs/gpt-image-2) · [GPT Image 2 Pricing — WaveSpeed](https://wavespeed.ai/blog/posts/gpt-image-2-pricing-2026/)
- [GPT Image API Pricing 2026 — Price Per Token](https://pricepertoken.com/gpt-image-pricing) · [OpenAI Image API Pricing Calculator — CostGoat](https://costgoat.com/pricing/openai-images)
- [How to Use GPT Image 2: Parameters & Workflow — CometAPI](https://www.cometapi.com/how-to-use-and-prompt-gpt-image-2/)
- [GPT Image 2 4K: Supported Sizes & Native Pixels — YingTu](https://yingtu.ai/en/blog/gpt-image-2-4k-image-generation)
- [Under 18 API Guidance — OpenAI](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
- [Usage policies — OpenAI](https://openai.com/policies/usage-policies/) · [Combating CSEA — OpenAI](https://openai.com/index/combating-online-child-sexual-exploitation-abuse/)
- [Azure AI Foundry moderation_blocked for safe child images — Microsoft Q&A](https://learn.microsoft.com/en-ie/answers/questions/5884023/azure-ai-foundry-moderation-blocked-for-safe-child)
- [Moderation over-refusals on gpt-image-2 — OpenAI Community](https://community.openai.com/t/api-issue-moderation-over-refusals-on-gpt-image-2-with-moderation-low-where-chatgpt-always-succeeds/1388964)

**Black Forest Labs / FLUX**
- [FLUX API Pricing — BFL](https://bfl.ai/pricing) · [Usage Policy](https://bfl.ai/legal/usage-policy) · [Developer ToS](https://bfl.ai/legal/developer-terms-of-service)
- [FLUX.2 multi-reference — Together AI](https://www.together.ai/blog/flux-2-multi-reference-image-generation-now-available-on-together-ai)
- [Flux 2 Pro — ToolGate](https://toolgate.ai/flux-2-pro/) · [Flux 2 Pricing Explained 2026 — Dynalord](https://dynalord.com/blog/flux-2-pricing)
- [FLUX.2 Pricing: Pro vs Klein vs Dev — Flowith](https://flowith.io/blog/flux-2-pro-pricing-2026-dev-vs-pro-vs-schnell-api/)
- [Training FLUX.2 LoRAs — fal.ai](https://blog.fal.ai/training-flux-2-loras)

**ByteDance Seedream**
- [Seedream 5.0 Pro API — Atlas Cloud](https://www.atlascloud.ai/models/seedream-5.0-pro) · [Seedream 5.0 Pro Price](https://www.atlascloud.ai/blog/ai-updates/seedream-5-0-pro-price)
- [Seedream 4.0 sequential — WaveSpeed](https://wavespeed.ai/models/bytedance/seedream-v4/sequential) · [Seedream 4.5 — Gate.AI](https://gate.ai/blog/seedream-4-5-bytedance-specs-pricing-api-use-cases)

**Ideogram / Recraft / Midjourney**
- [Ideogram API Pricing](https://ideogram.ai/api-pricing/) · [Generate with Ideogram 3.0 — docs](https://developer.ideogram.ai/api-reference/api-reference/generate-v3) · [Ideogram API Pricing Breakdown — Puter](https://developer.puter.com/tutorials/ideogram-api-pricing/)
- [Recraft API](https://www.recraft.ai/api) · [Recraft Pricing (API tab)](https://www.recraft.ai/pricing?tab=api) · [Recraft Image Generation API blog](https://www.recraft.ai/blog/discover-the-power-of-recrafts-image-generation-api) · [recraft-crisp-upscale — Replicate](https://replicate.com/recraft-ai/recraft-crisp-upscale)
- [Character Reference — Midjourney docs](https://docs.midjourney.com/hc/en-us/articles/32162917505293-Character-Reference) · [Midjourney 2026 v8 Guide](https://aitoolsdevpro.com/ai-tools/midjourney-guide/)

**Benchmark / karşılaştırma / pipeline**
- [2026 AI Image API Benchmark: GPT Image 2 vs Nano Banana 2/Pro vs Seedream 5.0 — Atlas Cloud](https://www.atlascloud.ai/blog/tips/2026-ai-image-api-benchmark-gpt-image-2-vs-nano-banana-2-pro-vs-seedream-5-0)
- [Best AI Image Editing Models in 2026 — Atlas Cloud](https://www.atlascloud.ai/blog/guides/best-ai-image-editing-models-2026)
- [AI Image Generation API Pricing (July 2026) — BuildMVPFast](https://www.buildmvpfast.com/api-costs/ai-image)
- [Character Consistency in AI Art: The 2026 Breakthrough — AI Storybook](https://aistorybook.app/blog/ai-image-generation/character-consistency-in-ai-art-solved)
- [Best AI Image Generators for Children's Book Illustrations (2026) — BookFoundry](https://bookfoundry.ai/blog/best-ai-tools-for-children-s-book-illustrations-in-2026-a-comparison)
- [How to Illustrate a Children's Book with AI (2026) — Dupple](https://dupple.com/learn/how-to-illustrate-a-childrens-book-with-ai)

**Upscale / self-host**
- [Best AI image upscaler APIs (2026) — LetsEnhance](https://letsenhance.io/blog/all/best-upscaler-apis/) · [Topaz Labs API](https://www.topazlabs.com/api) · [Super-resolution collection — Replicate](https://replicate.com/collections/super-resolution)
- [Best Open-Source Image Generation Models (2026) — Thunder Compute](https://www.thundercompute.com/blog/best-open-source-image-generation-models)
- [Flux: Consistent character training images for LoRA — ComfyWorkflows](https://comfyworkflows.com/workflows/8e74d2d3-be0f-4d09-9e05-741fe0ebca72)
- [fal.ai pricing / model comparison — TeamDay](https://www.teamday.ai/blog/ai-image-video-api-providers-comparison-2026)