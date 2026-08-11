/**
 * §12 DENETİM — the audit log.
 *
 * Separate from `moderation_events` and from `outbox` because its retention and its
 * audience differ: this is what a regulator or an incident review reads. `before`/`after`
 * hold the changed subset of the row, never the whole row, and never a secret.
 *
 * `actor_id` has no foreign key on purpose — an audit entry must survive the deletion of
 * the actor it describes.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.12.
 */
import { bigserial, check, index, inet, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { AUDIT_ACTOR_TYPE, type JsonObject, inValues, tstz } from './types';

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorType: text('actor_type').notNull(),
    /** Intentionally FK-free: the log outlives the actor. */
    actorId: uuid('actor_id'),
    /** Dotted verb, e.g. 'voice_profile.created'. */
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    before: jsonb('before').$type<JsonObject>(),
    after: jsonb('after').$type<JsonObject>(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    traceId: text('trace_id'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('audit_log_actor_type_check', inValues(t.actorType, AUDIT_ACTOR_TYPE)),
    index('audit_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc()),
  ],
);
