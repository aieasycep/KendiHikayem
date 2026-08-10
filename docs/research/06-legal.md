# Araştırma — KVKK, Biyometrik Veri ve Uyum

> Ağustos 2026. Kaynak URL'leri metin içinde.

---

Araştırmayı tamamladım, ancak **ciddi bir erişim kısıtı** oluştu — bunu baştan bildirmem gerekiyor.

---

# ⚠️ ÖNCE: BU OTURUMUN KAYNAK DOĞRULAMA DURUMU

**WebSearch bütçesi tükendi** (200/200 çağrı, oturum başında) ve **egress proxy neredeyse tüm hukuki kaynak alan adlarını engelledi.**

Erişim testi sonuçları:

| Alan adı | Durum |
|---|---|
| `developer.apple.com` | ✅ **200 — erişildi, içerik doğrulandı** |
| `kvkk.gov.tr` | ❌ EGRESS_BLOCKED |
| `mevzuat.gov.tr`, `resmigazete.gov.tr` | ❌ Bloklu |
| `gdpr-info.eu`, `eur-lex.europa.eu`, `edpb.europa.eu` | ❌ Bloklu |
| `ftc.gov` (COPPA) | ❌ Bloklu |
| `support.google.com`, `play.google.com` | ❌ Bloklu |
| `elevenlabs.io`, `docs.elevenlabs.io` | ❌ Bloklu |

Proxy README'si politika reddi (403) için "retry veya route around etme, engellenen host'u raporla" diyor — o yüzden zorlamadım.

**Sonuç olarak aşağıdaki raporda iki tür bilgi var ve hepsini etiketledim:**

- 🟢 **[DOĞRULANDI]** — bu oturumda canlı kaynaktan çekildi (yalnızca Apple bölümü)
- 🟡 **[EĞİTİM VERİSİ — doğrulanmadı]** — bilgi kesim tarihim Mayıs 2026'ya kadar olan bilgim; mevzuat metni gibi durağan şeyler için güvenilir
- 🔴 **[DOĞRULANMALI — tarih/sayı/numara içeriyor]** — RG tarihi, karar numarası, yürürlük tarihi gibi kolayca yanlış hatırlanabilecek detaylar

**Hiçbir Kurul karar numarası, RG sayısı veya fiyat uydurmadım.** Emin olmadığım yerde numara vermek yerine "doğrulanmalı" yazdım.

---

# 1) SES BİYOMETRİK VERİ Mİ?

## 1.1 Hukuki analiz

🟡 **KVKK m.6/1** özel nitelikli veriler listesinde "**biyometrik ve genetik veriler**" açıkça sayılır. Ancak **KVKK biyometrik veriyi tanımlamaz.**

🟡 **GDPR m.4(14) tanımı kritik nüansı taşır:** biyometrik veri = "spesifik teknik işlemlerden geçirilerek elde edilen, ***gerçek kişinin benzersiz şekilde teşhis edilmesine imkân veren veya teşhisini teyit eden*** fiziksel, fizyolojik veya davranışsal özelliklerine ilişkin kişisel veri."

Buradan çıkan ayrım — ve bu ürününüz için **en önemli hukuki soru**:

| Veri | Biyometrik veri mi? |
|---|---|
| Ham ses kaydı (WAV/MP3) | 🟡 Tek başına **hayır** — normal kişisel veri. Ses kişilik hakkı unsuru ama biyometrik değil. |
| **Speaker embedding / voice model** (klonlama için üretilen matematiksel şablon) | 🔴 **Yüksek ihtimalle EVET.** "Spesifik teknik işlem" + "benzersiz teşhise imkân veren" kriterlerinin ikisini de karşılıyor. |

**Karşı argüman (ve neden ona güvenmemelisiniz):** GDPR tanımındaki "benzersiz teşhis etme *amacı*" ifadesine dayanarak, TTS sentezi için üretilen voice model'in kimlik doğrulama amacı taşımadığı, dolayısıyla biyometrik veri olmadığı savunulabilir. Bu argüman AB doktrininde tartışmalıdır ve **KVKK Kurulu'nun bu konuda verilmiş bir kararı bildiğim kadarıyla YOKTUR** 🔴.

> **TAVSİYE: Muhafazakâr yaklaşın. Voice embedding'i özel nitelikli kişisel veri kabul edin.** Yanılırsanız gereksiz sıkı davranmış olursunuz (maliyet: birkaç ek ekran). Tersini yapıp yanılırsanız m.18 idari para cezası + TCK m.135/136 riski.

## 1.2 2024 değişikliği: artık açık rıza TEK YOL değil ama sizde tek yol

🟡 **7499 sayılı Kanun** (🔴 RG ~12 Mart 2024, m.6 ve m.9 değişiklikleri yürürlük ~1 Haziran 2024 — **tarihler doğrulanmalı**) KVKK m.6'yı yeniden yazdı. Özel nitelikli veri artık açık rıza **dışında** da işlenebiliyor: kanunlarda öngörülme, fiili imkânsızlık, alenileştirme, hak tesisi, sağlık/istihdam, kamu sağlığı, vakıf/dernek/sendika faaliyeti, sosyal güvenlik.

**Sizin senaryonuzda bunların HİÇBİRİ uymuyor → AÇIK RIZA tek hukuki dayanak.**

## 1.3 Açık rızanın geçerlilik şartları (bunlar ürün tasarımınızı bağlar)

🟡 KVKK m.3/1(a): açık rıza = **belirli bir konuya ilişkin** + **bilgilendirmeye dayanan** + **özgür iradeyle açıklanan**.

Bundan çıkan **üç zorlayıcı ürün kuralı:**

1. **Hizmet şartına bağlanamaz.** "Ses rızası vermezsen uygulamayı kullanamazsın" → rıza özgür değildir, geçersizdir.
   → **Ses klonlama OPSİYONEL özellik olmak zorunda.** Uygulama, hazır TTS sesleriyle rızasız da tam çalışmalı. Bu bir MVP mimari kararıdır, sonradan eklenecek bir şey değil.

2. **Battaniye rıza yasak.** Tek onay kutusuyla "ses işleme + yurtdışı aktarım + pazarlama" alınamaz.
   → **En az 3 ayrı, ön-işaretsiz onay:** (a) biyometrik/ses işleme, (b) yurtdışına aktarım, (c) çocuk verisi işleme. Pazarlama ayrıca 4.

