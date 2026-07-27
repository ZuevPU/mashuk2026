ALTER TABLE "piggybank" ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "piggybank" ADD COLUMN IF NOT EXISTS "forum_day" smallint;

UPDATE "piggybank"
SET "tags" = jsonb_build_array("tag")
WHERE "tag" IS NOT NULL
  AND ("tags" IS NULL OR "tags" = '[]'::jsonb OR jsonb_array_length("tags") = 0);
