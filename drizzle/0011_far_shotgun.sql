ALTER TABLE "user_api_keys" ALTER COLUMN "provider" SET DEFAULT 'openai';--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "token_usage" jsonb;