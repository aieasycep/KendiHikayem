# MomSays ham teardown raporu 3

---

Araştırma tamamlandı. WebFetch bu ortamda neredeyse tamamen bloklu çıktı (gamely.com, momsays.gamely.com, useprometheus.app, appbrain, apkfab, foxdata, archive.org, bedtime-stories.fun — hepsi 403), bu yüzden bulguların tamamı WebSearch'ün mağaza sayfalarından sentezlediği içeriğe dayanıyor.

---

# MomSays — Zayıf Noktalar ve Teknik Altyapı Analizi

## 0) ÖNEMLİ METODOLOJİK UYARI

Aşağıdaki yorum alıntılarını **doğrudan mağaza sayfasından okuyamadım** — egress proxy `apps.apple.com`, `play.google.com`, `appbrain.com`, `apkfab.com`, `foxdata.com`, `archive.org`, `useprometheus.app` ve `gamely.com`'u blokladı. Alıntılar arama motorunun mağaza sayfalarından **sentezlediği** metinlerdir; kelimesi kelimesine değil, parafraz olabilir. Yön olarak güvenilir, birebir tırnak olarak değil.

---

## 0.5) BEKLENMEDİK VE STRATEJİK OLARAK EN ÖNEMLİ BULGU: Uygulama el değiştirmiş görünüyor

Brief'te verilen "East World Inc. / Gamely" bilgisi **artık Android tarafında geçerli değil.**

| | iOS | Android |
|---|---|---|
| İsim | Bedtime Stories: MomSays AI | **Bedtime Stories: Story Time AI** |
| ID | 6479632759 | com.gamely.momsays |
| Geliştirici | East World Inc. | **Prometheus Interactive LLC** |
| Destek | gamely.com | **support.bedtimestories@useprometheus.app** |

Kanıtlar:
- Play listeleme başlığı `com.gamely.momsays` için artık "Bedtime Stories: Story Time AI" ([play.google.com](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US))
- Prometheus Interactive'in kendi sitesinde ürün sayfası var: `useprometheus.app/bedtimestories/` ([kaynak](https://useprometheus.app/bedtimestories/))
- AppBrain slug'ı hâlâ `momsays-ai-bedtime-stories/com.gamely.momsays` ama gösterilen başlık "Bedtime Stories: Story Time AI" ve geliştirici Prometheus Interactive LLC ([appbrain](https://www.appbrain.com/app/momsays-ai-bedtime-stories/com.gamely.momsays))
- Play Store'daki geliştirici yanıtları `support.bedtimestories@useprometheus.app` adresine yönlendiriyor
- Paket adı `com.gamely.*` namespace'inde kalmış (paket adı satıştan sonra değiştirilemez) — bu, **devir** tezini güçlendiriyor

**Ne anlama geliyor:** `com.gamely.*` namespace'i East World'e ait ama Android uygulaması Prometheus Interactive LLC'ye geçmiş (Prometheus, "Sound Booster", "Ludo Offline", "Hearts", "Screen Recorder", "LR Presets" gibi düşük-katma-değerli utility/casual portföyü olan bir yayıncı). Bir AI ürününü bu tip bir portföy yayıncısına devretmek genelde **"ürün büyümedi, nakde çevrildi"** sinyalidir. iOS tarafı East World'de kalmış ve orada sadece ~20 puanlama var — yani iOS fiilen terk edilmiş durumda.

`DOĞRULANMADI`: Resmî bir satın alma/devir duyurusu bulamadım. Bu çıkarım listeleme kanıtlarına dayanıyor.

**Bizim için:** Rakip aktif geliştirilmiyor olabilir. Bu, saldırmak için ideal bir an — ama aynı zamanda "bu pazar tek başına app olarak büyümüyor" uyarısı. (Bkz. Bölüm C, fiziksel kitap tezi.)

---

## A) KULLANICI ŞİKAYETLERİ

### Ölçek ve puan durumu

