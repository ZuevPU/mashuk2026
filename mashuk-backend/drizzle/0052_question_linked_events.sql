ALTER TABLE "questions" ADD COLUMN "linked_event_ids" jsonb DEFAULT '[]'::jsonb;
