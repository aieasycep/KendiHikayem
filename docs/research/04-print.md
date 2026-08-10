# Araştırma — Baskı, POD ve PDF Üretimi

> Ağustos 2026. Kaynak URL'leri metin içinde.

---

# Fiziksel Kitaba Dönüştürme Araştırması (Ağustos 2026)

> **Metodoloji notu / güven seviyesi:** Bu oturumda WebFetch büyük ölçüde egress proxy tarafından bloke edildi (`lulu.com`, `developers.lulu.com`, `api.lulu.com`, `gelato.com`, `dashboard.gelato.com`, `cloudprinter.com`, `docs.cloudprinter.com`, `rpiprint.com`, ve tüm Türk matbaa siteleri bloke). Sadece `github.com` erişilebildi. Bu yüzden aşağıdaki bilgilerin çoğu **arama motoru snippet'lerinden** derlendi; birincil kaynak sayfaları doğrudan okunamadı. **Fiyat ve API detaylarının hiçbirini uydurmadım** — doğrulanmayanları açıkça işaretledim. Lulu/Gelato entegrasyonuna gerçekten başlamadan önce her sayısal değerin resmi dokümandan teyidi şart.

---

## 1) Print-on-Demand API'leri

### Karşılaştırma özeti

| Servis | API | Min. sayfa (renkli/ciltli) | TR'ye durum | Ücret modeli |
|---|---|---|---|---|
| **Lulu Print API** | Var, olgun, ücretsiz | Hardcover casewrap **24**; paperback **32**; saddle stitch **4–48** (4'ün katı) | "tüm ülkelere" iddiası — **doğrulanmadı** | Sadece baskı + kargo, servis ücreti yok |
| **Gelato** | Var (v3 REST) | Hardcover photo book **30–200**; children's books 7 format, ≤200 sayfa | **Türkiye üretim ülkesi listesinde** (kitap dahil mi? **doğrulanmadı**) | Baskı + kargo; Gelato+ abonelik opsiyonel |
| **Cloudprinter.com** | Var (REST/JSON) | Ürün şablonuna göre | **Türkiye'de lokal üretim var, kitap dahil** (kendi pazarlama sayfası) | Sabit fiyat listesi yok, API'den quote |
| **Peecho** | Var (REST, ücretsiz) | Hardcover **24**; softcover **24** (150gsm gloss) / **20** (160gsm Mohawk) | AB üretim; "rest of world 10+ iş günü" | Baskı + kargo |
| **Prodigi (ex-Pwinty)** | Var | Layflat photo book **18–122** | Dünya geneli dropship | Baskı + kargo |
| **Blurb / RPI** | Var (`docs.api.rpiprint.com`) | Doğrulanmadı | ABD merkezli, TR **doğrulanmadı** | Doğrulanmadı |
| **Printful** | Var ama **kitap ürünü yok** | — | — | — |

### Lulu — en somut bilgiler

**API mimarisi** (GitHub'daki üçüncü parti istemcilerden doğrulandı):
- OAuth2 **client credentials** akışı (`LULU_CLIENT_KEY` / `LULU_CLIENT_SECRET`)
- Sandbox: `https://api.sandbox.lulu.com` (sandbox işleri üretime düşmez), portal `https://developers.sandbox.lulu.com/`
- Uçlar: `print-jobs` (create/list/get/cancel), **`print-job-cost-calculations`**, `shipping-options`, **`validate-interior`**, **`validate-cover`**, **`cover-dimensions`**, webhooks (CRUD + test + submission geçmişi)
- `validate-*` sonuçları: `VALIDATED` / `NORMALIZED` (payload'da `pod_package_id` varsa) / `ERROR`
- Kargo seviyeleri: `MAIL`, `PRIORITY_MAIL`, `GROUND`, `EXPEDITED`, `EXPRESS`

**`pod_package_id` — 27 karakterlik SKU.** Yapı: trim + ink + quality + binding + paper + PPI + finish + linen + foil. GitHub'daki gerçek örnekler:
```
0850X1100BWSTDLW060UW444MNG   8.5"x11" B&W standard linen wrap
0600X0900FCSTDPB080CW444GXX   6"x9" full color paperback
0700X1000FCPRECO060UC444MXX   7"x10" full color premium, coil
0550X0850BWSTDPB060UW444GXX   5.5"x8.5" B&W standard paperback
```
Lulu'nun **31 Mart 2026'da "Dotted" formata** geçtiği belirtiliyor: `[Trim].[Ink].[Quality].[Binding].[Paper].[Finish]` — snippet'ten alındı, **birincil kaynaktan doğrulanmadı**, entegrasyondan önce mutlaka kontrol edilmeli (bu bizi doğrudan etkiler).

**Dosya gereksinimleri (bizim için en kritik kısım):**
- **Bleed: 0.125 in (3.175 mm)** her kenarda
- **Safe margin: 0.25 in** — ama **hardcover casewrap için 0.75 in (≈19 mm)**. Bu ciddi bir tasarım kısıtı: kapak görselinin kenarlarında 19 mm'lik "kurban alan" gerekiyor.
- **300 ppi optimum**, 600 ppi tavan
- **Renk: sRGB tercih ediliyor** — Lulu kendi "rich CMYK"e çeviriyor. CMYK gönderirsen CMYK kalması öneriliyor. **→ MVP'de CMYK dönüşümü yapmamıza gerek yok.**
- **Kesim/bleed işaretleri KOYMA**, şifre/security koyma
- **Spine formülü:** softcover perfect bound = `(sayfa / 444) + 0.06"`; dergi/çizgi roman kağıdı (460 PPI) = `(sayfa / 460) + 0.06"`; hardcover linen için tablo. **Ama en doğrusu `cover-dimensions` endpoint'ini çağırmak** — sayfa sayısını verip kapak genişlik/yüksekliğini print-point cinsinden geri alıyorsun. Kendi formülünü yazma.

**Üretim tesisleri:** ABD, Kanada, İngiltere, Fransa, Avustralya, Hindistan. Sipariş, adrese en yakın tesise otomatik yönleniyor. **Türkiye'ye en yakın: Fransa/İngiltere.**

**Türkiye'ye gönderim:** "Lulu şu anda tüm ülkelere teslimat yapabiliyor" ve Türkiye'nin "Euro Non-EU" bölgesinde listelendiği yönünde snippet var — **doğrulanmadı**, `help.lulu.com` erişilemedi. Gerçek doğrulama yolu: sandbox'ta `shipping-options` endpoint'ine `country_code: TR` ile istek atmak. Bu 10 dakikalık bir iş ve kesin cevap veriyor.

### Gelato

- **32–33 ülkede lokal üretim, 100–150+ partner. Türkiye üretim ülkeleri arasında.** Türkiye'de üretilen ürünler arasında **"photo books"** sayılıyor (`globe.gelato.com/en-US/print-in/turkey/` snippet'i) — ama sayfa açılamadı, **kitabın gerçekten TR'de basıldığı DOĞRULANMADI**. Gelato'nun kendisi "hangi ürün hangi ülkede lokal üretiliyor için katalog'a bakın" diyor, yani ürün-ülke matrisi değişken.
- **Bu doğrulanırsa Gelato tek başına en iyi seçenek olur:** API + Türkiye içi üretim + Türkiye içi kargo = gümrük yok, 2-5 gün teslim.
- API: `POST https://order.gelatoapis.com/v3/orders`, katalog `POST https://product.gelatoapis.com/v3/catalogs/{catalogUid}/products:search`. Photo book gibi çok-print-area'lı ürünlerde **tek bir çok sayfalı PDF** verilebiliyor.
- **Dosya gereksinimleri: PDF/X-4, sRGB + CMYK nesneleri destekli, output intent GRACoL 2006, 4 mm bleed, 4 mm safe area** (wire-o'da cilt tarafı 12 mm), fontlar embed/outline, min 7 pt. → Lulu'dan farklı: burada **gerçekten PDF/X-4 isteniyor.**
- Hardcover photo book: **30–200 iç sayfa**, 170 gsm silk. Children's books ürünü: 7 format, hardcover/softcover, ≤200 sayfa. Photo book UID'leri Eylül 2024'te değişti; eski UID'ler API'den hâlâ sipariş edilebiliyor.

### Cloudprinter.com — Türkiye açısından en ilgi çekici

- 380+ baskı sağlayıcı / 104 ülke. **Türkiye sayfası açıkça "books on demand dahil tüm ürün yelpazesi, aynı gün üretim" diyor.**
- Hardcover SLA: 2 iş günü. 5000+ önceden yapılandırılmış ürün şablonu, 40+ canlı üretim sinyali (webhook).
- **Sabit fiyat listesi yok** — "170+ partner dünyaya yayılmış, fiyat ülke/ürün/adet/opsiyon/kargo/servis seviyesine göre" — API'den anlık quote alınıyor.
- **Aksiyon: sales@ ile iletişime geçip "Türkiye'de üretilen, 24-32 sayfa, 20x20 sert kapak çocuk kitabı, 1 adet" için gerçek quote iste.** Bu, tüm araştırmadaki en yüksek getirili tek hamle.

### 12 sayfalık çocuk kitabı sorunu — çözüldü

**Hiçbir POD 12 sayfa basmıyor.** Ama bu gerçek bir problem değil:

- 12 **hikâye sahnesi** = 12 tam sayfa görsel + karşı sayfalarda metin/görsel → **24 basılı sayfa**. Bu Lulu hardcover casewrap minimumu (24) ile tam örtüşüyor.
- Ya da: 12 sahne = 12 **spread** (çift sayfa) = 24 sayfa. Çocuk kitabı için doğal olan da bu.
- Standart hedefler: **24 sayfa** (Lulu hardcover, Peecho hardcover), **32 sayfa** (Gelato hardcover min 30 → 32'ye yuvarla; klasik picture book standardı zaten 32), **saddle stitch için 4'ün katı, ≤48** (Lulu).
- **Öneri: içeriği 24 veya 32 sayfaya sabitle** (kapak içi + künye + ithaf sayfası + son sayfa ile doldur). Bu tek karar, tüm POD sağlayıcılarını aynı anda açar.

---

## 2) Türkiye'deki dijital matbaalar

### Gerçek durum: API yok

Aradığım hiçbir Türk matbaasında **public REST API bulamadım**. Türk POD oyuncuları (`printiturk.com`, `printondemandtr.com.tr`, `dorukbaski.com`) e-ticaret entegrasyonlarından bahsediyor ama Printiturk özelinde bile "entegrasyon eksiklikleri nedeniyle siparişleri manuel senkronize etmeniz gerekebilir" deniyor. Meteksan Dijital 2014'ten beri B2B/B2C POD altyapısı işletiyor (sınav kitapçıkları) — kurumsal görüşmeye açık olabilir.

### Tek adetten basanlar

| Firma | Not |
|---|---|
| **Kitap72.com** | "1 adetten kitap bastırma", online fiyat hesaplama, **5 iş günü**, ciltli/karton kapak/spiral |
| **kitapbastir.com** | Online matbaa, dosya hazırlama/teknik özellikler sayfası var |
| **Best Reklam (print.bestreklam.com.tr)** | "Kişiye özel ve az adetli kitap basımı", 25 yıllık dijital baskı |
| **Önka Matbaa** | Sert kapak + şömiz; **ama sert kapakta bazı matbaalarda min 150 adet** uyarısı var |
| Print90, Baskı Adam, Matbaafix, Baskimo, Can Dijital, İmak Ofset | Online hesaplayıcılı dijital matbaalar |

⚠️ **Kritik uyarı:** Türkiye'de **tek adet SERT KAPAK** kritik darboğaz. Amerikan cilt (PUR) tek adetten yapılıyor, sert kapak ciltleme çoğu geleneksel matbaada elle/az adette pahalı, bazılarında min 150 adet.

### Asıl doğru partner: fotokitap üreticileri

**Bunlar zaten tam olarak bizim ihtiyacımız olan işi yapıyor:** tek adet, sert kapak, layflat cilt, 170 gr mat kuşe, otomatik ciltleme hattı, 3–7 iş günü.

- **kitapfabrikasi.com** — "Türkiye'nin en gelişmiş foto kitap sitesi", program indirmeden online editör
- **netbaski.com** — sert kapak fotokitap
- **momeprint.com** (Mome)
- **fotobaskisepeti.com** — 20x20, 7 iş günü
- **sevgilikitabi.com** — 20x20 / 30x30 kare, sert kapak, özel kutu, ~3 iş günü kargolama
- **fotobaskici.com**, **photobook.com.tr** (fiyat listesi yayınlıyor), Fujifilm Türkiye (Trendyol'da 20x20 sert kapak fotokitap satıyor)

**Bunlarda "toplu sipariş / özel fiyat" kanalı var** (ör. fotobaskisepeti: "sayfa sayısı 10'dan az veya 50'den fazlaysa özel fiyat alınız"). Beyaz etiket/fason anlaşması için doğal muhataplar.

### Fiyatlar (TL) — hepsi gösterge, kesin değil

- **Rakip perakende fiyatı (en değerli veri):** Benim Masalım — **Premium Sert Kapak 1.099 TL'den, Ekonomik 699 TL'den**, 170 gr kuşe, ücretsiz ön izleme, **2-3 gün ücretsiz kargo** (→ Türkiye içi üretim yaptıkları neredeyse kesin). Diğer rakipler: Mibooko, Hediye Çizgiler, kitapbasimi.com.
- 100 adet dijital baskı: 8.000–15.000 TL (sayfa/renk'e göre) → adet başı 80–150 TL, ama bu roman formatı, kuşe/sert kapak değil.
- 500 adet, roman ebadı (13,5×19,5): ~14.500 TL'den (Mayıs 2026)
- 20x20, 30 sayfa fotokitap: 2.500–5.000 TL (2026) — bu rakam bir düğün albümü blogundan geliyor, **premium segment, gösterge olarak şüpheli yüksek**
- Kuşe kağıt, standart Enzo'ya göre yaklaşık **%40 daha pahalı**; renkli baskı S/B'ye göre **3-4 kat**; sert kapak en pahalı ciltleme

**Gerçek maliyeti öğrenmenin tek yolu:** 3-4 fotokitap üreticisine + Kitap72'ye + Cloudprinter'a aynı brief'i yollamak (20x20 veya 21x21 kare, 24 sayfa, 170 gr mat kuşe iç, sert kapak mat selefon, 1 adet, aylık ~X adet öngörüsü).

### Gümrük — yurtdışı POD'u kurtaran madde

- 30 EUR muafiyeti kaldırıldı, Resmî Gazete'de yayımlandı, **6 Şubat 2026'da yürürlüğe girdi**. Artık 1 EUR'luk gönderi bile vergiye tabi.
- **AMA:** Ticaret Bakanlığı'na göre "posta/hızlı kargo ile gelen, ticari miktar ve mahiyet arz etmeyen, **kişisel kullanıma mahsus kitap veya benzeri basılı yayın**" için **1.500 EUR'ya kadar %0** vergi devam ediyor.
- ⚠️ **Risk:** "ticari mahiyet arz etmeyen" ifadesi. Biz ticari bir satıcı olarak yurtdışından B2C gönderi yaparsak bu muafiyetin uygulanıp uygulanmayacağı **belirsiz**. Gümrük müşavirine sorulması gereken bir soru. Yanlış varsayım, birim başına yüzlerce TL sürpriz maliyet demek.
- Ayrıca yurtdışı POD'da teslim süresi 7–15 gün ve iade/hasar yönetimi zor. **Rakip 2-3 günde teslim ediyor.**

---

## 3) Baskıya hazır PDF üretimi (Node/TS)

### Önce en önemli bulgu

**Lulu sRGB kabul ediyor ve kendisi "rich CMYK"e çeviriyor.** Yani **MVP'de CMYK/PDF-X pipeline'ı kurmanıza gerek yok.** İhtiyacınız olan tek şey: doğru trim boyutu + 3.175 mm bleed + 300 DPI + gömülü font + kesim işareti yok.

CMYK/PDF-X gerekliliği yalnızca (a) **Gelato** (PDF/X-4 + GRACoL 2006 output intent, 4 mm bleed) ve (b) **Türk matbaalar** (CMYK, 300 DPI, 3-5 mm taşma, PDF/X-1a:2001 veya PDF/X-3, fontlar outline/embed) için geçerli.

### Kütüphane değerlendirmesi

| Araç | CMYK | PDF/X | Page box'lar | Verdict |
|---|---|---|---|---|
| **pdf-lib** | ❌ Yok | ❌ Yok | ✅ `setMediaBox/setCropBox/setBleedBox/setTrimBox/setArtBox` | Ana üretici olarak **hayır**; **post-processing için evet** |
| **PDFKit** | ⚠️ `fillColor([c,m,y,k])` dizi desteği var | ❌ Output intent/PDF-X yok | Kısmen | Programatik çizim için ok, tam PDF/X için yetersiz |
| **Puppeteer/Chrome** | ❌ Sadece RGB | ❌ | ❌ Trim/Bleed box yazmıyor | **CSS layout kalitesi en iyi**; box + renk için post-process şart |
| **Paged.js** | — | — | — | CSS Paged Media polyfill, CLI'ı Puppeteer ile PDF üretiyor. **Puppeteer ile birlikte tavsiye** |
| **Vivliostyle** | — | — | — | Flexbox/clip-path desteklemiyor → görsel-ağırlıklı çocuk kitabı için riskli |
| **WeasyPrint** | ❌ | ❌ | — | Python; PDF/X yok |
| **Prince XML** | ✅ | Kısmen | ✅ | Güçlü CSS Paged Media, ticari |
| **PDFreactor** | ✅ CMYK dönüşümü + spot renk | ✅ **X-1a:2001/2003, X-3:2002/2003, X-4, X-4p** | ✅ trim/bleed/registration mark, color bar | **HTML→print PDF için en eksiksiz. Node.js client'ı var.** Ticari, fiyat doğrulanmadı |
| **callas pdfChip** | ✅ CMYK, Lab, ICC, spot | ✅ | ✅ | WebKit tabanlı HTML→PDF; **pdfToolbox** ile preflight. Ticari/OEM, fiyat doğrulanmadı |
| **@polotno/pdf-export** | ✅ | ✅ **PDF/X-1a**, embed font, bleed | ✅ | Node 18+ offline çalışıyor. Polotno SDK ticari (~$199/ay tier'ı **üçüncü parti kaynaktan**, doğrulanmadı) |
| **muhammara** (HummusJS fork) | ✅ `colorspace: 'cmyk'` | ❌ | ✅ | Düşük seviye PDF manipülasyonu |
| **Ghostscript** | ✅ | ⚠️ **sadece PDF/X-3** | ✅ | Aşağıya bak |
| **sharp / libvips** | ✅ `toColourspace('cmyk')`, `withIccProfile()` | — | — | **Görsel seviyesinde CMYK dönüşümü için doğru araç** |
| **veraPDF** | — | ❌ **PDF/X'i DESTEKLEMİYOR** (sadece PDF/A + PDF/UA) | — | PDF/X doğrulaması için kullanılamaz |

### Ghostscript'in gerçek sınırı (önemli)

> "The pdfwrite device does not currently support PDF/X versions other than 3."

Yani **Ghostscript ile PDF/X-1a resmi olarak üretilemiyor.** `PDFX_def.ps` içindeki `GTS_PDFXVersion` satırını `PDF/X-3:2002` → `PDF/X-1:2001` yaparak zorlamak mümkün ama Ghostscript ekibi bunu desteklemiyor ve çıktı gerçek anlamda uyumlu olmayabilir. **PDF/X-3 yeterli** — Türk matbaalar PDF/X-1a:2001 **veya** PDF/X-3 kabul ediyor.

Çalışan komut iskeleti:
```bash
gs -dPDFX -dBATCH -dNOPAUSE \
   -sDEVICE=pdfwrite \
   -sColorConversionStrategy=CMYK \
   -dProcessColorModel=/DeviceCMYK \
   -dOverrideICC=true \
   -sOutputICCProfile=/profiles/ISOcoated_v2_eci.icc \
   -dRenderIntent=1 \
   -dDeviceGrayToK=true \
   -sOutputFile=out-x3.pdf \
   PDFX_def.ps in.pdf
```
Bleed/trim kontrolü: `PDFXTrimBoxToMediaBoxOffset`, `PDFXSetBleedBoxToMediaBox` (default true), `PDFXBleedBoxToTrimBoxOffset` — dördü de 4 elemanlı dizi alıyor. TrimBox PDF/X'te **zorunlu**, TrimBox ⊆ BleedBox ⊆ MediaBox.

⚠️ Ghostscript RGB→CMYK dönüşümünde **saf siyah metin sorunu** riski var: `-dDeviceGrayToK=true` şart, yoksa siyah metin 4 renk zenginleşir ve register kayması olur.

### Somut mimari önerisi

```
1. İçerik JSON (sahneler, metin, görsel URL'leri, kitap formatı)
        ↓
2. React/HTML şablon → sayfa başına absolute-positioned layout
   (Paged.js gerekirse; ama sabit N sayfalı çocuk kitabında
    her sayfayı ayrı @page olarak render etmek daha kontrollü)
        ↓
3. Görsel hazırlığı: sharp
   - 300 DPI'a upscale/kontrol (piksel = mm/25.4*300)
   - sRGB gömülü olarak çıkar (Lulu/Gelato yolu)
   - CMYK varyantı: .toColourspace('cmyk').withIccProfile(...) (TR matbaa yolu)
        ↓
4. Puppeteer → PDF (printBackground: true, preferCSSPageSize: true)
   width/height = trim + 2*bleed
        ↓
5. pdf-lib post-process:
   - setMediaBox (trim + bleed)
   - setBleedBox (trim + bleed)
   - setTrimBox (tam trim)
   - metadata (Title, Producer)
        ↓
6a. LULU/GELATO YOLU → sRGB PDF'i doğrudan gönder
    (Lulu: validate-interior + validate-cover + cover-dimensions çağır)
6b. TR MATBAA YOLU → Ghostscript ile PDF/X-3 + CMYK + output intent
        ↓
7. Doğrulama: PDF/X için veraPDF KULLANMA. Ghostscript'in kendi
   çıktısına güven + Lulu'nun validate endpoint'leri +
   ilk 5 sipariş için matbaadan fiziksel prova iste
```

**Kapak ayrı iş.** İç blok ve kapak ayrı PDF'ler. Kapak genişliği = 2×(trim genişlik + bleed) + spine. **Spine'ı kendin hesaplama** — Lulu için `cover-dimensions` endpoint'i, TR matbaa için matbaadan kağıt caliper/PPI değerini iste. Sert kapakta spine = kitap bloğu kalınlığı + 2× mukavva kalınlığı (standart mukavva 2.0–2.5 mm).

---

## 4) Sayfa düzeni, tipografi, font

### Tipografi (3–6 yaş)

- **Punto:** 3–5 yaş için **18–24 pt**, bazı kaynaklar 24 pt+ diyor. Yaygın picture book gövde metni 14–18 pt.
- **Satır aralığı:** punto'nun **%120–145'i**, veya pratik kural **punto + 4–6 pt** (20 pt metin → 24–26 pt leading)
- Sıkışık (condensed) font kullanma, cömert leading ver
- Gelato min 7 pt diyor (bizim için sorun değil)

### Güvenli alan kısıtları (tasarımı bunlar belirler)

- Lulu: bleed 3.175 mm, safe 6.35 mm, **hardcover casewrap safe 19 mm**
- Gelato: bleed 4 mm, safe 4 mm
- TR matbaa: taşma 3–5 mm
- **→ Ortak payda: 5 mm bleed çiz, 20 mm safe area'ya hiçbir metin koyma.** Tek şablon tüm sağlayıcılara gider.

### Türkçe karakterli ücretsiz fontlar — **doğrulanmış**

Google Fonts `METADATA.pb` dosyalarından GitHub üzerinden birebir doğruladım (`latin-ext` alt kümesi = ğ ş İ ı ç ö ü desteği):

| Font | Subsets | Lisans | Not |
|---|---|---|---|
| **Andika** (SIL) | latin, **latin-ext**, cyrillic, cyrillic-ext, vietnamese | OFL | **Okuryazarlık/çocuk içeriği için özel tasarlanmış.** Regular/Italic/Bold/Bold Italic. En güçlü aday. |
| **Lexend** | latin, **latin-ext**, vietnamese | OFL | Variable, wght 100–900. Okuma akıcılığı için tasarlandı, disleksi dostu literatürde öne çıkıyor |
| **Atkinson Hyperlegible** | latin, **latin-ext** | OFL | Braille Institute; her karakteri maksimum ayırt edilebilir (I/l/1, 0/O). Karakter tanıma için en iyi |
| **Nunito** | latin, **latin-ext**, cyrillic, vietnamese | OFL | Variable 200–1000. Yuvarlak, sıcak, çocuk kitabı estetiğine uygun |

**OpenDyslexic:** SIL-OFL 1.1, web/uygulama/baskıda ücretsiz. Alt yarıları ağırlıklandırarak b/d, p/q ayrımını fiziksel olarak zorlaştırıyor. **Türkçe karakter kapsamı doğrulanmadı** — indirip `ğ Ğ ş Ş İ ı` glifi test edin.

**Öneri:** Gövde metni **Andika** veya **Nunito**; ayarlardan **OpenDyslexic** / **Lexend** alternatifi sun (bu bir pazarlama farklılaştırıcısı da olur — Türkiye'de disleksi dostu çocuk kitabı boşluk).

⚠️ Baskıda **font outline'a çevrilmeli veya tam embed** edilmeli. Ghostscript pipeline'ında OFL fontların embed edilebilirlik bayrağı sorun çıkarmıyor ama kontrol edin.

---

## 5) Daha ucuz MVP alternatifi: dijital PDF + sesli kitap

### EPUB3 Media Overlays gerçeği — **tavsiye etmiyorum**

- Media Overlays = SMIL alt kümesi; `<par>` içinde `<text>` + `<audio>` eşleşmesi. Standart temiz.
- **Ama platform desteği kötü ve kötüleşiyor:**
  - **Apple Books:** destekliyor, ama pratikte **yalnızca fixed-layout** EPUB'larda (reflowable'da değil)
  - **Google Play Books (Android):** SMIL'i görüyor ama **içindeki ses dosyasını YOK SAYIP OS'un TTS'iyle sentezliyor** → bizim klonlanmış ebeveyn sesi tamamen kayboluyor. Bu ürün için **ölümcül**.
  - Genel destek 2017'den beri azaldı; BookFusion gibi niş okuyucular destekliyor
- **Sonuç: ebeveyn sesiyle senkron okuma özelliğini EPUB3'e emanet etme.**

### Doğru yol

**Kendi in-app reader'ını yaz.** Zaten sesi biz üretiyoruz, dolayısıyla hizalamayı biz kontrol ediyoruz:
- TTS/ses klonlama sağlayıcısından **kelime/karakter seviyesi timestamp** al (bu görevin kapsamı dışında, ayrıca doğrulanmalı)
- Basit bir JSON: `[{sceneId, wordIndex, startMs, endMs}]`
- Reader: HTML/RN'de kelime highlight + sayfa çevirme. Web'de `<audio>` + `requestAnimationFrame`, mobilde native player.
- Bu, EPUB'dan **daha az iş** ve **çok daha güvenilir**.

**Ticari paketleme (maliyeti sıfıra yakın, marjı yüksek):**
1. **Dijital PDF** (ekran için 150 DPI, sRGB, watermark'sız) — anında teslim, üretim maliyeti ~0
2. **In-app sesli okuma** (ebeveyn sesi + kelime highlight)
3. **MP4/M4B export** — sayfalar + ses = paylaşılabilir "video hikâye"; WhatsApp'ta viral olur, ffmpeg ile üretilir
4. **EPUB3** yalnızca "export" opsiyonu olarak (Media Overlay olmadan, sade fixed-layout), talep varsa

**Fiyatlandırma mantığı:** Dijital ~99–199 TL anında; basılı 699–1.099 TL (rakip bandı). Dijital, basılıyı satmadan önce nakit akışı ve dönüşüm sağlar; ayrıca kullanıcı **basılı siparişten önce PDF'i onaylar** → iade/yeniden basım maliyeti düşer (Benim Masalım'ın "ücretsiz ön izleme"si tam olarak bu).

---

## 6) Karar: MVP ve V2

### MVP (0–8 hafta) — "PDF'i mükemmelleştir, baskıyı manuel yap"

1. **Format kararını şimdi ver ve sabitle:** **21×21 cm kare, 24 sayfa, sert kapak.** (24 = Lulu hardcover min; kare = çocuk kitabı standardı; TR fotokitap üreticilerinin 20×20 hattına yakın.) Tek format = tek şablon = tek QA yükü.
2. **PDF pipeline'ı: HTML/CSS → Puppeteer → pdf-lib (box'lar) → sRGB 300 DPI PDF.** CMYK/PDF-X **yapma**. Görseller `sharp` ile 300 DPI'a normalize.
3. **Ürün olarak dijital PDF + in-app sesli okumayı sat.** Bu, gün 1'de gelir üretir ve basımı bloke etmez.
4. **Baskı: tek Türk partner, manuel akış.** Bir ops paneli: sipariş → iç blok PDF + kapak PDF + iş emri (adet, ebat, kağıt, cilt, kargo adresi) üretir; operatör partnere e-posta/portal ile iletir. **Gün 1'de API'ye ihtiyaç yok** — günde 10 sipariş manuel yönetilebilir.
   - Partner adayları (öncelik sırasıyla): **fotokitap üreticileri** (kitapfabrikasi, netbaski, mome, fotobaskisepeti) → zaten tek adet sert kapak layflat üretiyorlar. Sonra **Kitap72** (1 adetten, 5 iş günü).
   - Partnere **CMYK PDF/X-3** istiyorsa Ghostscript adımını ekle (yarım gün iş).
5. **Paralel olarak Cloudprinter.com'a Türkiye lokal üretim quote'u iste** — MVP'de bile API'li TR üretimi çıkarsa jackpot.
6. **Lulu sandbox'ta 1 saatlik doğrulama:** `shipping-options` ile `TR` desteğini ve maliyetini kesinleştir. Bu, uluslararası fallback'in var olup olmadığını söyler.

**MVP'de YAPMA:** kendi PDF/X-4 pipeline'ın, EPUB3 media overlay, çoklu POD sağlayıcı soyutlaması, çoklu kitap formatı, dinamik spine hesabı.

### V2 (3–9 ay)

1. **API'li baskı.** Öncelik: (a) **Gelato**, eğer Türkiye'de photo book/children's book üretimi doğrulanırsa — API + yurt içi üretim + yurt içi kargo en iyi kombinasyon; (b) **Cloudprinter** Türkiye; (c) **Lulu** yurtdışı fallback (yurtdışı müşteri / TR partner kapasitesi dolduğunda).
2. **Sağlayıcı soyutlama katmanı:** `PrintProvider` arayüzü — `quote()`, `validateFiles()`, `getCoverDimensions()`, `createOrder()`, `onStatusWebhook()`. Lulu, Gelato ve "ManualTurkishPrinter" adapter'ları. Format profilleri (bleed 3.175 vs 4 mm, safe 6.35 vs 19 mm, sRGB vs PDF/X-4) config'den gelsin.
3. **Gerçek PDF/X-4 pipeline** (Gelato zorunlu kılıyor): ya Ghostscript+ICC (X-3'e düşerek, Gelato'nun kabul edip etmediğini teyit et) ya da **PDFreactor** / **callas pdfChip** lisansla. Preflight için **callas pdfToolbox CLI**. veraPDF işe yaramaz.
4. **Format çeşitliliği:** 32 sayfa, layflat (Prodigi 18–122), yumuşak kapak (ucuz varyant), A4 dikey.
5. **Renk yönetimi:** ISO Coated v2 / FOGRA39 ile soft-proof; AI görselleri CMYK gamut'ta patlayan doygun renkler üretiyor — gamut clamp adımı ekle.
6. **Kalite döngüsü:** her yeni partner/format için fiziksel prova + renk referans kartı.

---

## 7) Doğrulanmayan / doğrulanması gereken maddeler

| # | Soru | Nasıl doğrulanır | Öncelik |
|---|---|---|---|
| 1 | Gelato Türkiye'de **kitap** basıyor mu? | Gelato sales / API `catalogs/photo-books` + `TR` filtresi | 🔴 En yüksek |
| 2 | Cloudprinter TR sert kapak 24 sayfa 1 adet **fiyatı** | sales@cloudprinter.com quote | 🔴 |
| 3 | Türk fotokitap üreticilerinin **fason/beyaz etiket birim fiyatı** | 4 firmaya aynı brief | 🔴 |
| 4 | Lulu Türkiye'ye gönderiyor mu, kaça? | Sandbox `shipping-options`, `country_code: TR` | 🟡 |
| 5 | Yurtdışından **ticari** kitap gönderisinde 1.500 EUR muafiyeti geçerli mi? | Gümrük müşaviri | 🟡 (yurtdışı POD'a bağımlıysak 🔴) |
| 6 | Lulu **"Dotted" pod_package_id** geçişi (31 Mart 2026) gerçek mi, eski format ne zamana kadar? | developers.lulu.com / destek | 🟡 |
| 7 | PDFreactor / pdfChip / Polotno **fiyatları** | Satış ekipleri | 🟢 (V2) |
| 8 | OpenDyslexic **Türkçe glif kapsamı** | Fontu indir, ğĞşŞİı test et | 🟢 |
| 9 | Gelato'nun sadece PDF/X-4 mü kabul ettiği yoksa düz PDF'i de mi geçirdiği | API test siparişi | 🟡 |

---

## Kaynaklar

**Lulu**
- [Print API ürün sayfası](https://www.lulu.com/print-api/products) · [Print API tanıtım](https://www.lulu.com/sell/sell-on-your-site/print-api) · [Developer portal](https://developers.lulu.com/) · [API dokümanı](https://api.lulu.com/docs/) · [OpenAPI spec](https://api.lulu.com/api-docs/openapi-specs/openapi_public.yml) · [Fiyat hesaplayıcı](https://developers.lulu.com/price-calculator)
- [PDF Creation Settings (help)](https://help.lulu.com/en/support/solutions/articles/64000255519-pdf-creation-settings) · [PDF ayarları (developer portal)](https://help.api.lulu.com/en/support/solutions/articles/64000254609-what-are-the-recommended-settings-for-the-interior-pdf-) · [Spine width nasıl hesaplanır](https://help.api.lulu.com/en/support/solutions/articles/64000254616-how-is-spine-width-calculated-) · [Formatting tips](https://help.lulu.com/en/support/solutions/articles/64000255583-tips-for-formatting-documents) · [Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf) · [API Getting Started PDF](https://assets.lulu.com/media/guides/en/lulu-api-getting-started-guide.pdf)
- [Ürün üretim/sevk lokasyonları](https://help.api.lulu.com/en/support/solutions/articles/64000254640-where-are-the-products-produced-and-shipped-from-) · [Uluslararası kargo blog](https://blog.lulu.com/international-book-shipping/) · [Shipping FAQ](https://help.lulu.com/en/support/solutions/articles/64000255307-shipping-faq)
- [devlimelabs/lulu-print-mcp (GitHub)](https://github.com/devlimelabs/lulu-print-mcp) · [minireference/lulu-api-client (GitHub)](https://github.com/minireference/lulu-api-client) · [ReadEval/lulu-ruby](https://github.com/ReadEval/lulu-ruby)

**Gelato**
- [Children's books](https://www.gelato.com/products/childrens-books) · [Photo books](https://www.gelato.com/products/photo-books) · [POD children's book rehberi](https://www.gelato.com/blog/print-on-demand-childrens-books-guide) · [Local production](https://www.gelato.com/the-power-of-local) · [Print in Turkey](https://www.globe.gelato.com/en-US/print-in/turkey/)
- [Create order v3](https://dashboard.gelato.com/docs/orders/v3/create/) · [Search products](https://dashboard.gelato.com/docs/products/product/search/) · [Get catalog](https://dashboard.gelato.com/docs/products/catalog/get/) · [Get started](https://dashboard.gelato.com/docs/get-started/) · [Product UID nedir](https://support.gelato.com/en/articles/8996081-what-is-a-product-uid) · [Photo books update 2024](https://support.gelato.com/en/articles/9853387-update-photo-books-product-update-september-2024)
- [File requirements](https://support.gelatoglobe.com/hc/en-us/articles/115002989205-File-Requirements-for-Gelato) · [PDF upload gereksinimleri](https://support.gelato.com/en/articles/8996349-what-are-the-design-requirements-for-pdf-uploads) · [PDF checklist](https://support.gelatoglobe.com/hc/en-us/articles/360000363285-Checklist-for-Creating-a-PDF)

**Diğer POD**
- [Cloudprinter — Turkey](https://www.cloudprinter.com/local-printing-in-turkey-with-global-print-api) · [Cloudprinter API spec](https://www.cloudprinter.com/print-api-restful-json-specifications) · [Fiyat bilgisi](https://knowledge.cloudprinter.com/where-can-i-find-the-prices) · [Photobook ürünü](https://www.cloudprinter.com/products/photobook-print-online-worldwide)
- [Peecho Print API](https://www.peecho.com/solutions/print-api) · [Hardcover](https://www.peecho.com/products/books/hardcover) · [Softcover](https://www.peecho.com/products/books/softcover) · [Global print network](https://www.peecho.com/global-print-network)
- [Prodigi Print API](https://www.prodigi.com/print-api/) · [Layflat photo book](https://www.prodigi.com/products/books-and-magazines/layflat-photo-book/) · [Hardcover photo book](https://www.prodigi.com/products/books-and-magazines/hardcover-photo-book/) · [Photo book teknik rehber](https://www.prodigi.com/blog/photo-books-technical-guide/)
- [Blurb Print API](https://www.blurb.com/print-api-software) · [RPI Print APIs](https://www.rpiprint.com/products-services/print-apis/) · [RPI API docs](https://docs.api.rpiprint.com/)

**Türkiye — matbaa & rakipler**
- [Benim Masalım — kişiye özel çocuk kitabı rehberi 2026](https://www.benimmasalim.com.tr/blog/kisiye-ozel-cocuk-kitabi-rehberi) · [Benim Masalım ana sayfa](https://www.benimmasalim.com.tr/) · [Mibooko](https://mibooko.com/tr/printed-personalized-kids-book/) · [Hediye Çizgiler](https://hediyecizgiler.com/products/kisiye-ozel-cocuk-kitabi-dijital-urun) · [Kitap Basım Merkezi](https://www.kitapbasimi.com/kisiye-ozel-kitap-basimi/)
- [Kitap72 (1 adetten)](https://www.kitap72.com/) · [Kitap72 fiyat analizi 2026](https://www.kitap72.com/blog/kitap-basim-fiyatlari-2026-detayli-maliyet-analizi) · [KitapBastır](https://www.kitapbastir.com/) · [Best Reklam az adetli](https://print.bestreklam.com.tr/kisiye-ozel-ve-az-adetli-kitap-basimi/) · [Best Reklam fiyat rehberi](https://print.bestreklam.com.tr/kitap-baski-fiyati-hesaplama-rehberi/) · [Önka sert kapak](https://www.onkamatbaa.com/sert-kapak-ciltli-kitap-bastir/) · [Matbaafix hesaplama](https://matbaafix.com/kitap-baski-fiyatlari) · [Baskı Adam kitap](https://www.baskiadam.com/dijital-baski/kitap-baskisi/) · [Baskıcımız 2026 fiyat](https://baskicimiz.com/kitap-baski-fiyatlari-2026/) · [Armut kitap baskı 2026](https://armut.com/fiyatlari/kitap-baski_734)
- Fotokitap: [KitapFabrikasi](https://www.kitapfabrikasi.com/) · [Netbaski sert kapak fotokitap](https://www.netbaski.com/foto-kitap/sert-kapak-fotokitap) · [Mome](https://www.momeprint.com/urun/fotokitap) · [Foto Baskı Sepeti 20x20](https://www.fotobaskisepeti.com/20x20-arkadasa-foto-kitap-20-fotograf) · [Fotobaskıcı 20x20](https://www.fotobaskici.com/urun/20x20-cm-kare-fotokitap) · [PhotoBook fiyat listesi 2026](https://www.photobook.com.tr/fiyat-listesi/)
- POD TR: [Printiturk](https://www.printiturk.com/) · [Print On Demand Türkiye](https://printondemandtr.com.tr/) · [Doruk Baskı iş birliği](https://www.dorukbaski.com/bayilik-ve-is-birligi) · [YAYBİR POD dosyası](https://www.yaybir.org.tr/print-on-demand-pod-sistemi-yayinciligin-gelecegi-olabilir-mi/)
- Baskı dosyası kuralları: [Copy Center rehberi](https://www.copy-center.com.tr/blog/baski-dosyasi-hazirlama-rehberi/) · [Mega Basım](https://www.mega.com.tr/tasariminiz-baskiya-uygun-sekilde-hazir-mi/) · [KitapBastır teknik özellikler](https://www.kitapbastir.com/blogs/dosyahazirlamaveteknikozellikler.html) · [Promosyonbank PDF kuralları](https://www.promosyonbank.com/pdf-baski-dosyasi-hazirlama-kurallari)

**Gümrük**
- [Ticaret Bakanlığı — Posta ve Hızlı Kargo Muafiyeti](https://ticaret.gov.tr/gumruk-islemleri/sikca-sorulan-sorular/bireysel/posta-ve-hizli-kargo-muafiyeti) · [Gümrük Rehberi](https://gumrukrehberi.gov.tr/kategori/bireysel-slemler/posta-ve-hizli-kargo-rehberi) · [1500 Avro kitap muafiyeti](https://www.proventus.com.tr/1500-avroyu-gecmeyen-kisisel-kullanima-mahsus-kitap-veya-benzeri-esya-gumruk-vergisine-tabi-olmayacak/) · [30 Euro muafiyeti kaldırıldı (Resmî Gazete)](https://ihracat.com.tr/yurt-disi-alisveris-30-euro-gumruk-muafiyeti-kaldirildi/) · [Milliyet](https://www.milliyet.com.tr/ekonomi/yurt-disindan-e-ticarette-gumruksuz-donem-bitti-7517209)

**PDF / teknik**
- [Ghostscript High Level Devices (PDF/X)](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html) · [Ghostscript 9.56 VectorDevices](https://ghostscript.com/docs/9.56.1/VectorDevices.htm) · [gs-devel: PDF/X-1a](https://ghostscript.com/pipermail/gs-devel/2010-July/008788.html) · [Ghostscript Color Management](https://ghostscript.readthedocs.io/en/latest/GhostscriptColorManagement.html) · [GS PDF/A-PDF/X rehberi](https://www.codegenes.net/blog/how-to-use-ghostscript-to-convert-pdf-to-pdf-a-or-pdf-x/)
- [pdf-lib PDFPage API](https://pdf-lib.js.org/docs/api/classes/pdfpage) · [pdf-lib PDFPage.ts](https://github.com/Hopding/pdf-lib/blob/master/src/api/PDFPage.ts) · [PDFKit CMYK issue #160](https://github.com/foliojs/pdfkit/issues/160) · [PDFKit guide](http://pdfkit.org/docs/guide.pdf) · [muhammara](https://github.com/julianhille/MuhammaraJS) · [sharp output options](https://sharp.pixelplumbing.com/api-output/) · [libvips CMYK discussion](https://github.com/libvips/libvips/discussions/3065)
- [Paged.js](https://github.com/pagedjs/pagedjs/) · [Vivliostyle CSS for books](https://www.pagedmedia.org/vivliostyle-css-for-books.html) · [PDFreactor features](https://www.pdfreactor.com/pdfreactor-features/) · [PDFreactor JS/Node](https://www.pdfreactor.com/javascript/) · [callas pdfChip](https://www.callassoftware.com/en/pdfchip) · [callas pdfToolbox](https://callassoftware.com/products/pdftoolbox/) · [Polotno PDF export](https://polotno.com/docs/pdf-export) · [Polotno + Lulu](https://polotno.com/sdk/product/integrations/lulu) · [@polotno/pdf-export (npm)](https://www.npmjs.com/package/@polotno/pdf-export) · [IMG.LY PDF/X rehberi](https://img.ly/blog/what-does-print-ready-pdf-mean-understanding-pdf-x-standards-for-professional-printing/)
- [veraPDF](https://verapdf.org/) · [veraPDF validation docs](https://docs.verapdf.org/validation/)
- Spine: [PrintNinja spine calculator](https://printninja.com/printing-resource-center/printninja-file-setup-checklist/book-printing-file-setup-guides/spine-width-calculator/) · [Star Print Brokers formülü](https://www.starprintbrokers.com/spine-width-estimate/)

**Tipografi / font / EPUB**
- [Google Fonts — Lexend METADATA](https://github.com/google/fonts/blob/main/ofl/lexend/METADATA.pb) · [Andika METADATA](https://github.com/google/fonts/blob/main/ofl/andika/METADATA.pb) · [Atkinson Hyperlegible METADATA](https://github.com/google/fonts/blob/main/ofl/atkinsonhyperlegible/METADATA.pb) · [Nunito METADATA](https://github.com/google/fonts/blob/main/ofl/nunito/METADATA.pb)
- [Disleksi fontları karşılaştırma 2026](https://focusflowapp.in/blog/best-dyslexia-fonts-for-web) · [Dyslexia friendly typefaces](https://britthub.co.uk/dyslexia-friendly-typefaces/) · [Çocuk kitabı tipografisi](https://www.whatfontis.com/blog/childrens-book-typography-guide/) · [Çocuk kitabı formatlama](https://spines.com/formatting-childrens-books-for-self-publishing/) · [Türkçe karakterli ücretsiz fontlar](https://www.kocaelireklamajanslari.com/turkce-karakter-destekli-en-iyi-ucretsiz-fontlar/)
- [EPUB Media Overlays 3.2 (W3C)](https://www.w3.org/publishing/epub32/epub-mediaoverlays.html) · [Media Overlays 3.0 (IDPF)](https://idpf.org/epub/30/spec/epub30-mediaoverlays.html) · [DAISY KB — Media Overlays](https://kb.daisy.org/publishing/docs/sync-media/overlays.html) · [Apple Books Media Overlays yapısı](https://help.apple.com/itc/booksassetguide/en.lproj/itcf373ff8f8.html) · [Google Play Books vs Media Overlays](https://www.albertopettarin.it/blog/2014/06/15/google-play-books-vs-media-overlays.html) · [BookFusion EPUB3 özellikleri](https://www.blog.bookfusion.com/beyond-the-page-epub-3-interactive-features-that-power-readers-actually-want/) · [syncabook (GitHub)](https://github.com/r4victor/syncabook)