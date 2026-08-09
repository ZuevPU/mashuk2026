-- Link forum answers to the primary points_log award for reliable revoke-by-question
ALTER TABLE answers
  ADD COLUMN IF NOT EXISTS points_log_id integer REFERENCES points_log(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS answers_points_log_id_idx ON answers(points_log_id);
