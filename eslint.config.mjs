import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint 9 flat config.
 *
 * The important part of this file is the `boundaries` section. docs/SPEC.md §3 states that
 * the architectural boundaries are "enforced by CI — not a convention, a build error".
 * Ten agents work in parallel on this repo; without a machine-checked wall, apps/mobile
 * would eventually import packages/db and the whole parallelisation story collapses.
 *
 * Rule 1 (SPEC §3): apps/mobile, apps/web and apps/ops may import ONLY
 * packages/{contract,mock,ui,shared}. Importing packages/{db,providers,safety} — or any
 * other server-side package — is an error.
 */

/** Client apps. Ship to a device or a browser; must stay free of server-side code. */
const CLIENT_APPS = ['apps/mobile', 'apps/web', 'apps/ops'];
/** Server processes. May reach into any package. */
const SERVER_APPS = ['apps/api', 'apps/worker'];
/** Packages a client app is allowed to import. */
const CLIENT_SAFE_PACKAGES = ['contract', 'mock', 'ui', 'shared'];
/** Everything else: DB access, provider SDKs, secrets, heavy Node-only tooling. */
const SERVER_ONLY_PACKAGES = ['db', 'providers', 'safety', 'config', 'media', 'pdf'];

/**
 * AI/payment vendor SDKs. Only packages/providers may import these (SPEC §3 rule 6).
 * Enforced with `no-restricted-imports` rather than `boundaries` because that rule needs
 * no module resolution: it fires even before the SDK is installed, which is exactly the
 * moment an agent is most likely to reach for it.
 */
const PROVIDER_SDKS = [
  '@anthropic-ai/*',
  '@anthropic-ai/*/**',
  'openai',
  'openai/**',
  '@google/genai',
  '@google/generative-ai',
  'elevenlabs',
  'elevenlabs/**',
  '@cartesia/*',
  'iyzipay',
];

/** Server-side infrastructure that must never end up in a client bundle. */
const SERVER_LIBS = [
  'fastify',
  'fastify/**',
  'bullmq',
  'drizzle-orm',
  'drizzle-orm/**',
  'pg',
  'postgres',
  'ioredis',
  'node:fs',
  'node:child_process',
];

const PROVIDER_SDK_MESSAGE =
  "SINIR İHLALİ (SPEC §3, kural 6): sağlayıcı SDK'sı yalnızca packages/providers altında import edilebilir.";
const SERVER_LIB_MESSAGE =
  'SINIR İHLALİ (SPEC §3): sunucu kütüphaneleri istemci uygulamasına giremez.';

