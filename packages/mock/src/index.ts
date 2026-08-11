/**
 * @kendihikayem/mock — sözleşmenin çalışan ikizi.
 *
 * FE ajanları (F1, F2, F3) backend'i HİÇ beklemez: bu paket sözleşmedeki 82 ucun
 * hepsini gerçekçi Türkçe içerikle, gerçekçi gecikmeyle, gerçekçi hatalarla servis eder.
 *
 * KULLANIM
 * ```ts
 * // React Native (Expo)
 * import { setupMockServer } from '@kendihikayem/mock/native';
 * if (__DEV__ && API_MODE === 'mock') setupMockServer().listen({ onUnhandledRequest: 'bypass' });
 *
 * // Node / vitest
 * import { setupMockServer } from '@kendihikayem/mock/node';
 *
 * // Tarayıcı
 * import { setupMockWorker } from '@kendihikayem/mock/browser';
 * ```
 *
 * SENARYOLAR
 * ```ts
 * import { configureMock, resetStore } from '@kendihikayem/mock';
 * configureMock({ scenario: 'kredi_yok' });   // 402 yolunu dene
 * configureMock({ sseEnabled: false });        // polling yoluna zorla
 * configureMock({ latencyMs: 0 });             // testlerde
 * resetStore();                                // her testten önce
 * ```
 */

export * from './fixtures';
export * from './scenarios';
export { createHandlers, handlers, resolvers } from './handlers';
export {
  resetStore,
  snapshotJob,
  startJob,
  store,
  type JobRuntime,
  type MockState,
} from './store';
export { jobEventStream, sessionEventStream } from './sse';

/** Mock ortamında SMS doğrulama kodu her zaman budur. */
export const MOCK_OTP_CODE = '123456' as const;

/** Mock'un taklit ettiği taban adres. Handler'lar `*` ile her tabanı yakalar. */
export const MOCK_BASE_URL = 'https://api.kendihikayem.com' as const;
