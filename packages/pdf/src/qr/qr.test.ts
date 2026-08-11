import { describe, expect, it } from 'vitest';

import { buildQrMatrix, minimumQrBoxPt, qrPhysicalCheck } from './matrix';
import { mmToPt } from '../units';
import {
  DEFAULT_QR_TTL_DAYS,
  evaluateQrToken,
  isQrToken,
  mintQrToken,
  pageAudioUrl,
} from './token';

describe('karekod jetonu', () => {
  it('tahmin edilemez: 16 karakter, karışmayan alfabe', () => {
    const token = mintQrToken();
    expect(token).toHaveLength(16);
    expect(isQrToken(token)).toBe(true);
    // I, L, O ve U yok — telefonla okunurken karışmasın diye.
    expect(token).not.toMatch(/[ILOU]/);
  });

  it('aynı rastgelelikten aynı jeton çıkar (test edilebilirlik)', () => {
    const fixed = () => new Uint8Array(16).fill(7);
    expect(mintQrToken(fixed)).toBe(mintQrToken(fixed));
  });

  it('oturumsuz bağlantı üretir', () => {
    expect(pageAudioUrl('https://kendihikayem.com/', 'ABCDEFGH12345678')).toBe(
      'https://kendihikayem.com/p/ABCDEFGH12345678',
    );
  });

  it('iptal edilmiş jeton çalmaz ve nedenini Türkçe söyler', () => {
    const verdict = evaluateQrToken({
      token: 'ABCDEFGH12345678',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      revokedAt: new Date('2026-02-01T00:00:00Z'),
    });
    expect(verdict.state).toBe('revoked');
    expect(verdict.messageTr).toContain('kapatılmış');
  });

  it('süresi dolmuş jeton çalmaz', () => {
    const verdict = evaluateQrToken(
      { token: 'ABCDEFGH12345678', createdAt: new Date('2020-01-01T00:00:00Z') },
      { ttlDays: 30, now: new Date('2026-08-11T00:00:00Z') },
    );
    expect(verdict.state).toBe('expired');
    expect(verdict.messageTr).toContain('süresi doldu');
  });

  it('bilinmeyen jetonu ayırt eder — kitap elden ele geçebilir', () => {
    expect(evaluateQrToken(undefined).state).toBe('unknown');
  });

  it('varsayılan ömür 10 yıl: basılı kitap raftan inmez', () => {
    const verdict = evaluateQrToken(
      { token: 'ABCDEFGH12345678', createdAt: new Date('2026-08-11T00:00:00Z') },
      { now: new Date('2030-08-11T00:00:00Z') },
    );
    expect(DEFAULT_QR_TTL_DAYS).toBe(3650);
    expect(verdict.state).toBe('active');
  });
});

describe('karekod fiziği', () => {
  const matrix = buildQrMatrix('https://kendihikayem.com/p/ABCDEFGH12345678');

  it('24 mm kutuda okunur', () => {
    const check = qrPhysicalCheck(matrix, mmToPt(24));
    expect(check.ok).toBe(true);
    expect(check.moduleMm).toBeGreaterThanOrEqual(0.6);
  });

  it('12 mm kutuda okunmaz ve nedeni somut söylenir', () => {
    const check = qrPhysicalCheck(matrix, mmToPt(12));
    expect(check.ok).toBe(false);
    expect(check.reasonTr).toContain('mm');
  });

  it('asgari kutu ölçüsü modül sayısıyla büyür', () => {
    const short = buildQrMatrix('https://kh.com/p/AB');
    const long = buildQrMatrix(`https://kendihikayem.com/p/${'A'.repeat(200)}`);
    expect(minimumQrBoxPt(long)).toBeGreaterThan(minimumQrBoxPt(short));
  });
});
