/**
 * Storage tests.
 *
 * The filesystem driver is tested for real — it is what runs here, and its signed URLs are
 * the mechanism behind "a child's illustration is never public".
 *
 * The S3 driver cannot be tested against a bucket (there is none), so what is tested is the
 * part that is both hard and exactly specified: SigV4. The derived signing key is checked
 * against AWS's own published test vector, which is the same arithmetic MinIO verifies, so
 * a signing bug shows up here rather than as an opaque 403 on the first deploy.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FilesystemObjectStore } from './filesystem';
import {
  S3ObjectStore,
  buildCanonicalRequest,
  buildStringToSign,
  deriveSigningKey,
  sign,
  uriEncode,
} from './s3';
import { ObjectNotFoundError, storageKeys } from './types';
import { createObjectStore } from './factory';

/* ── filesystem ────────────────────────────────────────────────────────────── */

describe('FilesystemObjectStore', () => {
  let root: string;
  let store: FilesystemObjectStore;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'kh-media-'));
    store = new FilesystemObjectStore({
      root,
      bucket: 'kh-media',
      signingSecret: 'a'.repeat(48),
      publicBaseUrl: 'https://api.example.test',
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips an object with its content type and retention class', async () => {
    const key = storageKeys.pageScreen('story-1', 3, 'reader', 'webp');
    const stored = await store.put({
      key,
      body: new Uint8Array([1, 2, 3, 4]),
      contentType: 'image/webp',
      retentionClass: 'standard',
      sha256: 'abc',
    });

    expect(stored).toMatchObject({ bucket: 'kh-media', key, sizeBytes: 4 });
    expect(await store.get(key)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(await store.head(key)).toMatchObject({
      contentType: 'image/webp',
      retentionClass: 'standard',
      sha256: 'abc',
    });
  });

  it('writes under a structured, story-scoped key', async () => {
    const key = storageKeys.pageScreen('story-2', 7, 'thumb', 'webp');
    await store.put({ key, body: new Uint8Array([9]), contentType: 'image/webp' });
    // Story-prefixed layout is what makes a KVKK erasure a bounded delete, not a scan.
    expect(key).toBe('stories/story-2/pages/07/thumb.webp');
    await expect(readFile(join(root, 'kh-media', key))).resolves.toBeDefined();
  });

  it('reports a missing object as ObjectNotFoundError, not as empty bytes', async () => {
    await expect(store.get('stories/none/pages/01/reader.webp')).rejects.toThrow(
      ObjectNotFoundError,
    );
    expect(await store.head('stories/none/pages/01/reader.webp')).toBeUndefined();
  });

  it('deletes the object and its metadata sidecar', async () => {
    const key = storageKeys.coverScreen('story-3', 'reader', 'webp');
    await store.put({ key, body: new Uint8Array([1]), contentType: 'image/webp' });
    await store.delete(key);
    expect(await store.head(key)).toBeUndefined();
  });

  it('issues a signed URL that verifies', async () => {
    const key = storageKeys.pageScreen('story-1', 3, 'reader', 'webp');
    const signed = await store.signedUrl(key, 900);

    const url = new URL(signed.url);
    expect(url.origin).toBe('https://api.example.test');
    expect(signed.expiresInSec).toBe(900);
    expect(
      store.verifySignedUrl(key, Number(url.searchParams.get('exp')), url.searchParams.get('sig')!),
    ).toBe(true);
  });

  it('rejects a tampered signature and an expired one', async () => {
    const key = storageKeys.pageScreen('story-1', 3, 'reader', 'webp');
    const url = new URL((await store.signedUrl(key, 900)).url);
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;

    // Same signature, different object: the key is inside the MAC.
    expect(store.verifySignedUrl('stories/story-1/pages/04/reader.webp', exp, sig)).toBe(false);
    // Flipped nibble.
    expect(store.verifySignedUrl(key, exp, `0${sig.slice(1)}`)).toBe(false);
    // Past expiry.
    expect(store.verifySignedUrl(key, Math.floor(Date.now() / 1000) - 10, sig)).toBe(false);
    // Garbage.
    expect(store.verifySignedUrl(key, exp, 'not-hex')).toBe(false);
  });

  it('refuses a key that tries to escape the bucket root', async () => {
    await expect(
      store.put({
        key: '../../etc/passwd',
        body: new Uint8Array([1]),
        contentType: 'text/plain',
      }),
    ).rejects.toThrow(/escapes the bucket root/u);
  });
});

/* ── SigV4 ─────────────────────────────────────────────────────────────────── */

