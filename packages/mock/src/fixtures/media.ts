/**
 * media.ts — sahte imzalı medya üreticileri.
 *
 * NOT: URL'ler gerçek bir CDN'e işaret etmez. Bu BİLEREK böyledir — görsel
 * yüklenemediğinde istemcinin yer tutucu/hata durumunu göstermesi gerekir ve
 * mock bu yolu her açılışta egzersiz ettirir. Gerçek üretimde de bir sayfanın
 * görseli `manual_review` kuyruğuna düşebilir; ekran buna hazır olmalıdır.
 */

import { signedMediaSchema, type SignedMedia } from '@kendihikayem/contract';

const CDN = 'https://cdn.kendihikayem.com/mock';

/** Mock verisinin donmuş "şimdi"si. Testler ve ekran görüntüleri tekrarlanabilir olsun. */
export const MOCK_NOW = '2026-08-10T19:30:00Z';
export const MOCK_EXPIRES = '2026-08-11T19:30:00Z';

export function mockImage(path: string, width = 1024, height = 1024): SignedMedia {
  return signedMediaSchema.parse({
    url: `${CDN}/img/${path}.webp`,
    mimeType: 'image/webp',
    expiresAt: MOCK_EXPIRES,
    sizeBytes: 180_000,
    width,
    height,
  });
}

export function mockAudio(path: string, durationMs: number): SignedMedia {
  return signedMediaSchema.parse({
    url: `${CDN}/audio/${path}.m4a`,
    mimeType: 'audio/mp4',
    expiresAt: MOCK_EXPIRES,
    sizeBytes: Math.round((durationMs / 1000) * 16_000),
    durationMs,
  });
}

export function mockPdf(path: string, sizeBytes = 4_200_000): SignedMedia {
  return signedMediaSchema.parse({
    url: `${CDN}/pdf/${path}.pdf`,
    mimeType: 'application/pdf',
    expiresAt: MOCK_EXPIRES,
    sizeBytes,
  });
}

export function mockVideo(path: string, durationMs: number): SignedMedia {
  return signedMediaSchema.parse({
    url: `${CDN}/video/${path}.mp4`,
    mimeType: 'video/mp4',
    expiresAt: MOCK_EXPIRES,
    durationMs,
    width: 1080,
    height: 1080,
  });
}

/** ISO zamanını dakika ekleyerek kaydırır (kuyruk/SLA fixture'ları için). */
export function shiftMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString().replace('.000Z', 'Z');
}
