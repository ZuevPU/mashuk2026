-- v11: Point B mirror + admin-editable profile blocks
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "point_b_answers" jsonb;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "strong_role" varchar(100);
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "growth_role" varchar(100);
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "next_experiment" text;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "outcomes_edited" jsonb;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "next_steps_edited" jsonb;
