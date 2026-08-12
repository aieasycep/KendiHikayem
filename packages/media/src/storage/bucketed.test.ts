/**
 * Tests for the multi-bucket store.
 *
 * The property that matters is not "bytes go in, bytes come out" — it is that two buckets
 * stay two buckets. ⚠️ KVKK: the raw voice take and the page illustration must not be able
 * to end up in the same place, and a store that quietly ignored the bucket parameter would
 * pass every round-trip test while breaking exactly that.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBucketedObjectStore } from './bucketed';

describe('DriverBackedObjectStore (filesystem driver)', () => {
  let root: string;
  let store: ReturnType<typeof createBucketedObjectStore>;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'kh-bucketed-'));
    store = createBucketedObjectStore({
      config: {
        driver: 'filesystem',
        localRoot: root,
        signingSecret: 'z'.repeat(48),
        publicBaseUrl: 'https://api.example.test',
      },
      retentionByBucket: { 'kh-voice-raw': 'ephemeral_30d' },
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips through the bucket it was given', async () => {
    await store.put({
      bucket: 'kh-media',
      key: 'stories/s1/pages/01/reader.webp',
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
    });
    const read = await store.get('kh-media', 'stories/s1/pages/01/reader.webp');
    expect([...(read ?? [])]).toEqual([1, 2, 3]);
  });

  it('⚠️ KVKK: the same key in two buckets is two different objects', async () => {
    const key = 'voice/user-1/take-01.wav';
    await store.put({
      bucket: 'kh-media',
      key,
      bytes: new Uint8Array([1]),
      contentType: 'audio/wav',
    });
    await store.put({
      bucket: 'kh-voice-raw',
      key,
      bytes: new Uint8Array([2, 2]),
      contentType: 'audio/wav',
    });

    expect([...((await store.get('kh-media', key)) ?? [])]).toEqual([1]);
    expect([...((await store.get('kh-voice-raw', key)) ?? [])]).toEqual([2, 2]);

    // Erasing the raw take must not touch the ordinary media object.
    await store.delete('kh-voice-raw', key);
    expect(await store.exists('kh-voice-raw', key)).toBe(false);
    expect(await store.exists('kh-media', key)).toBe(true);
  });

  it('reports a missing object as undefined rather than throwing', async () => {
    expect(await store.get('kh-media', 'nothing/here.bin')).toBeUndefined();
    expect(await store.exists('kh-media', 'nothing/here.bin')).toBe(false);
  });

  it('deleting an object that is already gone is a success', async () => {
    await expect(store.delete('kh-media', 'nothing/here.bin')).resolves.toBeUndefined();
  });

  it('applies the per-bucket retention class the purge sweep reads', async () => {
    const key = 'voice/user-2/take-01.wav';
    await store.put({
      bucket: 'kh-voice-raw',
      key,
      bytes: new Uint8Array([9]),
      contentType: 'audio/wav',
    });
    const head = await store.driverFor('kh-voice-raw').head(key);
    expect(head?.retentionClass).toBe('ephemeral_30d');
  });

  it('reuses one driver per bucket instead of building one per call', () => {
    expect(store.driverFor('kh-media')).toBe(store.driverFor('kh-media'));
    expect(store.driverFor('kh-media')).not.toBe(store.driverFor('kh-voice-raw'));
  });
});
