-- S2–S7: groups, consents, org messenger, schedule publish, KB, push templates, medals eval

CREATE TABLE IF NOT EXISTS "participant_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "direction_id" integer,
  "capacity" integer DEFAULT 30,
  "created_at" timestamp DEFAULT now()
);

ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "group_assign_mode" varchar(20) DEFAULT 'list';
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "kb_unlock_threshold" integer DEFAULT 4;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "kb_unlock_disabled" boolean DEFAULT false;

ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "group_id" integer;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "group_name" varchar(255);
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "consent_pd_version" integer;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "consent_analytics_version" integer;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "push_opt_out" jsonb DEFAULT '{}';

CREATE TABLE IF NOT EXISTS "consent_texts" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" varchar(50) NOT NULL,
  "version" integer NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "is_active" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "consent_texts_kind_active_idx" ON "consent_texts" ("kind", "is_active");

CREATE TABLE IF NOT EXISTS "org_threads" (
  "id" serial PRIMARY KEY NOT NULL,
  "participant_id" integer NOT NULL,
  "subject" varchar(255),
  "status" varchar(50) DEFAULT 'waiting',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "org_threads_participant_idx" ON "org_threads" ("participant_id");
CREATE INDEX IF NOT EXISTS "org_threads_status_idx" ON "org_threads" ("status");

CREATE TABLE IF NOT EXISTS "org_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "thread_id" integer NOT NULL,
  "sender_type" varchar(50) NOT NULL,
  "sender_id" integer,
  "text" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "org_messages_thread_idx" ON "org_messages" ("thread_id");

CREATE TABLE IF NOT EXISTS "schedule_days" (
  "id" serial PRIMARY KEY NOT NULL,
  "day_number" integer NOT NULL UNIQUE,
  "is_published" boolean DEFAULT false,
  "published_at" timestamp
);

CREATE TABLE IF NOT EXISTS "schedule_day_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "day_number" integer NOT NULL,
  "version" integer NOT NULL,
  "events_snapshot" jsonb NOT NULL,
  "published_by_admin_id" integer,
  "published_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "schedule_day_versions_day_idx" ON "schedule_day_versions" ("day_number");

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "day_published" boolean DEFAULT false;

ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "direction" varchar(255);
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "tags" jsonb;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "is_general" boolean DEFAULT false;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "include_in_analytics" boolean DEFAULT true;

ALTER TABLE "exchange_answers" ADD COLUMN IF NOT EXISTS "parent_answer_id" integer;

CREATE TABLE IF NOT EXISTS "push_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(100) NOT NULL UNIQUE,
  "title" varchar(255),
  "body" text NOT NULL,
  "slot_key" varchar(50),
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "push_queue" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_id" integer,
  "text" text NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "status" varchar(50) DEFAULT 'pending',
  "target" varchar(50) DEFAULT 'all',
  "participant_ids" jsonb,
  "sent_at" timestamp,
  "created_by_admin_id" integer,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "push_queue_status_scheduled_idx" ON "push_queue" ("status", "scheduled_at");
