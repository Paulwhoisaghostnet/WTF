import "dotenv/config";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../../server/db";

const REQUIRED_LOCAL_MIGRATIONS = [
  "drizzle/0038_x_dm_persistence.sql",
  "drizzle/0040_gameshow_card_library.sql",
  "drizzle/0041_round_dossier_fields.sql",
  "drizzle/0042_storage_architecture.sql",
  "drizzle/0046_mcp_agent_tokens.sql",
  "drizzle/0028_mint_challenge_binding.sql",
  "drizzle/0047_in_app_market.sql",
  "drizzle/0048_in_app_market_cart_checkout.sql",
  "drizzle/0049_pet_food_inventory_defaults.sql",
  "drizzle/0052_media_backed_bumpers.sql",
  "drizzle/0053_desktop_environment_items.sql",
  "drizzle/0054_in_app_market_stock.sql",
  "drizzle/0055_desktop_mutator_product_stack.sql",
  "drizzle/0055_etherlink_wallets.sql",
  "drizzle/0056_identity_archive_tools.sql",
  "drizzle/0062_arcade_play_ticket.sql",
  "drizzle/0066_challenge_automation_engine.sql",
  "drizzle/0067_in_app_market_pricing_lattice.sql",
  "drizzle/0068_casino_domain_membership.sql",
  "drizzle/0069_club_dues_domain.sql",
  "drizzle/0070_telegram_digest.sql",
  "drizzle/0072_welcome_event.sql",
  "drizzle/0073_daily_gm_welcome.sql",
  "drizzle/0074_dear_diary.sql",
  "drizzle/0081_tzkt_response_cache.sql",
  "drizzle/0082_reward_account_settlement.sql",
  "drizzle/0083_comms_mail_mesh.sql",
  "drizzle/0083_skywire_atproto.sql",
  "drizzle/0084_skywire_permission_tiers.sql",
  "drizzle/0087_user_curses.sql",
  "drizzle/0088_tz2at_identity_links.sql",
  "drizzle/0089_wtfos_atproto_identities.sql",
  "drizzle/0090_wtfos_atproto_outbox.sql",
  "drizzle/0091_desktop_app_doc_registry.sql",
  "drizzle/0092_mail_provisioning.sql",
  "drizzle/0095_crp_appview_nomination_credits.sql",
  "drizzle/0097_wtf_live_rooms.sql",
  "drizzle/0099_wtf_live_private_rooms.sql",
  "drizzle/0100_wtf_live_tip_items.sql",
  "drizzle/0103_wtf_live_soundboard_clips.sql",
  "drizzle/0108_user_desktop_localization.sql",
  "drizzle/0109_wtf_live_stage_roles.sql",
  "drizzle/0110_wtf_live_smart_rooms.sql",
  "drizzle/0111_wtf_live_game_rooms.sql",
  "drizzle/0112_wtf_live_game_room_settings_repair.sql",
  "drizzle/0115_studio_project_workflow.sql",
  "drizzle/0116_desktop_app_registration_resilience.sql",
  "drizzle/0117_remove_hoard_app.sql",
  "drizzle/0118_admin_inbox.sql",
  "drizzle/0119_commission_core_wayfinding.sql",
  "drizzle/0120_casino_community_practice_games.sql",
  "drizzle/0121_calendar_participation.sql",
  "supabase/migrations/20260531120000_enable_skywire_desktop_app.sql",
  "supabase/migrations/20260531220000_wtf_live_app_registry.sql",
];

