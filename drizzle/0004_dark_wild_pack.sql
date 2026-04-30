CREATE TABLE "quiz_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quiz_id" uuid NOT NULL,
	"total_questions" integer NOT NULL,
	"correct_answers" integer NOT NULL,
	"wrong_answers" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_results_user_quiz_unique" UNIQUE("user_id","quiz_id")
);
--> statement-breakpoint
ALTER TABLE "quiz_results" ADD CONSTRAINT "quiz_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_results" ADD CONSTRAINT "quiz_results_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_results_user_id_idx" ON "quiz_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_results_quiz_id_idx" ON "quiz_results" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "user_answers_user_id_idx" ON "user_answers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_answers_question_id_idx" ON "user_answers" USING btree ("question_id");--> statement-breakpoint
ALTER TABLE "user_answers" ADD CONSTRAINT "user_answers_user_question_unique" UNIQUE("user_id","question_id");