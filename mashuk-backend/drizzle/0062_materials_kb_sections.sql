ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "kb_section" varchar(40);
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "kb_subsection" varchar(40);
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "topic_title" varchar(255);
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_kb_section_idx" ON "materials" ("kb_section");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_topic_title_idx" ON "materials" ("topic_title");