| Metrik | Değer | Kaynak |
|---|---|---|
| iOS puan | 4.8 / 5, **sadece ~20 oy** | App Store |
| Android puan | **4.51 / 5**, ~8.100 oy | Play |
| Android indirme | son 30 günde ~100.000 | AppBrain verisi |
| APK boyutu | 84.02 MB | apkcombo |
| Sürüm | 0.9.9 → 1.1.1 | apkcombo |
| İlk yayın | Mayıs 2024 | AppBrain |

**Okuma:** 8.100 oyda 4.51 ortalama, "AI + abonelik" kategorisi için düşük-orta. 100k/ay indirmeye karşılık iOS'ta 20 oy olması, ücretli kullanıcı kitlesinin **neredeyse tamamen Android** olduğunu ve iOS'un ölü olduğunu gösteriyor.

### Şikayet 1 — Ses kaydı hatası (en sık, brief'te de geçen)

> Kullanıcı ses klonlama özelliğini denemek istiyor → **önce satın alması gerekiyor** → satın aldıktan sonra kaydı **yeniden yapmak** zorunda kalıyor → "Error and Try Again Later" bildirimi alıyor → uygulama **kaydı saklama seçeneği sunmuyor** → "zamanımı ve paramı boşa harcadım", iade alabilir miyim bilmiyorum.

Kaynak: [Play Store](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US) yorumları üzerinden.

Bu tek şikayette **dört ayrı tasarım hatası** var:
1. Ödeme duvarı ses kaydından **önce** (değer gösterilmeden para isteniyor)
2. Ödeme sonrası kayıt **kayboluyor**, tekrar isteniyor
3. Klonlama backend'i hata veriyor ve hata **kurtarılamıyor**
4. Ham kayıt **saklanmıyor** → retry imkânsız

**Bizim üründe nasıl önleriz:**
- **Ödeme duvarını sesin ARKASINA al.** Kullanıcı ücretsiz olarak sesini kaydeder, klonlar ve **30 saniyelik bir örnek hikâyeyi kendi sesiyle dinler.** Para ancak "vay be, bu gerçekten benim sesim" anından sonra istenir. Bu, aha-moment'ı paywall'ın önüne alan tek değişiklik ve muhtemelen dönüşümü de artırır.
- **Ham kaydı her zaman cihazda ve sunucuda sakla.** Klonlama başarısız olursa kullanıcı tek tuşla yeniden dener; asla yeniden okutma.
- **Klonlamayı idempotent, kuyruklu (job queue) ve yeniden denenebilir yap.** Sağlayıcı 5xx dönerse otomatik retry + exponential backoff; kullanıcıya "hata" değil "hazırlanıyor, bitince bildirim göndereceğiz" göster.
- **Asla "Error. Try again later" gösterme.** Hata mesajı her zaman bir sonraki eylemi içersin: "Ses işlenemedi — kaydın duruyor, tekrar dene" + tek tuş.

### Şikayet 2 — Uygulama ödeme sonrası tamamen çalışmaz hale geliyor

> Premium abonelik alındıktan sonra uygulama çalışmayı durdurdu; **hiçbir ses yüklenmedi, hiçbir illüstrasyon yüklenmedi**; güncelleme, silip yeniden yükleme çözmedi; hem uygulama desteğine hem şirketin sitesine ulaşıldı, **hiç yanıt gelmedi**. "Yapabilseydim 0 yıldız verirdim."

