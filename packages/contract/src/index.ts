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
