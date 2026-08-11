// Metro configuration for a pnpm monorepo.
// Even with node-linker=hoisted, Metro needs to be told that source lives outside the app
// folder (packages/shared) and that node_modules is resolved from the workspace root.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

/* ── MSW is replaced on React Native ──────────────────────────────────────
 * `@kendihikayem/mock` imports `msw` / `msw/native`. That is correct on Node
 * and in the browser, and wrong on a phone:
 *
 *   - it pulled ~500 modules into the Hermes bundle (all of `graphql`,
 *     `tough-cookie`, and `@mswjs/interceptors` in BOTH its browser and its
 *     Node build) for a fetch interceptor we can write in 200 lines;
 *   - `msw/native`, `@mswjs/interceptors/fetch`, `/XMLHttpRequest` and
 *     `/WebSocket` all declare `exports` targets containing "..", which is
 *     invalid. Metro warned on every build and fell back to file-based
 *     resolution — i.e. it was guessing which build Hermes would run.
 *
 * The mock's actual logic (handlers, fixtures, scenarios, job simulation,
 * policy layer) is untouched and still runs verbatim; only the carrier changes.
 * See apps/mobile/lib/mock-runtime/msw.ts.
 *
 * Node consumers (apps/api, vitest, packages/mock's own tests) never go through
 * Metro, so they keep using real MSW.
 * ──────────────────────────────────────────────────────────────────────── */
const MSW_SHIM = path.resolve(projectRoot, 'lib/mock-runtime/msw.ts');
const MSW_SPECIFIERS = new Set(['msw', 'msw/native', 'msw/browser', 'msw/node']);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (MSW_SPECIFIERS.has(moduleName)) {
    return { type: 'sourceFile', filePath: MSW_SHIM };
  }
  const next = upstreamResolveRequest ?? context.resolveRequest;
  return next(context, moduleName, platform);
};

module.exports = config;
