/**
 * native.ts — React Native (Expo) için mock sunucusu.
 *
 * `msw/native` XMLHttpRequest ve fetch'i RN ortamında yakalar; ayrı bir service
 * worker dosyası gerekmez. Yalnızca geliştirme derlemesinde çağırın:
 *
 * ```ts
 * if (__DEV__ && API_MODE === 'mock') {
 *   const { setupMockServer } = await import('@kendihikayem/mock/native');
 *   setupMockServer().listen({ onUnhandledRequest: 'bypass' });
 * }
 * ```
 *
 * ⚠️ SSE (akış gövdesi) React Native fetch'inde desteklenmez; mobil istemci
 * iş takibini `GET /v1/jobs/:id` polling'i ile yapmalıdır. Sözleşme zaten
 * SSE'yi isteğe bağlı tanımlar.
 */

import { setupServer } from 'msw/native';

import { handlers } from './handlers';

export function setupMockServer(): ReturnType<typeof setupServer> {
  return setupServer(...handlers);
}
