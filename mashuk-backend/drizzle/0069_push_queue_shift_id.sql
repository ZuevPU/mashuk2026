ALTER TABLE push_queue ADD COLUMN IF NOT EXISTS shift_id integer;
CREATE INDEX IF NOT EXISTS push_queue_shift_id_idx ON push_queue (shift_id);
