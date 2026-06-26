-- Marketplace: make description optional and add a free-text custom category.
-- Written idempotently so it is safe against the already-migrated live DB or a fresh one.
ALTER TABLE "marketplace_listings" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "custom_category" text;
