/**
 * browser.ts — tarayıcı (Next.js / Playwright) için service worker tabanlı mock.
 *
 * `public/mockServiceWorker.js` dosyasının kopyalanmış olması gerekir:
 * `pnpm dlx msw init public/`
 */

import { setupWorker } from 'msw/browser';

import { handlers } from './handlers';

export function setupMockWorker(): ReturnType<typeof setupWorker> {
  return setupWorker(...handlers);
}
