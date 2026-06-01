

ALTER TABLE "user_api_keys" ADD COLUMN "provider" text DEFAULT 'openai' NOT NULL; 
ALTER TABLE "users" ADD COLUMN "password" text; 
ALTER TABLE "users" ADD COLUMN "password_reset_token_hash" text ;
ALTER TABLE "users" ADD COLUMN "password_reset_token_expires_at" timestamp;