#
# KendiHikayem — tek imaj, üç çalışma kipi.
#
# Aynı imaj PROCESS_MODE=api | worker | all ile çalışır (packages/config). Ücretsiz
# katmanda `all` kullanılır: Render'ın ücretsiz planı yalnızca web servisi verir, ayrı
# arka plan worker'ı ücretlidir. Üretimde ikisi ayrı servis olarak ölçeklenebilir —
# değişen tek şey bir ortam değişkenidir, imaj değil.
#
# ── Neden derleyip paketliyoruz (tsx ile kaynak çalıştırmak yerine) ──────────────
# Depodaki TypeScript uzantısız göreli içe aktarım kullanıyor (`./server`). Düz Node ESM
# bunu çözemez, dolayısıyla "tsc ile derle, çıktıyı çalıştır" bir seçenek değil. esbuild
# bu içe aktarımları DERLEME anında çözüyor. Yan faydası ücretsiz katmanda tam olarak en
# çok acıtan iki şeyi ortadan kaldırması: imajdaki ~600 MB node_modules ve her soğuk
# başlatmada yeniden yapılan transpile.
#
# Sonuç: çalışma imajı ~200 MB (çoğu sharp'ın libvips'i) ve saniyeler değil, yüz
# milisaniyeler içinde ayağa kalkan bir süreç.

# ── 1) Derleme ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

# Bağımlılık katmanı önce: kaynak değiştiğinde pnpm install yeniden çalışmasın.
# Workspace'teki HER package.json gerekiyor, yoksa pnpm bağımlılık grafiğini kuramaz.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json                apps/api/
COPY apps/worker/package.json             apps/worker/
COPY apps/mobile/package.json             apps/mobile/
COPY apps/web/package.json                apps/web/
COPY apps/ops/package.json                apps/ops/
COPY packages/config/package.json         packages/config/
COPY packages/contract/package.json       packages/contract/
COPY packages/db/package.json             packages/db/
COPY packages/media/package.json          packages/media/
COPY packages/mock/package.json           packages/mock/
COPY packages/pdf/package.json            packages/pdf/
COPY packages/providers/package.json      packages/providers/
COPY packages/safety/package.json         packages/safety/
COPY packages/shared/package.json         packages/shared/
COPY packages/ui/package.json             packages/ui/

# ⚠️ --ignore-scripts YOK. sharp'ın kurulum betiği libvips ikilisini indirir; atlanırsa
# paket kurulur ama `require('sharp')` çalışma anında patlar.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Sunucu tek dosyaya paketlenir; dist/package.json yalnızca dışarıda bırakılanları listeler.
RUN node infra/bundle/server.mjs

# Migration ve seed üretimde de gerekiyor (docs/DEPLOY.md 2. adım). Bunlar tsx ile
# çalışan CLI'lar, sunucu paketinin parçası değil — ayrıca paketleniyorlar.
RUN node infra/bundle/cli.mjs

# ── 2) Çalışma zamanı bağımlılıkları ──────────────────────────────────────────────
# Ayrı aşama: sharp'ın libvips ikilisi çalıştığı mimariye göre kuruluyor, builder'dan
# kopyalanmıyor. Buildx ile arm64 imaj üretilirse doğru ikili gelsin diye.
FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY --from=builder /repo/dist/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# ── 3) Çalışma imajı ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# ⭐ REDIS_MODE=embedded için: BullMQ'nun Redis'i aynı konteynerde çalışıyor.
#    Gerekçe docs/DEPLOY.md §Redis kararı ve packages/config `redisModeSchema`.
#    REDIS_MODE=external ile bu süreç hiç başlatılmaz; ~12 MB'lık paket boşuna durur,
#    iki ayrı imaj bakmaya değmez.
# ⚠️ dumb-init: Node PID 1 olarak sinyalleri iletmez ve zombi süreç toplamaz. Render'ın
#    SIGTERM'i yakalanmazsa iş ortasında sert kill gelir.
RUN apt-get update \
 && apt-get install -y --no-install-recommends redis-server dumb-init ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps    /app/node_modules      ./node_modules
COPY --from=builder /repo/dist/server.mjs  ./server.mjs
COPY --from=builder /repo/dist/migrate.mjs ./migrate.mjs
COPY --from=builder /repo/dist/seed.mjs    ./seed.mjs
# Migration SQL'leri veri, kod değil — paketlenemezler, dosya olarak gelmeleri gerekir.
COPY --from=builder /repo/packages/db/migrations ./migrations
COPY infra/docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Root olmayan kullanıcı. node imajında `node` (uid 1000) hazır geliyor.
# MEDIA_STORAGE_DRIVER=filesystem kullanılırsa yazılabilir bir kök gerekiyor.
RUN mkdir -p /app/.data/media /app/.redis && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    PROCESS_MODE=all \
    REDIS_MODE=embedded \
    REDIS_URL=redis://127.0.0.1:6379

EXPOSE 10000

# ⚠️ Bu HEALTHCHECK Render tarafından KULLANILMAZ (Render kendi HTTP kontrolünü yapar,
# render.yaml → healthCheckPath). Docker Compose / Fly / elle çalıştırma için burada.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["./entrypoint.sh"]
