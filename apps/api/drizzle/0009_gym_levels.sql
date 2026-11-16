CREATE TABLE "gym_levels" (
	"user_id" uuid NOT NULL,
	"gym_id" text NOT NULL,
	"color" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_levels_user_id_gym_id_pk" PRIMARY KEY("user_id","gym_id")
);
--> statement-breakpoint
ALTER TABLE "gym_levels" ADD CONSTRAINT "gym_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_levels" ADD CONSTRAINT "gym_levels_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;