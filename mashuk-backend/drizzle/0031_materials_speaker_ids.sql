ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "speaker_ids" jsonb DEFAULT '[]'::jsonb;
