ALTER TABLE "wallet_auth_nonces"
  ADD COLUMN IF NOT EXISTS "origin" varchar(255) DEFAULT 'https://wtfos.app' NOT NULL;
--> statement-breakpoint
ALTER TABLE "wallet_auth_nonces"
  ADD COLUMN IF NOT EXISTS "action" varchar(32) DEFAULT 'login' NOT NULL;
