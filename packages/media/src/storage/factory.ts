/**
 * media/storage/factory.ts — picks the driver from configuration.
 *
 * `MEDIA_STORAGE_DRIVER=filesystem` is the DEFAULT, not a fallback: it is what a laptop,
 * CI and this environment run, and `packages/config` refuses `s3` without credentials
 * rather than silently degrading. The reason for the strictness is that a silent degrade
 * writes a production book to a container's ephemeral disk and loses it on the next deploy.
 */

import { FilesystemObjectStore } from './filesystem';
import { S3ObjectStore } from './s3';
import type { ObjectStore } from './types';

export interface ObjectStoreConfig {
  driver: 'filesystem' | 's3';
  bucket: string;
  /** filesystem */
  localRoot?: string;
  signingSecret?: string;
  publicBaseUrl?: string;
  /** s3 */
  region?: string;
  endpoint?: string | undefined;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  forcePathStyle?: boolean;
  kmsKeyId?: string | undefined;
}

export function createObjectStore(config: ObjectStoreConfig): ObjectStore {
  if (config.driver === 's3') {
    if (!config.accessKeyId || !config.secretAccessKey || !config.endpoint) {
      throw new Error(
        'MEDIA_STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      );
    }
    return new S3ObjectStore({
      bucket: config.bucket,
      region: config.region ?? 'eu-central-1',
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      forcePathStyle: config.forcePathStyle ?? true,
      kmsKeyId: config.kmsKeyId,
    });
  }

  if (!config.signingSecret) {
    // Unsigned media URLs would make every child's illustration publicly guessable.
    throw new Error('the filesystem media driver needs a signing secret');
  }

  return new FilesystemObjectStore({
    root: config.localRoot ?? '.data/media',
    bucket: config.bucket,
    signingSecret: config.signingSecret,
    publicBaseUrl: config.publicBaseUrl ?? 'http://localhost:3001',
  });
}