describe('SigV4', () => {
  it('derives the signing key from AWS’s published test vector', () => {
    // AWS "Signature Version 4 Test Suite" derivation example.
    const key = deriveSigningKey(
      'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      '20150830',
      'us-east-1',
      'iam',
    );
    expect(key.toString('hex')).toBe(
      'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9',
    );
  });

  it('signs AWS’s published get-vanilla request to the documented signature', () => {
    const canonicalRequest = buildCanonicalRequest({
      method: 'GET',
      path: '/',
      query: {},
      headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      signedHeaders: ['host', 'x-amz-date'],
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
    const stringToSign = buildStringToSign(
      '20150830T123600Z',
      '20150830/us-east-1/service/aws4_request',
      canonicalRequest,
    );
    const signature = sign(
      deriveSigningKey(
        'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        '20150830',
        'us-east-1',
        'service',
      ),
      stringToSign,
    );
    expect(signature).toBe(
      '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('encodes per RFC 3986, not per encodeURIComponent', () => {
    // The three that break S3 signatures if you get them wrong.
    expect(uriEncode('~')).toBe('~');
    expect(uriEncode(' ')).toBe('%20');
    expect(uriEncode('a/b')).toBe('a%2Fb');
    expect(uriEncode('a/b', false)).toBe('a/b');
    expect(uriEncode('ç')).toBe('%C3%A7');
  });
});

describe('S3ObjectStore', () => {
  const store = new S3ObjectStore({
    bucket: 'kh-media',
    region: 'eu-central-1',
    endpoint: 'http://localhost:9000',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    forcePathStyle: true,
    now: () => new Date('2026-08-11T22:48:12Z'),
  });

  it('presigns a GET with every required query parameter', async () => {
    const signed = await store.signedUrl('stories/s1/pages/03/reader.webp', 900);
    const url = new URL(signed.url);

    // MinIO path style: the bucket is the first path segment.
    expect(url.pathname).toBe('/kh-media/stories/s1/pages/03/reader.webp');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('eu-central-1/s3/aws4_request');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('is deterministic for the same clock and drifts with it', async () => {
    const first = await store.signedUrl('stories/s1/cover/reader.webp', 900);
    const second = await store.signedUrl('stories/s1/cover/reader.webp', 900);
    expect(first.url).toBe(second.url);

    const later = new S3ObjectStore({
      bucket: 'kh-media',
      region: 'eu-central-1',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      now: () => new Date('2026-08-12T22:48:12Z'),
    });
    expect((await later.signedUrl('stories/s1/cover/reader.webp', 900)).url).not.toBe(first.url);
  });

  it('uses virtual-host style when path style is off', async () => {
    const virtual = new S3ObjectStore({
      bucket: 'kh-media',
      region: 'eu-central-1',
      endpoint: 'https://s3.eu-central-1.amazonaws.com',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'secret',
      forcePathStyle: false,
      now: () => new Date('2026-08-11T22:48:12Z'),
    });
    const url = new URL((await virtual.signedUrl('stories/s1/cover/reader.webp', 60)).url);
    expect(url.pathname).toBe('/stories/s1/cover/reader.webp');
  });

  it('signs a PUT with the payload hash and the retention metadata header', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const spy = new S3ObjectStore({
      bucket: 'kh-media',
      region: 'eu-central-1',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'secret',
      now: () => new Date('2026-08-11T22:48:12Z'),
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, headers: init.headers as Record<string, string> };
        return new Response(null, { status: 200, headers: { etag: '"abc"' } });
      }) as unknown as typeof fetch,
    });

    await spy.put({
      key: 'stories/s1/pages/01/reader.webp',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
      retentionClass: 'ephemeral_30d',
    });

    expect(seen!.url).toBe('http://localhost:9000/kh-media/stories/s1/pages/01/reader.webp');
    expect(seen!.headers['x-amz-meta-retention-class']).toBe('ephemeral_30d');
    // Signed payload, not UNSIGNED-PAYLOAD: MinIO rejects a mismatched content hash.
    expect(seen!.headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/u);
    expect(seen!.headers['authorization']).toContain('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/');
  });
});

/* ── factory ───────────────────────────────────────────────────────────────── */

describe('createObjectStore', () => {
  it('builds the filesystem driver by default', () => {
    const store = createObjectStore({
      driver: 'filesystem',
      bucket: 'kh-media',
      localRoot: '/tmp/kh-test',
      signingSecret: 'x'.repeat(48),
      publicBaseUrl: 'http://localhost:3001',
    });
    expect(store.driver).toBe('filesystem');
  });

  it('refuses the filesystem driver without a signing secret', () => {
    // Unsigned media URLs would make every child's illustration guessable.
    expect(() => createObjectStore({ driver: 'filesystem', bucket: 'kh-media' })).toThrow(
      /signing secret/u,
    );
  });

  it('refuses the s3 driver without credentials', () => {
    expect(() => createObjectStore({ driver: 's3', bucket: 'kh-media' })).toThrow(/S3_ENDPOINT/u);
  });
});
