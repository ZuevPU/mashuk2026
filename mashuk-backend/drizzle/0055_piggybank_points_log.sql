ALTER TABLE "piggybank" ADD COLUMN IF NOT EXISTS "points_log_id" integer;
DO $$ BEGIN
  ALTER TABLE "piggybank"
    ADD CONSTRAINT "piggybank_points_log_id_points_log_id_fk"
    FOREIGN KEY ("points_log_id") REFERENCES "points_log"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
