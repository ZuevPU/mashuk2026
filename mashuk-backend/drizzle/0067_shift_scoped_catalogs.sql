ALTER TABLE directions ADD COLUMN IF NOT EXISTS shift_id integer;
CREATE INDEX IF NOT EXISTS directions_shift_id_idx ON directions (shift_id);

ALTER TABLE program_places ADD COLUMN IF NOT EXISTS shift_id integer;
CREATE INDEX IF NOT EXISTS program_places_shift_id_idx ON program_places (shift_id);
ALTER TABLE program_places DROP CONSTRAINT IF EXISTS program_places_name_unique;
ALTER TABLE program_places DROP CONSTRAINT IF EXISTS program_places_name_key;

ALTER TABLE thematic_tags ADD COLUMN IF NOT EXISTS shift_id integer;
CREATE INDEX IF NOT EXISTS thematic_tags_shift_id_idx ON thematic_tags (shift_id);
ALTER TABLE thematic_tags DROP CONSTRAINT IF EXISTS thematic_tags_name_unique;
ALTER TABLE thematic_tags DROP CONSTRAINT IF EXISTS thematic_tags_name_key;

ALTER TABLE program_block_types ADD COLUMN IF NOT EXISTS shift_id integer;
CREATE INDEX IF NOT EXISTS program_block_types_shift_id_idx ON program_block_types (shift_id);
ALTER TABLE program_block_types DROP CONSTRAINT IF EXISTS program_block_types_key_unique;
ALTER TABLE program_block_types DROP CONSTRAINT IF EXISTS program_block_types_key_key;

ALTER TABLE program_speakers ADD COLUMN IF NOT EXISTS shift_id integer;
CREATE INDEX IF NOT EXISTS program_speakers_shift_id_idx ON program_speakers (shift_id);
