-- Idempotent: the live DB (AWS RDS) may already have this from a direct apply,
-- and the migration journal is desynced (see backend/CLAUDE.md). IF NOT EXISTS
-- keeps this safe to run against any environment.
ALTER TABLE "user_answers" ADD COLUMN IF NOT EXISTS "selected_option_ids" jsonb;
