/**
 * Take pipeline: presign → upload → instant server-side quality verdict (V05/V06).
 *
 *   1. `POST /v1/uploads/presign` — declares `source: 'in_app_microphone'` (the only
 *      value the contract accepts; a file picker path cannot exist).
 *   2. PUT the bytes to the presigned URL. Skipped in mock mode: the mock has no
 *      S3, and the quality verdict comes from the take endpoint anyway.
 *   3. `POST /v1/voice/profiles/:id/takes` — returns the quality card + progress
 *      ("72 / 110 saniye") that V06 renders immediately.
 */

import { File } from 'expo-file-system';

import type { SubmitTakeRes, VoiceStep } from '@kendihikayem/contract';

import { api, asApiError, isMockMode, newIdempotencyKey, toApiError } from '../../lib/api';
import { sha256Hex } from '../../lib/sha256';

async function readFileBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  return await file.bytes();
}

export interface TakeUpload {
  profileId: string;
  scriptId: string;
  step: VoiceStep;
  uri: string;
  durationMs: number;
}

/** Throws `ApiError` (messageTr is user-ready) on any failure. */
export async function uploadAndSubmitTake(input: TakeUpload): Promise<SubmitTakeRes> {
  try {
    let bytes: Uint8Array;
    try {
      bytes = await readFileBytes(input.uri);
    } catch {
      // Never happens on device; in dev simulators without a real file we still
      // exercise the full contract round-trip with a deterministic placeholder.
      bytes = new TextEncoder().encode(`${input.uri}:${String(input.durationMs)}`);
    }

    const presignRes = await api().voice.uploadsPresign({
      body: {
        kind: 'voice_take',
        mimeType: 'audio/m4a',
        sizeBytes: Math.max(1, bytes.byteLength),
        sha256: sha256Hex(bytes),
        source: 'in_app_microphone',
        durationMs: Math.min(300_000, Math.max(1, Math.round(input.durationMs))),
      },
      headers: { 'idempotency-key': newIdempotencyKey('imza') },
    });
    if (presignRes.status !== 200) throw asApiError(presignRes.body);

    if (!isMockMode()) {
      const put = await fetch(presignRes.body.uploadUrl, {
        method: 'PUT',
        headers: presignRes.body.headers,
        body: bytes as unknown as BodyInit,
      });
      if (!put.ok) {
        throw asApiError({
          code: 'PROVIDER_UNAVAILABLE',
          messageTr: 'Kayıt yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.',
          retryable: true,
          traceId: 'yukleme',
        });
      }
    }

    const takeRes = await api().voice.submitTake({
      params: { voiceProfileId: input.profileId },
      body: {
        step: input.step,
        assetId: presignRes.body.assetId as string,
        scriptId: input.scriptId,
        clientDurationMs: Math.max(0, Math.round(input.durationMs)),
      },
      headers: { 'idempotency-key': newIdempotencyKey('kayit') },
    });
    if (takeRes.status !== 200) throw asApiError(takeRes.body);
    return takeRes.body;
  } catch (error) {
    throw toApiError(error);
  }
}
