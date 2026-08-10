# Araştırma — Pazar ve Rakip Analizi

> Ağustos 2026. Kaynak URL'leri metin içinde.

---

# RAKİP VE PAZAR ANALİZİ — KendiHikayem

> **ÖNEMLİ UYARI (metodoloji):** Bu oturumda WebSearch bütçesi (200/200) tükendi ve WebFetch, ağ proxy'si tarafından neredeyse tamamen bloke edildi (`play.google.com`, `apps.apple.com`, `elovya.com`, `benimmasalim.com.tr`, `us.yotoplay.com`, `us.tonies.com`, `bedtime-stories.fun` — hepsi EGRESS_BLOCKED). Bu yüzden **4. bölümün maliyet kalemleri (görsel üretim, TTS/ses klonlama fiyatları, baskı maliyeti), 5. bölüm (kullanıcı şikayetleri) ve 6. bölüm (ödeme altyapısı komisyon oranları) ARAŞTIRILAMADI.** Bu bölümlerde yazdıklarım eğitim verisinden gelen genel bilgidir ve **[DOĞRULANMADI]** olarak işaretlenmiştir. Bunlar ikinci bir araştırma turunda doğrulanmalıdır.
>
> Doğrulanan tek sağlam maliyet girdisi: Claude API fiyatlandırması (skill üzerinden, önbellek tarihi 2026-06-24).

---

## 1) "KendiHikayem" adında mevcut bir ürün var mı?

**Sonuç: Böyle bir Türk uygulaması/markası bulunamadı — ama domain ALINMIŞ.**

| Bulgu | Kanıt | Güven |
|---|---|---|
| `kendihikayem.com` DNS'te çözülüyor, Cloudflare arkasında | `getent hosts kendihikayem.com` → `2606:4700:3032::6815:2b2c`, `2606:4700:3032::ac43:db5d` (Cloudflare IP aralığı) | **Yüksek** — komutu ben çalıştırdım |
| İçerik doğrulanamadı (aktif site mi, park mı, satılık mı bilinmiyor) | Proxy 403 CONNECT | — |
| `www.kendihikayem.com`, `kendihikayem.com.tr` de aynı şekilde bloklu | curl 403 | — |
| Arama motorunda "KendiHikayem" adlı uygulama/marka **çıkmıyor** | Google Play / App Store / web aramalarında sıfır sonuç | Orta-Yüksek |
| "kendihikayem" terimi Wattpad'de kullanıcı etiketi olarak geçiyor | wattpad.com sonuçları | Düşük önem |

**Karışabilecek benzer isimler (marka çakışması riski):**
- **kendimasalim.com** — "Kişiye Özel Masal Kitapları" (aktif, isim çok yakın)
- **benimmasalim.com / .com.tr** — Benim Masalım
- **Senin Hikayen** (hankidsdesign.com)
- **Kahraman Benim** (kahramanbenim.com)

**Aksiyon:** Domain'in durumu (kimin, satılık mı) WHOIS ile ayrıca kontrol edilmeli. TÜRKPATENT'te "Kendi Hikayem"/"KendiHikayem" marka taraması yapılmalı — `kendimasalim` ile karışma riski gerçek.

