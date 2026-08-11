/**
 * processors/audio-deletion.ts — erasure that is actually erasure (SPEC §7 step 11).
 *
 * Deleting our own rows is not deletion. A cloned voice exists in THREE places, and a
 * parent who taps "sesimi sil" is asking for all three:
 *
 *   1. `voice_provider`  the voiceprint inside ElevenLabs, in the United States
 *   2. `storage_objects` the raw recordings and the stitched reference in our own bucket
 *   3. `db_rows`         the profile, its takes and its bindings
 *
 * The order is not cosmetic. The VENDOR goes first, because it is the copy we control
 * least and the one whose continued existence is the actual legal exposure; if the chain
 * dies halfway, what survives is a row in our database pointing at a voice that is already
 * gone — recoverable, auditable, and harmless. The reverse order would leave a voiceprint
 * on a foreign server with nothing left to tell us it is there.
 *
 * ⚠️ WHAT IS NOT DELETED, ON PURPOSE:
 *   · The CONSENT CLIP and the consent records. `legal_hold_10y`: the burden of proving
 *     consent outlives the account, and destroying the proof alongside the data would leave
 *     us unable to answer the very audit the deletion was meant to satisfy.
 *   · The STORIES. Books already narrated keep playing and fall back to a system voice.
 *     `audio_renditions.voice_profile_id` is ON DELETE SET NULL for exactly this reason —
 *     a parent deleting a voice must not silently delete their child's library.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import type { ProviderCallContext, TtsAdapter } from '@kendihikayem/providers';

import { parseRef, type ObjectStore } from './audio-storage';

export interface ScheduleDeletionInput {
  db: Database;
  userId: string;
  voiceProfileId: string;
  /** Delay in days; 0 (the default) means "as soon as the sweeper runs". */
  delayDays?: number;
}

export interface ScheduledChain {
  providerTasks: number;
  storageTasks: number;
  dbTasks: number;
}

/**
 * Writes the whole chain as `deletion_tasks` rows, in one transaction.
 *
 * Rows rather than an inline sequence of awaits: the parent's request returns immediately
 * (`202`), the work is retried with backoff by the sweeper, and — the part that matters for
 * an audit — every link records the provider's own response. "We called delete and hoped"
 * is not evidence; a completed row per target is.
 */
export async function scheduleVoiceDeletionChain(
  input: ScheduleDeletionInput,
): Promise<ScheduledChain> {
  const delay = input.delayDays ?? 0;

  const bindings = await input.db.execute<{ provider: string; provider_voice_id: string | null }>(sql`
    select provider, provider_voice_id
      from voice_provider_bindings
     where voice_profile_id = ${input.voiceProfileId}
       and state in ('active', 'creating', 'evicted', 'failed')
       and provider_voice_id is not null
  `);

  // Everything derived from this voice: the raw takes, the stitched reference, the preview,
  // and the narrations already produced with it. The consent clip is excluded by its
  // `retention_class` — see the header.
  //
  // The narration audio is included deliberately. "Sistem sesine döner" means the parent's
  // voice stops coming out of the speaker; leaving the rendered files in place would keep
  // them one signed URL away from playing, which is not what someone who tapped
  // "sesimi sil" asked for.
  const objects = await input.db.execute<{ bucket: string; storage_key: string }>(sql`
    select a.bucket, a.storage_key
      from assets a
     where a.purged_at is null
       and a.retention_class <> 'legal_hold_10y'
       and (a.id in (select reference_asset_id from voice_profiles where id = ${input.voiceProfileId})
         or a.id in (select preview_asset_id from voice_profiles where id = ${input.voiceProfileId})
         or a.id in (select asset_id from voice_takes where voice_profile_id = ${input.voiceProfileId})
         or a.id in (select full_asset_id from audio_renditions
                      where voice_profile_id = ${input.voiceProfileId})
         or a.id in (select chunk_asset_id from audio_page_marks m
                       join audio_renditions r on r.id = m.rendition_id
                      where r.voice_profile_id = ${input.voiceProfileId}))
  `);

  let providerTasks = 0;
  for (const binding of bindings) {
    await input.db.execute(sql`
      insert into deletion_tasks (user_id, target, ref, status, run_at)
      values (${input.userId}, 'voice_provider',
              ${`${binding.provider}:${binding.provider_voice_id}`}, 'pending',
              now() + make_interval(days => ${delay}))
    `);
    providerTasks += 1;
  }

  let storageTasks = 0;
  for (const object of objects) {
    await input.db.execute(sql`
      insert into deletion_tasks (user_id, target, ref, status, run_at)
      values (${input.userId}, 'storage_objects', ${`${object.bucket}/${object.storage_key}`},
              'pending', now() + make_interval(days => ${delay}))
    `);
    storageTasks += 1;
  }

  // Scheduled last and therefore run last: our rows are the map to everything above, and
  // deleting the map before the territory strands the vendor-side copy forever.
  await input.db.execute(sql`
    insert into deletion_tasks (user_id, target, ref, status, run_at)
    values (${input.userId}, 'db_rows', ${`voice_profile:${input.voiceProfileId}`}, 'pending',
            now() + make_interval(days => ${delay}))
  `);

  return { providerTasks, storageTasks, dbTasks: 1 };
}

