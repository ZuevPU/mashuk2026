DROP INDEX IF EXISTS thematic_tags_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS thematic_tags_shift_slug_unique
  ON thematic_tags (shift_id, slug)
  WHERE slug IS NOT NULL;
