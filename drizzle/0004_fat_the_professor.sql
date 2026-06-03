CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "difficulty" "difficulty";