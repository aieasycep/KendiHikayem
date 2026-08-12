/**
 * infra/bundle/cli.mjs — `db:migrate` and `db:seed`, as deployable single files.
 *
 * These run in production, not only on a laptop: a Render deploy applies migrations and
 * seeds the catalogue before the service is useful (docs/DEPLOY.md step 2). They are
 * bundled for the same reason the server is — the repository's extensionless relative
 * imports are not resolvable by plain Node — and separately from it because they are
 * short-lived processes that must be runnable without booting a queue or a web server.
 *
 * ⚠️ The migration SQL is NOT bundled. Drizzle reads `migrations/*.sql` from disk at run
 * time, so those files are copied into the image as files; the bundle only carries the
 * runner. `MIGRATIONS_DIR` lets the image point the runner at where they landed.
 */

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outdir = resolve(root, 'dist');
await mkdir(outdir, { recursive: true });

const banner = [
  "import { createRequire as __khCreateRequire } from 'node:module';",
  "import { dirname as __khDirname } from 'node:path';",
  "import { fileURLToPath as __khFileURLToPath } from 'node:url';",
  'const require = __khCreateRequire(import.meta.url);',
  'const __filename = __khFileURLToPath(import.meta.url);',
  'const __dirname = __khDirname(__filename);',
].join('\n');

for (const [entry, outfile] of [
  ['packages/db/src/migrate.ts', 'migrate.mjs'],
  ['packages/db/src/seed/index.ts', 'seed.mjs'],
]) {
  await build({
    entryPoints: [resolve(root, entry)],
    outfile: resolve(outdir, outfile),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    // Nothing native here; `postgres` and `drizzle-orm` are ordinary JS.
    external: [],
    sourcemap: false,
    banner: { js: banner },
    logLevel: 'warning',
  });
  process.stdout.write(`[bundle] dist/${outfile}\n`);
}
