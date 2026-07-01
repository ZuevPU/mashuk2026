CREATE TABLE "answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"answer_data" jsonb,
	"points_awarded" integer DEFAULT 0,
	"word_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" varchar(255),
	"stat_date" timestamp,
	"time_point" varchar(50),
	"avg_energy" integer,
	"emotions_distribution" jsonb,
	"completion_percent" integer,
	"median_word_count" integer,
	"red_flag" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "event_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"place" varchar(255),
	"event_date" timestamp,
	"start_time" timestamp,
	"end_time" timestamp,
	"tags" jsonb
);
--> statement-breakpoint
CREATE TABLE "exchange_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"text" text NOT NULL,
	"reactions" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exchange_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"text" text NOT NULL,
	"audience" varchar(100),
	"moderation_status" varchar(50) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "levels_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"points_per_unit" integer,
	"max_accruals" integer,
	"level_thresholds" jsonb
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"vk_id" integer NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"direction" varchar(255),
	"interests" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "participants_vk_id_unique" UNIQUE("vk_id")
);
--> statement-breakpoint
CREATE TABLE "piggybank" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"tag" varchar(100),
	"source" varchar(100),
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "points_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"action_type" varchar(100),
	"points" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger_type" varchar(100),
	"participant_id" integer,
	"text" text NOT NULL,
	"sent_at" timestamp,
	"delivery_status" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"text" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"block" varchar(100),
	"publish_time" timestamp,
	"close_time" timestamp,
	"points" integer DEFAULT 0,
	"time_point" varchar(50),
	"direction" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"answer_text" text,
	"photo_url" varchar(500),
	"status" varchar(50) DEFAULT 'pending',
	"submitted_at" timestamp DEFAULT now(),
	"checked_at" timestamp,
	"points_awarded" integer DEFAULT 0,
	"moderator_comment" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"points" integer DEFAULT 0,
	"deadline" timestamp,
	"publish_time" timestamp,
	"category" varchar(100),
	"answer_type" varchar(50),
	"auto_confirm" boolean DEFAULT true,
	"direction" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_answers" ADD CONSTRAINT "exchange_answers_question_id_exchange_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exchange_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_answers" ADD CONSTRAINT "exchange_answers_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_questions" ADD CONSTRAINT "exchange_questions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piggybank" ADD CONSTRAINT "piggybank_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_log" ADD CONSTRAINT "points_log_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;