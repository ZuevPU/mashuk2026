CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'admin',
	"vk_id" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
CREATE TABLE "day_focus" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_number" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"text" text,
	"key_question" text,
	CONSTRAINT "day_focus_day_number_unique" UNIQUE("day_number")
);
--> statement-breakpoint
CREATE TABLE "directions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_hidden" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forum_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"current_day" integer DEFAULT 1,
	"total_days" integer DEFAULT 4,
	"recommendation_threshold" integer DEFAULT 1,
	"sections_visibility" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"day_number" integer,
	"speaker_name" varchar(255),
	"speaker_initials" varchar(10),
	"event_title" varchar(255),
	"type" varchar(50),
	"title" varchar(255) NOT NULL,
	"description" text,
	"url" varchar(500),
	"is_new" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "thematic_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "thematic_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "day_number" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "time_slot" varchar(20);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_published" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "direction_id" integer;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "path_points" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "experience_points" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "status" varchar(50) DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "day_number" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "allow_retry" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "push_on_publish" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "parent_question_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "day_number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "execution_type" varchar(50) DEFAULT 'once';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "push_on_publish" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "hide_until_publish" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "allow_retry" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE no action ON UPDATE no action;