-- Delayed survey responses, per-shift medals/levels, delayed_survey response columns

ALTER TABLE "delayed_survey" ADD COLUMN IF NOT EXISTS "response" jsonb;
ALTER TABLE "delayed_survey" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;

ALTER TABLE "medals" ADD COLUMN IF NOT EXISTS "shift_id" integer;
CREATE INDEX IF NOT EXISTS "medals_shift_id_idx" ON "medals" ("shift_id");

ALTER TABLE "levels_config" ADD COLUMN IF NOT EXISTS "shift_id" integer;
CREATE INDEX IF NOT EXISTS "levels_config_shift_id_idx" ON "levels_config" ("shift_id");
