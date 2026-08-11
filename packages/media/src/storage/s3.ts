/**
 * media/storage/s3.ts — the S3/MinIO driver, over `fetch` and a hand-rolled SigV4 signer.
 *
 * ⚠️ NOT EXERCISED AGAINST A REAL BUCKET. There is no S3 and no MinIO in this environment.
 * What is tested (`s3.test.ts`) is the part that is actually hard and actually
 * deterministic: the canonical request, the string to sign, the derived signing key and the
 * presigned URL — checked against AWS's published SigV4 test vector, which is the same
 * arithmetic MinIO verifies.
 *
 * WHY NO `@aws-sdk/client-s3`. The SDK is ~15 MB across a dozen packages for four verbs
 * (PUT, GET, HEAD, DELETE) and a presigner. It would also have to be installed, and a
 * dependency that cannot be run against its service in CI is not more trustworthy than 150
 * lines of specified arithmetic that a published test vector pins exactly. If a later need
 * (multipart upload for large exports, KMS grants) justifies it, `packages/providers`-style
 * SDK use is allowed here too — this is a scoped "not yet".
 */

import { createHash, createHmac } from 'node:crypto';

import {
  ObjectNotFoundError,
  type ObjectStore,
  type PutObjectInput,
  type RetentionClass,
  type SignedUrl,
  type StoredObject,
} from './types';

export interface S3ObjectStoreOptions {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `S3_ENDPOINT` — MinIO or a regional S3 endpoint. */
  endpoint: string;
  /** MinIO needs path style; real S3 prefers virtual host style. */
  forcePathStyle?: boolean;
  /** `S3_KMS_KEY_ID`; sent as SSE-KMS headers when present. */
  kmsKeyId?: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const SERVICE = 's3';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

/* ── SigV4 ─────────────────────────────────────────────────────────────────── */

export interface CanonicalRequestInput {
  method: string;
  /** Already URI-encoded path, beginning with `/`. */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  signedHeaders: string[];
  payloadHash: string;
}

/** RFC 3986 encoding. S3 requires `~` unescaped and space as `%20`, unlike `encodeURIComponent`. */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = '';
  for (const char of value) {
    const isUnreserved =
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '0' && char <= '9') ||
      char === '_' ||
      char === '-' ||
      char === '~' ||
      char === '.';
    if (isUnreserved) {
      out += char;
    } else if (char === '/') {
      out += encodeSlash ? '%2F' : '/';
    } else {
      out += [...Buffer.from(char, 'utf8')]
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
        .join('');
    }
  }
  return out;
}

export function buildCanonicalRequest(input: CanonicalRequestInput): string {
  const canonicalQuery = Object.keys(input.query)
    .sort()
    .map((key) => `${uriEncode(key)}=${uriEncode(input.query[key] ?? '')}`)
    .join('&');

  const canonicalHeaders = input.signedHeaders
    .map((name) => `${name}:${(input.headers[name] ?? '').trim().replace(/\s+/gu, ' ')}\n`)
    .join('');

  return [
    input.method,
    input.path,
    canonicalQuery,
    canonicalHeaders,
    input.signedHeaders.join(';'),
    input.payloadHash,
  ].join('\n');
}