3. **Aydınlatma ve açık rıza AYNI METİNDE olamaz.** 🟡 Aydınlatma Tebliği (🔴 RG ~10 Mart 2018, sayı 30356 — doğrulanmalı) m.5: "aydınlatma yükümlülüğü ve açık rızanın alınması işlemlerinin **ayrı ayrı** yerine getirilmesi gerekmektedir."
   → İki ayrı ekran/iki ayrı belge.

4. **Geri alınabilir olmalı ve geri alma kolay olmalı** — Apple 5.1.1(ii) de bunu ayrıca zorunlu kılıyor 🟢.

## 1.4 Örnek Açık Rıza metni (ses klonlama)

> **SES KLONLAMA — AÇIK RIZA BEYANI**
>
> ☐ [Şirket Ünvanı] tarafından, **ses kaydımın ve bu kayıttan üretilecek ses modelimin (biyometrik veri niteliğinde olabilecek)**, yalnızca benim hesabımda oluşturulan çocuk hikâyelerinin seslendirilmesi amacıyla işlenmesine; bu amaçla ses hizmet sağlayıcısı **[ElevenLabs Inc. / ABD]**'ye aktarılmasına ve hesabım aktif olduğu sürece saklanmasına, [Aydınlatma Metni]'ni okuyup anladığımı beyan ederek **açık rızam ile onay veriyorum.**
>
> ☐ Ses modelimin **yurt dışına (ABD)** aktarılmasının; ABD'nin KVKK anlamında yeterli korumaya sahip ülkeler arasında bulunmaması nedeniyle, verilerimin Türkiye'dekiyle aynı düzeyde korunmayabileceği ve haklarımı kullanmakta güçlük yaşayabileceğim risklerini bilerek gerçekleştirilmesine **açık rızam ile onay veriyorum.**
>
> Rızamı **[Ayarlar → Gizlilik → Sesim]** üzerinden dilediğim an geri alabileceğimi, geri aldığımda ses modelimin hem [Şirket] hem de sağlayıcı nezdinde silineceğini biliyorum.

⚠️ Bu bir **taslak iskelettir, hukuki metin değildir.** KVKK'ya hâkim bir avukata final ettirin.

## 1.5 Kurul rehberi ve kararları

🟡 **"Biyometrik Verilerin İşlenmesinde Dikkat Edilmesi Gereken Hususlara İlişkin Rehber"** gerçekten mevcut (🔴 yayın ~2021 — doğrulanmalı). Erişemedim. Hatırladığım ana ilkeler 🟡:
- Fizyolojik (parmak izi, iris, yüz, damar) vs. **davranışsal** (imza dinamiği, klavye vuruşu, yürüyüş, **ses**) ayrımı yapar → **ses davranışsal biyometrik olarak anılır**
- **Ölçülülük/temel hak sınırlama testi**, alternatif yöntem sunma zorunluluğu
- Merkezî veritabanı yerine mümkünse **cihaz üzerinde saklama** tercihi
- Şablonun geri döndürülemez (irreversible) olması
- Ayrı veri güvenliği politikası, erişim logları, imha süreçleri

🟡 **2018/10 sayılı Kurul kararı — "Özel Nitelikli Kişisel Verilerin İşlenmesinde Veri Sorumlularınca Alınması Gereken Yeterli Önlemler"** (🔴 tarih doğrulanmalı) sizi doğrudan bağlar ve somut teknik yükümlülük listesi verir: kriptografik şifreleme + **anahtarların ayrı ortamda güvenli saklanması**, işlem kayıtları, çalışan gizlilik taahhütnamesi, yetki matrisi, aktarımda VPN/sFTP.

🔴 **Ses klonlamaya doğrudan değinen bir Kurul kararı bildiğim kadarıyla YOKTUR.** Kurul'un biyometrik kararları ağırlıkla işyeri/spor salonu girişlerinde parmak izi–avuç içi damar izi kullanımı hakkındadır (ölçülülük gerekçesiyle ihlal kararları). **Karar numarası vermiyorum — uydurmamak için.**

---

# 2) ÇOCUK VERİSİ

## 2.1 KVKK: çocuk verisi için ÖZEL HÜKÜM YOK

🟡 Bu şaşırtıcı ama doğru: **KVKK'da GDPR m.8'in muadili bir hüküm yoktur.** Yaş eşiği, ebeveyn rızası mekanizması, yaş doğrulama zorunluluğu kanunda düzenlenmemiştir.

Boşluk genel hükümlerle doldurulur 🟡:
- **TMK m.16**: ayırt etme gücüne sahip küçük, yasal temsilcisinin rızası olmadıkça borç altına giremez; **ancak "kişiye sıkı sıkıya bağlı hakları" bizzat kullanabilir.** Kişisel verilerin korunması kişilik hakkıdır → doktrinde "ayırt etme gücü olan ergin olmayan kendi rızasını verebilir mi?" tartışması vardır, **netleşmemiştir.**
- Uygulamada yerleşik pratik: **18 yaş altı için veli/vasi rızası aranır.**

🔴 KVKK'nın çocuklara ilişkin bir rehber/broşür çalışması olabilir — doğrulayamadım.

## 2.2 Sizin senaryonuz aslında AVANTAJLI

Kritik yapısal gerçek: **Uygulamayı ebeveyn kullanıyor, çocuk kullanmıyor.** Çocuk verisini sisteme giren kişi, o çocuğun **yasal temsilcisidir.**

Bu şu anlama gelir:
- Rızayı veren doğru kişidir (yasal temsilci) → KVKK açısından temiz
- Çocuk **hizmetin kullanıcısı değil, hikâyenin konusudur** → GDPR m.8'in "bilgi toplumu hizmeti doğrudan çocuğa sunulduğunda" şartı teknik olarak devreye girmeyebilir 🟡
- COPPA'nın "directed to children" testinden kaçınma imkânı doğar (aşağıda)

**Bunu bilinçli bir hukuki strateji haline getirin** ve ürün konumlandırmasında koruyun (bkz. §6.3).

## 2.3 GDPR m.8 (AB'ye açılırsanız)

🟡 Hukuki dayanak **rıza** olduğunda ve hizmet **doğrudan çocuğa** sunulduğunda:
- Eşik **16 yaş**; üye devletler **13'e kadar** indirebilir → üye devletler arası dağınıklık var (İrlanda 16, İspanya 14, Danimarka 13 gibi 🔴 doğrulanmalı)
- m.8/2: veri sorumlusu **"mevcut teknoloji ışığında makul çaba"** göstererek rızanın veli tarafından verildiğini doğrulamalı
- GDPR m.9 (özel nitelikli) + m.8 birleşince yük ağırlaşır

## 2.4 COPPA (ABD)

