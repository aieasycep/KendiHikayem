/**
 * media/storage/s3-server.test.ts — the S3 driver against a real HTTP server.
 *
 * `storage.test.ts` proves the SigV4 arithmetic against AWS's published test vector. That
 * is necessary and not sufficient: a signer can be perfectly correct and the driver still
 * unusable, because between the signature and the wire sit `fetch`'s own opinions —
 * headers it rewrites, headers it refuses to send, a body it re-encodes. None of that is
 * visible to a test that only inspects what the driver *intended* to send.
 *
 * So this file stands up a minimal S3-compatible server that RE-DERIVES the signature from
 * the request it actually received and rejects a mismatch with 403, exactly as S3, MinIO
 * and Supabase Storage do. If undici drops a signed header, or normalises a value, or the
 * canonical path disagrees with the request line by one character, these tests fail.
 *
 * ⚠️ WHAT THIS DOES NOT PROVE. It is not Supabase. It exercises the same protocol against
 * the same arithmetic, including Supabase's path-prefixed endpoint shape
 * (`/storage/v1/s3`), but no request in this repository has ever reached a real Supabase
 * bucket — there is no account and no network in this environment. Treat a first deploy as
 * the actual test.
 */

import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { S3ObjectStore, buildCanonicalRequest, deriveSigningKey, sign } from './s3';
import { ObjectNotFoundError } from './types';

const ACCESS_KEY_ID = 'kh-test-access-key';
const SECRET_ACCESS_KEY = 'kh-test-secret-key-0123456789';
const REGION = 'eu-central-1';

interface StoredBlob {
  body: Buffer;
  contentType: string;
  headers: Record<string, string>;
}

interface MockS3 {
  server: Server;
  origin: string;
  objects: Map<string, StoredBlob>;
  /** Every request the server saw, for assertions about what actually went on the wire. */
  requests: Array<{ method: string; url: string; headers: Record<string, string> }>;
}

/* ── the server ────────────────────────────────────────────────────────────── */

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/**
 * Re-derives the signature from the received request, the way a real S3 endpoint does.
 *
 * The point of doing it here rather than trusting the driver's own canonical request is
 * that the input is the request AS RECEIVED — so a header the client library silently
 * changed produces a different signature and a 403, which is the production symptom.
 */
function verifyHeaderSignature(
  request: IncomingMessage,
  body: Buffer,
): { ok: true } | { ok: false; reason: string } {
  const authorization = request.headers['authorization'];
  if (typeof authorization !== 'string') return { ok: false, reason: 'no authorization header' };

  const match =
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\S+?), SignedHeaders=(\S+?), Signature=([0-9a-f]{64})$/u.exec(
      authorization,
    );
  if (!match) return { ok: false, reason: `unparseable authorization: ${authorization}` };

  const [, keyId, scope, signedHeaders, signature] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (keyId !== ACCESS_KEY_ID) return { ok: false, reason: 'unknown access key' };

  const names = signedHeaders.split(';');
  const headers: Record<string, string> = {};
  for (const name of names) {
    const value = request.headers[name];
    if (value === undefined) {
      // The interesting failure: the client signed a header the transport never sent.
      return { ok: false, reason: `signed header missing from request: ${name}` };
    }
    headers[name] = Array.isArray(value) ? value.join(',') : value;
  }

  const payloadHash = headers['x-amz-content-sha256'] ?? '';
  const actualHash = createHash('sha256').update(body).digest('hex');
  if (payloadHash !== 'UNSIGNED-PAYLOAD' && payloadHash !== actualHash) {
    return { ok: false, reason: 'x-amz-content-sha256 does not match the body' };
  }

  const url = new URL(request.url ?? '/', 'http://placeholder');
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) query[key] = value;

  const canonical = buildCanonicalRequest({
    method: request.method ?? 'GET',
    path: url.pathname,
    query,
    headers,
    signedHeaders: names,
    payloadHash,
  });

  const amzDate = headers['x-amz-date'] ?? '';
  const dateStamp = scope.split('/')[0] ?? '';
  const expected = sign(
    deriveSigningKey(SECRET_ACCESS_KEY, dateStamp, REGION),
    ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join(
      '\n',
    ),
  );

  if (expected !== signature) {
    return { ok: false, reason: `SignatureDoesNotMatch\ncanonical:\n${canonical}` };
  }
  return { ok: true };
}

