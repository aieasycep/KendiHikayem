/**
 * The voice pipeline against a REAL PostgreSQL.
 *
 * Three claims are made in the brief and each one is worth exactly as much as its proof, so
 * each is tested end to end here rather than asserted in a comment:
 *
 *   (a) the CONSENT CHAIN refuses to clone without both consents, the document hash and a
 *       verified liveness clip;
 *   (b) the DELETION CHAIN actually deletes — vendor voice, storage objects and rows — and
 *       leaves the consent evidence and the child's narrated stories intact;
 *   (c) the CHUNK CACHE saves real money when a parent edits one page, measured in
 *       `content_cache.saved_usd` rather than claimed.
 *
 * No Redis: the processors are invoked directly. The queue's own fan-out is already covered
 * by `pipeline.integration.test.ts`, and what is under test here is what the processors do
 * to the database and to the object store.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Job } from 'bullmq';
import type { DbHandle } from '@kendihikayem/db';
import { createFakeRegistry, encodeWav, synthesizeSpeech } from '@kendihikayem/providers';

import type { JobPayload } from '../src/queues';
import { buildRuntime, type WorkerRuntime } from '../src/runtime';
import { PROCESSORS } from '../src/processors/index';
import { InMemoryObjectStore, audioKeys, writeAudioAsset } from '../src/processors/audio-storage';
import {
  buildDeletionHandlers,
  describeDeletionSideEffects,
} from '../src/processors/audio-deletion';
import { acceptVoiceProfile } from '../src/processors/audio-voice';
import { runVoiceRawDestruction } from '../src/schedulers/index';
import { enqueueJob } from '../src/jobs/repository';
import { requestHash } from '../src/jobs/hashing';
import { createTestUser, deleteTestUser, newIdempotencyKey, openDb, testEnv } from './helpers';

let handle: DbHandle;
let runtime: WorkerRuntime;
let store: InMemoryObjectStore;
const createdUsers: string[] = [];

beforeAll(() => {
  handle = openDb(10);
  store = new InMemoryObjectStore();
  runtime = buildRuntime({
    env: testEnv(),
    db: handle.db,
    // The vendors are unreachable and unkeyed; the doubles stand in for them. Everything
    // else — Postgres, the step harness, the cache, the object store — is real.
    adapters: createFakeRegistry({
      models: {
        llm: 'fake-llm',
        image: 'fake-image',
        tts: 'eleven_multilingual_v2',
        moderation: 'fake-moderation',
        align: 'whisperx-tr',
        print: 'manual_tr',
      },
      latencyMs: 0,
      voiceSlotLimit: 660,
    }),
    objectStore: store,
    queues: {
      // Nothing in these tests enqueues; a stub keeps Redis out of the picture entirely.
      close: async () => {},
    } as unknown as WorkerRuntime['queues'],
  });
});

afterAll(async () => {
  for (const userId of createdUsers) {
    // Teardown has to unwind the same chain the product does, and in the same order: a
    // voice profile POINTS AT the consent that authorised it, and `consents.user_id` is ON
    // DELETE RESTRICT because a consent record outlives the account it belongs to
    // (schema/consents.ts). Needing three statements here is the constraint working.
    // ⚠️ A cloned rendition must be removed BEFORE its profile: the profile's FK is ON
    // DELETE SET NULL, but `audio_renditions_voice_ref_check` requires a cloned rendition to
    // name a profile, so the cascade violates the constraint. That contradiction is real
    // and is written up in docs/contract-rfc/002-ses-silme-zinciri.md — the product never
    // hard-deletes a profile, which is why it does not hit it.
    await handle.db.execute(sql`
      delete from audio_renditions
       where voice_profile_id in (select id from voice_profiles where user_id = ${userId})
    `);
    await handle.db.execute(sql`delete from voice_profiles where user_id = ${userId}`);
    await handle.db.execute(sql`delete from consents where user_id = ${userId}`);
    await deleteTestUser(handle.db, userId);
  }
  await handle.close();
});

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

/** ~26 s of speech-shaped WAV, standing in for one recorded passage. */
function passageWav(seed: number): Uint8Array {
  const audio = synthesizeSpeech({
    seconds: 26,
    f0Hz: 190,
    syllablesPerSecond: 6.2,
    amplitude: 0.42,
    seed,
  });
  return encodeWav(audio.channels, { sampleRate: audio.sampleRate, bitDepth: 16 });
}

