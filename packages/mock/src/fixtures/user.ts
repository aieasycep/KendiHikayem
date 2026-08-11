/**
 * user.ts — kullanıcı, haklar, rıza durumu, çocuklar, hukuki metinler, veri haritası.
 */

import {
  childSchema,
  consentStateSchema,
  entitlementsSchema,
  legalDocumentSchema,
  meSchema,
  privacyRequestSchema,
  type Child,
  type ConsentState,
  type DataMapCategory,
  type Entitlements,
  type LegalDocument,
  type LegalDocumentKind,
  type Me,
  type PrivacyRequest,
} from '@kendihikayem/contract';

import { IDS } from './ids';
import { MOCK_NOW, mockPdf } from './media';

const fakeSha = (seed: string): string =>
  seed.padEnd(64, '0abcdef123456789').slice(0, 64).toLowerCase().replace(/[^0-9a-f]/g, '0');

export const ENTITLEMENTS: Entitlements = entitlementsSchema.parse({
  planCode: 'kredi_baslangic',
  periodStart: '2026-08-01T00:00:00Z',
  periodEnd: '2026-09-01T00:00:00Z',
  stories: { used: 2, limit: null },
  credits: 340,
  voiceProfiles: { used: 1, limit: 2 },
  costCap: { usedUsd: 6.42, capUsd: 25, blocked: false },
  canCloneVoice: true,
});

export const CONSENT_STATE_GRANTED: ConsentState = consentStateSchema.parse({
  ses_biyometrik: {
    granted: true,
    grantedAt: '2026-08-03T20:11:00Z',
    documentVersion: '1.2',
    documentSha256: fakeSha('riza-ses'),
    method: 'explicit_checkbox',
    needsRenewal: false,
  },
  yurtdisi_aktarim: {
    granted: true,
    grantedAt: '2026-08-03T20:11:04Z',
    documentVersion: '1.1',
    documentSha256: fakeSha('riza-yurtdisi'),
    method: 'explicit_checkbox',
    needsRenewal: false,
  },
  cocuk_verisi: {
    granted: true,
    grantedAt: '2026-08-01T18:02:00Z',
    documentVersion: '1.0',
    documentSha256: fakeSha('riza-cocuk'),
    method: 'explicit_checkbox',
    needsRenewal: false,
  },
  pazarlama: { granted: false, needsRenewal: false },
});

/** Yeni kullanıcı: hiçbir rıza yok. Ses akışının giriş durumu. */
export const CONSENT_STATE_EMPTY: ConsentState = consentStateSchema.parse({
  ses_biyometrik: { granted: false, needsRenewal: false },
  yurtdisi_aktarim: { granted: false, needsRenewal: false },
  cocuk_verisi: { granted: false, needsRenewal: false },
  pazarlama: { granted: false, needsRenewal: false },
});

export const ME: Me = meSchema.parse({
  id: IDS.user,
  isGuest: false,
  displayName: 'Ayşe',
  phoneMasked: '+90 5** *** ** 67',
  emailMasked: 'a****@gmail.com',
  locale: 'tr-TR',
  timezone: 'Europe/Istanbul',
  marketingOptIn: false,
  entitlements: ENTITLEMENTS,
  consentState: CONSENT_STATE_GRANTED,
  flags: {
    ses_klonlama: true,
    baski: true,
    mp4_disa_aktarim: true,
    devam_hikayesi: true,
  },
});

export const GUEST_ME: Me = meSchema.parse({
  ...ME,
  id: IDS.guestUser,
  isGuest: true,
  displayName: undefined,
  phoneMasked: undefined,
  emailMasked: undefined,
  consentState: CONSENT_STATE_EMPTY,
  entitlements: entitlementsSchema.parse({
    ...ENTITLEMENTS,
    planCode: 'misafir',
    stories: { used: 0, limit: 1 },
    credits: 60,
    voiceProfiles: { used: 0, limit: 0 },
    canCloneVoice: false,
  }),
});

