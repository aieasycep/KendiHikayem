# Araştırma — Ses Klonlama ve TTS Sağlayıcıları

> Ağustos 2026. Kaynak URL'leri metin içinde.

---

# Ses Klonlama + TTS Sağlayıcı Karşılaştırması (Türkçe odaklı, Ağustos 2026)

## ⚠️ Araştırma kısıtı (önce bunu oku)

Bu oturumda ağ egress politikası şu domainleri **bloklandı**: `elevenlabs.io`, `docs.cartesia.ai`, `learn.microsoft.com`, `cloud.google.com`, `docs.cloud.google.com`, `huggingface.co`, `help.elevenlabs.io`. Bu yüzden bu sağlayıcıların **resmi sayfalarını doğrudan çekemedim**; bulgular arama motoru özetleri + üçüncü parti kaynaklardan geliyor.

**Doğrudan doğrulayabildiğim (raw GitHub üzerinden okudum, %100 güvenilir):**
- Azure `personal-voice.md` locale tablosu, `personal-voice-overview.md`, `personal-voice-create-voice.md`, `batch-synthesis-properties.md`
- Azure Türkçe sözlü onay metni (`verbal-statement-all-locales.txt`)
- Google Chirp 3 Instant Custom Voice notebook'u
- ElevenLabs Python SDK README
- Coqui TTS repo (lisans)

Fiyat rakamlarının **tamamı** üçüncü parti derlemelerden; **prod'a geçmeden sağlayıcının kendi pricing sayfasından teyit edilmeli**. Aşağıda her satırda güven seviyesi işaretli.

---

## 0) Hesaplama tabanı

- Türkçe ortalama kelime uzunluğu **6,2 karakter** (50M+ kelimelik korpus çalışması) → boşluk + noktalama ile **~7,4 karakter/kelime**
- **1000 kelimelik Türkçe hikaye ≈ 7.400 karakter ≈ ~7 dakika ses** (masal tonunda ~140 kelime/dk)
- Not: Türkçe'de `ç ğ ı ö ş ü İ` UTF-8'de 2 byte → **byte bazlı faturalayan sağlayıcılarda (Fish Audio) ~%10-12 sürpriz maliyet artışı**

---

## 1) SAĞLAYICI KARTLARI

### ElevenLabs

| Konu | Bulgu | Güven |
|---|---|---|
| Türkçe | Destekli. Multilingual v2 = 29-32 dil (Türkçe dahil), Flash/Turbo v2.5 = 32 dil, **Eleven v3 = 70-74 dil** (Türkçe dahil). Hazır Türkçe sesler mevcut (Ozcan Beylan, Serdar, Yilmaz vb.) | Yüksek |
| Klon türü | **IVC**: model eğitmez, mevcut bilgiden "tahmin" yapar, saniyeler içinde hazır. **PVC**: gerçek fine-tune, 3-6 saat sürer | Yüksek |
| Referans ses | IVC: **1-2 dk temiz ses ideal**, 3 dk'yı geçme (kaliteyi düşürebilir). PVC: **min 30 dk, ideal ~3 saat** | Yüksek |
| Kritik uyarı | *"Dil metinden, aksan ve telaffuz SESTEN belirlenir"* → **anne/babaya mutlaka TÜRKÇE okutmalısın.** İngilizce örnekle klonlanan ses Türkçe'yi aksanlı okur | Yüksek |
| API | REST + WebSocket streaming. Karakter limiti/istek: **Multilingual v2 = 10.000**, Flash/Turbo v2.5 = 40.000, **Eleven v3 = 3.000-5.000** (kaynaklar çelişiyor). Uzun metin için **Studio (eski Projects) API'si** var: bölüm/chapter yapısı + `convert-project` ile toplu render | Orta |
| IVC endpoint | `POST /v1/voices/add` → SDK'da `elevenlabs.voices.ivc.create(...)`; parametreler: `name`, `files[]`, `remove_background_noise`, `labels`. **API key şart** | Yüksek (SDK README doğrulandı) |
| Fiyat (plan) | Free 10k / Starter $6-30k / Creator $22-121k / Pro $99-600k / Scale $299-1.8M / Business $990-6M kredi | **DÜŞÜK — teyit et** |
| Kredi oranı | Multilingual v2 & v3 = **1 kredi/karakter**; Flash & Turbo = **0,5 kredi/karakter** | Orta |
| **1000 kelime maliyeti** | Multilingual v2/v3: **~$1,22-1,35** (Pro/Creator planı). Flash v2.5: **~$0,61-0,68** | Orta |
| ⚠️ Fiyat çelişkisi | Bir kaynak "$0,10/1k karakter (mult v2/v3)" diyor, plan matematiği **$0,165-0,182/1k** veriyor, başka kaynak "Pro aşım $0,24/1k" diyor. **Üçü de tutmuyor — sales'e sor** | — |
| 🚨 **ÖLÇEK BLOKERİ** | **Ses slot limiti: Free 3 / Starter 10 / Creator 30 / Pro 160 / Scale 660 / Business 660.** Binlerce ebeveyn sesi tutulamaz. Ayrıca *"ses ekleme/düzenleme işlemleri de aylık kotalı"* → "üret-sil-tekrar üret" (ephemeral voice) deseni de kotaya takılabilir. **MVP öncesi ElevenLabs sales ile netleştirilmeli** | Yüksek |
| Onay/consent | IVC: sadece "hakkım ve rızam var" checkbox'ı. **PVC: Voice Captcha** — kullanıcı ekrandaki metni 10 sn içinde sesli okur, ses profili yüklenen örneklerle eşleştirilir | Orta |
| Çocuk sesi | **KESİN YASAK.** 18 yaş altı ses verisi yüklemek yasak; çocuk sesi/çocuksu ses Voice Library'ye eklenemez; hizmet 18 yaş altına yönelik değil, 13-18 arası ebeveyn onayı gerekir. **Bizim akışımız uygun (ebeveyn sesi klonlanıyor), ama çocuğun sesini kaydeden bir özellik EKLENMEMELİ** | Yüksek |
| Latency | Streaming TTFB p50 ~1.232 ms (multilingual v2); Flash ~75 ms inference. **Tam hikaye üretim süresi için resmi rakam yok** | Orta |

