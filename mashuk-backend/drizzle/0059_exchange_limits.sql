ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "exchange_limits" jsonb;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "exchange_limits" jsonb;