/** Query-string SigV4, the presigned-GET flavour. `host` is the only signed header. */
function verifyQuerySignature(request: IncomingMessage): boolean {
  const url = new URL(request.url ?? '/', 'http://placeholder');
  const signature = url.searchParams.get('X-Amz-Signature');
  const credential = url.searchParams.get('X-Amz-Credential');
  const amzDate = url.searchParams.get('X-Amz-Date');
  if (!signature || !credential || !amzDate) return false;

  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key !== 'X-Amz-Signature') query[key] = value;
  }

  const scope = credential.slice(credential.indexOf('/') + 1);
  const canonical = buildCanonicalRequest({
    method: 'GET',
    path: url.pathname,
    query,
    headers: { host: String(request.headers['host'] ?? '') },
    signedHeaders: ['host'],
    payloadHash: 'UNSIGNED-PAYLOAD',
  });

  const expected = sign(
    deriveSigningKey(SECRET_ACCESS_KEY, scope.split('/')[0] ?? '', REGION),
    ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join(
      '\n',
    ),
  );
  return expected === signature;
}

async function startMockS3(pathPrefix = ''): Promise<MockS3> {
  const objects = new Map<string, StoredBlob>();
  const requests: MockS3['requests'] = [];

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const body = await readBody(request);
      const url = new URL(request.url ?? '/', 'http://placeholder');
      requests.push({
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v!]),
        ),
      });

      if (!url.pathname.startsWith(`${pathPrefix}/`)) {
        response.writeHead(404).end('wrong endpoint prefix');
        return;
      }
      // `<prefix>/<bucket>/<key…>` — path style, which is what both MinIO and Supabase use.
      const objectKey = url.pathname.slice(pathPrefix.length + 1);

      const presigned = url.searchParams.has('X-Amz-Signature');
      if (presigned) {
        if (!verifyQuerySignature(request)) {
          response.writeHead(403).end('SignatureDoesNotMatch (query)');
          return;
        }
      } else {
        const verdict = verifyHeaderSignature(request, body);
        if (!verdict.ok) {
          response.writeHead(403).end(verdict.reason);
          return;
        }
      }

      const existing = objects.get(objectKey);

      switch (request.method) {
        case 'PUT': {
          objects.set(objectKey, {
            body,
            contentType: String(request.headers['content-type'] ?? 'application/octet-stream'),
            headers: Object.fromEntries(
              Object.entries(request.headers)
                .filter(([k]) => k.startsWith('x-amz-meta-'))
                .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v!]),
            ),
          });
          response.writeHead(200, { etag: `"${createHash('md5').update(body).digest('hex')}"` });
          response.end();
          return;
        }
        case 'GET': {
          if (!existing) {
            response.writeHead(404).end('NoSuchKey');
            return;
          }
          response.writeHead(200, {
            'content-type': existing.contentType,
            'content-length': String(existing.body.byteLength),
            ...existing.headers,
          });
          response.end(existing.body);
          return;
        }
        case 'HEAD': {
          if (!existing) {
            response.writeHead(404).end();
            return;
          }
          response.writeHead(200, {
            'content-type': existing.contentType,
            'content-length': String(existing.body.byteLength),
            etag: `"${createHash('md5').update(existing.body).digest('hex')}"`,
            ...existing.headers,
          });
          response.end();
          return;
        }
        case 'DELETE': {
          objects.delete(objectKey);
          response.writeHead(204).end();
          return;
        }
        default:
          response.writeHead(405).end();
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}`, objects, requests };
}

/* ── tests ─────────────────────────────────────────────────────────────────── */

/**
 * MinIO / AWS shape: no path prefix. This is the configuration `infra/docker/compose.yml`
 * serves, so a green run here is the closest thing to a MinIO integration test that exists
 * without MinIO.
 */
describe('S3ObjectStore against a signature-verifying server (no endpoint prefix)', () => {
  let mock: MockS3;
  let store: S3ObjectStore;

  beforeAll(async () => {
    mock = await startMockS3('');
    store = new S3ObjectStore({
      bucket: 'kh-media',
      region: REGION,
      endpoint: mock.origin,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mock.server.close(() => resolve()));
  });

  it('PUTs an object whose signature the server accepts', async () => {
    const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const stored = await store.put({
      key: 'stories/s1/pages/03/reader.webp',
      body,
      contentType: 'image/webp',
      retentionClass: 'standard',
      sha256: 'deadbeef',
    });

    expect(stored.bucket).toBe('kh-media');
    expect(stored.sizeBytes).toBe(8);
    expect(mock.objects.get('kh-media/stories/s1/pages/03/reader.webp')?.body.byteLength).toBe(8);
  });

  it('round-trips the exact bytes back through GET', async () => {
    const body = new Uint8Array([9, 8, 7, 6, 5]);
    await store.put({ key: 'stories/s1/cover/reader.webp', body, contentType: 'image/webp' });
    const read = await store.get('stories/s1/cover/reader.webp');
    expect([...read]).toEqual([...body]);
  });

  it('reports metadata through HEAD, including the retention class', async () => {
    await store.put({
      key: 'voice/raw/take-1.wav',
      body: new Uint8Array(64),
      contentType: 'audio/wav',
      retentionClass: 'ephemeral_30d',
    });
    const head = await store.head('voice/raw/take-1.wav');
    expect(head?.sizeBytes).toBe(64);
    expect(head?.contentType).toBe('audio/wav');
    expect(head?.retentionClass).toBe('ephemeral_30d');
  });

  it('raises ObjectNotFoundError rather than returning empty bytes', async () => {
    await expect(store.get('stories/nope/missing.webp')).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
  });

  it('deletes, and deleting twice is still a success', async () => {
    await store.put({ key: 'tmp/x.bin', body: new Uint8Array([1]), contentType: 'application/octet-stream' });
    await store.delete('tmp/x.bin');
    await expect(store.delete('tmp/x.bin')).resolves.toBeUndefined();
    expect(mock.objects.has('kh-media/tmp/x.bin')).toBe(false);
  });

  it('issues a presigned GET the server accepts with no credentials attached', async () => {
    const key = 'stories/s1/pages/07/retina.webp';
    await store.put({ key, body: new Uint8Array([4, 4, 4]), contentType: 'image/webp' });

    const signed = await store.signedUrl(key, 900);
    const response = await fetch(signed.url);
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([4, 4, 4]);

    // No Authorization header travelled — that is the whole point of a presigned URL.
    const last = mock.requests.at(-1)!;
    expect(last.headers['authorization']).toBeUndefined();
  });

  it('signs keys containing Turkish characters and spaces without a mismatch', async () => {
    // The canonical path is the ENCODED path; a driver that encodes differently in the
    // request line than in the signature fails here and nowhere else.
    const key = 'stories/s1/pages/01/Elif in odası.webp';
    await store.put({ key, body: new Uint8Array([7]), contentType: 'image/webp' });
    expect([...(await store.get(key))]).toEqual([7]);

    const signed = await store.signedUrl(key, 60);
    expect((await fetch(signed.url)).status).toBe(200);
  });
});

/**
 * ⭐ Supabase Storage shape: the S3 API lives under `/storage/v1/s3`, so every canonical
 * path carries a prefix. This is the configuration `docs/DEPLOY.md` tells the operator to
 * enter, and the one that was broken before the prefix was threaded through `locate()`.
 */
describe('S3ObjectStore against a prefixed endpoint (Supabase Storage shape)', () => {
  let mock: MockS3;
  let store: S3ObjectStore;

  beforeAll(async () => {
    mock = await startMockS3('/storage/v1/s3');
    store = new S3ObjectStore({
      bucket: 'kh-media',
      region: REGION,
      endpoint: `${mock.origin}/storage/v1/s3`,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      forcePathStyle: true,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mock.server.close(() => resolve()));
  });

  it('keeps the endpoint prefix in the request line', async () => {
    await store.put({
      key: 'stories/s1/pages/02/reader.webp',
      body: new Uint8Array([1, 2]),
      contentType: 'image/webp',
    });
    expect(mock.requests.at(-1)!.url).toBe('/storage/v1/s3/kh-media/stories/s1/pages/02/reader.webp');
  });

  it('round-trips PUT → GET → HEAD → DELETE through the prefix', async () => {
    const key = 'stories/s2/print/cover.tiff';
    await store.put({ key, body: new Uint8Array([5, 5, 5, 5]), contentType: 'image/tiff' });
    expect([...(await store.get(key))]).toEqual([5, 5, 5, 5]);
    expect((await store.head(key))?.sizeBytes).toBe(4);
    await store.delete(key);
    expect(await store.head(key)).toBeUndefined();
  });

  it('presigns through the prefix — the URL a parent’s phone actually opens', async () => {
    const key = 'stories/s2/pages/05/reader.webp';
    await store.put({ key, body: new Uint8Array([6, 6]), contentType: 'image/webp' });

    const signed = await store.signedUrl(key, 900);
    expect(new URL(signed.url).pathname).toBe(
      '/storage/v1/s3/kh-media/stories/s2/pages/05/reader.webp',
    );

    const response = await fetch(signed.url);
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([6, 6]);
  });

  it('trailing slashes on the endpoint do not double up in the path', async () => {
    const tolerant = new S3ObjectStore({
      bucket: 'kh-media',
      region: REGION,
      endpoint: `${mock.origin}/storage/v1/s3/`,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    });
    await tolerant.put({ key: 'a/b.bin', body: new Uint8Array([1]), contentType: 'application/octet-stream' });
    expect(mock.requests.at(-1)!.url).toBe('/storage/v1/s3/kh-media/a/b.bin');
  });

  it('a wrong secret is refused, so a green suite is not a signature that is never checked', async () => {
    const wrong = new S3ObjectStore({
      bucket: 'kh-media',
      region: REGION,
      endpoint: `${mock.origin}/storage/v1/s3`,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: 'not-the-secret',
    });
    await expect(
      wrong.put({ key: 'a/c.bin', body: new Uint8Array([1]), contentType: 'application/octet-stream' }),
    ).rejects.toThrow(/403/u);
  });
});
