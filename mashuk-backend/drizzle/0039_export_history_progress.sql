ALTER TABLE export_history ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE export_history ADD COLUMN IF NOT EXISTS done_count integer;
ALTER TABLE export_history ADD COLUMN IF NOT EXISTS total_count integer;

CREATE INDEX IF NOT EXISTS export_history_status_created_idx ON export_history (status, created_at);
