/**
 * print/orders/invoice.ts — KDV and the invoice figures.
 *
 * Turkish retail prices are quoted KDV DAHİL: the 899,00 TL on the order screen is what the
 * card is charged, and the VAT is computed OUT of it, not added on top. Getting that
 * backwards inflates every basket by the VAT rate, so the arithmetic lives in one function
 * with the direction spelled out:
 *
 *     kdv = brüt × oran / (1 + oran)          net = brüt − kdv
 *
 * ⚠️ RATE IS A LEGAL QUESTION, NOT A CONSTANT. Printed books and periodicals are VAT-exempt
 * in Turkey (7166 sayılı Kanun, 2019), but a made-to-order personalised book sold as a
 * service is commonly invoiced at the standard rate. Which one applies to THIS product is a
 * question for the company's accountant, so the rate is configuration
 * (`KDV_RATE_PRINT_BOOK`, `KDV_RATE_SHIPPING`) with the standard rate as the safe default —
 * over-collecting is a correctable mistake, under-collecting is a tax debt.
 *
 * Everything is integer kuruş. Rounding is half-up per LINE, and the invoice total is the
 * sum of the lines, so the invoice always adds up to the amount actually charged.
 */

export interface KdvRates {
  /** Standard rate in Turkey as of 2026. Override per the accountant's ruling. */
  book: number;
  shipping: number;
}

export const DEFAULT_KDV_RATES: KdvRates = { book: 0.2, shipping: 0.2 };

export interface InvoiceLineInput {
  descriptionTr: string;
  quantity: number;
  /** KDV-inclusive unit price in kuruş. */
  grossUnitKurus: number;
  kdvRate: number;
}

export interface InvoiceLine {
  descriptionTr: string;
  quantity: number;
  grossUnitKurus: number;
  grossKurus: number;
  netKurus: number;
  kdvKurus: number;
  kdvRate: number;
}

export interface Invoice {
  lines: InvoiceLine[];
  netKurus: number;
  kdvKurus: number;
  grossKurus: number;
  /** Rate → KDV amount, the breakdown an e-Arşiv invoice needs. */
  kdvByRate: Record<string, number>;
  currency: 'TRY';
}

const roundHalfUp = (value: number): number => Math.floor(value + 0.5);

/** KDV contained in a gross amount. */
export function kdvFromGross(grossKurus: number, rate: number): number {
  if (rate <= 0) return 0;
  return roundHalfUp((grossKurus * rate) / (1 + rate));
}

export interface BuildInvoiceInput {
  formatTitleTr: string;
  quantity: number;
  /** Gross unit price of the book, kuruş. */
  unitPriceKurus: number;
  shippingKurus: number;
  /** Positive number; applied to the book line before VAT is extracted. */
  discountKurus?: number;
  rates?: KdvRates;
}

export function buildInvoice(input: BuildInvoiceInput): Invoice {
  const rates = input.rates ?? DEFAULT_KDV_RATES;
  const discount = Math.max(0, input.discountKurus ?? 0);

  const bookGross = Math.max(0, input.unitPriceKurus * input.quantity - discount);
  const lineInputs: InvoiceLineInput[] = [
    {
      descriptionTr: `${input.formatTitleTr} — kişiye özel çocuk kitabı`,
      quantity: input.quantity,
      grossUnitKurus: input.quantity > 0 ? roundHalfUp(bookGross / input.quantity) : 0,
      kdvRate: rates.book,
    },
  ];
  if (input.shippingKurus > 0) {
    lineInputs.push({
      descriptionTr: 'Kargo',
      quantity: 1,
      grossUnitKurus: input.shippingKurus,
      kdvRate: rates.shipping,
    });
  }

  const lines: InvoiceLine[] = lineInputs.map((line) => {
    const grossKurus = line.grossUnitKurus * line.quantity;
    const kdvKurus = kdvFromGross(grossKurus, line.kdvRate);
    return {
      descriptionTr: line.descriptionTr,
      quantity: line.quantity,
      grossUnitKurus: line.grossUnitKurus,
      grossKurus,
      netKurus: grossKurus - kdvKurus,
      kdvKurus,
      kdvRate: line.kdvRate,
    };
  });

  const kdvByRate: Record<string, number> = {};
  for (const line of lines) {
    const key = `${Math.round(line.kdvRate * 100)}`;
    kdvByRate[key] = (kdvByRate[key] ?? 0) + line.kdvKurus;
  }

  return {
    lines,
    netKurus: lines.reduce((sum, line) => sum + line.netKurus, 0),
    kdvKurus: lines.reduce((sum, line) => sum + line.kdvKurus, 0),
    grossKurus: lines.reduce((sum, line) => sum + line.grossKurus, 0),
    kdvByRate,
    currency: 'TRY',
  };
}

/** "899,00 TL" — Turkish formatting, from integer kuruş. */
export function formatKurusTr(kurus: number): string {
  return `${(kurus / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}
