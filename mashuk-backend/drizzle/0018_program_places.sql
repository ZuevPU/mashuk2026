CREATE TABLE IF NOT EXISTS "program_places" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "program_places_name_unique" UNIQUE("name")
);
