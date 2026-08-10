# MomSays ham teardown raporu 2

---

# MomSays — İş Modeli, Traksiyon ve Pazar Analizi

> **Yöntem notu:** play.google.com, apps.apple.com, apkcombo'nun yanı sıra bu ortamda **gamely.com, momsays.ai, momsays.app, momsays.gamely.com, appbrain.com, foxdata.com, apkpure, apkfab, androidrank, similarweb, appfigures, qimai, sensortower, itunes.apple.com/lookup ve useprometheus.app da egress politikasıyla bloklu** (proxy 403 CONNECT). Bu yüzden veriler ağırlıklı olarak **WebSearch snippet'lerinden** çıkarıldı — yani mağaza/analitik sayfalarının içeriği dolaylı olarak okundu. Doğrudan sayfa doğrulaması yapılamadığı için çelişkili rakamlar aşağıda açıkça işaretlendi.

---

## 0) ÖNEMLİ BULGU: Uygulama el değiştirmiş görünüyor

Görev brief'indeki "East World Inc. / Gamely" bilgisi **artık Android tarafında geçerli değil**:

| Platform | Görünen yayıncı | Kaynak |
|---|---|---|
| iOS (ID 6479632759) | **East World Inc.** | App Store listelemesi (snippet) |
| Android (com.gamely.momsays) | **Prometheus Interactive LLC** | AppBrain + Play listelemesi (snippet) |
| EULA / Gizlilik | hâlâ `gamely.com/eula`, `gamely.com/privacy` | App Store metni |
| Destek e-postası | `support.bedtimestories@useprometheus.app` | Play/App Store metni |
| Ürün sayfası | `useprometheus.app/bedtimestories/` + `/privacy/` | Arama sonucu |

**Prometheus Interactive LLC** = Philadelphia, PA merkezli, 2011'den beri aktif, **110 uygulamalık** bir portföy şirketi (Picsa Photo Editor, Mirror App — her biri 50M+ indirme). Kamuya açık satın alma kriteri: *"istikrarlı aylık indirmesi olan, en az 4 yıldızlı, en az 6 aydır mağazada olan uygulamaları satın alıyoruz."*

➡️ **Çıkarım (DOĞRULANMADI — satış duyurusu bulunamadı):** MomSays'in Android tarafı Gamely/East World'den Prometheus Interactive'e **satılmış/devredilmiş** olma ihtimali yüksek. iOS tarafı East World'de kalmış ve **19 aydır güncellenmemiş** görünüyor. Bu, ürünün "kurucu ekip tarafından büyütülen bir startup" değil, **"cash-cow olarak elden çıkarılmış bir varlık"** olduğuna işaret ediyor. Bizim için bu iyi haber: aktif, agresif bir rakip değil.

---

## 1) FİYATLANDIRMA

| Kalem | Fiyat | Güven |
|---|---|---|
| **Yıllık PRO** | **$4.99/ay** (yıllık faturalanır) → ~**$59.88/yıl** (yıllık toplam benim hesabım) | ✅ Çok sayıda kaynakta tekrarlanıyor (mağaza açıklama metninden) |
| Aylık abonelik | Var, **fiyat bulunamadı** | ⚠️ Varlığı doğrulandı, tutar **DOĞRULANMADI** |
| Haftalık abonelik | Var, **fiyat bulunamadı** | ⚠️ Varlığı doğrulandı, tutar **DOĞRULANMADI** |
| Ömür boyu (lifetime) | **Kanıt bulunamadı** | ❌ **DOĞRULANMADI** |
| Kredi/jeton paketi | **Kanıt bulunamadı** | ❌ **DOĞRULANMADI** |
| Ücretsiz deneme | Var (ücretsiz sürüm + trial modeli) | ⚠️ Süre **DOĞRULANMADI** |
| Ücretsiz katman | Var — sınırlı hikaye/illüstrasyon | ✅ |

**PRO'nun açtığı şey:** sınırsız hikaye üretimi + sınırsız illüstrasyon.

