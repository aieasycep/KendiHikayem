/**
 * print/work-order.ts — the "iş emri" a human printer actually works from.
 *
 * SPEC §9 step 10: in the MVP there is no printer with a public API in Turkey, so an
 * operator sends the job by e-mail and the partner prints from a work order. Making that
 * work order a TYPED, generated artefact rather than a hand-written mail is what keeps the
 * manual path from being the weak link: the spine, the paper, the page count and the
 * address all come from the same data the PDF was built from.
 *
 * It is Turkish because its reader is a Turkish print shop, and it deliberately repeats the
 * numbers the shop will check first (ebat, sayfa, sırt, kağıt, cilt, adet).
 */

import type { PrintSubmitInput } from '../core/adapters';

export interface WorkOrder {
  orderNo: string;
  formatCode: string;
  titleTr: string;
  quantity: number;
  pageCount: number;
  trimMm: [number, number];
  bleedMm: number;
  spineMm: number;
  paperTr: string;
  bindingTr: string;
  colorProfileTr: string;
  files: { interiorPdfUrl: string; coverPdfUrl: string };
  shipTo: PrintSubmitInput['shipTo'];
  giftNoteTr?: string;
  /** Free-form operator note — e.g. "ilk 5 siparişte fiziksel prova zorunlu". */
  notesTr?: string[];
  createdAt: string;
}

const line = (label: string, value: string | number): string => `${label}: ${value}`;

/**
 * Plain-text rendering for the e-mail body. Kept plain on purpose: it survives every mail
 * client, and a print shop copies these values into their own order form by hand.
 */
export function renderWorkOrderTextTr(order: WorkOrder): string {
  const address = [
    order.shipTo.fullName,
    order.shipTo.line1,
    order.shipTo.line2,
    [order.shipTo.district, order.shipTo.city, order.shipTo.postalCode]
      .filter(Boolean)
      .join(' / '),
    order.shipTo.phone,
  ]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join('\n  ');

  return [
    `KENDİHİKAYEM — BASKI İŞ EMRİ  (${order.orderNo})`,
    '',
    line('Kitap', order.titleTr),
    line('Adet', order.quantity),
    line('Ebat (kesim)', `${order.trimMm[0]} × ${order.trimMm[1]} mm`),
    line('Taşma payı', `${order.bleedMm} mm (her kenar)`),
    line('İç sayfa', `${order.pageCount} sayfa`),
    line('Sırt kalınlığı', `${order.spineMm.toFixed(1)} mm`),
    line('Kağıt', order.paperTr),
    line('Cilt', order.bindingTr),
    line('Renk', order.colorProfileTr),
    '',
    'DOSYALAR',
    `  İç blok: ${order.files.interiorPdfUrl}`,
    `  Kapak  : ${order.files.coverPdfUrl}`,
    '',
    'TESLİMAT',
    `  ${address}`,
    order.giftNoteTr ? `\nHEDİYE NOTU (kitapla birlikte kutuya):\n  “${order.giftNoteTr}”` : '',
    order.notesTr?.length ? `\nNOTLAR\n${order.notesTr.map((note) => `  - ${note}`).join('\n')}` : '',
    '',
    `Oluşturma: ${order.createdAt}`,
  ]
    .filter((part) => part !== '')
    .join('\n');
}
