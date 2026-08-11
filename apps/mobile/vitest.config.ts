import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Vitest is configured to resolve `msw` exactly the way Metro does on the
 * device (see metro.config.js): to apps/mobile/lib/mock-runtime/msw.ts.
 *
 * Without this the mobile tests would exercise real MSW — code that never runs
 * in the APK — and the shim that DOES run there would be tested by nothing.
 * Aliasing here means lib/mock-runtime/msw.test.ts drives the real handlers,
 * the real policy layer and the real fixtures through the real transport.
 *
 * Only apps/mobile is affected. packages/mock, apps/api and apps/web keep
 * testing against genuine MSW, which is what they ship with.
 */
const MSW_SHIM = path.resolve(__dirname, 'lib/mock-runtime/msw.ts');

export default defineConfig({
  resolve: {
    alias: [{ find: /^msw(\/.*)?$/, replacement: MSW_SHIM }],
  },
  test: {
    environment: 'node',
  },
});
