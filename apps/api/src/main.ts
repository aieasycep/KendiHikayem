/**
 * main.ts — the process entry point, for all three process modes.
 *
 * Deliberately almost empty. Everything it would otherwise contain lives in
 * `bootstrap.ts`, which starts nothing on import and can therefore be exercised by a test
 * (`test/process-mode.integration.test.ts`). An entry point that also holds the logic is
 * an entry point whose logic is only ever tested by deploying it.
 *
 * What runs is decided by `PROCESS_MODE` (api | worker | all) — see `bootstrap.ts` for
 * what each mode means and why `all` exists.
 */

import { startProcess } from './bootstrap';

startProcess().catch((error) => {
  console.error('[boot] fatal', error);
  process.exit(1);
});
