ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "answer_options" jsonb DEFAULT '[]'::jsonb;
