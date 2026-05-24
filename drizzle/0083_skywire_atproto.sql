DO $$
BEGIN
  CREATE TYPE "atproto_handle_verification_method" AS ENUM (
    'dns_txt',
    'https_well_known',
    'wtf_hosted_subdomain',
    'tezos_alias_only'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "atproto_handle_verification_status" AS ENUM (
    'pending',
    'verified',
    'failed',
    'revoked'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "atproto_event_source" AS ENUM ('bluesky', 'atproto');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "atproto_post_claim_status" AS ENUM (
    'pending',
    'verified',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "atproto_accounts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "did" varchar(255) NOT NULL,
  "handle" varchar(255) NOT NULL,
  "pds_url" text,
  "display_name" varchar(255),
  "avatar_url" text,
  "description" text,
  "indexed_at" timestamp,
  "last_synced_at" timestamp,
  "oauth_issuer" text,
  "oauth_scopes" text,
  "encrypted_access_token" text,
  "encrypted_refresh_token" text,
  "token_expires_at" timestamp,
  "encrypted_dpop_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "disconnected_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "atproto_accounts_user_active_unique"
  ON "atproto_accounts" ("user_id")
  WHERE "disconnected_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "atproto_accounts_did_active_unique"
  ON "atproto_accounts" ("did")
  WHERE "disconnected_at" IS NULL;

CREATE INDEX IF NOT EXISTS "atproto_accounts_handle_idx"
  ON "atproto_accounts" ("handle");

CREATE TABLE IF NOT EXISTS "atproto_handle_claims" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "atproto_account_id" integer REFERENCES "atproto_accounts"("id") ON DELETE set null,
  "did" varchar(255) NOT NULL,
  "desired_handle" varchar(255) NOT NULL,
  "tezos_alias" varchar(255),
  "wtf_subdomain_grant_id" integer,
  "verification_method" "atproto_handle_verification_method" NOT NULL,
  "verification_status" "atproto_handle_verification_status" DEFAULT 'pending' NOT NULL,
  "proof_token" varchar(128) NOT NULL,
  "verified_at" timestamp,
  "last_checked_at" timestamp,
  "failure_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "atproto_handle_claims_user_handle_unique"
  ON "atproto_handle_claims" ("user_id", "desired_handle");

CREATE INDEX IF NOT EXISTS "atproto_handle_claims_handle_status_idx"
  ON "atproto_handle_claims" ("desired_handle", "verification_status");

CREATE INDEX IF NOT EXISTS "atproto_handle_claims_user_idx"
  ON "atproto_handle_claims" ("user_id");

CREATE TABLE IF NOT EXISTS "atproto_events" (
  "id" serial PRIMARY KEY,
  "stable_event_id" varchar(255) NOT NULL,
  "source" "atproto_event_source" NOT NULL,
  "event_type" varchar(120) NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "actor_did" varchar(255) NOT NULL,
  "actor_handle" varchar(255),
  "uri" text,
  "cid" varchar(255),
  "collection" varchar(255),
  "rkey" varchar(255),
  "text" text,
  "created_at_remote" timestamp,
  "indexed_at" timestamp DEFAULT now() NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "processed_at" timestamp,
  "challenge_relevant" boolean DEFAULT false NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "atproto_events_stable_event_unique"
  ON "atproto_events" ("stable_event_id");

CREATE INDEX IF NOT EXISTS "atproto_events_actor_idx"
  ON "atproto_events" ("actor_did");

CREATE INDEX IF NOT EXISTS "atproto_events_uri_cid_idx"
  ON "atproto_events" ("uri", "cid");

CREATE INDEX IF NOT EXISTS "atproto_events_type_idx"
  ON "atproto_events" ("event_type");

CREATE TABLE IF NOT EXISTS "atproto_post_claims" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "challenge_id" integer,
  "did" varchar(255) NOT NULL,
  "handle_at_claim_time" varchar(255),
  "post_uri" text NOT NULL,
  "post_cid" varchar(255),
  "post_text" text,
  "claimed_for" varchar(120) DEFAULT 'challenge' NOT NULL,
  "verification_status" "atproto_post_claim_status" DEFAULT 'pending' NOT NULL,
  "rejection_reason" text,
  "verified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "atproto_post_claims_user_challenge_uri_unique"
  ON "atproto_post_claims" ("user_id", "challenge_id", "claimed_for", "post_uri");

CREATE INDEX IF NOT EXISTS "atproto_post_claims_user_idx"
  ON "atproto_post_claims" ("user_id");

CREATE INDEX IF NOT EXISTS "atproto_post_claims_post_uri_idx"
  ON "atproto_post_claims" ("post_uri");
