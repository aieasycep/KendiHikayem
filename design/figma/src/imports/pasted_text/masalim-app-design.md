Sen kıdemli bir Product Designer, UX Designer ve Mobile UI Designer olarak çalışacaksın.

Türkiye pazarında başlayacak, ileride global pazara açılabilecek, AI destekli kişiselleştirilmiş çocuk hikâyeleri uygulaması tasarla.

Uygulamanın geçici marka adı “Masalım” olsun. Marka adının Figma Variables / Text Styles veya merkezi bir design token mantığıyla daha sonra kolayca değiştirilebilmesini sağla.

AMAÇ

Masalım, anne ve babaların çocukları için yapay zekâ yardımıyla kişiselleştirilmiş hikâyeler oluşturmasını sağlayan bir mobil uygulamadır.

Kullanıcı:

• Yapay zekâ ile sıfırdan çocuk hikâyesi oluşturabilir.
• Çocuğunun adını hikâyenin kahramanı yapabilir.
• İster çocuğunun adını kullanmadan tamamen hayalî bir kahraman oluşturabilir.
• Hikâyenin kahramanının adını ayrıca belirleyebilir.
• Çocuğun yaşına uygun hikâye oluşturabilir.
• Hikâyenin temasını, konusunu, uzunluğunu ve vermek istediği mesajı seçebilir.
• Oluşturduğu hikâyeyi sistemde bulunan profesyonel AI seslerinden biriyle dinleyebilir.
• Annenin daha önce kaydedilmiş sesiyle hikâyeyi seslendirebilir.
• Babanın daha önce kaydedilmiş sesiyle hikâyeyi seslendirebilir.
• Anne ve baba seslerini sadece bir kere tanımladıktan sonra sonraki tüm hikâyelerde tekrar kullanabilir.
• İleride büyükanne, büyükbaba gibi başka aile üyelerinin seslerini de ekleyebilecek şekilde sistem ölçeklenebilir.
• Hikâyeye özel AI illüstrasyonları oluşturabilir.
• Hikâyeyi sayfalara bölünmüş dijital bir çocuk kitabına dönüştürebilir.
• Kitap kapağı oluşturabilir.
• Sayfaları ve görselleri önizleyebilir.
• İsterse oluşturduğu kitabın fiziksel baskısını sipariş edebilir.
• Eski hikâyelerini kütüphanesinde saklayabilir.
• Hikâyeyi tekrar dinleyebilir, okuyabilir, düzenleyebilir veya farklı bir sesle yeniden seslendirebilir.

UYGULAMANIN TEMEL DUYGUSU

Bu uygulama klasik bir AI aracı gibi görünmemeli.

ChatGPT benzeri teknoloji ürünü hissinden mümkün olduğunca uzak dur.

Ana duygular:

sevgi
aile bağı
güven
uyku öncesi huzuru
çocuğa özel olma hissi
anı biriktirme
masalsılık
sıcaklık
kaliteli ebeveynlik deneyimi

Uygulamanın temel marka vaadini tasarımda hissettir:

“Sen yanında olamasan bile sesin onunla.”

Ancak uygulamanın yalnızca ebeveynin uzakta olduğu durumlar için tasarlanmış gibi görünmesini istemiyorum. Normal günlük kullanım, uyku öncesi rutin ve ebeveyn-çocuk bağı temel kullanım senaryosu olsun.

HEDEF KULLANICI

Birincil kullanıcı uygulamayı kullanan çocuk değil, ebeveyndir.

Temel kullanıcılar:

25–45 yaş arası anne ve babalar.
0–10 yaş arası çocuğu bulunan aileler.
Uyku öncesi hikâye okuyan ebeveynler.
Çocuğuna daha kişisel deneyimler sunmak isteyen ebeveynler.
İş veya seyahat nedeniyle zaman zaman çocuğundan uzak kalan ebeveynler.

Arayüz çocuk uygulaması kadar oyuncak görünmemeli.

Çocukların hoşuna gidecek masalsı unsurlar kullanılabilir fakat uygulamanın kontrolünü yetişkin kullandığı için premium, sade, güvenilir ve modern bir görünümü olmalı.

PLATFORM

Öncelikle iOS ve Android için mobile-first tasarla.

Ana frame yaklaşık 390 x 844 px mobil ekran üzerinden ilerlesin.

iPhone ve modern Android telefonlara rahatça adapte edilebilecek responsive component mantığı kullan.

Safe area, bottom navigation ve erişilebilir dokunma alanlarını dikkate al.

TASARIM YAKLAŞIMI

Modern, sıcak, premium ve duygusal bir tasarım oluştur.

Referans hissi olarak:

modern çocuk kitapları
premium ebeveynlik uygulamaları
sakin uyku uygulamaları
soft editorial illustration
yüksek kaliteli storybook tasarımları

düşünülebilir.

Ancak herhangi bir uygulamayı birebir kopyalama.

Görsel dil özgün olsun.

Aşırı:

