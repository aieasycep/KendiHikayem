import { describe, expect, it } from 'vitest';

import type { ProviderCallContext } from '../core/types';
import { ProviderError } from '../core/errors';
import { classifyPrintError, printFailure } from './errors';
import {
  InMemoryManualPrintStore,
  ManualTrPrintAdapter,
  type ManualFormatSpec,
} from './manual-tr';
import { quotePrint } from './pricing';
import { renderWorkOrderTextTr } from './work-order';

const ctx: ProviderCallContext = { requestId: 'req-1', correlationId: 'corr-1' };

const FORMAT: ManualFormatSpec = {
  titleTr: '21×21 cm • 24 sayfa • sert kapak',
  pageCount: 24,
  trimMm: [210, 210],
  bleedMm: 5,
  paperTr: '170 gr mat kuşe',
  bindingTr: 'Sert kapak (mat selefon)',
};

function adapter(store = new InMemoryManualPrintStore()) {
  return {
    store,
    adapter: new ManualTrPrintAdapter({
      store,
      formats: { kare21_24_sert: FORMAT },
      spineMmFor: () => 8.4,
      standingNotesTr: ['İlk 5 siparişte fiziksel prova zorunlu.'],
      now: () => new Date('2026-08-11T09:00:00Z'),
    }),
  };
}

const submitInput = {
  orderId: 'KH-2026-000001',
  formatCode: 'kare21_24_sert',
  quantity: 1,
  files: {
    interiorPdfUrl: 'https://cdn.kendihikayem.com/ic.pdf',
    coverPdfUrl: 'https://cdn.kendihikayem.com/kapak.pdf',
  },
  shipTo: {
    fullName: 'Ayşe Yılmaz',
    line1: 'Bağdat Cad. No 12 D 4',
    city: 'İstanbul',
    district: 'Kadıköy',
    postalCode: '34710',
    phone: '+905321234567',
    country: 'TR' as const,
  },
};

describe('fiyatlandırma', () => {
  it('ilk kopya tam, sonraki kopyalar indirimli', () => {
    const one = quotePrint({ formatCode: 'kare21_24_sert', quantity: 1 });
    const two = quotePrint({ formatCode: 'kare21_24_sert', quantity: 2 });
    expect(one.totalKurus).toBe(89_900 + 6_900);
    expect(two.subtotalKurus).toBe(89_900 + 74_900);
  });

  it('sepet eşiği aşılınca kargo bedava', () => {
    const quote = quotePrint({ formatCode: 'kare21_24_sert', quantity: 2 });
    expect(quote.shippingKurus).toBe(0);
  });

  it('uzak illere teslim süresi uzar', () => {
    const base = quotePrint({ formatCode: 'kare21_24_sert', quantity: 1, city: 'İstanbul' });
    const slow = quotePrint({ formatCode: 'kare21_24_sert', quantity: 1, city: 'Hakkari' });
    expect(slow.etaBusinessDays[1]).toBeGreaterThan(base.etaBusinessDays[1]);
  });
});

