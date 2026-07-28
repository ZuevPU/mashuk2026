ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "leaderboard_scopes" jsonb DEFAULT '{"total":true,"path":true,"experience":true,"day":true,"shift":true}'::jsonb;
