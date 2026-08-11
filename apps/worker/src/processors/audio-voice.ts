/**
 * processors/audio-voice.ts — SPEC §7 step 8, "profil üretimi", and step 11, "silme zinciri".
 *
 * This is the job behind the V07 waiting screen. What it does, in order, and why the order
 * is the order:
 *
 *   1. CONSENT FIRST. Before a single byte of the parent's voice moves anywhere, the
 *      biometric consent, the cross-border consent, the document hashes and the verified
 *      liveness clip are checked. Nothing below runs if that fails, and the failure is a
 *      contract error code with a Turkish sentence, not a stack trace.
 *   2. Stitch the four accepted passages into one 48 kHz mono reference, loudness-normalised
 *      and capped at three minutes.
 *   3. Store it in the SEPARATE raw-voice bucket under its own key (KVKK, SPEC §2).
 *   4. Create the vendor voice, evicting a cold one first if the account is at its ceiling.
 *   5. Synthesise the preview: the child's own name in a sentence the parent will recognise.
 *      This is the emotional payoff the whole feature exists for (V08).
 */

import type { Job } from 'bullmq';
import { sql } from 'drizzle-orm';

import type { Database } from '@kendihikayem/db';
import {
  BIOMETRIC_SUBJECT,
  CROSS_BORDER_SUBJECT,
  type ConsentRecord,
  type TtsSettings,
  decodeWav,
  encodeWav,
  evaluateReference,
  measureTake,
  normalizeLoudness,
  resample,
  toMono,
  trimSilence,
  verifyCloneConsent,
} from '@kendihikayem/providers';

import type { JobPayload } from '../queues';
import type { WorkerRuntime } from '../runtime';
import { appendJobEvent } from '../jobs/events';
import { audioKeys, readAudioAsset, writeAudioAsset } from './audio-storage';
import { bindingProviderFor, ensureVoiceBinding } from './audio-bindings';
import { scheduleRawVoiceDestruction, scheduleVoiceDeletionChain } from './audio-deletion';

/** The reference is rendered at 48 kHz mono — the vendor's sweet spot (SPEC §7 step 8). */
const REFERENCE_SAMPLE_RATE = 48_000;
/** Never exceed three minutes of reference audio. More does not improve the clone. */
const REFERENCE_MAX_MS = 180_000;
/** Short pause between stitched passages so the vendor hears four deliveries, not one. */
const PASSAGE_GAP_MS = 400;

export class VoiceCloneRefusedError extends Error {
  constructor(
    readonly code: 'CONSENT_REQUIRED' | 'CONSENT_REVOKED' | 'VOICE_SCRIPT_MISMATCH' | 'VOICE_QUALITY_LOW',
    readonly messageTr: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'VoiceCloneRefusedError';
  }
}

export interface VoiceProfileRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  display_name: string;
  status: string;
  consent_id: string | null;
  consent_clip_asset_id: string | null;
  reference_asset_id: string | null;
  asr_match_score: string | null;
}

export async function loadVoiceProfile(
  db: Database,
  voiceProfileId: string,
): Promise<VoiceProfileRow | undefined> {
  const rows = await db.execute<VoiceProfileRow>(sql`
    select id, user_id, display_name, status, consent_id, consent_clip_asset_id,
           reference_asset_id, asr_match_score
      from voice_profiles where id = ${voiceProfileId} and deleted_at is null
  `);
  return rows[0];
}

async function loadConsents(db: Database, userId: string): Promise<ConsentRecord[]> {
  const rows = await db.execute<{
    id: string;
    subject: string;
    granted: boolean;
    document_sha256: string;
    method: string;
    granted_at: Date | string;
    revoked_at: Date | string | null;
  }>(sql`
    select id, subject, granted, document_sha256, method, granted_at, revoked_at
      from consents
     where user_id = ${userId} and subject in (${BIOMETRIC_SUBJECT}, ${CROSS_BORDER_SUBJECT})
     order by granted_at desc
  `);

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    granted: row.granted,
    documentSha256: row.document_sha256,
    method: row.method,
    grantedAt: new Date(row.granted_at),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
  }));
}

/**
 * The currently published document hash per consent subject.
 *
 * Compared against what the parent actually consented to. A mismatch means the wording
 * changed after they agreed, and their consent does not carry to the new text — see
 * `verifyCloneConsent`, which refuses rather than assuming goodwill.
 */