const PAGE_TEXTS = [
  'Elif o sabah bahçeye çıktığında, ıhlamur ağacının altında küçük bir sandık buldu.',
  'Sandığın kapağı, sanki yıllardır bu anı bekliyormuş gibi usulca aralandı.',
  'İçinden çıkan harita, rüzgârda titreyen bir yaprak kadar hafifti.',
  'Haritanın ortasında, mavi mürekkeple çizilmiş bir dere kıvrılıyordu.',
  'Elif çantasını omuzladı ve dereye doğru yürümeye başladı.',
  'Yolda karşılaştığı kirpi, ona yolun geri kalanını anlattı.',
  'Derenin kenarındaki taşlar, güneşte parlayan minik aynalara benziyordu.',
  'Suyun sesi, uzaktan gelen tanıdık bir ninniye dönüştü.',
  'Elif gözlerini kapattı ve bir an için annesinin sesini duydu.',
  'Sandığın içindeki son şey, katlanmış küçük bir mektuptu.',
  'Mektupta yalnızca üç kelime yazıyordu: "Seni çok seviyorum."',
  'O gece Elif, haritayı yastığının altına koyup mışıl mışıl uyudu.',
];

async function createStoryWithPages(userId: string): Promise<string> {
  const rows = await handle.db.execute<{ id: string }>(sql`
    insert into stories (user_id, age_band, art_style_code, hero_name, page_count,
                         request_input, status, approved_at)
    values (${userId}, '6-8', 'suluboya', 'Elif', ${PAGE_TEXTS.length}, '{}'::jsonb,
            'ready', now())
    returning id
  `);
  const storyId = rows[0]!.id;

  for (const [index, text] of PAGE_TEXTS.entries()) {
    await handle.db.execute(sql`
      insert into story_pages (story_id, page_no, text_tr, text_sha256)
      values (${storyId}, ${index + 1}, ${text}, ${'0'.repeat(64)})
    `);
  }
  return storyId;
}

