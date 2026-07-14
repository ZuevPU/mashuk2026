ALTER TABLE "forum_settings" ALTER COLUMN "total_days" SET DEFAULT 8;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "start_date" timestamp;
UPDATE "forum_settings" SET "total_days" = 8 WHERE "total_days" IS NULL OR "total_days" < 8;

ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "age" integer;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "workplace" varchar(500);
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "position" varchar(500);
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "consent_pd" boolean DEFAULT false;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "consent_analytics" boolean DEFAULT false;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "pedagogical_role" varchar(100);
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "goal_answers" jsonb;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "role_answers" jsonb;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp;

-- Existing participants without onboarding are treated as complete for backwards compatibility
UPDATE "participants" SET "onboarding_completed_at" = COALESCE("created_at", NOW())
WHERE "onboarding_completed_at" IS NULL AND "direction_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "pedagogical_roles" (
  "id" serial PRIMARY KEY NOT NULL,
  "role_key" varchar(100) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "quadrant" varchar(255),
  "essence" text,
  "in_class" text,
  "keywords" text,
  "sort_order" integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "day_experiments" (
  "id" serial PRIMARY KEY NOT NULL,
  "day_number" integer NOT NULL,
  "role_key" varchar(100) NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text,
  "hint" text
);

CREATE INDEX IF NOT EXISTS "day_experiments_day_role_idx" ON "day_experiments" ("day_number", "role_key");

CREATE TABLE IF NOT EXISTS "participant_day_state" (
  "id" serial PRIMARY KEY NOT NULL,
  "participant_id" integer NOT NULL,
  "day_number" integer NOT NULL,
  "active_role_key" varchar(100),
  "tomorrow_role_key" varchar(100),
  "experiment_status" varchar(50) DEFAULT 'none',
  "evening_ratings" jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "participant_day_state_participant_idx" ON "participant_day_state" ("participant_id");
CREATE INDEX IF NOT EXISTS "participant_day_state_unique_idx" ON "participant_day_state" ("participant_id", "day_number");
