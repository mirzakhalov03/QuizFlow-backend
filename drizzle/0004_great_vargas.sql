ALTER TABLE "users" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_refresh_token_unique" UNIQUE("refresh_token");