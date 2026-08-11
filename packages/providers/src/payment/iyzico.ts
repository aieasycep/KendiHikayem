/**
 * payment/iyzico.ts — iyzico Checkout Form, written blind.
 *
 * ⚠️ NEVER RUN AGAINST IYZICO. There is no merchant account and no key in this environment
 * (see the phase brief). The adapter is complete, is exercised against RECORDED FIXTURES
 * (`fixtures/iyzico-*.json`) and is only reachable when `API_MODE=live` with
 * `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` set. Before it is switched on it MUST be run once
 * against the sandbox — signature construction is the part most likely to need a fix.
 *
 * Why Checkout Form and not the direct payment API: the hosted page keeps card data out of
 * our process entirely, which keeps us out of PCI scope and gives 3-D Secure and the
 * installment table for free. Installments matter commercially — in the 899 TL band they
 * are what decides whether a parent completes the order (SPEC §2).
 *
 * Authentication is iyzico's IYZWSv2 scheme: an HMAC-SHA256 over
 * `randomKey + uriPath + requestBody`, keyed with the secret, sent as a base64 blob
 * together with the random key. It is reproduced here from the published documentation.
 *
 * Money: iyzico speaks decimal TRY strings ("899.00"); the repo speaks integer kuruş.
 * Conversion happens ONLY in this file, in `toIyzicoAmount` / `fromIyzicoAmount`.
 */

import { createHmac, randomBytes } from 'node:crypto';

import type {
  InitializeCheckoutInput,
  InitializeCheckoutOutput,
  PaymentAdapter,
  PaymentResult,
  RefundInput,
  RefundOutput,
} from './types';

export interface IyzicoOptions {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  randomKey?: () => string;
  /** Checkout page lifetime; iyzico's own default is 30 minutes. */
  tokenTtlMinutes?: number;
}

const CHECKOUT_INIT_PATH = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
const CHECKOUT_RETRIEVE_PATH = '/payment/iyzipos/checkoutform/auth/ecom/detail';
const REFUND_PATH = '/payment/refund';

/** 89900 → "899.00" — iyzico rejects anything else. */
export function toIyzicoAmount(kurus: number): string {
  return (kurus / 100).toFixed(2);
}

/** "899.00" / "899.0" / 899 → 89900. */
export function fromIyzicoAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/** Card data must never reach `payments.raw`. Redact before storing, not after. */
const SENSITIVE_KEYS = new Set([
  'cardNumber',
  'cvc',
  'expireMonth',
  'expireYear',
  'cardHolderName',
  'cardToken',
  'cardUserKey',
  'binNumber',
  'lastFourDigits',
]);

export function redactPaymentPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? redactPaymentPayload(value)
        : value;
  }
  return output;
}

/** iyzico error code → a sentence a parent can act on. */
const ERROR_TR: Record<string, string> = {
  '10051': 'Kartınızın limiti bu ödeme için yeterli değil.',
  '10005': 'Bankanız bu işleme izin vermedi. Başka bir kartla deneyebilirsiniz.',
  '10012': 'Kart bilgileri hatalı görünüyor.',
  '10041': 'Kartınız bu işlem için kullanılamıyor; bankanızla görüşmeniz gerekebilir.',
  '10054': 'Kartınızın son kullanma tarihi geçmiş.',
  '10084': 'Kartınız internetten alışverişe kapalı. Bankanızdan açtırabilirsiniz.',
  '5001': 'Ödeme sağlayıcısında geçici bir sorun var; birazdan tekrar deneyin.',
};

export function iyzicoErrorTr(code: unknown, fallbackTr?: string): string {
  const key = code === undefined || code === null ? '' : String(code);
  return (
    ERROR_TR[key] ??
    fallbackTr ??
    'Ödeme alınamadı. Kartınızdan tutar çekilmediyse tekrar deneyebilirsiniz.'
  );
}

