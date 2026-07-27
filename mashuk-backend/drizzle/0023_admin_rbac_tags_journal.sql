ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "full_name" varchar(255);
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "email" varchar(255);
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "direction_id" integer;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_email_unique" ON "admin_users" ("email") WHERE "email" IS NOT NULL;

ALTER TABLE "admin_actions_log" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
ALTER TABLE "admin_actions_log" ADD COLUMN IF NOT EXISTS "reviewed_by_admin_id" integer;
ALTER TABLE "admin_actions_log" ADD COLUMN IF NOT EXISTS "review_comment" text;

ALTER TABLE "thematic_tags" ADD COLUMN IF NOT EXISTS "slug" varchar(255);
ALTER TABLE "thematic_tags" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "thematic_tags" ADD COLUMN IF NOT EXISTS "color" varchar(32);
ALTER TABLE "thematic_tags" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE "thematic_tags" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
ALTER TABLE "thematic_tags" ADD COLUMN IF NOT EXISTS "application_types" jsonb DEFAULT '["events","interests"]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS "thematic_tags_slug_unique" ON "thematic_tags" ("slug") WHERE "slug" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "admin_role_permissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "role" varchar(50) NOT NULL,
  "section" varchar(64) NOT NULL,
  "can_read" boolean DEFAULT false NOT NULL,
  "can_create" boolean DEFAULT false NOT NULL,
  "can_update" boolean DEFAULT false NOT NULL,
  "can_delete" boolean DEFAULT false NOT NULL,
  "can_confirm" boolean DEFAULT false NOT NULL,
  "can_export" boolean DEFAULT false NOT NULL,
  CONSTRAINT "admin_role_permissions_role_section_unique" UNIQUE("role","section")
);

CREATE INDEX IF NOT EXISTS "admin_role_permissions_role_idx" ON "admin_role_permissions" ("role");
