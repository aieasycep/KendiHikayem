# Rakip Analizi — MomSays (com.gamely.momsays)

> Karar dokümanı. Ham raporlar: `07a`, `07b`, `07c`.

---

# MomSays → Karar Dokümanı
*Üç rapor sentezi. Tüm veriler WebSearch snippet'lerinden; hiçbir mağaza sayfası doğrudan okunamadı (egress bloklu). İşaretler: ✅ doğrulandı · ⚠️ çelişkili/zayıf · ❌ doğrulanmadı*

---

## A. MomSays Özellik Haritası

| Özellik | Var/Yok | Kalite notu | Kaynak güvenilirliği |
|---|---|---|---|
| Ses klonlama | Var | Paywall'ın **arkasında**; satın alma sonrası "Try Again Later" hataları yaygın. Çalıştığında kalite kabul edilebilir (kalite şikayeti yok, **çalışmama** şikayeti var) | ✅ Yüksek (mağaza metni + yorumlar) |
| Kişiselleştirilmiş hikaye üretimi | Var | Tema + karakter + illüstrasyon özelleştirilebilir; "saniyeler içinde". İki mod: sıfırdan / klasik masalı iyileştirme | ✅ Yüksek |
| Hikaye uzunluğu kontrolü | Yok görünüyor | Bir kullanıcı çıktının "15 saniye bile değil" olduğunu yazmış | ⚠️ Tek yorum |
| AI illüstrasyon | Var | Sayı, üslup, **karakter tutarlılığı bilinmiyor** | ✅ Var / ❌ kalite |
| Çocuk fotoğrafından karakter | Muhtemelen yok | Mağaza metninde fotoğraf yükleme hiç geçmiyor; rakiplerde standart | ⚠️ Negatif kanıt |
| ScanReader (fiziksel kitap → OCR → kendi sesinle okuma) | Var | Ürünün en özgün özelliği; "touchable text blocks". Türkçe OCR performansı bilinmiyor | ✅ Yüksek |
| Flashcard & Quiz (matematik/mantık/kelime, yaşa göre) | Var | UGC destekli, oyunlaştırılmış | ✅ Yüksek |
| Talk & Learn (klonlanmış sesle canlı sohbet) | Var | Konuşma logları + ebeveyn içgörü paneli — güçlü retention mekanizması | ✅ Yüksek |
| Topluluk / UGC hikaye ve quiz havuzu | Var | "ever-growing collection" | ✅ Yüksek |
| Hikaye kütüphanesi / kalıcı kayıt | Var | — | ✅ Yüksek |
| Web'de paylaşım linki | Var | `momsays.ai/story/<token>` formatı | ✅ Orta-yüksek |
| **Ses/hikaye dışa aktarma (export)** | **Yok** | Kullanıcılar açıkça istiyor, şikayet ediyor | ✅ Yüksek (negatif) |
| **Fiziksel kitap baskısı** | **Yok** | IAP listesinde tek bir fiziksel SKU yok; 3 bağımsız raporda da negatif | ✅ Yüksek (negatif) |
| Offline oynatma | Muhtemelen yok | "hiçbir ses/görsel yüklenmedi" şikayeti backend bağımlılığını gösteriyor | ⚠️ Çıkarım |
| Ham ses kaydının saklanması | Yok | Ödeme sonrası kullanıcı kaydı **yeniden** yapmak zorunda | ✅ Yüksek (negatif) |
| Rıza ekranı / canlılık (liveness) doğrulaması | Kanıt yok | Akış "kaydet → klonla" görünüyor | ❌ |
| Kaç ses profili / anne-baba ayrımı | Bilinmiyor | Çince adı 爸爸妈妈**分身** çokluyu ima ediyor | ⚠️ Zayıf |
| Kayıt süresi / okutulan metin | Bilinmiyor | *"10-15 sn" rakamı başka bir uygulamaya ait, MomSays'e atfetmeyin* | ❌ |
| Ekran görüntüleri | Görülmedi | CDN erişilemedi | ❌ |

---

