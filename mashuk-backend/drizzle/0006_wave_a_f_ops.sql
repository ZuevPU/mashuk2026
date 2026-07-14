-- Wave A–C schema extensions

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "push_reminder" boolean DEFAULT true;
ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "question_text_snapshot" text;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "hide_from_leaderboard" boolean DEFAULT false;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "qr_token" varchar(64);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "qr_token" varchar(64);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "confirmation_type" varchar(50) DEFAULT 'text_photo';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "qr_token" varchar(64);
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "post_url" varchar(500);
ALTER TABLE "task_submissions" ADD COLUMN IF NOT EXISTS "team_member_ids" jsonb;

CREATE TABLE IF NOT EXISTS "admin_actions_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_id" integer,
  "admin_login" varchar(255),
  "action_type" varchar(100) NOT NULL,
  "section" varchar(100),
  "object_id" varchar(100),
  "old_value" jsonb,
  "new_value" jsonb,
  "comment" text,
  "ip" varchar(100),
  "is_critical" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "admin_actions_log_admin_idx" ON "admin_actions_log" ("admin_id", "created_at");
CREATE INDEX IF NOT EXISTS "admin_actions_log_critical_idx" ON "admin_actions_log" ("is_critical", "created_at");

CREATE TABLE IF NOT EXISTS "medals" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "condition_rule" text,
  "icon_url" varchar(500),
  "category" varchar(100),
  "level" varchar(50) DEFAULT 'bronze',
  "award_type" varchar(50) DEFAULT 'manual',
  "visibility" varchar(50) DEFAULT 'open',
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_medals" (
  "id" serial PRIMARY KEY NOT NULL,
  "participant_id" integer NOT NULL,
  "medal_id" integer NOT NULL,
  "awarded_at" timestamp DEFAULT now(),
  "awarded_by_admin_id" integer,
  "way" varchar(50) DEFAULT 'auto'
);
CREATE INDEX IF NOT EXISTS "user_medals_participant_idx" ON "user_medals" ("participant_id");

CREATE TABLE IF NOT EXISTS "pdf_whitelist" (
  "id" serial PRIMARY KEY NOT NULL,
  "participant_id" integer NOT NULL UNIQUE,
  "enabled" boolean DEFAULT true,
  "notes" text,
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "club_matches" (
  "id" serial PRIMARY KEY NOT NULL,
  "participant_id" integer,
  "answer_id" integer,
  "club_id" varchar(100),
  "similarity" integer,
  "verdict" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "delayed_survey" (
  "id" serial PRIMARY KEY NOT NULL,
  "participant_id" integer NOT NULL,
  "scheduled_at" timestamp,
  "sent_at" timestamp,
  "status" varchar(50) DEFAULT 'pending',
  "payload" jsonb
);
