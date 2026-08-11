/**
 * node.ts — Node ve vitest için mock sunucusu.
 *
 * ```ts
 * import { setupMockServer } from '@kendihikayem/mock/node';
 * const server = setupMockServer();
 * beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
 * afterEach(() => { server.resetHandlers(); resetStore(); });
 * afterAll(() => server.close());
 * ```
 */

import { setupServer } from 'msw/node';

import { handlers } from './handlers';

export function setupMockServer(): ReturnType<typeof setupServer> {
  return setupServer(...handlers);
}
