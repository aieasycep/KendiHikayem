#!/bin/sh
# entrypoint.sh — konteynerin açılış sırası.
#
#   1. REDIS_MODE=embedded ise redis-server'ı başlat ve hazır olmasını bekle
#   2. RUN_MIGRATIONS_ON_BOOT=true ise migration'ları uygula
#   3. RUN_SEED_ON_BOOT=true ise katalog seed'ini çalıştır
#   4. Sunucuyu PID 1'in çocuğu olarak çalıştır (exec)
#
# `set -e`: hiçbir adım sessizce atlanmasın. Migration başarısızsa uygulama AÇILMAMALI —
# yarı göçmüş bir şemaya karşı çalışan bir sunucu, düşmüş bir sunucudan daha zor teşhis
# edilir.
set -e

# Kendi bulunduğu dizin. İmajda bu /app, ama sabit yazmak betiği yalnızca konteyner içinde
# çalıştırılabilir kılardı — aynı düzeni konteyner dışında kurup denemek, temel imaj
# çekilemeyen bir ortamda elde kalan tek doğrulama yolu.
APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

log() { printf '[entrypoint] %s\n' "$1"; }

# ── 1. Gömülü Redis ───────────────────────────────────────────────────────────────
#
# ⭐ NEDEN AYNI KONTEYNERDE. Ücretsiz katmanda yönetilen Redis yok, Upstash'in ücretsiz
# kotası ise BullMQ için yetmiyor (gerekçe: docs/DEPLOY.md §Redis kararı). Buradaki
# Redis her uyanışta BOŞ başlar ve bu kabul edilebilir: durum kaynağı PostgreSQL,
# kuyruklar yalnızca işaretçi taşıyor (apps/worker/src/queues.ts) ve açılışta
# resumeRecoverableJobs() Postgres'ten yeniden kuyruklama yapıyor.
#
# ⚠️ maxmemory-policy noeviction ZORUNLU. BullMQ, Redis'in anahtarları kendiliğinden
# düşürmesini kaldıramaz — allkeys-lru bir kuyruğu sessizce boşaltır ve iş kaybolur.
if [ "${REDIS_MODE:-embedded}" = "embedded" ]; then
  log "gömülü Redis başlatılıyor (REDIS_MODE=embedded)"
  redis-server \
    --port "${EMBEDDED_REDIS_PORT:-6379}" \
    --bind 127.0.0.1 \
    --daemonize yes \
    --dir "${APP_DIR}/.redis" \
    --save '' \
    --appendonly no \
    --maxmemory "${EMBEDDED_REDIS_MAXMEMORY:-64mb}" \
    --maxmemory-policy noeviction \
    --loglevel warning

  i=0
  until redis-cli -p "${EMBEDDED_REDIS_PORT:-6379}" ping >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 30 ]; then
      log "HATA: gömülü Redis 15 saniyede açılmadı"
      exit 1
    fi
    sleep 0.5
  done
  log "gömülü Redis hazır"
else
  log "harici Redis kullanılıyor (REDIS_MODE=${REDIS_MODE})"
fi

# ── 2. Migration ──────────────────────────────────────────────────────────────────
#
# Varsayılan KAPALI. Açılışta migration çalıştırmak tek örnekli ücretsiz katmanda
# rahattır, ama iki örnek aynı anda uyanırsa iki migration yarışır. Render'da ayrı bir
# "Job" çalıştırmak mümkün olmadığı için bu bayrak var; ölçeklenince kapatılmalı.
if [ "${RUN_MIGRATIONS_ON_BOOT:-false}" = "true" ]; then
  log "migration'lar uygulanıyor"
  MIGRATIONS_DIR="${MIGRATIONS_DIR:-${APP_DIR}/migrations}" node "${APP_DIR}/migrate.mjs"
fi

# ── 3. Seed ───────────────────────────────────────────────────────────────────────
#
# Katalog (temalar, stiller, kitap formatları, planlar, hukuki metinler) üretimde de
# gerekli — onsuz üretici için prompt paketi ve maliyet tavanı yok. Her satır deterministik
# UUID ile anahtarlı, yani ikinci çalıştırma no-op. NODE_ENV=production geliştirme
# verisini atlar (packages/db/src/seed/index.ts).
if [ "${RUN_SEED_ON_BOOT:-false}" = "true" ]; then
  log "katalog seed'i çalıştırılıyor"
  node "${APP_DIR}/seed.mjs"
fi

# ── 4. Sunucu ─────────────────────────────────────────────────────────────────────
#
# `exec`: Node bu kabuğun YERİNE geçer, böylece Render'ın SIGTERM'i doğrudan ona ulaşır
# ve apps/api/src/main.ts'teki kapanış eli (kuyrukları boşalt, havuzu kapat) çalışır.
log "sunucu başlatılıyor (PROCESS_MODE=${PROCESS_MODE:-all}, PORT=${PORT:-10000})"
exec node "${APP_DIR}/server.mjs"