neon renkler
yoğun gradient
çok fazla glassmorphism
oyuncak gibi butonlar
karmaşık dashboard
kurumsal SaaS görünümü
ChatGPT benzeri mesajlaşma ekranları

kullanma.

RENK PALETİ

Sıcak ve sakin bir ana palet oluştur.

Örneğin:

warm cream / kırık beyaz ana arka plan
soft lavender
dusty blue
soft peach
sage green
warm coral accent

kullanılabilir.

Ana CTA rengi yeterince kontrastlı ve erişilebilir olsun.

Gece hikâye dinleme ekranlarında ayrıca koyu “night mode” deneyimi tasarla.

Bu mod:

lacivert
gece mavisi
soft purple

tonları kullanabilir.

TYPOGRAPHY

Çok çocukça olmayan fakat sıcak karaktere sahip modern bir font yaklaşımı kullan.

Başlıklarda yumuşak karakterli, hikâye kitabı hissi veren bir typography kullanılabilir.

Body text son derece okunabilir sans-serif olsun.

Minimum mobil okunabilirlik standartlarını koru.

DESIGN SYSTEM OLUŞTUR

Figma dosyasında ayrı bir “Design System” sayfası oluştur.

Şunları tanımla:

Color Variables
Typography Styles
Spacing System
Radius System
Elevation / Shadow
Grid
Iconography
Buttons
Inputs
Selects
Cards
Bottom Sheets
Modals
Navigation
Tabs
Chips
Progress Indicators
Audio Components
Story Cards
Voice Cards
Child Profile Cards
Book Cards
Toast Messages
Empty States
Skeleton Loaders

8pt spacing sistemini kullan.

Butonlar için en az:

Primary
Secondary
Tertiary
Destructive
Disabled
Loading

durumlarını oluştur.

Component variant ve Auto Layout kullan.

Mümkün olduğunca reusable component oluştur.

FIGMA SAYFA YAPISI

Figma dosyasını aşağıdaki ana sayfalara ayır:

00 – Cover
01 – Foundations
02 – Components
03 – Onboarding
04 – Home
05 – Story Creation
06 – Voice Studio
07 – Story Experience
08 – My Library
09 – Book Creation
10 – Print Order
11 – Profile & Family
12 – Subscription
13 – Settings
14 – Empty / Loading / Error States
15 – Prototype Flows

ANA NAVİGASYON

Bottom navigation mümkün olduğunca basit olsun.

4 ana bölüm kullan:

Ana Sayfa
Hikâyelerim
Oluştur
Profil

“Oluştur” ana aksiyon olduğu için navigation içerisinde görsel olarak diğerlerinden biraz daha belirgin olabilir.

Ancak devasa floating button kullanma.

ONBOARDING

Detaylı onboarding akışı tasarla.

EKRAN 1 – SPLASH

Masalım logosu.

Soft animasyon düşüncesi:
küçük yıldızlar / ay / açık kitap illüstrasyonu.

EKRAN 2 – DEĞER ÖNERİSİ

Başlık:

“Her gece ona özel bir hikâye.”

Alt açıklama:

“Yapay zekâ ile çocuğuna özel hikâyeler oluştur, kendi sesinle anlat.”

Hikâye okuyan ebeveyn ve çocuk illüstrasyonu.

CTA:

“Başlayalım”

EKRAN 3

Ana özellik:

“Onun adı, onun hikâyesi.”

Çocuğun adının hikâyede kahraman olarak geçtiği örnek mini kart göster.

EKRAN 4

Ana özellik:

“Sen okumasan da sesin okusun.”

Anne veya babanın ses dalgası + hikâye kitabı görseli.

Anne ve babanın sesinin yapay zekâ tarafından yalnızca izinleri doğrultusunda kullanılacağı açıkça hissettirilsin.

EKRAN 5

Ana özellik:

“Masalı gerçek bir kitaba dönüştür.”

AI illüstrasyonlarla oluşturulan fiziksel çocuk kitabı mockup'ı göster.

HESAP OLUŞTURMA

Apple ile devam et
Google ile devam et
E-posta ile devam et

Misafir kullanım düşüncesi de tasarlanabilir fakat hikâye kaydetme ve ses oluşturma aşamasında hesap gereksinimi gösterilebilir.

ÇOCUK PROFİLİ OLUŞTURMA

Onboarding sonrasında:

“Masalları kimin için hazırlıyoruz?”

ekranı aç.

Alanlar:

Çocuğun adı
Doğum tarihi veya yaşı
İsteğe bağlı profil fotoğrafı
Hitap / tercihler
Sevdiği şeyler

“Sevdiği şeyler” alanında selectable chip örnekleri:

Dinozorlar
Uzay
Hayvanlar
Arabalar
Prensesler
Deniz
Doğa
Robotlar
Futbol
Periler
Macera
Müzik

“Kendim ekle” seçeneği de olsun.

Birden fazla çocuk profili desteklensin.

Ana kullanıcı daha sonra çocuk değiştirebilsin.

