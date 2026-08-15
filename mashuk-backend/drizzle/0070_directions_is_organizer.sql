ALTER TABLE directions ADD COLUMN IF NOT EXISTS is_organizer boolean DEFAULT false;
UPDATE directions
SET is_organizer = true
WHERE is_organizer IS NOT TRUE
  AND lower(name) LIKE '%организатор%';
