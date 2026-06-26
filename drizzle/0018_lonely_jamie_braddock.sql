CREATE TYPE "public"."marketplace_category" AS ENUM('general', 'science', 'math', 'history', 'language', 'technology', 'business', 'arts', 'geography', 'health', 'other');--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"description" text NOT NULL,
	"category" "marketplace_category" NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"listed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_listings_quiz_id_unique" UNIQUE("quiz_id")
);
--> statement-breakpoint
CREATE TABLE "quiz_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_ratings_quiz_user_unique" UNIQUE("quiz_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_ratings" ADD CONSTRAINT "quiz_ratings_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_ratings" ADD CONSTRAINT "quiz_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_listings_category_idx" ON "marketplace_listings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "marketplace_listings_play_count_idx" ON "marketplace_listings" USING btree ("play_count");--> statement-breakpoint
CREATE INDEX "quiz_ratings_quiz_id_idx" ON "quiz_ratings" USING btree ("quiz_id");