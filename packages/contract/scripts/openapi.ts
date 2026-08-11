/**
 * openapi.ts — Zod sözleşmesinden OpenAPI 3.0 belgesi üretir ve YAML'a çevirir.
 *
 * Snapshot dosyası (`openapi.snapshot.yaml`) commit'lenir ve `contract:check`
 * ile karşılaştırılır: şema değişip snapshot güncellenmediyse CI KIRILIR.
 * Böylece "sözleşme sessizce değişti" durumu imkânsız hale gelir.
 *
 * YAML yazıcısı elle yazılmıştır — bilerek. `yaml` paketi bu depoda hiçbir
 * çalışma alanı paketinin doğrudan bağımlılığı değil; kontratın doğrulama
 * zincirinin transitive bir pakete bağlı olması kabul edilemez.
 */

import { generateOpenApi } from '@ts-rest/open-api';
import type { z } from 'zod';

import { audioRenditionSummarySchema, playerManifestSchema, playerPageSchema, playerTokenSchema, publicPageAudioSchema } from '../src/audio';
import { entitlementsSchema, planSchema } from '../src/billing';
import { bookFormatSchema, storyThemeSchema, systemVoiceSchema } from '../src/catalog';
import { childSchema } from '../src/children';
import { apiContract } from '../src/endpoints';
import { jobSchema } from '../src/jobs';
import { opsContract } from '../src/ops';
import {
  apiErrorSchema,
  costPreviewSchema,
  jobRefSchema,
  signedMediaSchema,
} from '../src/primitives';
import { bookBuildSchema, orderSchema, quoteResSchema, storyExportSchema } from '../src/print';
import {
  consentStateSchema,
  consentStatusSchema,
  legalDocumentSchema,
  privacyRequestSchema,
} from '../src/privacy';
import {
  storyCharacterSchema,
  storyOutlineSchema,
  storyPageSchema,
  storySchema,
  storySummarySchema,
} from '../src/story';
import { submitTakeResSchema, takeQualitySchema, voiceProfileSchema, voiceScriptBundleSchema } from '../src/voice';
import { meSchema } from '../src/auth';
import { CONTRACT_VERSION } from '../src/index';

const SERVERS = [
  { url: 'https://api.kendihikayem.com', description: 'uretim' },
  { url: 'http://localhost:3001', description: 'yerel gelistirme' },
];

/* ────────────────────────────────────────────────────────────────
 * Bileşen çıkarımı
 *
 * ts-rest her yanıtı satır içi (inline) şema olarak üretir. `ApiError` 82 ucun
 * 10 hata durumunda tekrarlandığı için ham belge ~2,8 MB oluyordu; okunamaz ve
 * her sözleşme değişikliğinde devasa diff üretiyordu. Aşağıdaki geçiş, TEKRAR
 * EDEN ve ADI OLAN şemaları `components/schemas` altına taşıyıp `$ref` ile
 * bağlar. Adlar Zod şemalarının kendi alan kümesinden türetilir; elle liste
 * tutulmadığı için şema değişince eşleşme kendiliğinden güncellenir.
 * ──────────────────────────────────────────────────────────────── */

type JsonNode = unknown;