### Cartesia (Sonic 3 / 3.5)

| Konu | Bulgu | Güven |
|---|---|---|
| Türkçe | **42 dil, Türkçe dahil.** Cartesia'nın kendi Türkçe sayfası var; "native prosody" iddiası. Speech Arena Elo ~1.203 (Sonic 3.5) | Orta |
| Referans ses | **Instant clone: 3-10 saniye** (5 sn "yüksek benzerlik" için öneriliyor). Pro clone: ~30 dk | Orta |
| API | Ultra düşük gecikme (sub-90ms), REST + WebSocket streaming. AWS SageMaker JumpStart'ta da var | Orta |
| Fiyat | Free 20k / Pro $4-100k / Startup $39-1,25M / Scale $239-299-8M kredi. 1 kredi/karakter, **Pro Voice Clone 1,5 kredi/karakter** | Düşük (Scale fiyatında kaynak çelişkisi: $239 vs $299) |
| **1000 kelime maliyeti** | **~$0,22-0,28** (Startup/Scale) | Orta |
| ✅ Ölçek | **"Unlimited instant voice cloning"** — tüketici uygulaması için ElevenLabs'e göre çok daha uygun | Orta |
| Onay | AUP: *"Sadece kendi sesini veya açık rızası olan başkasının sesini gönderebilirsin"* — rıza toplama yükümlülüğü tamamen bizde, sağlayıcı tarafında captcha/doğrulama akışı **yok** | Orta |
| Zayıf nokta | Konuşma ajanları (realtime) için optimize; **uzun-form masal anlatımında prozodi tutarlılığı test edilmeli** | Değerlendirme |

### Azure AI Speech — Personal Voice / Custom Neural Voice

**En iyi doğrulanmış sağlayıcı (resmi dokümanları okudum).**

| Konu | Bulgu | Güven |
|---|---|---|
| Türkçe | **`tr-TR` Personal Voice locale listesinde AÇIKÇA VAR** (doğrulandı) | **Kesin** |
| Referans ses | **5-90 saniye temiz insan sesi** (+ ayrı sözlü onay kaydı) | **Kesin** |
| Eğitim süresi | **< 5 saniye** (speaker profile ID döner) | **Kesin** |
| Çok dillilik | Tek profil ~91 dil / 100+ locale konuşur, cümle bazlı otomatik dil algılama | **Kesin** |
| Türkçe onay metni (resmi) | `"Ben [adınızı ve soyadınızı belirtin] sesimin kayıtlarının [şirketin adını belirtin] tarafından sesimin sentetik bir versiyonunu oluşturmak ve kullanmak için kullanılacağının farkındayım."` | **Kesin** |
| API | **Batch Synthesis (async)** uzun-form için tasarlandı: `synthesisConfig.speakerProfileId` ile personal voice destekli, `concatenateResult`, max **2 MB JSON payload**, 1.000 input objesi | **Kesin** |
| **Latency (resmi!)** | **%50 → 10-20 sn; %95 → 120 sn** | **Kesin** |
| 🚨 Erişim | **Limited Access.** API erişimi "eligible customers + approved use cases" ile sınırlı, `aka.ms/customneural` intake formu ile başvuru gerekli. **Onay süreci haftalar sürebilir → şimdi başvur** | **Kesin** |
| Fiyat | Personal Voice ~**$24/1M karakter** + depolama **$600/1000 profil/ay (≈$0,60/ses/ay)**; CNV Pro $24-48/1M + eğitim (compute-saat) + hosting (saat) | Düşük — teyit et |
| **1000 kelime maliyeti** | **~$0,18** + ses başına $0,60/ay | Düşük |
| Avantaj | KVKK/veri ikamet, kurumsal SLA, resmi Türkçe onay metni, gerçek async uzun-form pipeline | — |

### Google Cloud TTS — Chirp 3: Instant Custom Voice

| Konu | Bulgu | Güven |
|---|---|---|
| Türkçe | **Destekli.** Resmi Türkçe onay cümlesi mevcut: `"Bu sesin sahibi benim ve Google'ın bu sesi kullanarak sentetik bir ses modeli oluşturmasına izin veriyorum."` 25+ dil | Orta-Yüksek |
| Referans ses | **~10 saniye** temiz konuşma (.wav, LINEAR16 24 kHz) + ayrı consent kaydı | **Yüksek** (notebook doğrulandı) |
| API | `voices:generateVoiceCloningKey` → `text:synthesize` (senkron). **Standart synthesize limiti 5.000 byte** → 7.400 karakterlik hikaye **zorunlu chunk'lanmalı**. `synthesizeLongAudio` (1M byte) var ama **ICV ile çalıştığı doğrulanmadı** | Orta |
| 🚨 Erişim | **Allow-list.** "Güvenlik nedeniyle bu yetenek yalnızca allow-list'teki kullanıcılara açık; Google Cloud ekibiyle iletişime geç" | **Yüksek** |
| Fiyat | ICV **$60/1M karakter** (Chirp 3 HD $30/1M) | Düşük |
| **1000 kelime maliyeti** | **~$0,44** | Düşük |

### OpenAI TTS