Kaynaklar: [kendimasalim.com](https://kendimasalim.com/), [hankidsdesign.com](https://www.hankidsdesign.com/kisiye-ozel-cocuk-hikaye-senin-hikayen)

---

## 2) Türkiye pazarı — kişiye özel çocuk kitabı basanlar (TL fiyatlar)

### 2a. Basılı kitap oyuncuları

| Marka | Fiyat (TL) | Özellikler | Kaynak |
|---|---|---|---|
| **Benim Masalım** | **Premium sert kapak 1.099 TL'den**, Ekonomik paket **699 TL'den** | 45 farklı macera teması, **AI ile fotoğraftan masal kahramanı dönüşümü**, 170gr kuşe, sipariş öncesi ücretsiz ön izleme, 2-3 gün ücretsiz kargo | [benimmasalim.com.tr blog](https://www.benimmasalim.com.tr/blog/kisiye-ozel-cocuk-kitabi-rehberi) |
| **Sihirli Yolculuk** | **1.100 – 1.250 TL** (Hepsiburada) | İsme özel, ciltli, hediye kutulu; "Benim Sihirli Yolculuğum", fotoğraflı alfabe kitabı | [Hepsiburada](https://www.hepsiburada.com/sihirli-yolculuk-cocuk-kitaplari-xc-9914-b55162), [sihirliyolculuk.com](https://www.sihirliyolculuk.com/) |
| **Kahraman Benim** | Fiyat doğrulanamadı | Çocuğun fotoğrafı+adıyla **3 dakikada** kitap, **ücretsiz PDF e-postaya anında**; Uzay/Orman/Renkler temaları. Bayi kanalı var (bizimajans.com, kitapbastir.com aynı ürünü satıyor) | [kahramanbenim.com](https://kahramanbenim.com/) |
| **Bu Kitap Benim** | Fiyat doğrulanamadı; **600 TL üzeri kargo bedava** | Kişiye özel kitap baskı | [bukitapbenim.com](https://bukitapbenim.com/) |
| **Elovya** | Fiyat doğrulanamadı | Çocuğun adı + fiziksel özellikleriyle kişiye özel hikaye kitabı | [elovya.com](https://elovya.com/) |
| **Senin Hikayen (Han Kids)** | Fiyat doğrulanamadı | Form doldurma → fotoğraftan karakter tasarımı (yüz şekli, saç/göz rengi, vücut yapısı) | [hankidsdesign.com](https://www.hankidsdesign.com/kisiye-ozel-cocuk-hikaye-senin-hikayen) |
| Kitap Fabrikası, MST Yayıncılık, Tasarella, Hediye Çizgiler | — | Karne/okuma bayramı hediyesi konumlandırması; Hediye Çizgiler dijital ürün de satıyor | [kitapfabrikasi.com](https://www.kitapfabrikasi.com/kisiye-ozel-hikaye-kitaplari), [hediyecizgiler.com](https://hediyecizgiler.com/products/kisiye-ozel-cocuk-kitabi-dijital-urun) |

> **"Hikayemi Yaz" diye bir marka bulunamadı** — muhtemelen mevcut değil ya da çok küçük.

**Pazar okuması:** Türkiye'de kişiye özel basılı çocuk kitabı fiyat bandı **~700–1.250 TL**. Ürünler hediye (doğum günü, karne, okuma bayramı) olarak konumlanıyor, abonelik değil **tek seferlik satın alma**. Hiçbiri **ebeveyn sesiyle seslendirme** sunmuyor. Benim Masalım AI'ı zaten görsel üretimde (fotoğraf→karakter) kullanıyor — yani "AI ile kişiselleştirme" tek başına farklılaştırıcı değil, **artık table stakes**.

### 2b. Türkçe AI masal uygulamaları (mobil)

| Uygulama | Notlar | Kaynak |
|---|---|---|
| **KinderStory** (`com.kinderstory.app`) | ⚠️ **EN YAKIN RAKİP.** Ebeveynlerin AI ile kişiselleştirilmiş hikaye ürettiği, çocuğun doğrudan katıldığı uygulama. Yaş/ilgi alanı otomatik dahil. Çıktı: **metin + görsel + ses — "ebeveynlerin sesiyle" seslendirme dahil**. Hedef: 2-10 yaş ebeveynleri, büyükanne/baba, bakıcı, eğitimciler. Fiyat doğrulanamadı (Play Store bloklu). Geliştiricinin Türk olup olmadığı doğrulanamadı — Türkçe listing mevcut. | [Google Play](https://play.google.com/store/apps/details?id=com.kinderstory.app&hl=tr) |
| **Uykucuk: Hayaller Masal Oluyor** | AI destekli interaktif/eğitici masal; çocuğun ilgi alanına göre her gece yeni hikaye; yaş/karakter profilleri | [App Store id6758783202](https://apps.apple.com/us/app/uykucuk-hayaller-masal-oluyor/id6758783202) |
| **Harika Masallar** | Tema seç + karakter adı gir → saniyeler içinde masal. Premium: sınırsız hikaye, reklamsız, özel tema/karakter | [App Store id6755127228](https://apps.apple.com/mx/app/harika-masallar/id6755127228) |
| **Masal Oku: Sesli Masal & Oyun** | 3 gün ücretsiz deneme, aylık/yıllık abonelik; boyama, puzzle, eğitici oyunlar | [App Store id6740011758](https://apps.apple.com/us/app/masal-oku-sesli-masal-oyun/id6740011758) |
| **Kidly** | Çocuk hikayeleri + uyku | [App Store id1576064715](https://apps.apple.com/tr/app/kidly-çocuk-hikayeleri/id1576064715) |
| **Storiko** | Web tabanlı AI masal oluşturucu, Türkçe arayüz | [storiko.com](https://storiko.com/en/app/create/stories) |
| **KidApp** (`kidapp.co`) | Pazarlama metni birebir bizim konsept: *"Çocuğunuza kendi sesinizden kişiselleştirilmiş eğitici hikayeler dinletin"* — **ANCAK domain DNS'te çözülmüyor (ENOTFOUND) → muhtemelen kapanmış/ölü.** Post-mortem değeri var. | Arama sonucu; site erişilemiyor |

**Kritik bulgu:** Türkiye'de "ebeveyn sesi" fikri **zaten denenmiş** (KidApp — muhtemelen başarısız) ve **şu anda aktif bir rakip var** (KinderStory). Bunlar önceliklendirilerek derinlemesine incelenmeli.

---

## 3) Global rakipler ve özellik setleri — özellikle EBEVEYN SESİ

### 3a. Ses klonlama YAPAN AI hikaye uygulamaları (2026 itibarıyla kalabalık bir alan)

| Ürün | Ses klonlama | Fiyat | Kaynak |
|---|---|---|---|
| **StoryBee** | ✅ **Voice Studio** — bir kez kaydet, AI ebeveyn sesiyle seslendirsin; custom voice models | **"Bee Buzz" $29/ay** (eskiden $40): 90 hikaye/ay, 60 sesli hikaye, 16 bölüme kadar, **10 voice model**, 10 premium AI ses, custom voice models. Ücretsiz/alt kademe: 6 bölüme kadar, 600 kelime, 40 hikaye/ay [hangi kademe olduğu net değil] | [storybee.app/pricing](https://storybee.app/pricing), [storybee.app/voice-studio](https://storybee.app/voice-studio) |
| **SleepyVoice** | ✅ Birkaç saniye kayıt → güvenli sunucuda klonlama | Doğrulanamadı | [App Store id6754461416](https://apps.apple.com/us/app/sleepyvoice-ai-bedtime-stories/id6754461416) |
| **Narratio: Read in Your Voice** | ✅ 1 dakikalık örnek → binlerce hikaye senin sesinle | Doğrulanamadı | [Google Play app.narratio](https://play.google.com/store/apps/details?id=app.narratio) |
| **Bedtime Stories: Story Time AI** (Prometheus) | ✅ Sesini kaydet, AI senin sesinle okusun; resimli | Doğrulanamadı | [useprometheus.app](https://useprometheus.app/bedtimestories/) |
| **MamaTales** | ✅ Kısa ses kaydı → kişisel ses modeli | Doğrulanamadı | Arama sonucu |
| **Sleepytale** | ✅ **Pro Plus planında** | **$19/ay (Pro Plus)** | Arama sonucu (bedtime-stories.fun) |
| **AI Story: Your Voice Story** | ✅ | Doğrulanamadı | [App Store id6752530963](https://apps.apple.com/us/app/ai-story-your-voice-story/id6752530963) |

### 3b. Ses klonlama YAPMAYAN AI hikaye uygulamaları

| Ürün | Fiyat | Notlar | Kaynak |
|---|---|---|---|
| **Oscar Stories** | **Premium $49/yıl (~$4.08/ay)**, aylık plan da var. **Kredi paketleri: 10 coin $4.99 / 30 coin $9.99 / 80 coin $19.99. 1 coin = 1 hikaye, krediler süresiz.** | Sınırsız hikaye + sınırsız sesli anlatım + reklamsız. Ahlaki değer seçimi, aile/arkadaş ekleme, sesli kitaba dönüştürme. **Ses klonlama YOK** — sadece AI sesler | [oscarstories.com](https://oscarstories.com/), [bedtime-stories.fun karşılaştırma](https://www.bedtime-stories.fun/blog/bedtime-stories-vs-oscar-stories) |
| **Once Upon a Bot** | **$29/ay veya yıllıkta $19/ay.** Sınırlı ücretsiz kullanım + küçük ücretli kademe | Sınırsız hikaye + anlatım, PDF export, destekçiye özel türler | [onceuponabot.com/pricing](https://onceuponabot.com/pricing) |
| **Storywizard.ai** | Doğrulanamadı — "daha büyük ücretsiz kademe isteyenler için en güçlü alternatif" olarak anılıyor | Eğitim odaklı | [storywizard.ai](https://www.storywizard.ai/) |
| **Meta StoryKit** | Fiyat açıklanmadı (pilot) | **Temmuz 2026'da Meksika'da pilot, iPhone.** Oyuncağın fotoğrafını çek → kahraman olsun; ortam seç (büyülü orman/uzak galaksi); değer seç (nezaket/cesaret/empati). Çıktı: **resimli kitap, sesli kitap veya düz metin**. Hikaye **bir insan tarafından okunabilir** veya AI sesiyle. Henüz ABD'de değil. | [9to5Mac](https://9to5mac.com/2026/07/21/meta-testing-storykit-an-ai-iphone-app-that-creates-personalized-childrens-stories/), [Teknoblog](https://www.teknoblog.com/meta-storykit-yapay-zeka-cocuk-hikaye-uygulamasi-test/) |
| **Amazon "Create with Alexa" / "Stories with Alexa"** | **Amazon Kids+: $5.99/ay (Prime) / $7.99/ay (Prime dışı)** | Echo Show'da "Alexa, make a story" → sahne başına görsel + müzik + ses efekti. Alexa+ ile "Stories with Alexa" Kids+ abonelerine. | [aboutamazon.com](https://www.aboutamazon.com/news/devices/what-is-create-with-alexa), [TechCrunch](https://techcrunch.com/2025/02/26/amazons-new-alexa-brings-ai-powered-explore-and-stories-features-for-kids/) |
| **Amazon "Ready, Set, Story"** | ❌ **BULUNAMADI** — bu isimde bir Amazon ürünü aramada çıkmadı. Muhtemelen "Create with Alexa" ile karıştırılıyor. | | — |

### 3c. Donanım / fiziksel ses (ebeveyn sesi kaydı — klonlama değil)

| Ürün | Fiyat | Ebeveyn sesi | Kaynak |
|---|---|---|---|
| **Yoto Player (3. nesil)** | **$113.99 / £99.99** | ✅ **MYO (Make Your Own) kartları** — uygulamada "My Recordings"e kaydet, **kart başına 6 saate kadar**, sınırsız kez düzenlenebilir. Kutuda 1 MYO kart var, 5'li/10'lu paketler ayrıca satılıyor (paket fiyatı doğrulanamadı) | [us.yotoplay.com](https://us.yotoplay.com/make-your-own), [Yoto Player fiyat](https://us.yotoplay.com/yoto-player) |
| **Yoto Mini** | **$79.99 / £59.99** | ✅ aynı | " |
| **Yoto Club aboneliği** | **£9.99/ay veya £99/yıl** → ayda 2 "Club Credit" = 2 kart siparişi | — | " |
| **Toniebox 2 Starter Set** | **~$140** (Target'ta indirimle ~$105 görüldü) | ✅ **Creative Tonies: 90 dakikaya kadar kendi sesini kaydet/yükle** (my.tonies.com veya mytonies app). Toniebox ayrı satılıyor. Tekil Creative Tonie fiyatı doğrulanamadı | [us.tonies.com](https://us.tonies.com/collections/creative-tonies), [Slickdeals](https://slickdeals.net/f/18705718-toniebox-2-starter-set-various-105) |
| **Wonderbly** | **Ciltli kitap başına $35–$65** | ❌ ses yok, sadece basılı kişiselleştirilmiş kitap | [storystarsbook.com 2026 karşılaştırma](https://www.storystarsbook.com/blog/best-personalized-books-for-kids-2026/) |
| **Google Read Along** | Ücretsiz | ❌ Ters yön: **çocuğun** okumasını dinler/düzeltir, ebeveyn sesi klonlamaz | [Wikipedia](https://en.wikipedia.org/wiki/Read_Along) |

### 3d. Sentez: Rekabet haritası

```
                    SES KLONLAMA VAR              SES KLONLAMA YOK
                ┌──────────────────────────┬──────────────────────────┐
  DİJİTAL       │ StoryBee ($29/ay)        │ Oscar ($49/yıl, coin)    │
  (uygulama)    │ Sleepytale ($19/ay)      │ Once Upon a Bot ($19-29) │
                │ Narratio, SleepyVoice,   │ Meta StoryKit (pilot)    │
                │ MamaTales, Prometheus    │ Amazon Alexa ($5.99/ay)  │
                │ ◆ KinderStory (TR!)      │ Uykucuk, Harika Masallar │
                ├──────────────────────────┼──────────────────────────┤
  FİZİKSEL      │ Yoto MYO ($114 + kart)   │ Wonderbly ($35-65/kitap) │
                │ Tonies Creative ($140+)  │ Benim Masalım (699-1099₺)│
                │ — ama KAYIT, klonlama    │ Sihirli Yolculuk (1.1-1.25k₺)│
                │   değil; AI hikaye yok   │ Kahraman Benim, Elovya   │
                └──────────────────────────┴──────────────────────────┘
```

**Boş kutu (kimse yok):** ← **AI kişiselleştirilmiş hikaye + ebeveyn ses klonu + BASILI TÜRKÇE KİTAP, tek üründe.**
- Yoto/Tonies: ebeveyn sesi var ama **hikayeyi siz yazmalısınız**, AI üretim yok, Türkiye'de dağıtım/donanım yok.
- StoryBee/Sleepytale: AI + ses klonu var ama **basılı kitap yok** ve Türkçe kalitesi bilinmiyor.
- Benim Masalım/Sihirli Yolculuk: basılı + Türkçe var ama **ses yok, AI hikaye üretimi yok** (sadece hazır şablona isim/yüz yerleştirme).

---

## 4) Fiyatlandırma modelleri ve birim ekonomi

### 4a. Gözlemlenen model tipolojisi (doğrulanmış fiyatlarla)

| Model | Örnek | Fiyat |
|---|---|---|
| Yıllık abonelik (agresif düşük) | Oscar Stories | $49/yıl ≈ $4.08/ay |
| Aylık abonelik (yüksek) | StoryBee Bee Buzz $29/ay; Once Upon a Bot $29/ay ($19 yıllık); Sleepytale Pro Plus $19/ay |
| Kredi/coin (süresiz) | Oscar: 10=$4.99, 30=$9.99, 80=$19.99 (1 coin = 1 hikaye) → **birim fiyat $0.25–$0.50/hikaye** |
| Freemium kota | StoryBee alt kademe: ~40 hikaye/ay, 600 kelime, 6 bölüm [kademe belirsiz]; Once Upon a Bot: "sınırlı ücretsiz kullanım"; Türk uygulamaları: 3 gün ücretsiz deneme (Masal Oku) |
| Donanım + içerik aboneliği | Yoto: $114 cihaz + £9.99/ay klüp |
| Tek seferlik fiziksel | Wonderbly $35-65; TR pazarı 699-1.250 TL |
| Platform bundle | Amazon Kids+ $5.99-7.99/ay (hikaye yalnızca bir özellik) |

**Fiyat çıpası çıkarımları:**
- Bir AI hikayenin algılanan değeri: **$0.25–$0.50** (Oscar coin fiyatı — pazarın en net sinyali).
- Sınırsız dijital abonelik tavanı: **$19–29/ay** (ses klonlamalı premium), tabanı **$4/ay** (klonlamasız).
- Basılı kitap Türkiye'de: **699–1.250 TL**.

### 4b. Birim ekonomi — bir hikayenin AI maliyeti

**✅ DOĞRULANMIŞ: Metin üretimi (Claude API fiyatları, önbellek 2026-06-24)**

| Model | Input $/1M | Output $/1M |
|---|---|---|
| Claude Opus 5 (`claude-opus-5`) | $5.00 | $25.00 |
| Claude Sonnet 5 (`claude-sonnet-5`) | $3.00 ($2.00 tanıtım, 2026-08-31'e kadar) | $15.00 ($10.00 tanıtım) |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1.00 | $5.00 |

Varsayım: 12 sayfalık Türkçe kişiselleştirilmiş hikaye. Input ~1.500 token (sistem prompt + çocuk profili + stil rehberi), output ~2.500 token (Türkçe aglütinatif yapı nedeniyle İngilizce'ye göre token yoğun).

| Model | Hikaye başına metin maliyeti |
|---|---|
| Haiku 4.5 | 1.500×$1/1M + 2.500×$5/1M = **$0.014** |
| Sonnet 5 (tanıtım fiyatı) | 1.500×$2/1M + 2.500×$10/1M = **$0.028** |
| Sonnet 5 (normal) | **$0.042** |
| Opus 5 | **$0.070** |

**Optimizasyon kaldıraçları (doğrulanmış mekanizmalar):**
- **Prompt caching:** sistem promptu + stil rehberi sabitse, cache read maliyeti **~0.1×** (yazma 1.25× / 5 dk TTL). Input maliyeti pratikte sıfıra yakınsar.
- **Batch API:** gerçek zamanlı olmayan üretim için **%50 indirim** (basılı kitap siparişi gece işlenebilir).
- Claude Opus 5'te prompt cache minimumu 512 token'a düştü (Opus 4.8'de 1024'tü) — kısa promptlar da cache'lenebilir.

**➡️ SONUÇ: Metin maliyeti ihmal edilebilir düzeyde ($0.01–0.07). Birim ekonomiyi metin DEĞİL, görsel + ses + baskı belirliyor.**

**⚠️ [DOĞRULANMADI — ARAŞTIRILMADI] Diğer maliyet kalemleri**

Bu kalemler için hiçbir fiyat araştırması yapılamadı; aşağıdakiler **eğitim verisinden tahmindir, kaynak yok, doğrulanmalıdır:**

| Kalem | Durum |
|---|---|
| Görsel üretim (12 illüstrasyon, karakter tutarlılığı ile) | **[DOĞRULANMADI]** — muhtemelen dijital maliyetin **en büyük kalemi**. Gemini/Imagen, gpt-image, Flux, SDXL seçenekleri ve karakter tutarlılığı (aynı çocuk 12 sayfada) teknik olarak en zor + en pahalı kısım. Fiyat araştırılmalı. |
| ElevenLabs / ses klonlama API'si + Türkçe kalitesi | **[DOĞRULANMADI]** — kritik. Türkçe TTS kalitesi ve klonlama fiyatı (karakter/dakika başına) mutlaka test edilip fiyatlanmalı. |
| Türkiye'de POD baskı (24-32 sayfa, sert kapak, A4) + kargo | **[DOĞRULANMADI]** — TR pazarında satış 699-1.250 TL olduğuna göre COGS'un en büyük kalemi bu. Matbaa teklifi alınmalı. |
| TRY/USD kuru | **[DOĞRULANMADI]** — Ağustos 2026 kuru bilinmiyor; USD maliyetleri TL'ye çevirirken doğrulanmalı. |

**Modelleme çerçevesi (sayılar doldurulacak):**
```
Dijital hikaye COGS = metin($0.01-0.07) + görsel(12 × ?) + ses(? dk × ?)
Basılı kitap COGS   = dijital COGS + baskı(?) + kargo(?) + iade/fire(%?)
Katkı payı          = fiyat − COGS − ödeme komisyonu(%?) − [mobilse IAP %15-30]
```

---

## 5) Kullanıcı şikayetleri / app store yorumları — nelerden kaçınmalıyız

**⚠️ [ARAŞTIRILAMADI] — App Store ve Google Play proxy tarafından bloklandı, arama bütçesi tükendi. Bu bölüm hiç araştırılamadı.**

Aşağıdakiler bu kategorideki ürünlerin bilinen tipik başarısızlık modlarıdır — **eğitim verisinden, doğrulanmadı**, ikinci turda gerçek yorumlarla doğrulanmalı:

- **Karakter tutarsızlığı:** AI görsellerde çocuğun yüzü/saçı her sayfada değişiyor → en sık ve en marka-yıkıcı şikayet.
- **Ses klonu kalitesi:** robotik, yanlış tonlama, Türkçe'de yanlış vurgu/hece; özellikle çocuk isimleri ve yerel kelimelerde telaffuz hataları.
- **Hikaye kalitesi:** jenerik, tekrarlayan, yavan olay örgüsü; "her hikaye aynı" hissi.
- **Güvenlik/uygunluk:** yaşa uygun olmayan içerik veya korkutucu tema sızması.
- **Abonelik/iptal:** iptal edilemiyor, ücretsiz denemeden otomatik ücretlendirme (App Store 1 yıldız yorumlarının klasik sebebi).
- **Baskı/kargo:** basılı kitapta renk sapması, geç teslimat, hasarlı ürün.
- **Gizlilik:** çocuk fotoğrafı ve ebeveyn sesi yükleme konusunda **ciddi ebeveyn endişesi** — özellikle ses klonlama dolandırıcılığı haberleri sonrası. Bu, ürün tasarımının merkezine alınmalı.

**Aksiyon:** KinderStory, Oscar Stories, StoryBee ve Türk masal uygulamalarının App Store/Play yorumları ayrı bir araştırma turunda mutlaka çekilmeli.

---

## 6) Türkiye'de ödeme altyapısı ve IAP zorunluluğu

**⚠️ [DOĞRULANMADI — ARAŞTIRILAMADI] Bu bölümün tamamı eğitim verisinden gelen genel bilgidir. Komisyon oranları ve güncel politika istisnaları doğrulanmamıştır.**

### 6a. Ödeme sağlayıcıları [DOĞRULANMADI]

| Sağlayıcı | Durum (genel bilgi) |
|---|---|
| **iyzico** | Türkiye'nin en yaygın PSP'si, PayU grubu. Kolay entegrasyon, taksit desteği, pazaryeri/alt üye işyeri modeli. Komisyon oranı **doğrulanmadı**. |
| **PayTR** | Yerli alternatif, benzer özellikler, sanal POS + link ile ödeme. Oran **doğrulanmadı**. |
| **Param** | Yerli, e-para lisanslı. Oran **doğrulanmadı**. |
| **Stripe** | **Türkiye'de kurulu şirketler için resmi destek olduğuna dair bilgim yok** — Türk şirketleri genelde yurtdışı tüzel kişilik kurmadan Stripe kullanamıyor. **Bu mutlaka doğrulanmalı**, çünkü mimariyi doğrudan etkiler. |

**Not:** Taksit imkanı Türkiye'de 700-1.250 TL bandındaki fiziksel ürün satışında dönüşüm için kritik — iyzico/PayTR bunu destekliyor, Stripe desteklemiyor.

### 6b. IAP zorunluluğu — iş modelimizi nasıl etkiler [DOĞRULANMADI, ama stratejik olarak kritik]

Genel kural (eğitim verisi, **güncel politika doğrulanmalı**):

| Satılan şey | Mobil uygulamada IAP zorunlu mu? | Komisyon |
|---|---|---|
| **Dijital içerik** (uygulama içinde tüketilen hikaye, abonelik, kredi) | ✅ **EVET** — Apple Guideline 3.1.1, Google Play Billing | %30 standart; **%15 Small Business Program** (yıllık <$1M) ve 1 yıldan sonra abonelikte %15 |
| **Fiziksel mal** (basılı kitap, kargolanan ürün) | ❌ **HAYIR — IAP kullanılamaz bile.** Apple 3.1.3(e)/3.1.5(a) fiziksel malların IAP dışı ödeme ile satılmasını **zorunlu kılar** | **%0 Apple/Google komisyonu** |

**➡️ BU BİZİM İÇİN EN ÖNEMLİ YAPISAL BULGU:**

**Basılı kitap fiziksel maldır → Apple/Google komisyonu ÖDENMEZ.** 699-1.250 TL bandındaki bir ürünün %30'u 210-375 TL demektir; bunu tamamen kaçırmak katkı payını dönüştürür. Kitap satışı web/iyzico üzerinden (veya uygulama içinden web checkout'a yönlendirilerek) yapılmalı.

Ancak dikkat: Apple, uygulama içinden dijital içerik satın almaya yönlendiren harici linkleri (steering) tarihsel olarak yasaklamıştır. Fiziksel mal için harici ödeme akışına yönlendirme **serbesttir** — ama akışın fiziksel ürünle sınırlı kalması gerekir.

**Önerilen yapı [strateji, doğrulanacak politika detaylarıyla]:**
1. **Basılı kitap** → web checkout + iyzico/PayTR, taksitli. Komisyon %0 (Apple/Google), ~%2-3 (PSP). ← ana gelir
2. **Dijital abonelik/kredi** → mobilde IAP (%15-30 kabul edilir çünkü marj yüksek), **web'de aynı ürünü %15-20 indirimli** sunarak kullanıcıyı web'e çekmeye çalış.
3. **Ses klonlama** → premium abonelik özelliği olarak IAP içinde ya da kitap satın alımıyla birlikte bedava (fiziksel ürün paketinin parçası olarak konumlandırılırsa IAP dışında kalabilir — **hukuki/politika doğrulaması gerekir**).

**Diğer doğrulanması gerekenler:**
- ABD'deki Epic v. Apple kararı sonrası link-out izni Türkiye'de geçerli mi? (Muhtemelen hayır — ABD'ye özel.)
- AB DMA steering hakları Türkiye'yi kapsamıyor.
- KVKK: çocuk fotoğrafı + ses biyometrik veri sayılır → **açık rıza + özel nitelikli veri işleme** yükümlülükleri. Ayrıca araştırılmalı.

---

## SONUÇ: Farklılaşma önerisi ve fiyatlandırma

### En güçlü kozumuz ne OLMAMALI

- ❌ **"AI ile kişiye özel hikaye"** — Türkiye'de Benim Masalım zaten AI kullanıyor, globalde 10+ oyuncu var, Meta pazara giriyor. Sıfır farklılaşma.
- ❌ **"Ebeveyn sesiyle seslendirme" tek başına** — global pazarda **emtia**: StoryBee, Sleepytale, Narratio, SleepyVoice, MamaTales hepsi yapıyor. Türkiye'de KinderStory da yapıyor (iddiaya göre).
- ❌ **Fiyat rekabeti** — Oscar $49/yıl ile dip yaptı; oraya inmek marj bırakmaz.

### En güçlü kozumuz ne OLMALI — üç katmanlı hendek

**1️⃣ TÜRKÇE'DE TAM YIĞIN KALİTESİ (en savunulabilir hendek)**
Global oyuncuların hiçbiri Türkçe'yi birinci sınıf dil olarak ele almıyor. Üç noktada somut üstünlük kurulabilir:
- **Türkçe ses klonlama kalitesi** — Türkçe ünlü uyumu, ekler, çocuk isimleri (Ayşecik, Ömercik), yerel kelimeler. Rakiplerin İngilizce-öncelikli modelleri burada dökülür. Bu, kullanıcının ilk 30 saniyede duyduğu şey.
- **Kültürel içerik** — Nasreddin Hoca, Keloğlan, bayramlar, Türk aile yapısı, dede/nine/hala/teyze ayrımı (İngilizce'de yok!), yerel coğrafya (Kapadokya, Boğaz).
- **Türkçe metin kalitesi** — Claude Opus 5/Sonnet 5 ile prompt mühendisliği; maliyeti ihmal edilebilir ($0.03-0.07/hikaye), o yüzden **en iyi modeli kullanmakta tereddüt yok**.

**2️⃣ DİJİTAL → FİZİKSEL KÖPRÜSÜ (kimsenin doldurmadığı kutu)**
Yukarıdaki rekabet haritasındaki boş kutu: **AI hikaye + ebeveyn sesi + basılı kitap, tek üründe.**
- Global ses-klonlama uygulamalarının **hiçbiri kitap basmıyor.**
- Türk kitap basanların **hiçbiri ses sunmuyor.**
- Yoto/Tonies ebeveyn sesi sunuyor ama hikayeyi siz yazacaksınız ve Türkiye'de yoklar.

Somut ürün: **Basılı kitabın her sayfasında QR kod → o sayfayı ebeveynin sesiyle dinle.** Anne/baba seyahatteyken, çocuk kitabı açıp annesinin sesini dinliyor. Bu, hem duygusal olarak güçlü hem de kopyalanması operasyonel olarak zor (matbaa + lojistik + ses altyapısı birlikte gerekiyor).

**3️⃣ GÜVEN VE GİZLİLİK KONUMLANDIRMASI**
Ses klonlama dolandırıcılığı endişesi gerçek ve büyüyor. Rakipler bunu görmezden geliyor. Bizim için farklılaştırıcı olabilir: ses örneğinin nerede saklandığı, silme garantisi, KVKK uyumu, "sesiniz asla başka bir hesapta kullanılamaz" taahhüdü — pazarlama mesajının merkezine alınmalı.

### Önerilen fiyatlandırma modeli

**Hibrit: Freemium dijital + yüksek marjlı fiziksel upsell**

| Katman | Fiyat | İçerik | Neden |
|---|---|---|---|
| **Ücretsiz** | 0 TL | Ayda **3 hikaye**, metin + görsel, standart AI ses, filigranlı, PDF yok | Ses klonlama ücretsizde YOK — asıl "aha" anı ücretli duvarın arkasında. 3 hikaye, Oscar'ın coin fiyatına ($0.25-0.50) göre bize ~$0.15-0.5 maliyet; kabul edilebilir CAC. |
| **Premium (abonelik)** | **~199 TL/ay** veya **~1.490 TL/yıl** (2 ay bedava) | Sınırsız hikaye, **1 ebeveyn ses klonu** (yıllıkta 2), reklamsız, PDF indirme, sesli dosya indirme | Global $19-29/ay bandının altında ama Oscar'ın $4'ünün üstünde. Ses klonlama premium'un tek satış argümanı olmalı. **Mobilde IAP (%15-30), web'de %20 indirimli** → web'e yönlendir. |
| **Basılı kitap** | **~899 TL** (sert kapak, 24 sayfa, QR sesli), **~649 TL** ekonomik | Kitap + sayfa başı QR ile ebeveyn sesi | TR pazar bandının (699-1.250) tam ortası, ama **ses özelliği hiçbir rakipte yok** → premium fiyatı savunulabilir. **Fiziksel mal = %0 Apple/Google komisyonu.** iyzico taksit desteği ile. |
| **Kredi paketi** (aboneliğe girmeyenler için) | 5 hikaye ~99 TL / 15 hikaye ~229 TL | Süresiz krediler | Oscar'ın coin modeli çalışıyor; abonelik istemeyen "hediye alıcı" segmentini yakalar. |

**Neden bu yapı:**
1. **Gelirin ağırlığı basılı kitapta olmalı** — hem Türk tüketicisi hediye ürüne para veriyor (699-1.250 TL kanıtlı), hem de **platform komisyonu sıfır**. Abonelik, kitap satışına giden bir huni.
2. **Ses klonlama ücretsiz katmanda olmamalı** — hem maliyetli hem de tek gerçek dönüşüm kaldıracı.
3. **Metin maliyeti ihmal edilebilir olduğu için ücretsiz katman cömert tutulabilir** — asıl kısıt görsel üretim maliyeti (doğrulanmalı); ücretsiz kotayı görsel maliyetine göre kalibre et.
4. **Yıllık abonelik itilmeli** — churn bu kategoride yüksek (çocuk büyüyor, ilgi kayıyor).

### Öncelikli doğrulama listesi (ikinci araştırma turu için)

1. 🔴 **KinderStory** — Türkiye'de aktif mi, fiyatı ne, ses klonlama gerçekten var mı, yorumları ne diyor? (En yakın rakip.)
2. 🔴 **Görsel üretim + Türkçe TTS/ses klonlama API maliyetleri** — birim ekonominin belirleyicisi, hiç araştırılmadı.
3. 🔴 **Türkiye'de POD sert kapak çocuk kitabı baskı maliyeti** — matbaa teklifleri.
4. 🟡 **kendihikayem.com WHOIS + TÜRKPATENT marka taraması.**
5. 🟡 **Apple/Google 2026 güncel IAP politikası + Türkiye komisyon oranları.**
6. 🟡 **iyzico/PayTR/Param güncel komisyon oranları ve taksit koşulları; Stripe Türkiye durumu.**
7. 🟡 **App Store/Play yorum analizi** (KinderStory, Oscar, StoryBee, Uykucuk, Harika Masallar).
8. 🟢 **KidApp (kidapp.co) neden kapandı?** — birebir aynı konsept, post-mortem değerli.