## B. Fiyatlandırma ve Traksiyon Özeti

**Fiyat (USD, ✅):** Starter Pack $0.99 tek seferlik · Hafta $4.99 · Ay $9.99 · **Yıl $59.99 (~$4.99/ay)**. Klasik 3 katmanlı paywall + anchor pricing; haftalık bilinçli olarak absürt pahalı. PRO = sınırsız hikaye + sınırsız illüstrasyon. Ücretsiz katmanın **sayısal limitleri hiçbir yerde yayınlanmamış** ❌.
**TL fiyatı: ❌ bilinmiyor.** (Rapor 2'nin ~1.000–1.400 TL/yıl tahmini spekülatiftir, karara temel alınmamalı.)

**Traksiyon:**
- Play: 500.000+ rozet · ~920k tahmini toplam · ~100k/ay indirme (AppBrain tahmini ⚠️) · ~8.100 oy
- Puan: **4.51 ⚠️ (bir snippet 4.1 diyor)** · iOS: **4.8 ama sadece ~20 oy** → iOS fiilen ölü
- İlk yayın Mayıs 2024 · Android son güncelleme 2-3 Nisan 2026, v1.1.1
- ⚠️ **Çelişki:** iOS son güncelleme "25 Oca 2025 / v0.7.8" vs "3 Nis 2026". Çözülemedi.
- ⚠️ APK boyutu 84.02 vs 81.18 MB (önemsiz çelişki)
- **Gelir: ❌ hiçbir kaynakta yok.** Rapor 2'nin $400k–1.1M aralığı tamamen varsayım.

**Sahiplik — stratejik olarak en önemli bulgu (⚠️ çıkarım, resmî duyuru yok):** iOS = East World Inc. (gamely.com), Android = **Prometheus Interactive LLC** (Philadelphia, 110 uygulamalık app-flipping portföyü; açık satın alma kriteri var). Paket adı `com.gamely.*` kalmış → devir tezi güçlü. **Okuma: karşımızda VC destekli aktif startup yok, nakde çevrilmiş bir varlık var. Pencere açık — ama aynı zamanda "bu kategori tek başına app olarak büyümedi" uyarısı.**

**Kategori fiyat bandı:** $2/hikaye (kullandıkça öde) → $4.90–8.25/ay (ana küme) → $17/ay (Sleepytale). MomSays bandın alt ucunda. **Ses klonlama yapan en az 7 doğrulanmış oyuncu var → klonlama artık farklılaştırıcı değil, komodite.** Meta Temmuz 2026'da kategoriye giriyor.

---

## C. Türkçe Desteği Durumu — Net Cevap

**Net cevap: Arayüz Türkçe, gerisi kanıtlanmamış — ve muhtemelen zayıf.**

| Katman | Durum | Güven |
|---|---|---|
| Arayüz lokalizasyonu | ✅ **VAR.** App Store 15 dil listesinde Türkçe + Play başlığı Türkçe: "MomSays: AI Çocuk Hikayeler" (iki bağımsız kanıt) | Yüksek |
| Türkçe hikaye metni üretimi | ⚠️ Teknik engel yok, muhtemelen çalışır — ama hiçbir kaynakta iddia edilmiyor | Orta |
| **Türkçe klonlanmış seslendirme (TTS)** | ❌ **DOĞRULANMADI. Bilinmezimiz.** | — |
| Türkçe OCR (ScanReader) | ❌ Doğrulanmadı | — |

**Anlamlı negatif sinyal:** SleepyVoice "40+ dil", Sleepytale "17 dil" diye reklam yaparken MomSays dil sayısını **pazarlama argümanı olarak hiç kullanmıyor**. 15 dilde arayüz çevirisi ≠ 15 dilde ses. Türkçenin sondan eklemeli yapısı, ğ/ı/ö/ş/ü ve vurgu kalıpları TTS'te sık bozulur.

**Karar için sonuç:** "MomSays Türkçe yapamıyor" varsayımı üzerine ürün kurmayın — **önce test edin (Bölüm I)**. Ama "15 dilde yüzeysel"e karşı "tek dilde derin" konumlandırması, test sonucu ne olursa olsun savunulabilir.

---

## D. Kullanıcı Şikayetlerinden 8 Ders

| # | Şikayet | Bizim önlemimiz |
|---|---|---|
| 1 | Ses klonlamayı denemek için **önce ödeme** isteniyor | **Paywall'ı aha-moment'ın arkasına al:** ücretsiz klonla + tam uzunlukta 1 hikayeyi kendi sesinle dinlet, para ondan sonra iste |
| 2 | Ödeme sonrası kayıt kayboluyor, **yeniden okutuluyor** | Ham kaydı cihazda + sunucuda sakla; tek tuşla yeniden dene, asla yeniden okutma |
| 3 | "Error / Try Again Later" — kurtarılamaz hata | Klonlamayı **idempotent job queue** + exponential backoff ile kur; kullanıcıya "hata" değil "hazırlanıyor, bitince bildirim" göster |
| 4 | Ödeme sonrası **hiçbir ses/görsel yüklenmiyor**, silip kurmak çözmüyor (backend bozulması) | Üretilen her varlığı (metin+ses+görsel) **cihaza indir, tam offline oynat.** Yatma saati kaçırılamaz. + yedek TTS sağlayıcıya otomatik düşme + kota alarmı |
| 5 | **Destek cevapsız** ("0 yıldız verirdim") | Uygulama içi destek + 24 saat yanıt taahhüdü; ödeme sonrası kilit açılmazsa **otomatik** destek talebi aç |
| 6 | Üretilen içerik **çok kısa** ("15 saniye bile değil") | Üretimden **önce** taahhüt: 3/7/12 dk seçimi + kaç sayfa/kaç görsel önizlemesi; minimum uzunluk garantisi |
| 7 | **İade belirsizliği** ("iade alabilir miyim bilmiyorum") | Koşulsuz 14 gün iade + uygulama içinde görünür; tek tuşla iptal. TR'de cayma hakkı zaten var — **zayıflık değil, pazarlama argümanı** yap |
| 8 | Abonelik agresifliği (kategorinin 1 numaralı şikayeti) | Gerçek ücretsiz katman (ayda 2-3 **tam** hikaye) + **aboneliksiz kredi paketi** + tek seferlik fiziksel kitap satışı. Çocuk ekranında sıfır satın alma istemi (parent gate) |

---

## E. Tahmini Teknik Yığın ve AI Sağlayıcıları

**Dürüst cevap: ❌ İkisi de doğrulanamadı. Sağlayıcı adı vermek uydurma olur.**

- **Framework:** Bilinmiyor. Tek ipucu 84 MB APK — cross-platform runtime (RN/Flutter) + gömülü varlıklarla uyumlu ama ayırt edici değil. Dolaylı ipucu: aynı yayıncının `com.gamely.goai` uygulaması KataGo'yu cihaz üzerinde çalıştırıyor → ekipte gerçek **native/C++/NDK** kası var.
- **AI sağlayıcıları:** ❌ Hiçbir kanıt yok. `gamely.com/privacy` ve `/eula` erişilemedi, arama motoru da indekslememiş. Alt işleyici listesi çıkarılamadı.
- **Ses verisi saklama/silme:** ❌ Politika okunamadı. Ama davranışsal kanıt: ham kayıt **saklanmıyor** (gizlilik için iyi, UX için felaket).
- **Kötüye kullanım önlemi (liveness/rastgele metin):** ❌ Kanıt yok, muhtemelen yok.

**Bizim için asıl ders:** Rakibin teknoloji seçimi bizi ilgilendirmiyor. Onların hataları **AI pipeline dayanıklılığında** (kuyruk, retry, önbellek, yedek sağlayıcı), UI katmanında değil. Framework tartışmasına vakit harcamayın.

**Devir riski notu:** Android el değiştirdiyse mevcut kullanıcıların **ses klonları ve çocuk verileri yeni bir tüzel kişiye devrolmuş** demektir. Bu bizim için doğal bir güven üstünlüğü.

---

## F. BİZİM FARKLILAŞMAMIZ — En Güçlü 5 Koz (öncelik sırasıyla)

**1. Dijital → Fiziksel: baskıya hazır kitap (kesişim şu anda BOŞ)**
Türk kişiselleştirilmiş kitap oyuncularının (Benim Masalım 699–1.099 TL, İsme Özel Masal, Sihirli Yolculuk, Kendi Masalım) **hiçbirinde ses klonlama yok**; MomSays'te **baskı yok**. 1.099 TL'lik tek seferlik satış = $4.99/ay aboneliğin ~2 yıllık geliri, iptal riski sıfır. Ayrıca kategorinin 1 numaralı şikayetini (abonelik) tamamen atlar. MomSays ScanReader ile fiziksel→dijital yönünde çalışıyor; ters yön açık.

**2. Güvenilirlik + tam offline oynatma**
Rakibin en yıkıcı hatası "para aldı, sonra hiçbir şey yüklenmedi". Bizde her hikaye cihaza iner, backend çökse bile o gece çalışır. Bu kategoride özellik değil, temel gereksinim.

**3. Türkçede derinlik (15 dilde yüzeysellik yerine)**
Türkçe prozodi/vurgu, Türkçe isimlerin doğru telaffuzu (Ayşe, Göksu, Çağla), ve **Türk kültür evreni**: Keloğlan, Nasreddin Hoca, Dede Korkut, bayram/ramazan temaları. MomSays'in üretebileceği şey genel Batılı AI masalı.

**4. Ticari şeffaflık: aha-moment önce, para sonra**
Ücretsiz klon + 1 tam hikaye → sonra ödeme. TL fiyat, yerel ödeme, tek tuşla iptal, koşulsuz 14 gün iade, aboneliksiz kredi paketi. Rakibin en zayıf halkası.

**5. Güven katmanı: rıza, canlılık, KVKK**
Rastgele Türkçe cümle okutma + ASR eşleştirme (başkasının sesi klonlanamaz), duyulmaz filigran, tek tuşla "sesimi sil", alt işleyici listesini **açıkça yayınlama**. Sürtünme olarak değil, **satın alma sebebi** olarak pazarla.

*Not: "Aile ses kütüphanesi" (anne/baba/dede/anneanne + karaktere ses atama) 6. koz — güçlü ama V2.*

---

## G. MVP Özellik Listesi

| Olmazsa olmaz (V1) | Olsa iyi olur (V1.5) | V2 |
|---|---|---|
| Türkçe ses klonlama (rastgele cümle + ASR doğrulama + rıza onayı) | Çocuk fotoğrafından karakter üretimi | Talk & Learn: klonlanmış sesle canlı sohbet |
| Ham kaydın kalıcı saklanması + tek tuş retry | Süre seçimi (3/7/12 dk) | Konuşma logları + ebeveyn içgörü paneli |
| Çocuk adı/yaş/ilgi girdisiyle Türkçe hikaye üretimi | Üretim sonrası metin düzenleme | ScanReader benzeri fiziksel kitap tarama (Türkçe OCR) |
| AI illüstrasyon + **sayfalar arası karakter tutarlılığı** | Aile ses kütüphanesi (2. profil: baba/anneanne) | Flashcard & Quiz |
| **Baskıya hazır PDF + fiziksel kitap siparişi** (tek seferlik satış) | Basılı sayfada QR/NFC → o sayfa ebeveyn sesiyle çalsın | Topluluk / UGC hikaye havuzu |
| Tam offline indirme ve oynatma | Ses dosyası export (MP3/M4A paylaşımı) | Türk masal evreni genişletmesi (Dede Korkut serisi) |
| Job queue + retry + yedek TTS sağlayıcı | Hediye akışı (doğum günü, yeni doğan, yurtdışındaki dede-nine) | Yoto/Toniebox tarzı donanım köprüsü |
| Ödeme duvarı aha-moment'tan **sonra**; ücretsiz 2-3 tam hikaye | Ekransız "sadece dinle" modu | Web uygulaması / paylaşım linki |
| TL fiyat + kredi paketi + tek tuş iptal + 14 gün iade | Klasik masal kütüphanesi üzerine kişiselleştirme | Çoklu dil (EN ikinci dil) |
| Parent gate; çocuk ekranında sıfır satın alma/reklam | Ekran süresi limiti | |
| "Sesimi sil" + KVKK/alt işleyici şeffaflığı | | |
| Uygulama içi destek, 24s SLA | | |

---

## H. Kopyalamamamız Gereken 3 Şey

1. **Değer gösterilmeden alınan para.** Klonlamayı paywall arkasına koymak → en çok şikayet edilen nokta, güveni kırıyor, muhtemelen dönüşümü de düşürüyor. Aha-moment paywall'dan önce.
2. **Yatay özellik yayılması.** MomSays 4 ayrı ürün taşıyor (hikaye + ScanReader + quiz + sohbet) ve hiçbirini sağlam tutamıyor. 15 dilde yüzeysel olmak da aynı hata. **Tek dilde, tek işi kusursuz yapın.**
3. **Bulut bağımlı, kurtarılamaz mimari + cevapsız destek.** Backend bozulunca ürünün tamamı ölüyor, kullanıcı ulaşamıyor. Ayrıca 3 alan adı + iki tüzel kişilik + değişen mağaza başlıkları = dağınık, güvensiz marka kimliği. Tek marka, tek alan adı, tek destek kanalı.

---

## I. Doğrulanamayan Kritik Bilgiler — Kendi Telefonunuzda Kontrol Edin

**Öncelik 1 — ürün kararının kilit testi (TR App Store/Play hesabıyla indirip):**
1. **Türkçe ses klonu Türkçe metni aksansız/doğru vurguyla okuyor mu?** (Bizim tüm tezimiz buna bağlı)
2. Türkçe prompt'la Türkçe hikaye üretiyor mu, kalitesi nasıl?
3. Arayüz gerçekten Türkçe geliyor mu?
4. **Türkiye TL fiyatları** (haftalık/aylık/yıllık) — ekran görüntüsü alın
5. Ücretsiz katmanın **sayısal limitleri** (kaç hikaye/kaç illüstrasyon/ScanReader ve quiz açık mı?)

**Öncelik 2 — klonlama akışı:**
6. Kaç saniye kayıt isteniyor? Sabit metin mi, serbest mi?
7. Kaç ses profili oluşturulabiliyor? Anne + baba ayrı ayrı var mı?
8. Rıza/onay ekranı var mı? Canlılık doğrulaması var mı?
9. Klonlama gerçekten paywall'ın arkasında mı (2026 sürümünde hâlâ öyle mi)?

**Öncelik 3 — üretim kalitesi:**
10. Hikaye kaç sayfa/kaç dakika? Üretim gerçekte kaç saniye sürüyor?
11. Kaç görsel, hangi üslup, **karakter sayfalar arası tutarlı mı**?
12. Çocuk fotoğrafı yükleme var mı? Çocuk adı/yaş girdisi var mı?
13. Üretilen metin düzenlenebiliyor mu? Ses/PDF export var mı?
14. Uçak modunda kayıtlı hikaye açılıyor mu (offline testi)?
15. ScanReader Türkçe bir kitap sayfasını doğru OCR ediyor mu?

**Öncelik 4 — erişimi olan bir ortamda açılacak 3 URL** (AI sağlayıcıları + veri politikası için): `gamely.com/privacy` · `gamely.com/eula` · `useprometheus.app/bedtimestories/privacy/`

**Ayrıca çözülmemiş çelişkiler:** iOS son güncelleme tarihi (Oca 2025 vs Nis 2026) · Play puanı (4.51 vs 4.1) · iOS oy sayısı (~20 vs "yeterli oy yok") · devir/satış resmî duyurusu bulunamadı.

**Tek hamlede en çok soruyu kapatan yol:** `com.gamely.momsays` v1.1.1 APK'sını egress kısıtı olmayan bir ortamda indirip string/asset/endpoint analizi yapmak.