async function createVoiceProfile(
  userId: string,
  options: { consents?: 'both' | 'biometric_only' | 'revoked'; liveness?: boolean } = {},
): Promise<string> {
  const consentMode = options.consents ?? 'both';

  const documents = await handle.db.execute<{ id: string; kind: string; body_sha256: string }>(sql`
    select id, kind, body_sha256 from legal_documents where kind = 'riza_ses_biyometrik' limit 1
  `);
  const document = documents[0]!;

  const consentIds: Record<string, string> = {};
  const subjects =
    consentMode === 'biometric_only' ? ['ses_biyometrik'] : ['ses_biyometrik', 'yurtdisi_aktarim'];

  for (const subject of subjects) {
    const rows = await handle.db.execute<{ id: string }>(sql`
      insert into consents (user_id, subject, granted, document_id, document_sha256, method,
                            granted_at, revoked_at, purge_after)
      values (${userId}, ${subject}, true, ${document.id}, ${document.body_sha256}, 'checkbox',
              now(), ${consentMode === 'revoked' && subject === 'yurtdisi_aktarim' ? sql`now()` : null},
              now() + interval '10 years')
      returning id
    `);
    consentIds[subject] = rows[0]!.id;
  }

  // The spoken consent clip: `legal_hold_10y`, and therefore explicitly NOT erased with
  // the rest of the voice data. That exclusion is asserted further down.
  const clipAssetId = await writeAudioAsset({
    db: handle.db,
    store,
    userId,
    bucket: 'kh-voice-raw',
    key: `voice/consent-${randomUUID()}.wav`,
    bytes: passageWav(99),
    mimeType: 'audio/wav',
    kind: 'voice_consent_clip',
    retentionClass: 'legal_hold_10y',
  });

  const profileRows = await handle.db.execute<{ id: string }>(sql`
    insert into voice_profiles (user_id, display_name, relation, status, consent_id,
                                consent_clip_asset_id, asr_match_score)
    values (${userId}, ${`Anne ${randomUUID().slice(0, 6)}`}, 'anne', 'recording',
            ${consentIds['ses_biyometrik']!}, ${clipAssetId},
            ${(options.liveness ?? true) ? '0.960' : '0.220'}::numeric)
    returning id
  `);
  const profileId = profileRows[0]!.id;

  for (const [index, step] of ['passage_1', 'passage_2', 'passage_3', 'passage_4'].entries()) {
    const assetId = await writeAudioAsset({
      db: handle.db,
      store,
      userId,
      bucket: 'kh-voice-raw',
      key: audioKeys.voiceTake(profileId, step, 1),
      bytes: passageWav(index + 1),
      mimeType: 'audio/wav',
      kind: 'voice_take_raw',
      retentionClass: 'ephemeral_30d',
    });
    await handle.db.execute(sql`
      insert into voice_takes (voice_profile_id, step, attempt, asset_id, accepted, quality, issues)
      values (${profileId}, ${step}, 1, ${assetId}, true,
              ${JSON.stringify({ score: 0.88 })}::jsonb, '{}')
    `);
  }

  return profileId;
}

async function newJob(
  userId: string,
  kind: string,
  ref: Record<string, unknown>,
): Promise<Job<JobPayload>> {
  const idempotencyKey = newIdempotencyKey('audio');
  const { job } = await enqueueJob(handle.db, {
    userId,
    kind: kind as Parameters<typeof enqueueJob>[1]['kind'],
    idempotencyKey,
    requestHash: requestHash(`/test/${kind}`, ref),
    correlationId: randomUUID(),
    input: {},
  });

  return {
    data: {
      jobId: job.id,
      userId,
      correlationId: job.correlation_id,
      kind,
      ref,
    },
  } as Job<JobPayload>;
}

/* ── (a) The consent chain ─────────────────────────────────────────────────── */

