-- QR anti-fraud scan log (required by submitTask / qrScanGuard)
CREATE TABLE IF NOT EXISTS task_qr_scans (
  id serial PRIMARY KEY,
  task_id integer NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  participant_id integer NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  vk_user_id integer,
  device_key varchar(64) NOT NULL,
  ip_address varchar(64),
  user_agent text,
  outcome varchar(32) NOT NULL,
  submission_id integer REFERENCES task_submissions(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_qr_scans_task_id_idx ON task_qr_scans(task_id);
CREATE INDEX IF NOT EXISTS task_qr_scans_participant_id_idx ON task_qr_scans(participant_id);
CREATE INDEX IF NOT EXISTS task_qr_scans_device_key_idx ON task_qr_scans(device_key);
CREATE INDEX IF NOT EXISTS task_qr_scans_outcome_idx ON task_qr_scans(outcome);
