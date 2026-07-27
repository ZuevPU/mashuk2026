ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "question_kind" varchar(50);
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "answer_type" varchar(50);
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "day_numbers" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "subtitle" varchar(255);
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "audience_type" varchar(32) DEFAULT 'all';
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "audience_direction_id" integer;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "audience_group_id" integer;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "audience_role" varchar(100);
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "is_required" boolean DEFAULT false;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "push_template" text;

-- backfill day_numbers from day_number
UPDATE "questions"
SET "day_numbers" = jsonb_build_array("day_number")
WHERE "day_number" IS NOT NULL
  AND ("day_numbers" IS NULL OR "day_numbers" = '[]'::jsonb);

-- backfill answer_type from type
UPDATE "questions" SET "answer_type" = CASE "type"
  WHEN 'open' THEN 'text'
  WHEN 'checkin' THEN 'emotion'
  WHEN 'choice' THEN 'choice'
  WHEN 'multi' THEN 'multi'
  WHEN 'dependent' THEN 'dependent'
  ELSE 'text'
END
WHERE "answer_type" IS NULL;

-- backfill question_kind from reflection_kind / block / type
UPDATE "questions" SET "question_kind" = CASE
  WHEN "reflection_kind" = 'point_a' OR lower(coalesce("block", '')) LIKE '%точка а%' THEN 'input'
  WHEN "reflection_kind" = 'point_b' OR lower(coalesce("block", '')) LIKE '%точка б%' THEN 'input'
  WHEN lower(coalesce("block", '')) LIKE '%диагност%' OR lower(coalesce("title", '')) LIKE '%диагност%' THEN 'diagnostic'
  WHEN "reflection_kind" = 'state_check' OR "type" = 'checkin' OR lower(coalesce("block", '')) LIKE '%проверк%' THEN 'state_check'
  WHEN "reflection_kind" = 'after_event' OR lower(coalesce("title", '')) LIKE '%осмысление урока%' THEN 'after_blocks'
  WHEN "reflection_kind" = 'evening_summary' OR lower(coalesce("block", '')) LIKE '%итог%' OR "time_point" = 'вечер' THEN 'day_summary'
  ELSE 'extra'
END
WHERE "question_kind" IS NULL;

CREATE INDEX IF NOT EXISTS "questions_question_kind_idx" ON "questions" ("question_kind");
CREATE INDEX IF NOT EXISTS "questions_audience_type_idx" ON "questions" ("audience_type");
