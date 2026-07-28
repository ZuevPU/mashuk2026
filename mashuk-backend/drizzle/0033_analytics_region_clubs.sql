ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "region" varchar(255);

CREATE TABLE IF NOT EXISTS "analytics_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "snapshot_key" varchar(128) NOT NULL,
  "stat_date" timestamp DEFAULT now(),
  "day_number" integer,
  "direction" varchar(255),
  "group_name" varchar(255),
  "role_key" varchar(100),
  "payload" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "analytics_snapshots_key_idx" ON "analytics_snapshots" ("snapshot_key");
CREATE INDEX IF NOT EXISTS "analytics_snapshots_day_idx" ON "analytics_snapshots" ("day_number");

CREATE TABLE IF NOT EXISTS "forum_clubs" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "embedding" jsonb,
  "is_active" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "updated_at" timestamp DEFAULT now()
);

ALTER TABLE "club_matches" ADD COLUMN IF NOT EXISTS "source_type" varchar(64);
ALTER TABLE "club_matches" ADD COLUMN IF NOT EXISTS "snippet" text;

INSERT INTO "forum_clubs" ("id", "name", "description", "sort_order")
VALUES
  ('club_future', 'Будущее', 'Образование будущего, вызовы, сценарии развития школы и профессии', 1),
  ('club_human', 'Образование вокруг человека', 'Человекоцентричность, среда, отношения, wellbeing в образовании', 2),
  ('club_unity', 'Единство', 'Сообщество, сотрудничество, общие ценности и совместные действия', 3)
ON CONFLICT ("id") DO NOTHING;