const NAMED_SCHEMAS: [string, z.AnyZodObject][] = [
  ['ApiError', apiErrorSchema],
  ['SignedMedia', signedMediaSchema],
  ['JobRef', jobRefSchema],
  ['Job', jobSchema],
  ['CostPreview', costPreviewSchema],
  ['Me', meSchema],
  ['Entitlements', entitlementsSchema],
  ['Plan', planSchema],
  ['ConsentState', consentStateSchema],
  ['ConsentStatus', consentStatusSchema],
  ['LegalDocument', legalDocumentSchema],
  ['PrivacyRequest', privacyRequestSchema],
  ['Child', childSchema],
  ['StoryTheme', storyThemeSchema],
  ['SystemVoice', systemVoiceSchema],
  ['BookFormat', bookFormatSchema],
  ['Story', storySchema],
  ['StorySummary', storySummarySchema],
  ['StoryPage', storyPageSchema],
  ['StoryCharacter', storyCharacterSchema],
  ['StoryOutline', storyOutlineSchema],
  ['AudioRenditionSummary', audioRenditionSummarySchema],
  ['PlayerManifest', playerManifestSchema],
  ['PlayerPage', playerPageSchema],
  ['PlayerToken', playerTokenSchema],
  ['PublicPageAudio', publicPageAudioSchema],
  ['VoiceProfile', voiceProfileSchema],
  ['VoiceScriptBundle', voiceScriptBundleSchema],
  ['SubmitTakeRes', submitTakeResSchema],
  ['TakeQuality', takeQualitySchema],
  ['BookBuild', bookBuildSchema],
  ['Order', orderSchema],
  ['QuoteRes', quoteResSchema],
  ['StoryExport', storyExportSchema],
];

/** Alan adları kümesi → şema adı. Zod'un kendi `shape`'inden türetilir. */
const FINGERPRINT_TO_NAME = new Map<string, string>(
  NAMED_SCHEMAS.map(([name, schema]) => [Object.keys(schema.shape).sort().join(','), name]),
);

function fingerprintOf(node: JsonNode): string | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const record = node as Record<string, unknown>;
  if (record.type !== 'object') return null;
  const properties = record.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
  return Object.keys(properties as Record<string, unknown>).sort().join(',');
}

function walk(node: JsonNode, visit: (n: JsonNode) => void): void {
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) walk(value, visit);
  }
}

function extractComponents(doc: JsonNode): JsonNode {
  const counts = new Map<string, number>();
  const canonicalToFingerprint = new Map<string, string>();

  walk(doc, (node) => {
    const fingerprint = fingerprintOf(node);
    if (fingerprint === null || !FINGERPRINT_TO_NAME.has(fingerprint)) return;
    const canonical = JSON.stringify(node);
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    canonicalToFingerprint.set(canonical, fingerprint);
  });

  const canonicalToName = new Map<string, string>();
  const usedNames = new Map<string, number>();
  for (const [canonical, count] of counts) {
    if (count < 2) continue;
    const fingerprint = canonicalToFingerprint.get(canonical);
    if (fingerprint === undefined) continue;
    const base = FINGERPRINT_TO_NAME.get(fingerprint);
    if (base === undefined) continue;
    const seen = usedNames.get(base) ?? 0;
    usedNames.set(base, seen + 1);
    canonicalToName.set(canonical, seen === 0 ? base : `${base}${seen + 1}`);
  }

  const replace = (node: JsonNode, allowRoot: boolean): JsonNode => {
    if (Array.isArray(node)) return node.map((item) => replace(item, true));
    if (!node || typeof node !== 'object') return node;
    if (allowRoot) {
      const fingerprint = fingerprintOf(node);
      if (fingerprint !== null && FINGERPRINT_TO_NAME.has(fingerprint)) {
        const name = canonicalToName.get(JSON.stringify(node));
        if (name !== undefined) return { $ref: `#/components/schemas/${name}` };
      }
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = replace(value, true);
    }
    return out;
  };

  const schemas: Record<string, JsonNode> = {};
  for (const [canonical, name] of canonicalToName) {
    schemas[name] = replace(JSON.parse(canonical) as JsonNode, false);
  }

  const sortedSchemas: Record<string, JsonNode> = {};
  for (const name of Object.keys(schemas).sort()) sortedSchemas[name] = schemas[name];

  const replaced = replace(doc, false) as Record<string, unknown>;
  const existingComponents = (replaced.components ?? {}) as Record<string, unknown>;
  return {
    ...replaced,
    components: { ...existingComponents, schemas: sortedSchemas },
  };
}

export function buildApiDocument(): unknown {
  return extractComponents(generateApiDocument());
}

