# MomSays ham teardown raporu 1

---

# MomSays — Tam Özellik ve Akış Analizi

## ⚠️ ÖNCE ARAŞTIRMA KISITI (şeffaflık)

Bu ortamda egress politikası **deny-all** çalışıyor. Sadece `play.google.com`/`apps.apple.com`/`apkcombo` değil, denediğim **28 domainin tamamı** CONNECT 403 verdi (reddit, producthunt, sensortower, similarweb, appfigures, qimai, zhihu, 36kr, sspai, xiaohongshu, youtube, apkpure, apkmirror, aptoide, appbrain, foxdata, medium, v2ex, gamely.com, momsays.ai dahil).

**Çalışan tek kanal: WebSearch.** Arama backend'i bu sayfaları okuyabiliyor ve içeriği özetliyor — tüm veriyi bu yolla çıkardım. Bu yüzden bazı alanlar (kayıt süresi, sayfa sayısı gibi ekran-içi detaylar) **doğrulanamadı** ve aşağıda açıkça öyle işaretlendi. Bunlar için tek kesin yol APK dekompilasyonu veya uygulamayı fiilen kurmaktır.

---

## 1) KİMLİK VE MAĞAZA METİNLERİ

### 1.1 Uygulama kimliği (DOĞRULANDI)

| Alan | Değer |
|---|---|
| iOS App ID | 6479632759 |
| Android paket | `com.gamely.momsays` |
| iOS geliştirici | **East World Inc.** (App Store) |
| Play/APK geliştirici | **Prometheus Interactive LLC** ⚠️ |
| Web siteleri | momsays.ai, momsays.app, momsays.gamely.com |
| Yaş sınırı | 4+ / Everyone |
| Sürüm | 1.1.1 |
| APK boyutu | 84.02 MB |
| İlk yayın | Mayıs 2024 |
| Son güncelleme | 2–3 Nisan 2026 |
| Puan | 4.51 / 5 (~8.100 oy) |
| Toplam indirme | ~920.000 (son 30 günde ~100.000) |

