-- §5 admin: role icons, advice publish status, unique (role × day)

DELETE FROM day_experiments a
USING day_experiments b
WHERE a.id > b.id
  AND a.day_number = b.day_number
  AND a.role_key = b.role_key;

ALTER TABLE pedagogical_roles ADD COLUMN IF NOT EXISTS icon_key varchar(32);

ALTER TABLE day_experiments ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'published';

UPDATE day_experiments SET status = 'published' WHERE status IS NULL OR status = '';

CREATE UNIQUE INDEX IF NOT EXISTS day_experiments_day_role_unique_idx ON day_experiments (day_number, role_key);
