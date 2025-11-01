CREATE TYPE "public"."climb_style" AS ENUM('boulder', 'route');--> statement-breakpoint
CREATE TYPE "public"."session_focus" AS ENUM('strength', 'endurance', 'technique');--> statement-breakpoint
CREATE TABLE "climbs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"style" "climb_style" NOT NULL,
	"grade" text NOT NULL,
	"grade_value" real NOT NULL,
	"color" text,
	"gym_id" text,
	"sent" boolean NOT NULL,
	"attempts" smallint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"available_minutes" integer NOT NULL,
	"source" text NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"focus" "session_focus" NOT NULL,
	"fatigue" smallint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "climbs" ADD CONSTRAINT "climbs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_date_idx" ON "sessions" USING btree ("date");