🟡 13 yaş altı, **"directed to children"** veya çocuktan bilerek veri toplayan hizmetler.

🔴 **2025 COPPA Rule değişikliği doğrulanmalı** — hatırladığım: FTC değiştirilmiş kuralı 2025'te kabul etti, uyum tarihi 2026 içinde. Getirdikleri: üçüncü taraflara ifşa için **ayrı** doğrulanabilir ebeveyn rızası (VPC), yazılı ve **kamuya açık veri saklama politikası**, **süresiz saklama yasağı**, zorunlu yazılı güvenlik programı, "biometric identifier"ın kişisel veri tanımına eklenmesi.

🟡 **COPPA'da ses kaydı zaten kişisel veridir** — FTC'nin 2017 tarihli Enforcement Policy Statement'ı, çocuğun sesini içeren kaydı "personal information" saymıştır (dar istisna: ses yalnızca komut olarak kullanılıp derhal siliniyorsa VPC gerekmez — **sizin senaryonuza uymaz**).

🟡 **VPC yöntemleri**: parasal işlem içeren kredi kartı işlemi, imzalı form, telefon görüşmesi, video konferans, devlet kimliği kontrolü, yüz eşleştirme.
→ **Ücretli abonelik/kitap satın alımı VPC olarak sayılabilir** — ancak "monetary transaction" olması şart, salt kart bilgisi almak yetmez 🟡.

## 2.5 Yaş doğrulama gerekli mi?

| Pazar | Gereksinim |
|---|---|
| 🇹🇷 Türkiye | 🟡 Mevzuatta açık zorunluluk yok. **Beyan yeterli** — ancak "ebeveyn/vasi olduğumu beyan ederim" onayı ve ödeme kartı sahipliği ispat zincirinizi güçlendirir. |
| 🇪🇺 AB | 🟡 GDPR m.8/2 "makul çaba" — ürün ebeveyne yönelikse hafif; çocuğa yönelikse ağır. AI Act m.5 ayrıca çocuk savunmasızlığını istismar eden sistemleri yasaklar. |
| 🇺🇸 ABD | 🟡 "Directed to children" ise VPC zorunlu. Değilse yalnızca "bilerek toplama" yasağı. |

> **MVP kararı:** Sert yaş doğrulama (kimlik/yüz) YAPMAYIN. Bunun yerine: ebeveynlik beyanı + ödeme işlemi + Kids Category'ye girmeme. Bu üçlü, üç pazarda da savunulabilir bir pozisyon üretir.

---

# 3) VERİ SAKLAMA VE YURTDIŞINA AKTARIM

## 3.1 ⭐ EN KRİTİK BULGU: Açık rıza artık aktarım için yeterli DEĞİL

🟡 7499 sayılı Kanun KVKK **m.9'u tamamen yeniden yazdı** ve GDPR yapısına yaklaştırdı. Yeni kademeli yapı:

**Kademe 1 — Yeterlilik kararı**
Kurul'un yeterli koruma bulunduğuna karar verdiği ülke/sektör/uluslararası kuruluş.
🔴 **Bildiğim kadarıyla Kurul bugüne dek HİÇBİR ülke için yeterlilik kararı vermemiştir** (Mayıs 2026 itibarıyla). ABD kesinlikle yok. **Doğrulanmalı.**

**Kademe 2 — Uygun güvenceler** (yeterlilik kararı yoksa; ayrıca aktarımın m.5/m.6 işleme şartlarından birine dayanması ve ilgili kişinin haklarını kullanabilmesi kaydıyla):
| Araç | Kurul izni? |
|---|---|
| Kamu kurumları arası anlaşma | ✅ İzin gerekir |
| Bağlayıcı Şirket Kuralları (BCR) | ✅ Onay gerekir |
| **Standart Sözleşme (SCC)** | ❌ İzin gerekmez — **ancak imzadan itibaren 5 iş günü içinde Kuruma BİLDİRİM zorunlu** 🔴 (süre doğrulanmalı) |
| Taahhütname | ✅ İzin gerekir |

**Kademe 3 — İstisnalar (m.9 son fıkra)**, yalnızca **"ARIZİ OLMAK KAYDIYLA"**:
riskler hakkında bilgilendirilerek verilen **açık rıza**, sözleşmenin ifası, kamu yararı, hak tesisi, hayati tehlike, kamuya açık sicil.

### 🚨 Bunun sizin için anlamı

> **"Arızi" (occasional/incidental) şartı, sizi açık rızaya dayanmaktan MEN EDER.**
>
> Her kullanıcının sesini sistematik ve sürekli olarak ElevenLabs'a gönderiyorsanız, bu tanımı gereği **arızi değil, düzenli bir aktarımdır.** Açık rıza istisnası uygulanamaz.
>
> **→ ElevenLabs (ve OpenAI, Replicate, görsel üreticiniz, bulut sağlayıcınız) ile STANDART SÖZLEŞME imzalamak ve KVKK'ya bildirmek ZORUNDASINIZ. Bu MVP'de opsiyonel değildir.**

Bu, bu raporun **en somut ve en pahalı bulgusudur.** Yine de açık rızayı da alın (kuşak-kemer yaklaşımı; ayrıca aydınlatma yükümlülüğü zaten gerektiriyor).

## 3.2 Standart Sözleşme pratiği

🔴 **"Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik"** (~10 Temmuz 2024 — **doğrulanmalı**) dört modül içerir:
1. Veri sorumlusu → veri sorumlusu
2. **Veri sorumlusu → veri işleyen** ← *sizin durumunuz (siz → ElevenLabs)*
3. Veri işleyen → veri sorumlusu
4. Veri işleyen → veri işleyen

🟡 Pratik uyarı: **Standart Sözleşme metninde değişiklik yapılamaz** (ek koruma eklemek dışında). Sağlayıcının kendi DPA'sı **yerine geçmez** — ElevenLabs'ın GDPR DPA'sını imzalamış olmanız KVKK yükümlülüğünüzü karşılamaz. **KVKK'nın kendi metnini ayrıca imzalatmanız gerekir.** Bu, ABD merkezli SaaS'larla pratikte zorlanılan bir noktadır — ticari müzakere gerektirir.

## 3.3 Türkiye'de veri saklama (localization) zorunlu mu?

🟡 **HAYIR.** KVKK genel bir veri yerelleştirme zorunluluğu getirmez. Yerelleştirme sektöreldir:
- Bankacılık (BDDK), ödeme/e-para kuruluşları (6493 s.K., TCMB), elektronik haberleşme (BTK)
- **Siz bunların hiçbiri değilsiniz.**

