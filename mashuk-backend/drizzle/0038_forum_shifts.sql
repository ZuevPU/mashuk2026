-- Multi-shift foundation: shifts table, participants.shift_id, content scoping

CREATE TABLE IF NOT EXISTS "shifts" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "is_sandbox" boolean DEFAULT false NOT NULL,
  "start_date" timestamp,
  "total_days" integer DEFAULT 8,
  "current_day" integer DEFAULT 1,
  "recommendation_threshold" integer DEFAULT 1,
  "sections_visibility" jsonb DEFAULT '{}'::jsonb,
  "group_assign_mode" varchar(20) DEFAULT 'list',
  "kb_unlock_threshold" integer DEFAULT 4,
  "kb_unlock_disabled" boolean DEFAULT false,
  "kb_past_days_policy" varchar(20) DEFAULT 'locked',
  "push_block_types" jsonb DEFAULT '{}'::jsonb,
  "push_night_slot_enabled" boolean DEFAULT false,
  "team_confirm_hours_default" integer DEFAULT 24,
  "evening_questionnaire_config" jsonb,
  "evening_questionnaire_by_day" jsonb,
  "answer_confirmation" jsonb,
  "profile_progress_weights" jsonb,
  "shift_label" varchar(100),
  "pdf_template" jsonb,
  "recommendation_templates" jsonb,
  "role_diagnostics_config" jsonb,
  "leaderboard_scopes" jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "shifts_code_unique" UNIQUE("code")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shifts_one_active_idx" ON "shifts" ("status") WHERE "status" = 'active';

ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "active_shift_id" integer;

-- Seed three shifts from current forum_settings (sandbox = active for testing)
INSERT INTO "shifts" (
  "code", "name", "status", "is_sandbox",
  "start_date", "total_days", "current_day",
  "recommendation_threshold", "sections_visibility", "group_assign_mode",
  "kb_unlock_threshold", "kb_unlock_disabled", "kb_past_days_policy",
  "push_block_types", "push_night_slot_enabled", "team_confirm_hours_default",
  "evening_questionnaire_config", "evening_questionnaire_by_day", "answer_confirmation",
  "profile_progress_weights", "shift_label", "pdf_template", "recommendation_templates",
  "role_diagnostics_config", "leaderboard_scopes"
)
SELECT
  'sandbox',
  'Смена 0 · песочница',
  'active',
  true,
  fs."start_date",
  COALESCE(fs."total_days", 8),
  COALESCE(fs."current_day", 1),
  COALESCE(fs."recommendation_threshold", 1),
  COALESCE(fs."sections_visibility", '{}'::jsonb),
  COALESCE(fs."group_assign_mode", 'list'),
  COALESCE(fs."kb_unlock_threshold", 4),
  COALESCE(fs."kb_unlock_disabled", false),
  COALESCE(fs."kb_past_days_policy", 'locked'),
  COALESCE(fs."push_block_types", '{}'::jsonb),
  COALESCE(fs."push_night_slot_enabled", false),
  COALESCE(fs."team_confirm_hours_default", 24),
  fs."evening_questionnaire_config",
  fs."evening_questionnaire_by_day",
  fs."answer_confirmation",
  fs."profile_progress_weights",
  COALESCE(fs."shift_label", 'Песочница'),
  fs."pdf_template",
  fs."recommendation_templates",
  fs."role_diagnostics_config",
  fs."leaderboard_scopes"
FROM "forum_settings" fs
ORDER BY fs."id"
LIMIT 1
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "shifts" ("code", "name", "status", "is_sandbox", "total_days", "current_day", "shift_label")
VALUES
  ('shift1', 'Смена 1', 'draft', false, 8, 1, 'Смена 1'),
  ('shift2', 'Смена 2', 'draft', false, 8, 1, 'Смена 2')
ON CONFLICT ("code") DO NOTHING;

-- If no forum_settings row existed, still ensure sandbox
INSERT INTO "shifts" ("code", "name", "status", "is_sandbox", "total_days", "current_day", "shift_label")
SELECT 'sandbox', 'Смена 0 · песочница', 'active', true, 8, 1, 'Песочница'
WHERE NOT EXISTS (SELECT 1 FROM "shifts" WHERE "code" = 'sandbox');

