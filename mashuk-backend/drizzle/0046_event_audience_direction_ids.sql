ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "audience_direction_ids" jsonb DEFAULT '[]'::jsonb;

UPDATE "events"
SET "audience_direction_ids" = jsonb_build_array("audience_direction_id")
WHERE "audience_type" = 'direction'
  AND "audience_direction_id" IS NOT NULL
  AND (
    "audience_direction_ids" IS NULL
    OR "audience_direction_ids" = '[]'::jsonb
    OR "audience_direction_ids" = 'null'::jsonb
  );