async function publishedHashes(db: Database): Promise<Record<string, string>> {
  const rows = await db.execute<{ kind: string; body_sha256: string }>(sql`
    select distinct on (kind) kind, body_sha256
      from legal_documents
     where kind in ('riza_ses_biyometrik', 'riza_yurtdisi')
       and effective_from <= now()
       and (effective_to is null or effective_to > now())
     order by kind, effective_from desc
  `);

  const byKind = new Map(rows.map((row) => [row.kind, row.body_sha256]));
  const hashes: Record<string, string> = {};
  const biometric = byKind.get('riza_ses_biyometrik');
  const crossBorder = byKind.get('riza_yurtdisi');
  if (biometric) hashes[BIOMETRIC_SUBJECT] = biometric;
  if (crossBorder) hashes[CROSS_BORDER_SUBJECT] = crossBorder;
  return hashes;
}

interface TakeRow {
  [key: string]: unknown;
  id: string;
  step: string;
  asset_id: string;
  accepted: boolean;
  quality: { score?: number } | null;
}

async function loadAcceptedTakes(db: Database, voiceProfileId: string): Promise<TakeRow[]> {
  // The LATEST accepted attempt per passage: a parent who re-recorded passage 3 four times
  // gets their fourth take, not their first (SPEC §7 step 6 — per-passage retry).
  const rows = await db.execute<TakeRow>(sql`
    select distinct on (step) id, step, asset_id, accepted, quality
      from voice_takes
     where voice_profile_id = ${voiceProfileId} and accepted = true
       and step in ('passage_1','passage_2','passage_3','passage_4')
     order by step, attempt desc
  `);
  return [...rows];
}

export interface StitchedReference {
  bytes: Uint8Array;
  durationMs: number;
  perTakeScores: number[];
}

/**
 * Four passages → one reference clip.
 *
 * Loudness is normalised across the WHOLE stitched clip rather than per passage: the four
 * passages are deliberately different deliveries (calm, excited, whispered, dialogue), and
 * levelling them individually would flatten exactly the expressive range the clone is
 * supposed to learn (SPEC §7 step 6).
 */
export async function stitchReference(
  runtime: WorkerRuntime,
  takes: readonly TakeRow[],
  settings: TtsSettings,
): Promise<StitchedReference> {
  const segments: Float32Array[] = [];
  const perTakeScores: number[] = [];

  for (const take of takes) {
    const stored = await readAudioAsset(runtime.db, runtime.objectStore, take.asset_id);
    if (!stored) continue;
    const decoded = decodeWav(stored.bytes);
    const mono = resample(toMono(decoded), decoded.sampleRate, REFERENCE_SAMPLE_RATE);
    segments.push(trimSilence(mono, 60, REFERENCE_SAMPLE_RATE));

    const score = take.quality?.score;
    perTakeScores.push(
      typeof score === 'number'
        ? score
        : measureTake({ audio: decoded, skipSpeakerCheck: true }).score,
    );
  }

  const gapSamples = Math.round((PASSAGE_GAP_MS / 1000) * REFERENCE_SAMPLE_RATE);
  const total =
    segments.reduce((sum, segment) => sum + segment.length, 0) +
    gapSamples * Math.max(0, segments.length - 1);
  const joined = new Float32Array(total);
  let cursor = 0;
  for (const [index, segment] of segments.entries()) {
    joined.set(segment, cursor);
    cursor += segment.length + (index < segments.length - 1 ? gapSamples : 0);
  }

  const maxSamples = Math.round((REFERENCE_MAX_MS / 1000) * REFERENCE_SAMPLE_RATE);
  const capped = joined.length > maxSamples ? joined.slice(0, maxSamples) : joined;

  const normalized = normalizeLoudness(capped, REFERENCE_SAMPLE_RATE, {
    targetLufs: settings.loudness.targetLufs,
    peakCeilingDb: settings.loudness.peakCeilingDb,
  });

  return {
    bytes: encodeWav([normalized.samples], { sampleRate: REFERENCE_SAMPLE_RATE, bitDepth: 16 }),
    durationMs: Math.round((normalized.samples.length / REFERENCE_SAMPLE_RATE) * 1000),
    perTakeScores,
  };
}

/** The V08 preview sentence. The child's own name is the entire point of it. */
export function previewSentenceTr(childName: string | undefined): string {
  const name = (childName ?? '').trim();
  return name.length > 0
    ? `${name}, hadi uyu artık. Yarın yeni bir maceraya çıkacağız.`
    : 'Hadi uyu artık. Yarın yeni bir maceraya çıkacağız.';
}

/* ── voice:'voice.create' ──────────────────────────────────────────────────── */