**Abonelik yapısı:** Çince mağaza açıklamasında da *会员订阅：周/月/年* (haftalık/aylık/yıllık) üçlüsü doğrulanıyor — yani klasik 3 katmanlı paywall.

### Türkiye fiyatı (TL)
❌ **BULUNAMADI.** Hiçbir kaynakta TL fiyatı yok. Ülkeye göre fiyat farkı olup olmadığı da **DOĞRULANMADI**. 

*Not: Uygulamanın mağaza listelemesi Türkçe'ye lokalize (aşağıya bakınız), dolayısıyla Türkiye'de satışta. Google Play/App Store Türkiye fiyat katmanları genelde ABD'nin %40-60'ı seviyesinde olur; $59.88/yıl için kabaca **1.000–1.400 TL/yıl** beklenir — bu **benim tahminim, DOĞRULANMADI**.*

---

## 2) TRAKSİYON

| Metrik | Değer | Kaynak / Güven |
|---|---|---|
| Play indirme rozeti | **500.000+** | ✅ Play listelemesi |
| Play tahmini toplam indirme | **~920.000** | ⚠️ AppBrain tahmini (TAHMİNİ) |
| Play son 30 gün indirme | **~100.000** (Mayıs 2026 verisi) | ⚠️ AppBrain tahmini (TAHMİNİ) |
| Play puanı | **4.51 / 5** — *ancak başka bir snippet **4.1** diyor* | ⚠️ **ÇELİŞKİLİ** |
| Play oy sayısı | **~8.100** | ⚠️ AppBrain |
| Play ilk yayın | **Mayıs 2024** | ✅ |
| Play son güncelleme | **2 Nisan 2026**, sürüm **1.1.1** | ✅ |
| APK boyutu | **81,18 MB** | ✅ |
| İçerik derecesi | Everyone / 4+ | ✅ |
| **iOS ilk yayın** | **Nisan 2024** | ✅ |
| **iOS son güncelleme** | **25 Ocak 2025**, sürüm **0.7.8** | ⚠️ Bir başka snippet "3 Nisan 2026, 4.58 puan" diyor — **ÇELİŞKİLİ / DOĞRULANMADI** |
| iOS oy sayısı & puanı | **BULUNAMADI** (Singapur mağazasında "yeterli oy yok" notu var) | ❌ |
| Platformlar | iOS, iPadOS, macOS, visionOS + Android | ✅ |
| **Gelir tahmini** | **HİÇBİR KAYNAKTA BULUNAMADI** | ❌ Sensor Tower/AppMagic paywall arkasında |

### Kaba gelir modeli (TAMAMEN TAHMİNİ — DOĞRULANMADI)
920k Play indirmesi + bilinmeyen iOS tabanı, %1–2 ücretli dönüşüm, $59,88 yıllık ARPPU varsayımıyla → **~$400k – $1,1M yıllık brüt (mağaza kesintisi öncesi)**. Bu tamamen benim aritmetiğim, hiçbir veri sağlayıcı doğrulamıyor.

### Coğrafya / popülerlik
Hangi ülkelerde popüler olduğuna dair **doğrudan sıralama verisi bulunamadı**. Ancak **dolaylı ama güçlü bir sinyal** var: Play mağaza listelemesi ülkeye göre farklı başlıklarla lokalize edilmiş —

| Ülke/dil | Mağaza başlığı |
|---|---|
| ABD/EN | Bedtime Stories: Story Time AI |
| İngiltere | Bedtime Stories: MomSays AI |
| **Türkiye** | **MomSays: AI Çocuk Hikayeler** |
| Polonya | MomSays: AI Opowieści Dzieci |
| Çin | 妈妈说 - 爸爸妈妈分身，陪伴宝宝阅读和学习成长 |
| Montserrat vb. | Bedtime Stories: Story Time AI |

Yani **Türkiye dahil en az 15 pazarda aktif olarak listeleniyor**.

