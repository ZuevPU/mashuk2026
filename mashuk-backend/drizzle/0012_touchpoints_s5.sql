-- §5 Touchpoints: emotion zones stats, evening draft, questionnaire config
ALTER TABLE "daily_stats" ADD COLUMN IF NOT EXISTS "emotion_zones_distribution" jsonb;
ALTER TABLE "participant_day_state" ADD COLUMN IF NOT EXISTS "evening_draft" jsonb;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "evening_questionnaire_config" jsonb;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "evening_questionnaire_by_day" jsonb;