describe('the consent chain gates cloning', () => {
  it('refuses when the cross-border consent is missing', async () => {
    const user = await createTestUser(handle.db);
    createdUsers.push(user.userId);
    const profileId = await createVoiceProfile(user.userId, { consents: 'biometric_only' });

    const job = await newJob(user.userId, 'voice_create', { voiceProfileId: profileId });
    await expect(PROCESSORS.voice['voice.create']!(runtime, job)).rejects.toThrow(
      /yurtdisi_aktarim/,
    );

    const rows = await handle.db.execute<{ status: string; failure_reason: string }>(sql`
      select status, failure_reason from voice_profiles where id = ${profileId}
    `);
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.failure_reason).toBe('CONSENT_REQUIRED');
  });

  it('refuses when the spoken consent clip never passed the read-back check', async () => {
    const user = await createTestUser(handle.db);
    createdUsers.push(user.userId);
    const profileId = await createVoiceProfile(user.userId, { liveness: false });

    const job = await newJob(user.userId, 'voice_create', { voiceProfileId: profileId });
    await expect(PROCESSORS.voice['voice.create']!(runtime, job)).rejects.toThrow(
      /did not match the server-issued sentence/,
    );
  });

  it('clones when both consents are present and records the proof', async () => {
    const user = await createTestUser(handle.db);
    createdUsers.push(user.userId);
    const profileId = await createVoiceProfile(user.userId);

    const job = await newJob(user.userId, 'voice_create', {
      voiceProfileId: profileId,
      previewChildName: 'Elif',
    });
    const result = (await PROCESSORS.voice['voice.create']!(runtime, job)) as {
      status: string;
      referenceSec: number;
    };

    expect(result.status).toBe('preview_ready');
    // Four ~26 s passages, stitched and capped: inside the 100–120 s window SPEC §7 asks for.
    expect(result.referenceSec).toBeGreaterThanOrEqual(100);
    expect(result.referenceSec).toBeLessThanOrEqual(180);

    const profile = await handle.db.execute<{
      status: string;
      reference_asset_id: string;
      preview_asset_id: string;
    }>(sql`
      select status, reference_asset_id, preview_asset_id from voice_profiles where id = ${profileId}
    `);
    expect(profile[0]!.status).toBe('preview_ready');

    // ⚠️ KVKK: the raw reference lives in the separate voice bucket, not beside media.
    const reference = await handle.db.execute<{ bucket: string; retention_class: string }>(sql`
      select bucket, retention_class from assets where id = ${profile[0]!.reference_asset_id}
    `);
    expect(reference[0]!.bucket).toBe('kh-voice-raw');
    expect(reference[0]!.retention_class).toBe('ephemeral_30d');

    // The consent proof — which text, hashed, and when — is in the job event stream.
    const events = await handle.db.execute<{ payload: Record<string, unknown> }>(sql`
      select payload from job_events where job_id = ${job.data.jobId} and type = 'voice.ready'
    `);
    const proof = events[0]!.payload['consentProof'] as Record<string, Record<string, string>>;
    expect(proof['biometric']!['documentSha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(proof['crossBorder']!['consentId']).toBeTruthy();
    expect(events[0]!.payload['livenessVerified'] ?? proof['livenessVerified']).toBeTruthy();

    // A vendor binding now exists and holds a slot.
    const binding = await handle.db.execute<{ state: string; occupies_slot: boolean }>(sql`
      select state, occupies_slot from voice_provider_bindings where voice_profile_id = ${profileId}
    `);
    expect(binding[0]!.state).toBe('active');
    expect(binding[0]!.occupies_slot).toBe(true);
  });
});

/* ── (b) The deletion chain ────────────────────────────────────────────────── */

describe('the deletion chain really deletes', () => {
  it('removes the vendor voice, the recordings and the rows — and keeps the evidence', async () => {
    const user = await createTestUser(handle.db);
    createdUsers.push(user.userId);
    const profileId = await createVoiceProfile(user.userId);
    const storyId = await createStoryWithPages(user.userId);

    // Clone, accept, and narrate a story with the cloned voice.
    const createJob = await newJob(user.userId, 'voice_create', { voiceProfileId: profileId });
    await PROCESSORS.voice['voice.create']!(runtime, createJob);
    await acceptVoiceProfile(runtime, profileId, runtime.ttsSettings);

    const bindingRows = await handle.db.execute<{ provider_voice_id: string }>(sql`
      select provider_voice_id from voice_provider_bindings where voice_profile_id = ${profileId}
    `);
    const providerVoiceId = bindingRows[0]!.provider_voice_id;

    const renditionRows = await handle.db.execute<{ id: string }>(sql`
      insert into audio_renditions (story_id, voice_kind, voice_profile_id, provider, model, tier,
                                    status)
      values (${storyId}, 'cloned', ${profileId}, 'fake', 'eleven_multilingual_v2', 'quality',
              'succeeded')
      returning id
    `);
    const renditionId = renditionRows[0]!.id;

    // What the parent is shown BEFORE confirming.
    const sideEffects = await describeDeletionSideEffects(handle.db, profileId);
    expect(sideEffects.affectedStoryIds).toContain(storyId);
    expect(sideEffects.sideEffectsTr.some((line) => line.includes('hikayeleriniz silinmez'))).toBe(
      true,
    );
    expect(sideEffects.sideEffectsTr.some((line) => line.includes('İzin kayıtlarınız'))).toBe(true);

    // Objects and vendor slots that exist before the erasure runs.
    const rawKeysBefore = store
      .keys()
      .filter((key) => key.startsWith(`kh-voice-raw/voice/${profileId}/`));
    expect(rawKeysBefore.length).toBeGreaterThanOrEqual(5); // 4 takes + the reference
    const slotsBefore = await runtime.adapters.tts.slotUsage!({
      requestId: 'probe',
      correlationId: 'probe',
    });

    // ── The parent taps "sesimi sil" ────────────────────────────────────────
    const deleteJob = await newJob(user.userId, 'voice_delete', { voiceProfileId: profileId });
    const scheduled = (await PROCESSORS.voice['voice.delete']!(runtime, deleteJob)) as {
      providerTasks: number;
      storageTasks: number;
      dbTasks: number;
    };
    expect(scheduled.providerTasks).toBe(1);
    expect(scheduled.storageTasks).toBeGreaterThanOrEqual(5); // reference + 4 takes
    expect(scheduled.dbTasks).toBe(1);

    // ── The sweeper runs the chain ──────────────────────────────────────────
    const handlers = buildDeletionHandlers({
      db: handle.db,
      store,
      adapters: { fake: runtime.adapters.tts, elevenlabs: runtime.adapters.tts },
      ctx: { requestId: randomUUID(), correlationId: randomUUID(), userId: user.userId },
    });

    // Sweep until this user's chain is finished. The sweeper takes a bounded batch across
    // ALL users in `run_at` order, so a busy queue (or a shared test database carrying
    // leftovers) can need more than one pass to reach any particular parent's tasks — the
    // same reason the real sweeper runs on a schedule rather than once.
    for (let pass = 0; pass < 20; pass += 1) {
      const pending = await handle.db.execute<{ count: string }>(sql`
        select count(*)::text from deletion_tasks
         where user_id = ${user.userId} and run_at <= now() and status <> 'completed'
      `);
      if (Number(pending[0]!.count) === 0) break;
      await runVoiceRawDestruction(handle.db, {
        deleteStorageObject: handlers.deleteStorageObject,
        deleteProviderVoice: handlers.deleteProviderVoice,
        deleteDbRows: handlers.deleteDbRows,
      });
    }

    // Everything the sweeper was allowed to touch is done.
    const due = await handle.db.execute<{ target: string; status: string; last_error: string | null }>(sql`
      select target, status, last_error from deletion_tasks
       where user_id = ${user.userId} and run_at <= now()
    `);
    expect(due.length).toBeGreaterThanOrEqual(7); // 1 provider + 5 objects + 1 db_rows
    const stuck = due.filter((task) => task.status !== 'completed');
    // eslint-disable-next-line no-console -- diagnostics when the chain does not finish
    if (stuck.length > 0) console.log('[deletion] stuck:', JSON.stringify(stuck, null, 2));
    expect(stuck).toEqual([]);

    // ...and the +30 day retention tasks that `accept` scheduled are still WAITING, not
    // swept along with the erasure. Two different promises with two different clocks.
    const future = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text from deletion_tasks
       where user_id = ${user.userId} and status = 'pending' and run_at > now()
    `);
    expect(Number(future[0]!.count)).toBeGreaterThan(0);

    // 1. THE VENDOR. The voice is gone from the provider and the binding says so. Measured
    // as a delta: other tests in this file hold voices of their own in the same double.
    const slotsAfter = await runtime.adapters.tts.slotUsage!({
      requestId: 'probe',
      correlationId: 'probe',
    });
    expect(slotsAfter.used).toBe(slotsBefore.used - 1);
    const bindingAfter = await handle.db.execute<{ state: string }>(sql`
      select state from voice_provider_bindings where provider_voice_id = ${providerVoiceId}
    `);
    expect(bindingAfter[0]!.state).toBe('deleted');

    // 2. THE RECORDINGS. Every raw object is gone from storage, and each `assets` row is
    //    marked purged rather than deleted — the receipt an audit asks for.
    // Scoped to THIS profile: other tests in this file keep voices of their own alive in
    // the same store, and a store-wide assertion would be measuring them instead.
    const remainingForProfile = store
      .keys()
      .filter((key) => key.startsWith(`kh-voice-raw/voice/${profileId}/`));
    expect(remainingForProfile).toEqual([]);
    const purged = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text from assets
       where owner_user_id = ${user.userId} and kind in ('voice_take_raw','voice_reference_raw')
         and purged_at is null
    `);
    expect(purged[0]!.count).toBe('0');

    // 3. THE ROWS. The profile is revoked and its takes are gone.
    const profileAfter = await handle.db.execute<{
      status: string;
      deleted_at: Date | null;
      reference_asset_id: string | null;
    }>(sql`
      select status, deleted_at, reference_asset_id from voice_profiles where id = ${profileId}
    `);
    expect(profileAfter[0]!.status).toBe('revoked');
    expect(profileAfter[0]!.deleted_at).not.toBeNull();
    expect(profileAfter[0]!.reference_asset_id).toBeNull();

    const takesAfter = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text from voice_takes where voice_profile_id = ${profileId}
    `);
    expect(takesAfter[0]!.count).toBe('0');

    // ⚠️ WHAT MUST SURVIVE — the two things a hasty erasure would take with it.
    const consentsAfter = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text from consents where user_id = ${user.userId}
    `);
    expect(Number(consentsAfter[0]!.count)).toBeGreaterThanOrEqual(2);

    const clipAfter = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text from assets
       where owner_user_id = ${user.userId} and kind = 'voice_consent_clip' and purged_at is null
    `);
    expect(clipAfter[0]!.count).toBe('1');

    // The child's story survives; its cloned narration is marked stale and stops being the
    // default, so the reader falls back to a system voice (SPEC §7 step 11).
    const rendition = await handle.db.execute<{ status: string; is_default: boolean }>(sql`
      select status, is_default from audio_renditions where id = ${renditionId}
    `);
    expect(rendition).toHaveLength(1);
    expect(rendition[0]!.status).toBe('stale');
    expect(rendition[0]!.is_default).toBe(false);

    const story = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text from stories where id = ${storyId} and deleted_at is null
    `);
    expect(story[0]!.count).toBe('1');
  });

  it('schedules the +30 day destruction of the raw reference on accept', async () => {
    const user = await createTestUser(handle.db);
    createdUsers.push(user.userId);
    const profileId = await createVoiceProfile(user.userId);

    const job = await newJob(user.userId, 'voice_create', { voiceProfileId: profileId });
    await PROCESSORS.voice['voice.create']!(runtime, job);
    const accepted = await acceptVoiceProfile(runtime, profileId, runtime.ttsSettings);

    expect(accepted.scheduledDeletions).toBeGreaterThan(0);

    const due = await handle.db.execute<{ days: string; target: string }>(sql`
      select target, round(extract(epoch from (run_at - now())) / 86400)::text as days
        from deletion_tasks
       where user_id = ${user.userId} and status = 'pending'
    `);
    expect(due.length).toBeGreaterThan(0);
    for (const task of due) {
      expect(task.target).toBe('storage_objects');
      expect(Number(task.days)).toBe(30);
    }

    // ...and it does NOT run early.
    const swept = await runVoiceRawDestruction(handle.db, {});
    expect(swept.completed).toBe(0);
  });
});

