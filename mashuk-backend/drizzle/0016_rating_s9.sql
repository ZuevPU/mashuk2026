ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "bonus_points" integer DEFAULT 0;
ALTER TABLE "points_log" ADD COLUMN IF NOT EXISTS "forum_day" smallint;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "medal_task" boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS "points_log_forum_day_idx" ON "points_log" ("participant_id", "forum_day");
