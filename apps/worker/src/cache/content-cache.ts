/**
 * cache/content-cache.ts — regeneration avoided, in dollars.
 *
 * The scenario this exists for (SPEC §6.2 rule 4): a parent edits the text of page 3.
 * Only page 3's audio and illustration are regenerated; the other eleven chunks come back
 * from here at zero cost and zero wait. `saved_usd` accumulates what each hit avoided
 * paying, so the caching story can be audited against the vendor invoice instead of being
 * taken on faith.
 *
 * The key is `sha256(provider|model|op|params|prompt)` — see `jobs/hashing.ts`. Note the
 * model is part of the key: swapping the fill model must invalidate, or the parent gets a
 * page produced by a model they never paid for.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';

import { contentCacheKey } from '../jobs/hashing';

export type ContentCacheKind = 'image' | 'tts_chunk' | 'llm';

export interface CacheLookupInput {
  provider: string;
  model: string;
  operation: string;
  params: unknown;
  prompt: string;
}

export interface CacheHit<T> {
  hit: true;
  cacheKey: string;
  payload: T;
  assetId: string | null;
  /** What this call would have cost. Recorded as the saving. */
  savedUsd: number;
}

export interface CacheMiss {
  hit: false;
  cacheKey: string;
}

export type CacheLookup<T> = CacheHit<T> | CacheMiss;

export function cacheKeyFor(input: CacheLookupInput): string {
  return contentCacheKey(input);
}

/**
 * Looks up and, on a hit, atomically records the hit and the saving in one statement —
 * `hit_count` and `saved_usd` must not drift from the reads that caused them.
 */
export async function lookupContentCache<T>(
  db: Database,
  input: CacheLookupInput,
  wouldHaveCostUsd: number,
): Promise<CacheLookup<T>> {
  const cacheKey = cacheKeyFor(input);

  const rows = await db.execute<{ payload: T; asset_id: string | null }>(sql`
    update content_cache
       set hit_count = hit_count + 1,
           saved_usd = saved_usd + ${wouldHaveCostUsd.toFixed(5)}::numeric,
           last_hit_at = now()
     where cache_key = ${cacheKey}
    returning payload, asset_id
  `);

  const row = rows[0];
  if (!row) return { hit: false, cacheKey };

  return {
    hit: true,
    cacheKey,
    payload: row.payload,
    assetId: row.asset_id,
    savedUsd: wouldHaveCostUsd,
  };
}

/**
 * Stores a freshly produced artefact. `ON CONFLICT DO NOTHING`: two workers racing on the
 * same page produce byte-identical keys, and the loser simply keeps its own copy.
 */
export async function storeContentCache(
  db: Database,
  input: CacheLookupInput,
  entry: { kind: ContentCacheKind; payload: unknown; assetId?: string | null },
): Promise<string> {
  const cacheKey = cacheKeyFor(input);
  await db.execute(sql`
    insert into content_cache (cache_key, kind, asset_id, payload)
    values (${cacheKey}, ${entry.kind}, ${entry.assetId ?? null},
            ${JSON.stringify(entry.payload ?? {})}::jsonb)
    on conflict (cache_key) do nothing
  `);
  return cacheKey;
}

export type CacheSavingsRow = {
  kind: string;
  entries: number;
  hits: number;
  saved_usd: string;
};

/** Ops view: is the cache actually earning its keep? */
export async function cacheSavings(db: Database): Promise<CacheSavingsRow[]> {
  const rows = await db.execute<CacheSavingsRow>(sql`
    select kind,
           count(*)::int as entries,
           coalesce(sum(hit_count), 0)::int as hits,
           coalesce(sum(saved_usd), 0)::text as saved_usd
      from content_cache
     group by kind
     order by kind
  `);
  return [...rows];
}