⚠️ **Geliştirici tutarsızlığı:** App Store "East World Inc." derken, AppBrain ve APKCombo bağımsız olarak Play tarafında **"Prometheus Interactive LLC"** gösteriyor. Aynı grubun iki tüzel kişiliği olabilir; **teyide muhtaç**. (Kaynak: [AppBrain](https://www.appbrain.com/app/momsays-ai-bedtime-stories/com.gamely.momsays), [APKCombo](https://apkcombo.com/bedtime-stories-momsays-ai/com.gamely.momsays/))

### 1.2 Lokale göre değişen isimler (ASO stratejisi — dikkat çekici)

Aynı ID altında ülkeye göre **farklı başlıklar** kullanıyorlar:
- `Bedtime Stories: MomSays AI` (US/GB/SG/SA)
- `AI Bedtime Stories: MomSays` (IL)
- `Bedtime Stories: Story Time AI` (Play, en_US)
- `妈妈说 - 爸爸妈妈分身，陪伴宝宝阅读和学习成长` (ZH)
- `MomSays: قصص قبل النوم بصوتك` (AR)

### 1.3 App Store açıklaması — TAM METİN (İngilizce, DOĞRULANDI)

> **Powered by AI, MomSays lets your voice become a constant companion for your child, being there for every moment - from daily conversations, exploring math & things to bedtime stories - even when you're busy or away.**
>
> **Personalized Storybook Creation and Narration**
> • Effortlessly create bedtime stories in your voice clone
> • Create stories with AI assistance
> • Generate beautiful illustrations
> • Narrate in your cloned voice
> • Share with family and explore community stories
>
> **ScanReader — Turn physical books into interactive voiced reading**
> • Scan any book page with your phone camera
> • Listen to text narrated in your voice
> • Create interactive reading experiences with touchable text blocks
>
> **Create & Play Flashcards & Quizzes — Unleash the power of interactive learning**
> • AI generates intelligent flashcards & quizzes tailored to your child's learning needs
> • Play diverse flashcards & quizzes created by parents worldwide
> • Gamified Learning Experience
>
> **Talk & Learn with Your Voice Clone — Become a daily friend & teacher for your child**
> • Engage in natural daily conversations
> • Explore things around us
> • Master Math & Logic concepts
> • Develop language skills
> • Review conversation logs to gain insights into your child's progress

(Kaynak: [App Store US](https://apps.apple.com/us/app/bedtime-stories-momsays-ai/id6479632759), [App Store SG](https://apps.apple.com/sg/app/bedtime-stories-momsays-ai/id6479632759))

### 1.4 Google Play uzun açıklaması (DOĞRULANDI — büyük ölçüde tam)

> **Your Voice, Their Beloved Tales** — Make bedtime special in the most enchanting way—with your voice. With Bedtime Stories: Story Time AI, you can read your little one's favorite bedtime stories for kids, and they can hear your voice love, magical comfort, and imagination, even when you are away. Voice cloning and advanced storytelling tech make you the narrating hero in all their stories.
>
> Mom says AI app lets you record your voice, and AI reads personalized interactive stories while your voice is used to narrate, beautifully illustrated and everything! AI kids story generator makes storytelling available to you during your bedtime routine even when they are away on a business trip or you are just busy at work.
>
> **✨ Customized Stories With the AI Storybook Creator** — Say no to boring and generic storybooks! With the intuitive AI storybook creator, you can build original tales from scratch or improve classic stories and have them narrated in your own voice. Choose the books and customize the **themes, characters, and beautiful illustrations**.
>
> ✅ Create stories for kids **in seconds** with the bedtime story app
> ✅ Personalize and narrate them in your voice
> ✅ Save your stories and access them anytime
> ✅ Check out stories made by other parents in our ever-growing collection
>
> **📖 ScanReader:** Use AI storybook creator and Interactive Experiences Scanner to convert physical books to digital. Your child's favorite paper books can now be read aloud by your voice.

(Kaynak: [FoxData / Play listing](https://foxdata.com/en/app-marketing-analytics/com.gamely.momsays/gp/MS/bedtime-stories-story-time-ai/), [Google Play](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US))

### 1.5 Ekran görüntüleri — ekran ekran

**DOĞRULANMADI.** Görsel varlıklara (mağaza CDN'i) hiçbir şekilde erişilemedi; ekran görüntülerini görmedim, tarif edemem. Uydurmuyorum. Açıklama metninden **çıkarsanan** ekran seti şu 4 ana sekme etrafında: (1) Hikaye oluşturma/kütüphane, (2) ScanReader kamera, (3) Flashcard/Quiz, (4) Sohbet (Talk & Learn) + ayrıca ses klonlama onboarding'i ve topluluk akışı.

---

## 2) SES KLONLAMA AKIŞI

| Soru | Cevap | Durum |
|---|---|---|
| Kaç saniye konuşuluyor? | — | ❌ **DOĞRULANMADI** |
| Sabit metin mi, serbest mi? | — | ❌ **DOĞRULANMADI** |
| Kaç ses profili? | — | ❌ **DOĞRULANMADI** |
| Anne + baba ayrı ayrı? | Ürün adı 爸爸妈妈**分身** ("anne-baba klonu/avatarı") ve "parents" çoğul kullanımı **çoklu profili ima ediyor** ama sayı verilmiyor | ⚠️ Zayıf kanıt |
| Rıza/onay ekranı? | — | ❌ **DOĞRULANMADI** |
| Türkçe ses desteği? | ⚠️ Aşağıya bakın | Kritik ayrım |

**Bilinen kesin şeyler:**
- Klonlama **ücretli duvarın arkasında**. Kullanıcı yorumu: *"needing to purchase the voice recording feature, and after purchasing, encountering errors and 'Try Again Later' notifications"* ([Play reviews](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US))
- Klonlanan ses **kalıcı** — bir kez oluştur, sonra sınırsız metin okut.
- ScanReader'da ses "doğal ton ve duygu ile" okuyor deniyor.

**⚠️ 10–15 saniye rakamına DİKKAT:** Aramalarda çıkan "10-15 saniye" bilgisi MomSays'e ait DEĞİL — başka bir Çin uygulamasına (声音克隆宝) ait bir Sohu makalesinden geliyor. **MomSays için geçerli sayma.** Sektör benchmark'ı olarak referans alınabilir (Bedtime Stories: 10 sn, Resemble Rapid: 10 sn, Professional: 10–25 dk).

### Diller — KRİTİK AYRIM

**Uygulama arayüzü 15 dilde (DOĞRULANDI):** İngilizce, Arapça, Felemenkçe, Fransızca, Almanca, Hintçe, Endonezce, İtalyanca, Japonca, Lehçe, Portekizce, Basitleştirilmiş Çince, İspanyolca, İsveççe, **Türkçe**.

⚠️ Ama bu **arayüz lokalizasyonu**. Ses klonlamanın/TTS'in Türkçe çıktı verip vermediği, Türkçe hikaye üretilip üretilmediği **DOĞRULANMADI**. Türkçe arayüz ≠ Türkçe klonlanmış seslendirme. Bu bizim için **doğrulanması gereken en kritik nokta** — çünkü Türkçe TTS/klonlama kalitesi bir farklılaşma alanı olabilir.

---

## 3) HİKAYE ÜRETİM AKIŞI

**DOĞRULANAN girdiler** (Play açıklamasından birebir): **tema (themes), karakter (characters), illüstrasyon (illustrations)** özelleştirilebiliyor. İki mod var:
1. **Sıfırdan orijinal hikaye** ("build original tales from scratch")
2. **Klasik hikayeyi iyileştirme** ("improve classic stories") — hazır klasik masal kütüphanesi mevcut, üzerine kişiselleştirme yapılıyor

**Süre:** "Create stories for kids **in seconds**" — saniyeler mertebesinde (mağaza iddiası, gerçek süre ölçülmedi).

**Kaydetme:** "Save your stories and access them anytime" — kalıcı kütüphane var. ✅

**Paylaşım:** Web'de paylaşılabiliyor — `momsays.ai/story/<şifreli-token>` formatında public paylaşım linkleri mevcut (Fernet-benzeri token). Yani hikaye web'de de oynatılabiliyor. ✅

❌ **DOĞRULANMADI:** Çocuk adı/yaş girdisi olup olmadığı, sayfa sayısı, hikaye uzunluğu, üretim sonrası metin düzenleme imkânı.

---

## 4) GÖRSELLER

- "Generate beautiful illustrations" / "amazing generative illustrations" — AI üretimi. ✅
- İllüstrasyonlar özelleştirilebilir kategoriler arasında sayılıyor. ✅
- ❌ **DOĞRULANMADI:** Görsel sayısı, sanat üslubu, karakter tutarlılığı (cross-page consistency), **çocuğun fotoğrafının yüklenip yüklenmediği**.

⚠️ Not: Rakiplerde (Magic Story AI, StoryBee, Lullaby) çocuk fotoğrafı yükleyip karakteri ona benzetme yaygın. MomSays'in açıklamasında **fotoğraf yükleme hiç geçmiyor** — muhtemelen yok. Bu potansiyel bir boşluk ama kesin değil.

---

## 5) ScanReader (fiziksel kitap tarama)

Akış (mağaza metninden, DOĞRULANDI):
1. Telefon kamerasıyla **herhangi bir kitap sayfasını tara**
2. OCR ile metin çıkarılır, **"touchable text blocks"** (dokunulabilir metin blokları) haline getirilir
3. Klonlanmış ebeveyn sesiyle **"doğal ton ve duyguyla"** seslendirilir
4. Sonuç: fiziksel kitap → interaktif dijital okuma deneyimi

Bu, ürünün en özgün ve savunulabilir özelliği. "Convert physical books to digital" olarak konumlandırılmış.

---

## 6) QUIZ / FLASHCARD, SOHBET, TOPLULUK

**Flashcard & Quiz:**
- AI, çocuğun öğrenme ihtiyacına göre üretiyor
- Konular: **matematik, mantık, kelime bilgisi (vocabulary)** — çocuğun **yaşına göre** ayarlanıyor
- **Dünya çapındaki diğer ebeveynlerin oluşturduğu** flashcard/quizler oynanabiliyor (UGC + topluluk)
- "Gamified Learning Experience"

**Talk & Learn (günlük sohbet):**
- Klonlanmış sesle **canlı/doğal günlük sohbet** — çocuğun "günlük arkadaşı ve öğretmeni"
- Çevredeki şeyleri keşfetme, matematik & mantık, dil becerileri
- **Konuşma kayıtları (conversation logs)** — ebeveyn geriye dönük inceleyip çocuğun gelişimine dair içgörü alıyor ⭐ (ebeveyn dashboard'u — güçlü retention mekanizması)

**Topluluk:**
- "Share with family and explore community stories"
- "Check out stories made by other parents in our ever-growing collection"
- Hem hikayeler hem quizler UGC olarak paylaşılıyor

---

## 7) FİZİKSEL KİTAP BASKISI → **YOK. NET CEVAP: HAYIR.** ✅ Bu bizim için BOŞLUK.

**Gerekçe (negatif kanıt, çok sayıda kaynakta):**
- App Store açıklamasının 4 özellik bloğunun hiçbirinde baskı/kargo/hardcover geçmiyor
- Google Play uzun açıklamasında geçmiyor
- IAP listesinde **tek bir fiziksel ürün SKU'su yok** — sadece abonelikler + $0.99 Starter Pack. Fiziksel baskı satsalardı consumable/harici ödeme akışı görünürdü
- Doğrudan "MomSays print physical book hardcover" araması yaptım: sonuç **MomSays'i değil, rakip Night Night'ı** getirdi ($29.99 hardcover, 7–14 gün kargo). Arama motoru MomSays için baskı özelliği bulamadı

**Stratejik okuma:** MomSays tamamen dijital + abonelik odaklı. Fiziksel baskı hem yüksek AOV (Night Night $29.99, I See Me! benzeri) hem de duygusal hediye pazarı demek — MomSays'in **hiç dokunmadığı** alan. Ayrıca ScanReader ile "fiziksel → dijital" yönünde çalışıyorlar; **"dijital → fiziksel"** yönü tamamen açık.

---

## 8) ÜCRETSİZ vs PRO — LİMİT TABLOSU

### Fiyatlandırma (DOĞRULANDI)

| Paket | Fiyat | Aylık eşdeğer |
|---|---|---|
| Starter Pack (tek seferlik) | **$0.99** | — |
| 1 Hafta PRO | **$4.99** | ~$21.6/ay |
| 1 Ay PRO | **$9.99** | $9.99/ay |
| 1 Yıl PRO | **$59.99** | **$4.99/ay** ⭐ |

Ücretsiz deneme mevcut. Yıllık paket aylığa göre **%50 indirimli** — klasik anchor pricing; haftalık paket ise bilinçli olarak absürt pahalı (yıllığa itmek için).

### Limit tablosu

| Özellik | Ücretsiz | PRO |
|---|---|---|
| Uygulamayı indirme | ✅ Ücretsiz | — |
| Hikaye oluşturma | ⚠️ **Sınırlı** (sayı DOĞRULANMADI) | ✅ **Sınırsız** |
| İllüstrasyon üretimi | ⚠️ **Sınırlı** (sayı DOĞRULANMADI) | ✅ **Sınırsız** |
| **Ses klonlama** | ❌ **YOK — ücretli** (yorumlarla doğrulandı) | ✅ Var |
| Topluluk hikayelerini okuma | ⚠️ Muhtemelen açık | ✅ |
| ScanReader | ❓ DOĞRULANMADI | ✅ |
| Quiz/Flashcard | ❓ DOĞRULANMADI | ✅ |
| Talk & Learn sohbet | ❓ DOĞRULANMADI | ✅ |

Mağaza dili: *"has a free and a paid version, with the Premium version opening up more opportunities, while the free version has fewer features available"* / *"Annual PRO plan provides unlimited story creation and illustrations."*

❌ Ücretsiz katmanın **sayısal** limitleri (günde/ayda kaç hikaye, kaç kredi) hiçbir kaynakta yayınlanmamış — sadece uygulama içi paywall'da görünüyor.

---

## 9) KULLANICI ŞİKÂYETLERİ (rakip zafiyetleri — bizim için fırsat)

4.51/5 ortalamaya rağmen tekrar eden ciddi sorunlar:

1. **Ödeme sonrası bozulma:** *"after paying for the premium subscription it stopped working, with no voices loading and no illustrations appearing"*
2. **Ses üretim hataları:** *"after purchasing, encountering errors and 'Try Again Later' notifications"*
3. **Ses kaydını dışa aktaramama:** *"doesn't give users the option to save the reading"* — kullanıcılar "hem zaman hem para kaybettik" diyor ⭐ **Büyük boşluk: ses dosyası export/indirme yok**
4. **Destek cevapsız:** *"attempts to contact app support went unanswered"*
5. **Çıktı kısalığı:** bir kullanıcı üretilen içeriğin *"wasn't even 15 seconds long"* olduğundan yakınıyor
6. **Monetizasyon agresifliği:** klonlamayı denemeden ödeme isteniyor → güven kırıyor

Olumlu taraf: *"as a homeschooling mom, they can still read to their children even when tired from teaching all day"* — **çekirdek duygusal değer önerisi tutuyor.** Sorun üründe değil, execution/altyapı ve monetizasyon sertliğinde.

---

## 10) BİZİM İÇİN BOŞLUK ÖZETİ

| # | Boşluk | Güven |
|---|---|---|
| 1 | **Fiziksel kitap baskısı yok** — dijital→fiziksel yön tamamen açık, yüksek AOV | 🟢 Yüksek |
| 2 | **Ses/hikaye dışa aktarımı yok** — kullanıcılar açıkça istiyor, şikâyet ediyor | 🟢 Yüksek |
| 3 | **Türkçe klonlama/TTS belirsiz** — arayüz Türkçe ama ses tarafı meçhul; Türkiye'de boşluk olabilir | 🟡 Orta |
| 4 | **Çocuk fotoğrafından karakter üretimi muhtemelen yok** | 🟡 Orta |
| 5 | **Güvenilirlik + müşteri desteği zayıf** — ödeme sonrası çalışmama, cevapsız destek | 🟢 Yüksek |
| 6 | **Deneme öncesi ödeme duvarı** — klonlamayı görmeden para isteniyor; biz "önce 1 ücretsiz klon" ile ayrışabiliriz | 🟢 Yüksek |
| 7 | **Rıza/onay akışı görünmüyor** — ses klonlamada KVKK/biyometrik rıza AB & TR'de risk; bizde ayrışma noktası | 🟡 Orta |

---

## KAPATILAMAYAN SORULAR (kesin cevap için APK analizi şart)

Kayıt süresi · okutulan metin (sabit/serbest) · ses profili sayısı · anne-baba ayrımı · rıza ekranı · Türkçe ses desteği · hikaye sayfa sayısı · üretim süresi · düzenleme imkânı · görsel sayısı/üslubu/karakter tutarlılığı · fotoğraf yükleme · ücretsiz katman sayısal limitleri · ekran görüntüleri.

**Öneri:** `com.gamely.momsays` v1.1.1 APK'sını (84 MB) egress kısıtı olmayan bir ortamda indirip string/asset/endpoint analizi yapmak, bu 13 sorunun büyük kısmını tek hamlede kapatır.

---

### Kaynaklar
- [App Store US](https://apps.apple.com/us/app/bedtime-stories-momsays-ai/id6479632759) · [SG](https://apps.apple.com/sg/app/bedtime-stories-momsays-ai/id6479632759) · [GB](https://apps.apple.com/gb/app/bedtime-stories-momsays-ai/id6479632759) · [SA](https://apps.apple.com/sa/app/bedtime-stories-momsays-ai/id6479632759) · [IL](https://apps.apple.com/il/app/ai-bedtime-stories-momsays/id6479632759) · [ZH başlık](https://apps.apple.com/us/app/%E5%A6%88%E5%A6%88%E8%AF%B4-%E7%88%B8%E7%88%B8%E5%A6%88%E5%A6%88%E5%88%86%E8%BA%AB-%E9%99%AA%E4%BC%B4%E5%AE%9D%E5%AE%9D%E9%98%85%E8%AF%BB%E5%92%8C%E5%AD%A6%E4%B9%A0%E6%88%90%E9%95%BF/id6479632759?l=en-US)
- [Google Play](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US)
- [AppBrain Android](https://www.appbrain.com/app/momsays-ai-bedtime-stories/com.gamely.momsays) · [AppBrain iOS](https://www.appbrain.com/appstore/ai-bedtime-stories-momsays/ios-6479632759)
- [FoxData](https://foxdata.com/en/app-marketing-analytics/com.gamely.momsays/gp/MS/bedtime-stories-story-time-ai/) · [FoxData US profil](https://platform.foxdata.com/en/app-profile/com.gamely.momsays/US/gp)
- [APKCombo](https://apkcombo.com/bedtime-stories-momsays-ai/com.gamely.momsays/)
- [momsays.ai](https://momsays.ai/) · [momsays.app](https://www.momsays.app/) · [momsays.gamely.com](https://momsays.gamely.com/)
- Rakip/benchmark: [Night Night baskı](https://nightnight.io/print-their-book) · [bedtime-stories.fun karşılaştırma](https://www.bedtime-stories.fun/blog/read-bedtime-stories-in-your-voice) · [Tom's Guide](https://www.tomsguide.com/ai/as-a-busy-mom-these-are-the-5-best-ai-storytelling-apps-for-kids-ive-tried)