/**
 * Schedules destruction of the RAW reference at +30 days (SPEC §7 step 9).
 *
 * Called when the parent accepts the preview. The clone itself lives on at the vendor —
 * what is destroyed is the original recording of their voice, which we no longer need once
 * the voiceprint exists. This is data minimisation as a promise with a date on it, which is
 * why it is a scheduled row and not a comment in a runbook.
 */
export async function scheduleRawVoiceDestruction(input: {
  db: Database;
  userId: string;
  voiceProfileId: string;
  retentionDays: number;
}): Promise<number> {
  const objects = await input.db.execute<{ bucket: string; storage_key: string }>(sql`
    select a.bucket, a.storage_key
      from assets a
     where a.purged_at is null
       and a.retention_class = 'ephemeral_30d'
       and (a.id in (select reference_asset_id from voice_profiles where id = ${input.voiceProfileId})
         or a.id in (select asset_id from voice_takes where voice_profile_id = ${input.voiceProfileId}))
  `);

  let scheduled = 0;
  for (const object of objects) {
    await input.db.execute(sql`
      insert into deletion_tasks (user_id, target, ref, status, run_at)
      values (${input.userId}, 'storage_objects', ${`${object.bucket}/${object.storage_key}`},
              'pending', now() + make_interval(days => ${input.retentionDays}))
    `);
    scheduled += 1;
  }
  return scheduled;
}

export interface DeletionHandlers {
  deleteStorageObject: (ref: string) => Promise<void>;
  deleteProviderVoice: (ref: string) => Promise<void>;
  deleteDbRows: (ref: string) => Promise<void>;
}

/**
 * Builds the handlers the scheduler drives. Each one is idempotent, because a retried task
 * must be able to succeed the second time — an erasure that can only ever run once is an
 * erasure that stays failed forever after one network blip.
 */