ANA SAYFA

Ana sayfa uygulamanın en önemli ekranlarından biri.

Üst bölüm:

“İyi akşamlar, Elif 👋”

ve

“Bu gece hangi masala yolculuk ediyoruz?”

gibi sıcak bir karşılama kullan.

Seçili çocuk profilini header bölümünde küçük avatar + isim ile göster.

Hızlı aksiyon:

“Yeni Hikâye Oluştur”

büyük fakat zarif bir hero card olarak göster.

Hero card içinde masalsı bir AI illustration kullan.

Altına kişiselleştirilmiş öneriler:

“Ege için öneriler”

örnekleri:

Cesur Minik Astronot
Uykuya Küsen Ayıcık
Ormanın En Küçük Kaşifi

Sonrasında:

“Kaldığın yerden devam et”

story card.

Sonrasında:

“En son oluşturdukların”

horizontal carousel.

Sonrasında:

“Bu gece için”

kategorileri:

Uyku
Macera
Öğretici
Duygular
Arkadaşlık
Hayal Gücü

ANA HİKÂYE OLUŞTURMA AKIŞI

Bu ürünün en kritik flow'u budur.

Çok uzun bir form kullanma.

Wizard / step-by-step yaklaşımı kullan.

Toplam yaklaşık 5 kısa adım olsun.

Her adımda ilerleme göstergesi bulunabilir fakat “1/5” gibi mekanik görünmek yerine sade bir progress bar tercih edilebilir.

STEP 1 – HİKÂYE KİMİN İÇİN?

Başlık:

“Bu hikâye kimin için?”

Seçenek:

Ege
Ada
Başka bir çocuk
Genel bir hikâye

Kayıtlı çocuk profilleri kart olarak gösterilsin.

STEP 2 – KAHRAMAN

Başlık:

“Hikâyemizin kahramanı kim?”

Seçenekler:

“Çocuğum kahraman olsun”

ve

“Başka bir kahraman oluştur”

Çocuğum seçildiğinde otomatik olarak:

“Kahraman: Ege”

göster.

Diğer seçenek seçildiğinde:

“Kahramanın adı”

text input aç.

Örn placeholder:

“Örn. Luna”

Altına isteğe bağlı:

Kahraman türü

Çocuk
Hayvan
Fantastik karakter
Robot
Kendi fikrim

STEP 3 – NASIL BİR HİKÂYE?

Görsel kategori kartları kullan.

Macera
Uyku
Arkadaşlık
Cesaret
Hayvanlar
Uzay
Masal
Duygular
Öğretici
Fantastik

Kullanıcı birden fazla seçim yapabilsin.

Alt bölüm:

“Aklında özel bir hikâye mi var?”

Free text alanı:

“Örneğin: Ege uzaya gidip kaybolan küçük bir yıldızı evine döndürsün.”

AI kullanıcı bu alanı doldurmasa da hikâye oluşturabilsin.

STEP 4 – HİKÂYE AYARLARI

Yaş:

0–2
3–5
6–8
9–12

Hikâye uzunluğu:

Kısa – yaklaşık 3 dakika
Orta – yaklaşık 6 dakika
Uzun – yaklaşık 10 dakika

İstenirse gelişmiş ayarlar accordion olarak açılabilsin.

Gelişmiş ayarlar:

Hikâyenin vermesini istediğin mesaj
Öğretici içerik
Yeni kelimeler öğret
Uyku öncesi sakin son
Mizah seviyesi
Fantastik öğe seviyesi

STEP 5 – SES

Başlık:

“Masalı kim anlatsın?”

Voice cards oluştur.

Örnek:

Anne
“Annemin Sesi”
kişisel ses badge'i

Baba
“Babamın Sesi”
kişisel ses badge'i

Luna
“Sakin kadın sesi”
sistem sesi

Atlas
“Sıcak erkek sesi”
sistem sesi

Duru
“Yumuşak masal anlatıcısı”
sistem sesi

Her kartta küçük play butonu ile ses örneği dinlenebilsin.

Henüz anne veya baba sesi oluşturulmamışsa:

“Anne sesini oluştur”

ve

“Baba sesini oluştur”

kartı göster.

Story creation akışını tamamen terk etmeden kullanıcı Voice Studio'ya yönlendirilebilsin ve işlem sonrasında aynı noktaya dönebilsin.

SON ONAY

Kullanıcının seçimlerini özetleyen güzel bir ekran oluştur:

Ege için
Uzay + Macera
6 dakika
Kahraman: Ege
Ses: Anne

CTA:

“Masalımı Oluştur ✨”

Altında küçük açıklama:

“Yaklaşık 20–40 saniye sürebilir.”

Kesin süre garanti ediyor gibi davranma.

AI HİKÂYE OLUŞTURMA EKRANI

Sıradan spinner kullanma.

Masalsı bir loading deneyimi oluştur.

Örneğin açık bir kitabın üzerinde:

“Hikâyenin kahramanı hazırlanıyor…”
“Biraz yıldız tozu ekliyoruz…”
“Masalın son dokunuşları yapılıyor…”

gibi değişen mesajlar kullanılabilir.

Kullanıcı uygulamadan ayrılırsa işlemin arka planda devam edeceğini belirten UX göster.

Hikâye tamamlandığında notification mantığına hazır tasarla.

VOICE STUDIO

Uygulamanın ikinci en kritik alanı.

“Seslerim” ekranı oluştur.

Başlık:

“Ailenden bir ses, her masalda yanında.”

Mevcut ses kartları:

Anne – Hazır
Baba – Hazır

Her kartta:

avatar / kişi ikonu
ses adı
ilişki
oluşturulma tarihi
play test
üç nokta menüsü

Menü:

Sesi Dinle
Adını Değiştir
Yeniden Kaydet
Sil

Alt bölüm:

“Yeni Ses Ekle”

MVP'de anne ve baba öncelikli olsa bile yapıyı ileride büyükanne, büyükbaba veya başka aile üyesine genişletebilecek şekilde tasarla.

SES OLUŞTURMA AKIŞI

Bu süreç kullanıcının güvenini maksimum düzeyde sağlamalı.

SCREEN 1

Başlık:

“Sesini masallara taşı”

Açıklama:

“Kısa bir metni sesli okuyarak sana özel bir anlatıcı sesi oluşturabilirsin.”

Yaklaşık kayıt süresini açıkça göster.

Örn:

“Yaklaşık 60 saniye”

Ayrıca:

“Sessiz bir ortamda kayıt yapmanı öneriyoruz.”

SCREEN 2 – SES SAHİBİ

“Bu ses kime ait?”

Anne
Baba
Diğer

Seçim.

Ses adı:

“Annemin Sesi”

gibi otomatik gelsin ve değiştirilebilsin.

SCREEN 3 – İZİN / CONSENT

Çok önemli.

Kullanıcıya ses klonlamanın ne olduğunu sade şekilde anlat.

Örneğin:

“Kaydettiğin ses örneğini, yalnızca oluşturduğun içerikleri seslendirmek için kullanacağız.”

Checkbox:

“Bu ses bana aittir veya bu sesi kullanmak için açık iznim vardır.”

Checkbox kabul edilmeden devam edilemesin.

“Kayıt ve ses verilerimi istediğim zaman silebilirim.”

linki / bilgi alanı göster.

SCREEN 4 – MİKROFON TESTİ

Microphone permission.

Ses seviyesi göstergesi.

“Mikrofonunu kontrol ediyoruz.”

Background noise indicator düşün.

Uygun:
“Harika, ortam sessiz görünüyor.”

Sorun:
“Biraz arka plan sesi duyuyoruz.”

SCREEN 5 – KAYIT

Kullanıcıya okunacak doğal Türkçe bir metin göster.

Metin yaklaşık 45–90 saniyelik ses örneği sağlamaya uygun olsun.

Metnin tamamı ekrana sığmak zorunda değil.

Kullanıcı okudukça ilerleme takip edilebilsin.

Büyük record / pause kontrolü.

Waveform.

Timer.

Kaydı Bitir.

Kayıt yanlış yapılırsa:

“Baştan Al”

SCREEN 6 – KAYIT KONTROLÜ

Kayıt tamamlandıktan sonra kullanıcı kayıt örneğini dinleyebilsin.

CTA:

“Bu Kaydı Kullan”

Secondary:

“Tekrar Kaydet”

Kullanıcı onaylamadan kayıt işlenmeye başlamasın.

SCREEN 7 – SES OLUŞTURULUYOR

Progress state.

“Sesin hazırlanıyor…”

Kullanıcı ekranı kapatabilsin.

“Hazır olduğunda sana haber vereceğiz.”

SCREEN 8 – SES HAZIR

Başlık:

“Anne'nin sesi hazır 🎉”

Kullanıcının ses örneğini dinleyebilmesi için kısa örnek cümle oynat.

CTA:

“Bu Sesi Kullan”

Secondary:

“Yeniden Oluştur”

Önemli UX gereksinimi:

Kayıt sırasında hata oluşursa kayıt mümkün olduğu sürece kaybolmamalı.

Error state:

“Kaydın güvende.”

“Ses oluşturulurken bir sorun yaşadık.”

CTA:

“Tekrar Dene”

Secondary:

“Daha Sonra Dene”

Kullanıcıyı gereksiz yere tekrar 60 saniyelik metni okumaya zorlama.

HİKÂYE SONUÇ EKRANI

Hikâye oluşturulduğunda cinematic ve duygusal bir sonuç ekranı göster.

Kapak görseli.

Hikâye başlığı:

“Ege ve Kayıp Yıldız”

Altında:

“Ege için hazırlandı”

6 dk
Anne'nin sesi

Ana CTA:

“Dinlemeye Başla”

İkincil aksiyonlar:

Oku
Düzenle
Görselleştir
Kitap Yap
Paylaş

