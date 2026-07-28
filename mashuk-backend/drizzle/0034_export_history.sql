CREATE TABLE IF NOT EXISTS export_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id integer,
  title varchar(255) NOT NULL DEFAULT 'Выгрузка',
  source varchar(64) NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  columns jsonb NOT NULL DEFAULT '[]',
  status varchar(20) NOT NULL DEFAULT 'pending',
  file_path text,
  file_name varchar(255),
  byte_size integer,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp
);

CREATE INDEX IF NOT EXISTS export_history_admin_created_idx ON export_history (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_history_expires_idx ON export_history (expires_at);
