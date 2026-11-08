CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
-- Comptes de départ : kuzimu récupère toutes les données existantes, tophe démarre vide.
INSERT INTO "users" ("username") VALUES ('kuzimu'), ('tophe');--> statement-breakpoint
ALTER TABLE "generated_plans" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "generated_plans" SET "user_id" = (SELECT "id" FROM "users" WHERE "username" = 'kuzimu');--> statement-breakpoint
UPDATE "sessions" SET "user_id" = (SELECT "id" FROM "users" WHERE "username" = 'kuzimu');--> statement-breakpoint
ALTER TABLE "generated_plans" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_plans" ADD CONSTRAINT "generated_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_date_idx" ON "sessions" USING btree ("user_id","date");