### Kullanıcı yorumlarının tonu (kalite riski)
- **Olumlu:** homeschool anneleri, "gün boyu ders anlatıp yorulunca yine de çocuğuma okumuş oluyorum"; "AI sesi çok iyi, ara sıra doğal olmayan anlar oluyor".
- **Olumsuz (dikkat çekici):** *"Premium'a para ödedim, sonra uygulama bozuldu — sesler yüklenmiyor, illüstrasyonlar çıkmıyor, güncelleme de gelip düzeltmedi."*

➡️ iOS'un 19 aydır güncellenmemiş olması + bu şikâyetler → **ürün bakımı zayıf**. Bu bizim için en net saldırı yüzeyi.

---

## 3) DİL DESTEĞİ — TÜRKÇE (EN KRİTİK SORU)

### Doğrulanan dil listesi (App Store metadata, 15 dil)
İngilizce, **Arapça, Felemenkçe, Fransızca, Almanca, Hintçe, Endonezce, İtalyanca, Japonca, Lehçe, Portekizce, Basitleştirilmiş Çince, İspanyolca, İsveççe, TÜRKÇE**

Bu liste **iki bağımsız aramada aynı şekilde** çıktı → yüksek güven.

### Katman katman değerlendirme

| Katman | Türkçe var mı? | Güven |
|---|---|---|
| **Arayüz (UI) lokalizasyonu** | ✅ **EVET** | **Yüksek** — App Store dil listesinde Türkçe var **VE** Play başlığı Türkçe'ye çevrilmiş ("MomSays: AI Çocuk Hikayeler"). İki bağımsız kanıt. |
| **Hikaye üretimi (Türkçe metin)** | ⚠️ **Muhtemelen evet ama DOĞRULANMADI** | LLM tabanlı üretim yaptıkları için teknik engel yok, ancak hiçbir kaynakta "Türkçe hikaye üretir" ifadesi yok. |
| **Ses klonlama (Türkçe seslendirme)** | ❌ **DOĞRULANMADI — kritik bilinmez** | Hiçbir kaynak MomSays'in klonlama motorunun dil listesini vermiyor. |

### Bu neden bizim için önemli
Bir uygulamanın App Store'da 15 dil listelemesi çoğu zaman **sadece UI string'lerinin çevrildiği** anlamına gelir; **üretim (hikaye) ve TTS/klonlama katmanı ayrı meselelerdir**. Rakiplerde bu ayrım net görülüyor: SleepyVoice **40+ dil** diye açıkça reklam yapıyor, Sleepytale **17 dil** diyor — MomSays ise dil sayısını pazarlama argümanı olarak **hiç kullanmıyor**. Bu, klonlama tarafının muhtemelen İngilizce/Çince ağırlıklı olduğuna dair **zayıf ama anlamlı bir negatif sinyal**.

**Teyit için tek kesin yol:** Türkiye App Store/Play hesabıyla uygulamayı indirip (a) arayüzün gerçekten Türkçe geldiğini, (b) Türkçe prompt'la hikaye üretip üretmediğini, (c) Türkçe ses kaydıyla klon oluşturup Türkçe metni **aksansız** okuyup okumadığını manuel test etmek. Bu, bizim ürün kararımızın kilit testi olmalı — bu ortamdan doğrulanamıyor.

---

## 4) PAZARLAMA

| Kanal | Durum | Kaynak |
|---|---|---|
| **TikTok** | `@momsaysapp` — "MomSays: AI Bedtime Stories" resmî hesabı **var** | ✅ Hesap doğrulandı; **takipçi/görüntülenme sayısı DOĞRULANMADI** |
| **Facebook** | "MomSays (@MomsaysSA)" sayfası var | ⚠️ Aynı şirkete ait olduğu **DOĞRULANMADI** (SA soneki şüpheli) |
| **Instagram / ücretli reklam** | Kanıt **bulunamadı** | ❌ **DOĞRULANMADI** |
| **Influencer** | Kanıt bulunamadı; Medium'da MamaTales lehine içerikler var ama MomSays için yok | ❌ |
| **ASO** | **Ana büyüme motoru gibi görünüyor** | ✅ Aşağıya bakınız |
| **Web/SEO** | 3 ayrı alan adı: `momsays.ai`, `momsays.app`, `momsays.gamely.com` | ✅ |

