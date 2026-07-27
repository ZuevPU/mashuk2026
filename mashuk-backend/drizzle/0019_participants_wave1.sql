ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "is_blocked" boolean DEFAULT false;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "block_reason" varchar(500);
