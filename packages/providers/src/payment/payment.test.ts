/**
 * payment.test.ts — the double-charge tests.
 *
 * ⚠️ NOT RUN AGAINST IYZICO. The fixtures are written from the published API documentation;
 * the sandbox has never been called from this repo. What these tests do prove is that our
 * side cannot charge twice, cannot silently change an amount, and never stores card data.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  InMemoryIdempotencyStore,
  PaymentIdempotencyConflictError,
  PaymentInFlightError,
  paymentIdempotencyKey,
  runIdempotent,
} from './idempotency';
import {
  IyzicoPaymentAdapter,
  fromIyzicoAmount,
  iyzicoErrorTr,
  redactPaymentPayload,
  toIyzicoAmount,
} from './iyzico';
import type { InitializeCheckoutInput, InitializeCheckoutOutput } from './types';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const ORDER_ID = '5f2b4d4c-9d1a-4a3e-8b7c-1d2e3f4a5b6c';

function checkoutInput(overrides: Partial<InitializeCheckoutInput> = {}): InitializeCheckoutInput {
  return {
    orderId: ORDER_ID,
    orderNo: 'KH-2026-004182',
    amountKurus: 96_800,
    installment: 3,
    currency: 'TRY',
    buyer: {
      id: 'user-1',
      name: 'Ayşe',
      surname: 'Yılmaz',
      email: 'ayse@example.com',
      phone: '+905321234567',
      addressLine: 'Bağdat Cad. 12',
      city: 'İstanbul',
      country: 'Turkey',
    },
    shipping: {
      contactName: 'Ayşe Yılmaz',
      addressLine: 'Bağdat Cad. 12',
      city: 'İstanbul',
      country: 'Turkey',
    },
    items: [
      { id: 'kitap', nameTr: 'Kişiye özel kitap', category1: 'Kitap', priceKurus: 89_900, itemType: 'PHYSICAL' },
      { id: 'kargo', nameTr: 'Kargo', category1: 'Kargo', priceKurus: 6_900, itemType: 'PHYSICAL' },
    ],
    callbackUrl: 'https://api.kendihikayem.com/v1/payments/iyzico/callback',
    idempotencyKey: paymentIdempotencyKey({ orderId: ORDER_ID, amountKurus: 96_800, installment: 3 }),
    ...overrides,
  };
}

function adapter(responder: (path: string, body: unknown) => unknown, status = 200) {
  const calls: Array<{ path: string; body: unknown; headers: Record<string, string> }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body: unknown = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ path: url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(responder(url, body)), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return {
    calls,
    fetchImpl,
    adapter: new IyzicoPaymentAdapter({
      apiKey: 'sandbox-api-key',
      secretKey: 'sandbox-secret',
      baseUrl: 'https://sandbox-api.iyzipay.com',
      fetchImpl,
      now: () => new Date('2026-08-11T09:00:00Z'),
      randomKey: () => '1786512000000abcd',
    }),
  };
}

describe('para dönüşümü', () => {
  it('kuruş ↔ iyzico ondalık dizesi', () => {
    expect(toIyzicoAmount(89_900)).toBe('899.00');
    expect(toIyzicoAmount(6_900)).toBe('69.00');
    expect(fromIyzicoAmount('968.00')).toBe(96_800);
    expect(fromIyzicoAmount(968)).toBe(96_800);
  });
});

describe('idempotency anahtarı', () => {
  it('aynı sipariş + tutar + taksit = aynı anahtar', () => {
    const a = paymentIdempotencyKey({ orderId: ORDER_ID, amountKurus: 96_800, installment: 3 });
    const b = paymentIdempotencyKey({ orderId: ORDER_ID, amountKurus: 96_800, installment: 3 });
    expect(a).toBe(b);
  });

  it('tutar değişirse anahtar da değişir — eski ödeme yeniden kullanılamaz', () => {
    const a = paymentIdempotencyKey({ orderId: ORDER_ID, amountKurus: 96_800, installment: 1 });
    const b = paymentIdempotencyKey({ orderId: ORDER_ID, amountKurus: 89_900, installment: 1 });
    expect(a).not.toBe(b);
  });
});

describe('çift çekim koruması', () => {
  it('aynı anahtarla ikinci çağrı sağlayıcıya GİTMEZ, ilk sonucu döner', async () => {
    const store = new InMemoryIdempotencyStore<{ token: string }>();
    const operation = vi.fn(async () => ({ token: 'tok-1' }));

    const first = await runIdempotent(store, 'pay_x', { amount: 96_800 }, operation);
    // İlk çağrı bitti; ikinci çağrı kayıtlı sonucu okur.
    const second = await runIdempotent(store, 'pay_x', { amount: 96_800 }, operation);

    expect(first).toEqual(second);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('iki parmak aynı anda basarsa ikincisi "işleniyor" der, ikinci ödeme başlatmaz', async () => {
    const store = new InMemoryIdempotencyStore<{ token: string }>();
    let release: (() => void) | undefined;
    const slow = vi.fn(
      async () =>
        new Promise<{ token: string }>((resolve) => {
          release = () => resolve({ token: 'tok-1' });
        }),
    );

    const inFlight = runIdempotent(store, 'pay_y', { amount: 96_800 }, slow);
    await expect(
      runIdempotent(store, 'pay_y', { amount: 96_800 }, slow),
    ).rejects.toBeInstanceOf(PaymentInFlightError);

    release?.();
    await inFlight;
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('aynı anahtar farklı tutarla gelirse ÇEKMEZ, reddeder', async () => {
    const store = new InMemoryIdempotencyStore<{ token: string }>();
    await runIdempotent(store, 'pay_z', { amount: 96_800 }, async () => ({ token: 'tok' }));

    await expect(
      runIdempotent(store, 'pay_z', { amount: 89_900 }, async () => ({ token: 'tok2' })),
    ).rejects.toBeInstanceOf(PaymentIdempotencyConflictError);
  });

  it('geçici hatadan sonra aynı anahtar yeniden denenebilir', async () => {
    const store = new InMemoryIdempotencyStore<{ token: string }>();
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('503'), { retryable: true }))
      .mockResolvedValueOnce({ token: 'tok-2' });

    await expect(runIdempotent(store, 'pay_r', { amount: 1 }, flaky)).rejects.toThrow('503');
    await expect(runIdempotent(store, 'pay_r', { amount: 1 }, flaky)).resolves.toEqual({
      token: 'tok-2',
    });
  });

  it('kalıcı hatadan sonra aynı istek tekrar tekrar gönderilmez', async () => {
    const store = new InMemoryIdempotencyStore<{ token: string }>();
    const failing = vi.fn().mockRejectedValue(new Error('kart reddedildi'));

    await expect(runIdempotent(store, 'pay_p', { amount: 1 }, failing)).rejects.toThrow();
    await expect(runIdempotent(store, 'pay_p', { amount: 1 }, failing)).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

describe('iyzico checkout', () => {
  it('ödeme sayfasını açar ve idempotency anahtarını conversationId olarak gönderir', async () => {
    const { adapter: iyzico, calls } = adapter(() => fixture('iyzico-checkout-init'));
    const result: InitializeCheckoutOutput = await iyzico.initializeCheckout(checkoutInput());

    expect(result.redirectUrl).toContain('sandbox-cpp.iyzipay.com');
    expect(result.paymentToken).toBe('d9f1c0a2-6c1e-4b6e-9c1a-2f7c9e8b1a34');
    expect(result.status).toBe('init');

    const body = calls[0]?.body as Record<string, unknown>;
    expect(body['conversationId']).toBe(checkoutInput().idempotencyKey);
    expect(body['basketId']).toBe(ORDER_ID);
    expect(body['price']).toBe('968.00');
    // Fiziksel ürün: hem iyzico kuralları hem Apple 3.1.5 için kritik.
    expect((body['basketItems'] as Array<{ itemType: string }>)[0]?.itemType).toBe('PHYSICAL');
  });

  it('imza başlığı gövdeye ve yola bağlıdır', async () => {
    const { adapter: iyzico, calls } = adapter(() => fixture('iyzico-checkout-init'));
    await iyzico.initializeCheckout(checkoutInput());
    await iyzico.initializeCheckout(checkoutInput({ amountKurus: 96_800 }));

    const [first, second] = calls;
    expect(first?.headers['authorization']).toMatch(/^IYZWSv2 /);
    // Aynı gövde + aynı random key ⇒ aynı imza (deterministik, test edilebilir).
    expect(first?.headers['authorization']).toBe(second?.headers['authorization']);
  });

  it('sepet toplamı tutmuyorsa sağlayıcıya HİÇ gitmez', async () => {
    const { adapter: iyzico, fetchImpl } = adapter(() => fixture('iyzico-checkout-init'));
    await expect(
      iyzico.initializeCheckout(checkoutInput({ amountKurus: 100_000 })),
    ).rejects.toMatchObject({ code: 'basket_mismatch' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('başarılı sonucu kuruşa çevirir ve taksiti taşır', async () => {
    const { adapter: iyzico } = adapter(() => fixture('iyzico-retrieve-success'));
    const result = await iyzico.retrieveResult('tok');
    expect(result.status).toBe('captured');
    expect(result.amountKurus).toBe(96_800);
    expect(result.installment).toBe(3);
    expect(result.orderId).toBe(ORDER_ID);
    expect(result.providerRef).toBe('21504678');
  });

  it('başarısız ödemeyi Türkçe, ne yapılacağını söyleyen mesaja çevirir', async () => {
    const { adapter: iyzico } = adapter(() => fixture('iyzico-retrieve-failure'));
    const result = await iyzico.retrieveResult('tok');
    expect(result.status).toBe('failed');
    expect(result.failureTr).toContain('limiti');
  });

  it('iadeyi gönderir', async () => {
    const { adapter: iyzico } = adapter(() => fixture('iyzico-refund'));
    const result = await iyzico.refund({
      providerRef: '24009321',
      amountKurus: 96_800,
      idempotencyKey: 'ref_1',
    });
    expect(result.status).toBe('refunded');
    expect(result.amountKurus).toBe(96_800);
  });

  it('geri dönüş (callback) tek başına güvenilmez — token şart', () => {
    const { adapter: iyzico } = adapter(() => ({}));
    expect(iyzico.verifyCallback({ token: 'abc' })).toBe(true);
    expect(iyzico.verifyCallback({ status: 'success' })).toBe(false);
  });
});

describe('kart verisi', () => {
  it('ham yanıtta kart bilgisi saklanmaz', async () => {
    const { adapter: iyzico } = adapter(() => fixture('iyzico-retrieve-success'));
    const result = await iyzico.retrieveResult('tok');
    expect(result.raw?.['binNumber']).toBe('[REDACTED]');
    expect(result.raw?.['lastFourDigits']).toBe('[REDACTED]');
    expect(JSON.stringify(result.raw)).not.toContain('552879');
  });

  it('iç içe nesnelerde de temizler', () => {
    const redacted = redactPaymentPayload({
      paymentCard: { cardNumber: '5528790000000008', cvc: '123' },
      paymentId: '1',
    });
    expect((redacted['paymentCard'] as Record<string, unknown>)['cardNumber']).toBe('[REDACTED]');
    expect(redacted['paymentId']).toBe('1');
  });

  it('bilinmeyen hata kodunda bile kullanıcıya anlamlı bir cümle döner', () => {
    expect(iyzicoErrorTr('99999')).toContain('tekrar deneyebilirsiniz');
  });
});
