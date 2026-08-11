/**
 * print/errors.ts — a printer's "no", in Turkish, to a parent.
 *
 * A print partner refuses for a handful of reasons and every one of them lands on a person
 * who paid for a birthday present. The provider's own message ("PRODUCT_OUT_OF_STOCK",
 * "invalid postcode") is useless to that person and must never reach them, so every failure
 * is mapped to a `PrintFailure` with:
 *
 *   · `messageTr`  — what happened, in plain Turkish;
 *   · `actionTr`   — what happens next, so the parent is not left holding the problem;
 *   · `retryable`  — whether the worker should try again at all;
 *   · `userFixable`— whether waiting helps (no) or the parent must edit something (yes).
 *
 * `ProviderError` stays the transport-level type (`packages/providers/core/errors.ts`);
 * this module is the product-level meaning on top of it.
 */

import { ProviderError, type ProviderErrorKind } from '../core/errors';
import type { ProviderName, ProviderOperation } from '../core/types';

export type PrintFailureCode =
  /** The printer looked at the PDF and refused it. */
  | 'baski_reddi'
  /** Stock, binding or format temporarily unavailable. */
  | 'stok_yok'
  /** The address cannot be delivered to as written. */
  | 'adres_hatasi'
  /** Their API is down / timing out. */
  | 'saglayici_erisilemiyor'
  /** We sent something malformed — our bug, not the parent's. */
  | 'gecersiz_istek'
  /** Order already cancelled or already in production at their end. */
  | 'iptal_edilemez'
  /** Anything we have not classified yet. */
  | 'bilinmeyen';

export interface PrintFailure {
  code: PrintFailureCode;
  messageTr: string;
  actionTr: string;
  retryable: boolean;
  /** True ⇒ the parent has to change something (usually the address). */
  userFixable: boolean;
}

const FAILURES: Record<PrintFailureCode, Omit<PrintFailure, 'code'>> = {
  baski_reddi: {
    messageTr: 'Matbaa baskı dosyasını kabul etmedi.',
    actionTr:
      'Ekibimiz dosyayı düzeltip yeniden gönderiyor; siparişiniz iptal olmadı, sizden bir şey beklenmiyor.',
    retryable: false,
    userFixable: false,
  },
  stok_yok: {
    messageTr: 'Seçtiğiniz kitap formatı matbaada geçici olarak üretilemiyor.',
    actionTr:
      'Stok açılınca baskıya giriyoruz. Beklemek istemezseniz siparişinizi ücretsiz iptal edebilirsiniz.',
    retryable: true,
    userFixable: false,
  },
  adres_hatasi: {
    messageTr: 'Teslimat adresi kargo için eksik ya da hatalı görünüyor.',
    actionTr: 'Siparişlerim ekranından adresi düzeltin; kitabınız hemen baskıya girer.',
    retryable: false,
    userFixable: true,
  },
  saglayici_erisilemiyor: {
    messageTr: 'Matbaa sistemine şu an ulaşılamıyor.',
    actionTr: 'Birkaç dakika içinde otomatik olarak yeniden deniyoruz; bir şey yapmanıza gerek yok.',
    retryable: true,
    userFixable: false,
  },
  gecersiz_istek: {
    messageTr: 'Baskı siparişi matbaaya iletilirken bir sorun oluştu.',
    actionTr: 'Bu bizim tarafımızdaki bir hata; ekibimize bildirildi ve takip ediliyor.',
    retryable: false,
    userFixable: false,
  },
  iptal_edilemez: {
    messageTr: 'Kitabınız baskıya girdiği için sipariş artık iptal edilemiyor.',
    actionTr:
      'Kitap kusurlu gelirse 30 gün içinde ücretsiz yenisini basıyoruz — Siparişlerim ekranından bildirin.',
    retryable: false,
    userFixable: false,
  },
  bilinmeyen: {
    messageTr: 'Baskı sırasında beklenmeyen bir sorun oluştu.',
    actionTr: 'Siparişiniz duruyor; ekibimiz inceleyip size dönecek.',
    retryable: false,
    userFixable: false,
  },
};

export function printFailure(code: PrintFailureCode): PrintFailure {
  return { code, ...FAILURES[code] };
}

/** Provider error kind → the product-level failure the parent is shown. */
const KIND_TO_CODE: Partial<Record<ProviderErrorKind, PrintFailureCode>> = {
  rate_limited: 'saglayici_erisilemiyor',
  timeout: 'saglayici_erisilemiyor',
  unavailable: 'saglayici_erisilemiyor',
  quota_exhausted: 'stok_yok',
  invalid_request: 'gecersiz_istek',
  auth: 'gecersiz_istek',
  not_found: 'iptal_edilemez',
};

/**
 * Vendor-specific codes we have actually seen documented, per provider. Unknown strings
 * fall through to the transport-level mapping rather than guessing.
 */
const VENDOR_CODES: Record<string, PrintFailureCode> = {
  // Cloudprinter-style
  file_validation_failed: 'baski_reddi',
  file_error: 'baski_reddi',
  product_unavailable: 'stok_yok',
  out_of_stock: 'stok_yok',
  address_invalid: 'adres_hatasi',
  invalid_address: 'adres_hatasi',
  shipping_unavailable: 'adres_hatasi',
  order_already_in_production: 'iptal_edilemez',
  order_not_cancellable: 'iptal_edilemez',
  // Lulu-style
  REJECTED: 'baski_reddi',
  UNPRINTABLE: 'baski_reddi',
};

export function classifyPrintError(error: unknown): PrintFailure {
  if (error instanceof ProviderError) {
    const byVendor = error.providerCode ? VENDOR_CODES[error.providerCode] : undefined;
    const code = byVendor ?? KIND_TO_CODE[error.kind] ?? 'bilinmeyen';
    return printFailure(code);
  }
  return printFailure('bilinmeyen');
}

/** Builds the transport-level error with the vendor code preserved for support. */
export function printProviderError(init: {
  provider: ProviderName;
  operation: ProviderOperation;
  kind: ProviderErrorKind;
  providerCode?: string;
  httpStatus?: number;
  detail?: string;
  retryAfterMs?: number;
  cause?: unknown;
}): ProviderError {
  return new ProviderError(init);
}
