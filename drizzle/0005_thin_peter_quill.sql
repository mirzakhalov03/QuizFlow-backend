ALTER TABLE "questions" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."question_type";--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'multi_select', 'open_ended', 'true_false');--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "type" SET DATA TYPE "public"."question_type" USING "type"::"public"."question_type";--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "type" SET DATA TYPE "public"."question_type" USING "type"::"public"."question_type";--> statement-breakpoint
ALTER TABLE "quizzes" DROP COLUMN "complete_by";