const REQUIRED_LOCAL_SQL_PATCHES = [
  {
    name: "mastodon_tables",
    sql: `
CREATE TABLE IF NOT EXISTS "mastodon_accounts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  "instance_url" varchar(500) NOT NULL,
  "account_id" varchar(100),
  "handle" varchar(300),
  "display_name" varchar(200),
  "access_token_enc" text,
  "linked_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mastodon_accounts_user_unique"
  ON "mastodon_accounts" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "mastodon_accounts_handle_idx"
  ON "mastodon_accounts" USING btree ("handle");

CREATE TABLE IF NOT EXISTS "mastodon_cached_toots" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  "toot_id" varchar(100) NOT NULL,
  "content" text NOT NULL,
  "media" text,
  "created_at" timestamp NOT NULL,
  "cached_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mastodon_toots_user_idx"
  ON "mastodon_cached_toots" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "mastodon_toots_toot_idx"
  ON "mastodon_cached_toots" USING btree ("toot_id");

CREATE TABLE IF NOT EXISTS "mastodon_preferences" (
  "user_id" integer PRIMARY KEY REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  "show_in_feed" boolean DEFAULT true NOT NULL,
  "auto_crosspost" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
`,
  },
  {
    name: "porcupin_tables",
    sql: `
CREATE TABLE IF NOT EXISTS "porcupin_connections" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  "remote_url" varchar(500) NOT NULL,
  "auth_token_enc" text NOT NULL,
  "status" varchar(40) DEFAULT 'connected' NOT NULL,
  "last_check_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "porcupin_connections_user_unique"
  ON "porcupin_connections" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "porcupin_premium_eligibility" (
  "user_id" integer PRIMARY KEY REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  "wtf_balance_ok" boolean DEFAULT false NOT NULL,
  "membership_card_ok" boolean DEFAULT false NOT NULL,
  "dues_active_ok" boolean DEFAULT false NOT NULL,
  "eligible" boolean DEFAULT false NOT NULL,
  "checked_at" timestamp DEFAULT now() NOT NULL,
  "notes" text
);
`,
  },
  {
    name: "wtfos_appview_records",
    sql: `
CREATE TABLE IF NOT EXISTS "wtfos_appview_records" (
  "id" serial PRIMARY KEY,
  "uri" text NOT NULL,
  "did" varchar(255) NOT NULL,
  "collection" varchar(255) NOT NULL,
  "rkey" varchar(512) NOT NULL,
  "cid" varchar(255),
  "domain" varchar(64) NOT NULL,
  "json" jsonb NOT NULL,
  "source" varchar(32) DEFAULT 'outbox' NOT NULL,
  "indexed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "wtfos_appview_records_uri_unique"
  ON "wtfos_appview_records" USING btree ("uri");
CREATE INDEX IF NOT EXISTS "wtfos_appview_records_collection_idx"
  ON "wtfos_appview_records" USING btree ("collection","indexed_at");
CREATE INDEX IF NOT EXISTS "wtfos_appview_records_did_idx"
  ON "wtfos_appview_records" USING btree ("did");
CREATE INDEX IF NOT EXISTS "wtfos_appview_records_domain_idx"
  ON "wtfos_appview_records" USING btree ("domain","indexed_at");

CREATE TABLE IF NOT EXISTS "wtfos_appview_cursor" (
  "service" varchar(255) PRIMARY KEY,
  "cursor" bigint DEFAULT 0 NOT NULL,
  "last_event_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
`,
  },
  {
    name: "wtf_subdomain_grant_reward_columns",
    sql: `
DO $$ BEGIN
  CREATE TYPE "public"."wtf_subdomain_grant_status" AS ENUM('reserved', 'pending', 'provisioned', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "wtf_subdomain_grants" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "label" varchar(63) NOT NULL,
  "full_name" varchar(255) NOT NULL,
  "parent_domain" varchar(255) DEFAULT 'wtf.tez' NOT NULL,
  "status" "wtf_subdomain_grant_status" DEFAULT 'reserved' NOT NULL,
  "wallet_address" varchar(36),
  "source_type" varchar(40) DEFAULT 'admin' NOT NULL,
  "source_id" integer,
  "granted_by" integer REFERENCES "public"."users"("id") ON DELETE set null,
  "notes" text,
  "op_hash" varchar(100),
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "provisioned_at" timestamp,
  "revoked_at" timestamp
);

ALTER TABLE "challenges"
  ADD COLUMN IF NOT EXISTS "reward_wtf_subdomain" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "reward_wtf_subdomain_label_template" varchar(120);

ALTER TABLE "side_quests"
  ADD COLUMN IF NOT EXISTS "reward_wtf_subdomain" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "reward_wtf_subdomain_label_template" varchar(120);

CREATE UNIQUE INDEX IF NOT EXISTS "wtf_subdomain_grants_label_unique"
  ON "wtf_subdomain_grants" USING btree ("parent_domain","label");
CREATE UNIQUE INDEX IF NOT EXISTS "wtf_subdomain_grants_full_name_unique"
  ON "wtf_subdomain_grants" USING btree ("full_name");
CREATE INDEX IF NOT EXISTS "wtf_subdomain_grants_user_idx"
  ON "wtf_subdomain_grants" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "wtf_subdomain_grants_status_idx"
  ON "wtf_subdomain_grants" USING btree ("status");
CREATE INDEX IF NOT EXISTS "wtf_subdomain_grants_source_idx"
  ON "wtf_subdomain_grants" USING btree ("source_type","source_id");
`,
  },
];

