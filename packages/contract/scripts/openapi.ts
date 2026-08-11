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

import { apiContract } from '../src/endpoints';
import { opsContract } from '../src/ops';
import { CONTRACT_VERSION } from '../src/index';

const SERVERS = [
  { url: 'https://api.kendihikayem.com', description: 'uretim' },
  { url: 'http://localhost:3001', description: 'yerel gelistirme' },
];

export function buildApiDocument(): unknown {
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