HİKÂYE DİNLEME EKRANI

Premium audio player tasarla.

Night mode öncelikli.

Büyük kapak illustration.

Başlık.

Narrator:

“Anne'nin sesiyle”

Audio controls:

15 sn geri
play / pause
15 sn ileri

progress slider

Geçen süre / kalan süre.

Playback speed:

0.8x
1x
1.2x

Sleep timer.

Alt bölüm:

“Metni göster”

Hikâye okunurken mevcut paragraf vurgulanabilir.

Ekran çok sakin olmalı.

Çocuğun gece kullanabileceği için gereksiz CTA ve bildirim gösterme.

HİKÂYE OKUMA MODU

Digital storybook deneyimi.

Her page / spread:

üst bölümde illustration
alt bölümde kısa hikâye metni

Swipe ile sonraki sayfa.

İsteğe bağlı:

“Sesli Oku”

Audio devam ederken ilgili sayfaya otomatik geçiş.

AI İLLÜSTRASYON OLUŞTURMA

Hikâye metni hazırlandıktan sonra:

“Masalını resimlendirelim mi?”

ekranı.

3–5 style card oluştur.

Örneğin:

Suluboya
Yumuşak 3D
Klasik Masal
Pastel
El Çizimi

Style card'larda gerçek örnek thumbnail göster.

CTA:

“Görselleri Oluştur”

Önemli:

Kitabın tüm sayfalarında kahramanın görünümü mümkün olduğunca tutarlı olacak şekilde ürün UX'i kurgula.

İllüstrasyon oluşturulurken:

Kapak
Sayfa 1
Sayfa 2
...

şeklinde üretim progress'i göster.

Görsel oluşturma tamamlandığında kitap editörüne geç.

BOOK BUILDER

Kullanıcının oluşturduğu hikâyeyi fiziksel kitaba dönüştürmek için premium ama basit bir editor tasarla.

Üst başlık:

“Ege'nin Kitabı”

Page thumbnails horizontal veya bottom strip şeklinde olabilir.

Ana canvas içinde mevcut sayfa.

Her sayfada:

illustration
hikâye metni

Kullanıcının temel değişiklikleri yapabilmesini sağla:

Görseli Yeniden Oluştur
Farklı Görsel Seç
Metni Düzenle

İleri düzey profesyonel layout editor oluşturma.

Canva gibi karmaşık hale getirme.

Kullanıcı için mümkün olduğunca otomatik olsun.

KAPAK TASARIMI

Kitap baskısından önce ayrı bir cover customization ekranı.

Kapak:

AI illustration
kitap başlığı
çocuğun adı

Örnek:

“Ege ve Kayıp Yıldız”

Alt başlık:

“Ege için özel olarak hazırlandı”

İsteğe bağlı:

“Anne ve babasından sevgiyle.”

Arka kapak için kısa AI description oluşturulabilir.

KİTAP ÖNİZLEME

Gerçek fiziksel kitap mockup deneyimi oluştur.

Kapak
arka kapak
sayfalar

3D hissi hafif şekilde kullanılabilir.

CTA:

“Kitabı Bastır”

FİZİKSEL KİTAP SİPARİŞİ

E-commerce checkout akışı tasarla.

PRODUCT CONFIGURATION

Kitap boyutu:

Kare
Standart

Kapak:

Sert Kapak
Yumuşak Kapak

Adet seçimi.

Fiyat.

Tahmini teslimat.

CTA:

“Devam Et”

ADDRESS

Ad Soyad
Telefon
Adres
İl
İlçe
Posta kodu

Türkiye adres yapısına uygun tasarla.

Ödeme ekranına hazır tasarım oluştur ancak belirli ödeme sağlayıcısına bağımlı görünmesin.

ORDER REVIEW

Ürün
adet
kitap özellikleri
teslimat adresi
kargo
toplam fiyat

CTA:

“Ödemeyi Tamamla”

ORDER SUCCESS

Kitabın 3D mockup'ı.

Başlık:

“Ege'nin masalı yola çıkmaya hazırlanıyor 💛”

Sipariş numarası.

“Siparişimi Takip Et”

CTA.

HİKÂYELERİM / KÜTÜPHANE

Kullanıcının tüm oluşturduğu hikâyeler burada olsun.

Tabs veya filter:

Tümü
Sesli
Kitaplar
Favoriler

Search.

Sort.

Story cards:

cover
title
child
duration
narrator
created date

Card üzerinde küçük badges:

“Anne'nin sesi”
“Kitap hazır”

Story detail options:

Dinle
Oku
Düzenle
Yeni Sesle Oluştur
Kitap Yap
Kopyasını Oluştur
Sil

HİKÂYEYİ YENİ SESLE SESLENDİRME

Önemli kullanım senaryosu.

Kullanıcı daha önce sistem sesiyle oluşturduğu hikâyeyi sonradan anne sesiyle tekrar oluşturabilsin.

“Hikâyeyi Seslendir”

ekranında:

Anne
Baba
AI sesleri