### ASO stratejisi (en net gözlem)
Marka adını **başlıkta ikinci sıraya** atıp, yüksek arama hacimli jenerik kelimeyi öne almışlar:
> **"Bedtime Stories"** : Story Time AI / MomSays AI

Alt başlıkta uzun-kuyruk anahtar kelime yığını: *"Mom says AI story book app: Storytime for kids with your own cloned voice"*.

Türkiye'de aynı taktik: **"MomSays: AI Çocuk Hikayeler"** — "çocuk hikayeler" jenerik araması hedefleniyor.

Ayrıca aynı paket için **ülkeye göre farklı başlıklar** kullanılıyor (Story Time AI ↔ MomSays AI) → aktif **A/B başlık testi** yapıldığına işaret.

### Mesajlaşma / konumlandırma
Temel duygusal kanca: **ebeveyn yokluğu / suçluluk telafisi**
- *"Sesin, sen meşgul ya da uzaktayken bile çocuğunun sürekli yoldaşı olsun."*
- *"Ses klonlama ve gelişmiş hikâye teknolojisi seni çocuğunun tüm hikâyelerinin anlatıcı kahramanı yapar."*

Özellik vaadi ikinci planda; asıl satılan şey **"anne/babanın sesi"**. Aynı duygu Çince pazarlamada da birebir: **爸爸妈妈分身** = "anne-babanın ikizi/klonu".

---

## 5) ŞİRKET

