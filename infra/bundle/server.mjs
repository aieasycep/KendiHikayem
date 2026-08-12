/**
 * infra/bundle/server.mjs — the deployable server, as one file.
 *
 * WHY BUNDLE AT ALL. The repository's TypeScript uses extensionless relative imports
 * (`./server`, not `./server.js`), which is what every tool in the toolchain expects and
 * what plain Node ESM refuses to resolve. So "compile with tsc and run the output" is not
 * available without rewriting every import in the repo. Bundling resolves those imports at
 * build time instead, which also removes the two things that hurt most on a free tier: a
 * 300 MB `node_modules` in the image, and a transpile-on-every-cold-start runner.
 *
 * WHAT STAYS EXTERNAL, AND WHY EACH ONE.
 *   sharp   — native (libvips). A .node binary cannot be bundled, and it must be installed
 *             for the image's own platform, which is why the Dockerfile installs it in the
 *             runtime stage rather than copying it from the builder.
 *   bullmq  — loads its Lua scripts from disk relative to its own package directory. A
 *             bundle moves the file and the scripts are no longer beside it, so every queue
 *             operation fails at runtime with a missing-command error.
 *   ioredis — ⚠️ Nothing in this repository imports it. BullMQ v6 treats it as an OPTIONAL
 *             peer and resolves it BY NAME at run time (`loadIORedis`), so it is invisible
 *             to the bundler and absent from bullmq's own `dependencies`. Leaving it out
 *             produces a container that starts, applies migrations, seeds the catalogue,
 *             and then throws "BullMQ could not load the optional 'ioredis' package" once
 *             per queue — which is how this entry got written.
 *   pino    — resolves its transports by module path in a worker thread; the path has to
 *             exist on disk. Fastify's logger is pino, and Fastify reaches it through a
 *             CommonJS `require("pino")` that survives into the bundle.
 *
 * Everything else — Fastify, ts-rest, drizzle, postgres.js, zod — is ordinary JS
 * and bundles cleanly. If a new dependency turns out to read its own files at runtime, add
 * it to EXTERNAL with the reason, not silently.
 */

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const EXTERNAL = ['sharp', 'bullmq', 'ioredis', 'pino'];

const entry = resolve(root, 'apps/api/src/main.ts');
const outfile = resolve(root, 'dist/server.mjs');

await mkdir(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: EXTERNAL,
  sourcemap: true,
  minify: false,
  // Some CommonJS dependencies reference `require`, `__dirname` or `__filename`; under an
  // ESM bundle those are not defined. This shim gives them the real values instead of the
  // usual `undefined` that turns into an error thousands of lines into a stack trace.
  banner: {
    js: [
      "import { createRequire as __khCreateRequire } from 'node:module';",
      "import { dirname as __khDirname } from 'node:path';",
      "import { fileURLToPath as __khFileURLToPath } from 'node:url';",
      'const require = __khCreateRequire(import.meta.url);',
      'const __filename = __khFileURLToPath(import.meta.url);',
      'const __dirname = __khDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'info',
  metafile: true,
});

/**
 * The runtime `package.json`. Its `dependencies` are exactly the externals, so
 * `npm install --omit=dev` in the runtime stage pulls those and nothing else — which is
 * what keeps the final image measured in tens of megabytes rather than hundreds.
 *
 * ⚠️ The versions are read from the INSTALLED tree, not from any workspace manifest. `pino`
 * is the reason: it is a transitive dependency of Fastify and appears in nobody's
 * `dependencies`, so a manifest-only lookup silently omits it — and the omission is
 * invisible until the container starts and dies on `Cannot find package 'pino'`. Reading
 * what is actually installed pins what the build actually compiled against.
 */
const workspace = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

const dependencies = {};
for (const name of EXTERNAL) {
  // `require.resolve('<pkg>/package.json')` fails on packages whose `exports` map does not
  // publish it (bullmq is one). Resolving the entry point and walking up to the manifest
  // works for every layout.
  let dir = dirname(require.resolve(name));
  let version;
  for (let depth = 0; depth < 8 && !version; depth += 1) {
    try {
      const manifest = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
      if (manifest.name === name) version = manifest.version;
    } catch {
      /* keep walking */
    }
    dir = dirname(dir);
  }
  if (!version) throw new Error(`could not resolve an installed version of "${name}"`);
  dependencies[name] = version;
}

await writeFile(
  resolve(root, 'dist/package.json'),
  `${JSON.stringify(
    {
      name: 'kendihikayem-server',
      version: workspace.version,
      private: true,
      type: 'module',
      main: 'server.mjs',
      engines: workspace.engines,
      dependencies,
    },
    null,
    2,
  )}\n`,
);

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
process.stdout.write(`[bundle] dist/server.mjs — ${(bytes / 1024 / 1024).toFixed(2)} MB\n`);
process.stdout.write(`[bundle] external: ${EXTERNAL.join(', ')}\n`);