seçimi.

Mevcut hikâye yeniden yazılmasın.

Yalnızca narration yeniden oluşturulsun.

PROFİL & AİLE

Profil ekranı.

Sections:

Çocuklarım
Seslerimiz
Siparişlerim
Aboneliğim
Ayarlar

Çocuk profilleri.

“Çocuk Ekle”

Bir ailede birden fazla çocuk desteklensin.

Çocuk detayında:

isim
yaş
ilgi alanları
hikâye sayısı
en sevdiği hikâyeler

gösterilebilir.

SUBSCRIPTION / PREMIUM

Monetization'a hazır tasarla.

Ancak uygulamanın değerini kullanıcı denemeden agresif paywall gösterme.

Örnek model:

Ücretsiz

sınırlı aylık hikâye
sistem sesleri
sınırlı AI görsel

Premium

daha fazla / sınırsız hikâye
anne-baba sesleri
premium AI sesleri
daha fazla illustration
HD kitap görselleri
özel kitap indirimi gibi avantajlar

Pricing ekranı tasarla.

Monthly / Yearly toggle.

Yıllık planı “En Avantajlı” olarak gösterebilirsin.

Ancak fiyatları placeholder olarak kullan:

₺XXX / ay

Çünkü fiyatlar daha sonra belirlenecek.

Kritik UX:

Kullanıcı anne/baba ses kayıt sürecine başlamadan önce bu özelliğin Premium olduğunu biliyor olmalı.

60 saniye boyunca ses kaydedip işlemin sonunda sürpriz şekilde paywall görmemeli.

Alternatif olarak ücretsiz kullanıcı sesini oluşturup kısa bir preview dinleyebilir, kullanmaya başlamadan önce Premium'a geçebilir.

Bu akışı tasarımda açık şekilde göster.

PRIVACY & TRUST

Ses klonlama uygulamanın hassas alanıdır.

Settings içerisinde:

“Ses Verilerim”

bölümü oluştur.

Burada kullanıcı:

Anne sesini silebilir
Baba sesini silebilir
Ses kaydını yenileyebilir

“Sesimi Sil”

aksiyonu destructive style + confirmation modal kullansın.

Açıklama:

“Bu ses profilini sildiğinde yeni hikâyelerde kullanılamaz.”

Ayrıca:

Gizlilik Politikası
Kullanım Koşulları
AI İçerik Bilgilendirmesi
Çocuk Güvenliği

alanları tasarla.

Çocuğun kişisel bilgilerinin gereksiz yere gösterilmemesine dikkat et.

AI CONTENT SAFETY

Uygulamanın arayüzü AI tarafından çocuk yaşına uygun içerik üretildiği konusunda ebeveyne güven vermeli.

Hikâye oluşturma ekranında küçük bir bilgi:

“Masallar seçtiğin yaş grubuna uygun şekilde hazırlanır.”

AI'ın uygunsuz içerik oluşturma ihtimali için UX düşün.

Örneğin kullanıcının prompt'u çocuk için uygun değilse:

“Bu konuyla çocuklara uygun bir hikâye oluşturamıyoruz. İstersen fikri birlikte değiştirebiliriz.”

gibi nazik error state.

SYSTEM VOICES

AI sesleri için bir Voice Marketplace gibi karmaşık sistem yapma.

Başlangıçta 6–8 kaliteli ses yeterli.

Kategoriler:

Sakin
Neşeli
Masalsı
Enerjik

Her ses kartında:

isim
kısa açıklama
play preview

örneği olsun.

Örnek:

Duru
“Yumuşak ve sakin”

Atlas
“Sıcak ve güven veren”

Luna
“Masalsı ve huzurlu”

AI ASİSTAN DAVRANIŞI

Uygulama kullanıcının boş sayfa problemi yaşamasını engellemeli.

Hikâye oluşturma ekranında AI kullanıcının yerine öneriler sunsun.

Örneğin:

“Ege uzay maceralarını seviyor. Onu küçük bir astronot yapalım mı?”

Suggestion chips:

“Uzaya gitsin”
“Dinozorlarla tanışsın”
“Denizaltı keşfine çıksın”

Kullanıcı tek dokunuşla seçim yapabilsin.

Fakat uygulamayı chatbot haline getirme.

AI arka planda çalışan yaratıcı yardımcı olarak hissedilsin.

EMPTY STATES

Tüm önemli empty state'leri tasarla.

Henüz hikâye yok:

“İlk masalın burada yaşayacak.”

CTA:
“İlk Hikâyemi Oluştur”

Henüz ses yok:

“Masallar henüz senin sesini tanımıyor.”

CTA:
“Sesimi Oluştur”

Henüz kitap yok:

“Bir hikâyeyi ömür boyu saklanacak bir kitaba dönüştür.”

CTA:
“Bir Hikâye Seç”

LOADING STATES

Story generation
Audio generation
Voice cloning
Illustration generation
Book generation
Checkout

için ayrı loading state'ler tasarla.