const elements = [
  ...CLIENT_APPS.map((dir) => ({ type: 'app-client', pattern: `${dir}/**/*`, partialMatch: false })),
  ...SERVER_APPS.map((dir) => ({ type: 'app-server', pattern: `${dir}/**/*`, partialMatch: false })),
  ...CLIENT_SAFE_PACKAGES.map((name) => ({
    type: 'pkg-client-safe',
    pattern: `packages/${name}/**/*`,
    partialMatch: false,
  })),
  ...SERVER_ONLY_PACKAGES.map((name) => ({
    type: 'pkg-server-only',
    pattern: `packages/${name}/**/*`,
    partialMatch: false,
  })),
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Plain CommonJS tool configuration files (metro.config.js, babel.config.js).
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Model ids, provider names and secrets belong in packages/config, never inline.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^(claude|gpt|gemini|eleven)-[a-z0-9._-]+$/i]",
          message:
            'Model adı koda gömülemez (SPEC §3, sınır kuralı 6). packages/config üzerinden okuyun.',
        },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: PROVIDER_SDKS, message: PROVIDER_SDK_MESSAGE }] },
      ],
    },
  },

  // Client apps additionally may not import server infrastructure.
  {
    files: CLIENT_APPS.map((dir) => `${dir}/**/*.{ts,tsx}`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: PROVIDER_SDKS, message: PROVIDER_SDK_MESSAGE },
            { group: SERVER_LIBS, message: SERVER_LIB_MESSAGE },
          ],
        },
      ],
    },
  },

  // packages/providers is the sanctioned home of every vendor SDK.
  {
    files: ['packages/providers/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // ── Architectural boundaries ────────────────────────────────────────────────
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['apps/**/*', 'packages/**/*'],
      'boundaries/elements': elements,
      // Workspace imports (@kendihikayem/*) are resolved through the tsconfig paths so the
      // resolved path stays inside packages/… instead of a hoisted node_modules symlink.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['tsconfig.base.json', 'apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
        },
        node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          // Deny by default: a package added later is walled off until someone states,
          // in this file, who is allowed to depend on it.
          default: 'disallow',
          message:
            'SINIR İHLALİ (SPEC §3): bu katman o katmanı import edemez. İstemci uygulamaları ' +
            '(apps/mobile, apps/web, apps/ops) yalnızca packages/{contract,mock,ui,shared} kullanabilir.',
          policies: [
            // Third-party and Node core modules are fine anywhere unless disallowed below.
            {
              allow: { to: { module: { origin: 'external' } } },
            },
            {
              allow: { to: { module: { origin: 'core' } } },
            },

            // Rule 1 — client apps see only the client-safe packages.
            {
              from: { element: { type: 'app-client' } },
              allow: {
                to: { element: { types: { anyOf: ['app-client', 'pkg-client-safe'] } } },
              },
            },
            // Server processes may reach anywhere inside the repo.
            {
              from: { element: { type: 'app-server' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['app-server', 'pkg-client-safe', 'pkg-server-only'] },
                  },
                },
              },
            },
            // Server-only packages may compose with each other and with client-safe ones.
            {
              from: { element: { type: 'pkg-server-only' } },
              allow: {
                to: { element: { types: { anyOf: ['pkg-client-safe', 'pkg-server-only'] } } },
              },
            },
            // Client-safe packages must stay client-safe: they may only use each other.
            {
              from: { element: { type: 'pkg-client-safe' } },
              allow: { to: { element: { type: 'pkg-client-safe' } } },
            },

            // Rule 6 — provider SDKs only inside packages/providers.
            {
              from: {
                element: { types: { anyOf: ['app-client', 'app-server', 'pkg-client-safe'] } },
              },
              disallow: {
                to: {
                  module: {
                    origin: 'external',
                    source: [
                      '@anthropic-ai/**',
                      'openai',
                      '@google/genai',
                      '@google/generative-ai',
                      'elevenlabs',
                      '@cartesia/**',
                      'iyzipay',
                    ],
                  },
                },
              },
              message:
                "SINIR İHLALİ (SPEC §3, kural 6): sağlayıcı SDK'sı yalnızca packages/providers altında import edilebilir.",
            },
            // A client bundle must never pull in server infrastructure libraries.
            {
              from: { element: { type: 'app-client' } },
              disallow: {
                to: {
                  module: {
                    origin: 'external',
                    source: ['fastify', 'bullmq', 'drizzle-orm', 'pg', 'postgres', 'ioredis'],
                  },
                },
              },
              message:
                'SINIR İHLALİ (SPEC §3): sunucu kütüphaneleri istemci uygulamasına giremez.',
            },
          ],
        },
      ],
    },
  },

  // packages/config is the ONE place a model id may appear as a literal — that is the
  // whole point of the package (SPEC §3 rule 6 says "hardcoded model name = lint error",
  // and "not hardcoded" means "declared here, overridable by env").
  {
    files: ['packages/config/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // React Hooks rules for the client apps and the shared UI package.
  //
  // exhaustive-deps is the single highest-value rule here: a stale closure in the
  // player (word highlighting runs on every animation frame) or in the recorder
  // (the dB meter samples on a timer) produces a bug that only shows up on a real
  // device, which is exactly the class of defect we cannot catch in CI.
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic rules are hard errors: breaking either one produces a bug
      // that reproduces only on a device, under a specific interleaving.
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // v7 also ships the React Compiler rules. They are worth listening to, but
      // they are advisory until the screens they flag are finished — demoted to
      // warnings so they stay visible without blocking a half-written feature.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
      'react-hooks/component-hook-factories': 'warn',
    },
  },

  // Tests may reach a bit further than production code.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
