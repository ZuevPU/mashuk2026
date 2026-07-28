ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(500);
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "avatar_synced_at" timestamp;
