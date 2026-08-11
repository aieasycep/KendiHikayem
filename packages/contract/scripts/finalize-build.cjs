/**
 * Paket "type": "module" oldugu icin dist/ icindeki .js dosyalari varsayilan
 * olarak ESM sayilir. tsc bu paketi CommonJS'e derliyor (bkz. tsconfig.build.json),
 * bu yuzden dist/ altina kucuk bir package.json birakip modul turunu geri ceviriyoruz.
 * Boylece `node dist/scripts/openapi-cli.js` ek bir calistiriciya ihtiyac duymadan calisir.
 */
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const distDir = join(__dirname, '..', 'dist');
mkdirSync(distDir, { recursive: true });
writeFileSync(
  join(distDir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs', private: true }, null, 2)}\n`,
  'utf8',
);
