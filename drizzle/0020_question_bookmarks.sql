-- Adds the question_bookmarks table for the bookmark feature.
-- Fully idempotent: safe whether the table already exists or not.

CREATE TABLE IF NOT EXISTS "question_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "question_bookmarks_user_question_unique" UNIQUE("user_id","question_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'question_bookmarks_user_id_users_id_fk'
      AND table_name = 'question_bookmarks'
  ) THEN
    ALTER TABLE "question_bookmarks"
      ADD CONSTRAINT "question_bookmarks_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'question_bookmarks_question_id_questions_id_fk'
      AND table_name = 'question_bookmarks'
  ) THEN
    ALTER TABLE "question_bookmarks"
      ADD CONSTRAINT "question_bookmarks_question_id_questions_id_fk"
      FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_bookmarks_user_id_idx" ON "question_bookmarks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_bookmarks_question_id_idx" ON "question_bookmarks" USING btree ("question_id");