export function buildStringToSign(
  amzDate: string,
  scope: string,
  canonicalRequest: string,
): string {
  return [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
}

export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service = SERVICE,
): Buffer {
  const kDate = createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

export function sign(signingKey: Buffer, stringToSign: string): string {
  return createHmac('sha256', signingKey).update(stringToSign).digest('hex');
}

/** `20260811T224812Z` and `20260811`. */
export function amzDates(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/gu, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/* ── Driver ────────────────────────────────────────────────────────────────── */

export class S3ObjectStore implements ObjectStore {
  readonly driver = 's3' as const;
  readonly bucket: string;

  private readonly options: S3ObjectStoreOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: S3ObjectStoreOptions) {
    this.bucket = options.bucket;
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const headers: Record<string, string> = {
      'content-type': input.contentType,
      'content-length': String(input.body.byteLength),
      ...(input.cacheControl ? { 'cache-control': input.cacheControl } : {}),
      // Retention travels as object metadata as well as in `assets`, so an object found
      // without its database row is still classifiable by the purge job.
      'x-amz-meta-retention-class': input.retentionClass ?? 'standard',
      ...(input.sha256 ? { 'x-amz-meta-sha256': input.sha256 } : {}),
      ...Object.fromEntries(
        Object.entries(input.metadata ?? {}).map(([k, v]) => [`x-amz-meta-${k}`, v]),
      ),
      ...(this.options.kmsKeyId
        ? {
            'x-amz-server-side-encryption': 'aws:kms',
            'x-amz-server-side-encryption-aws-kms-key-id': this.options.kmsKeyId,
          }
        : {}),
    };

    const payloadHash = createHash('sha256').update(input.body).digest('hex');
    const response = await this.send('PUT', input.key, {
      headers,
      body: input.body,
      payloadHash,
    });
    if (!response.ok) {
      throw new Error(`S3 PUT ${input.key} failed: ${response.status} ${await response.text()}`);
    }

    return {
      bucket: this.bucket,
      key: input.key,
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      retentionClass: input.retentionClass ?? 'standard',
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      ...(response.headers.get('etag') ? { etag: response.headers.get('etag')! } : {}),
    };
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.send('GET', key, {});
    if (response.status === 404) throw new ObjectNotFoundError(this.bucket, key);
    if (!response.ok) {
      throw new Error(`S3 GET ${key} failed: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async head(key: string): Promise<StoredObject | undefined> {
    const response = await this.send('HEAD', key, {});
    if (!response.ok) return undefined;
    return {
      bucket: this.bucket,
      key,
      sizeBytes: Number(response.headers.get('content-length') ?? 0),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      retentionClass:
        (response.headers.get('x-amz-meta-retention-class') as RetentionClass | null) ??
        'standard',
      ...(response.headers.get('x-amz-meta-sha256')
        ? { sha256: response.headers.get('x-amz-meta-sha256')! }
        : {}),
      ...(response.headers.get('etag') ? { etag: response.headers.get('etag')! } : {}),
    };
  }

  async delete(key: string): Promise<void> {
    const response = await this.send('DELETE', key, {});
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 DELETE ${key} failed: ${response.status}`);
    }
  }

  /**
   * Presigned GET (query-string SigV4). No request is made — the URL is arithmetic — so
   * signing thirteen page URLs for a reader costs nothing.
   */
  async signedUrl(key: string, expiresInSec: number): Promise<SignedUrl> {
    const date = this.now();
    const { amzDate, dateStamp } = amzDates(date);
    const scope = `${dateStamp}/${this.options.region}/${SERVICE}/aws4_request`;
    const { host, path } = this.locate(key);

    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.options.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSec),
      'X-Amz-SignedHeaders': 'host',
    };

    const canonicalRequest = buildCanonicalRequest({
      method: 'GET',
      path,
      query,
      headers: { host },
      signedHeaders: ['host'],
      payloadHash: UNSIGNED_PAYLOAD,
    });

    const signature = sign(
      deriveSigningKey(this.options.secretAccessKey, dateStamp, this.options.region),
      buildStringToSign(amzDate, scope, canonicalRequest),
    );

    const search = Object.keys(query)
      .sort()
      .map((k) => `${uriEncode(k)}=${uriEncode(query[k] ?? '')}`)
      .join('&');

    const base = this.options.endpoint.replace(/\/+$/u, '');
    const origin = new URL(base).origin;

    return {
      url: `${origin}${path}?${search}&X-Amz-Signature=${signature}`,
      expiresInSec,
      expiresAt: new Date(date.getTime() + expiresInSec * 1000).toISOString(),
    };
  }

  /* ── internals ────────────────────────────────────────────────────────── */

  private locate(key: string): { host: string; path: string; url: string } {
    const endpoint = new URL(this.options.endpoint);
    const encodedKey = uriEncode(key.replace(/^\/+/u, ''), false);

    if (this.options.forcePathStyle ?? true) {
      const path = `/${this.bucket}/${encodedKey}`;
      return { host: endpoint.host, path, url: `${endpoint.origin}${path}` };
    }
    const host = `${this.bucket}.${endpoint.host}`;
    const path = `/${encodedKey}`;
    return { host, path, url: `${endpoint.protocol}//${host}${path}` };
  }

  private async send(
    method: string,
    key: string,
    options: {
      headers?: Record<string, string>;
      body?: Uint8Array;
      payloadHash?: string;
    },
  ): Promise<Response> {
    const date = this.now();
    const { amzDate, dateStamp } = amzDates(date);
    const scope = `${dateStamp}/${this.options.region}/${SERVICE}/aws4_request`;
    const { host, path, url } = this.locate(key);
    const payloadHash = options.payloadHash ?? createHash('sha256').update('').digest('hex');

    const headers: Record<string, string> = {
      ...(options.headers ?? {}),
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    const signedHeaders = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort();

    const canonicalRequest = buildCanonicalRequest({
      method,
      path,
      query: {},
      headers: Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
      ),
      signedHeaders,
      payloadHash,
    });

    const signature = sign(
      deriveSigningKey(this.options.secretAccessKey, dateStamp, this.options.region),
      buildStringToSign(amzDate, scope, canonicalRequest),
    );

    headers['authorization'] =
      `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;

    return this.fetchImpl(url, {
      method,
      headers,
      // A `Uint8Array` is a valid fetch body at runtime; the DOM lib is not in `lib`,
      // so the structural type has to be asserted rather than named.
      ...(options.body ? { body: options.body as unknown as Uint8Array<ArrayBuffer> } : {}),
    });
  }
}
