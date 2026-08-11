/**
 * payment/types.ts — the payment surface, provider-independent.
 *
 * Owner: A6 (SPEC §12: "iyzico checkout + idempotent webhook + taksit"). `packages/providers`
 * is the only place a vendor SDK may be imported (SPEC §3 rule 6), so the payment adapter
 * lives beside the print adapter rather than in a service package.
 *
 * The interface is written around ONE hard rule: **a payment is created at most once per
 * (order, attempt)**. Every method therefore carries an idempotency key, and the runner in
 * `idempotency.ts` refuses a second call with the same key and a different amount instead of
 * charging a parent twice for the same book.
 */

export type PaymentProvider = 'iyzico' | 'paytr';

/** Mirrors `payments.status` in packages/db. */
export type PaymentStatus = 'init' | 'authorized' | 'captured' | 'failed' | 'refunded';

export interface PaymentBuyer {
  id: string;
  name: string;
  surname: string;
  email: string;
  /** E.164. */
  phone: string;
  /** Required by iyzico for fraud scoring; the shipping address is reused. */
  addressLine: string;
  city: string;
  country: 'Turkey';
  postalCode?: string;
  /** Registration date of the account, ISO — improves the fraud score materially. */
  registrationDate?: string;
  ip?: string;
}

export interface PaymentBasketItem {
  id: string;
  nameTr: string;
  category1: string;
  /** Kuruş. Sum of items must equal `amountKurus`. */
  priceKurus: number;
  /** A printed book is PHYSICAL — this drives both the vendor's rules and Apple's. */
  itemType: 'PHYSICAL' | 'VIRTUAL';
}

export interface InitializeCheckoutInput {
  /** Our `orders.id`. Becomes the vendor's `basketId`. */
  orderId: string;
  orderNo: string;
  amountKurus: number;
  /** 1 = single payment. Installments are the conversion lever in the 899 TL band. */
  installment: number;
  currency: 'TRY';
  buyer: PaymentBuyer;
  shipping: {
    contactName: string;
    addressLine: string;
    city: string;
    country: 'Turkey';
    postalCode?: string;
  };
  items: PaymentBasketItem[];
  /** Where the vendor sends the parent back to. */
  callbackUrl: string;
  /** Stable across retries of the same attempt — see `idempotency.ts`. */
  idempotencyKey: string;
  localeTr?: boolean;
}

export interface InitializeCheckoutOutput {
  /** Vendor-side token; needed to retrieve the result after the callback. */
  paymentToken: string;
  /** Hosted checkout page the app opens. */
  redirectUrl: string;
  expiresAt: string;
  provider: PaymentProvider;
  status: PaymentStatus;
}

export interface PaymentResult {
  provider: PaymentProvider;
  status: PaymentStatus;
  /** Vendor payment id — the reference for refunds and for support. */
  providerRef?: string;
  amountKurus: number;
  installment: number;
  /** Vendor's own basket reference; must equal our order id. */
  orderId?: string;
  /** Present when `status === 'failed'`; Turkish, already customer-safe. */
  failureTr?: string;
  /** Raw vendor payload with card data REDACTED, for `payments.raw`. */
  raw?: Record<string, unknown>;
}

export interface RefundInput {
  /** Vendor payment/transaction id from `PaymentResult.providerRef`. */
  providerRef: string;
  amountKurus: number;
  reasonTr?: string;
  idempotencyKey: string;
  ip?: string;
}

export interface RefundOutput {
  status: 'refunded' | 'failed';
  providerRef?: string;
  amountKurus: number;
  failureTr?: string;
}

export interface PaymentAdapter {
  readonly provider: PaymentProvider;
  /** Opens a hosted checkout; never touches card data ourselves (PCI scope stays out). */
  initializeCheckout(input: InitializeCheckoutInput): Promise<InitializeCheckoutOutput>;
  /** Called after the vendor redirects back, and again by the webhook. */
  retrieveResult(paymentToken: string): Promise<PaymentResult>;
  refund(input: RefundInput): Promise<RefundOutput>;
  /** Verifies a webhook/callback actually came from the vendor. */
  verifyCallback(payload: Record<string, unknown>, signature?: string): boolean;
}
