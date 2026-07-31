ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "short_description" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "medal_id" integer REFERENCES "medals"("id");
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "medal_count" integer DEFAULT 1;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "event_time" timestamp;

-- Migrate existing description into short when empty
UPDATE "tasks"
SET "short_description" = left(trim(coalesce("description", regexp_replace(coalesce("description_html", ''), '<[^>]+>', ' ', 'g'))), 500)
WHERE "short_description" IS NULL OR trim("short_description") = '';

UPDATE "tasks" SET "medal_count" = 1 WHERE "medal_count" IS NULL;
UPDATE "tasks" SET "medal_task" = true WHERE "medal_id" IS NOT NULL AND "medal_task" IS NOT TRUE;

-- Canonical 11 categories (ТЗ)
INSERT INTO "task_categories" ("name", "icon_key", "sort_order") VALUES
  ('Образовательная программа', 'education', 1),
  ('Культурная программа', 'culture', 2),
  ('Спорт', 'sport', 3),
  ('Полезные знакомства/общение', 'network', 4),
  ('Групповые активности', 'team', 5),
  ('Креатив', 'creative', 6),
  ('Медиа/соцсети', 'media', 7),
  ('Волонтёрство', 'volunteer', 8),
  ('Организация активности', 'org', 9),
  ('Полезные выезды', 'trip', 10),
  ('Инсайты и рефлексия', 'insight', 11)
ON CONFLICT ("name") DO UPDATE SET
  "icon_key" = EXCLUDED."icon_key",
  "sort_order" = EXCLUDED."sort_order";

-- Remap tasks from legacy category names
UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('образование', 'образовательная программа')
  AND c."name" = 'Образовательная программа';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('культура', 'культурная программа')
  AND c."name" = 'Культурная программа';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('нетворкинг', 'networking', 'знакомства', 'полезные знакомства/общение')
  AND c."name" = 'Полезные знакомства/общение';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('командная работа', 'групповые активности')
  AND c."name" = 'Групповые активности';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('творчество', 'креатив')
  AND c."name" = 'Креатив';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('медиа', 'медиа/соцсети')
  AND c."name" = 'Медиа/соцсети';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('организация', 'организация активности', 'активность')
  AND c."name" = 'Организация активности';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('выездная активность', 'полезные выезды', 'выезд')
  AND c."name" = 'Полезные выезды';

UPDATE "tasks" t SET "category_id" = c.id, "category" = c.name
FROM "task_categories" c
WHERE lower(trim(t."category")) IN ('инсайты', 'рефлексия', 'инсайты и рефлексия', 'прочее', 'направление')
  AND c."name" = 'Инсайты и рефлексия';
