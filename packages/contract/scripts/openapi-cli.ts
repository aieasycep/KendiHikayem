/**
 * openapi-cli.ts — snapshot yaz / doğrula.
 *
 *   node dist/scripts/openapi-cli.js write   → snapshot dosyalarını üretir
 *   node dist/scripts/openapi-cli.js check   → üretip commit'li dosyayla karşılaştırır,
 *                                              fark varsa çıkış kodu 1
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildApiDocument, buildOpsDocument, SNAPSHOT_BANNER, toYaml } from './openapi';

/** dist/scripts/… içinden çalışır; paket kökü iki üst dizindir. */
const PACKAGE_ROOT = resolve(__dirname, '..', '..');

interface Snapshot {
  file: string;
  build: () => unknown;
}

const SNAPSHOTS: Snapshot[] = [
  { file: 'openapi.snapshot.yaml', build: buildApiDocument },
  { file: 'openapi.ops.snapshot.yaml', build: buildOpsDocument },
];

function render(snapshot: Snapshot): string {
  return toYaml(snapshot.build(), SNAPSHOT_BANNER);
}

function firstDifference(expected: string, actual: string): string {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const max = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < max; i += 1) {
    if (expectedLines[i] !== actualLines[i]) {
      return [
        `  ilk fark satir ${i + 1}:`,
        `    dosyada : ${expectedLines[i] ?? '<satir yok>'}`,
        `    uretilen: ${actualLines[i] ?? '<satir yok>'}`,
      ].join('\n');
    }
  }
  return '  (satir farki yok, dosya sonu farkli)';
}

function write(): void {
  for (const snapshot of SNAPSHOTS) {
    const target = resolve(PACKAGE_ROOT, snapshot.file);
    writeFileSync(target, render(snapshot), 'utf8');
    process.stdout.write(`yazildi: ${snapshot.file}\n`);
  }
}

function check(): void {
  let failed = false;

  for (const snapshot of SNAPSHOTS) {
    const target = resolve(PACKAGE_ROOT, snapshot.file);
    const generated = render(snapshot);
    let committed: string;
    try {
      committed = readFileSync(target, 'utf8');
    } catch {
      process.stderr.write(`HATA: ${snapshot.file} bulunamadi.\n`);
      failed = true;
      continue;
    }
    if (committed === generated) {
      process.stdout.write(`ok: ${snapshot.file} guncel\n`);
      continue;
    }
    failed = true;
    process.stderr.write(
      `HATA: ${snapshot.file} sozlesmeyle uyusmuyor.\n${firstDifference(committed, generated)}\n`,
    );
  }

  if (failed) {
    process.stderr.write(
      '\nSozlesme degisti ama OpenAPI snapshot guncellenmedi.\n' +
        'Cozum: pnpm --filter @kendihikayem/contract openapi:write && git add -A\n',
    );
    process.exit(1);
  }

  process.stdout.write('contract:check gecti — snapshot sozlesmeyle bire bir.\n');
}

const command = process.argv[2] ?? 'check';
if (command === 'write') {
  write();
} else if (command === 'check') {
  check();
} else {
  process.stderr.write(`Bilinmeyen komut: ${command}. Kullanim: openapi-cli [write|check]\n`);
  process.exit(2);
}
