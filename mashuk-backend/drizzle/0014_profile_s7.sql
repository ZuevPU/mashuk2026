ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "profile_progress_weights" jsonb;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "shift_label" varchar(100);
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "pdf_template" jsonb;
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "recommendation_templates" jsonb;

CREATE TABLE IF NOT EXISTS "participant_pdf_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "participant_id" integer NOT NULL UNIQUE,
  "blocks" jsonb DEFAULT '{}',
  "status" varchar(50) DEFAULT 'draft',
  "published_at" timestamp,
  "updated_at" timestamp DEFAULT now()
);