export const CHILDREN: Child[] = [
  {
    id: IDS.childElif,
    givenName: 'Elif',
    nickname: 'Elo',
    ageBand: '6-8',
    birthYear: 2019,
    genderPresentation: 'kiz',
    interests: ['hayvanlar', 'uzay', 'resim'],
    defaultCharacterId: IDS.characterElif,
    storyCount: 2,
    createdAt: '2026-07-28T09:14:00Z',
  },
  {
    id: IDS.childAhmet,
    givenName: 'Ahmet',
    ageBand: '6-8',
    birthYear: 2018,
    genderPresentation: 'erkek',
    interests: ['futbol', 'deniz'],
    storyCount: 1,
    createdAt: '2026-07-30T17:40:00Z',
  },
  {
    id: IDS.childZeynep,
    givenName: 'Zeynep',
    ageBand: '3-5',
    birthYear: 2021,
    genderPresentation: 'kiz',
    interests: ['muzik', 'hayvanlar'],
    storyCount: 0,
    createdAt: '2026-08-05T08:05:00Z',
  },
].map((child) => childSchema.parse(child));

/* ── Hukuki metinler ─────────────────────────────────────────── */

const AYDINLATMA_SES_MD = `# Ses Verisi Aydınlatma Metni

Bu metin, KendiHikayem uygulamasında **ses klonlama** özelliğini kullanmayı seçmeniz
hâlinde kişisel verilerinizin nasıl işlendiğini anlatır. Bu ekranda **onay kutusu yoktur**;
yalnızca bilgilendirilirsiniz. Açık rızanız bir sonraki ekranda, ayrı ayrı alınır.

## Hangi veriler işleniyor?
- Uygulama içi mikrofonla kaydettiğiniz **ses kayıtları** (4 pasaj + sesli rıza klibi)
- Kaydın **kalite ölçümleri** (gürültü seviyesi, konuşma hızı, süre)
- Okuduğunuz metnin **yazıya dökülmüş hâli** (yalnızca eşleşme kontrolü için)

Ses veriniz, KVKK m.6 anlamında **özel nitelikli (biyometrik) veridir**. Bu nedenle
açık rızanız olmadan işlenemez ve rızanızı dilediğiniz an geri alabilirsiniz.

## Kim işliyor, nereye aktarılıyor?
Ses modelinin üretimi için kayıtlarınız **ElevenLabs Inc. (ABD)** altyapısına aktarılır.
Aktarım, KVKK m.9 kapsamında imzalanmış **standart sözleşme** ile korunur. ABD'de veri
koruma mevzuatı Türkiye'dekinden farklıdır; bu riski bilerek onay verirsiniz.

## Ne kadar saklanıyor?
- Ham kayıtlar: ses profiliniz oluşturulduktan **30 gün** sonra otomatik silinir
- Sesli rıza klibi: ispat yükümlülüğü nedeniyle **10 yıl** ayrı ve şifreli saklanır
- Üretilen ses modeli: siz silene kadar

## Nasıl siliyorum?
Ayarlar → Sesim → **Sesimi sil**. Silme işlemi sağlayıcıda da tetiklenir. Hikayeleriniz
silinmez; yalnızca seslendirmeleri kaldırılır ve sistem sesine döner.

## Çocuğunuzun verisi
Çocuğunuzun **fotoğrafı istenmez, sesi asla kaydedilmez**. Yalnızca adı, yaş bandı ve
seçtiğiniz karakter özellikleri işlenir.

## Haklarınız (KVKK m.11)
Verilerinize erişme, düzeltme, silme, işlemeye itiraz etme ve aktarım bilgisi talep etme
haklarınız vardır. Başvuru: Ayarlar → Verilerim → KVKK Başvurusu.`;