⚠️ Tek dolaylı etki: **ödeme alıyorsanız** kart verisini kendiniz tutmayın; iyzico/PayTR gibi Türkiye'de yerleşik bir PSP kullanın, tokenizasyon yapın.

## 3.4 Önerilen mimari (hukuki gerekçeli)

```
[Uygulama içi mikrofon kaydı]
        ↓ TLS
[TR/AB bölgesi — sizin sunucunuz]
   • Ham ses kaydı → şifreli (KMS, anahtar ayrı ortamda)
   • Rıza kanıt paketi (sesli beyan + metin + zaman + IP + cihaz + politika versiyonu)
        ↓ SCC + KVKK bildirimi  ⚠️ ZORUNLU
[ElevenLabs / ABD]
   • Voice model üretimi
   • voice_id sizde saklanır
        ↓
[Ham kayıt: model üretiminden 30 gün sonra SİL]
```

**Neden ham kaydı silip model'i tutuyoruz:** ham kayıt en yüksek riskli varlıktır (yeniden klonlanabilir, kimlik dolandırıcılığında kullanılabilir), model ise işlevsel olarak gereklidir. 30 gün grace period, model bozulursa yeniden üretim içindir.

## 3.5 Saklama süreleri ve silme

🟡 KVKK m.7 + **Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik** (🔴 ~RG 28 Ekim 2017, 30224 — doğrulanmalı):
- **Kişisel Veri Saklama ve İmha Politikası** hazırlamak, VERBİS'e kayıt yükümlüsü veri sorumluları için **zorunludur**
- **Periyodik imha aralığı azami 6 ay** 🔴
- İlgili kişi talebine **en geç 30 gün** içinde cevap 🟡

**Önerilen saklama matrisi:**

