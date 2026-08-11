import { defineConfig } from 'vitest/config';

/**
 * Raster work is genuinely slow, and vitest's 5 s default is sized for unit tests.
 *
 * Encoding a 4096 px page, downsampling it to trim+bleed with Lanczos and re-reading its
 * metadata is a second or two on its own; when `turbo run test` runs every package in
 * parallel on a shared CPU it is several. Timing out there says nothing about the code —
 * it says the machine was busy — so the budget is raised rather than the assertions
 * weakened or the fixtures shrunk to sizes the print path never sees.
 */
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
