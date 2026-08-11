/**
 * http-pod.test.ts — the POD adapter, driven by RECORDED responses.
 *
 * ⚠️ These fixtures are hand-written from the vendors' published documentation, NOT captured
 * from a live account (there is none). They pin our parsing and our error mapping; they do
 * not prove the vendor behaves this way. The first live sandbox run is still owed.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { ProviderCallContext } from '../core/types';
import { ProviderError } from '../core/errors';
import { classifyPrintError } from './errors';
import { HttpPodPrintAdapter, cloudprinterDialect } from './http-pod';

const ctx: ProviderCallContext = { requestId: 'req-42', correlationId: 'corr-42' };

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

function stubFetch(
  responder: (url: string, init: RequestInit | undefined) => { status?: number; body: unknown },
): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const { status = 200, body } = responder(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function adapter(fetchImpl: typeof fetch) {
  return new HttpPodPrintAdapter({
    dialect: cloudprinterDialect,
    baseUrl: 'https://api.cloudprinter.example',
    apiKey: 'test-key',
    skuByFormat: { kare21_24_sert: 'sku_square21_24_hc' },
    webhookSecret: 'whsec_test',
    fetchImpl,
  });
}

const submitInput = {
  orderId: 'KH-2026-000001',
  formatCode: 'kare21_24_sert',
  quantity: 1,
  files: { interiorPdfUrl: 'https://cdn/ic.pdf', coverPdfUrl: 'https://cdn/kapak.pdf' },
  shipTo: {
    fullName: 'Ayşe Yılmaz',
    line1: 'Bağdat Cad. 12',
    city: 'İstanbul',
    district: 'Kadıköy',
    postalCode: '34710',
    phone: '+905321234567',
    country: 'TR' as const,
  },
};

describe('POD adaptörü — teklif', () => {
  it('kuruşa çevirir ve toplamı adetle çarpar', async () => {
    const print = adapter(stubFetch(() => ({ body: fixture('cloudprinter-quote') })));
    const { value } = await print.quote(
      {
        formatCode: 'kare21_24_sert',
        pageCount: 24,
        quantity: 2,
        destination: { country: 'TR', city: 'İstanbul' },
      },
      ctx,
    );

    expect(value.unitPriceKurus).toBe(41_250);
    expect(value.shippingKurus).toBe(6_900);
    expect(value.totalKurus).toBe(41_250 * 2 + 6_900);
    expect(value.etaBusinessDays).toBe(6);
  });

  it('TRY dışında bir para birimini SESSİZCE çevirmez, reddeder', async () => {
    const print = adapter(
      stubFetch(() => ({
        body: { price: { product: '12.50', shipping: '3.00', currency: 'EUR' } },
      })),
    );
    await expect(
      print.quote(
        {
          formatCode: 'kare21_24_sert',
          pageCount: 24,
          quantity: 1,
          destination: { country: 'TR', city: 'İzmir' },
        },
        ctx,
      ),
    ).rejects.toMatchObject({ providerCode: 'currency_mismatch' });
  });
});

describe('POD adaptörü — sipariş', () => {
  it('siparişi bizim referansımızla gönderir ve idempotency başlığı taşır', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined;
    const print = adapter(
      stubFetch((url, init) => {
        seen = { url, init };
        return { body: fixture('cloudprinter-order-created') };
      }),
    );

    const { value } = await print.submit(submitInput, ctx);
    expect(value.externalId).toBe('KH-2026-000001');
    expect(value.status).toBe('submitted');

    const headers = seen?.init?.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe('req-42');
    const body = JSON.parse(String(seen?.init?.body)) as { reference: string };
    expect(body.reference).toBe('KH-2026-000001');
  });

  it('kargo bilgisini durum yanıtından okur', async () => {
    const print = adapter(stubFetch(() => ({ body: fixture('cloudprinter-order-shipped') })));
    const { value } = await print.status('KH-2026-000001', ctx);
    expect(value.status).toBe('shipped');
    expect(value.carrier).toBe('Yurtiçi Kargo');
    expect(value.trackingUrl).toContain('yurticikargo');
  });

  it('webhook gövdesini yoklamayla aynı şekle çevirir', () => {
    const print = adapter(stubFetch(() => ({ body: {} })));
    const parsed = print.parseWebhook(fixture('cloudprinter-order-shipped'));
    expect(parsed.status).toBe('shipped');
    expect(parsed.externalId).toBe('KH-2026-000001');
  });

  it('bilinmeyen bir durum kodunu ASLA "error" saymaz', () => {
    expect(cloudprinterDialect.mapStatus('some_new_state')).toBe('queued');
  });
});

describe('POD adaptörü — hatalar', () => {
  it('stok hatasını Türkçe, tekrar denenebilir bir mesaja çevirir', async () => {
    const print = adapter(
      stubFetch(() => ({ status: 409, body: fixture('cloudprinter-error-stock') })),
    );
    const error = await print.submit(submitInput, ctx).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    const failure = classifyPrintError(error);
    expect(failure.code).toBe('stok_yok');
    expect(failure.retryable).toBe(true);
  });

  it('dosya reddini "baskı reddi" olarak sınıflar ve kullanıcıdan bir şey beklemez', async () => {
    const print = adapter(
      stubFetch(() => ({ status: 422, body: fixture('cloudprinter-error-file') })),
    );
    const error = await print.submit(submitInput, ctx).catch((caught: unknown) => caught);
    const failure = classifyPrintError(error);
    expect(failure.code).toBe('baski_reddi');
    expect(failure.userFixable).toBe(false);
    expect(failure.actionTr).toContain('yeniden gönderiyor');
  });

  it('5xx’i tekrar denenebilir sayar', async () => {
    const print = adapter(stubFetch(() => ({ status: 503, body: { error: {} } })));
    const error = (await print
      .status('x', ctx)
      .catch((caught: unknown) => caught)) as ProviderError;
    expect(error.retryable).toBe(true);
    expect(classifyPrintError(error).code).toBe('saglayici_erisilemiyor');
  });
});

describe('webhook imzası', () => {
  const print = adapter(stubFetch(() => ({ body: {} })));
  const body = JSON.stringify({ order: { reference: 'KH-1', status: 'shipped' } });

  it('imzasız webhook’u kabul etmez — sipariş durumu dışarıdan oynatılamaz', () => {
    expect(print.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(print.verifyWebhookSignature(body, 'sha256=deadbeef')).toBe(false);
  });

  it('doğru imzayı kabul eder', async () => {
    const { createHmac } = await import('node:crypto');
    const signature = createHmac('sha256', 'whsec_test').update(body).digest('hex');
    expect(print.verifyWebhookSignature(body, `sha256=${signature}`)).toBe(true);
  });
});
