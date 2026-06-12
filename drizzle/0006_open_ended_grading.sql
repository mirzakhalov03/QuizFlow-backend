-- Idempotent: the live DB (AWS RDS) already has these from a direct apply, and
-- the migration journal is desynced (see backend/CLAUDE.md). IF NOT EXISTS /
-- duplicate_object guards keep this safe to run against any environment.
DO $$ BEGIN
 CREATE TYPE "public"."grading_status" AS ENUM('complete', 'pending', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "user_answers" ADD COLUMN IF NOT EXISTS "is_correct" boolean;--> statement-breakpoint
ALTER TABLE "quiz_results" ADD COLUMN IF NOT EXISTS "grading_status" "public"."grading_status" DEFAULT 'complete' NOT NULL;
