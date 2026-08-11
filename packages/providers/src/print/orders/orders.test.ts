import { describe, expect, it } from 'vitest';

import {
  ORDER_TIMELINE_TR,
  OrderTransitionError,
  assertTransition,
  canTransition,
  evaluateCancellation,
  orderStatusForPrintJob,
  toContractStatus,
} from './state';
import {
  ORDER_RETENTION_CLASS,
  WithdrawalEvidenceError,
  assertWithdrawalEvidence,
  buildWithdrawalNoticeTr,
  documentSha256,
  orderDocumentPurgeAfter,
} from './legal';
import { buildInvoice, formatKurusTr, kdvFromGross } from './invoice';

describe('sipariş durum makinesi', () => {
  it('yalnızca tanımlı geçişlere izin verir', () => {
    expect(canTransition('created', 'awaiting_payment')).toBe(true);
    expect(canTransition('paid', 'in_production')).toBe(true);
    expect(canTransition('shipped', 'in_production')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
  });

  it('geçersiz geçişte Türkçe mesajlı hata atar', () => {
    expect(() => assertTransition('delivered', 'in_production')).toThrow(OrderTransitionError);
    try {
      assertTransition('delivered', 'in_production');
    } catch (error) {
      expect((error as OrderTransitionError).messageTr).toContain('uygun değil');
    }
  });

  it('baskı işi durumunu sipariş durumuna çevirir', () => {
    expect(orderStatusForPrintJob('printing')).toBe('in_production');
    expect(orderStatusForPrintJob('shipped')).toBe('shipped');
    expect(orderStatusForPrintJob('error')).toBe('failed');
    expect(orderStatusForPrintJob('queued')).toBeUndefined();
  });

  it('sözleşme durumu "üretimde" ile "baskıda"yı ayırır — iptal sınırı burada', () => {
    expect(toContractStatus('in_production', 'submitted')).toBe('uretimde');
    expect(toContractStatus('in_production', 'printing')).toBe('baskida');
    expect(ORDER_TIMELINE_TR.baskida).toBe('Kitabınız baskıya girdi');
  });
});

describe('iptal penceresi — ürünün verdiği söz', () => {
  it('ödeme öncesi iptal serbest', () => {
    const verdict = evaluateCancellation({ status: 'awaiting_payment' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.refund).toBe('none');
  });

  it('ödendi ama baskıya girmediyse iptal + tam iade', () => {
    const verdict = evaluateCancellation({ status: 'paid', printJobStatus: 'queued' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.refund).toBe('full');
    expect(verdict.reasonTr).toContain('iade edilir');
  });

  it('matbaa işi kabul ettiyse iptal YOK — sınır kodda zorlanıyor', () => {
    for (const printJobStatus of ['accepted', 'printing', 'shipped'] as const) {
      const verdict = evaluateCancellation({ status: 'in_production', printJobStatus });
      expect(verdict.allowed).toBe(false);
      expect(verdict.refund).toBe('none');
      expect(verdict.reasonTr).toMatch(/cayma hakkı|iptal edilemiyor|iptal mümkün değil/);
    }
  });

  it('kargodaki ve teslim edilmiş sipariş iptal edilemez, teslim sonrası yol gösterir', () => {
    expect(evaluateCancellation({ status: 'shipped' }).allowed).toBe(false);
    expect(evaluateCancellation({ status: 'delivered' }).reasonTr).toContain('30 gün');
  });

  it('başarısız siparişte para iade edilir', () => {
    const verdict = evaluateCancellation({ status: 'failed' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.refund).toBe('full');
  });
});

describe('6502 — cayma hakkı kanıt zinciri', () => {
  const bodyMd = '# Ön Bilgilendirme Formu\n\nKişiye özel üretim; cayma hakkı yoktur…';
  const hash = documentSha256(bodyMd);
  const shownAt = new Date('2026-08-11T09:00:00Z');
  const acceptedAt = new Date('2026-08-11T09:00:30Z');
  const orderCreatedAt = new Date('2026-08-11T09:00:35Z');

  const base = {
    withdrawalDocId: 'doc-cayma',
    distanceContractDocId: 'doc-mesafeli',
    documentSha256: hash,
    shownAt,
    acceptedAt,
    accepted: true,
    orderCreatedAt,
  };

  it('geçerli kanıtı kabul eder ve 10 yıllık saklama tarihini yazar', () => {
    const evidence = assertWithdrawalEvidence(base, {
      id: 'doc-cayma',
      kind: 'on_bilgilendirme',
      version: '2026-08-01.1',
      bodyMd,
    });
    expect(evidence.accepted).toBe(true);
    expect(evidence.purgeAfter.getUTCFullYear()).toBe(2036);
    expect(ORDER_RETENTION_CLASS).toBe('legal_hold_10y');
    expect(orderDocumentPurgeAfter(orderCreatedAt).getUTCFullYear()).toBe(2036);
  });

  it('onay yoksa sipariş oluşturulamaz', () => {
    expect(() => assertWithdrawalEvidence({ ...base, accepted: false })).toThrow(
      WithdrawalEvidenceError,
    );
  });

  it('metin sipariş ONAYINDAN SONRA gösterildiyse istisna işlemez', () => {
    expect(() =>
      assertWithdrawalEvidence({
        ...base,
        shownAt: new Date('2026-08-11T09:10:00Z'),
        acceptedAt: new Date('2026-08-11T09:05:00Z'),
      }),
    ).toThrow(/withdrawal evidence rejected: ZAMAN_SIRASI_HATALI/);
  });

  it('onay sipariş oluşturulduktan SONRA alınmışsa reddeder', () => {
    expect(() =>
      assertWithdrawalEvidence({
        ...base,
        acceptedAt: new Date('2026-08-11T09:20:00Z'),
      }),
    ).toThrow(WithdrawalEvidenceError);
  });

  it('metin sonradan değiştirildiyse hash tutmaz ve fark yakalanır', () => {
    expect(() =>
      assertWithdrawalEvidence(base, {
        id: 'doc-cayma',
        kind: 'on_bilgilendirme',
        version: '2026-08-01.1',
        bodyMd: `${bodyMd} (küçük bir düzeltme)`,
      }),
    ).toThrow(/BELGE_DEGISMIS/);
  });

  it('belge kimlikleri eksikse reddeder', () => {
    expect(() => assertWithdrawalEvidence({ ...base, distanceContractDocId: '' })).toThrow(
      /BELGE_EKSIK/,
    );
  });

  it('cayma metni hem istisnayı hem iptal sınırını söyler', () => {
    const notice = buildWithdrawalNoticeTr({ childName: 'Elif' });
    expect(notice).toContain('CAYMA HAKKINIZ BULUNMAMAKTADIR');
    expect(notice).toContain('6502');
    expect(notice).toContain('baskıya girmeden önce');
    expect(notice).toContain('Elif');
  });
});

describe('KDV ve fatura', () => {
  it('KDV fiyatın İÇİNDEN hesaplanır (fiyatlar KDV dahil)', () => {
    // 899,00 TL'nin içindeki %20 KDV: 899 × 0,20 / 1,20 = 149,83 TL
    expect(kdvFromGross(89_900, 0.2)).toBe(14_983);
  });

  it('fatura kalemleri tahsil edilen tutara birebir eşittir', () => {
    const invoice = buildInvoice({
      formatTitleTr: '21×21 cm sert kapak',
      quantity: 1,
      unitPriceKurus: 89_900,
      shippingKurus: 6_900,
    });
    expect(invoice.grossKurus).toBe(96_800);
    expect(invoice.netKurus + invoice.kdvKurus).toBe(invoice.grossKurus);
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.kdvByRate['20']).toBe(invoice.kdvKurus);
  });

  it('indirim brütten düşer, KDV indirimli tutardan hesaplanır', () => {
    const invoice = buildInvoice({
      formatTitleTr: '21×21 cm sert kapak',
      quantity: 1,
      unitPriceKurus: 89_900,
      shippingKurus: 0,
      discountKurus: 10_000,
    });
    expect(invoice.grossKurus).toBe(79_900);
    expect(invoice.kdvKurus).toBe(kdvFromGross(79_900, 0.2));
  });

  it('KDV oranı yapılandırılabilir — kitap istisnası uygulanırsa sıfırlanır', () => {
    const invoice = buildInvoice({
      formatTitleTr: 'kitap',
      quantity: 1,
      unitPriceKurus: 89_900,
      shippingKurus: 6_900,
      rates: { book: 0, shipping: 0.2 },
    });
    expect(invoice.lines[0]?.kdvKurus).toBe(0);
    expect(invoice.lines[1]?.kdvKurus).toBeGreaterThan(0);
  });

  it('tutarı Türkçe biçimler', () => {
    expect(formatKurusTr(96_800)).toBe('968,00 TL');
  });
});
