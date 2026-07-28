CREATE TABLE IF NOT EXISTS "material_types" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(50) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "sort_order" integer DEFAULT 0
);

INSERT INTO "material_types" ("key", "name", "sort_order") VALUES
  ('presentation', 'Презентация', 1),
  ('video', 'Видео', 2),
  ('article', 'Статья', 3),
  ('document', 'Документ', 4),
  ('audio', 'Аудио', 5)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "task_categories" ("name", "icon_key", "sort_order") VALUES
  ('Рефлексия', 'reflection', 4),
  ('Командная работа', 'team', 5),
  ('Направление', 'direction', 7),
  ('Волонтёрство', 'volunteer', 8),
  ('Творчество', 'creative', 9),
  ('Активность', 'activity', 10),
  ('Прочее', 'other', 11)
ON CONFLICT ("name") DO NOTHING;
