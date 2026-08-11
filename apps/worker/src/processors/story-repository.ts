/**
 * processors/story-repository.ts — every read and write the story pipeline makes.
 *
 * Kept apart from the generation logic so that logic stays testable as a pure function of
 * its inputs, and so the SQL is reviewable in one place. Raw SQL rather than the query
 * builder, matching `jobs/repository.ts`: these are upserts with `ON CONFLICT` clauses that
 * read better as SQL than as a builder chain.
 *
 * Two invariants the writes here protect:
 *   · `story_pages.text_sha256` is the TTS cache key and `prompt_sha256` the image one. A
 *     page written without its hash silently disables the cache for that page (SPEC §6.2).
 *   · Every moderation decision lands in `moderation_events`, pass or block. A gate with no
 *     record of what it allowed is not auditable.
 */

import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import type { AgeBand } from '@kendihikayem/contract';
import type { SafetyStage, SafetySurface, SafetyViolation } from '@kendihikayem/safety';

export interface StoryContext {
  id: string;
  userId: string;
  childId: string | null;
  heroName: string;
  ageBand: AgeBand;
  pageCount: number;
  themeCode: string | null;
  artStyleCode: string;
  religiousOptIn: boolean;
  culturalTags: string[];
  status: string;
  titleTr: string | null;
  lessonTr: string | null;
  /** SANITISED parent input as stored by the API (`stories.request_input`). */
  requestInput: Record<string, unknown>;
  outline: StoredOutline | null;
}

export interface StoredOutlineScene {
  pageNo: number;
  summaryTr: string;
  emotion: string;
}

export interface StoredOutline {
  titleTr: string;
  lessonTr: string;
  scenes: StoredOutlineScene[];
  characters?: Array<{ role: string; nameTr: string; canonEn: string }>;
  variants?: Array<{ id: string; summaryTr: string; promptEn: string }>;
  cover?: { summaryTr: string; promptEn: string };
}

type StoryRow = {
  id: string;
  user_id: string;
  child_id: string | null;
  hero_name: string;
  age_band: AgeBand;
  page_count: number;
  theme_code: string | null;
  art_style_code: string;
  religious_opt_in: boolean;
  cultural_tags: string[] | null;
  status: string;
  title: string | null;
  lesson_tr: string | null;
  request_input: Record<string, unknown> | null;
  outline: StoredOutline | null;
};

export async function loadStoryContext(
  db: Database,
  storyId: string,
): Promise<StoryContext | null> {
  const rows = await db.execute<StoryRow>(sql`
    select id, user_id, child_id, hero_name, age_band, page_count, theme_code, art_style_code,
           religious_opt_in, cultural_tags, status, title, lesson_tr, request_input, outline
      from stories
     where id = ${storyId} and deleted_at is null
  `);
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    childId: row.child_id,
    heroName: row.hero_name,
    ageBand: row.age_band,
    pageCount: row.page_count,
    themeCode: row.theme_code,
    artStyleCode: row.art_style_code,
    religiousOptIn: row.religious_opt_in,
    culturalTags: row.cultural_tags ?? [],
    status: row.status,
    titleTr: row.title,
    lessonTr: row.lesson_tr,
    requestInput: row.request_input ?? {},
    outline: row.outline,
  };
}

export async function setStoryStatus(
  db: Database,
  storyId: string,
  status: string,
  patch: { readyAt?: boolean; safety?: Record<string, unknown> } = {},
): Promise<void> {
  await db.execute(sql`
    update stories
       set status = ${status},
           ready_at = ${patch.readyAt ? sql`now()` : sql`ready_at`},
           safety = ${patch.safety === undefined ? sql`safety` : sql`${JSON.stringify(patch.safety)}::jsonb`},
           updated_at = now()
     where id = ${storyId}
  `);
}

export interface SaveOutlineInput {
  storyId: string;
  outline: StoredOutline;
  modelMeta: Record<string, unknown>;
  /** Only the visual-consistency canon; the sheets themselves are A4's job. */
  characters: Array<{ role: string; nameTr: string; canonEn: string; isPrimary: boolean }>;
  variants: Array<{ id: string; summaryTr: string; promptEn: string }>;
}

/**
 * Writes stage 1's result. Pages are created here with their scene summary and emotion but
 * NO text: that is what makes the approval screen renderable for three cents, and what
 * stage 2 fills in.
 */
