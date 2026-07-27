CREATE TABLE IF NOT EXISTS "program_block_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "program_block_types_key_unique" UNIQUE("key")
);

CREATE TABLE IF NOT EXISTS "program_speakers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"initials" varchar(10),
	"created_at" timestamp DEFAULT now()
);

ALTER TABLE "schedule_days" ADD COLUMN IF NOT EXISTS "calendar_date" timestamp;
ALTER TABLE "schedule_days" ADD COLUMN IF NOT EXISTS "display_label" varchar(255);
ALTER TABLE "schedule_days" ADD COLUMN IF NOT EXISTS "shift_number" integer;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "parent_event_id" integer;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "has_sub_sessions" boolean DEFAULT false;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "audience_type" varchar(32) DEFAULT 'all';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "audience_direction_id" integer;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "speaker_ids" jsonb DEFAULT '[]';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;

INSERT INTO "program_places" ("name") VALUES
('Пушкин'),
('Харламов'),
('Левитан'),
('Достоевский (Росмолодёжь)'),
('Рахманинов'),
('Циолковский (Ростелеком)'),
('Брюллов'),
('Кутузов'),
('Лермонтов'),
('Движение Первых'),
('Машук'),
('Бештау'),
('Малая сцена'),
('Октогональ')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "program_block_types" ("key", "name", "sort_order") VALUES
('direction_work', 'Работа по направлению', 1),
('important_lessons', 'Уроки о важном', 2),
('open_lessons', 'Открытые уроки', 3),
('alt_venues', 'Альтернативные площадки', 4),
('cultural', 'Культурные активности', 5),
('club', 'Клуб', 6),
('practice', 'Практика практик', 7),
('field_trip', 'Полезный выезд', 8),
('other', 'Другое', 9),
('session', 'Сессия', 10),
('plenary', 'Пленар', 11),
('workshop', 'Воркшоп', 12),
('break', 'Перерыв', 13),
('key_block', 'Ключевой блок', 14)
ON CONFLICT ("key") DO NOTHING;
