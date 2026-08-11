/**
 * middleware/auth.ts — the seam A1 fills in.
 *
 * A2 owns the HOOK (when authentication runs, what it puts on the request, how a failure is
 * shaped). A1 owns the VERIFIER (how a bearer token becomes a user). They are separate so
 * neither of us blocks the other, and so the job/entitlement routes can be tested against a
 * stub verifier without a session table.
 *
 * The default verifier reads `sessions` if the row exists and otherwise refuses. It does
 * NOT mint tokens and does NOT trust the client — a permissive default here would be a
 * security hole that looks like progress.
 */

import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '@kendihikayem/db';
import type { AuthRequirement } from '@kendihikayem/contract';

import type { AuthenticatedUser } from '../context';
import { HttpError, unauthenticated } from '../errors';

/** A1: replace the implementation, keep the signature. */
export interface TokenVerifier {
  verify(token: string): Promise<AuthenticatedUser | null>;
}

/**
 * Looks the opaque token up in `sessions`. Sessions are hashed at rest, so this compares a
 * digest, never the raw token.
 *
 * TODO(A1): JWT verification, refresh rotation, `sessions.revoked_at`, device binding.
 */
export class SessionTokenVerifier implements TokenVerifier {
  constructor(private readonly db: Database) {}

  async verify(token: string): Promise<AuthenticatedUser | null> {
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(token).digest('hex');

    const rows = await this.db.execute<{
      id: string;
      user_id: string;
      is_guest: boolean;
    }>(sql`
      select s.id, s.user_id, u.is_guest
        from sessions s
        join users u on u.id = s.user_id
       where s.refresh_token_hash = ${digest}
         and s.revoked_at is null
         and s.expires_at > now()
       limit 1
    `);

    const row = rows[0];
    if (!row) return null;
    return { userId: row.user_id, isGuest: row.is_guest, sessionId: row.id };
  }
}

/** Test/dev double: maps a bearer token straight onto a user id. */
export class StaticTokenVerifier implements TokenVerifier {
  constructor(private readonly users: Map<string, AuthenticatedUser>) {}

  async verify(token: string): Promise<AuthenticatedUser | null> {
    return this.users.get(token) ?? null;
  }
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/**
 * Authenticates according to the route's declared requirement. The requirement comes from
 * the contract manifest (`endpoints.ts`), so a new endpoint cannot accidentally ship
 * unauthenticated — the manifest entry is mandatory for it to compile.
 */
export async function authenticate(
  request: FastifyRequest,
  verifier: TokenVerifier,
  requirement: AuthRequirement,
): Promise<void> {
  if (requirement === 'none') return;

  const token = bearerToken(request);
  if (!token) {
    if (requirement === 'optional') return;
    throw unauthenticated('missing bearer token');
  }

  const user = await verifier.verify(token);
  if (!user) {
    if (requirement === 'optional') return;
    throw unauthenticated('token not recognised or expired');
  }
  request.user = user;
}

/** Guard for handlers: narrows `request.user` and refuses when it is absent. */
export function requireUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) throw unauthenticated('route requires an authenticated user');
  return request.user;
}

/**
 * Client-version gate. SPEC §5 conventions: `X-Client-Version` is mandatory and the server
 * may cut an old client off with 426 rather than serve it a response it cannot parse.
 */
export function registerClientVersionGate(
  app: FastifyInstance,
  options: { minimumVersion?: string } = {},
): void {
  app.addHook('onRequest', async (request) => {
    if (request.url === '/health' || request.url.startsWith('/internal/')) return;

    const raw = request.headers['x-client-version'];
    const version = Array.isArray(raw) ? raw[0] : raw;
    if (typeof version !== 'string' || version.length === 0) {
      throw new HttpError('VALIDATION_FAILED', {
        detail: 'x-client-version header is required',
        field: 'x-client-version',
      });
    }
    if (options.minimumVersion && compareSemver(version, options.minimumVersion) < 0) {
      throw new HttpError('CLIENT_UPDATE_REQUIRED', {
        detail: `client ${version} is below the minimum ${options.minimumVersion}`,
      });
    }
  });
}

/** Tolerant compare: a malformed version sorts as 0.0.0 and is refused by the gate. */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
    return parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : [0, 0, 0];
  };
  const [aMajor = 0, aMinor = 0, aPatch = 0] = parse(a);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = parse(b);
  return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch;
}