const RIZA_SES_MD = `# Açık Rıza Beyanı — Biyometrik Ses Verisi

Aşağıdaki kutuyu işaretleyerek, ses kayıtlarımın **biyometrik nitelikte kişisel veri**
olduğunu bilerek, bana özel bir ses modeli üretilmesi amacıyla işlenmesine
**açık rıza** veriyorum.

- Rızam **özgür irademe** dayanır; vermezsem uygulamayı sistem sesleriyle eksiksiz kullanabilirim.
- Rızamı **dilediğim an** geri alabileceğimi ve geri aldığımda ses modelimin silineceğini biliyorum.
- Bu rıza yalnızca **kendi sesim** içindir; başkasının sesini kaydedemem.`;

const RIZA_YURTDISI_MD = `# Açık Rıza Beyanı — Yurt Dışına Aktarım

Ses kayıtlarımın, ses modeli üretimi amacıyla **Amerika Birleşik Devletleri'nde** yerleşik
hizmet sağlayıcıya aktarılmasına, bu ülkedeki veri koruma mevzuatının Türkiye'dekinden
farklı olabileceğini ve bunun **riskini bilerek**, açık rıza veriyorum.`;

const MESAFELI_SATIS_MD = `# Mesafeli Satış Sözleşmesi (Özet)

**Satıcı:** KendiHikayem · **Alıcı:** Sipariş formunda belirtilen kişi

Ürün, alıcının verdiği bilgiler doğrultusunda **kişiye özel olarak üretilen** basılı kitaptır.
Teslim süresi 5-9 iş günüdür. Ödeme, iyzico altyapısı üzerinden alınır.

## Cayma hakkı
6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği
m.15/1-(b) uyarınca, **tüketicinin istekleri veya kişisel ihtiyaçları doğrultusunda
hazırlanan mallarda cayma hakkı kullanılamaz.** Kitabınızın kapağında çocuğunuzun adı,
içinde ona özel yazılmış metin ve onun için üretilmiş çizimler yer aldığı için bu ürün
kişiye özeldir ve **iade edilemez**.

Ayıplı ürün (baskı hatası, hasarlı teslimat) hâlinde bu sınırlama uygulanmaz; ürün
ücretsiz yeniden basılır.`;

const CAYMA_MD = `# Cayma Hakkı Bilgilendirmesi

Bu kitap **yalnızca sizin için** üretilmektedir: kapakta çocuğunuzun adı, sayfalarda ona
özel yazılmış bir hikaye ve onun için çizilmiş resimler bulunur.

Bu nedenle 6502 sayılı Kanun gereği **cayma hakkınız bulunmamaktadır.**

Siparişi onaylamadan önce spread önizlemesini inceleyin; her sayfayı düzeltme hakkınız
vardır. Baskıya gönderdikten sonra değişiklik yapılamaz.`;

const LEGAL_BODIES: Record<string, { id: string; version: string; body: string }> = {
  aydinlatma_ses: { id: IDS.legalAydinlatmaSes, version: '1.2', body: AYDINLATMA_SES_MD },
  acik_riza_ses_biyometrik: { id: IDS.legalRizaSes, version: '1.2', body: RIZA_SES_MD },
  acik_riza_yurtdisi: { id: IDS.legalRizaYurtdisi, version: '1.1', body: RIZA_YURTDISI_MD },
  mesafeli_satis: { id: IDS.legalMesafeliSatis, version: '2.0', body: MESAFELI_SATIS_MD },
  cayma_bilgilendirme: { id: IDS.legalCayma, version: '2.0', body: CAYMA_MD },
};

export function legalDocument(kind: LegalDocumentKind): LegalDocument {
  const known = LEGAL_BODIES[kind];
  const version = known?.version ?? '1.0';
  return legalDocumentSchema.parse({
    id: known?.id ?? IDS.legalAydinlatmaSes,
    kind,
    version,
    bodyMd:
      known?.body ??
      `# ${kind}\n\nBu belgenin tam metni mock ortamında kısaltılmıştır. Sürüm ${version}.`,
    sha256: fakeSha(kind),
    effectiveFrom: '2026-07-01T00:00:00Z',
  });
}