export class IyzicoPaymentAdapter implements PaymentAdapter {
  readonly provider = 'iyzico' as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: IyzicoOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * IYZWSv2: `Authorization: IYZWSv2 base64(apiKey:…&randomKey:…&signature:…)`.
   * The signature covers the random key, the URI path and the exact request body, so a
   * replayed body with a different path (or a tampered amount) fails verification.
   */
  private authorizationHeader(uriPath: string, body: string, randomKey: string): string {
    const payload = `${randomKey}${uriPath}${body}`;
    const signature = createHmac('sha256', this.options.secretKey).update(payload).digest('hex');
    const authorizationParams = [
      `apiKey:${this.options.apiKey}`,
      `randomKey:${randomKey}`,
      `signature:${signature}`,
    ].join('&');
    return `IYZWSv2 ${Buffer.from(authorizationParams).toString('base64')}`;
  }

  private async post(uriPath: string, body: unknown): Promise<Record<string, unknown>> {
    const serialized = JSON.stringify(body);
    const randomKey = this.options.randomKey?.() ?? `${Date.now()}${randomBytes(4).toString('hex')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 20_000);

    try {
      const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/+$/, '')}${uriPath}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: this.authorizationHeader(uriPath, serialized, randomKey),
          'x-iyzi-rnd': randomKey,
        },
        body: serialized,
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!response.ok) {
        throw new IyzicoError(
          String(payload['errorCode'] ?? response.status),
          iyzicoErrorTr(payload['errorCode'], String(payload['errorMessage'] ?? '')),
          response.status >= 500,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof IyzicoError) throw error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new IyzicoError(
        aborted ? 'timeout' : 'network',
        'Ödeme sağlayıcısına ulaşılamadı. Kartınızdan tutar çekilmediyse tekrar deneyin.',
        true,
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async initializeCheckout(input: InitializeCheckoutInput): Promise<InitializeCheckoutOutput> {
    const itemTotal = input.items.reduce((sum, item) => sum + item.priceKurus, 0);
    if (itemTotal !== input.amountKurus) {
      // The vendor rejects a basket that does not add up; catching it here gives a message
      // a developer can act on instead of a vendor error code in a parent's face.
      throw new IyzicoError(
        'basket_mismatch',
        'Sipariş tutarı kalemlerle uyuşmuyor; ödeme başlatılamadı.',
        false,
      );
    }

    const body = {
      locale: input.localeTr === false ? 'en' : 'tr',
      // Our idempotency key travels as the conversation id: iyzico echoes it back on every
      // callback and webhook, which is how a duplicate delivery is recognised.
      conversationId: input.idempotencyKey,
      price: toIyzicoAmount(input.amountKurus),
      paidPrice: toIyzicoAmount(input.amountKurus),
      currency: input.currency,
      basketId: input.orderId,
      paymentGroup: 'PRODUCT',
      callbackUrl: input.callbackUrl,
      enabledInstallments: [1, 2, 3, 6, 9, 12],
      ...(input.installment > 1 ? { installment: input.installment } : {}),
      buyer: {
        id: input.buyer.id,
        name: input.buyer.name,
        surname: input.buyer.surname,
        gsmNumber: input.buyer.phone,
        email: input.buyer.email,
        // iyzico requires an identity number field; we do not collect one, so the order
        // number is sent as the merchant-side identifier (documented workaround).
        identityNumber: input.orderNo,
        ...(input.buyer.registrationDate
          ? { registrationDate: input.buyer.registrationDate }
          : {}),
        ...(input.buyer.ip ? { ip: input.buyer.ip } : {}),
        registrationAddress: input.buyer.addressLine,
        city: input.buyer.city,
        country: input.buyer.country,
        ...(input.buyer.postalCode ? { zipCode: input.buyer.postalCode } : {}),
      },
      shippingAddress: {
        contactName: input.shipping.contactName,
        city: input.shipping.city,
        country: input.shipping.country,
        address: input.shipping.addressLine,
        ...(input.shipping.postalCode ? { zipCode: input.shipping.postalCode } : {}),
      },
      billingAddress: {
        contactName: input.buyer.name + ' ' + input.buyer.surname,
        city: input.buyer.city,
        country: input.buyer.country,
        address: input.buyer.addressLine,
        ...(input.buyer.postalCode ? { zipCode: input.buyer.postalCode } : {}),
      },
      basketItems: input.items.map((item) => ({
        id: item.id,
        name: item.nameTr,
        category1: item.category1,
        itemType: item.itemType,
        price: toIyzicoAmount(item.priceKurus),
      })),
    };

    const payload = await this.post(CHECKOUT_INIT_PATH, body);
    if (payload['status'] !== 'success') {
      throw new IyzicoError(
        String(payload['errorCode'] ?? 'unknown'),
        iyzicoErrorTr(payload['errorCode'], String(payload['errorMessage'] ?? '')),
        false,
      );
    }

    const now = this.options.now?.() ?? new Date();
    const ttl = (this.options.tokenTtlMinutes ?? 30) * 60_000;
    return {
      paymentToken: String(payload['token'] ?? ''),
      redirectUrl: String(payload['paymentPageUrl'] ?? ''),
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
      provider: this.provider,
      status: 'init',
    };
  }

  async retrieveResult(paymentToken: string): Promise<PaymentResult> {
    const payload = await this.post(CHECKOUT_RETRIEVE_PATH, { token: paymentToken });
    const paymentStatus = String(payload['paymentStatus'] ?? '');
    const succeeded = payload['status'] === 'success' && paymentStatus === 'SUCCESS';

    return {
      provider: this.provider,
      status: succeeded ? 'captured' : 'failed',
      ...(payload['paymentId'] ? { providerRef: String(payload['paymentId']) } : {}),
      amountKurus: fromIyzicoAmount(payload['paidPrice'] ?? payload['price']),
      installment: Number(payload['installment'] ?? 1),
      ...(payload['basketId'] ? { orderId: String(payload['basketId']) } : {}),
      ...(succeeded
        ? {}
        : { failureTr: iyzicoErrorTr(payload['errorCode'], String(payload['errorMessage'] ?? '')) }),
      raw: redactPaymentPayload(payload),
    };
  }

  async refund(input: RefundInput): Promise<RefundOutput> {
    const payload = await this.post(REFUND_PATH, {
      locale: 'tr',
      conversationId: input.idempotencyKey,
      paymentTransactionId: input.providerRef,
      price: toIyzicoAmount(input.amountKurus),
      currency: 'TRY',
      ...(input.ip ? { ip: input.ip } : {}),
    });

    const ok = payload['status'] === 'success';
    return {
      status: ok ? 'refunded' : 'failed',
      ...(payload['paymentTransactionId']
        ? { providerRef: String(payload['paymentTransactionId']) }
        : {}),
      amountKurus: fromIyzicoAmount(payload['price'] ?? input.amountKurus),
      ...(ok
        ? {}
        : { failureTr: iyzicoErrorTr(payload['errorCode'], String(payload['errorMessage'] ?? '')) }),
    };
  }

  /**
   * The checkout callback carries only a token, so the ONLY safe verification is to ask
   * iyzico what that token means — which `retrieveResult` does. This method therefore
   * checks shape, not authenticity, and says so: a callback is never trusted on its own.
   */
  verifyCallback(payload: Record<string, unknown>): boolean {
    return typeof payload['token'] === 'string' && payload['token'].length > 0;
  }
}

export class IyzicoError extends Error {
  constructor(
    readonly code: string,
    readonly messageTr: string,
    readonly retryable: boolean,
    cause?: unknown,
  ) {
    super(`iyzico ${code}: ${messageTr}`);
    this.name = 'IyzicoError';
    if (cause !== undefined) this.cause = cause;
  }
}
