-- Short public task QR codes + race-safe success uniqueness

-- Drop duplicate task tokens (keep lowest id)
UPDATE tasks t
SET qr_token = NULL
WHERE t.qr_token IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM tasks t2
    WHERE t2.qr_token = t.qr_token AND t2.id < t.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS tasks_qr_token_uidx
  ON tasks (qr_token)
  WHERE qr_token IS NOT NULL;

ALTER TABLE task_qr_scans
  ADD COLUMN IF NOT EXISTS forum_day smallint;

UPDATE task_qr_scans s
SET forum_day = t.day_number
FROM tasks t
WHERE s.task_id = t.id
  AND s.forum_day IS NULL
  AND t.day_number IS NOT NULL;

UPDATE task_qr_scans
SET forum_day = 1
WHERE forum_day IS NULL;

-- Keep oldest success row per (participant, task, forum_day)
DELETE FROM task_qr_scans a
USING task_qr_scans b
WHERE a.outcome = 'success'
  AND b.outcome = 'success'
  AND a.participant_id = b.participant_id
  AND a.task_id = b.task_id
  AND a.forum_day = b.forum_day
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS task_qr_scans_success_uniq
  ON task_qr_scans (participant_id, task_id, forum_day)
  WHERE outcome = 'success';
