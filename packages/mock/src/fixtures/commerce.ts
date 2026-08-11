/**
 * commerce.ts — kredi paketleri, kredi defteri, kitap üretimi, teklif, sipariş, dışa aktarma.
 * Tüm tutarlar KURUŞ cinsindendir (89900 = 899,00 TL).
 */

import {
  bookBuildSchema,
  creditEntrySchema,
  orderSchema,
  planSchema,
  quoteResSchema,
  storyExportSchema,
  type BookBuild,
  type CreditEntry,
  type Order,
  type Plan,
  type QuoteRes,
  type StoryExport,
} from '@kendihikayem/contract';

import { IDS, mockUuid } from './ids';
import { mockImage, mockPdf, mockVideo } from './media';

export const PLANS: Plan[] = [
  {
    code: 'kredi_deneme',
    titleTr: 'Deneme paketi',
    descriptionTr: 'Bir hikaye + bir seslendirme için yeter.',
    priceTry: 14900,
    credits: 120,
    bonusCredits: 0,
    featuresTr: ['1 hikaye (12 sayfa)', '1 seslendirme', 'Dijital PDF'],
    isCreditPack: true,
    storeProductId: 'kh.credits.120',
  },
  {
    code: 'kredi_baslangic',
    titleTr: 'Başlangıç paketi',
    descriptionTr: 'Üç hikaye ve sesli okumalar için.',
    priceTry: 34900,
    credits: 360,
    bonusCredits: 40,
    badgeTr: 'En çok tercih edilen',
    featuresTr: ['3 hikaye', 'Sınırsız sistem sesi', 'Ses klonlama hakkı', 'Dijital PDF + MP4'],
    isCreditPack: true,
    storeProductId: 'kh.credits.360',
  },
  {
    code: 'kredi_aile',
    titleTr: 'Aile paketi',
    descriptionTr: 'Birden fazla çocuk ve düzenli masal alışkanlığı için.',
    priceTry: 59900,
    credits: 700,
    bonusCredits: 120,
    badgeTr: 'En avantajlı',
    featuresTr: ['7 hikaye', '2 ses profili', 'Baskıda %10 indirim'],
    isCreditPack: true,
    storeProductId: 'kh.credits.700',
  },
].map((plan) => planSchema.parse(plan));

export const CREDIT_ENTRIES: CreditEntry[] = [
  {
    id: 'cr-5',
    at: '2026-08-10T19:26:00Z',
    delta: -6,
    balanceAfter: 340,
    reasonTr: 'Zeynep ve Kaybolan Ninni — iskelet üretimi',
    kind: 'hikaye',
    storyId: IDS.storyZeynepTaslak,
  },
  {
    id: 'cr-4',
    at: '2026-08-10T19:02:00Z',
    delta: -60,
    balanceAfter: 346,
    reasonTr: 'Ahmet ve Kaybolan Deniz Feneri — hikaye ve görseller',
    kind: 'hikaye',
    storyId: IDS.storyAhmetDeniz,
  },
  {
    id: 'cr-3',
    at: '2026-08-04T21:20:00Z',
    delta: -25,
    balanceAfter: 406,
    reasonTr: 'Anne sesiyle seslendirme',
    kind: 'seslendirme',
    storyId: IDS.storyElifIsik,
  },
  {
    id: 'cr-2',
    at: '2026-08-04T20:44:00Z',
    delta: -60,
    balanceAfter: 431,
    reasonTr: 'Elif ve Tavan Arasındaki Işık — hikaye ve görseller',
    kind: 'hikaye',
    storyId: IDS.storyElifIsik,
  },
  {
    id: 'cr-1',
    at: '2026-08-01T17:58:00Z',
    delta: 400,
    balanceAfter: 491,
    reasonTr: 'Başlangıç paketi satın alındı (360 + 40 hediye)',
    kind: 'satin_alma',
  },
].map((entry) => creditEntrySchema.parse(entry));

