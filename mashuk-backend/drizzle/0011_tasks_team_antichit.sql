ALTER TABLE tasks ADD COLUMN IF NOT EXISTS daily_repeat_limit integer DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS qr_valid_from timestamp;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS qr_valid_to timestamp;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_confirm_hours integer DEFAULT 24;

ALTER TABLE forum_settings ADD COLUMN IF NOT EXISTS team_confirm_hours_default integer DEFAULT 24;

ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS post_url_normalized varchar(500);

ALTER TABLE points_log ADD COLUMN IF NOT EXISTS revoked_at timestamp;
ALTER TABLE points_log ADD COLUMN IF NOT EXISTS revoke_reason text;
ALTER TABLE points_log ADD COLUMN IF NOT EXISTS related_log_id integer;

CREATE TABLE IF NOT EXISTS task_team_confirmations (
  id serial PRIMARY KEY,
  submission_id integer NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
  participant_id integer NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'pending',
  responded_at timestamp,
  UNIQUE (submission_id, participant_id)
);
CREATE INDEX IF NOT EXISTS task_team_confirm_sub_idx ON task_team_confirmations(submission_id);
CREATE INDEX IF NOT EXISTS task_team_confirm_part_idx ON task_team_confirmations(participant_id);

CREATE INDEX IF NOT EXISTS task_submissions_post_norm_idx ON task_submissions(post_url_normalized) WHERE post_url_normalized IS NOT NULL;
