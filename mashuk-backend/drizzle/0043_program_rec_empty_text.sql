ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "program_rec_empty_no_match_text" text;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "program_rec_empty_no_events_text" text;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "program_rec_empty_no_match_text" text;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "program_rec_empty_no_events_text" text;
