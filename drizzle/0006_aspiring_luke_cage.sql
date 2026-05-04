CREATE TYPE "public"."job_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "quiz_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quiz_id" uuid,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"request_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "quiz_jobs" ADD CONSTRAINT "quiz_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_jobs" ADD CONSTRAINT "quiz_jobs_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_jobs_user_id_idx" ON "quiz_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_jobs_status_idx" ON "quiz_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_refresh_token_unique" UNIQUE("refresh_token");