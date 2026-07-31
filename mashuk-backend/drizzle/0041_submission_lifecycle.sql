ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "proof_type" varchar(32);
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "verification_type" varchar(32);
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "lifecycle_stage" varchar(32);
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "verified_at" timestamp;
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "verified_by_admin_id" integer;
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "verified_by_volunteer_vk_id" integer;
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "points_log_id" integer;
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "user_medal_id" integer;

ALTER TABLE "points_log" ADD COLUMN IF NOT EXISTS "submission_id" integer;
ALTER TABLE "user_medals" ADD COLUMN IF NOT EXISTS "submission_id" integer;

CREATE INDEX IF NOT EXISTS "task_submissions_lifecycle_stage_idx" ON "task_submissions" ("lifecycle_stage");
CREATE INDEX IF NOT EXISTS "points_log_submission_id_idx" ON "points_log" ("submission_id");
CREATE INDEX IF NOT EXISTS "user_medals_submission_id_idx" ON "user_medals" ("submission_id");

-- Backfill lifecycle from legacy status
UPDATE "task_submissions" SET "lifecycle_stage" = 'rejected' WHERE "status" = 'rejected' AND ("lifecycle_stage" IS NULL OR "lifecycle_stage" = '');
UPDATE "task_submissions" SET "lifecycle_stage" = 'expired' WHERE "status" = 'expired' AND ("lifecycle_stage" IS NULL OR "lifecycle_stage" = '');
UPDATE "task_submissions" SET "lifecycle_stage" = 'awaiting_confirm' WHERE "status" IN ('pending', 'pending_team') AND ("lifecycle_stage" IS NULL OR "lifecycle_stage" = '');
UPDATE "task_submissions" SET "lifecycle_stage" = 'points_awarded' WHERE "status" = 'approved' AND COALESCE("points_awarded", 0) > 0 AND ("lifecycle_stage" IS NULL OR "lifecycle_stage" = '');
UPDATE "task_submissions" SET "lifecycle_stage" = 'confirmed' WHERE "status" = 'approved' AND COALESCE("points_awarded", 0) = 0 AND ("lifecycle_stage" IS NULL OR "lifecycle_stage" = '');

UPDATE "task_submissions" SET "proof_type" = 'post' WHERE "proof_type" IS NULL AND "post_url" IS NOT NULL;
UPDATE "task_submissions" SET "proof_type" = 'photo' WHERE "proof_type" IS NULL AND "photo_url" IS NOT NULL;
UPDATE "task_submissions" SET "proof_type" = 'team' WHERE "proof_type" IS NULL AND "team_member_ids" IS NOT NULL AND "team_member_ids"::text NOT IN ('null', '[]');
UPDATE "task_submissions" SET "proof_type" = 'moderator' WHERE "proof_type" IS NULL AND "answer_text" IS NOT NULL AND TRIM("answer_text") <> '';
UPDATE "task_submissions" SET "proof_type" = 'qr' WHERE "proof_type" IS NULL AND "answer_text" ILIKE '%qr%';

UPDATE "task_submissions" SET "verification_type" = 'team_confirm' WHERE "verification_type" IS NULL AND "status" = 'pending_team';
UPDATE "task_submissions" SET "verification_type" = 'manual_moderator' WHERE "verification_type" IS NULL AND "status" = 'pending';
UPDATE "task_submissions" SET "verification_type" = 'auto' WHERE "verification_type" IS NULL AND "status" = 'approved' AND "moderator_comment" IS NULL;
UPDATE "task_submissions" SET "verification_type" = 'manual_volunteer' WHERE "verification_type" IS NULL AND "status" = 'approved' AND "moderator_comment" ILIKE '%волонт%';

UPDATE "task_submissions" SET "verified_at" = "checked_at" WHERE "verified_at" IS NULL AND "checked_at" IS NOT NULL;
