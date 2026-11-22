ALTER TABLE "users" ADD COLUMN "cue" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cue_since" integer DEFAULT 0 NOT NULL;