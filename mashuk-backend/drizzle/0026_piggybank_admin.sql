ALTER TABLE "piggybank" ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false;
ALTER TABLE "piggybank" ADD COLUMN IF NOT EXISTS "is_violation" boolean DEFAULT false;
ALTER TABLE "piggybank" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