Skeleton kullanılması gereken yerlerde skeleton kullan.

ERROR STATES

Internet unavailable
Story generation failed
Voice processing failed
Illustration failed
Payment failed
Address validation
Microphone permission denied
Microphone quality poor
Voice recording too short
AI generation timeout

durumlarını tasarla.

Error mesajları teknik olmayacak.

Örnek:

“Masal hazırlanırken küçük bir aksilik oldu.”

CTA:

“Tekrar Dene”

Kullanıcının önceden girdiği bilgiler kaybolmamalı.

MICROINTERACTIONS

Prototype için önemli microinteraction'lar düşün:

Story card tap
Play / pause
Voice preview
Recording waveform
Story generation
Page turning
Book cover opening
Favourite
Child switching
Bottom sheet
Toast confirmation

Animasyonlar yumuşak ve sakin olsun.

Fazla hareketli çocuk uygulaması efektlerinden kaçın.

ACCESSIBILITY

WCAG uyumlu kontrast sağlamaya çalış.

Sadece renk ile durum belirtme.

Minimum 44x44 touch target.

Dynamic type'a uygun layout düşün.

Audio içeriği için metin versiyonu her zaman erişilebilir olsun.

Fontları çok küçük kullanma.

Türkçe karakter desteği tüm fontlarda bulunmalı.

CONTENT DESIGN

UI metinlerinin tamamını gerçek Türkçe içeriklerle oluştur.

Lorem ipsum kullanma.

Metin tonu:

samimi
sakin
ebeveyn odaklı
güven veren
kısa
duygusal ama abartısız

Örneğin:

Kötü:
“AI generation process initiated.”

İyi:
“Masalın hazırlanıyor ✨”

Kötü:
“Voice cloning successful.”

İyi:
“Sesin hazır. Artık masalları sen anlatabilirsin.”

ILLUSTRATION DIRECTION

Uygulama içinde kullanılacak illüstrasyonlar tutarlı bir sanat yönetimine sahip olsun.

Soft editorial children's book illustration.

Sıcak ışık.

Yumuşak dokular.

Yüksek kaliteli modern çocuk kitabı görünümü.

Karakterler sevimli olsun fakat aşırı 3D oyuncak karakter görünümünden kaçınılabilir.

UI icon ve story illustration stillerini birbirine karıştırma.

Story illustrations içerik alanında güçlü olabilir.

UI itself sade kalmalı.

ANA PROTOTYPE FLOW'LARI

Prototype sekmesinde en az aşağıdaki akışları birbirine bağla:

FLOW A

Splash
→ Onboarding
→ Account
→ Child Profile
→ Home

FLOW B

Home
→ Yeni Hikâye
→ Çocuk
→ Kahraman
→ Tema
→ Hikâye Ayarları
→ Ses
→ Oluştur
→ Loading
→ Story Result
→ Listen

FLOW C

Story Creation
→ Ses seç
→ “Anne Sesini Oluştur”
→ Voice Consent
→ Mic Test
→ Recording
→ Recording Review
→ Processing
→ Voice Ready
→ Story Creation'a geri dön
→ Anne sesini seç

FLOW D

Library
→ Story
→ Görselleştir
→ Illustration Style
→ Generate
→ Book Builder
→ Cover
→ Book Preview

FLOW E

Book Preview
→ Kitabı Bastır
→ Product Configuration
→ Address
→ Payment
→ Order Review
→ Success

FLOW F

Profile
→ Seslerim
→ Anne
→ Sil
→ Confirmation
→ Voice Removed

KRİTİK EKRANLAR İÇİN HIGH-FIDELITY TASARIM

Özellikle aşağıdaki ekranların çok yüksek görsel kalitede hazırlanmasını istiyorum:

Home
Story Creation – Theme
Story Creation – Voice
Voice Recording
Voice Ready
Story Result
Night Audio Player
Story Book Reader
Illustration Style
Book Builder
Physical Book Preview
Checkout
Library
Profile / Family

Bu ekranları uygulamanın App Store / Google Play ekran görüntülerinde kullanılabilecek kadar estetik tasarla.

FİGMA COMPONENT YAPISI

Reusable components isimlerini sistematik oluştur.

Örneğin:

Button/Primary/Default
Button/Primary/Loading
Button/Secondary/Default

Card/Story/Vertical
Card/Story/Horizontal

Card/Voice/Parent
Card/Voice/System

Input/Text/Default
Input/Text/Focused
Input/Text/Error

Chip/Theme/Default
Chip/Theme/Selected

Player/Full
Player/Mini

Navigation/Bottom

Modal/Confirmation

Toast/Success
Toast/Error

Component properties ve variants kullan.

AUTO LAYOUT

Tüm ana component ve ekranlarda Auto Layout kullan.

Elle konumlandırılmış ve responsive olmayan layer'lardan mümkün olduğunca kaçın.

Spacing tutarlı olsun.

DEVELOPER HANDOFF

