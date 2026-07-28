ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'published';
UPDATE "materials" SET "status" = 'published' WHERE "status" IS NULL OR "status" = '';
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "file_url" varchar(500);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "description_html" text;
