CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
ALTER TABLE "user_api_keys" ALTER COLUMN "provider" SET DEFAULT 'openai';--> statement-breakpoint
ALTER TABLE "quiz_jobs" ADD COLUMN "tokens_used" jsonb;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "difficulty" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "token_usage" jsonb;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "ai_feedback" jsonb;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "ai_feedback_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_share_token_unique" UNIQUE("share_token");