| Konu | Bulgu | Güven |
|---|---|---|
| iOS yayıncısı | **East World Inc.** | ✅ |
| Marka/alan adı | **gamely.com** (EULA + gizlilik burada) | ✅ |
| East World merkezi / kuruluş yılı | **BULUNAMADI** — gamely.com bloklu, kayıt bulunamadı | ❌ |
| Diğer uygulamaları | **BULUNAMADI** (Play geliştirici sayfası erişilemedi) | ❌ |
| Yatırım / fon | **Hiçbir kayıt bulunamadı** (Crunchbase/Dealroom'da East World Inc. yok) | ❌ **DOĞRULANMADI** |
| Köken | Çince marka adı + Çince mağaza listelemesi → **Çin/Çince konuşan ekip olması muhtemel** | ⚠️ **DOĞRULANMADI** |
| **Android yayıncısı (güncel)** | **Prometheus Interactive LLC** — Philadelphia, PA, ABD | ✅ |
| Prometheus profili | 2011'den beri aktif, **110 uygulama**, 10+ ülkede top-100, amiral gemileri Picsa Photo Editor & Mirror App (**50M+ indirme**) | ✅ AppBrain |
| Prometheus iş modeli | **Uygulama satın alan portföy şirketi** (kriter: stabil indirme, 4+ yıldız, 6+ ay mağazada) | ✅ |

➡️ Özet: Karşımızda **VC destekli bir startup yok**. Bir tarafta iOS'ta atıl bırakılmış bir East World/Gamely listelemesi, diğer tarafta uygulamayı satın alıp nakit akışı için işleten bir ABD'li app-flipping portföy şirketi var.

---

## 6) RAKİP HARİTASI

### A) Ses KLONLAMA yapan yazılım rakipleri

| Uygulama | Ses klonlama | Fiyat | Dil desteği | Not |
|---|---|---|---|---|
| **MomSays** | ✅ | **$4,99/ay** (yıllık) | 15 dil (UI); klonlama dilleri bilinmiyor | ScanReader + quiz/flashcard ile en geniş özellik seti |
| **SleepyVoice** | ✅ (birkaç saniye kayıt, büyükanne/baba sesi de) | **$4,99/ay** (yıllık Pro) | **1.500+ ses, 40+ dil** | MomSays'in birebir fiyat/konum ikizi |
| **Sleepytale** | ✅ (sadece en üst pakette) | **$17/ay** (Pro Plus) | 21 anlatıcı, 17 dil | Pazarın **en pahalısı** |
| **StoryBee** (Voice Studio) | ✅ | **$7,00/ay** | **DOĞRULANMADI** | Podcast/basılı kitap çıktısı — "hatıra" konumlandırması |
| **Bedtime Stories** (bedtime-stories.fun) | ✅ (ses kurulumu ücretsiz) | **$2/hikaye, abonelik yok** | DOĞRULANMADI | Tek gerçek **kullandıkça öde** modeli |
| **Stories for Toniebox and Yoto** (MWM) | ✅ (1 dk konuşma) | Abonelik, **tutar DOĞRULANMADI** | DOĞRULANMADI | Donanıma köprü kuran akıllı niş |
| **MamaTales** | ✅ | **DOĞRULANMADI** | DOĞRULANMADI | Sadece Medium tanıtım yazılarından biliniyor |
| **Bedtimestory.ai** | **DOĞRULANMADI** | **$8,25/ay** | DOĞRULANMADI | |
| **Oscar Stories** | **DOĞRULANMADI** (klonlama teyit edilmedi) | **$4,90/ay** | DOĞRULANMADI | Audiobook tarzı anlatım |
| **Meta (isimsiz)** | ? | — | — | **Temmuz 2026'da AI bedtime story uygulaması test ettiği duyuruldu** (TechCrunch) |
| 生声念念 / 哄睡宝 (Çin) | ✅ | Ücretsiz (Android) | Çince | Çin iç pazarı |

**Ses klonlama yapan doğrulanmış oyuncu sayısı: en az 7.** Yani bu artık savunulabilir bir teknik farklılaştırıcı değil — **komoditeleşmiş**.

**Fiyat bandı:** $2/hikaye (kullandıkça öde) → $4,90–8,25/ay (ana küme) → $17/ay (premium uç). **MomSays $4,99 ile bandın alt ucunda konumlanmış.**

### B) Donanım rakipleri (klonlama YOK, kendi sesini kaydetme VAR)

| Ürün | Cihaz fiyatı | İçerik fiyatı | Ebeveyn sesi |
|---|---|---|---|
| **Yoto Player** | $109,99 | Kart $9,99–12,99 | Boş kartlara kendi kaydın; 90 sn'lik sesli notlar |
| **Toniebox 2** | $129,99–140 (starter set) | Figür $17,99–19,99 | Boş "Creative Tonie"ye kendi kaydın |
| **Luka / Luka Hero** | Tek seferlik satın alma, **abonelik yok** | — | Ebeveyn kitabı kendi sesiyle kaydediyor; 20.000+ EN / 70.000+ ZH kitabı kamerayla tanıyor |

➡️ **Luka, MomSays'in ScanReader özelliğinin donanım eşdeğeri** — ve aboneliksiz. Stratejik olarak dikkat: ScanReader'ı ana farklılaştırıcı yaparsak Luka'nın kütüphanesiyle kıyaslanırız.

### C) Kapsam dışı kalanlar
- **Storypals** ve **Caktus AI kids**: hiçbir aramada anlamlı veri çıkmadı → **DOĞRULANMADI / muhtemelen kategoride önemsiz.**
- **Tonies**: kurumsal olarak halka açık şirket, ama AI klonlama yapmıyor.

---

## Bizim için çıkarımlar (kısa)

1. **Türkçe ses klonlama kalitesi bizim tek gerçek kozumuz olabilir** — ama MomSays'in Türkçe'de ne kadar iyi/kötü olduğu bu ortamdan doğrulanamadı. **İlk yapılacak iş: Türkiye hesabıyla manuel test.**
2. **Ses klonlama artık farklılaştırıcı değil** (7+ oyuncu, $2–17 bandı). Farklılaşma **dil kalitesi + yerel içerik + ürün bakımı**nda.
3. **MomSays bakımsız:** iOS 19 aydır güncelsiz, ödeme sonrası bozulma şikâyetleri var, Android'i bir portföy şirketi işletiyor. **Aktif bir rakip değil, terk edilmekte olan bir pazar payı.**
4. **Fiyat çıpası $4,99/ay (yıllık)** — kategori standardı. Bunun altına inmek gereksiz; üstüne çıkmak için Sleepytale gibi net bir premium gerekçe lazım.
5. **Meta kategoriye giriyor** (Temmuz 2026) → jenerik "AI bedtime story" konumlandırması riskli; **yerel/dil odaklı niş** daha savunulabilir.

---

## Kaynaklar

- [Bedtime Stories: MomSays AI — App Store (US)](https://apps.apple.com/us/app/bedtime-stories-momsays-ai/id6479632759)
- [AI Bedtime Stories: MomSays — App Store (IL)](https://apps.apple.com/il/app/ai-bedtime-stories-momsays/id6479632759)
- [Bedtime Stories: MomSays AI — App Store (GB)](https://apps.apple.com/gb/app/bedtime-stories-momsays-ai/id6479632759)
- [Bedtime Stories: Story Time AI — Google Play](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US)
- [妈妈说 - 爸爸妈妈分身 — Google Play](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US)
- [MomSays: AI Bedtime Stories — AppBrain](https://www.appbrain.com/app/momsays-ai-bedtime-stories/com.gamely.momsays)
- [AI Bedtime Stories: MomSays for iPhone — AppBrain](https://www.appbrain.com/appstore/ai-bedtime-stories-momsays/ios-6479632759)
- [Prometheus Interactive LLC — AppBrain geliştirici profili](https://www.appbrain.com/dev/Prometheus+Interactive+LLC/)
- [Bedtime Stories: Story Time AI — Prometheus Interactive](https://useprometheus.app/bedtimestories/)
- [Bedtime Stories Privacy Policy — Prometheus Interactive](https://useprometheus.app/bedtimestories/privacy/)
- [FoxData — com.gamely.momsays app profili](https://platform.foxdata.com/en/app-profile/com.gamely.momsays/US/gp)
- [MomSays TikTok — @momsaysapp](https://www.tiktok.com/@momsaysapp)
- [MomSays resmî site](https://www.momsays.app/) / [momsays.gamely.com](https://momsays.gamely.com/)
- [Apps That Read Bedtime Stories in Your Voice (2026)](https://www.bedtime-stories.fun/blog/read-bedtime-stories-in-your-voice)
- [Best AI Bedtime Story Apps for Kids: 8 Ranked — Gramms](https://gramms.ai/blog/best-ai-bedtime-story-apps-for-kids/)
- [Sleepytale Review 2026: Pricing + Voice Cloning](https://gramms.ai/blog/sleepytale-review/)
- [SleepyVoice — App Store](https://apps.apple.com/us/app/sleepyvoice-ai-bedtime-stories/id6754461416)
- [StoryBee Voice Studio](https://storybee.app/voice-studio) / [StoryBee Pricing](https://storybee.app/pricing)
- [Yoto vs Toniebox (2026): True Cost](https://www.bedtime-stories.fun/blog/is-toniebox-worth-it)
- [Toniebox vs Yoto Player 2026](https://www.wishdeck.com/blog/toniebox-yoto-player-screen-free-audio-player-better-2026)
- [Luka Reads — resmî site](https://www.lukareads.com/)
- [Meta is testing an AI bedtime story app — TechCrunch](https://techcrunch.com/2026/07/21/meta-is-testing-an-ai-bedtime-story-app-for-people-with-no-imagination/)
- [MamaTales — Medium](https://medium.com/@huanzidage/when-moms-voice-is-cloned-how-mamatales-turns-bedtime-into-a-daily-moment-of-love-1b2690d326d5)
- [生声念念 — ruanyf/weekly issue #9227](https://github.com/ruanyf/weekly/issues/9227)