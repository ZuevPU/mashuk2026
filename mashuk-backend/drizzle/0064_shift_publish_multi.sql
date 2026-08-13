-- Multiple live streams: publish ≠ activate. Drop single-active constraint.

ALTER TABLE "shifts"
  ADD COLUMN IF NOT EXISTS "is_published" boolean NOT NULL DEFAULT false;

UPDATE "shifts"
SET "is_published" = true
WHERE "status" = 'active' AND "is_published" = false;

DROP INDEX IF EXISTS "shifts_one_active_idx";

CREATE TABLE IF NOT EXISTS "shift_copy_log" (
  "id" serial PRIMARY KEY,
  "source_shift_id" integer NOT NULL,
  "target_shift_id" integer NOT NULL,
  "module" varchar(64) NOT NULL,
  "copied_at" timestamp DEFAULT now(),
  "copied_by_admin_id" integer
);

CREATE UNIQUE INDEX IF NOT EXISTS "shift_copy_log_pair_module_unique"
  ON "shift_copy_log" ("source_shift_id", "target_shift_id", "module");