Kaynak: App Store yorumları üzerinden ([apps.apple.com/us/app/bedtime-stories-momsays-ai/id6479632759](https://apps.apple.com/us/app/bedtime-stories-momsays-ai/id6479632759)).

Teşhis: "ne ses ne görsel yükleniyor" + yeniden kurulum çözmüyor → **sunucu tarafı hesap/kota bozulması** veya AI sağlayıcı kredisinin bitmesi. Yani kullanıcının cihazında değil, backend'de kalıcı bir bozuk durum.

**Bizim üründe nasıl önleriz:**
- **Üretilen her varlığı kalıcı sakla ve çevrimdışı oynat.** Hikâye metni, ses dosyası ve görseller üretildikten sonra cihaza indirilsin. Backend çökse bile çocuk o gece hikâyesini dinleyebilsin. Bu kategoride bu, "nice to have" değil — yatma saati kaçırılamaz.
- **Sağlayıcı kotası/kredisi için alarm ve otomatik yedek sağlayıcı** (birincil TTS düşerse ikincil sağlayıcıya düş).
- **Sağlık göstergesi + kendi kendine onarım:** hesap bozuk durumdaysa uygulama bunu tespit edip "hesabını onarıyoruz" akışına soksun.
- **Destek SLA'sı ve görünür destek kanalı.** Bu şikayetin en zehirli kısmı hata değil, **cevapsızlık**. Uygulama içi destek + 24 saat yanıt taahhüdü.

### Şikayet 3 — Ödenen paranın karşılığı alınamıyor / özellik kilitli kalıyor

> ~$10 ödendi, ancak "anlatıcı değiştirilemiyor ve hikâye üretilemiyor."

Kaynak: App Store yorumları.

**Bizim üründe nasıl önleriz:** Satın alma sonrası **yetkilendirme (entitlement) doğrulaması** client'ta değil sunucuda; satın alma geri yüklemesi ("Restore Purchases") her ekranda erişilebilir; ödeme sonrası kilit açılmazsa otomatik olarak destek talebi oluştur.

### Şikayet 4 — Üretilen içerik çok kısa, değer algısı düşük

> Sesi eğittikten ve ses üretildikten sonra ödeme istendi, üstelik uygulamanın ürettiği metin **15 saniye bile değildi.**

Kaynak: Play Store yorumları.

**Bizim üründe nasıl önleriz:**
- **Minimum hikâye uzunluğu garantisi** ve kullanıcıya süre seçtirme: "3 dk / 7 dk / 12 dk". Süreyi üretimden **önce** taahhüt et, sonra tut.
- Üretim öncesi **önizleme**: kaç sayfa, kaç dakika, kaç görsel olacağı net gösterilsin.
- Yatma rutini gerçeğine göre tasarla: ebeveynin ihtiyacı 15 saniye değil, çocuğu uyutacak **8-12 dakika**.

### Şikayet 5 — Ödeme duvarı konumu ve "önce para" algısı

> Uygulama ürünü düzgün test ettirmeden parayı hemen alıyor.

Geliştiricinin standart yanıtı: "hem ücretsiz hem ücretli sürümümüz var, Premium'u ücretsiz denemede deneyebilirsiniz" — yani **kalıplaşmış, sorunu çözmeyen bir yanıt.**

Bu, sektörel bir örüntüyle de örtüşüyor: Unstar'ın 2026 analizine göre çocuk/ebeveyn uygulamalarında en duygusal şikayet kategorisi ödeme istemleri, ve ebeveyn forumlarında **abonelik sorunları 1 numaralı şikayet** ([unstar.app](https://unstar.app/blog/kids-parenting-app-reviews-what-parents-complain-about-2026)).

**Bizim üründe nasıl önleriz:**
- **Ücretsiz katman gerçek olsun**: ayda 2-3 tam hikâye, tam uzunlukta, kendi sesiyle. Kırpılmış demo değil.
- **Şeffaf fiyat:** "yıllık, toplam ₺X, aylık karşılığı ₺Y" — Türkiye'de "aylık $4.99 gibi görünen yıllık paket" güven kırıyor.
- **Tek tuşla iptal** uygulama içinden + iptal öncesi "kalan hakların şuraya kadar geçerli" açık bilgi.
- **Çocuk ekranında hiçbir satın alma istemi olmasın.** Ödeme akışları yalnızca ebeveyn kapısının (parent gate) arkasında.

### Şikayet 6 — İade belirsizliği

Birden fazla yorumda "iade alabilir miyim bilmiyorum" ifadesi geçiyor. Uygulama iade yolunu göstermiyor.

**Bizim üründe nasıl önleriz:** **Koşulsuz 14 gün iade** politikası ve bunu uygulama içinde açıkça belirtme. Türkiye'de mesafeli satış cayma hakkı zaten var; bunu bir zayıflık değil **pazarlama argümanı** yap.

### Ses klonlama kalitesi hakkında ne diyorlar?

`DOĞRULANMADI` — Aradığım hiçbir kaynakta MomSays'in klon kalitesine dair ("robotik", "bana benzemiyor", belirli dilde kötü) doğrudan kullanıcı ifadesi **bulamadım**. Şikayetler kalite değil **çalışmama** üzerinde yoğunlaşıyor. Bu iki şeyi düşündürüyor: (a) klon çalıştığında kalite kabul edilebilir, (b) çoğu kullanıcı klonu çalıştırmaya bile ulaşamıyor.

Pozitif taraf da var — bir ev-eğitimi veren anne "bütün gün ders anlattıktan sonra akşam okuyamıyorum, MomSays sayesinde hâlâ onlara ben okuyorum" demiş. Bu, **ürün fikrinin çalıştığının** kanıtı; sorun uygulama kalitesinde.

### Desteklenen diller (Türkçe dahil!)

İngilizce, Arapça, Felemenkçe, Fransızca, Almanca, Hintçe, Endonezce, İtalyanca, Japonca, Lehçe, Portekizce, Basitleştirilmiş Çince, İspanyolca, İsveççe ve **Türkçe** ([App Store](https://apps.apple.com/gb/app/bedtime-stories-momsays-ai/id6479632759)).

**Kritik nüans:** Bu, App Store'un **arayüz yerelleştirme** listesidir — hikâye üretiminin, ses klonunun ve ScanReader OCR'ının Türkçe'de iyi çalıştığını **kanıtlamaz**. `DOĞRULANMADI`. Türkçe'nin sondan eklemeli yapısı, "ğ/ı/ö/ş/ü" ve vurgu kalıpları TTS'te sık bozulur. Rakibin 15 dilde yüzeysel olması, bizim tek dilde derin olmamız için en net açık.

---

## B) TEKNİK TAHMİN

### B1. Uygulama hangi teknolojiyle yazılmış?

**`DOĞRULANMADI` — kesin bilgi elde edemedim.** SDK istihbaratı veren tüm siteler (AppBrain, Appfigures, apkfab, foxdata, apkmirror, apkpure, apkmonk, aptoide) proxy tarafından bloklandı, iş ilanı/LinkedIn izi bulamadım.

Elimdeki tek somut ipucu: **APK boyutu 84.02 MB** ([apkcombo](https://apkcombo.com/bedtime-stories-momsays-ai/com.gamely.momsays/)). Bu, saf native bir CRUD+API uygulaması için büyük; çapraz platform runtime (React Native/Flutter) + gömülü font/illüstrasyon varlıkları ile uyumlu. Ancak tek başına ayırt edici değil.

**Dolaylı ipucu:** Aynı yayıncının (East World Inc.) diğer uygulaması **"Go AI: Offline On-Device AI"** (`com.gamely.goai`), KataGo motorunu **cihaz üzerinde çevrimdışı** çalıştırıyor ve iOS'ta Apple M1+ gerektiriyor ([App Store](https://apps.apple.com/ph/app/go-ai-offline-katago-ai/id6760274188), [Play](https://play.google.com/store/apps/details?id=com.gamely.goai)). KataGo'yu mobilde çalıştırmak ciddi **native/C++ ve NDK** yetkinliği gerektirir. Yani ekipte gerçek native kas var; MomSays'in de en azından native bir çekirdeği olması muhtemel.

**Bizim için çıkarım:** Rakibin teknoloji seçimi bizim için belirleyici değil. Asıl ders başka: **onların hataları AI pipeline'ının dayanıklılığında, UI katmanında değil.** Framework tartışmasına vakit harcamayıp, kuyruk/retry/önbellek mimarisine yatırım yapmalıyız.

### B2. Hangi AI sağlayıcıları?

**`DOĞRULANMADI` — hiçbir kanıt bulamadım.** `gamely.com/privacy` ve `momsays.gamely.com` bloklu; arama motoru da bu sayfaların içeriğini indekslememiş. **Alt işleyici (subprocessor) listesini çıkaramadım.**

Bu, görevin doğrudan cevaplanamayan tek maddesi. Erişimi olan bir ortamda şu üç URL öncelikle açılmalı:
- `https://gamely.com/privacy`
- `https://gamely.com/eula`
- `https://useprometheus.app/bedtimestories/` (Android tarafının yeni sahibi — muhtemelen **farklı** bir gizlilik politikası var, devir sonrası veri aktarımı açısından kritik)

Spekülasyon yapmıyorum; sağlayıcı adı vermek uydurma olurdu.

### B3. Ses verisi nasıl saklanıyor/siliniyor?

**`DOĞRULANMADI`** — gizlilik politikasına erişemedim, Play "Data safety" bölümünün içeriğini de alamadım.

Ancak **doğruladığım bir gerçek** çok şey söylüyor: kullanıcı ödeme sonrası **kaydı yeniden yapmak zorunda kalıyor** ve "uygulama kaydı saklama seçeneği sunmuyor". Bu, ham ses kaydının **kalıcı olarak saklanmadığını** (ya da en azından kullanıcıya erişilebilir kılınmadığını) gösteriyor — gizlilik açısından iyi, kullanıcı deneyimi açısından felaket.

**Ayrıca kritik risk:** Android uygulaması el değiştirdiyse, **mevcut kullanıcıların ses klonları ve çocuk verileri yeni bir tüzel kişiye devrolmuş** demektir. Ebeveynler için bu ciddi bir güven sorunu ve bizim için güçlü bir konumlandırma argümanı.

### B4. Kötüye kullanım önlemleri (liveness, rastgele metin)?

**`DOĞRULANMADI` — MomSays'te böyle bir önlem olduğuna dair hiçbir kanıt bulamadım.** Yorumlardan anlaşılan akış "kaydet → klonla" şeklinde, canlılık doğrulaması içerdiğine dair iz yok.

Sektörde standart hâline gelen yöntem, kullanıcıya **rastgele üretilmiş bir cümle okutmaktır** — böylece birisinin YouTube videosundan alınmış sesi klonlaması engellenir ([kaynak](https://www.proofnews.org/ai-tools-make-it-easy-to-clone-someones-voice-without-consent/)).

**Bizim üründe:**
- Klonlama için **rastgele üretilen Türkçe cümle** okutma zorunlu (her seferinde farklı)
- Okunan metnin ASR ile eşleştirilmesi (metin uyuşmuyorsa klon yok)
- **Ses sahipliği onayı**: "Bu ses bana ait ve klonlanmasına izin veriyorum" ayrı, açık onay
- Üretilen tüm seslere **duyulmaz filigran (watermark)**
- **Tek tuşla sesimi sil** — ham kayıt + klon modeli + türetilmiş sesler, hepsi
- Klonun **yalnızca çocuk içeriği** üretebilmesi (serbest metin okutma yok) — kötüye kullanımı yapısal olarak imkânsız kıl

---

## C) BOŞLUKLAR — MomSays'in Yapmadığı, Bizim Yapabileceğimiz 10 Şey

### 1. Fiziksel kitap baskısı (en büyük ve en savunulabilir boşluk)
MomSays tamamen dijital. Türkiye'de kişiselleştirilmiş basılı çocuk kitabı pazarı **zaten var ve para kazanıyor**: Benim Masalım premium sert kapak **1.099 TL**'den, ekonomik **699 TL**'den ([benimmasalim.com.tr](https://www.benimmasalim.com.tr/)); ayrıca İsme Özel Masal, Sihirli Yolculuk (4 günde kargo), Kendi Masalım, Holale, MST Yayıncılık.

**Kritik gözlem: bu Türk oyuncuların HİÇBİRİNDE ses klonlama yok. MomSays'te ise baskı yok.** Kesişim boş. Tek bir üründe "kendi sesinle seslendirilmiş + basılı kitap" birleşimi Türkiye'de rakipsiz.

**İş modeli avantajı:** 1.099 TL'lik tek seferlik bir baskı, $4.99/ay aboneliğin ~2 yıllık gelirine eşit — üstelik iptal riski yok. Abonelik yerine (veya yanında) **ürün satışı**, bu kategorideki 1 numaralı şikayeti (abonelik) tamamen ortadan kaldırır.

### 2. Basılı kitap + QR/NFC ile sesli katman
Basılı sayfadaki QR kodu okutunca o sayfa **ebeveynin sesiyle** çalsın. Fiziksel kitabın kalıcılığı + dijitalin sıcaklığı. Hediye olarak da güçlü (doğum günü, yeni doğan, yurtdışındaki dede-nine).

### 3. Türkçe'de derinlik (15 dilde yüzeysellik yerine)
Türkçe'ye özel TTS prozodi ayarı, doğru vurgu, Türkçe isimlerin doğru telaffuzu (Ayşe, Göksu, Çağla), ve **Türk kültürüne ait hikâye evreni**: Keloğlan, Nasreddin Hoca, Dede Korkut, bayram/ramazan temaları, yöresel masallar. MomSays'in üretebileceği şey genel Batılı AI masalı.

### 4. Yatma saati asla kaçmaz: tam çevrimdışı oynatma
Rakibin en yıkıcı hatası "hiçbir ses ve görsel yüklenmedi". Bizde üretilen her hikâye **cihaza indirilir**; uçakta, köyde, internet yokken, backend çökmüşken bile çalışır. Bu kategoride bu bir özellik değil, **temel gereksinim**.

### 5. Ödeme duvarından önce gerçek "aha" anı
Ücretsiz olarak: ses klonla + tam uzunlukta 1 hikâye üret + kendi sesinle dinle. Para ancak bundan sonra. Rakibin en çok şikayet edilen noktası tam tersi.

### 6. Çoklu ses: sadece anne değil
Anne, baba, anneanne, dede, hala — **aile ses kütüphanesi**. Ve karakterlere farklı aile üyelerinin sesini atama ("kurt dedenin sesiyle konuşsun"). Yurtdışındaki/askerdeki/vardiyalı çalışan ebeveyn ve **vefat etmiş bir yakının sesini koruma** (çok hassas ama çok değerli bir kullanım).

### 7. Şeffaf, Türkiye'ye uygun ödeme ve iade
TL fiyatlandırma, yerel ödeme yöntemleri, **tek tuşla iptal**, koşulsuz 14 gün iade, aboneliksiz **kredi paketi** seçeneği ("5 hikâye al, bitince bitsin"). Rakibin en zayıf halkası burası.

### 8. Radikal veri şeffaflığı ve KVKK uyumu
Alt işleyici listesini **açıkça yayınla** (rakip bunu erişilebilir kılmıyor). "Sesim nerede saklanıyor, ne zaman siliniyor" sorusuna uygulama içinde net cevap. Tek tuşla ses ve çocuk verisi silme. Rakip Android tarafında el değiştirdiği için burada güven üstünlüğü doğal olarak bizde.

### 9. Klonlama için canlılık doğrulaması (güven özelliği olarak pazarla)
Rastgele Türkçe cümle okutma + ASR eşleştirme + ses filigranı. Bunu bir sürtünme değil, **"başkasının sesi buraya giremez"** vaadi olarak sat. Ebeveyn kitlesinde bu satın alma sebebidir.

### 10. Ebeveyn kontrolü ve gerçek çocuk modu
Çocuk ekranında **sıfır satın alma istemi**, sıfır reklam, sıfır dış bağlantı. Ebeveyn kapısı (parent gate). Ekran süresi limiti ve "sadece dinle" (ekransız) modu — Readmio'nun ekransız felsefesi ile MomSays'in üretkenliğini birleştir. Uyku öncesi mavi ışık sorununu da çözer.

---

## Özet: Rakibin üç kırılgan noktası

1. **Güvenilirlik** — Ürün fikri çalışıyor ("hâlâ onlara ben okuyorum"), ama uygulama para alındıktan sonra bozuluyor ve destek cevap vermiyor. Saldırılacak yer burası, özellik listesi değil.
2. **Ticari model** — Değer gösterilmeden alınan abonelik + iade belirsizliği; kategorinin 1 numaralı şikayeti. Fiziksel kitap satışı bunu tamamen atlatır.
3. **Momentum kaybı** — iOS'ta ~20 puanlama, Android'de yayıncı değişimi. Rakip muhtemelen aktif geliştirilmiyor. Pencere açık.

**En büyük fırsat:** Türkiye'de kişiselleştirilmiş basılı çocuk kitabı pazarı canlı ve fiyatlar yüksek (699–1.099 TL), ama **hiçbirinde ses klonlama yok**; MomSays'te ses klonlama var ama **baskı yok**. Bu kesişim şu anda boş.

**Kapatılamayan boşluk:** `gamely.com/privacy` erişilemediği için **alt işleyici listesi, AI sağlayıcıları ve ses verisi saklama/silme politikası doğrulanamadı.** Erişimi olan bir ortamda ilk açılacak üç URL: `gamely.com/privacy`, `gamely.com/eula`, `useprometheus.app/bedtimestories/`.

---

Sources:
- [Bedtime Stories: MomSays AI — App Store (US)](https://apps.apple.com/us/app/bedtime-stories-momsays-ai/id6479632759)
- [Bedtime Stories: MomSays AI — App Store (GB)](https://apps.apple.com/gb/app/bedtime-stories-momsays-ai/id6479632759)
- [Bedtime Stories: Story Time AI — Google Play](https://play.google.com/store/apps/details?id=com.gamely.momsays&hl=en_US)
- [AppBrain — com.gamely.momsays](https://www.appbrain.com/app/momsays-ai-bedtime-stories/com.gamely.momsays)
- [APKCombo — com.gamely.momsays](https://apkcombo.com/bedtime-stories-momsays-ai/com.gamely.momsays/)
- [Prometheus Interactive — Bedtime Stories: Story Time AI](https://useprometheus.app/bedtimestories/)
- [Prometheus Interactive LLC — AppBrain developer](https://www.appbrain.com/dev/Prometheus+Interactive+LLC/)
- [East World Inc. — App Store developer](https://apps.apple.com/kg/developer/east-world-inc/id1645254217)
- [Go AI: Offline On-Device AI — Google Play](https://play.google.com/store/apps/details?id=com.gamely.goai)
- [Go AI: Offline KataGo AI — App Store](https://apps.apple.com/ph/app/go-ai-offline-katago-ai/id6760274188)
- [Unstar — Kids & Parenting Apps: Top Parent Complaints (2026)](https://unstar.app/blog/kids-parenting-app-reviews-what-parents-complain-about-2026)
- [ProofNews — AI Tools Make It Easy to Clone Someone's Voice Without Consent](https://www.proofnews.org/ai-tools-make-it-easy-to-clone-someones-voice-without-consent/)
- [Benim Masalım — Kişiye Özel Çocuk Kitabı](https://www.benimmasalim.com.tr/)
- [İsme Özel Masal](https://ismeozelmasal.com/)
- [Sihirli Yolculuk](https://www.sihirliyolculuk.com/)
- [Kendi Masalım](https://kendimasalim.com/)