UPDATE "forum_settings" fs
SET "active_shift_id" = (SELECT s."id" FROM "shifts" s WHERE s."status" = 'active' ORDER BY s."id" LIMIT 1)
WHERE fs."active_shift_id" IS NULL;

-- Participants → shift
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "shift_id" integer;

UPDATE "participants"
SET "shift_id" = (SELECT s."id" FROM "shifts" s WHERE s."status" = 'active' ORDER BY s."id" LIMIT 1)
WHERE "shift_id" IS NULL;

ALTER TABLE "participants" ALTER COLUMN "shift_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "participants" ADD CONSTRAINT "participants_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "shifts"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "participants" DROP CONSTRAINT IF EXISTS "participants_vk_id_unique";
ALTER TABLE "participants" DROP CONSTRAINT IF EXISTS "participants_vk_id_key";

DROP INDEX IF EXISTS "participants_vk_id_unique";
DROP INDEX IF EXISTS "participants_vk_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "participants_vk_id_shift_id_unique"
  ON "participants" ("vk_id", "shift_id");

CREATE INDEX IF NOT EXISTS "participants_shift_id_idx" ON "participants" ("shift_id");

-- Content tables: shift_id
ALTER TABLE "schedule_days" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "day_focus" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "participant_groups" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "day_experiments" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "admin_push_notifications" ADD COLUMN IF NOT EXISTS "shift_id" integer;

UPDATE "schedule_days" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "day_focus" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "events" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "questions" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "tasks" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "materials" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "participant_groups" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "day_experiments" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;
UPDATE "admin_push_notifications" SET "shift_id" = (SELECT id FROM "shifts" WHERE status = 'active' LIMIT 1) WHERE "shift_id" IS NULL;

ALTER TABLE "schedule_days" ALTER COLUMN "shift_id" SET NOT NULL;
ALTER TABLE "day_focus" ALTER COLUMN "shift_id" SET NOT NULL;
ALTER TABLE "events" ALTER COLUMN "shift_id" SET NOT NULL;
ALTER TABLE "questions" ALTER COLUMN "shift_id" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "shift_id" SET NOT NULL;
ALTER TABLE "materials" ALTER COLUMN "shift_id" SET NOT NULL;
ALTER TABLE "participant_groups" ALTER COLUMN "shift_id" SET NOT NULL;
ALTER TABLE "day_experiments" ALTER COLUMN "shift_id" SET NOT NULL;

-- Drop day_number global uniques → per-shift uniques
ALTER TABLE "schedule_days" DROP CONSTRAINT IF EXISTS "schedule_days_day_number_unique";
ALTER TABLE "schedule_days" DROP CONSTRAINT IF EXISTS "schedule_days_day_number_key";
DROP INDEX IF EXISTS "schedule_days_day_number_unique";
DROP INDEX IF EXISTS "schedule_days_day_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_days_shift_day_unique" ON "schedule_days" ("shift_id", "day_number");

ALTER TABLE "day_focus" DROP CONSTRAINT IF EXISTS "day_focus_day_number_unique";
ALTER TABLE "day_focus" DROP CONSTRAINT IF EXISTS "day_focus_day_number_key";
DROP INDEX IF EXISTS "day_focus_day_number_unique";
DROP INDEX IF EXISTS "day_focus_day_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "day_focus_shift_day_unique" ON "day_focus" ("shift_id", "day_number");

DROP INDEX IF EXISTS "day_experiments_day_role_unique_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "day_experiments_shift_day_role_unique"
  ON "day_experiments" ("shift_id", "day_number", "role_key");

CREATE INDEX IF NOT EXISTS "events_shift_id_idx" ON "events" ("shift_id");
CREATE INDEX IF NOT EXISTS "questions_shift_id_idx" ON "questions" ("shift_id");
CREATE INDEX IF NOT EXISTS "tasks_shift_id_idx" ON "tasks" ("shift_id");
CREATE INDEX IF NOT EXISTS "materials_shift_id_idx" ON "materials" ("shift_id");
CREATE INDEX IF NOT EXISTS "participant_groups_shift_id_idx" ON "participant_groups" ("shift_id");
CREATE INDEX IF NOT EXISTS "admin_push_notifications_shift_id_idx" ON "admin_push_notifications" ("shift_id");
