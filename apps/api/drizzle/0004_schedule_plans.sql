CREATE TABLE "schedule_plans" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sessions_per_week" smallint NOT NULL,
	"summary" text,
	"sessions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_plans" ADD CONSTRAINT "schedule_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;