export const BOOK_BUILD: BookBuild = bookBuildSchema.parse({
  id: IDS.bookBuild,
  storyId: IDS.storyElifIsik,
  formatCode: 'kare21_24_sert',
  revision: 2,
  status: 'ready',
  /* Yaprak görselleri sayfa görselleriyle AYNIDIR: baskı önizlemesi kitabın
   * gerçekten basılacak karelerini gösterir, ayrı bir yer tutucu üretmez.
   * (Demo derlemesinde bu adresler APK'ya gömülü dosyalara çözülür.) */
  spreads: Array.from({ length: 6 }, (_, index) => ({
    index,
    left: mockImage(`story/elif/sayfa-${index * 2 + 1}`, 1240, 1240),
    right: mockImage(`story/elif/sayfa-${index * 2 + 2}`, 1240, 1240),
  })),
  previewPdf: mockPdf('build/onizleme', 6_400_000),
  digitalPdf: mockPdf('build/dijital', 12_800_000),
  spineMm: 8.4,
  checks: { dpiOk: true, fontsEmbedded: true, safeZoneOk: true, bleedOk: true },
  warningsTr: [
    '7. sayfada metin kutusu güvenli alana 2 mm yaklaşıyor; baskıda sorun beklenmiyor.',
  ],
  qr: { enabled: true, renditionLabel: 'Anne' },
  createdAt: '2026-08-05T10:12:00Z',
});

export const QUOTE: QuoteRes = quoteResSchema.parse({
  unitPriceTry: 89900,
  shippingTry: 6900,
  discountTry: 0,
  totalTry: 96800,
  installmentOptions: [
    { count: 1, monthlyTry: 96800, totalTry: 96800 },
    { count: 3, monthlyTry: 33300, totalTry: 99900 },
    { count: 6, monthlyTry: 17150, totalTry: 102900 },
  ],
  etaBusinessDays: [5, 9],
  withdrawalNoticeTr:
    'Bu kitap yalnızca sizin için üretilmektedir: kapakta çocuğunuzun adı, içinde ona özel yazılmış bir hikaye ve onun için çizilmiş resimler bulunur. 6502 sayılı Kanun gereği bu üründe CAYMA HAKKINIZ BULUNMAMAKTADIR. Siparişi onaylamadan önce lütfen önizlemeyi inceleyin.',
  withdrawalDocId: IDS.legalCayma,
  distanceContractDocId: IDS.legalMesafeliSatis,
  expiresAt: '2026-08-11T19:30:00Z',
});

export const ORDER: Order = orderSchema.parse({
  id: IDS.order,
  orderNo: 'KH-2026-004182',
  status: 'baskida',
  storyId: IDS.storyElifIsik,
  storyTitle: 'Elif ve Tavan Arasındaki Işık',
  cover: mockImage('story/elif/kapak', 2048, 2048),
  quantity: 1,
  totalTry: 96800,
  etaDeliveryAt: '2026-08-17T12:00:00Z',
  timeline: [
    { at: '2026-08-06T09:31:00Z', statusTr: 'Siparişiniz alındı' },
    { at: '2026-08-06T09:32:00Z', statusTr: 'Ödemeniz onaylandı' },
    { at: '2026-08-06T11:05:00Z', statusTr: 'Baskı dosyanız hazırlandı' },
    { at: '2026-08-07T08:40:00Z', statusTr: 'Kitabınız baskıya girdi' },
  ],
  createdAt: '2026-08-06T09:31:00Z',
});

export const ORDERS: Order[] = [ORDER];

export const EXPORTS: StoryExport[] = [
  {
    id: IDS.exportPdf,
    kind: 'pdf',
    status: 'ready',
    media: mockPdf('export/elif-dijital', 9_200_000),
    createdAt: '2026-08-05T12:00:00Z',
    expiresAt: '2026-09-04T12:00:00Z',
  },
  {
    id: mockUuid(74),
    kind: 'mp4',
    status: 'ready',
    media: mockVideo('export/elif-video', 296_000),
    createdAt: '2026-08-05T12:04:00Z',
    expiresAt: '2026-09-04T12:04:00Z',
  },
].map((item) => storyExportSchema.parse(item));
