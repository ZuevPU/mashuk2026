CREATE TABLE IF NOT EXISTS "task_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL UNIQUE,
  "icon_key" varchar(64),
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now()
);

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "category_id" integer REFERENCES "task_categories"("id");
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'draft';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "scope_type" varchar(32) DEFAULT 'individual';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "confirmation_methods" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "day_numbers" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "available_from" timestamp;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "available_to" timestamp;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "application_deadline" timestamp;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "program_place_id" integer REFERENCES "program_places"("id");
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "nomination" varchar(64);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "icon_key" varchar(64);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description_html" text;

CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("status");
CREATE INDEX IF NOT EXISTS "tasks_category_id_idx" ON "tasks" ("category_id");

-- Seed default categories (11 slots; names editable in admin)
INSERT INTO "task_categories" ("name", "icon_key", "sort_order") VALUES
  ('Образование', 'education', 1),
  ('Полезные знакомства/общение', 'network', 2),
  ('Медиа', 'media', 3),
  ('Спорт', 'sport', 4),
  ('Креатив', 'creative', 5),
  ('Организация', 'org', 6),
  ('Культура', 'culture', 7),
  ('Волонтёрство', 'volunteer', 8),
  ('Командная работа', 'team', 9),
  ('Выездная активность', 'trip', 10),
  ('Инсайты и рефлексия', 'insight', 11)
ON CONFLICT ("name") DO NOTHING;

-- Link tasks.category text to task_categories
UPDATE "tasks" t SET "category_id" = c.id
FROM "task_categories" c
WHERE t."category_id" IS NULL AND t."category" IS NOT NULL AND trim(t."category") = c."name";

UPDATE "tasks" t SET "category_id" = c.id
FROM "task_categories" c
WHERE t."category_id" IS NULL AND lower(trim(t."category")) IN ('нетворкинг', 'networking', 'знакомства')
  AND c."name" = 'Полезные знакомства/общение';

-- day_numbers from day_number
UPDATE "tasks" SET "day_numbers" = jsonb_build_array("day_number")
WHERE ("day_numbers" IS NULL OR "day_numbers" = '[]'::jsonb) AND "day_number" IS NOT NULL;

-- confirmation_methods from legacy confirmation_type
UPDATE "tasks" SET "confirmation_methods" = CASE
  WHEN "confirmation_type" = 'qr' THEN '["qr"]'::jsonb
  WHEN "confirmation_type" = 'photo' THEN '["photo"]'::jsonb
  WHEN "confirmation_type" = 'post_url' THEN '["link"]'::jsonb
  WHEN "confirmation_type" = 'team' THEN '["team"]'::jsonb
  WHEN "confirmation_type" = 'auto' THEN '[]'::jsonb
  WHEN "confirmation_type" = 'text_photo' AND COALESCE("auto_confirm", true) = false THEN '["photo","moderator"]'::jsonb
  WHEN "confirmation_type" = 'text_photo' THEN '["photo"]'::jsonb
  ELSE '["photo"]'::jsonb
END
WHERE "confirmation_methods" IS NULL OR "confirmation_methods" = '[]'::jsonb;

UPDATE "tasks" SET "scope_type" = 'team' WHERE "confirmation_type" = 'team' OR "confirmation_methods" @> '["team"]'::jsonb;

-- status backfill
UPDATE "tasks" SET "status" = 'published'
WHERE "status" IS NULL OR "status" = 'draft'
  AND "publish_time" IS NOT NULL AND "publish_time" <= now()
  AND COALESCE("is_hidden", false) = false;

UPDATE "tasks" SET "status" = 'draft' WHERE "status" IS NULL;

-- sync category varchar from catalog
UPDATE "tasks" t SET "category" = c."name"
FROM "task_categories" c
WHERE t."category_id" = c.id AND (t."category" IS NULL OR t."category" <> c."name");
