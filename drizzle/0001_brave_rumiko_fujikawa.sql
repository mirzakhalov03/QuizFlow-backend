ALTER TABLE "user_profiles" ADD COLUMN "ai_feedback" jsonb;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "ai_feedback_generated_at" timestamp;