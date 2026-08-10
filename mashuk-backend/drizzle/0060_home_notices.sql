CREATE TABLE IF NOT EXISTS "home_notices" (
  "id" serial PRIMARY KEY NOT NULL,
  "shift_id" integer NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "cta_url" text,
  "cta_label" varchar(120),
  "image_urls" jsonb DEFAULT '[]'::jsonb,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "published_at" timestamp,
  "visible_from" timestamp,
  "visible_until" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "home_notices_shift_id_idx" ON "home_notices" ("shift_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "home_notices_status_idx" ON "home_notices" ("status");
