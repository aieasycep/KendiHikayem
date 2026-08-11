-- Age bands moved from {3-5, 6-8, 9-12} to {0-2, 3-5, 6-8}: the product now starts at
-- birth and stops at the end of early reading. This migration only moves DATA; the CHECK
-- constraints themselves are replaced by the generated migration that follows it. Order
-- matters — a row still holding '9-12' would fail the new constraint, so it must be
-- rewritten first.
--
-- '9-12' collapses into '6-8' (the closest surviving band) rather than being deleted:
-- a parent's existing child profile and their finished stories must keep working.

UPDATE "children" SET "age_band" = '6-8' WHERE "age_band" = '9-12';
--> statement-breakpoint
UPDATE "stories" SET "age_band" = '6-8' WHERE "age_band" = '9-12';
--> statement-breakpoint

-- Catalogue arrays have no CHECK, but a stale '9-12' entry would silently widen a theme
-- to a band that no longer exists. Rewrite then de-duplicate.
UPDATE "story_themes"
SET "age_bands" = (
  SELECT array_agg(DISTINCT band ORDER BY band)
  FROM unnest("age_bands") AS band
  WHERE band <> '9-12'
)
WHERE '9-12' = ANY("age_bands");
--> statement-breakpoint
UPDATE "story_themes"
SET "age_bands" = array_append("age_bands", '6-8')
WHERE NOT ('6-8' = ANY("age_bands")) AND cardinality("age_bands") = 0;
--> statement-breakpoint
UPDATE "system_voices"
SET "age_bands" = (
  SELECT array_agg(DISTINCT band ORDER BY band)
  FROM unnest("age_bands") AS band
  WHERE band <> '9-12'
)
WHERE '9-12' = ANY("age_bands");
--> statement-breakpoint
UPDATE "system_voices"
SET "age_bands" = ARRAY['6-8']
WHERE cardinality("age_bands") = 0;