Bu tasarım daha sonra Claude Code kullanılarak gerçek uygulamaya dönüştürülecek.

Bu nedenle tasarım yalnızca güzel görünmemeli; uygulanabilir ve sistematik olmalı.

Claude Code'un ekranları rahat anlayabilmesi için:

Frame isimlerini açık yaz.
Component isimlerini sistematik kullan.
Layer isimlerini “Rectangle 3284” gibi bırakma.
Sections kullan.
Her ana flow'u isimlendir.
Component state'lerini tanımla.
Design tokens kullan.
Spacing tutarlı olsun.
Gerçekçi placeholder data kullan.
Prototype navigation oluştur.
Screen state'lerini ayrı frame olarak göster.

Örneğin:

StoryCreation/01-Child
StoryCreation/02-Hero
StoryCreation/03-Theme
StoryCreation/04-Settings
StoryCreation/05-Voice
StoryCreation/06-Summary
StoryCreation/07-Generating

Voice/01-Intro
Voice/02-Owner
Voice/03-Consent
Voice/04-MicTest
Voice/05-Recording
Voice/06-Review
Voice/07-Processing
Voice/08-Success
Voice/09-Error

şeklinde isimlendirme kullan.

MVP VE GELECEK VERSİYON AYRIMI

Tasarım sistemi gelecek fonksiyonlara hazır olsun fakat ana UX'i gereksiz karmaşıklaştırma.

MVP'nin ana fonksiyonları:

AI hikâye oluşturma
çocuk profili
kahraman kişiselleştirme
anne sesi
baba sesi
AI sistem sesleri
story audio player
story library
AI illustrations
digital storybook
physical book preparation
physical book ordering
subscription
profile / settings

Gelecek sürümlerde eklenebilecek ancak ana navigation'a şimdilik koyulmaması gereken özellikler:

Büyükanne / büyükbaba sesi
Aile üyeleriyle hikâye paylaşma
Bir hikâyede birden fazla farklı ses
AI ile çocuğa soru-cevap
Hikâye sonunda mini quiz
Eğitici flashcards
Fiziksel kitap tarayıp aile sesiyle okutma
Hikâye serileri
Çocuğun ilerleme / okuma takibi

Bu özellikler için altyapının genişleyebilir olduğunu hissettir ancak MVP ekranlarını kalabalıklaştırma.

ÜRÜNÜN EN ÖNEMLİ UX PRENSİPLERİ

1. Kullanıcı mümkün olan en az eforla kaliteli bir hikâye oluşturabilmeli.

2. AI karmaşıklığı kullanıcıya gösterilmemeli.

3. Anne/baba sesi uygulamanın en değerli ve duygusal özelliklerinden biri olarak konumlandırılmalı.

4. Ses kaydı başladıktan sonra kullanıcının emeği mümkün olduğunca kaybolmamalı.

5. Premium özellikler sürpriz ödeme duvarıyla karşılaşılacak şekilde tasarlanmamalı.

6. Hikâye oluşturmak birkaç dakikalık form doldurma deneyimine dönüşmemeli.

7. Kişiselleştirme güçlü olmalı fakat varsayılan seçeneklerle kullanıcı çok hızlı ilerleyebilmeli.

8. Çocuk profili sayesinde her seferinde yaş, isim ve temel tercihler tekrar sorulmamalı.

9. Hikâye → Seslendirme → Görselleştirme → Dijital Kitap → Fiziksel Kitap süreci tek bir bütünün parçaları gibi hissettirmeli.

10. Kullanıcının oluşturduğu içerik değerli bir aile hatırası hissi vermeli.

11. Uygulamanın UI'si çocuksu değil, çocuk dünyasına uygun premium ebeveyn ürünü gibi görünmeli.

12. Ana aksiyonlar ilk bakışta anlaşılmalı.

13. Kullanıcıya aynı ekranda çok fazla seçenek göstermemeli; progressive disclosure kullanılmalı.

14. Her AI üretim işleminde kullanıcı ne olduğunu ve sonucunu açıkça anlamalı.

15. Kullanıcı oluşturduğu hikâyeyi ve sesleri üzerinde kontrol sahibi olduğunu hissetmeli.

SON ÇIKTI

Bu gereksinimlere göre uygulamanın eksiksiz UX/UI tasarımını oluştur.

Önce information architecture ve design system oluştur.

Daha sonra ana ekranları tasarla.

Ardından kritik kullanıcı akışlarını high-fidelity seviyeye getir.

Son olarak prototype bağlantılarını oluştur.

Sadece birkaç konsept ekran oluşturma.

Ürünün gerçek anlamda geliştirilebilmesi için gerekli tüm ana ekranları, durumları, componentleri ve akışları tasarla.

Her ekran bir önceki ve sonraki ekranla mantıksal olarak ilişkili olsun.

Tüm uygulama tek ve tutarlı bir design system kullansın.

Sonuç; modern, güven veren, duygusal, premium, aile odaklı, masalsı ve gerçek bir startup ürünü seviyesinde görünmeli.