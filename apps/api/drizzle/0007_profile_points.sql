ALTER TABLE "schedule_plans" ADD COLUMN "weak_points" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weak_points" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "liked_points" text[] DEFAULT '{}' NOT NULL;