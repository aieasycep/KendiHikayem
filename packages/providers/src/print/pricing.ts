/**
 * print/pricing.ts — what a printed book costs, in kuruş.
 *
 * Money is an INTEGER number of kuruş everywhere in this repo (contract primitives rule 3):
 * 89900 = 899,00 TL. A float would lose a lira somewhere between the quote, the payment and
 * the invoice, and the three have to reconcile to the kuruş.
 *
 * The numbers themselves are commercial configuration, not architecture — a partner's price
 * list changes without a deploy. They live in one table so the ops panel and the quote
 * endpoint cannot drift apart.
 */

export interface PrintPriceRow {
  formatCode: string;
  /** First copy, printed and bound. */
  unitKurus: number;
  /** Each additional copy of the SAME book — no new setup, so it is cheaper. */
  additionalUnitKurus: number;
  /** Domestic shipping, one shipment regardless of copies. */
  shippingKurus: number;
  /** Free shipping above this basket value; 0 disables. */
  freeShippingAboveKurus: number;
  etaBusinessDays: [number, number];
}

/**
 * MVP list price. 899,00 TL matches the frozen quote fixture the app already shows.
 * [D] — to be replaced with the partner's real quote before launch.
 */
export const DEFAULT_PRICE_LIST: readonly PrintPriceRow[] = [
  {
    formatCode: 'kare21_24_sert',
    unitKurus: 89_900,
    additionalUnitKurus: 74_900,
    shippingKurus: 6_900,
    freeShippingAboveKurus: 150_000,
    etaBusinessDays: [5, 9],
  },
  {
    formatCode: 'kare21_32_yumusak',
    unitKurus: 79_900,
    additionalUnitKurus: 64_900,
    shippingKurus: 6_900,
    freeShippingAboveKurus: 150_000,
    etaBusinessDays: [5, 9],
  },
];

/** Cities the partner reaches a day or two later. Everything else uses the base ETA. */
const SLOW_ROUTE_CITIES = new Set([
  'hakkari',
  'şırnak',
  'sirnak',
  'ardahan',
  'iğdır',
  'igdir',
  'tunceli',
  'bayburt',
]);

export interface PrintQuoteBreakdown {
  unitPriceKurus: number;
  shippingKurus: number;
  subtotalKurus: number;
  totalKurus: number;
  etaBusinessDays: [number, number];
}

export class UnknownPrintFormatError extends Error {
  constructor(readonly formatCode: string) {
    super(`no price row for format ${formatCode}`);
    this.name = 'UnknownPrintFormatError';
  }
}

export function priceFor(
  formatCode: string,
  priceList: readonly PrintPriceRow[] = DEFAULT_PRICE_LIST,
): PrintPriceRow {
  const row = priceList.find((entry) => entry.formatCode === formatCode);
  if (!row) throw new UnknownPrintFormatError(formatCode);
  return row;
}

export function quotePrint(
  input: { formatCode: string; quantity: number; city?: string },
  priceList: readonly PrintPriceRow[] = DEFAULT_PRICE_LIST,
): PrintQuoteBreakdown {
  const row = priceFor(input.formatCode, priceList);
  const quantity = Math.max(1, Math.trunc(input.quantity));

  const subtotalKurus = row.unitKurus + (quantity - 1) * row.additionalUnitKurus;
  const shippingKurus =
    row.freeShippingAboveKurus > 0 && subtotalKurus >= row.freeShippingAboveKurus
      ? 0
      : row.shippingKurus;

  const slow = input.city ? SLOW_ROUTE_CITIES.has(input.city.trim().toLocaleLowerCase('tr')) : false;
  const etaBusinessDays: [number, number] = slow
    ? [row.etaBusinessDays[0] + 2, row.etaBusinessDays[1] + 3]
    : row.etaBusinessDays;

  return {
    // The contract's `unitPriceTry` is the price of ONE book as shown to the parent.
    unitPriceKurus: row.unitKurus,
    shippingKurus,
    subtotalKurus,
    totalKurus: subtotalKurus + shippingKurus,
    etaBusinessDays,
  };
}
