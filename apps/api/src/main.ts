/**
 * main.ts — the API process entry point.
 *
 * Boots config → database → queues (optional) → server, then listens. Redis is OPTIONAL
 * here on purpose: reading job state, entitlements and estimates needs only Postgres, so a
 * Redis outage degrades the product to "cannot start new work" rather than "cannot use the
 * app at all".
 */

import { loadEnv } from '@kendihikayem/config';
import { createDbFromEnv } from '@kendihikayem/db';
import { QueueRegistry, connectionFromUrl } from '@kendihikayem/worker';

import { buildServer } from './server';

async function main(): Promise<void> {
  const env = loadEnv();
  const handle = createDbFromEnv(env);

  let queues: QueueRegistry | undefined;
  try {
    queues = new QueueRegistry({
      connection: connectionFromUrl(env.REDIS_URL),
      prefix: env.QUEUE_PREFIX,
    });
  } catch (error) {
    console.warn('[api] queues unavailable; read-only endpoints still work', error);
  }

  const { app } = buildServer({
    db: handle.db,
    env,
    ...(queues ? { queues } : {}),
    logger: true,
  });

  const shutdown = async (signal: string) => {
    console.info(`[api] ${signal} received, closing`);
    await app.close();
    await queues?.close();
    await handle.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: env.HOST, port: env.PORT });
  console.info(`[api] listening on http://${env.HOST}:${env.PORT}`);
}

main().catch((error) => {
  console.error('[api] fatal', error);
  process.exit(1);
});