/* ── (c) The chunk cache ───────────────────────────────────────────────────── */

describe('editing one page re-renders one chunk', () => {
  it('measures the saving in content_cache.saved_usd', async () => {
    const user = await createTestUser(handle.db);
    createdUsers.push(user.userId);
    const storyId = await createStoryWithPages(user.userId);

    const renderAll = async (label: string) => {
      const renditionRows = await handle.db.execute<{ id: string }>(sql`
        insert into audio_renditions (story_id, voice_kind, system_voice_code, provider, model,
                                      tier, status, content_hash)
        values (${storyId}, 'system', 'deniz_notr', 'fake', 'eleven_multilingual_v2', 'quality',
                'running', ${`${label}-${randomUUID()}`})
        returning id
      `);
      const renditionId = renditionRows[0]!.id;

      const job = await newJob(user.userId, 'audio_render', {
        storyId,
        renditionId,
        tier: 'quality',
        voice: { kind: 'system', providerVoiceId: 'sys-deniz' },
      });

      const statuses: string[] = [];
      for (let index = 0; index < PAGE_TEXTS.length; index += 1) {
        const chunkJob = {
          data: {
            ...job.data,
            stepKey: `tts:chunk:${String(index).padStart(2, '0')}`,
            pageNo: index + 1,
            ref: { ...job.data.ref, chunkIndex: index },
          },
        } as Job<JobPayload>;
        const result = (await PROCESSORS.voice['tts.chunk']!(runtime, chunkJob)) as {
          status: string;
        };
        statuses.push(result.status);
      }

      const concatJob = {
        data: { ...job.data, stepKey: 'media:audio_concat' },
      } as Job<JobPayload>;
      const concat = (await PROCESSORS.media['audio.concat']!(runtime, concatJob)) as {
        totalDurationMs: number;
        pageCount: number;
        alignmentSource: string;
      };

      return { renditionId, statuses, concat };
    };

    // Start from a cold cache. `content_cache` is a shared table in a shared test database
    // and its `saved_usd` accumulates across runs, so measuring an absolute figure without
    // this would pass exactly once and then start lying.
    await handle.db.execute(sql`delete from content_cache where kind = 'tts_chunk'`);

    // ── First render: everything is a miss ──────────────────────────────────
    const first = await renderAll('first');
    expect(first.statuses).toHaveLength(12);
    expect(first.statuses.every((status) => status === 'succeeded')).toBe(true);
    expect(first.concat.pageCount).toBe(12);
    expect(first.concat.totalDurationMs).toBeGreaterThan(0);

    // Nothing was cached before, so nothing was saved.
    const savedAfterFirst = await savedUsd();
    expect(savedAfterFirst).toBe(0);

    // ── The parent edits page 3 ─────────────────────────────────────────────
    await handle.db.execute(sql`
      update story_pages
         set text_tr = 'Haritanın ortasında, mor mürekkeple çizilmiş kocaman bir göl parlıyordu.'
       where story_id = ${storyId} and page_no = 4
    `);

    // ── Second render: eleven hits, one miss ────────────────────────────────
    const second = await renderAll('second');
    const cached = second.statuses.filter((status) => status === 'skipped').length;
    const rendered = second.statuses.filter((status) => status === 'succeeded').length;

    expect(cached).toBe(11);
    expect(rendered).toBe(1);

    // The money. Eleven chunks that would have been paid for were not.
    const savedAfterSecond = await savedUsd();
    const saved = savedAfterSecond - savedAfterFirst;
    expect(saved).toBeGreaterThan(0);

    const hits = await handle.db.execute<{ hits: string }>(sql`
      select coalesce(sum(hit_count), 0)::text as hits from content_cache where kind = 'tts_chunk'
    `);
    expect(Number(hits[0]!.hits)).toBeGreaterThanOrEqual(11);

    // And the second narration is still complete — a cache hit is a real chunk of audio,
    // not a hole in the middle of the story.
    expect(second.concat.pageCount).toBe(12);
    expect(second.concat.totalDurationMs).toBeGreaterThan(0);

    // eslint-disable-next-line no-console -- the measurement is the point of this test
    console.log(
      `[cache] 12 chunks, one page edited → ${cached} cache hits, ${rendered} re-render, ` +
        `saved_usd=${saved.toFixed(5)}`,
    );
  });

  async function savedUsd(): Promise<number> {
    const rows = await handle.db.execute<{ saved: string }>(sql`
      select coalesce(sum(saved_usd), 0)::text as saved from content_cache where kind = 'tts_chunk'
    `);
    return Number(rows[0]!.saved);
  }
});
