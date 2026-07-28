ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "forum_points" integer DEFAULT 0;

UPDATE "participants"
SET "forum_points" = COALESCE("path_points", 0) + COALESCE("experience_points", 0) + COALESCE("bonus_points", 0)
WHERE "forum_points" IS NULL OR "forum_points" = 0;
