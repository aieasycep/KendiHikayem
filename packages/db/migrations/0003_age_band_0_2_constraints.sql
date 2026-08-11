ALTER TABLE "children" DROP CONSTRAINT "children_age_band_check";--> statement-breakpoint
ALTER TABLE "stories" DROP CONSTRAINT "stories_age_band_check";--> statement-breakpoint
ALTER TABLE "system_voices" ALTER COLUMN "age_bands" SET DEFAULT '{"0-2","3-5","6-8"}';--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_age_band_check" CHECK ("children"."age_band" in ('0-2', '3-5', '6-8'));--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_age_band_check" CHECK ("stories"."age_band" in ('0-2', '3-5', '6-8'));