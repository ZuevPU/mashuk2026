CREATE TABLE IF NOT EXISTS "exchange_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(32) NOT NULL UNIQUE,
  "title" varchar(64) NOT NULL,
  "emoji" varchar(8),
  "hint" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exchange_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(32) NOT NULL UNIQUE,
  "title" varchar(64) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exchange_questions" ADD COLUMN IF NOT EXISTS "category_id" integer;
--> statement-breakpoint
ALTER TABLE "exchange_questions" ADD COLUMN IF NOT EXISTS "classified_by" varchar(16) DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE "exchange_questions" ADD COLUMN IF NOT EXISTS "category_confirmed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "exchange_questions" ADD COLUMN IF NOT EXISTS "reactions" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "exchange_questions" ADD COLUMN IF NOT EXISTS "duplicate_of_id" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exchange_question_tags" (
  "question_id" integer NOT NULL,
  "tag_id" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_questions_category_mod_created_idx"
  ON "exchange_questions" ("category_id", "moderation_status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_question_tags_question_idx" ON "exchange_question_tags" ("question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_question_tags_tag_idx" ON "exchange_question_tags" ("tag_id");
--> statement-breakpoint
INSERT INTO "exchange_categories" ("slug", "title", "emoji", "hint", "sort_order", "is_active", "is_system")
VALUES
  ('start', 'Старт в профессии', '🚀', 'Первый урок или первая смена, волнение, вход в новый коллектив, поиск наставника, выбор пути в педагогику.', 1, true, false),
  ('team', 'Коллеги и границы', '🤝', 'Отношения в коллективе, конфликты со старшими коллегами, личные границы, работа с напарником, диалог с администрацией.', 2, true, false),
  ('motivation', 'Мотивация и вовлечение', '🔥', '«Дети ничего не хотят», клиповое мышление, удержание интереса, поощрения и рейтинги, работа через увлечения детей.', 3, true, false),
  ('hard_cases', 'Сложные ситуации', '⚡', 'Дисциплина, трудный подросток, конфликты с детьми, ЧП и нестандартные случаи, безопасность.', 4, true, false),
  ('methods', 'Методика и форматы', '🧩', 'Приёмы и структура занятия, смена деятельности, геймификация, интерактив, оценивание, импровизация.', 5, true, false),
  ('digital', 'Цифра, ИИ и медиа', '🤖', 'Нейросети на занятии, конкретные сервисы и инструменты, презентации, видео и соцсети, гаджеты.', 6, true, false),
  ('parents', 'Родители', '👨‍👩‍👧', 'Коммуникация с семьёй, тревожные и конфликтные родители, форматы вовлечения родителей.', 7, true, false),
  ('resource', 'Ресурс и выгорание', '🌱', 'Как восстанавливаться, баланс работы и жизни, хобби и спорт, признаки выгорания, что делать в моменте.', 8, true, false),
  ('growth', 'Рост и возможности', '📈', 'Куда расти, карьерные треки, конкурсы, форумы, смены, стажировки, повышение квалификации.', 9, true, false),
  ('picks', 'Подборки и вдохновение', '📚', 'Книги, фильмы, каналы, цитаты, педагоги-кумиры, смыслы профессии.', 10, true, false),
  ('smalltalk', 'Знакомство и общение', '👋', 'Представиться, рассказать о себе, ожидания от форума, эмоции и мемы. Отдельная лента, в основную не попадает.', 11, true, true),
  ('other', 'Другое', '❓', 'Не подошла ни одна рубрика — модератор подберёт её сам при проверке.', 12, true, true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "exchange_tags" ("slug", "title", "is_active")
VALUES
  ('ovz', 'Инклюзия и ОВЗ', true),
  ('camp', 'Лагерь и смена', true),
  ('preschool', 'Дошкольное', true),
  ('spo', 'СПО', true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "exchange_questions" q
SET "category_id" = c."id",
    "classified_by" = COALESCE(q."classified_by", 'auto')
FROM "exchange_categories" c
WHERE c."slug" = 'other'
  AND q."category_id" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exchange_questions_category_id_fkey'
  ) THEN
    ALTER TABLE "exchange_questions"
      ADD CONSTRAINT "exchange_questions_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "exchange_categories"("id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exchange_question_tags_question_id_fkey'
  ) THEN
    ALTER TABLE "exchange_question_tags"
      ADD CONSTRAINT "exchange_question_tags_question_id_fkey"
      FOREIGN KEY ("question_id") REFERENCES "exchange_questions"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exchange_question_tags_tag_id_fkey'
  ) THEN
    ALTER TABLE "exchange_question_tags"
      ADD CONSTRAINT "exchange_question_tags_tag_id_fkey"
      FOREIGN KEY ("tag_id") REFERENCES "exchange_tags"("id") ON DELETE CASCADE;
  END IF;
END $$;
