ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "kb_unlock_mode" varchar(32) DEFAULT 'touchpoints' NOT NULL;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "kb_unlock_min_touchpoints" integer;
