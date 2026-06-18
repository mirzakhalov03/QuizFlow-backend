-- Idempotent: adds BYOK tracking columns to quiz_jobs table if they do not exist.
ALTER TABLE "quiz_jobs" ADD COLUMN IF NOT EXISTS "api_key_id" uuid;
ALTER TABLE "quiz_jobs" ADD COLUMN IF NOT EXISTS "api_key_name" text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'quiz_jobs_api_key_id_user_api_keys_id_fk'
    ) THEN
        ALTER TABLE "quiz_jobs" 
        ADD CONSTRAINT "quiz_jobs_api_key_id_user_api_keys_id_fk" 
        FOREIGN KEY ("api_key_id") REFERENCES "user_api_keys"("id") ON DELETE SET NULL;
    END IF;
END $$;
