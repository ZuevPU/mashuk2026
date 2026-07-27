ALTER TABLE exchange_questions ADD COLUMN IF NOT EXISTS moderator_comment text;

ALTER TABLE levels_config ADD COLUMN IF NOT EXISTS track varchar(20);
ALTER TABLE levels_config ADD COLUMN IF NOT EXISTS display_name varchar(255);

CREATE TABLE IF NOT EXISTS rating_recalc_runs (
  id serial PRIMARY KEY,
  admin_id integer,
  started_at timestamp DEFAULT now(),
  finished_at timestamp,
  participants_processed integer DEFAULT 0,
  status varchar(50) DEFAULT 'running',
  error text
);

CREATE TABLE IF NOT EXISTS rating_bonus_rules (
  id serial PRIMARY KEY,
  code varchar(100) NOT NULL UNIQUE,
  enabled boolean DEFAULT true,
  params jsonb,
  points_action_type varchar(100)
);