type PrepareFlags = {
  _: string[];
  "allow-nonlocal-db"?: boolean;
  "allow-production"?: boolean;
  "dry-run"?: boolean;
  json?: boolean;
  help?: boolean;
};

type PrepareOptions = {
  allowNonlocalDb?: boolean;
  allowProduction?: boolean;
  dryRun?: boolean;
};

function parseArgs(argv: string[]): PrepareFlags {
  const flags: PrepareFlags = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const key = arg.slice(2) as keyof PrepareFlags;
    if (
      key === "allow-nonlocal-db" ||
      key === "allow-production" ||
      key === "dry-run" ||
      key === "json" ||
      key === "help"
    ) {
      flags[key] = true as never;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return flags;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run test:e2e:puppets:prepare-db",
    "  npm run test:e2e:puppets:prepare-db -- --dry-run",
    "",
    "Applies the idempotent schema catch-up migrations required by local live E2E puppet tests.",
    "This is local-first and refuses non-local or production databases unless explicitly allowed.",
    "",
    "Options:",
    "  --allow-nonlocal-db   Allow an approved staging/test database",
    "  --allow-production    Allow NODE_ENV=production",
    "  --dry-run             Print planned migrations without writing",
  ].join("\n");
}

function databaseDescriptor(rawUrl: string) {
  const parsed = new URL(rawUrl);
  return {
    protocol: parsed.protocol,
    host: parsed.host,
    hostname: parsed.hostname,
    port: parsed.port || null,
    database: parsed.pathname.replace(/^\//, "") || null,
    sslmode: parsed.searchParams.get("sslmode"),
  };
}

function isLocalDatabase(rawUrl: string): boolean {
  const { hostname } = databaseDescriptor(rawUrl);
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "postgres" ||
    hostname === "db"
  );
}

function enforceSafety(options: PrepareOptions) {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) throw new Error("Missing DATABASE_URL");
  if (process.env.NODE_ENV === "production" && !options.allowProduction) {
    throw new Error(
      "Refusing to prepare a production database. Pass --allow-production only for an intentional staging/prod rehearsal."
    );
  }
  if (!isLocalDatabase(dbUrl) && !options.allowNonlocalDb) {
    throw new Error(
      `Refusing to prepare non-local database ${databaseDescriptor(dbUrl).host}. Pass --allow-nonlocal-db after confirming this is an approved test/staging database.`
    );
  }
}

function migrationStatements(sqlText: string): string[] {
  const splitOnBreakpoints = sqlText
    .split(/^\s*-->\s*statement-breakpoint\s*$/gm)
    .map((statement) => statement.trim())
    .filter(Boolean);
  return splitOnBreakpoints.length > 1 ? splitOnBreakpoints : [sqlText.trim()];
}

export async function runLocalE2eDbPreparation(options: PrepareOptions = {}) {
  enforceSafety(options);
  const dbUrl = process.env.DATABASE_URL!.trim();
  const planned = REQUIRED_LOCAL_MIGRATIONS.map((migration) => resolve(migration));

  for (const migration of planned) {
    if (!existsSync(migration)) {
      throw new Error(`Missing required local E2E migration: ${migration}`);
    }
  }

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      database: databaseDescriptor(dbUrl),
      migrations: planned,
      patches: REQUIRED_LOCAL_SQL_PATCHES.map((patch) => patch.name),
    };
  }

  const applied: string[] = [];
  for (const migration of planned) {
    const sqlText = await readFile(migration, "utf8");
    for (const statement of migrationStatements(sqlText)) {
      try {
        await pool.query(statement);
      } catch (err) {
        if ((err as { code?: string })?.code !== "42710") throw err;
      }
    }
    applied.push(migration);
  }
  const patched: string[] = [];
  for (const patch of REQUIRED_LOCAL_SQL_PATCHES) {
    await pool.query(patch.sql);
    patched.push(patch.name);
  }

  return {
    ok: true,
    dryRun: false,
    database: databaseDescriptor(dbUrl),
    migrations: applied,
    patches: patched,
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || flags._[0] === "help") {
    console.log(usage());
    return;
  }

  const result = await runLocalE2eDbPreparation({
    allowNonlocalDb: Boolean(flags["allow-nonlocal-db"]),
    allowProduction: Boolean(flags["allow-production"]),
    dryRun: Boolean(flags["dry-run"]),
  });
  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end().catch(() => undefined);
    });
}
