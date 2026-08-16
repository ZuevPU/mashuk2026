ALTER TABLE home_notices ADD COLUMN IF NOT EXISTS placement varchar(20) NOT NULL DEFAULT 'home';
--> statement-breakpoint
UPDATE home_notices SET placement = 'home' WHERE placement IS NULL OR placement = '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS home_notices_shift_placement_idx ON home_notices (shift_id, placement);