| Konu | Bulgu | Güven |
|---|---|---|
| Ses klonlama | **EVET, 2026'da geldi.** `POST /audio/voice_consents` (parametreler: `language` BCP-47, `name`, `recording`) → `POST /audio/voices` (`name`, `consent` = `cons_...`, `audio_sample`). Consent kaydında konuşmacının OpenAI'ın verdiği onay cümlelerinden birini okuması gerekiyor; ses örneği consent kaydıyla eşleşmeli | Yüksek (doküman mirror'ı doğrulandı) |
| 🚨 Erişim | **"Custom voices are limited to eligible customers — contact sales"** | Yüksek |
| Türkçe | `gpt-4o-mini-tts` Türkçe metni okur ama **klonlanmış sesin `tr-TR` consent desteği doğrulanmadı** | **DOĞRULANMADI** |
| Dosya | max 10 MiB; mp3/wav/ogg/aac/flac/webm/mp4 | Yüksek |
| Öne çıkan | `instructions` parametresi ile doğal dille ton yönlendirme (SSML'siz) — masal anlatımı için çok kullanışlı ("sıcak, yavaş, fısıltıya yakın bir anne tonuyla oku") | Yüksek |
| Fiyat | $0,60/1M text-input token + $12/1M audio-output token ≈ **$0,015/dk** | Orta |
| **1000 kelime maliyeti** | **~$0,10** | Orta |

### MiniMax (Speech 2.8 HD / Turbo)

- Türkçe: **40 dil listesinde Türkçe var** (Orta güven)
- Klon: **10 sn - 5 dk** ses, mp3/m4a/wav, max 20 MB
- Fiyat: turbo **$60/1M kar.**, hd **$100/1M kar.**; Rapid Voice Clone **$1,50/ses** tek seferlik, Voice Design $3
- **1000 kelime: ~$0,44 (turbo) / ~$0,74 (hd)**
- Speech 2.6 artık "Legacy"; güncel = 2.8 (Ocak 2026)
- Not: Çin merkezli → KVKK yurt dışı aktarım tarafında ek analiz gerekir

### Fish Audio (S1 / S2.1 Pro)

- Türkçe: **S2.1 Pro 83 dil, Türkçe dahil** (Orta güven)
- Klon: **10-30 sn**; eğitim 2-5 dk; `voice_id` döner, süresiz saklanır
- Fiyat: **$15/1M** — kaynaklar "UTF-8 byte" mi "karakter" mi konusunda çelişiyor. **Byte ise Türkçe'de +%10-12**
- **1000 kelime: ~$0,11-0,12**
- Lisans/self-host: kod Apache-2.0, **ağırlıklar CC-BY-NC-SA-4.0 → ticari self-host YASAK** (API kullanımı ayrı)
- Ticari kullanım için klonlanan sesin yazılı iznini kanıtlama yükümlülüğü sende

### Resemble AI + Chatterbox

- Fiyat: TTS **$0,0005/saniye** → 7 dk = **~$0,21**/hikaye
- 🚨 **Rapid Voice Clone $2/ses/AY, Professional $5/ses/AY** → 10.000 ebeveyn = **$20.000/ay sadece ses saklama**. Tüketici ürünü için **kabul edilemez** (Enterprise'da %80'e varan indirim iddiası var)
- **Chatterbox Multilingual (MIT lisans!)**: 23 dil, **Türkçe dahil**, zero-shot klonlama, Turbo ~75 ms. **Ticari kullanıma açık tek güçlü açık kaynak seçenek**

### Speechify API

- Türkçe destekli, klon **10-30 sn**, TTS **$6/1M karakter** → **1000 kelime ~$0,044** (en ucuz ticari)
- Speech Arena'da **Simba 3.2 #1 (Elo 1.229, Temmuz 2026)** — kalite artık ciddiye alınmalı
- ⚠️ Klonlamanın API'de aynı fiyata dahil olup olmadığı **doğrulanmadı**

### Hume Octave 2 — ❌ ELE

- **11 dil: EN, JA, KO, ES, FR, PT, IT, DE, RU, HI, AR. TÜRKÇE YOK.** ("yakında 20+ dil" vaadi var)
- Fiyat çok iyi ($7,60/1M) ama Türkçe olmadan bizim için ilgisiz

### PlayHT / Play.ai — ❌ ÖLDÜ

- **Meta, Temmuz 2025'te ekibi satın aldı (Superintelligence Labs); servis 31 Aralık 2025'te kalıcı kapandı.** API duyurulan tarihten haftalar önce, 26 Temmuz'da kesildi; hesaplar, ses klonları ve endpoint'ler migration yolu olmadan silindi. **Listeden çıkar.**

### Açık kaynak / self-host özeti

| Model | Türkçe | Klon | Lisans | Değerlendirme |
|---|---|---|---|---|
| **XTTS-v2** | ✅ 17 dilden biri, "sesli uyumunu çoğunlukla doğru veriyor" | 6 sn zero-shot | ❌ **CPML — ticari kullanım YASAK**, Coqui Oca 2024'te kapandı, ticari lisans satacak kimse yok | Türkçe klon kalitesinde açık kaynak lideri ama **hukuken kullanılamaz** |
| **Chatterbox Multilingual** | ✅ 23 dilden biri | zero-shot | ✅ **MIT** | **Tek gerçekçi ticari açık kaynak seçenek.** Uzun-form'da XTTS/F5'in bir tık altında, kısa kliplerde eşit |
| **F5-TTS** | ⚠️ Baz model EN/ZH; Türkçe için **fine-tune şart** | zero-shot | ✅ MPL-2.0 | H200'de RTF 0,103 (~9,7x realtime). Türkçe veri seti + eğitim maliyeti gerekir |
| **Fish-Speech / OpenAudio S1** | ✅ (S2.1 Pro 83 dil) | 10-30 sn | ❌ Ağırlıklar CC-BY-NC-SA | Ticari self-host yasak |
| **Kokoro** | ❌ **Türkçe YOK** | ❌ klonlama yok | Apache | İlgisiz |
| **Orpheus** | ⚠️ Türkçe doğrulanmadı | zero-shot | — | Türkçe için riskli |

**GPU maliyeti (⚠️ DOĞRULANMADI — bu oturumda saatlik GPU fiyatı teyit edilmedi):** XTTS-v2 ~3-4 GB VRAM/worker (FP16), RTX 3090'da 2-3,5x realtime. 7 dakikalık ses ≈ 2-3,5 dk GPU zamanı. Tipik bir L4/A10G saatlik ~$0,60-1,00 varsayımıyla **hikaye başına ~$0,03-0,06 ham GPU** — **ama** düşük kullanımda idle maliyeti bunu 10x'e çıkarır, üstüne DevOps/oncall/cold-start yükü gelir. **MVP'de self-host ekonomik değil.**

---

## 2) MALİYET KARŞILAŞTIRMA TABLOSU

**1000 kelimelik Türkçe hikaye ≈ 7.400 karakter ≈ ~7 dk ses**

| Sağlayıcı / model | $/1M kar. | **Hikaye başı** | Ses başı ek ücret | Türkçe |
|---|---|---|---|---|
| Speechify API | ~$6 | **$0,044** | ? | ✅ |
| Hume Octave 2 | $7,60 | $0,056 | — | ❌ **YOK** |
| OpenAI gpt-4o-mini-tts | ~$0,015/dk | **$0,10** | ? | ⚠️ klon tr doğrulanmadı |
| Fish Audio S2.1 Pro | $15 (byte?) | **$0,12** | yok | ✅ |
| **Azure Personal Voice** | ~$24 | **$0,18** | **$0,60/ses/ay** | ✅ **kesin** |
| Resemble AI | ~$0,0005/sn | $0,21 | 🚨 **$2/ses/AY** | ✅ |
| **Cartesia Sonic 3** | ~$30 | **$0,23** | **yok (sınırsız)** | ✅ |
| Google ICV | ~$60 | **$0,44** | ? | ✅ |
| MiniMax 2.8 turbo | $60 | $0,44 | $1,50 tek sefer | ✅ |
| MiniMax 2.8 hd | $100 | $0,74 | $1,50 tek sefer | ✅ |
| **ElevenLabs Flash v2.5** | ~$82 | **$0,61** | slot limiti | ✅ |
| **ElevenLabs Multilingual v2 / v3** | ~$165 | **$1,22** | 🚨 slot limiti | ✅ **en iyi kalite** |

> Kalite ile fiyat arasında **~28x** fark var (Speechify $0,044 ↔ ElevenLabs v3 $1,22). Bu, ürün fiyatlandırmanı doğrudan belirler: ElevenLabs ile 10 hikayelik bir paket sadece TTS'te ~$12 maliyet demek.

---

## 3) EBEVEYN KAYIT AKIŞI — SOMUT ÖNERİ

Tek bir kayıt oturumundan **üç çıktı** üret; hepsini tek seferde al, sağlayıcıya göre kırp:

1. **Onay klibi (5-15 sn)** — kullanıcı ekranda gösterilen resmi cümleyi okur.
   - Azure için birebir: *"Ben [ad soyad] sesimin kayıtlarının [şirket adı] tarafından sesimin sentetik bir versiyonunu oluşturmak ve kullanmak için kullanılacağının farkındayım."*
   - Google için: *"Bu sesin sahibi benim ve Google'ın bu sesi kullanarak sentetik bir ses modeli oluşturmasına izin veriyorum."*
   - Kendi kaydını da tut (KVKK ispatı + ElevenLabs/Cartesia'da sözleşmesel savunma)

2. **Kısa klip (10 sn)** — Google ICV / Cartesia / Fish için; uzun kayıttan otomatik kes.

3. **Ana referans: 90-120 saniye** ← **ideal hedef**
   - ElevenLabs IVC sweet spot'u tam burası (1-2 dk; **3 dk'yı asla geçme**)
   - Azure'un 5-90 sn aralığının üst ucu
   - **~250-300 Türkçe kelime, ~140 kelime/dk masal temposunda**

**Referans metnin içeriği (kritik):**
- **Masal tonunda yazılmış olmalı, haber metni gibi değil.** IVC delivery style'ı kopyalar — düz okunursa üretilen tüm hikayeler düz çıkar.
- 4 kısa pasaj: (a) sakin anlatım, (b) heyecanlı/yüksek enerji, (c) fısıltıya yakın yumuşak, (d) diyalog + soru cümlesi + ünlem
- Türkçe'ye özgü fonemleri zorunlu kıl: `ğ ı ö ü ş ç`, yumuşak g'li kelimeler (*yağmur, doğa, ağaç*), ünlü uyumu zincirleri, uzun ekli sözcükler (*arkadaşlarımızla, bulutlarının*)
- Çocuk ismi placeholder'ı içersin (*"Elif, hadi uyu artık"*) — ürün akışında en çok geçen kalıp
- Ses kalitesi süreden önemli: 48 kHz mono WAV kaydet, kliplenme kontrolü yap, arka plan gürültüsü uyarısı ver, `remove_background_noise` sadece gerçekten gürültü varsa kullan (ElevenLabs bunu açıkça uyarıyor: gürültüsüz kayıtta kaliteyi **düşürür**)

---

## 4) UZUN METİN MİMARİSİ

7.400 karakter tek istekte geçmez (Google 5.000 **byte**, ElevenLabs v3 ~3.000). Zorunlu desen:

1. Hikayeyi **paragraf/sayfa** sınırlarından chunk'la (cümle ortasından asla bölme — prozodi kırılır)
2. ElevenLabs'te `previous_text` / `next_text` benzeri bağlam alanlarını kullan (varsa) → chunk'lar arası ton kayması azalır
3. Chunk'ları **paralel** üret (3-5 eşzamanlı), sıralı birleştir, aralara 300-500 ms sessizlik koy (ffmpeg concat)
4. Sonucu **MP3 128 kbps + orijinal WAV** olarak sakla; sayfa bazlı timestamp üret (kitapta "sayfayı çevir" senkronu ve basılı kitap QR'ı için)
5. **Asenkron job** olarak kurgula (kullanıcı bekleyemez): job kuyruğu + webhook/polling + progress. Azure Batch Synthesis bunu native veriyor; diğerlerinde kendin yazacaksın.

**Gerçekçi latency beklentisi** (⚠️ resmi throughput rakamı sadece Azure için var):
- Azure Batch: **%50 → 10-20 sn, %95 → 120 sn** (resmi)
- Cartesia: streaming TTFB ~40-90 ms → paralel chunk ile **10-30 sn** tahmini
- ElevenLabs multilingual v2: TTFB p50 ~1,2 sn; 7 dk ses için paralel chunk'lı **60-180 sn** tahmini (**doğrulanmadı**)
- Kullanıcıya "hikayen hazırlanıyor, hazır olunca bildirim göndereceğiz" deneyimi kur, spinner değil.

---

## 5) YASAL — TÜRKİYE ÖZEL

- **KVKK**: Kimliği belirleyebilen ses kaydı **biyometrik veri = özel nitelikli kişisel veri** (KVKK m.6) sayılabiliyor. Bu, **açık rıza** zorunluluğu, ayrı aydınlatma metni, güvenlik tedbirleri ve VERBİS/imha politikası anlamına gelir. Açık rıza **özgür iradeye dayalı, bilgilendirilmiş, belirli konuya ilişkin** olmalı; hizmetin kullanımını rızaya bağlamak ("rıza vermezsen uygulamayı kullanamazsın") **geçersiz sayılabilir** → ses klonlama **opsiyonel** özellik olarak konumlandırılmalı, hazır seslerle de çalışmalı.
- KVKK **Kasım 2025 Üretken Yapay Zekâ Rehberi** yayımlandı — uyum kontrol listesi buradan çıkarılmalı.
- Yurt dışı aktarım: ElevenLabs/Cartesia/MiniMax = ABD/Çin → aktarım hukuki dayanağı gerekli. **Azure'un bölge seçimi bu konuda en savunulabilir seçenek.**
- **Çocuk sesi: kesinlikle klonlama.** ElevenLabs 18 yaş altı ses verisini açıkça yasaklıyor. Üründe çocuğun sesini kaydeden hiçbir akış olmamalı.
- Uygulama içinde: (1) ayrı biyometrik veri açık rıza ekranı, (2) sesli onay kaydı (arşivle), (3) "sesimi sil" butonu — hem sağlayıcıdaki voice'u hem ham kaydı silen, (4) hesap sahibinin 18+ olduğu beyanı, (5) yalnızca hesap sahibinin kendi sesini klonlayabileceği kuralı (üçüncü kişi sesi = ıslak imzalı izin akışı ya da hiç destekleme).

---

## 6) SONUÇ: MVP ÖNERİSİ

### 🥇 Birincil: **ElevenLabs** — IVC + `eleven_multilingual_v2` (varyasyon için `eleven_v3`)

**Neden:** Türkçe klonlanmış ses kalitesinde ve duygusal anlatımda hâlâ referans nokta; masal seslendirmesi tam olarak onun güçlü olduğu alan. 1-2 dakikalık referans, bizim "ebeveyne metin okutma" akışımızla birebir örtüşüyor. API ve SDK olgun, Studio ile uzun-form desteği var, IVC $6'lık tier'dan itibaren açık — **onay/allow-list bekleme yok, yarın kod yazmaya başlarsın.**

**Kabul edilen bedel:** Hikaye başı ~$1,22 (Flash v2.5 ile ~$0,61'e iner — ilk taslak/preview'da Flash, final basılı kitap sesinde multilingual v2 kullan).

**🚨 MVP'den önce mutlaka çözülmesi gereken:** **660 ses slotu tavanı.** Çözüm yolları, öncelik sırasıyla:
1. **Ephemeral voice deseni**: IVC oluştur → hikayeyi üret → voice'u sil. Ham referans sesi kendi S3'ünde tut, gerektiğinde yeniden oluştur. **Ama** "aylık voice operation kotası" var — sales'ten net sayı al.
2. Enterprise sözleşmede slot/operation limiti müzakere et.
3. Çözülemezse **birincil ile yedeği yer değiştir.**

### 🥈 Yedek: **Cartesia Sonic 3**

**Neden:** Türkçe destekli, **sınırsız instant clone** (tüketici ölçeği için doğru mimari), 3-10 sn referans, ~5x daha ucuz ($0,23 vs $1,22), self-serve — onay/allow-list yok, aynı hafta entegre edilir. ElevenLabs kota duvarına çarparsa veya kesinti yaşarsa anında devreye alınabilecek tek gerçek alternatif.

**Riski:** Realtime ajan odaklı optimize; **uzun-form Türkçe masal prozodisi kendi kulağınla A/B test edilmeli** (aynı 3 hikaye, 5 ebeveyn sesi, kör dinleme).

### 🎯 Paralelde şimdi başlat: **Azure AI Speech Personal Voice**

Kod yazma, **başvuru yap** (`aka.ms/customneural`). Onay haftalar sürüyor ve elinde onaysız duruyor olması bir şey kaybettirmez. `tr-TR` kesin destekli, resmi Türkçe onay metni hazır, gerçek async batch pipeline'ı var, latency'si resmi olarak belgelenmiş (%95 < 120 sn), hikaye başı $0,18, KVKK/veri ikamet tarafında en savunulabilir seçenek. Ölçeklendiğinde **stratejik hedef sağlayıcı bu olmalı.**

### ❌ Elenenler
**Hume Octave** (Türkçe yok) · **PlayHT/Play.ai** (kapandı) · **Resemble** ($2/ses/ay ölçekte imkansız) · **XTTS-v2 & Fish-Speech ağırlıkları** (ticari lisans yok) · **Kokoro** (Türkçe + klonlama yok) · **Self-host genel** (MVP'de ekonomik ve operasyonel olarak gerekçelendirilemez — Chatterbox MIT'yi Faz 2 maliyet düşürme opsiyonu olarak not al)

### Hemen yapılacak doğrulama listesi
1. ElevenLabs pricing sayfasından plan/kredi/aşım rakamlarını teyit et (3 kaynak birbirini tutmuyor)
2. ElevenLabs sales: voice slot + aylık voice-operation kotası, tüketici ürünü için model
3. Azure Personal Voice başvurusu
4. Fish Audio: "$15/1M" byte mı karakter mi
5. **Kör dinleme testi**: aynı 3 Türkçe masal × aynı 5 ebeveyn sesi × {ElevenLabs mult-v2, ElevenLabs v3, Cartesia Sonic 3, Azure Personal Voice, Fish S2.1} → 20 Türk ebeveyne dinlet. Bu tablodaki hiçbir "Türkçe kalitesi" iddiası bu testin yerini tutmaz.

---

## 7) SAĞLAYICI-BAĞIMSIZ ADAPTER KATMANI (TypeScript taslağı)

```ts
// ─────────────────────────────────────────────────────────────
// core/voice/types.ts
// ─────────────────────────────────────────────────────────────

export type ProviderId =
  | 'elevenlabs' | 'cartesia' | 'azure' | 'google'
  | 'openai' | 'minimax' | 'fish' | 'selfhost';

export type Locale = 'tr-TR' | 'en-US' | (string & {});

/** Sağlayıcının neyi yapıp neyi yapamadığı — runtime'da router bunu okur. */
export interface ProviderCapabilities {
  readonly id: ProviderId;
  readonly locales: readonly Locale[];
  readonly cloning: {
    /** Klonun referans ses gereksinimi (saniye). */
    readonly minRefSeconds: number;
    readonly idealRefSeconds: number;
    readonly maxRefSeconds: number;
    /** Sağlayıcı tarafında kalıcı bir "voice" objesi mi tutuluyor? */
    readonly persistsVoiceServerSide: boolean;
    /** Sağlayıcıda saklanabilecek eşzamanlı ses sayısı (ElevenLabs: 660). */
    readonly maxStoredVoices: number | 'unlimited';
    /** Ayrı bir sesli onay kaydı zorunlu mu? (Azure/Google/OpenAI: true) */
    readonly requiresConsentRecording: boolean;
    /** Onay cümlesi sağlayıcı tarafından dayatılıyor mu? */
    readonly consentScript?: (locale: Locale) => string | undefined;
    /** Erişim kapısı: allow-list / sales onayı gerekiyor mu? */
    readonly gatedAccess: boolean;
  };
  readonly synthesis: {
    readonly maxCharsPerRequest: number;
    /** Google byte, diğerleri karakter sayıyor. */
    readonly billingUnit: 'character' | 'utf8-byte' | 'second';
    readonly supportsStreaming: boolean;
    /** Native async/batch uzun-form job'ı var mı? (Azure: true) */
    readonly supportsNativeBatch: boolean;
    readonly formats: readonly AudioFormat[];
    /** Chunk'lar arası tutarlılık için bağlam alanı destekliyor mu? */
    readonly supportsContextWindow: boolean;
  };
  readonly pricing: {
    /** USD, 1M faturalama birimi başına. Tahmini — router maliyet için kullanır. */
    readonly perMillionUnitsUsd: number;
    readonly perVoicePerMonthUsd: number;      // Resemble 2.00, Azure 0.60, çoğu 0
    readonly perVoiceOneTimeUsd: number;       // MiniMax 1.50
  };
}

export type AudioFormat =
  | 'mp3_44100_128' | 'mp3_22050_32' | 'wav_48000_16' | 'pcm_24000' | 'opus_48000';

// ── Onay (consent) ──────────────────────────────────────────

export interface ConsentRecord {
  readonly userId: string;
  readonly locale: Locale;
  /** Kullanıcının okuduğu metin — KVKK ispatı için aynen saklanır. */
  readonly spokenScript: string;
  readonly audio: AudioRef;
  readonly capturedAt: Date;
  readonly ipAddress?: string;
  readonly appVersion: string;
  /** Sağlayıcının döndürdüğü consent id (OpenAI cons_..., Azure consentId). */
  readonly providerConsentId?: string;
}

export interface AudioRef {
  readonly uri: string;              // s3://... veya file://...
  readonly mimeType: string;
  readonly durationSec: number;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly sizeBytes: number;
}

// ── Ses (voice) ─────────────────────────────────────────────

export interface CreateVoiceRequest {
  readonly userId: string;
  readonly displayName: string;
  readonly locale: Locale;
  /** Ana referans kaydı (90-120 sn hedef). Adapter kendi limitine göre kırpar. */
  readonly reference: AudioRef;
  readonly consent: ConsentRecord;
  readonly removeBackgroundNoise?: boolean;
  /** Sağlayıcıda kalıcı slot tüketmesin; üretim sonrası silinecek. */
  readonly ephemeral?: boolean;
}

export interface VoiceHandle {
  readonly provider: ProviderId;
  /** Sağlayıcıya özgü kimlik: voice_id / speakerProfileId / voiceCloningKey. */
  readonly providerVoiceId: string;
  /** Bazı sağlayıcılar embedding döner (sunucuda slot tutmaz). */
  readonly inlineEmbedding?: string;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
  readonly occupiesSlot: boolean;
}

// ── Sentez (synthesis) ──────────────────────────────────────

export interface SynthesisChunk {
  readonly index: number;
  readonly text: string;
  /** Prozodi tutarlılığı için komşu bağlam (destekleyen sağlayıcıda kullanılır). */
  readonly previousText?: string;
  readonly nextText?: string;
  /** Basılı kitap/sayfa senkronu için. */
  readonly pageId?: string;
}

export interface SynthesizeRequest {
  readonly voice: VoiceHandle;
  readonly locale: Locale;
  readonly chunks: readonly SynthesisChunk[];
  readonly format: AudioFormat;
  /** 'quality' → ElevenLabs multilingual v2; 'draft' → Flash/ucuz model. */
  readonly tier: 'draft' | 'quality';
  /** OpenAI instructions / ElevenLabs v3 audio tags gibi stil yönlendirmesi. */
  readonly styleHint?: string;
  readonly speed?: number;           // 0.7 – 1.2
  readonly interChunkSilenceMs?: number;
}

export interface SynthesizedChunk {
  readonly index: number;
  readonly pageId?: string;
  readonly audio: AudioRef;
  readonly startMs: number;
  readonly endMs: number;
}

export interface SynthesisResult {
  readonly jobId: string;
  readonly chunks: readonly SynthesizedChunk[];
  /** ffmpeg ile birleştirilmiş tam hikaye. */
  readonly merged?: AudioRef;
  readonly usage: UsageReport;
}

export interface UsageReport {
  readonly billedUnits: number;
  readonly billingUnit: 'character' | 'utf8-byte' | 'second';
  readonly estimatedCostUsd: number;
  readonly wallClockMs: number;
}

export type JobStatus =
  | { state: 'queued' }
  | { state: 'running'; completedChunks: number; totalChunks: number }
  | { state: 'succeeded'; result: SynthesisResult }
  | { state: 'failed'; error: VoiceProviderError };

// ── Hata taksonomisi (retry/fallback kararı buradan verilir) ─

export type VoiceErrorCode =
  | 'CONSENT_REQUIRED'      // sağlayıcı onay kaydı istiyor
  | 'CONSENT_MISMATCH'      // ses örneği onay kaydıyla eşleşmedi (OpenAI/ElevenLabs captcha)
  | 'REFERENCE_TOO_SHORT' | 'REFERENCE_TOO_LONG' | 'REFERENCE_LOW_QUALITY'
  | 'VOICE_SLOT_EXHAUSTED'  // ElevenLabs 660 tavanı → fallback tetikler
  | 'VOICE_OPERATION_QUOTA' // aylık ekle/düzenle kotası doldu
  | 'LOCALE_UNSUPPORTED'
  | 'TEXT_TOO_LONG'
  | 'RATE_LIMITED' | 'QUOTA_EXCEEDED'
  | 'ACCESS_NOT_GRANTED'    // Azure/Google allow-list
  | 'MODERATION_BLOCKED'
  | 'PROVIDER_UNAVAILABLE' | 'UNKNOWN';

export class VoiceProviderError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    readonly provider: ProviderId,
    message: string,
    readonly retryable: boolean,
    readonly shouldFallback: boolean,
    readonly cause?: unknown,
  ) { super(message); }
}

// ── ADAPTER ARAYÜZÜ ─────────────────────────────────────────

export interface VoiceProviderAdapter {
  readonly capabilities: ProviderCapabilities;

  /** Sağlayıcının dayattığı onay cümlesi (yoksa bizim standart metnimiz). */
  getConsentScript(locale: Locale, companyName: string, speakerName: string): string;

  /** Ayrı consent kaydı gerektiren sağlayıcılarda önce bu çağrılır. */
  registerConsent?(consent: ConsentRecord): Promise<{ providerConsentId: string }>;

  createVoice(req: CreateVoiceRequest): Promise<VoiceHandle>;
  deleteVoice(voice: VoiceHandle): Promise<void>;

  /** Referansı sağlayıcı limitlerine göre kırpar/normalize eder (48k mono vb.). */
  prepareReference(audio: AudioRef): Promise<AudioRef>;

  /** Metni sağlayıcı limitine göre cümle sınırından böler. */
  planChunks(text: string, locale: Locale, tier: 'draft' | 'quality'): SynthesisChunk[];

  /** Kısa/önizleme için senkron. */
  synthesize(req: SynthesizeRequest): Promise<SynthesisResult>;

  /** Tam hikaye için asenkron job (Azure native, diğerlerinde adapter simüle eder). */
  submitJob(req: SynthesizeRequest): Promise<{ jobId: string }>;
  getJob(jobId: string): Promise<JobStatus>;

  /** Destekleyen sağlayıcılarda canlı önizleme. */
  stream?(req: SynthesizeRequest): AsyncIterable<Uint8Array>;

  /** Çağrı yapmadan maliyet tahmini — kullanıcıya kredi düşmeden önce gösterilir. */
  estimateCost(chunks: readonly SynthesisChunk[], tier: 'draft' | 'quality'): UsageReport;

  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}

// ── Router: birincil/yedek geçişi ────────────────────────────

export interface VoiceRouterPolicy {
  readonly primary: ProviderId;      // 'elevenlabs'
  readonly fallback: ProviderId;     // 'cartesia'
  readonly draftProvider?: ProviderId;
  /** Bu hata kodlarında sessizce yedeğe düş. */
  readonly fallbackOn: readonly VoiceErrorCode[];
  /**
   * Ephemeral mod: birincilde slot sınırlıysa, üretim biter bitmez voice silinir
   * ve ham referans bizim storage'ımızda kalır (yeniden oluşturulabilir).
   */
  readonly ephemeralVoices: boolean;
}
```

**Tasarımdaki kritik kararlar:** ① Ham referans sesi **her zaman kendi storage'ımızda** tut — sağlayıcı geçişi ancak böyle mümkün. ② `VoiceHandle` sağlayıcıya özgü kimliği kapsüller, üst katman `providerVoiceId`'yi asla yorumlamaz. ③ `occupiesSlot` + `VOICE_SLOT_EXHAUSTED` + `ephemeralVoices` üçlüsü ElevenLabs'in 660 tavanını mimari düzeyde ele alır. ④ `billingUnit` ayrımı Google'ın byte / Resemble'ın saniye faturalamasını gizler. ⑤ `ConsentRecord` KVKK ispat zinciri olarak sağlayıcıdan bağımsız yaşar.

---

**Kaynaklar:** [ElevenLabs IVC vs PVC](https://help.elevenlabs.io/hc/en-us/articles/13313681788305-What-is-the-difference-between-Instant-Voice-Cloning-IVC-and-Professional-Voice-Cloning-PVC) · [ElevenLabs voice slots](https://help.elevenlabs.io/hc/en-us/articles/24351056337937-How-many-voice-slots-do-I-get-per-tier-and-how-can-I-increase-it) · [ElevenLabs edit/add limits](https://help.elevenlabs.io/hc/en-us/articles/18142871021713-Is-there-a-limit-on-how-many-times-I-can-edit-add-voices) · [ElevenLabs accent/language](https://help.elevenlabs.io/hc/en-us/articles/19631995406481-Why-does-my-voice-change-accent-or-language) · [ElevenLabs cloning restrictions](https://help.elevenlabs.io/hc/en-us/articles/13313778519057-Are-there-any-restrictions-on-what-voices-I-can-upload-for-voice-cloning) · [ElevenLabs Prohibited Use Policy](https://elevenlabs.io/use-policy) · [ElevenLabs Python SDK](https://github.com/elevenlabs/elevenlabs-python) · [ElevenLabs pricing (3rd party)](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/) · [ElevenLabs consent policy (3rd party)](https://margabagus.com/elevenlabs-voice-consent-policy/) · [Cartesia Instant Voice Clone](https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices) · [Cartesia Türkçe](https://www.cartesia.ai/languages/turkish/) · [Cartesia AUP](https://www.cartesia.ai/legal/acceptable-use) · [Cartesia pricing (3rd party)](https://www.eesel.ai/blog/cartesia-sonic-3-pricing) · [Azure personal voice locales (raw)](https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/includes/language-support/personal-voice.md) · [Azure personal voice overview (raw)](https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/personal-voice-overview.md) · [Azure Türkçe onay metni](https://github.com/Azure-Samples/Cognitive-Speech-TTS/blob/master/CustomVoice/script/verbal-statement-all-locales.txt) · [Azure batch synthesis properties](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/batch-synthesis-properties.md) · [Google Chirp 3 ICV notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/audio/speech/getting-started/get_started_with_chirp3_instant_custom_voice.ipynb) · [Google TTS pricing (3rd party)](https://texttolab.com/blog/google-cloud-tts-pricing) · [OpenAI create voice](https://developers.openai.com/api/reference/resources/audio/subresources/voices/methods/create) · [OpenAI voice consents](https://developers.openai.com/api/reference/resources/audio/subresources/voice_consents/methods/create) · [OpenAI audio models blog](https://developers.openai.com/blog/updates-audio-models) · [MiniMax Speech 2.8](https://www.minimax.io/news/minimax-speech-28) · [MiniMax voice clone API](https://platform.minimax.io/docs/api-reference/voice-cloning-clone) · [Hume Octave 2](https://www.hume.ai/blog/octave-2-launch) · [Fish Audio S2.1 Pro](https://fish.audio/blog/s2-1-pro-free-api/) · [Fish Audio pricing (3rd party)](https://texttolab.com/blog/fish-audio-pricing) · [Resemble Chatterbox Multilingual](https://www.resemble.ai/learn/models/chatterbox-multilingual) · [Resemble pricing (3rd party)](https://checkthat.ai/brands/resemble-ai/pricing) · [Speechify API pricing](https://speechify.com/pricing-api/) · [Speechify language support](https://docs.speechify.ai/tts/text-to-speech/features/language-support) · [PlayHT shutdown](https://texttolab.com/blog/play-ht-shutdown-alternatives) · [Coqui TTS repo](https://github.com/coqui-ai/TTS) · [XTTS CPML tartışması](https://github.com/coqui-ai/TTS/discussions/4304) · [F5-TTS lisans/dil](https://github.com/SWivid/F5-TTS/discussions/997) · [Açık kaynak Türkçe TTS rehberi](https://www.ablt.dev/blog/turkish-tts/) · [Self-host GPU deployment](https://www.spheron.network/blog/self-host-voice-cloning-gpu-cloud-xtts-f5-tts-openvoice-v2/) · [Artificial Analysis Speech Arena](https://artificialanalysis.ai/text-to-speech/leaderboard/provider-voice) · [KVKK biyometrik veri](https://www.mobildev.com/blog/kvkk-biyometrik-verilerin-islenmesi) · [KVKK 2026/921 ilke kararı](https://www.kvkk.gov.tr/Icerik/8762/mesai-takibi-amaciyla-biyometrik-veri-islenmesi-hakkinda-kisisel-verileri-koruma-kurulunun-29-04-2026-tarihli-ve-2026-921-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu)