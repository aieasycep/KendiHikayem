/**
 * story-text.ts — ÖRNEK MASALIN TAM METNİ.
 *
 * ⚠️ Bu metin ilk APK'da kullanıcıya GÖRÜNÜR. Yer tutucu değildir.
 * 6-8 yaş bandı, 12 sayfa, sayfa başına 40-70 kelime, sesli okumaya uygun ritim.
 * Karakter kanonu SPEC §8.1'deki CHARACTER_DNA örneğiyle uyumludur: Elif ve
 * turuncu peluş tilkisi Fındık (tek kulağı hafif kıvrık).
 */

export interface StoryPageText {
  pageNo: number;
  textTr: string;
  /** İskelet (Aşama 1) özeti — S09 onay ekranında bu görünür. */
  summaryTr: string;
  emotion: string;
  /** Metin kutusunun oturacağı bölge. */
  safeZone: 'bottom' | 'top' | 'left' | 'right';
}

export const SAMPLE_STORY = {
  titleTr: 'Elif ve Tavan Arasındaki Işık',
  lessonTr: 'Korkmak ayıp değildir; korkuyla birlikte bir adım daha atabilmek cesarettir.',
  blurbTr:
    'Elif bir gece tavan arasından sızan yumuşacık bir ışık fark eder. Merdivenin ilk basamağı gıcırdar, ikincisi de. Elif korkar ama merakı korkusundan biraz daha büyüktür. Yukarıda onu bekleyen şey, hiç ummadığı kadar sıcak bir arkadaşlıktır.',
  heroName: 'Elif',
  ageBand: '6-8',
  themeCode: 'cesaret',
  artStyleCode: 'suluboya',
  /** Ses profili önizlemesinde ve V08 ekranında kullanılan tanıdık cümle. */
  previewSentenceTr: 'Elif, hadi uyu artık. Yarın yeni bir maceraya çıkacağız.',
} as const;

export const SAMPLE_STORY_PAGES: StoryPageText[] = [
  {
    pageNo: 1,
    textTr:
      'Bütün ev uyumuştu. Elif yorganını çenesine kadar çekti ve tavan arasına açılan küçük kapağa baktı. Tahtanın kenarından ince, sarı bir ışık sızıyordu. Işık bir yanıyor, bir sönüyordu; sanki yukarıda biri usulca nefes alıyordu. Elif yastığının altındaki Fındık’ı, turuncu peluş tilkisini kucakladı ve fısıldadı: "Sen de gördün, değil mi?"',
    summaryTr: 'Elif gece yatağında, tavan arası kapağından sızan garip bir ışık fark eder.',
    emotion: 'merak',
    safeZone: 'bottom',
  },
  {
    pageNo: 2,
    textTr:
      'Fındık’ın tek kulağı hep biraz kıvrıktı; Elif bütün sırlarını ona anlatırdı. "Belki bir yıldızdır," dedi Elif. Ama yıldızlar tavan arasında yaşamazdı ki. Kalbi hızlı hızlı atıyordu. Yorganın altı sıcacık ve güvenliydi; yukarısı ise karanlık, tozlu ve bilinmezdi. Elif gözlerini kapattı, sonra yeniden açtı. Işık hâlâ oradaydı ve onu bekliyordu.',
    summaryTr: 'Elif korkusuyla merakı arasında kalır, Fındık’a danışır.',
    emotion: 'tedirginlik',
    safeZone: 'bottom',
  },
  {
    pageNo: 3,
    textTr:
      'Elif ayaklarını yere indirdi. Zemin serindi. Koridorun sonundaki merdiven, ay ışığında gümüş gibi parlıyordu. İlk basamağa bastığında tahta "gıcırr" diye ses çıkardı. Elif olduğu yerde donup kaldı ve Fındık’ı sıkıca göğsüne bastırdı. "Korkuyorum," dedi usulca. Sonra derin bir nefes aldı. "Ama merak ediyorum. Merakım biraz daha büyük."',
    summaryTr: 'Elif yatağından çıkar; merdivenin ilk basamağı gıcırdar ama devam eder.',
    emotion: 'cesaret',
    safeZone: 'bottom',
  },
  {
    pageNo: 4,
    textTr:
      'Anneannesi ona bir oyun öğretmişti: korkunca basamakları saymak. Elif saymaya başladı. "Bir... iki... üç..." Sesi titriyordu ama ayakları durmuyordu. "Dört... beş..." Işık her adımda biraz daha büyüdü. "Altı... yedi." Merdivenin sonundaki kapak tam önündeydi. Elif elini uzattı, parmakları soğuk tahtaya değdi ve kapağı usulca itti.',
    summaryTr: 'Basamakları sayarak korkusunu yönetir ve tavan arası kapağına ulaşır.',
    emotion: 'kararlilik',
    safeZone: 'bottom',
  },
  {
    pageNo: 5,
    textTr:
      'Kapak yavaşça açıldı. İçeriden ılık, tozlu bir hava yüzüne çarptı. Tavan arasında eski sandıklar, yün yumakları ve bir zamanlar dedesinin bindiği kırmızı bisiklet duruyordu. Havada uçuşan toz zerreleri, ışığın içinde minicik yıldızlar gibi parlıyordu. Elif ağzı açık kalarak baktı. Korkusu, birden merakının arkasına saklandı.',
    summaryTr: 'Tavan arası açılır: sandıklar, kırmızı bisiklet ve ışıkta uçuşan toz zerreleri.',
    emotion: 'hayret',
    safeZone: 'top',
  },
  {
    pageNo: 6,
    textTr:
      'Işık, pencerenin yanındaki eski bir gaz lambasından geliyordu. Elif parmak ucunda yaklaştı. Lambanın camının içinde, avucundan bile küçük, altın sarısı bir ateş böceği vardı. Kanatları yorgundu; bir yanıyor, bir sönüyordu. Elif fısıldadı: "Merhaba. Ben Elif, bu da Fındık." Ateş böceği bir kez parladı, sanki "merhaba" dedi.',
    summaryTr: 'Işığın kaynağı bulunur: eski gaz lambasının içinde küçük bir ateş böceği.',
    emotion: 'sasirma',
    safeZone: 'bottom',
  },
  {
    pageNo: 7,
    textTr:
      'Ateş böceğinin adı Işıl’dı. Akşam rüzgârı onu bahçeden buraya sürüklemiş, lambanın kapağı da arkasından kapanıvermişti. O günden beri ailesini arıyordu. "Onlar her gece beni bekliyor," der gibi pencereye doğru parladı. Elif camdan dışarı baktı: bahçenin dibinde, karanlığın içinde yüzlerce küçük ışık usul usul yanıp sönüyordu.',
    summaryTr: 'Işıl kaybolmuştur; ailesi bahçede onu beklemektedir.',
    emotion: 'sefkat',
    safeZone: 'bottom',
  },
  {
    pageNo: 8,
    textTr:
      'Elif lambanın metal kapağını çevirmeye çalıştı. Kapak kıpırdamadı. Bir daha denedi; parmakları acıdı, gözleri doldu. "Yapamıyorum," dedi ve Fındık’a baktı. Tilkinin kıvrık kulağı, her zamanki gibi "bir kere daha" der gibiydi. Elif ellerini eteğine sildi, avuçlarını lambanın soğuk kenarına yerleştirdi ve bütün gücüyle bastırdı.',
    summaryTr: 'Kapak sıkışmıştır; Elif pes etmek üzereyken bir kez daha dener.',
    emotion: 'zorlanma',
    safeZone: 'bottom',
  },
  {
    pageNo: 9,
    textTr:
      'Önce hiçbir şey olmadı. Sonra minicik bir "tık" sesi duyuldu ve kapak gıcırdayarak açıldı. Işıl bir an durdu, kanatlarını yokladı, sonra havalandı. Elif’in burnunun ucunda bir tur attı, saçının bir teline değdi ve pencereye doğru süzüldü. Elif koşup pencereyi araladı. Serin gece havası bütün odayı doldurdu.',
    summaryTr: 'Kapak açılır, Işıl özgür kalır ve pencereye yönelir.',
    emotion: 'zafer',
    safeZone: 'top',
  },
  {
    pageNo: 10,
    textTr:
      'Işıl dışarı süzüldüğü anda bahçedeki bütün ışıklar birden parladı. Bir, iki, üç... sayılamayacak kadar çok. Karanlık bahçe bir anda gökyüzüne benzedi. Işıl önce aralarına karıştı, sonra geri döndü ve tam Elif’in penceresinin önünde üç kez yanıp söndü. Elif bunun "teşekkür ederim" demek olduğunu anladı.',
    summaryTr: 'Işıl ailesine kavuşur; bahçe yüzlerce ışıkla aydınlanır.',
    emotion: 'sevinc',
    safeZone: 'bottom',
  },
  {
    pageNo: 11,
    textTr:
      'Elif tavan arasının kapağını usulca kapattı. Merdivenden inerken bu kez basamakları saymadı; saymaya ihtiyacı yoktu. Odasına girdi, Fındık’ı yastığın yanına yatırdı ve yorganın altına süzüldü. Altı yine sıcacıktı, ama artık yukarısı da korkutucu değildi. Gözlerini kapattığında hâlâ o küçük altın ışığı görebiliyordu.',
    summaryTr: 'Elif odasına döner; artık merdiveni saymadan inebilmektedir.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 12,
    textTr:
      'O geceden sonra Elif karanlıktan hiç korkmadı demek doğru olmaz; bazen yine korktu. Ama artık bir şey biliyordu: korkmak ayıp değildi. Korkuyla birlikte bir adım daha atabilmek, işte ona cesaret deniyordu. Ve cesaret, tıpkı Işıl gibi, en çok karanlıkta parlıyordu. İyi geceler Elif. İyi geceler Fındık.',
    summaryTr: 'Ders cümlesi: cesaret, korkunun yokluğu değil, korkuyla atılan adımdır.',
    emotion: 'guven',
    safeZone: 'bottom',
  },
];

/** İkinci örnek hikaye — kitaplığın tek kitapla boş görünmemesi için. */
export const SECOND_STORY = {
  titleTr: 'Ahmet ve Kaybolan Deniz Feneri',
  lessonTr: 'Yardım istemek, güçsüzlük değil akıllılıktır.',
  heroName: 'Ahmet',
  ageBand: '6-8',
  themeCode: 'dostluk',
  artStyleCode: 'pastel',
  firstPageTr:
    'Ahmet’in kasabasında her gece yanan bir deniz feneri vardı. O akşam fener yanmadı. Balıkçılar iskelede toplandı, herkes birbirine baktı. Ahmet kimseye söylemeden fenere doğru yürüdü; cebinde bir el feneri, yüreğinde bir sürü soru vardı.',
};

/* ────────────────────────────────────────────────────────────────
 * ÜÇÜNCÜ ÖRNEK: `0-2` BANDI — bebek kitabı
 *
 * ⚠️ Bu, kısaltılmış bir "büyük çocuk masalı" DEĞİLDİR; başka bir türdür.
 * 0-2 yaşta çocuk olay örgüsü takip edemez: sayfa tek cümledir (6-14 kelime,
 * bkz. `WORDS_PER_PAGE_BY_AGE_BAND`), her sayfada aynı nakarat döner
 * ("İyi geceler ...") ve çatışma yoktur — kitap bir ninni ritmidir, 8 sayfa
 * tek oturuşta biter. Elif metniyle yan yana konduğunda fark görünür olmalı:
 * aynı üretim hattı bu bantta bambaşka bir şey üretmek zorundadır.
 * ──────────────────────────────────────────────────────────────── */

export const BABY_STORY = {
  titleTr: 'Deniz’e İyi Geceler',
  lessonTr: 'Gün biter, herkes uyur; Deniz de uyur.',
  blurbTr:
    'Sekiz sayfalık bir ninni. Her sayfada bir şey uykuya gider ve aynı cümle geri döner: "İyi geceler." Uyku öncesi kucakta, iki-üç dakikada okunur.',
  heroName: 'Deniz',
  ageBand: '0-2',
  themeCode: 'uyku_zamani',
  artStyleCode: 'pastel',
  previewSentenceTr: 'İyi geceler Deniz. Yarın yine oynarız.',
} as const;

export const BABY_STORY_PAGES: StoryPageText[] = [
  {
    pageNo: 1,
    textTr: 'Gökyüzü karardı. Ay geldi. İyi geceler ay.',
    summaryTr: 'Gökyüzü kararır, ay çıkar.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 2,
    textTr: 'Kuşlar yuvaya girdi. Cik cik. İyi geceler kuşlar.',
    summaryTr: 'Kuşlar yuvalarına döner.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 3,
    textTr: 'Kedi minderine kıvrıldı. Mırr. İyi geceler kedi.',
    summaryTr: 'Kedi minderinde uyur.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 4,
    textTr: 'Kaşık tabağın yanına uzandı. İyi geceler kaşık.',
    summaryTr: 'Mutfak susar, kaşık yerine konur.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 5,
    textTr: 'Toplar sepete girdi. Pat pat. İyi geceler toplar.',
    summaryTr: 'Oyuncaklar toplanır.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 6,
    textTr: 'Ayıcık yastığa yattı. İyi geceler ayıcık.',
    summaryTr: 'Peluş ayı yatağa alınır.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 7,
    textTr: 'Deniz esnedi. Gözler ağırlaştı, eller yavaşladı.',
    summaryTr: 'Deniz uykusu gelir.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
  {
    pageNo: 8,
    textTr: 'İyi geceler Deniz. Yarın yine oynarız.',
    summaryTr: 'Nakarat kapanışı: Deniz uyur.',
    emotion: 'huzur',
    safeZone: 'bottom',
  },
];