function generateApiDocument(): unknown {
  return generateOpenApi(
    apiContract,
    {
      info: {
        title: 'KendiHikayem API',
        version: CONTRACT_VERSION,
        description:
          'Cocuga ozel AI masal uygulamasinin kullanici API sozlesmesi. ' +
          'Tum 4xx/5xx yanitlari ApiError seklindedir. Para/kaynak harcayan her ' +
          'yazma islemi Idempotency-Key basligi ister. Uzun isler 202 + JobRef doner.',
      },
      servers: SERVERS,
    },
    { setOperationId: 'concatenated-path' },
  );
}

export function buildOpsDocument(): unknown {
  return extractComponents(generateOpsDocument());
}

function generateOpsDocument(): unknown {
  return generateOpenApi(
    opsContract,
    {
      info: {
        title: 'KendiHikayem Ops API',
        version: CONTRACT_VERSION,
        description:
          'Ic operasyon paneli (O01-O05). Admin yetkisi ister; kullanici ' +
          'uygulamasi bu uclari GORMEZ.',
      },
      servers: SERVERS,
    },
    { setOperationId: 'concatenated-path' },
  );
}

/* ── YAML yazıcısı ───────────────────────────────────────────── */

const YAML_RESERVED = new Set([
  'true',
  'false',
  'null',
  'yes',
  'no',
  'on',
  'off',
  'y',
  'n',
  '~',
  '',
]);

const PLAIN_SCALAR = /^[A-Za-z_][A-Za-z0-9_.\-/]*$/;

function isScalar(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== 'object';
}

function scalarToYaml(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  const text = String(value);
  if (!PLAIN_SCALAR.test(text) || YAML_RESERVED.has(text.toLowerCase())) {
    return JSON.stringify(text);
  }
  return text;
}

function entriesOf(value: object): [string, unknown][] {
  return Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
}

function isEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === 'object') return entriesOf(value).length === 0;
  return false;
}

function emptyToken(value: unknown): string {
  return Array.isArray(value) ? '[]' : '{}';
}

function emitBlock(value: unknown, indent: number, lines: string[]): void {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    for (const item of value) {
      if (isScalar(item)) {
        lines.push(`${pad}- ${scalarToYaml(item)}`);
        continue;
      }
      if (isEmptyContainer(item)) {
        lines.push(`${pad}- ${emptyToken(item)}`);
        continue;
      }
      if (Array.isArray(item)) {
        lines.push(`${pad}-`);
        emitBlock(item, indent + 1, lines);
        continue;
      }
      entriesOf(item as object).forEach(([key, child], index) => {
        const prefix = index === 0 ? `${pad}- ` : `${pad}  `;
        if (isScalar(child) || isEmptyContainer(child)) {
          const rendered = isScalar(child) ? scalarToYaml(child) : emptyToken(child);
          lines.push(`${prefix}${scalarToYaml(key)}: ${rendered}`);
        } else {
          lines.push(`${prefix}${scalarToYaml(key)}:`);
          emitBlock(child, indent + 2, lines);
        }
      });
    }
    return;
  }

  for (const [key, child] of entriesOf(value as object)) {
    if (isScalar(child) || isEmptyContainer(child)) {
      const rendered = isScalar(child) ? scalarToYaml(child) : emptyToken(child);
      lines.push(`${pad}${scalarToYaml(key)}: ${rendered}`);
    } else {
      lines.push(`${pad}${scalarToYaml(key)}:`);
      emitBlock(child, indent + 1, lines);
    }
  }
}

/** Deterministik YAML. Aynı girdi → byte-eş çıktı. */
export function toYaml(value: unknown, banner: string[] = []): string {
  const lines = banner.map((line) => `# ${line}`);
  if (banner.length > 0) lines.push('');
  emitBlock(value, 0, lines);
  return `${lines.join('\n')}\n`;
}

export const SNAPSHOT_BANNER = [
  'URETILMIS DOSYA — ELLE DUZENLEMEYIN.',
  'Kaynak: packages/contract/src/**  ·  Uretici: pnpm --filter @kendihikayem/contract openapi:write',
  'Dogrulama: pnpm --filter @kendihikayem/contract contract:check (fark varsa cikis kodu 1)',
];
