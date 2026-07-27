-- KB policy, manual unlocks, materials created_at, event block_type, push defaults
ALTER TABLE forum_settings ADD COLUMN IF NOT EXISTS kb_past_days_policy varchar(20) DEFAULT 'locked';
ALTER TABLE forum_settings ADD COLUMN IF NOT EXISTS push_block_types jsonb DEFAULT '{}';

ALTER TABLE materials ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
UPDATE materials SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE events ADD COLUMN IF NOT EXISTS block_type varchar(50) DEFAULT 'session';
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_key_block boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS kb_day_unlocks (
  id serial PRIMARY KEY,
  participant_id integer NOT NULL,
  day_number integer NOT NULL,
  unlocked_by_admin_id integer,
  unlocked_at timestamp DEFAULT now(),
  UNIQUE (participant_id, day_number)
);
CREATE INDEX IF NOT EXISTS kb_day_unlocks_participant_idx ON kb_day_unlocks(participant_id);
