CREATE TABLE "gyms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"discipline" "climb_style" NOT NULL,
	"system" text NOT NULL,
	"colors" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
