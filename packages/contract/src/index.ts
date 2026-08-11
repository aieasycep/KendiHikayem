/**
 * @kendihikayem/contract — frontend ile backend arasındaki TEK GERÇEK KAYNAK.
 *
 * Sahibi: A0-CONTRACT (SPEC §12). Kontrat değişikliği talebi:
 * `docs/contract-rfc/NNN-baslik.md` — istenen tip + gerekçe + hangi ekran.
 *
 * KULLANIM
 * ```ts
 * import { initClient } from '@ts-rest/core';
 * import { apiContract } from '@kendihikayem/contract';
 *
 * export const api = initClient(apiContract, {
 *   baseUrl: 'https://api.kendihikayem.com',
 *   baseHeaders: { 'x-client-version': '1.0.0', authorization: `Bearer ${token}` },
 * });
 *
 * const res = await api.stories.create({
 *   body: { ... },
 *   headers: { 'idempotency-key': crypto.randomUUID() },
 * });
 * if (res.status === 202) { trackJob(res.body.job); }
 * else { showError(res.body); }   // her hata gövdesi ApiError'dır
 * ```
 *
 * OPS ROUTER'I BURADA YOKTUR: `import { opsContract } from '@kendihikayem/contract/ops'`.
 */

import { initClient } from '@ts-rest/core';

import { apiContract } from './endpoints';

export * from './primitives';
export * from './auth';
export * from './billing';
export * from './catalog';
export * from './children';
export * from './privacy';
export * from './voice';
export * from './story';
export * from './audio';
export * from './print';
export * from './jobs';
export * from './events';
export * from './endpoints';

/** Sözleşme sürümü. OpenAPI snapshot'ı ve CHANGELOG.md bu numarayı taşır. */
export const CONTRACT_VERSION = '0.1.0' as const;

/** Üretim tabanı. İstemci `initClient` çağrısında bunu ya da yerel adresi verir. */
export const API_BASE_URL_PROD = 'https://api.kendihikayem.com' as const;

/**
 * Tipli istemci fabrikası. Her uygulama `initClient` kalıbını yeniden yazmasın;
 * `x-client-version` başlığı da böylece hiçbir yerde unutulmaz.
 *
 * Jeton değiştiğinde (giriş / çıkış / yenileme) istemciyi YENİDEN OLUŞTURUN.
 */
export function createApiClient(options: {
  baseUrl: string;
  /** Uygulama sürümü; sunucu eski istemciyi 426 ile kesebilir. */
  clientVersion: string;
  accessToken?: string;
}) {
  return initClient(apiContract, {
    baseUrl: options.baseUrl,
    baseHeaders: {
      'x-client-version': options.clientVersion,
      ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
    },
  });
}

/**
 * Yazma isteklerinde kullanılacak `Idempotency-Key`.
 * Aynı KULLANICI EYLEMİ için AYNI anahtar kullanılmalıdır: ekran yeniden
 * denerken anahtar değişirse ikinci kez ücretlendirme olur. Anahtarı eylemi
 * başlatan yerde bir kez üretip yeniden denemelerde taşıyın.
 */
export function newIdempotencyKey(prefix = 'kh'): string {
  const random = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${Date.now().toString(36)}-${random}`.slice(0, 128);
}
