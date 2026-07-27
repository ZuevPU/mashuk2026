ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "reflection_kind" varchar(50);
ALTER TABLE "forum_settings" ADD COLUMN IF NOT EXISTS "answer_confirmation" jsonb;

INSERT INTO "levels_config" ("action_type", "points_per_unit", "max_accruals")
SELECT 'point_b_complete', 30, 1
WHERE NOT EXISTS (
  SELECT 1 FROM "levels_config" WHERE "action_type" = 'point_b_complete'
);

UPDATE "levels_config" SET "points_per_unit" = 5 WHERE "action_type" = 'question_answer';
