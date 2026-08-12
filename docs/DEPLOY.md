# KendiHikayem — Ücretsiz Dağıtım Kılavuzu

Bu belge, **tek kuruş harcamadan** KendiHikayem'i internete çıkarmanız ve telefonunuza
kurabileceğiniz bir APK üretmeniz içindir. Baştan sona takip edin; her adımın sonunda "ne
görmelisiniz" yazıyor, böylece nerede takıldığınızı bilirsiniz.

**Yığın:**

| Katman | Servis | Ücretsiz katman |
| --- | --- | --- |
| Veritabanı | Supabase PostgreSQL | Evet |
| Dosya depolama | Supabase Storage (S3 uyumlu) | Evet |
| API + worker | Render Web Service | Evet |
| Kuyruk (Redis) | Konteynerin içinde | Ücret yok |
| Mobil APK | GitHub Actions | Evet |

**Toplam süre:** ilk kurulumda 45–60 dakika.

---

## ⚠️ Önce okuyun: bu kurulum gerçek bir sunucuya karşı DENENMEDİ

Dürüst olmak gerekiyor, çünkü bir dağıtım kılavuzunda "çalışıyor" demek bir iddiadır.

**Denenen:**

- Uygulama, `PROCESS_MODE=all` ile (Fastify + BullMQ aynı süreçte) gerçek PostgreSQL ve
  gerçek Redis'e karşı yerelde ayağa kaldırıldı; `/health`, `/health/ready` ve kimlik
  doğrulamalı bir uç nokta çağrısı yanıt verdi.
- Konteynerin dosya düzeni birebir kurulup `infra/docker/entrypoint.sh` çalıştırıldı:
  gömülü Redis açıldı, migration'lar uygulandı, katalog seed'i koştu, sunucu ayağa kalktı
  ve Postgres'te bekleyen 141 iş kuyruğa geri yüklendi.
- S3 sürücüsü, **imzayı aldığı istekten yeniden türetip uyuşmazlığı 403 ile reddeden**
  gerçek bir HTTP sunucusuna karşı sınandı — Supabase'in yol ön ekli uç nokta biçimi dahil.
- `db:migrate` ve `db:seed`, üretimde çalışacak paketlenmiş hâlleriyle gerçek bir
  PostgreSQL'e uygulandı.

**Denenmeyen — çünkü bu ortamda ne hesap ne de ağ erişimi var:**

- ❌ Gerçek bir Supabase projesine hiç bağlanılmadı. Bağlantı dizesi biçimleri,
  pooler portları ve Storage uç noktası **sağlayıcının belgelerinden** yazıldı.
- ❌ Gerçek bir Supabase bucket'ına tek bir bayt yazılmadı.
- ❌ Render'a hiç dağıtım yapılmadı. `render.yaml` şema belgesine göre yazıldı.
- ❌ Docker imajı **derlenemedi**: bu ortamda Docker Hub'ın katman CDN'i (
  `production.cloudfront.docker.com`) kurumsal çıkış politikası tarafından engelli, temel
  imaj çekilemiyor. Dockerfile'ın yaptığı işin tamamı konteyner dışında birebir
  tekrarlanarak doğrulandı, ama `docker build` komutu hiç başarıyla çalışmadı.

İlk dağıtımınız bu kurulumun gerçek testidir. Bir şey tutmazsa aşağıdaki **Sorun giderme**
bölümü, tam olarak bu belirsizliklerin ürettiği hataları listeliyor.

Ayrıca arayüz detaylarında: sağlayıcılar panolarını sık değiştiriyor. Emin olmadığım
yerlerde "sağlayıcının güncel arayüzünde şuna karşılık gelen yer" diye yazdım — düğmenin
adı değişmiş olabilir, yaptığı iş değişmez.

---

## Adım 1 — Supabase projesi

### 1.1 Proje oluşturun

1. <https://supabase.com> → **Start your project** → GitHub ile giriş yapın.
2. **New project**.
3. Doldurun:
   - **Name:** `kendihikayem`
   - **Database Password:** güçlü bir parola üretin ve **hemen bir yere kaydedin.**
     ⚠️ Supabase bu parolayı bir daha göstermez. Kaybederseniz sıfırlamak zorundasınız.
   - **Region:** `Central EU (Frankfurt)` — Türkiye'ye en yakın olanı. Render'da da
     Frankfurt seçeceğiz; ikisinin aynı kıtada olması gecikmeyi yarıya indirir.
   - **Plan:** Free.
4. **Create new project** → hazırlanması 1–2 dakika sürer.

**Görmelisiniz:** proje panosu ve üstte `https://<proje-ref>.supabase.co` biçiminde bir
adres. Buradaki `<proje-ref>` (20 karakterlik harf dizisi) bu belgede tekrar tekrar lazım
olacak — bir kenara yazın.

### 1.2 İki bağlantı dizesini alın

Panoda **Connect** düğmesi (üst çubukta; bazı sürümlerde *Project Settings → Database →
Connection string* altında) size birkaç seçenek sunar. **İkisine birden** ihtiyacınız var:

| Ne için | Hangi seçenek | Port |
| --- | --- | --- |
| `DATABASE_URL` — uygulamanın kendisi | **Transaction pooler** | **6543** |
| `DATABASE_MIGRATION_URL` — migration ve seed | **Session pooler** | **5432** |

Biçimleri şuna benzer (`[YOUR-PASSWORD]` yerine 1.1'de kaydettiğiniz parolayı yazın):

```
# DATABASE_URL  (transaction pooler, 6543)
postgresql://postgres.<proje-ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# DATABASE_MIGRATION_URL  (session pooler, 5432)
postgresql://postgres.<proje-ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

> **⚠️ Neden iki ayrı dizi? Bu, atlanırsa üretimde en can sıkıcı hatayı üreten yer.**
>
> Supabase'in havuzlayıcısı (Supavisor) iki kipte çalışır ve ikisi **aynı ana makine
> adını, farklı portu** kullanır:
>
> - **6543 — transaction kipi.** Her *işlem* (transaction) farklı bir arka uç bağlantısına
>   düşebilir. Çok istemci, az bağlantı; ücretsiz katmanın istemci sınırında yaşayabilmek
>   için doğru seçim.
> - **5432 — session kipi.** Bağlantı size ait kalır. Daha az istemci alır, ama bir
>   oturumun kendi durumu vardır.
>
> Sorun şu: sürücümüz `postgres.js` her farklı sorgu için **adlandırılmış bir prepared
> statement** açar. Transaction kipinde, A bağlantısında hazırladığı ifade bir sonraki
> sorguda B bağlantısına düşer ve orada **yoktur**. Belirti:
>
> ```
> PostgresError: prepared statement "s1" does not exist
> ```
>
> Bu hata **yük altında, aralıklı** çıkar. Açılışta çıkmaz. Testte çıkmaz. Üç kullanıcıyla
> denerken çıkmaz. Otuz kullanıcıda çıkar ve tekrarlanamaz.
>
> Kod bunu **kendiliğinden hallediyor**: `packages/config` bağlantı dizesine bakıyor, 6543
> portundaki bir Supabase pooler'ı (ya da `?pgbouncer=true` parametresi) görürse prepared
> statement'ları kapatıyor (`DATABASE_PREPARED_STATEMENTS=auto`, varsayılan). Doğrudan
> bağlantıda açık bırakıyor, çünkü orada kaybedecek bir şey yok.
>
> Migration'ların ayrı diziye ihtiyacı olmasının sebebi farklı: DDL'in çok ifadeli ve kilit
> varsayımları var ve bunlar oturum kipinde geçerli. `db:migrate` ve `db:seed`,
> `DATABASE_MIGRATION_URL` doluysa onu tercih eder.

### 1.3 Depolama bucket'larını oluşturun

Sol menü → **Storage** → **New bucket**. **İki** bucket oluşturun, **ikisi de Private**
(Public kesinlikle DEĞİL):

| Bucket adı | İçeriği |
| --- | --- |
| `kh-media` | Çizimler, ses render'ları, PDF'ler |
| `kh-voice-raw` | ⚠️ Ham ses referans kayıtları |

> **⚠️ İki bucket, tek bucket değil — KVKK.** Bir ebeveynin ses klonlama için okuduğu ham
> kayıt, bir masal sayfasının çiziminden farklı bir veri sınıfıdır: farklı saklama süresi
> (+30 gün sonra imha), farklı erişim, farklı hukuki dayanak. Kod bucket'ı **her çağrının
> parametresi** olarak taşır (`apps/worker/src/processors/audio-storage.ts`) — tam olarak
> bunu düşünmeyen bir çağıranın referans kaydını sayfa çiziminin yanına yazmasını
> engellemek için. Tek bucket'a koyarsanız bu koruma çalışmaya devam eder ama koruduğu
> şey kalmaz.
>
> **Public bucket asla.** Ürünün tamamı çocuk verisi; her URL imzalı ve süreli olmalı.

### 1.4 S3 erişim anahtarlarını üretin

Sol menü → **Storage** → **Settings** (ya da **S3 Access Keys** sekmesi; sağlayıcının
güncel arayüzünde depolama ayarları altındaki "S3 uyumlu erişim" bölümü) → **New access
key**.

Üç değeri not alın:

```
S3_ENDPOINT=https://<proje-ref>.storage.supabase.co/storage/v1/s3
S3_REGION=eu-central-1          # projenizin bölgesi
S3_ACCESS_KEY_ID=<üretilen>
S3_SECRET_ACCESS_KEY=<üretilen, bir daha gösterilmez>
```

> **⚠️ Uç noktayı KISALTMAYIN.** `/storage/v1/s3` kısmı yolun parçası ve **imzanın**
> parçası. Yalnızca `https://<ref>.storage.supabase.co` yazarsanız sürücü bir yolu imzalar,
> başka bir yolu gönderir ve **her çağrı** şununla döner:
>
> ```
> 403 SignatureDoesNotMatch
> ```
>
> Yanıtın içinde neyin yanlış olduğuna dair hiçbir ipucu olmaz. Sürücü ön eki koruyup
> imzalıyor (`packages/media/src/storage/s3.ts`), yeter ki siz onu girin.

> **⚠️ Bu anahtarlar projenin `anon` / `service_role` anahtarları DEĞİL.** Ayrı bir çifttir
> ve yalnızca depolamaya erişir.

> **⚠️ `S3_KMS_KEY_ID` ve `S3_VOICE_KMS_KEY_ID` BOŞ kalmalı.** Bunlar AWS KMS içindir.
> Supabase'de SSE-KMS yoktur; dolu bırakırsanız sürücü `x-amz-server-side-encryption`
> başlığı gönderir ve Supabase isteği reddeder. Supabase'de şifreleme depolama katmanında
> yapılır. KVKK ayrımını burada **bucket ayrılığı** taşıyor, ayrı anahtar değil — bu bir
> ücretsiz katman ödünü ve ücretli katmana geçince düzeltilmeli.

---

## Adım 2 — Şemayı ve katalogu yükleyin

İki yol var. **Yol A** ilk kurulum için daha güvenli (hatayı kendi ekranınızda görürsünüz).

### Yol A — Kendi bilgisayarınızdan (önerilir)

Gerekenler: Node 22 ve pnpm 10 (`corepack enable` yeterli).

```bash
git clone <depo-adresiniz> kendihikayem
cd kendihikayem
pnpm install --frozen-lockfile

# ⚠️ Migration SESSION pooler'ından (5432) çalışır.
export DATABASE_MIGRATION_URL='postgresql://postgres.<ref>:<parola>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'

pnpm db:migrate
```

**Görmelisiniz:**

```
[db:migrate] hedef: postgresql://postgres.xxx:***@aws-0-...:5432/postgres
[db:migrate] klasör: /.../packages/db/migrations
[db:migrate] tamam — tüm migration'lar uygulandı.
```

Sonra katalogu yükleyin:

```bash
NODE_ENV=production pnpm db:seed
```

**Görmelisiniz:**

```
[db:seed] katalog…
[db:seed] NODE_ENV=production — geliştirme verisi ATLANDI.
  legal_documents              5
  plans                        3
  story_themes                 8
  art_styles                   3
  character_builder_options   26
  book_formats                 2
  system_voices                3
  voice_scripts                6
[db:seed] tamam.
```

> **`NODE_ENV=production` şart.** Onsuz seed, geliştirme fixture'ını da yazar: sahte bir
> ebeveyn, iki sahte çocuk, bir sahte masal. Gerçek veritabanınıza sahte bir "Ayşe"
> eklemek, ancak bir müşteri fark ettiğinde anlaşılan türden bir hatadır.
>
> **Seed'i tekrar çalıştırmak zararsızdır.** Her satır deterministik UUID ile anahtarlı,
> ikinci çalıştırma no-op.
>
> **Katalog üretimde de gereklidir.** Onsuz üreticinin prompt paketi ve maliyet tavanı yok
> — ürün açılır ama hiçbir masal üretemez.

Supabase panosunda **Table Editor**'e bakın: `jobs`, `stories`, `plans`, `story_themes`
gibi tablolar görünüyor olmalı.

### Yol B — Render açılışta yapsın

`render.yaml` içinde `RUN_MIGRATIONS_ON_BOOT=true` ve `RUN_SEED_ON_BOOT=true` zaten var.
Servis her açıldığında migration'ları uygular ve katalogu yazar.

> **⚠️ Bu yalnızca TEK örnek çalıştığı için güvenli.** Ücretsiz katman zaten tek örnek
> verir. Ücretli plana geçip örnek sayısını artırırsanız **kapatın**, yoksa iki örnek aynı
> anda migration çalıştırır.
>
> Yol B'nin dezavantajı: migration hata verirse bunu Render'ın log ekranında, dağıtım
> döngüsünün ortasında görürsünüz.

---

## Adım 3 — Render servisi

### 3.1 Kodu GitHub'a koyun

Render'ın depoyu okuyabilmesi gerekiyor. Depo **private** olabilir; Render'a erişim izni
verirsiniz.

### 3.2 Servisi oluşturun

1. <https://render.com> → GitHub ile giriş.
2. **New +** → **Blueprint** (sağlayıcının güncel arayüzünde "Blueprint" ya da
   "Blueprints" adıyla; depodaki `render.yaml`'ı okuyan seçenek budur).
3. Deponuzu seçin → Render `render.yaml`'ı bulur ve **kendihikayem-api** adında bir web
   servisi önerir.
4. **Apply** / **Create**.

Blueprint yoksa elle de kurabilirsiniz: **New + → Web Service** → depo → **Runtime:
Docker**, **Region: Frankfurt**, **Plan: Free**, **Health Check Path: `/health`**.

### 3.3 Ortam değişkenlerini girin

Blueprint'te `sync: false` yazan her değişken **sizden** gelmeli. Servis sayfası →
**Environment** sekmesi:

| Değişken | Değer |
| --- | --- |
| `DATABASE_URL` | 1.2'deki **transaction pooler** dizisi (**6543**) |
| `DATABASE_MIGRATION_URL` | 1.2'deki **session pooler** dizisi (**5432**) |
| `S3_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | `eu-central-1` (projenizin bölgesi) |
| `S3_ACCESS_KEY_ID` | 1.4'ten |
| `S3_SECRET_ACCESS_KEY` | 1.4'ten |
| `PUBLIC_BASE_URL` | 3.4'te dolduracaksınız |
| `AUTH_BASE_URL` | 3.4'te dolduracaksınız |

`AUTH_SECRET` blueprint'te `generateValue: true` — Render kendisi üretir, dokunmayın.

Sağlayıcı anahtarları (`GOOGLE_GENAI_API_KEY`, `OPENAI_API_KEY`, …) **şimdilik boş**.
`API_MODE=mock` iken hiçbiri okunmaz.

### 3.4 Adresi öğrenip geri yazın

İlk dağıtım bittiğinde Render size şu biçimde bir adres verir:

```
https://kendihikayem-api.onrender.com
```

Bu adresi **Environment** sekmesinde `PUBLIC_BASE_URL` **ve** `AUTH_BASE_URL` alanlarına
yazın (başındaki `https://` dahil, sonunda `/` **olmadan**) ve kaydedin. Render yeniden
dağıtır.

> **⚠️ Neden otomatik değil?** Render'ın `fromService … property: host` ifadesi yalnızca
> ana makine adını verir (`kendihikayem-api.onrender.com`), oysa buraya **tam URL** gerekli.
> Şemasız değeri zod açılışta reddeder — sessizce yanlış çalışmaktansa açılışta durması
> daha iyi, çünkü bu değer üzerinden **imzalı medya URL'leri** kuruluyor.
>
> `NODE_ENV=production` altında `http://` de reddedilir: imzalı bir URL http üzerinde sızar.

### 3.5 İlk dağıtımı izleyin

Servis sayfası → **Logs**. Şu sırayı görmelisiniz:

```
[entrypoint] gömülü Redis başlatılıyor (REDIS_MODE=embedded)
[entrypoint] gömülü Redis hazır
[entrypoint] migration'lar uygulanıyor
[db:migrate] tamam — tüm migration'lar uygulandı.
[entrypoint] katalog seed'i çalıştırılıyor
[db:seed] tamam.
[entrypoint] sunucu başlatılıyor (PROCESS_MODE=all, PORT=10000)
[worker] listening on queues: llm, image, voice, media, print, ops
[worker] queues: llm, image, voice, media, print, ops — resumed 0 job(s) from Postgres
[api] listening on http://0.0.0.0:10000 (mode: all)
```

⭐ `mode: all` satırı kritiktir: **API ve worker aynı süreçte** çalışıyor demektir.
`mode: api` görürseniz `PROCESS_MODE` değişkeni yanlış ve hiçbir masal üretilmez —
istekler kabul edilir, kuyruğa girer ve orada durur.

---

## Adım 4 — Mobil uygulamayı bağlayın ve APK çıkarın

### 4.1 GitHub Actions ile (en kolay)

1. GitHub'da deponuz → **Actions** sekmesi.
2. Sol listeden **Android APK** → sağda **Run workflow**.
3. Açılan formu doldurun:
   - **api_mode:** `live`
   - **api_base_url:** `https://kendihikayem-api.onrender.com` (3.4'teki adres)
4. **Run workflow**. Derleme ~10 dakika sürer.
5. Bittiğinde APK iki yerden alınabilir:
   - Çalışmanın altındaki **Artifacts** → `kendihikayem-debug-apk` (ZIP, GitHub girişi ister)
   - Depo → **Releases** → `apk-son` etiketi → `kendihikayem.apk` (girişsiz, telefondan
     doğrudan indirilebilir — testçilere bu linki verin)

> **⚠️ API adresi APK'nın İÇİNE gömülür.** Expo `EXPO_PUBLIC_*` değişkenlerini derleme
> anında JS paketine yazar (`apps/mobile/app.config.ts`). Çalışan uygulamada
> değiştirilebilen bir ayar değildir: Render adresi değişirse **yeni bir APK** gerekir.
>
> `api_mode: mock` bırakırsanız uygulama tamamen demo veriyle çalışır — backend'e hiç
> bağlanmaz, telefonda internet olmadan bile açılır. Backend'i kurmadan arayüzü göstermek
> için bu kiptir.

### 4.2 Kendi bilgisayarınızda derlemek isterseniz

```bash
cd apps/mobile
export EXPO_PUBLIC_API_MODE=live
export EXPO_PUBLIC_API_BASE_URL=https://kendihikayem-api.onrender.com

npx expo prebuild --platform android --clean --no-install
cd android
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

JDK 17 ve Android SDK gerekir.

### 4.3 Telefona kurun

1. APK'yı telefona indirin.
2. Android **Bilinmeyen kaynaklardan yükleme** iznini isteyecek — dosya yöneticisi ya da
   tarayıcı için verin.
3. Kurun ve açın.

Uygulama içinde **Ayarlar** ekranında bir kip rozeti var: `Canlı API — https://…` yazıyorsa
doğru APK'yı kurmuşsunuz. `Demo veri (mock)` yazıyorsa `api_mode` girdisi `mock` kalmış.

---

## Adım 5 — Sağlık kontrolü: gerçekten çalışıyor mu?

Sırayla yapın. Her biri bir öncekinin doğru olduğunu varsayar.

### 5.1 Servis ayakta mı?

```bash
curl https://kendihikayem-api.onrender.com/health
```

Beklenen:

```json
{
  "ok": true,
  "service": "kendihikayem-api",
  "processMode": "all",
  "queues": "connected",
  "uptimeSec": 42,
  "endpoints": { "implemented": 7, "pending": 75 },
  "sseConnections": 0
}
```

Kontrol edin:

- `processMode` **`all`** olmalı. Değilse worker çalışmıyor.
- `queues` **`connected`** olmalı. `unavailable` ise Redis açılmamış — logda
  `[entrypoint] gömülü Redis hazır` satırını arayın.

⚠️ Servis uyuyorsa bu istek **30–60 saniye** sürer. Bu bir hata değil, ücretsiz katmanın
davranışı (aşağıya bakın).

### 5.2 Veritabanına ulaşılıyor mu?

```bash
curl https://kendihikayem-api.onrender.com/health/ready
```

Beklenen:

```json
{
  "ok": true,
  "database": "reachable",
  "databaseLatencyMs": 34,
  "processMode": "all",
  "queues": "connected"
}
```

503 alıyorsanız `DATABASE_URL` yanlış ya da parola hatalı. Yanıtın `detail` alanı sebebi
söyler.

> `/health` ve `/health/ready` neden ayrı? Render'ın sağlık kontrolü `/health`'e bakıyor ve
> o uç nokta **hiçbir şeye dokunmuyor**. Veritabanına soran bir liveness kontrolü, yavaş
> bir veritabanını yeniden başlatma döngüsüne çevirir: kontrol zaman aşımına uğrar, platform
> süreci öldürür, yenisi aynı yavaş veritabanını bulur — ve atlatılabilir bir sorun
> yüzünden ürün tamamen durur.

### 5.3 Katalog yüklendi mi?

Supabase panosu → **Table Editor** → `story_themes` tablosu. **8 satır** olmalı
(`plans` 3, `book_formats` 2). Boşsa Adım 2'yi tekrarlayın.

### 5.4 Kuyruk çalışıyor mu?

Render log ekranında şu satırı arayın:

```
[worker] listening on queues: llm, image, voice, media, print, ops
```

Bu satır varsa altı kuyruk tüketicisi de aynı süreçte dinliyor.

### 5.5 Uygulama sunucuya bağlanıyor mu?

Telefonda uygulamayı açın. **Ayarlar** ekranındaki rozet `Canlı API — https://…`
göstermeli. Servis uyuyorsa ilk ekran ~1 dakika boş kalabilir; sonra dolar.

---

## Ücretsiz katman sınırları — sürpriz olmasın

### Render (Free Web Service)

| Sınır | Değer | Ne demek |
| --- | --- | --- |
| **Uyku** | 15 dk trafiksizlikten sonra | Servis durur. Sonraki istek onu uyandırır ve **30–60 saniye** bekler. |
| Aylık kota | 750 örnek-saat | Tek servis için ayın tamamına yeter. İki servis çalıştırırsanız yetmez. |
| RAM | 512 MB | API + worker + Redis hepsi bunun içinde. Sıkışık ama yeter. |
| CPU | 0.1 paylaşımlı | Görsel işleme yavaş olacak. |
| **Disk** | **Kalıcı DEĞİL** | Yeniden başlatmada her şey silinir. Bu yüzden `MEDIA_STORAGE_DRIVER=s3`. |
| Bant genişliği | 100 GB/ay | Bu ürün için bol. |

> **⭐ Uyku, kaybolan iş demek değil.** Servis uyurken üretim yapılamaz, ama uyanınca
> **kaldığı yerden devam eder**. Gerekçe: BullMQ kuyrukları yalnızca *işaretçi* taşır —
> gerçek durum PostgreSQL'de. Uyanışta `resumeRecoverableJobs()` Postgres'e "hangi işler
> hâlâ çalışıyor görünüyor?" diye sorar ve onları kuyruğa geri koyar. Logda göreceğiniz
> satır bu:
>
> ```
> [worker] queues: … — resumed 3 job(s) from Postgres
> ```
>
> ⚠️ Bir istisna var ve dürüstçe yazıyorum: **fan-out ağaçları** (bir kitabın 13 sayfalık
> görsel üretimi, bir seslendirmenin parçaları) yeniden kurulmuyor. Bunların çocuk
> işleri sayfa/parça başına işaretçi taşır ve `jobs` satırı bu bilgiyi tutmuyor.
> Yeniden kurmaya çalışmak, hiçbir şey çizmemiş bir kitabı "tamamlandı" diye kapatmak
> olurdu. Böyle bir iş **rapor edilir**, sessizce kaybolmaz — logda
> `needsOwnerAttention` sayısı olarak görünür.
>
> **Uyumayı önlemek** isterseniz: dışarıdan 10 dakikada bir `/health`'e istek atan
> ücretsiz bir izleme servisi (UptimeRobot vb.) kurun. ⚠️ Bu, 750 saatlik aylık kotayı
> tamamen tüketir — tek servis çalıştırdığınız sürece sorun değil.

### Supabase (Free)

| Sınır | Değer | Ne demek |
| --- | --- | --- |
| Veritabanı | 500 MB | Metin ve iş kaydı için çok. Dosyalar burada değil. |
| Depolama | 1 GB | ⚠️ **İlk dolacak yer bu.** Bir kitabın görselleri ~20–50 MB. |
| Depolama trafiği | 2 GB/ay | |
| **Duraklatma** | **7 gün hareketsizlik** | ⚠️ Proje otomatik durdurulur; panodan elle geri açılır. |
| Bağlantı | Pooler üzerinden sınırlı | `DATABASE_POOL_MAX=5` bu yüzden. |
| Yedek | Yok | ⚠️ Ücretsiz katmanda otomatik yedek yok. |

> **⚠️ 7 gün kuralı en can sıkıcı olanı.** Bir hafta hiç kullanmazsanız Supabase projeyi
> duraklatır ve API'niz veritabanına ulaşamaz hâle gelir (`/health/ready` 503 döner).
> Panodan **Restore** ile geri açılır, veri kaybolmaz. Render'ın uyanma isteği bunu
> engellemez — Supabase'in saydığı şey **veritabanı** hareketliliği.

### Toplam kapasite

Bu kurulum **demo, test ve ilk kullanıcılar** içindir. Kabaca:

- ~20–30 kitap (1 GB depolama sınırı)
- Aynı anda birkaç kullanıcı (0.1 CPU)
- Kesintisiz çalışma garantisi **yok**

Mağazaya yükleyip gerçek kullanıcı almaya başladığınızda ilk ödemeniz gereken şey
**Render Starter ($7/ay)** olacak — uyku kalkar ve RAM artar.

---

## Redis kararı: neden konteynerin içinde?

Bu, bu kurulumdaki en tartışmalı seçim, o yüzden gerekçesi burada.

BullMQ'nun Redis'e ihtiyacı var. Ücretsiz katmanda üç seçenek vardı:

**1. Upstash ücretsiz Redis — seçilmedi.**
BullMQ'yu destekliyor ve TLS'li bir uç nokta veriyor. Sorun kota: Upstash ücretsiz katmanı
**komut sayısıyla** ölçüyor, BullMQ ise boştayken bile konuşkan. Altı kuyruğun her biri
kendi stalled-job kontrolünü (varsayılan 30 saniyede bir) ve engelleyen okumasını yürütür.
Kabaca hesap, hiç iş yokken bile ayda milyon mertebesinde komut demek — ücretsiz kotanın
kat kat üstü. Kotayı aştığınızda kuyruk **sessizce** durur, ki bu yavaşlamaktan beterdir.

**2. Konteynerin içinde Redis — SEÇİLEN.**
`redis-server` çalışma imajına kuruluyor ve giriş noktası onu loopback'te başlatıyor
(`infra/docker/entrypoint.sh`). Maliyet sıfır, kota yok, gecikme yok.

Bedeli: **her yeniden başlatmada Redis boşalıyor** (Render'ın diski kalıcı değil, üstelik
`--save ''` ile kalıcılığı zaten kapattık).

Bu kabul edilebilir, çünkü **mimari zaten bunu varsayıyordu**. `apps/worker/src/queues.ts`
başlığı yıllardır şunu söylüyor: *"Kuyruklar İŞARETÇİ tutar. Yük PostgreSQL'de, yani
kaybolan bir Redis yeniden kuyruklamadır, veri kaybı değil."* Eksik olan tek şey,
yeniden kuyruklamayı gerçekten **yapan** kodun olmasıydı — `recoverableJobs()`'un tek
çağrısı öksüz işleri sayıp sayıyı atıyordu. Artık `resumeRecoverableJobs()` açılışta bunu
yapıyor ve bu bir testle sabitlendi
(`apps/worker/test/cold-start.integration.test.ts`: kuyrukları tamamen sil, aç, işler
kimliğiyle ve kalan deneme bütçesiyle geri gelsin).

**3. Redis'i tamamen bırakıp Postgres tabanlı kuyruk — seçilmedi.**
BullMQ'nun yerine geçmek, akış (flow) ağaçlarını, hız sınırlayıcılarını ve yeniden deneme
politikasını sıfırdan yazmak demekti. Ücretsiz barındırma için ödenecek bedel bu değil.

### Upstash'e geçmek isterseniz

Tek satır:

```
REDIS_MODE=external
REDIS_URL=rediss://default:<parola>@<bölge>.upstash.io:6379
```

TLS şemadan (`rediss://`) otomatik açılır. Kod yolu hiç değişmiyor.

⚠️ `REDIS_MODE=embedded` bırakıp `REDIS_URL`'i uzak bir adrese vermek **açılışta
reddedilir**. Sebebi: ortada iki Redis olurdu — biri konteynerde, biri uzakta. İşler
birine yazılır, diğerinden okunmaya çalışılırdı. İkisi de hata vermezdi. Kuyruk işleri
sessizce yutuyor gibi görünürdü.

---

## Sorun giderme

### `prepared statement "s1" does not exist`

Transaction pooler'a prepared statement açılıyor. `DATABASE_PREPARED_STATEMENTS=off`
yapın. (Otomatik algılama yalnızca `*.pooler.supabase.com:6543` ve `?pgbouncer=true`
biçimlerini tanıyor; başka bir havuzlayıcı kullanıyorsanız elle kapatın.)

### `403 SignatureDoesNotMatch` — depolama çağrılarında

Sırayla kontrol edin:

1. `S3_ENDPOINT` **`/storage/v1/s3` ile bitiyor mu?** En sık sebep bu.
2. `S3_REGION` bucket'ın gerçek bölgesi mi? SigV4 bunu imzanın kapsamına koyuyor,
   yanlış bölge geçersiz imza demek.
3. `S3_FORCE_PATH_STYLE=true` mı? Supabase sanal host stilini desteklemiyor.
4. `S3_KMS_KEY_ID` boş mu? Dolu olması gönderilmeyecek bir başlığı gönderir.

### `Cannot find package 'ioredis'` (ya da `pino`)

İmaj eksik derlenmiş. `infra/bundle/server.mjs` içindeki `EXTERNAL` listesi ile
`dist/package.json` uyuşmuyor demektir. Render'da **Manual Deploy → Clear build cache &
deploy** deneyin.

### Servis açılıyor ama `processMode: "api"` diyor

`PROCESS_MODE` değişkeni `all` değil. Render → Environment → düzeltin. Bu hâlde istekler
kabul edilir, işler kuyruğa girer ve **hiç işlenmez** — hiçbir hata görmezsiniz, sadece
hiçbir masal bitmez.

### `/health` yanıt vermiyor, log da yok

Servis uyuyor. 60 saniye bekleyin. Hâlâ yoksa Render'ın **Events** sekmesinde başarısız
bir dağıtım var mı bakın.

### `/health/ready` 503, `database: unreachable`

- Bağlantı dizisindeki parola doğru mu? (`[YOUR-PASSWORD]` yerini gerçekten doldurdunuz mu?)
- Supabase projesi **duraklatılmış** olabilir (7 gün hareketsizlik) — panodan geri açın.
- `DATABASE_URL` pooler adresi mi? Doğrudan `db.<ref>.supabase.co` adresi **IPv6**'dır ve
  Render'dan erişilemeyebilir. Pooler adresi IPv4 verir.

### Migration `permission denied` diyor

`DATABASE_MIGRATION_URL` transaction pooler'ını (6543) gösteriyor olabilir. Session
pooler'ına (**5432**) çevirin.

### Uygulama "bağlanılamıyor" diyor

- APK doğru adresle mi derlendi? Ayarlar ekranındaki rozete bakın.
- Adres `https://` ile mi başlıyor?
- Servis uyuyor olabilir — tarayıcıdan `/health`'e girip uyandırın, sonra tekrar deneyin.

---

## Sonraki adımlar

### AI sağlayıcılarını açmak (`API_MODE=live`)

`API_MODE=mock` iken uygulama uçtan uca çalışır ama masallar sabit demo verisidir. Gerçek
üretim için sağlayıcı anahtarı gerekiyor. Anahtarları Render → Environment'a girip
`API_MODE=live` yapın; **başka hiçbir değişiklik gerekmez**.

> ⚠️ Eksik anahtarla `live` yapmak **açılışta hata verir**. Bu bilinçli: sessizce sahte
> veriye düşen bir üretim sistemi, düşmeyen bir sistemden beterdir.

> ⚠️ **`live`'a geçmeden önce maliyet tavanlarını gözden geçirin.**
> `COST_CAP_DAILY_USD` sizinle beklenmedik bir fatura arasındaki tek şey. `render.yaml`
> ücretsiz katman için bunu **5 USD/gün**'e çekiyor; ihtiyacınıza göre ayarlayın.

### İki servise ayırmak (ücretli katman)

`render.yaml`'ı ikiye bölün:

- `kendihikayem-api` → `PROCESS_MODE=api`
- `kendihikayem-worker` → `type: worker`, `PROCESS_MODE=worker`

Ayrıca `REDIS_MODE=external` yapıp yönetilen bir Redis bağlayın (iki süreç aynı Redis'i
görmek zorunda).

**Kodda hiçbir değişiklik gerekmez.** `all` kipi baştan bir paketleme kararıydı, mimari
değil: ikisi de aynı iki fonksiyonu (`buildServer()` ve `startWorkerRuntime()`) aynı
argümanlarla çağırıyor.

### Yedekleme

Supabase ücretsiz katmanında otomatik yedek yok. Gerçek kullanıcı almaya başladığınızda
ilk yapılacak iş budur:

```bash
pg_dump "$DATABASE_MIGRATION_URL" > yedek-$(date +%F).sql
```