| Veri | Süre | Silme tetikleyicisi |
|---|---|---|
| Ham ses kaydı | Model üretiminden **+30 gün** | Otomatik cron |
| Voice model (bizde: voice_id) | Hesap aktif olduğu sürece | Rıza geri alma / hesap silme |
| Voice model (ElevenLabs'ta) | Aynı | **DELETE API çağrısı zorunlu** — kendinizde silmek yetmez |
| Çocuk fotoğrafı | Görsel üretimi + 30 gün | Otomatik |
| Üretilen hikâye/görsel/ses | Hesap aktif + kullanıcı silene dek | Kullanıcı talebi |
| Rıza kanıt kaydı | Rızanın sona ermesinden **+10 yıl** (TBK zamanaşımı, ispat yükü) 🟡 | Manuel |
| Fatura/muhasebe | **10 yıl** (VUK/TTK) 🟡 | Yasal saklama |

⚠️ **Rıza kanıtını uzun tutmak KVKK'ya aykırı değildir** — ispat yükü veri sorumlusundadır (m.3, genel ispat kuralları), bu meşru bir saklama amacıdır. Ancak politikada gerekçesini yazın.

## 3.6 🔴 Gözden kaçan: VERBİS muafiyeti kaybolabilir

🟡 Yıllık çalışan sayısı <50 **VE** mali bilanço <25 milyon TL olan veri sorumluları VERBİS kaydından muaftır — **ANCAK "ana faaliyet konusu özel nitelikli kişisel veri işleme olan" veri sorumluları bu istisnadan yararlanamaz** 🔴 (Kurul kararı — numara doğrulanmalı).

> **Ses klonlama ana özelliğiniz ve ses modelini biyometrik veri kabul ediyorsanız → VERBİS kaydınız muhtemelen ZORUNLUDUR**, küçük bir startup olsanız bile. Bu, birçok ekibin kaçırdığı bir noktadır. **Mutlaka doğrulatın.**

---

# 4) METİNLER VE EKRAN HARİTASI

## 4.1 Gereken belgeler (5 ayrı belge — birleştirmeyin)

| # | Belge | Hukuki dayanak | Nerede |
|---|---|---|---|
| 1 | **Aydınlatma Metni** | KVKK m.10 + Tebliğ | Kayıt ekranı, her veri toplama noktası |
| 2 | **Açık Rıza Beyanları** (modüler, 4 ayrı) | KVKK m.6, m.9 | İlgili özelliğin ilk kullanımında |
| 3 | **Gizlilik Politikası / KVKK Politikası** | Apple 5.1.1(i) 🟢, Play | App Store + Play + web + uygulama içi |
| 4 | **Kullanım Koşulları (EULA)** | Genel + Apple 1.2 🟢 | Kayıt ekranı |
| 5 | **Mesafeli Satış Sözleşmesi + Ön Bilgilendirme Formu** | 6502 s.K. | Ödeme akışı (basılı kitap için ayrı!) |

**+ İç belgeler (yayımlanmaz ama denetimde istenir):** Saklama ve İmha Politikası, VERBİS kaydı, Veri İşleyen Sözleşmeleri + SCC'ler, İhlal Müdahale Prosedürü, Erişim Yetki Matrisi, Çalışan Gizlilik Taahhütnameleri.

## 4.2 Ekran-ekran haritası

**① Kayıt / Onboarding**
```
☐ Kullanım Koşulları'nı ve Gizlilik Politikası'nı okudum, kabul ediyorum.   [zorunlu]
   ℹ️ Aydınlatma Metni  (link, ayrı sayfa)
☐ Kampanya ve tanıtım iletileri almak istiyorum.  [OPSİYONEL, ön-işaretsiz]
   → İYS kaydı gerekir (6563 s.K.)
```
⚠️ Aydınlatma metni **onay kutusu ile alınmaz** — bilgilendirmedir, rıza değildir. Görüntülenmesi yeterli, ancak görüntülendiğini loglayın.

**② Çocuk profili oluşturma** (ad, yaş, fotoğraf girildiği yer)
```
ℹ️ Çocuğunuza ait bilgiler nasıl işleniyor? [aydınlatma özeti + tam metin linki]

☐ Velisi/vasisi olduğum çocuğuma ait ad, yaş ve fotoğrafın, kişiselleştirilmiş 
  hikâye ve görsel üretimi amacıyla işlenmesine ve bu amaçla yurt dışındaki 
  yapay zekâ sağlayıcılarına aktarılmasına açık rıza veriyorum.        [zorunlu]

☐ Bu çocuğun velisi/vasisi olduğumu ve rıza vermeye yetkili olduğumu beyan ederim.
```

**③ Ses klonlama — ilk kez** ⭐ *en hassas akış*
```
Ekran 3a — AYDINLATMA (rıza YOK, sadece bilgi)
  • Sesiniz biyometrik veri niteliğinde olabilir (özel nitelikli kişisel veri)
  • Kim işliyor, hangi amaçla, kime aktarılıyor (ElevenLabs Inc., ABD)
  • Ne kadar saklanıyor, nasıl siliyorsunuz
  • KVKK m.11 haklarınız + başvuru kanalı
                                                      [Devam]

Ekran 3b — AÇIK RIZA (2 AYRI kutu, ön-işaretsiz)
  ☐ Biyometrik nitelikte ses verimin işlenmesine açık rıza veriyorum
  ☐ Ses verimin ABD'ye aktarılmasına, risklerini bilerek açık rıza veriyorum
                                            [İkisi de işaretlenmeden ilerlenemez]

Ekran 3c — SESLİ RIZA + CANLILIK (bkz. §5)
  "Lütfen ekrandaki metni okuyun:"
  ‹sunucudan gelen rastgele cümle› + sesli rıza beyanı
                                                      [🔴 Kaydet]

Ekran 3d — ONAY
  ✓ Ses profiliniz oluşturuldu.
  Ayarlar → Gizlilik → Sesim'den dilediğiniz an silebilirsiniz.
```

**④ Ödeme / basılı kitap siparişi**
```
Mesafeli Satış Sözleşmesi + Ön Bilgilendirme Formu   [ayrı onay]
⚠️ "Kişiselleştirilmiş ürün olduğundan CAYMA HAKKI BULUNMAMAKTADIR"  
   → bu ibare AÇIKÇA gösterilmezse istisna İŞLEMEZ (bkz. §7.1)
```

**⑤ Ayarlar → Gizlilik** *(Apple 5.1.1(ii) ve 5.1.1(v) gereği 🟢 zorunlu)*
```
• Verdiğim izinler ............ [her biri tek dokunuşla geri alınabilir]
• Ses profilim ................ [Dinle] [SİL]
• Verilerimi indir ............ (KVKK m.11 / GDPR m.20)
• Hesabımı sil ................ ⚠️ Apple 5.1.1(v): UYGULAMA İÇİNDE ZORUNLU
                                   Play: ayrıca WEB linki de zorunlu 🟡
• KVKK Başvuru Formu .......... (30 gün cevap süresi)
• İçerik bildir ............... ⚠️ Apple 1.2 🟢 + Play GenAI politikası
```

---

# 5) DEEPFAKE / KÖTÜYE KULLANIM ÖNLEMLERİ

## 5.1 Sektör standardı teknik kontroller

🟡 ElevenLabs'ın Professional Voice Cloning akışında **"voice verification / verification statement"** vardır: kullanıcıya dinamik bir cümle okutulup referans sesle karşılaştırılır. Instant Voice Cloning için de **"Voice Captcha"** benzeri bir doğrulama getirildiği bilgisi bende var 🔴 — **elevenlabs.io bloklu olduğu için doğrulayamadım.** Entegrasyon öncesi mutlaka kontrol edin; sağlayıcının kendi doğrulaması varsa sizinkiyle üst üste bindirin.

## 5.2 MVP'de ZORUNLU teknik kontroller (öncelik sıralı)

**P0 — MVP'siz olmaz:**

1. **Dosya yükleme YASAK.** Ses yalnızca uygulama içi mikrofonla, tek kesintisiz oturumda alınır. Import/upload endpoint'i hiç yazılmasın.
   → *Tek başına en yüksek etkili kontrol. Başkasının sesini klonlamanın en kolay yolunu kapatır.*

2. **Sunucu tarafında üretilen rastgele cümle + ASR eşleşmesi.**
   - Cümle server-side üretilir, kısa TTL (ör. 3 dk), tek kullanımlık
   - Kayıt Whisper/ASR'dan geçirilir, okunan metin beklenen metinle karşılaştırılır (Levenshtein eşiği)
   - Eşleşmezse profil oluşturulmaz
   → *Önceden hazırlanmış/indirilmiş kaydın oynatılmasını engeller.*

3. **Sesli rıza beyanının kaydın İÇİNE gömülmesi.**
   > "Ben [Ad Soyad], bugün [tarih], sesimin bu uygulamada çocuk hikâyelerinin seslendirilmesi için kullanılmasına izin veriyorum."
   → *İspat yükü sizde. Bu kayıt, hem KVKK hem TCK savunmanızın merkezidir. Ayrı ve uzun süreli saklayın.*

4. **Hesap başına ses profili limiti** (öneri: 2 — anne + baba) + yeni profil için cooldown (ör. 7 gün) + **SMS OTP ile telefon doğrulaması.**
   → *Endüstriyel ölçekte kötüye kullanımı ekonomik olarak öldürür.*

5. **Şikâyet / takedown akışı + SLA.** "Bu benim sesim, izinsiz kullanılıyor" formu, kimlik ile eşleştirme, 72 saat içinde askıya alma.
   → 🟢 **Apple 1.2 zaten zorunlu kılıyor:** "a mechanism to report offensive content and timely responses to concerns."

6. **Denetim logu:** her ses profili için → zaman, IP, cihaz parmak izi, okunan cümle, ASR skoru, gösterilen rıza metninin **versiyon hash'i**.
   → *Rıza metnini değiştirdiğinizde eski kullanıcıların hangi metne onay verdiğini kanıtlayabilmelisiniz.*

**P1 — lansmandan kısa süre sonra:**

7. **Çıktı işaretleme (watermark / C2PA).** ⚠️ **AB'ye satış yapacaksanız bu artık ZORUNLU:** 🔴 **AI Act m.50 şeffaflık yükümlülükleri 2 Ağustos 2026'da uygulanmaya başladı — yani BUGÜN yürürlükte** (doğrulanmalı, ama tarih doğruysa acildir). Sentetik ses/görüntü çıktılarının makine-okunabilir biçimde işaretlenmesi gerekir.

8. **İçerik moderasyonu** — üretilen metin ve görselde çocuk güvenliği filtreleri. ⚠️ **Çocuk fotoğrafı işlediğiniz için CSAM riski konusunda sağlayıcınızın politikasını okuyun**; yanlış pozitif hesap kapatmalarına karşı süreç kurun.

9. **Konuşmacı doğrulama (speaker verification):** yeni kayıt, mevcut profille aynı kişi mi? Aynı hesapta profil değiştirme suistimalini yakalar.

**Yapmayın:** Yüz tanıma/kimlik yükleme ile ağır KYC — MVP'de dönüşümü öldürür ve **daha fazla biyometrik veri toplayarak riski artırır.** Yukarıdaki 1+2+3 kombinasyonu orantılı ve savunulabilirdir.

## 5.3 Türk Ceza Kanunu riski

🟡 **Türkiye'de deepfake'e özgü müstakil bir suç tipi YOKTUR** (🔴 Mayıs 2026 itibarıyla; TBMM'de yasa teklifleri gündeme geldi, yasalaştığını bilmiyorum — **doğrulanmalı**). Mevcut hükümlerle kovuşturulur:

| Madde | Suç | Sizin için risk |
|---|---|---|
| **TCK m.135** | Kişisel verilerin hukuka aykırı kaydedilmesi (1–3 yıl) | Rızasız ses kaydı/model üretimi |
| **TCK m.136** | Verileri hukuka aykırı verme/yayma/ele geçirme (2–4 yıl) | **Sağlayıcıya rızasız aktarım** ⚠️ |
| **TCK m.138** | Verileri yok etmeme | Silme talebini yerine getirmeme |
| **TCK m.134** | Özel hayatın gizliliğini ihlal | Ses/görüntü kaydı |
| **TCK m.157/158** | Dolandırıcılık (bilişim ile nitelikli) | Sesinizin dolandırıcılıkta kullanılması — *fail kullanıcı, ama siz araç sağlayıcısınız* |
| **TCK m.226** | Müstehcenlik / çocuk müstehcenliği | ⚠️ Çocuk görseli üretiyorsunuz — filtre kritik |
| **TMK m.24–25, TBK m.58** | Kişilik hakkı ihlali, manevi tazminat | Ses kişilik hakkı unsurudur |

⚠️ **En yüksek risk m.136'dır** ve doğrudan §3'teki aktarım eksikliğine bağlanır: geçerli rıza/SCC olmadan yurtdışına ses göndermek "verileri hukuka aykırı olarak verme" olarak nitelenebilir. **İdari para cezası değil, hapis cezası öngörür.**

🟡 Ceza sorumluluğu gerçek kişiye aittir (tüzel kişiye hapis verilemez) — **yani şirkete değil, kurucu/yöneticiye yönelir.** Bu, konuyu bir "uyumluluk kalemi" olmaktan çıkarıp kişisel risk haline getirir.

---

# 6) APP STORE / GOOGLE PLAY

## 6.1 🟢 Apple — BU OTURUMDA DOĞRULANDI

Kaynak: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Kids Apps](https://developer.apple.com/app-store/kids-apps/)

**Sizi doğrudan bağlayan, birebir alıntılar:**

> **5.1.2(i):** "You must clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain **explicit permission** before doing so."

→ ⭐ Apple, üçüncü taraf **AI**'a veri paylaşımını açıkça ayrı olarak düzenlemiş. ElevenLabs/OpenAI'a gönderim için uygulama içi açık izin **Apple politikası gereği de** zorunlu. §4.2'deki Ekran 3b bunu karşılar.

> **1.3 (Kids Category):** "Kids Category apps **may not send personally identifiable information or device information to third parties.** Apps in the Kids Category **should not include third-party analytics or third-party advertising.**"

> **5.1.4(b):** "...apps in the Kids Category **or those that collect, transmit, or have the capability to share personal information** (e.g. name, address, email, location, **photos, videos, drawings**, ... or persistent identifiers ...) **from a minor must include a privacy policy and must comply with all applicable children's privacy statutes.**"

> **5.1.1(v):** "If your app supports account creation, **you must also offer account deletion within the app.**"

> **5.1.1(ii):** "Apps that collect user or usage data must secure user consent... Apps must also provide the customer with an **easily accessible and understandable way to withdraw consent.**"

> **1.2 (UGC):** filtreleme yöntemi + bildirim mekanizması + kullanıcı engelleme + yayımlanmış iletişim bilgisi — **dördü de zorunlu.**

> **Kids Apps — parental gate:** "adult-level tasks" (matematik işlemi, soru-cevap); okuma bilmeyen çocuklar için voiceover; IAP için **Ask to Buy** entegrasyonu; yaş bantları: **5 ve altı / 6-8 / 9-11**.

**Age rating:** 4+, 9+, 13+, 16+, 18+ (iOS 26+ için yaş aralığı değerleri değişebiliyor). 🟢 Apple dokümanı, AI üretimi içerik için ayrı bir soru **göstermiyor** — ancak "Made for Kids" işaretlemesi 4+ veya 9+ gerektiriyor; **visionOS Kids Category'ye giremiyor.**

## 6.2 🟡 Google Play — DOĞRULANAMADI (support.google.com bloklu)

Aşağıdakiler eğitim verimden, **entegrasyondan önce mutlaka doğrulayın:**

- **Families / Designed for Families Policy:** hedef kitle beyanı; 13 altı hedefleniyorsa yalnızca **Families Ads Program sertifikalı** reklam SDK'ları
- 🟡 **Yalnızca çocuklara yönelik uygulamalar AAID'ye (Android Advertising ID) erişemez** ve `AD_ID` iznini talep edemez
- **Generative AI Apps Policy** (2024): uygulama içi **rahatsız edici içerik bildirme mekanizması zorunlu** ve bu geri bildirim moderasyona beslenmeli; deepfake/cinsel içerik üretimi yasak; Play Console'da AI içerik beyanı
- **Data Safety Form** zorunlu: ses ("Audio files"), fotoğraf ("Photos and videos"), çocuk verisi kategorileri; şifreleme ve silme talebi beyanı
- 🟡 **Hesap silme: uygulama içi + ayrıca WEB üzerinden erişilebilir link zorunlu** (Apple'dan daha katı)
- **Impersonation** ve **Deceptive Behavior / manipulated media** politikaları
- **Photo Picker** kullanımı (geniş `READ_MEDIA_IMAGES` yerine)

## 6.3 ⭐ EN ÖNEMLİ ÜRÜN KARARI: Kids Category'ye GİRMEYİN

Apple'ın doğrulanmış metni bunu **matematiksel olarak zorunlu kılıyor** 🟢:

> Kids Category: "may not send **personally identifiable information** ... to third parties"
> Sizin ürününüz: çocuğun **adını ve fotoğrafını** OpenAI/ElevenLabs/görsel üreticiye gönderiyor.
>
> **→ Kids Category ile ürününüzün çekirdek işlevi UYUMSUZDUR. Reddedilirsiniz.**

**Doğru konumlandırma:**

| ✅ Yapın | ❌ Yapmayın |
|---|---|
| **Ebeveyne yönelik** uygulama (yaratıcı araç) | Kids Category'ye başvurmak |
| Age rating 4+ veya 9+ (kategori dışı) | "Çocuklar için oyun" konumlandırması |
| Play'de hedef kitle: **yetişkin/ebeveyn** | Çocuğa doğrudan pazarlama, çocuk hesabı |
| Kategori: Eğitim / Kitaplar / Yaşam Tarzı | Çocuk avatarı, çocuğu uygulamaya çeken tasarım |

**Bu tek karar aynı anda:** Apple Kids kısıtlarını, Play Families Policy yükünü, COPPA "directed to children" testini ve GDPR m.8 uygulanabilirliğini **birden hafifletir.** Hukuki açıdan raporun en yüksek kaldıraçlı tavsiyesidir.

⚠️ Ancak dikkat: **pazarlama diliniz de bunu bozmamalı.** COPPA'da "directed to children" testi görsel dil, müzik, karakterler ve reklam kanallarına bakar. App Store ekran görüntüleriniz çocuk odaklı görünürse konumlandırma savunması çöker.

---

# 7) TÜRKİYE — TİCARET HUKUKU (soruda yoktu ama MVP'yi bloklar)

## 7.1 ⚠️ Basılı kitap = fiziksel ürün satışı = 6502 sayılı Kanun

🟡 **Mesafeli Sözleşmeler Yönetmeliği** uyarınca 14 gün cayma hakkı vardır. **İstisna:** "tüketicinin istekleri veya kişisel ihtiyaçları doğrultusunda hazırlanan mallar" 🔴 (m.15/1-b — madde numarası doğrulanmalı).

> **Kişiselleştirilmiş kitabınız bu istisnaya girer — AMA istisnanın işlemesi için, sipariş ONAYINDAN ÖNCE, ön bilgilendirme formunda cayma hakkının bulunmadığının AÇIKÇA bildirilmesi ŞARTTIR.**
>
> Bildirmezseniz istisna işlemez, 14 gün cayma hakkı doğar ve **her kişiselleştirilmiş kitabı iade almak zorunda kalırsınız** — birim maliyeti yüksek fiziksel üründe bu doğrudan bir iş modeli riskidir.

🟡 Dijital içerik (hikâye/ses) için ayrı istisna: "elektronik ortamda anında ifa edilen hizmetler / anında teslim edilen gayrimaddi mallar."

## 7.2 Diğer

- 🟡 **ETBİS kaydı** (Elektronik Ticaret Bilgi Sistemi) — kendi sitenizden satış yapıyorsanız zorunlu
- 🟡 **İYS (İleti Yönetim Sistemi)** kaydı — 6563 s.K., pazarlama SMS/e-posta için zorunlu; onaylar İYS'ye yüklenmeli
- 🟡 **Ön Bilgilendirme Formu + Mesafeli Satış Sözleşmesi** — ayrı belgeler, Kullanım Koşulları'na gömülemez
- 🟡 Store IAP ile satılan dijital abonelikte tahsilat Apple/Google üzerindendir; ancak **fiziksel kitap IAP ile satılamaz** (Apple 3.1.5 — fiziksel mal/hizmet **IAP dışında** ödenmelidir) → **kitap için ayrı bir web/PSP ödeme akışı kurmanız gerekir.** 🟡 Bu bir mimari gerekliliktir.
- 🔴 Tek nüsha kişiye özel baskı için **ISBN/bandrol** gerekmediğini düşünüyorum (yayın değil) — **doğrulanmalı.**
- 🔴 **Türkiye Yapay Zekâ Kanunu**: teklif TBMM'de gündeme geldi, yasalaştığını bilmiyorum — **doğrulanmalı.**

---

# 8) ✅ MVP ZORUNLU CHECKLIST

## 🔴 P0 — Bunlar olmadan LANSMAN YAPILAMAZ

| # | Kontrol | Nereye oturur | Dayanak |
|---|---|---|---|
| 1 | **Ses klonlama OPSİYONEL** — hazır seslerle uygulama tam çalışır | Ürün mimarisi | KVKK m.3 (rıza özgür olmalı) 🟡 |
| 2 | Aydınlatma Metni ↔ Açık Rıza **AYRI ekranlar** | Ekran 3a / 3b | Aydınlatma Tebliği m.5 🟡 |
| 3 | **Granüler, ön-işaretsiz 4 rıza**: ses/biyometrik, yurtdışı, çocuk verisi, pazarlama | Ekran 1, 2, 3b | KVKK m.6, m.9 🟡 |
| 4 | ⭐ **ElevenLabs + OpenAI + bulut ile STANDART SÖZLEŞME imzala** | Ticari/hukuk | KVKK m.9 — "arızi" şartı açık rızayı men eder 🟡 |
| 5 | ⭐ **SCC'yi 5 iş günü içinde KVKK'ya bildir** | Operasyon | KVKK m.9 🔴 süre doğrulanmalı |
| 6 | **Dosya yükleme YOK** — yalnızca uygulama içi mikrofon | Ses kayıt akışı | Deepfake / TCK m.135-136 |
| 7 | **Rastgele cümle + ASR eşleşmesi** (server-side, TTL'li) | Ekran 3c | Aynı |
| 8 | **Sesli rıza beyanı kaydın içine gömülü**, ayrı saklanır | Ekran 3c + backend | İspat yükü |
| 9 | **Uygulama içi hesap silme** (+ Play için web linki) | Ayarlar → Gizlilik | 🟢 **Apple 5.1.1(v)** |
| 10 | **Tek dokunuşla rıza geri alma** + ses profili silme | Ayarlar → Gizlilik | 🟢 **Apple 5.1.1(ii)** |
| 11 | Silme, **sağlayıcıda da** tetiklenir (ElevenLabs DELETE API) | Backend job | KVKK m.7, TCK m.138 |
| 12 | **İçerik bildirme mekanizması** + iletişim bilgisi yayımlanmış | Ayarlar + destek | 🟢 **Apple 1.2** + Play GenAI 🟡 |
| 13 | **Gizlilik Politikası** — App Store + Play + uygulama içi link | Store metadata | 🟢 **Apple 5.1.1(i)** |
| 14 | ⭐ **Kids Category'ye GİRME**; ebeveyne yönelik konumlandır | Store başvurusu | 🟢 **Apple 1.3** ile uyumsuzluk |
| 15 | **Cayma hakkı YOK** ibaresi, sipariş onayından önce açıkça | Ödeme akışı | 6502 s.K. 🟡 — *iş modeli riski* |
| 16 | Ham ses **şifreli** (KMS, anahtar ayrı ortamda) | Altyapı | Kurul 2018/10 kararı 🔴 |
| 17 | **Ham ses +30 gün sonra otomatik imha** | Cron | Veri minimizasyonu |
| 18 | **Denetim logu** (zaman/IP/cihaz/rıza metni versiyon hash'i) | Backend | İspat yükü |

## 🟡 P1 — Lansmandan önce hazır, ilk 30 günde tamam

| # | Kontrol | Not |
|---|---|---|
| 19 | **VERBİS kaydı** | 🔴 Özel nitelikli veri ana faaliyetse muafiyet YOK — **doğrulat** |
| 20 | **Saklama ve İmha Politikası** (yazılı, periyodik imha ≤6 ay) | 🔴 doğrulanmalı |
| 21 | KVKK **başvuru kanalı** + 30 gün cevap süreci | m.13 |
| 22 | **Veri İhlali Müdahale Prosedürü** — Kurula 72 saat 🔴 | doğrulanmalı |
| 23 | Hesap başına **ses profili limiti** + cooldown + SMS OTP | Kötüye kullanım |
| 24 | **Takedown akışı** ("bu benim sesim") + 72 saat SLA | Apple 1.2 |
| 25 | **Play Data Safety Form** doğru doldurulmuş | 🟡 doğrulanmalı |
| 26 | **ETBİS + İYS** kayıtları | 6563 s.K. |
| 27 | Fiziksel kitap için **IAP dışı ödeme akışı** | 🟡 Apple 3.1.5 |
| 28 | Çalışan **gizlilik taahhütnameleri** + erişim yetki matrisi | Kurul 2018/10 |

## 🟢 P2 — Ölçeklenirken / yurtdışına açılırken

| # | Kontrol | Tetikleyici |
|---|---|---|
| 29 | **AI Act m.50** — sentetik içerik makine-okunabilir işaretleme | 🔴 **2 Ağu 2026'da yürürlüğe girdiyse AB satışında P0** |
| 30 | Watermark / C2PA provenance | Aynı |
| 31 | **COPPA VPC** akışı + saklama politikası yayını | ABD lansmanı |
| 32 | **GDPR m.8** yaş doğrulama + AB temsilcisi (m.27) | AB lansmanı |
| 33 | **VIA/DPIA** (Veri Koruma Etki Değerlendirmesi) | Biyometrik + çocuk = GDPR m.35 gereği zorunlu 🟡 |
| 34 | Speaker verification (profil değiştirme suistimali) | Ölçek |
| 35 | Cihaz-üstü (on-device) TTS ile yurtdışı aktarımı sıfırlama | Stratejik — tüm §3'ü ortadan kaldırır |

---

# 9) ⚠️ DOĞRULANMASI GEREKENLER (parent agent için iş listesi)

Aşağıdakiler **karar-kritik ve bu oturumda doğrulanamadı.** Erişim açıldığında öncelik sırasıyla:

| Öncelik | Doğrulanacak | Kanonik kaynak |
|---|---|---|
| 🔴 1 | **KVKK m.9 tam metni** — "arızi olmak kaydıyla" ifadesi gerçekten var mı? SCC bildirim süresi 5 iş günü mü? | `mevzuat.gov.tr` (6698 s.K.), `kvkk.gov.tr` |
| 🔴 2 | **Yurt Dışına Aktarım Yönetmeliği + SCC modül metinleri** | `kvkk.gov.tr` → Mevzuat |
| 🔴 3 | **Biyometrik Rehber** tam metni — ses davranışsal biyometrik olarak anılıyor mu? | `kvkk.gov.tr/Icerik/7048/...` |
| 🔴 4 | **VERBİS muafiyet istisnası** — "ana faaliyeti özel nitelikli veri" kriteri | `kvkk.gov.tr` → VERBİS |
| 🔴 5 | Kurul'un **ses/biyometrik kararları** var mı, karar numaraları | `kvkk.gov.tr` → Kurul Kararları |
| 🔴 6 | **AI Act m.50 yürürlük tarihi** — 2 Ağu 2026 doğru mu? | `eur-lex.europa.eu`, `artificialintelligenceact.eu` |
| 🔴 7 | **COPPA 2025 Rule** uyum tarihi ve biometric identifier tanımı | `ftc.gov/business-guidance/privacy-security/childrens-privacy` |
| 🔴 8 | **Google Play** Families + GenAI + Data Safety + AAID kuralları | `support.google.com/googleplay/android-developer` |
| 🔴 9 | **ElevenLabs** voice verification/captcha akışı, DPA, veri saklama, silme API'si | `elevenlabs.io/docs`, `elevenlabs.io/dpa` |
| 🔴 10 | **Mesafeli Sözleşmeler Yönetmeliği** m.15 cayma istisnası madde numarası | `mevzuat.gov.tr` |
| 🔴 11 | Türkiye'de **deepfake / YZ kanunu** yasalaştı mı | `tbmm.gov.tr`, `resmigazete.gov.tr` |

---

## Kaynaklar (bu oturumda erişilebilen)

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 🟢 1.2, 1.2.1, 1.3, 4.1, 4.7, 5.1.1, 5.1.2, 5.1.4, 5.2.1 doğrulandı
- [Apple — Kids Apps](https://developer.apple.com/app-store/kids-apps/) — 🟢 parental gate, yaş bantları, üçüncü taraf kısıtları doğrulandı
- [Apple — Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) — 🟢 yaş bantları doğrulandı

**Erişilemeyen (org egress politikası engelledi):** `kvkk.gov.tr`, `mevzuat.gov.tr`, `resmigazete.gov.tr`, `gdpr-info.eu`, `eur-lex.europa.eu`, `edpb.europa.eu`, `ftc.gov`, `support.google.com`, `play.google.com`, `elevenlabs.io`, `ico.org.uk`

---

**İki uyarı ile kapatıyorum:**

1. Bu bir **hukuki analiz taslağıdır, hukuki mütalaa değildir.** §8'deki P0 listesi, KVKK'ya hâkim bir avukat tarafından — özellikle 4, 5, 14, 15 ve 19 numaralı kalemler — teyit edilmeden lansman yapmayın.

2. Raporun **en yüksek etkili üç bulgusu**, sırasıyla: (a) yurtdışı aktarımda açık rızanın "arızi" şartı nedeniyle yetersiz olması → **SCC zorunluluğu**, (b) **Kids Category'ye girmeme** kararının dört ayrı rejimi birden hafifletmesi, (c) kişiselleştirilmiş kitapta **cayma hakkı ibaresinin atlanmasının** doğrudan bir iş modeli riski oluşturması. Bu üçü mimari ve ticari kararları bağlar, sonradan eklenemez.