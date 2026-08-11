-- Allow multiple successful QR scans per day up to task.daily_repeat_limit.
-- Previous unique index blocked the 2nd+ scan even for repeatable tasks.

DROP INDEX IF EXISTS task_qr_scans_success_uniq;

CREATE INDEX IF NOT EXISTS task_qr_scans_success_lookup_idx
  ON task_qr_scans (participant_id, task_id, forum_day)
  WHERE outcome = 'success';