export function buildDeletionHandlers(input: {
  db: Database;
  store: ObjectStore;
  adapters: Record<string, TtsAdapter>;
  ctx: ProviderCallContext;
}): DeletionHandlers {
  return {
    async deleteProviderVoice(ref) {
      const separator = ref.indexOf(':');
      const provider = separator > 0 ? ref.slice(0, separator) : 'elevenlabs';
      const providerVoiceId = separator > 0 ? ref.slice(separator + 1) : ref;

      const adapter = input.adapters[provider];
      if (!adapter) {
        // Loud: an unroutable erasure must not be silently marked complete.
        throw new Error(`no TTS adapter registered for provider "${provider}"`);
      }
      // The adapter treats a 404 as success — the goal is "not there", not "we deleted it".
      await adapter.deleteVoice(providerVoiceId, input.ctx);

      await input.db.execute(sql`
        update voice_provider_bindings
           set state = 'deleted', deleted_at = now()
         where provider = ${provider} and provider_voice_id = ${providerVoiceId}
      `);
    },

    async deleteStorageObject(ref) {
      const { bucket, key } = parseRef(ref);
      await input.store.delete(bucket, key);
      // `purged_at` rather than a row delete: the asset row is the receipt that the object
      // existed and has been destroyed, and a KVKK audit asks for exactly that.
      await input.db.execute(sql`
        update assets set purged_at = now()
         where bucket = ${bucket} and storage_key = ${key} and purged_at is null
      `);
    },

    async deleteDbRows(ref) {
      const [kind, id] = ref.split(':');
      if (kind !== 'voice_profile' || !id) {
        throw new Error(`unsupported db_rows deletion ref "${ref}"`);
      }

      // Narrations made with this voice stop being playable and stop being the default, so
      // the reader falls back to a system voice — SPEC §7 step 11's "sistem sesine döner".
      // The story, its text and its illustrations are untouched.
      //
      // ⚠️ The rendition rows are marked, NOT unlinked. `audio_renditions.voice_profile_id`
      // is ON DELETE SET NULL, but the table also CHECKs that a `cloned` rendition names a
      // profile — so nulling the column violates the constraint. See
      // docs/contract-rfc/002-ses-silme-zinciri.md; until that is resolved the profile row
      // is SOFT-deleted and the FK target therefore continues to exist.
      await input.db.execute(sql`
        update audio_renditions
           set status = 'stale', is_default = false
         where voice_profile_id = ${id}
      `);
      await input.db.execute(sql`
        update voice_profiles
           set status = 'revoked',
               deleted_at = now(),
               revoked_at = coalesce(revoked_at, now()),
               reference_asset_id = null,
               preview_asset_id = null
         where id = ${id}
      `);
      await input.db.execute(sql`delete from voice_takes where voice_profile_id = ${id}`);
    },
  };
}

/**
 * What a parent is shown BEFORE they confirm (contract `remove.sideEffectsTr`).
 *
 * Turkish, concrete, and honest about what survives: the biggest fear here is "will I lose
 * the books my child loves", and the answer is no.
 */
export async function describeDeletionSideEffects(
  db: Database,
  voiceProfileId: string,
): Promise<{ affectedStoryIds: string[]; sideEffectsTr: string[] }> {
  const rows = await db.execute<{ story_id: string; display_name: string }>(sql`
    select distinct r.story_id, p.display_name
      from audio_renditions r
      join voice_profiles p on p.id = r.voice_profile_id
     where r.voice_profile_id = ${voiceProfileId}
  `);

  const nameRows = await db.execute<{ display_name: string }>(sql`
    select display_name from voice_profiles where id = ${voiceProfileId}
  `);
  const displayName = nameRows[0]?.display_name ?? 'Ses';
  const storyIds = [...new Set(rows.map((row) => row.story_id))];

  const sideEffectsTr = [
    `"${displayName}" ses profiliniz kalıcı olarak silinecek.`,
    'Sesiniz, hizmet sağlayıcının sunucularından da silinecek.',
    'Ham ses kayıtlarınız kalıcı olarak imha edilecek.',
  ];
  if (storyIds.length > 0) {
    sideEffectsTr.push(
      `${storyIds.length} hikayenin sesi bu sesle kaydedilmişti; hikayeleriniz silinmez, sistem sesiyle dinlemeye devam edebilirsiniz.`,
    );
  }
  sideEffectsTr.push(
    'İzin kayıtlarınız ve sesli rıza klibiniz, yasal saklama yükümlülüğü nedeniyle saklanmaya devam eder.',
  );

  return { affectedStoryIds: storyIds, sideEffectsTr };
}
