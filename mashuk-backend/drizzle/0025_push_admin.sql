-- §8 Admin push campaigns, in-app banners, preset templates

ALTER TABLE "push_templates" ADD COLUMN IF NOT EXISTS "kind" varchar(32) DEFAULT 'auto_slot';
ALTER TABLE "push_templates" ADD COLUMN IF NOT EXISTS "preset_category" varchar(50);
ALTER TABLE "push_templates" ADD COLUMN IF NOT EXISTS "push_title" varchar(255);
ALTER TABLE "push_templates" ADD COLUMN IF NOT EXISTS "icon" varchar(32);
ALTER TABLE "push_templates" ADD COLUMN IF NOT EXISTS "notification_type" varchar(50);

UPDATE "push_templates" SET "kind" = 'auto_slot' WHERE "slot_key" IS NOT NULL AND ("kind" IS NULL OR "kind" = 'auto_slot');

CREATE TABLE IF NOT EXISTS "admin_push_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "internal_name" varchar(255),
  "push_title" varchar(255),
  "body" text NOT NULL,
  "icon" varchar(32),
  "image_url" text,
  "notification_type" varchar(50) DEFAULT 'reminder',
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "program_day" integer,
  "program_date" timestamp,
  "publish_at" timestamp,
  "visible_until" timestamp,
  "send_mode" varchar(32) DEFAULT 'now',
  "trigger_config" jsonb DEFAULT '{}',
  "trigger_fired_at" timestamp,
  "audience_type" varchar(32) DEFAULT 'all',
  "audience_payload" jsonb DEFAULT '{}',
  "template_id" integer,
  "created_by_admin_id" integer,
  "sent_at" timestamp,
  "delivered_count" integer DEFAULT 0,
  "opened_count" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "admin_push_notifications_status_idx" ON "admin_push_notifications" ("status");
CREATE INDEX IF NOT EXISTS "admin_push_notifications_publish_at_idx" ON "admin_push_notifications" ("publish_at");

CREATE TABLE IF NOT EXISTS "participant_push_deliveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "notification_id" integer NOT NULL,
  "participant_id" integer NOT NULL,
  "personalized_body" text NOT NULL,
  "push_title" varchar(255),
  "icon" varchar(32),
  "image_url" text,
  "visible_until" timestamp,
  "vk_delivery_status" varchar(64),
  "opened_at" timestamp,
  "dismissed_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "participant_push_deliveries_participant_idx" ON "participant_push_deliveries" ("participant_id");
CREATE INDEX IF NOT EXISTS "participant_push_deliveries_notification_idx" ON "participant_push_deliveries" ("notification_id");

ALTER TABLE "push_log" ADD COLUMN IF NOT EXISTS "notification_id" integer;
ALTER TABLE "push_log" ADD COLUMN IF NOT EXISTS "delivery_id" integer;

CREATE TABLE IF NOT EXISTS "push_trigger_fires" (
  "id" serial PRIMARY KEY NOT NULL,
  "notification_id" integer NOT NULL,
  "fire_key" varchar(255) NOT NULL,
  "fired_at" timestamp DEFAULT now(),
  UNIQUE("notification_id", "fire_key")
);

-- Migrate legacy push_queue pending rows into admin_push_notifications
INSERT INTO "admin_push_notifications" (
  "internal_name", "body", "status", "publish_at", "send_mode",
  "audience_type", "audience_payload", "template_id", "created_by_admin_id", "sent_at", "notification_type"
)
SELECT
  'Очередь #' || q.id,
  q.text,
  CASE WHEN q.status = 'pending' THEN 'queued' WHEN q.status = 'sent' THEN 'sent' ELSE 'cancelled' END,
  q.scheduled_at,
  'scheduled',
  CASE WHEN q.target = 'ids' THEN 'ids' ELSE 'all' END,
  CASE WHEN q.target = 'ids' AND q.participant_ids IS NOT NULL
    THEN jsonb_build_object('participantIds', q.participant_ids)
    ELSE '{}'::jsonb END,
  q.template_id,
  q.created_by_admin_id,
  q.sent_at,
  'reminder'
FROM "push_queue" q
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_push_notifications" n
  WHERE n.internal_name = 'Очередь #' || q.id
);
