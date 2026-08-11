import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
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

const elements = [
  ...CLIENT_APPS.map((dir) => ({ type: 'app-client', pattern: `${dir}/**/*`, mode: 'full' })),
  ...SERVER_APPS.map((dir) => ({ type: 'app-server', pattern: `${dir}/**/*`, mode: 'full' })),
  ...CLIENT_SAFE_PACKAGES.map((name) => ({
    type: 'pkg-client-safe',
    pattern: `packages/${name}/**/*`,
    mode: 'full',
  })),
  ...SERVER_ONLY_PACKAGES.map((name) => ({
    type: 'pkg-server-only',
    pattern: `packages/${name}/**/*`,
    mode: 'full',
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
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message:
            'SINIR İHLALİ: "${file.type}" katmanı "${dependency.type}" katmanını import edemez. ' +
            'İstemci uygulamaları yalnızca packages/{contract,mock,ui,shared} kullanabilir (SPEC §3).',
          rules: [
            {
              from: ['app-client'],
              allow: ['app-client', 'pkg-client-safe'],
            },
            {
              from: ['app-server'],
              allow: ['app-server', 'pkg-client-safe', 'pkg-server-only'],
            },
            {
              from: ['pkg-server-only'],
              allow: ['pkg-client-safe', 'pkg-server-only'],
            },
            {
              from: ['pkg-client-safe'],
              allow: ['pkg-client-safe'],
            },
          ],
        },
      ],
      // Provider SDKs may only be imported inside packages/providers (SPEC §3 rule 6).
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          message:
            'SINIR İHLALİ: sağlayıcı SDK\'sı yalnızca packages/providers altında import edilebilir (SPEC §3).',
          rules: [
            {
              from: ['app-client', 'app-server', 'pkg-client-safe'],
              disallow: [
                '@anthropic-ai/*',
                'openai',
                '@google/genai',
                '@google/generative-ai',
                'elevenlabs',
                '@cartesia/*',
                'iyzipay',
              ],
            },
            {
              from: ['app-client'],
              disallow: ['fastify', 'bullmq', 'drizzle-orm', 'pg', 'postgres', 'ioredis'],
            },
          ],
        },
      ],
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
