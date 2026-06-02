ALTER TABLE "quizzes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_share_token_unique" UNIQUE("share_token");