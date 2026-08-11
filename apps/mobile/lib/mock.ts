/**
 * Mock server bootstrap — makes the APK fully usable with no backend, no internet.
 *
 * `@kendihikayem/mock`'s msw/native entry patches fetch/XMLHttpRequest inside the
 * app process; every contract endpoint answers with realistic Turkish fixtures,
 * realistic latency and a time-driven job simulation. The import is dynamic so
 * that a `live`-mode bundle never even parses msw.
 *
 * MUST be awaited before the first API call (app/_layout.tsx gates rendering on it).
 */

import './polyfills';

import { isMockMode } from './api';

let started: Promise<void> | undefined;

export function ensureMockServer(): Promise<void> {
  if (!isMockMode()) return Promise.resolve();
  started ??= (async () => {
    const [{ setupMockServer }, { configureMock }] = await Promise.all([
      import('@kendihikayem/mock/native'),
      import('@kendihikayem/mock'),
    ]);
    configureMock({
      // Default acceleration (12×) finishes the outline in ~1.5 s — too fast to even
      // read the S08 status lines. 2× keeps the demo honest: outline ~9 s, fill ~37 s,
      // voice clone ~12 s. Testers see the real waiting UX without the real bill.
      jobSpeed: 2,
      // React Native's fetch cannot stream response bodies — SSE is impossible on
      // this platform. Forcing it off proves the polling path (`useJob`) end to end.
      sseEnabled: false,
    });
    setupMockServer().listen({ onUnhandledRequest: 'bypass' });
  })();
  return started;
}
