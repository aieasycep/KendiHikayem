/**
 * Story creation (S06 / W07 → AŞAMA 1).
 *
 * Only the cheap outline is generated here (~$0.03). The expensive fill+images
 * stage starts exclusively behind ⏸ KAPI 1 (S09) — `approveOutline`.
 *
 * IDEMPOTENCY RULE: the caller creates ONE key per user intent (button press
 * session) and passes the same key on every retry; a retry after a network
 * error must not create a second story or charge twice.
 */

import type { z } from 'zod';

import type { CostPreview, JobRef, createStoryReqSchema } from '@kendihikayem/contract';

import { api, asApiError, toApiError } from '../../lib/api';
import type { WizardDraft } from './draft';

/**
 * Request-side type: `z.input` — branded ids accept plain strings on the way in
 * (contract primitives: "istemci gövde alanlarına düz string yazabilir").
 */
type CreateStoryInput = z.input<typeof createStoryReqSchema>;

export interface CreatedStory {
  storyId: string;
  job: JobRef;
  creditCost: number;
  fullCostPreview: CostPreview;
}

export function draftToCreateReq(draft: WizardDraft): CreateStoryInput {
  return {
    ...(draft.childId !== undefined ? { childId: draft.childId } : {}),
    hero: {
      name: draft.heroName.trim() === '' ? draft.childName.trim() : draft.heroName.trim(),
      isChild: draft.heroIsChild,
    },
    ageBand: draft.ageBand,
    ...(draft.themeCode !== undefined ? { themeCode: draft.themeCode } : {}),
    ...(draft.freeIdeaTr !== undefined && draft.freeIdeaTr.trim() !== ''
      ? { freeIdeaTr: draft.freeIdeaTr.trim() }
      : {}),
    artStyleCode: draft.artStyleCode ?? 'suluboya',
    pageCount: draft.pageCount,
    characterBuilder: draft.characterBuilder,
    ...(draft.lessonHintTr !== undefined && draft.lessonHintTr.trim() !== ''
      ? { lessonHintTr: draft.lessonHintTr.trim() }
      : {}),
    ...(draft.culturalTags.length > 0 ? { culturalTags: draft.culturalTags.slice(0, 4) } : {}),
    religiousOptIn: draft.religiousOptIn,
    ...(draft.reuseCharacterId !== undefined
      ? { reuseCharacterId: draft.reuseCharacterId }
      : {}),
  };
}

/** Throws `ApiError` (messageTr user-ready) on any failure. */
export async function createStory(
  draft: WizardDraft,
  idempotencyKey: string,
): Promise<CreatedStory> {
  try {
    const res = await api().stories.create({
      body: draftToCreateReq(draft),
      headers: { 'idempotency-key': idempotencyKey },
    });
    if (res.status !== 202) throw asApiError(res.body);
    return {
      storyId: res.body.storyId as string,
      job: res.body.job,
      creditCost: res.body.creditCost,
      fullCostPreview: res.body.fullCostPreview,
    };
  } catch (error) {
    throw toApiError(error);
  }
}
