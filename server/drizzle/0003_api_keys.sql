ALTER TABLE "users" ADD "api_key_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_api_key_hash_idx" ON "users" ("api_key_hash");
