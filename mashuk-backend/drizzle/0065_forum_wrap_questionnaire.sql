ALTER TABLE shifts ADD COLUMN IF NOT EXISTS forum_wrap_questionnaire_config jsonb;
ALTER TABLE forum_settings ADD COLUMN IF NOT EXISTS forum_wrap_questionnaire_config jsonb;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS forum_wrap_ratings jsonb;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS forum_wrap_draft jsonb;

INSERT INTO levels_config (action_type, points_per_unit, max_accruals, track, display_name)
SELECT 'forum_wrap_complete', 15, 1, 'path', 'Итоги форума'
WHERE NOT EXISTS (
  SELECT 1 FROM levels_config WHERE action_type = 'forum_wrap_complete' AND shift_id IS NULL
);