export function createVoiceCreateProcessor(context: { settings: TtsSettings }) {
  return async function voiceCreate(runtime: WorkerRuntime, job: Job<JobPayload>) {
    const { jobId } = job.data;
    const ref = job.data.ref ?? {};
    const voiceProfileId = String(ref['voiceProfileId'] ?? '');
    const previewChildName = ref['previewChildName'] as string | undefined;

    const profile = await loadVoiceProfile(runtime.db, voiceProfileId);
    if (!profile) throw new Error(`voice profile ${voiceProfileId} not found`);

    await runtime.db.execute(sql`
      update voice_profiles set status = 'processing', updated_at = now()
       where id = ${voiceProfileId}
    `);

    // ── 1. Consent, before anything else moves ──────────────────────────────
    const verdict = verifyCloneConsent({
      consents: await loadConsents(runtime.db, profile.user_id),
      publishedHashes: await publishedHashes(runtime.db),
      consentClipAssetId: profile.consent_clip_asset_id,
      // The read-back score was computed and stored when the clip was submitted; a profile
      // that never passed liveness has no score, and `Number(null)` would be 0 — refused.
      livenessVerified: Number(profile.asr_match_score ?? 0) >= 0.85,
    });
    if (!verdict.ok) {
      await failProfile(runtime.db, voiceProfileId, verdict.code);
      throw new VoiceCloneRefusedError(
        verdict.code,
        turkishFor(verdict.code),
        verdict.detail,
      );
    }

    // ── 2/3. Stitch and store the reference ─────────────────────────────────
    const takes = await loadAcceptedTakes(runtime.db, voiceProfileId);
    const reference = await stitchReference(runtime, takes, context.settings);
    const referenceVerdict = evaluateReference({
      totalMs: reference.durationMs,
      perTakeScores: reference.perTakeScores,
    });
    if (!referenceVerdict.ok) {
      await failProfile(runtime.db, voiceProfileId, 'VOICE_QUALITY_LOW', referenceVerdict.reasonTr);
      throw new VoiceCloneRefusedError(
        'VOICE_QUALITY_LOW',
        referenceVerdict.reasonTr ?? '',
        `stitched reference rejected (${referenceVerdict.capturedSec}s)`,
      );
    }

    const referenceAssetId = await writeAudioAsset({
      db: runtime.db,
      store: runtime.objectStore,
      userId: profile.user_id,
      // ⚠️ The SEPARATE raw-voice bucket with its own CMK. Not the media bucket.
      bucket: runtime.buckets.voiceRaw,
      key: audioKeys.voiceReference(voiceProfileId),
      bytes: reference.bytes,
      mimeType: 'audio/wav',
      kind: 'voice_reference_raw',
      durationMs: reference.durationMs,
      sampleRateHz: REFERENCE_SAMPLE_RATE,
      channels: 1,
      retentionClass: 'ephemeral_30d',
      ...(runtime.buckets.voiceKmsAlias ? { kmsKeyAlias: runtime.buckets.voiceKmsAlias } : {}),
      purgeAfterDays: context.settings.retention.rawDays,
    });

    await runtime.db.execute(sql`
      update voice_profiles set reference_asset_id = ${referenceAssetId}, updated_at = now()
       where id = ${voiceProfileId}
    `);

    // ── 4. The vendor voice, evicting a cold one if the account is full ─────
    const ctx = {
      requestId: `${jobId}:voice-create`,
      correlationId: job.data.correlationId,
      userId: profile.user_id,
    };
    const binding = await ensureVoiceBinding({
      db: runtime.db,
      store: runtime.objectStore,
      adapter: runtime.adapters.tts,
      policy: {
        limit: context.settings.slots.limit,
        highWater: context.settings.slots.highWater,
        idleHours: context.settings.slots.idleHours,
      },
      ctx,
      bindingProvider: bindingProviderFor(runtime.adapters.tts.provider, runtime.env.VOICE_PRIMARY),
      voiceProfileId,
      consentId: verdict.biometricConsentId,
      referenceAssetId,
      ephemeral: context.settings.slots.ephemeral,
    });

    // ── 5. The preview the parent will actually judge us on ─────────────────
    const previewText = previewSentenceTr(previewChildName);
    const preview = await runtime.adapters.tts.synthesize(
      {
        text: previewText,
        voice: { kind: 'cloned', providerVoiceId: binding.providerVoiceId },
        tier: 'quality',
        languageCode: 'tr',
        outputFormat: context.settings.outputFormat,
      },
      ctx,
    );

    const previewAssetId = await writeAudioAsset({
      db: runtime.db,
      store: runtime.objectStore,
      userId: profile.user_id,
      bucket: runtime.buckets.media,
      key: audioKeys.voicePreview(voiceProfileId),
      bytes: preview.value.audio,
      mimeType: preview.value.mimeType,
      kind: 'voice_preview',
      durationMs: preview.value.durationMs,
      provider: runtime.adapters.tts.provider,
    });

    const averageScore =
      reference.perTakeScores.reduce((sum, score) => sum + score, 0) /
      Math.max(1, reference.perTakeScores.length);

    await runtime.db.execute(sql`
      update voice_profiles
         set status = 'preview_ready',
             preview_asset_id = ${previewAssetId},
             quality_score = ${averageScore.toFixed(3)}::numeric,
             quality = ${JSON.stringify({
               score: averageScore,
               referenceSec: Math.round(reference.durationMs / 1000),
               takes: reference.perTakeScores.length,
             })}::jsonb,
             failure_reason = null,
             updated_at = now()
       where id = ${voiceProfileId}
    `);

    // `voice.ready` is the contract's event for this (events.ts); the consent proof and the
    // eviction count ride along in the payload for the audit trail, which the client
    // ignores and an auditor does not.
    await appendJobEvent(runtime.db, jobId, 'voice.ready', {
      voiceProfileId,
      previewAssetId,
      consentProof: verdict.proof,
      evictedToMakeRoom: binding.evicted,
    });

    return {
      status: 'preview_ready',
      voiceProfileId,
      providerVoiceId: binding.providerVoiceId,
      referenceSec: Math.round(reference.durationMs / 1000),
      evicted: binding.evicted,
    };
  };
}