describe('manual_tr adaptörü', () => {
  it('iş emrini üretir ve işi OPERATÖR BEKLİYOR durumunda bırakır', async () => {
    const { adapter: print, store } = adapter();
    const result = await print.submit(submitInput, ctx);

    // Kimse dosyayı matbaaya göndermedi: durum "submitted" DEĞİL.
    expect(result.value.status).toBe('queued');
    const job = store.list()[0];
    expect(job?.workOrder.spineMm).toBe(8.4);
    expect(job?.workOrderTextTr).toContain('Sırt kalınlığı: 8.4 mm');
    expect(job?.workOrderTextTr).toContain('Kadıköy');
    expect(job?.workOrderTextTr).toContain('İlk 5 siparişte fiziksel prova zorunlu.');
  });

  it('aynı sipariş iki kez gönderilirse İKİNCİ bir iş açılmaz', async () => {
    const { adapter: print, store } = adapter();
    const first = await print.submit(submitInput, ctx);
    const second = await print.submit(submitInput, { ...ctx, requestId: 'req-2' });

    expect(second.value.externalId).toBe(first.value.externalId);
    expect(store.list()).toHaveLength(1);
  });

  it('baskıya girmiş işi iptal etmeyi reddeder', async () => {
    const { adapter: print } = adapter();
    const { value } = await print.submit(submitInput, ctx);
    await print.recordOperatorUpdate(value.externalId, { status: 'printing' });

    await expect(print.cancel(value.externalId, ctx)).rejects.toBeInstanceOf(ProviderError);
    await expect(print.cancel(value.externalId, ctx)).rejects.toMatchObject({
      providerCode: 'order_already_in_production',
    });
  });

  it('operatör kargo bilgisini yazınca durum takibi güncellenir', async () => {
    const { adapter: print } = adapter();
    const { value } = await print.submit(submitInput, ctx);
    await print.recordOperatorUpdate(value.externalId, {
      status: 'shipped',
      carrier: 'Yurtiçi Kargo',
      trackingNo: '1234567890123',
      trackingUrl: 'https://kargo.example/1234567890123',
    });

    const status = await print.status(value.externalId, ctx);
    expect(status.value.status).toBe('shipped');
    expect(status.value.carrier).toBe('Yurtiçi Kargo');
  });

  it('tanınmayan format için Türkçeye çevrilebilir bir sağlayıcı hatası atar', async () => {
    const { adapter: print } = adapter();
    await expect(
      print.submit({ ...submitInput, formatCode: 'yok' }, ctx),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('iş emri metni', () => {
  it('matbaanın kontrol edeceği bütün ölçüleri taşır', () => {
    const text = renderWorkOrderTextTr({
      orderNo: 'KH-2026-000042',
      formatCode: 'kare21_24_sert',
      titleTr: 'Elif ve Tavan Arasındaki Işık',
      quantity: 2,
      pageCount: 24,
      trimMm: [210, 210],
      bleedMm: 5,
      spineMm: 8.4,
      paperTr: '170 gr mat kuşe',
      bindingTr: 'Sert kapak',
      colorProfileTr: 'sRGB',
      files: { interiorPdfUrl: 'https://x/ic.pdf', coverPdfUrl: 'https://x/kapak.pdf' },
      shipTo: submitInput.shipTo,
      giftNoteTr: 'İyi ki doğdun Elif!',
      createdAt: '2026-08-11T09:00:00.000Z',
    });

    expect(text).toContain('210 × 210 mm');
    expect(text).toContain('24 sayfa');
    expect(text).toContain('Taşma payı: 5 mm');
    expect(text).toContain('HEDİYE NOTU');
    expect(text).toContain('İyi ki doğdun Elif!');
  });
});

describe('hata sınıflandırması', () => {
  it('stok yokluğunu tekrar denenebilir, adres hatasını kullanıcı düzeltir olarak işaretler', () => {
    expect(printFailure('stok_yok').retryable).toBe(true);
    expect(printFailure('adres_hatasi').userFixable).toBe(true);
    expect(printFailure('baski_reddi').userFixable).toBe(false);
  });

  it('sağlayıcı kodunu Türkçe mesaja çevirir', () => {
    const failure = classifyPrintError(
      new ProviderError({
        kind: 'invalid_request',
        provider: 'cloudprinter',
        operation: 'print.submit',
        providerCode: 'product_unavailable',
      }),
    );
    expect(failure.code).toBe('stok_yok');
    expect(failure.messageTr).toContain('üretilemiyor');
    expect(failure.actionTr).toContain('ücretsiz iptal');
  });

  it('bilinmeyen hatayı sessizce yutmaz', () => {
    expect(classifyPrintError(new Error('boom')).code).toBe('bilinmeyen');
  });
});