export async function saveOutline(db: Database, input: SaveOutlineInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update stories
         set title = ${input.outline.titleTr},
             lesson_tr = ${input.outline.lessonTr},
             outline = ${JSON.stringify(input.outline)}::jsonb,
             model_meta = ${JSON.stringify(input.modelMeta)}::jsonb,
             status = 'outline_ready',
             updated_at = now()
       where id = ${input.storyId}
    `);

    for (const scene of input.outline.scenes) {
      await tx.execute(sql`
        insert into story_pages (story_id, page_no, scene_summary_tr, emotion, text_safe_zone)
        values (${input.storyId}, ${scene.pageNo}, ${scene.summaryTr}, ${scene.emotion}, 'bottom')
        on conflict (story_id, page_no) do update
           set scene_summary_tr = excluded.scene_summary_tr,
               emotion = excluded.emotion,
               updated_at = now()
      `);
    }

    // Re-running stage 1 (the parent rejected the first skeleton) replaces the cast rather
    // than accumulating one.
    await tx.execute(sql`delete from story_characters where story_id = ${input.storyId}`);
    for (const character of input.characters) {
      const variants = character.isPrimary ? input.variants : [];
      await tx.execute(sql`
        insert into story_characters (story_id, role, name_tr, canon_en, sheet_variants, is_primary)
        values (${input.storyId}, ${character.role}, ${character.nameTr}, ${character.canonEn},
                ${JSON.stringify({ variants })}::jsonb, ${character.isPrimary})
      `);
    }
  });
}

export interface SavePageInput {
  pageNo: number;
  textTr: string;
}

/** Stage 2's result: the pages, their hashes and their word counts. */
export async function savePages(
  db: Database,
  storyId: string,
  pages: readonly SavePageInput[],
  options: { source?: 'ai' | 'ai_rewrite' | 'user'; userId?: string } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const page of pages) {
      const textSha = sha256(page.textTr);
      const wordCount = countWords(page.textTr);

      const updated = await tx.execute<{ id: string }>(sql`
        update story_pages
           set text_tr = ${page.textTr},
               text_sha256 = ${textSha},
               word_count = ${wordCount},
               edited_by_user = ${options.source === 'user'},
               updated_at = now()
         where story_id = ${storyId} and page_no = ${page.pageNo}
        returning id
      `);

      const pageId = updated[0]?.id;
      if (!pageId) {
        // Stage 1 always creates the rows; a missing one means the outline and the fill
        // disagree about page count, which must not silently drop a page.
        throw new Error(`story_pages row missing for story ${storyId} page ${page.pageNo}`);
      }

      // Append-only history so a parent's edit — and our own rewrite — is reversible.
      await tx.execute(sql`
        insert into story_page_revisions (page_id, revision, text_tr, source, created_by)
        select ${pageId},
               coalesce(max(revision), 0) + 1,
               ${page.textTr},
               ${options.source ?? 'ai'},
               ${options.userId ?? null}
          from story_page_revisions where page_id = ${pageId}
        on conflict (page_id, revision) do nothing
      `);
    }
  });
}

export interface StoryPageRow {
  pageNo: number;
  textTr: string | null;
  summaryTr: string | null;
  emotion: string | null;
}

export async function loadStoryPages(db: Database, storyId: string): Promise<StoryPageRow[]> {
  const rows = await db.execute<{
    page_no: number;
    text_tr: string | null;
    scene_summary_tr: string | null;
    emotion: string | null;
  }>(sql`
    select page_no, text_tr, scene_summary_tr, emotion
      from story_pages where story_id = ${storyId} order by page_no
  `);
  return rows.map((row) => ({
    pageNo: row.page_no,
    textTr: row.text_tr,
    summaryTr: row.scene_summary_tr,
    emotion: row.emotion,
  }));
}

/* ── audit trail ───────────────────────────────────────────────────────────── */

export interface ModerationEventInput {
  userId?: string | null;
  storyId?: string | null;
  pageNo?: number | null;
  surface: SafetySurface;
  stage: SafetyStage;
  engine: string;
  verdict: 'pass' | 'flag' | 'block';
  categories?: Record<string, unknown>;
  scores?: Record<string, unknown>;
  excerpt?: string | null;
  actionTaken?: 'none' | 'retry' | 'regenerate' | 'manual_review' | 'account_flag';
}

export async function recordModerationEvent(
  db: Database,
  input: ModerationEventInput,
): Promise<void> {
  await db.execute(sql`
    insert into moderation_events
      (user_id, story_id, page_no, surface, stage, engine, verdict, categories, scores, excerpt, action_taken)
    values
      (${input.userId ?? null}, ${input.storyId ?? null}, ${input.pageNo ?? null},
       ${input.surface}, ${input.stage}, ${input.engine}, ${input.verdict},
       ${JSON.stringify(input.categories ?? {})}::jsonb,
       ${JSON.stringify(input.scores ?? {})}::jsonb,
       ${input.excerpt ?? null}, ${input.actionTaken ?? 'none'})
  `);
}

/**
 * One row per violation, plus one summary row when everything passed. A clean generation
 * has to leave a trace too — otherwise "no events" is ambiguous between "we checked and it
 * was fine" and "we never checked".
 */
export async function recordViolations(
  db: Database,
  base: Omit<ModerationEventInput, 'verdict' | 'engine' | 'excerpt' | 'pageNo'>,
  violations: readonly SafetyViolation[],
  action: ModerationEventInput['actionTaken'] = 'none',
): Promise<void> {
  if (violations.length === 0) {
    await recordModerationEvent(db, { ...base, engine: 'deterministic', verdict: 'pass' });
    return;
  }
  for (const violation of violations) {
    await recordModerationEvent(db, {
      ...base,
      engine: violation.engine,
      verdict: violation.severity === 'block' ? 'block' : 'flag',
      categories: { code: violation.code },
      scores: {},
      excerpt: violation.excerpt ?? violation.detail ?? null,
      pageNo: violation.pageNo ?? null,
      actionTaken: action,
    });
  }
}

export interface AuditInput {
  actorType: 'user' | 'system' | 'admin' | 'provider';
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  traceId?: string;
}

export async function recordAudit(db: Database, input: AuditInput): Promise<void> {
  await db.execute(sql`
    insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, before, after, trace_id)
    values (${input.actorType}, ${input.actorId ?? null}, ${input.action},
            ${input.entityType ?? null}, ${input.entityId ?? null},
            ${input.before ? JSON.stringify(input.before) : null}::jsonb,
            ${input.after ? JSON.stringify(input.after) : null}::jsonb,
            ${input.traceId ?? null})
  `);
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function countWords(text: string): number {
  return (text.match(/[a-zA-ZçğıiöşüÇĞİÖŞÜ0-9]+(?:['’][a-zA-ZçğıiöşüÇĞİÖŞÜ]+)?/gu) ?? []).length;
}