async function failProfile(
  db: Database,
  voiceProfileId: string,
  code: string,
  reasonTr?: string,
): Promise<void> {
  await db.execute(sql`
    update voice_profiles
       set status = 'failed', failure_reason = ${reasonTr ?? code}, updated_at = now()
     where id = ${voiceProfileId}
  `);
}

function turkishFor(code: 'CONSENT_REQUIRED' | 'CONSENT_REVOKED' | 'VOICE_SCRIPT_MISMATCH'): string {
  switch (code) {
    case 'CONSENT_REQUIRED':
      return 'Devam etmek için ses izinlerini onaylamanız gerekiyor.';
    case 'CONSENT_REVOKED':
      return 'İzninizi geri aldığınız için bu özellik kapalı.';
    case 'VOICE_SCRIPT_MISMATCH':
      return 'Okuduğunuz metin ekrandakiyle eşleşmedi.';
  }
}

/* ── Acceptance and deletion ───────────────────────────────────────────────── */

/**
 * `POST /accept` (SPEC §7 step 9): the profile goes live and the +30 day destruction of the
 * RAW recording is scheduled in the same breath. Two things that must not drift apart —
 * a profile accepted without that row is a promise quietly broken.
 */
export async function acceptVoiceProfile(
  runtime: WorkerRuntime,
  voiceProfileId: string,
  settings: TtsSettings,
): Promise<{ scheduledDeletions: number }> {
  const profile = await loadVoiceProfile(runtime.db, voiceProfileId);
  if (!profile) throw new Error(`voice profile ${voiceProfileId} not found`);

  await runtime.db.execute(sql`
    update voice_profiles set status = 'ready', accepted_at = now(), updated_at = now()
     where id = ${voiceProfileId}
  `);

  const scheduledDeletions = await scheduleRawVoiceDestruction({
    db: runtime.db,
    userId: profile.user_id,
    voiceProfileId,
    retentionDays: settings.retention.rawDays,
  });

  return { scheduledDeletions };
}

/* ── voice:'voice.delete' ──────────────────────────────────────────────────── */

export function createVoiceDeleteProcessor() {
  return async function voiceDelete(runtime: WorkerRuntime, job: Job<JobPayload>) {
    const ref = job.data.ref ?? {};
    const voiceProfileId = String(ref['voiceProfileId'] ?? '');

    const profile = await loadVoiceProfile(runtime.db, voiceProfileId);
    if (!profile) return { status: 'already_deleted', voiceProfileId };

    // Revoked immediately, before the chain runs: from this instant no new render may pick
    // this voice, even though the vendor-side copy takes a few more seconds to disappear.
    await runtime.db.execute(sql`
      update voice_profiles set status = 'revoked', revoked_at = now(), updated_at = now()
       where id = ${voiceProfileId}
    `);

    const chain = await scheduleVoiceDeletionChain({
      db: runtime.db,
      userId: profile.user_id,
      voiceProfileId,
    });

    await appendJobEvent(runtime.db, job.data.jobId, 'voice.ready', {
      voiceProfileId,
      deletionScheduled: chain,
    });

    return { status: 'scheduled', voiceProfileId, ...chain };
  };
}