/* ── KVKK ────────────────────────────────────────────────────── */

export const PRIVACY_REQUESTS: PrivacyRequest[] = [
  {
    id: IDS.privacyRequest,
    kind: 'erisim',
    status: 'tamamlandi',
    createdAt: '2026-07-20T10:00:00Z',
    dueAt: '2026-08-19T10:00:00Z',
    resolvedAt: '2026-07-22T14:30:00Z',
    responseTr: 'Verileriniz hazırlandı ve indirme bağlantısı e-postanıza gönderildi.',
    export: mockPdf('privacy/veri-paketi', 1_800_000),
  },
].map((request) => privacyRequestSchema.parse(request));

export const DATA_MAP: DataMapCategory[] = [
  {
    code: 'hesap',
    titleTr: 'Hesap bilgileri',
    descriptionTr: 'Girişte ve iletişimde kullanılan bilgiler.',
    itemsTr: ['Telefon numarası', 'Görünen ad', 'Cihaz kimliği', 'Saat dilimi'],
    retentionTr: 'Hesabınız açık olduğu sürece; silme talebinden 30 gün sonra imha.',
    processors: [
      {
        name: 'KendiHikayem sunucuları',
        countryTr: 'Almanya (AB)',
        purposeTr: 'Oturum ve hesap yönetimi',
        safeguardTr: 'AB içi, şifreli depolama',
      },
      {
        name: 'SMS sağlayıcı',
        countryTr: 'Türkiye',
        purposeTr: 'Doğrulama kodu gönderimi',
        safeguardTr: 'Yurt içi işleme',
      },
    ],
  },
  {
    code: 'cocuk',
    titleTr: 'Çocuk bilgileri',
    descriptionTr: 'Hikayeyi kişiselleştirmek için gereken en az veri. Fotoğraf istenmez.',
    itemsTr: ['Ad', 'Yaş bandı', 'İlgi alanları', 'Seçilen karakter özellikleri'],
    retentionTr: 'Profili silene kadar.',
    processors: [
      {
        name: 'Metin üretim sağlayıcısı',
        countryTr: 'ABD',
        purposeTr: 'Hikaye metninin üretilmesi',
        safeguardTr: 'KVKK m.9 standart sözleşme + açık rıza',
      },
    ],
  },
  {
    code: 'ses',
    titleTr: 'Ses verisi',
    descriptionTr: 'Yalnızca ses klonlamayı seçtiyseniz. Biyometrik veri sayılır.',
    itemsTr: ['Referans kayıtları', 'Sesli rıza klibi', 'Kalite ölçümleri'],
    retentionTr: 'Ham kayıtlar 30 gün; rıza klibi 10 yıl (ispat); ses modeli siz silene kadar.',
    processors: [
      {
        name: 'ElevenLabs Inc.',
        countryTr: 'ABD',
        purposeTr: 'Ses modeli üretimi ve seslendirme',
        safeguardTr: 'KVKK m.9 standart sözleşme + ayrı açık rıza',
      },
    ],
  },
  {
    code: 'siparis',
    titleTr: 'Sipariş ve ödeme',
    descriptionTr: 'Basılı kitap siparişi verdiyseniz.',
    itemsTr: ['Teslimat adresi', 'Alıcı adı ve telefonu', 'Sipariş kayıtları'],
    retentionTr: 'Vergi mevzuatı gereği 10 yıl.',
    processors: [
      {
        name: 'iyzico',
        countryTr: 'Türkiye',
        purposeTr: 'Ödeme alma',
        safeguardTr: 'Kart bilgisi bize hiç gelmez',
      },
      {
        name: 'Basımevi ve kargo',
        countryTr: 'Türkiye',
        purposeTr: 'Üretim ve teslimat',
        safeguardTr: 'Yalnızca teslimat için gerekli alanlar paylaşılır',
      },
    ],
  },
];

export const MOCK_TIMESTAMP = MOCK_NOW;
