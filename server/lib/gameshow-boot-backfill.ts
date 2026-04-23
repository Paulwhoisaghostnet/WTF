import { pool } from "../db";

/**
 * Idempotent DDL mirror of `drizzle/0023_gameshow_core.sql`. Runs once
 * on boot so the gameshow routes work on environments where
 * `npm run db:push` hasn't been applied yet (same pattern as the TV
 * hardening backfill). Every statement is `IF NOT EXISTS` / guarded by
 * information_schema, so re-running is a no-op.
 */
export async function runGameshowBootBackfill(): Promise<void> {
  const client = await pool.connect();
  try {
    const ddl: string[] = [
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contestant_status') THEN
           CREATE TYPE contestant_status AS ENUM (
             'active','reserve','eliminated','withdrew','non_participant'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'round_team_formed_via') THEN
           CREATE TYPE round_team_formed_via AS ENUM (
             'manual_assign','captain_draft','by_wtf_standing','by_last_round_rank','random'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'round_elimination_rule_kind') THEN
           CREATE TYPE round_elimination_rule_kind AS ENUM (
             'bottom_n_by_wtf','top_n_survive','did_not_hold_token',
             'submission_rank','team_rank','manual'
           );
         END IF;
       END$$`,
      `CREATE TABLE IF NOT EXISTS season_contestants (
         id                  serial PRIMARY KEY,
         season_id           integer NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
         user_id             integer NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
         status              contestant_status NOT NULL DEFAULT 'active',
         rank_at_lock        integer,
         team_id_history     jsonb NOT NULL DEFAULT '[]'::jsonb,
         eliminated_at       timestamp,
         eliminated_round_id integer REFERENCES rounds(id) ON DELETE SET NULL,
         elimination_reason  text,
         withdrew_at         timestamp,
         notes               text,
         created_at          timestamp NOT NULL DEFAULT NOW(),
         updated_at          timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS season_contestants_season_user_unique_idx
         ON season_contestants (season_id, user_id)`,
      `CREATE INDEX IF NOT EXISTS season_contestants_season_status_idx
         ON season_contestants (season_id, status)`,
      `CREATE TABLE IF NOT EXISTS round_teams (
         id              serial PRIMARY KEY,
         round_id        integer NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
         name            varchar(200) NOT NULL,
         captain_user_id integer REFERENCES users(id) ON DELETE SET NULL,
         formed_via      round_team_formed_via NOT NULL DEFAULT 'manual_assign',
         created_at      timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS round_teams_round_idx
         ON round_teams (round_id)`,
      `CREATE TABLE IF NOT EXISTS round_team_members (
         team_id integer NOT NULL REFERENCES round_teams(id) ON DELETE CASCADE,
         user_id integer NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
         PRIMARY KEY (team_id, user_id)
       )`,
      `CREATE INDEX IF NOT EXISTS round_team_members_user_idx
         ON round_team_members (user_id)`,
      `CREATE TABLE IF NOT EXISTS round_elimination_rules (
         round_id    integer PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
         kind        round_elimination_rule_kind NOT NULL,
         params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
         created_at  timestamp NOT NULL DEFAULT NOW(),
         updated_at  timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE TABLE IF NOT EXISTS round_eliminations (
         id                  serial PRIMARY KEY,
         round_id            integer NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
         user_id             integer NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
         decided_by          integer REFERENCES users(id) ON DELETE SET NULL,
         decided_at          timestamp,
         reason              text,
         was_drafted_by_rule boolean NOT NULL DEFAULT false,
         draft_rule_kind     round_elimination_rule_kind,
         override_reason     text,
         created_at          timestamp NOT NULL DEFAULT NOW(),
         updated_at          timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS round_eliminations_round_user_unique_idx
         ON round_eliminations (round_id, user_id)`,
      `CREATE INDEX IF NOT EXISTS round_eliminations_round_idx
         ON round_eliminations (round_id)`,
      `CREATE TABLE IF NOT EXISTS operator_actions (
         id            serial PRIMARY KEY,
         actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
         action_kind   varchar(80) NOT NULL,
         target_kind   varchar(40) NOT NULL,
         target_id     integer,
         payload_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
         created_at    timestamp NOT NULL DEFAULT NOW(),
         ip            varchar(64)
       )`,
      `CREATE INDEX IF NOT EXISTS operator_actions_actor_created_idx
         ON operator_actions (actor_user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS operator_actions_target_idx
         ON operator_actions (target_kind, target_id)`,
      `CREATE INDEX IF NOT EXISTS operator_actions_created_idx
         ON operator_actions (created_at DESC)`,

      // ── Phase 3: calendar ─────────────────────────────────────────
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gameshow_event_kind') THEN
           CREATE TYPE gameshow_event_kind AS ENUM (
             'round_window','challenge_window','side_quest_window',
             'x_space','discord_stage','custom'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gameshow_event_visibility') THEN
           CREATE TYPE gameshow_event_visibility AS ENUM (
             'public','contestants','hosts'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gameshow_event_status') THEN
           CREATE TYPE gameshow_event_status AS ENUM (
             'draft','published','cancelled'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_ticket_status') THEN
           CREATE TYPE calendar_ticket_status AS ENUM (
             'submitted','under_review','changes_requested',
             'approved','rejected','cancelled'
           );
         END IF;
       END$$`,
      `CREATE TABLE IF NOT EXISTS gameshow_events (
         id           serial PRIMARY KEY,
         kind         gameshow_event_kind NOT NULL,
         title        varchar(300) NOT NULL,
         description  text,
         starts_at    timestamp NOT NULL,
         ends_at      timestamp,
         all_day      boolean NOT NULL DEFAULT false,
         source_kind  varchar(40) NOT NULL DEFAULT 'manual',
         source_id    integer,
         visibility   gameshow_event_visibility NOT NULL DEFAULT 'public',
         status       gameshow_event_status NOT NULL DEFAULT 'draft',
         links_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
         created_by   integer REFERENCES users(id) ON DELETE SET NULL,
         approved_by  integer REFERENCES users(id) ON DELETE SET NULL,
         approved_at  timestamp,
         created_at   timestamp NOT NULL DEFAULT NOW(),
         updated_at   timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS gameshow_events_source_unique_idx
         ON gameshow_events (source_kind, source_id)
         WHERE source_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS gameshow_events_starts_at_idx
         ON gameshow_events (starts_at)`,
      `CREATE INDEX IF NOT EXISTS gameshow_events_status_starts_at_idx
         ON gameshow_events (status, starts_at)`,
      `CREATE TABLE IF NOT EXISTS calendar_tickets (
         id                 serial PRIMARY KEY,
         submitter_user_id  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         payload_json       jsonb NOT NULL,
         status             calendar_ticket_status NOT NULL DEFAULT 'submitted',
         reviewer_user_id   integer REFERENCES users(id) ON DELETE SET NULL,
         review_reason      text,
         decided_at         timestamp,
         published_event_id integer REFERENCES gameshow_events(id) ON DELETE SET NULL,
         created_at         timestamp NOT NULL DEFAULT NOW(),
         updated_at         timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS calendar_tickets_status_created_idx
         ON calendar_tickets (status, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS calendar_tickets_submitter_idx
         ON calendar_tickets (submitter_user_id, created_at DESC)`,

      // ── Phase 4: Discord bot + attendance ─────────────────────────
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_source') THEN
           CREATE TYPE attendance_source AS ENUM (
             'discord_voice','discord_stage','x_space','in_app'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_state') THEN
           CREATE TYPE attendance_state AS ENUM ('join','heartbeat','leave');
         END IF;
       END$$`,
      `CREATE TABLE IF NOT EXISTS attendance_events (
         id             serial PRIMARY KEY,
         user_id        integer REFERENCES users(id) ON DELETE CASCADE,
         event_id       integer REFERENCES gameshow_events(id) ON DELETE SET NULL,
         source         attendance_source NOT NULL,
         state          attendance_state NOT NULL,
         discord_user_id    varchar(100),
         discord_guild_id   varchar(100),
         discord_channel_id varchar(100),
         external_ref   varchar(200),
         payload_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
         observed_at    timestamp NOT NULL DEFAULT NOW(),
         created_at     timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS attendance_events_user_observed_idx
         ON attendance_events (user_id, observed_at DESC)`,
      `CREATE INDEX IF NOT EXISTS attendance_events_event_idx
         ON attendance_events (event_id, observed_at)`,
      `CREATE INDEX IF NOT EXISTS attendance_events_source_state_idx
         ON attendance_events (source, state, observed_at DESC)`,
      `CREATE INDEX IF NOT EXISTS attendance_events_discord_user_idx
         ON attendance_events (discord_user_id, observed_at DESC)`,
      `ALTER TABLE gameshow_events
         ADD COLUMN IF NOT EXISTS discord_scheduled_event_id varchar(100)`,
      `ALTER TABLE gameshow_events
         ADD COLUMN IF NOT EXISTS discord_guild_id varchar(100)`,
      `CREATE INDEX IF NOT EXISTS gameshow_events_discord_sched_idx
         ON gameshow_events (discord_scheduled_event_id)
         WHERE discord_scheduled_event_id IS NOT NULL`,

      // ── Phase 5: X attendance + CRP nomination verifier ───────────
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum
           WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
             AND enumlabel = 'x_space_attendance'
         ) THEN
           ALTER TYPE auto_verify_type ADD VALUE 'x_space_attendance';
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum
           WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
             AND enumlabel = 'x_hashtag_post'
         ) THEN
           ALTER TYPE auto_verify_type ADD VALUE 'x_hashtag_post';
         END IF;
       END$$`,
      `ALTER TABLE side_quests
         ADD COLUMN IF NOT EXISTS auto_verify_config jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `CREATE TABLE IF NOT EXISTS crp_nominations (
         id                  serial PRIMARY KEY,
         side_quest_id       integer NOT NULL REFERENCES side_quests(id) ON DELETE CASCADE,
         nominator_user_id   integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         nominator_x_id      varchar(100) NOT NULL,
         post_id             varchar(100) NOT NULL,
         post_url            text NOT NULL,
         nominee_handles     jsonb NOT NULL DEFAULT '[]'::jsonb,
         unique_nominee_count integer NOT NULL DEFAULT 0,
         reward_count        integer NOT NULL DEFAULT 0,
         observed_at         timestamp NOT NULL DEFAULT NOW(),
         created_at          timestamp NOT NULL DEFAULT NOW()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS crp_nominations_quest_post_unique_idx
         ON crp_nominations (side_quest_id, post_id)`,
      `CREATE INDEX IF NOT EXISTS crp_nominations_nominator_idx
         ON crp_nominations (nominator_user_id, observed_at DESC)`,
      `CREATE INDEX IF NOT EXISTS crp_nominations_quest_observed_idx
         ON crp_nominations (side_quest_id, observed_at DESC)`,

      // ───── Phase 6 — Console hi-score infrastructure ─────

      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'console_verification_mode') THEN
           CREATE TYPE console_verification_mode AS ENUM (
             'parent_postmessage',
             'server_hmac',
             'manual'
           );
         END IF;
       END$$`,

      `CREATE TABLE IF NOT EXISTS console_games (
         id                serial PRIMARY KEY,
         slug              varchar(120) NOT NULL UNIQUE,
         title             varchar(200) NOT NULL,
         description       text NOT NULL DEFAULT '',
         category          varchar(80) NOT NULL DEFAULT 'general',
         embed_path        text NOT NULL,
         verification_mode console_verification_mode NOT NULL DEFAULT 'parent_postmessage',
         weird_variant_of  varchar(120),
         hmac_secret       varchar(200),
         created_by        integer REFERENCES users(id) ON DELETE SET NULL,
         active            boolean NOT NULL DEFAULT true,
         created_at        timestamp NOT NULL DEFAULT NOW(),
         updated_at        timestamp NOT NULL DEFAULT NOW()
       )`,

      `CREATE INDEX IF NOT EXISTS console_games_category_active_idx
         ON console_games (category, active)`,

      `CREATE TABLE IF NOT EXISTS console_play_tickets (
         id            serial PRIMARY KEY,
         game_id       integer NOT NULL REFERENCES console_games(id) ON DELETE CASCADE,
         user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         run_id        varchar(80) NOT NULL UNIQUE,
         issued_at     timestamp NOT NULL DEFAULT NOW(),
         expires_at    timestamp NOT NULL,
         used_at       timestamp,
         user_agent    text,
         ip            varchar(64)
       )`,

      `CREATE INDEX IF NOT EXISTS console_play_tickets_user_idx
         ON console_play_tickets (user_id, issued_at DESC)`,

      `CREATE TABLE IF NOT EXISTS console_scores (
         id                   serial PRIMARY KEY,
         game_id              integer NOT NULL REFERENCES console_games(id) ON DELETE CASCADE,
         user_id              integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         score                bigint NOT NULL,
         run_id               varchar(80),
         ticket_payload_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
         valid                boolean NOT NULL DEFAULT true,
         reject_reason        text,
         verification_mode    console_verification_mode NOT NULL,
         submitted_at         timestamp NOT NULL DEFAULT NOW()
       )`,

      `CREATE INDEX IF NOT EXISTS console_scores_game_score_idx
         ON console_scores (game_id, score DESC)
         WHERE valid`,

      `CREATE INDEX IF NOT EXISTS console_scores_user_idx
         ON console_scores (user_id, submitted_at DESC)`,

      `CREATE UNIQUE INDEX IF NOT EXISTS console_scores_run_unique_idx
         ON console_scores (run_id)
         WHERE run_id IS NOT NULL`,

      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum
           WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
             AND enumlabel = 'console_hiscore'
         ) THEN
           ALTER TYPE auto_verify_type ADD VALUE 'console_hiscore';
         END IF;
       END$$`,

      // ───── Phase 7 — Mint Portal + tag detection ─────
      `ALTER TABLE challenges
         ADD COLUMN IF NOT EXISTS submission_contract varchar(36)`,
      `ALTER TABLE challenges
         ADD COLUMN IF NOT EXISTS submission_tag varchar(120)`,
      `ALTER TABLE challenges
         ADD COLUMN IF NOT EXISTS submission_curation varchar(120)`,
      `CREATE INDEX IF NOT EXISTS challenges_submission_contract_idx
         ON challenges (submission_contract)
         WHERE submission_contract IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS challenges_submission_tag_idx
         ON challenges (submission_tag)
         WHERE submission_tag IS NOT NULL`,
      `ALTER TABLE challenge_submissions
         ADD COLUMN IF NOT EXISTS source varchar(40) NOT NULL DEFAULT 'manual'`,
      `ALTER TABLE challenge_submissions
         ADD COLUMN IF NOT EXISTS mint_token_contract varchar(36)`,
      `ALTER TABLE challenge_submissions
         ADD COLUMN IF NOT EXISTS mint_token_id varchar(100)`,
      `ALTER TABLE challenge_submissions
         ADD COLUMN IF NOT EXISTS mint_op_hash varchar(80)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS challenge_submissions_mint_unique_idx
         ON challenge_submissions (challenge_id, mint_token_contract, mint_token_id)
         WHERE mint_token_contract IS NOT NULL
           AND mint_token_id IS NOT NULL`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum
           WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
             AND enumlabel = 'mint_with_tag'
         ) THEN
           ALTER TYPE auto_verify_type ADD VALUE 'mint_with_tag';
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum
           WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
             AND enumlabel = 'mint_in_curation'
         ) THEN
           ALTER TYPE auto_verify_type ADD VALUE 'mint_in_curation';
         END IF;
       END$$`,

      // ───── Phase 8 — WTF Contract Factory + 5 templates ─────
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_template_kind') THEN
           CREATE TYPE collection_template_kind AS ENUM (
             'teia_one_of_one',
             'open_edition',
             'bonding_curve',
             'blind_mint',
             'buyback'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_contract_network') THEN
           CREATE TYPE collection_contract_network AS ENUM (
             'ghostnet',
             'shadownet',
             'mainnet'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_contract_status') THEN
           CREATE TYPE collection_contract_status AS ENUM (
             'pending',
             'originating',
             'live',
             'failed',
             'retired'
           );
         END IF;
       END$$`,
      `CREATE TABLE IF NOT EXISTS collection_templates (
         id             serial PRIMARY KEY,
         kind           collection_template_kind NOT NULL UNIQUE,
         label          varchar(120) NOT NULL,
         summary        text,
         source_path    varchar(400) NOT NULL,
         created_at     timestamp NOT NULL DEFAULT now(),
         updated_at     timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE TABLE IF NOT EXISTS collection_contracts (
         id                  serial PRIMARY KEY,
         template_kind       collection_template_kind NOT NULL,
         name                varchar(140) NOT NULL,
         address             varchar(40),
         network             collection_contract_network NOT NULL,
         status              collection_contract_status NOT NULL DEFAULT 'pending',
         collection_meta     jsonb,
         origination_params  jsonb,
         op_hash             varchar(80),
         deployed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
         operator_run_id     integer,
         error_message       text,
         deployed_at         timestamp,
         retired_at          timestamp,
         created_at          timestamp NOT NULL DEFAULT now(),
         updated_at          timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS collection_contracts_address_unique_idx
         ON collection_contracts (address, network)
         WHERE address IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS collection_contracts_template_idx
         ON collection_contracts (template_kind)`,
      `CREATE INDEX IF NOT EXISTS collection_contracts_network_status_idx
         ON collection_contracts (network, status)`,
      `INSERT INTO collection_templates (kind, label, summary, source_path)
       VALUES
         ('teia_one_of_one', 'Teia-style 1/1',
           'Single-edition FA2 mints, per-token royalty, allowlist-capable.',
           'building/shadownet kiln/contracts/wtf-collections/WtfAllowlistFA2.py'),
         ('open_edition', 'Open Edition',
           'Fixed-price, time-bounded, unlimited-supply FA2 open editions.',
           'building/shadownet kiln/contracts/wtf-collections/WtfOpenEditionFA2.py'),
         ('bonding_curve', 'Bonding Curve',
           'FA2 mints priced by base + (minted / step_size) * increment.',
           'building/shadownet kiln/contracts/wtf-collections/WtfBondingCurveFA2.py'),
         ('blind_mint', 'Blind Mint (commit-reveal)',
           'Admin commits Merkle root of a shuffled bundle; each mint reveals one entry.',
           'building/shadownet kiln/contracts/wtf-collections/WtfBlindMintFA2.py'),
         ('buyback', 'WTF-for-XTZ Buyback',
           'Closed, time-bounded, allowlist-gated buyback contract (Phase 10 engine).',
           'building/shadownet kiln/contracts/wtf-buyback/WtfBuybackV1.py')
       ON CONFLICT (kind) DO UPDATE SET
         label       = EXCLUDED.label,
         summary     = EXCLUDED.summary,
         source_path = EXCLUDED.source_path,
         updated_at  = now()`,

      // ───── Phase 9 — operator wallet + signer tracking ─────
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_wallet_intent') THEN
           CREATE TYPE operator_wallet_intent AS ENUM (
             'disburse_wtf',
             'fund_buyback',
             'withdraw_buyback_xtz',
             'withdraw_buyback_wtf',
             'pause_buyback',
             'unpause_buyback',
             'custom'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_wallet_asset_kind') THEN
           CREATE TYPE operator_wallet_asset_kind AS ENUM ('fa2', 'xtz');
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_wallet_run_status') THEN
           CREATE TYPE operator_wallet_run_status AS ENUM (
             'prepared',
             'broadcasting',
             'confirmed',
             'failed',
             'cancelled'
           );
         END IF;
       END$$`,
      `CREATE TABLE IF NOT EXISTS operator_wallet_runs (
         id                    serial PRIMARY KEY,
         prepared_by           integer REFERENCES users(id) ON DELETE SET NULL,
         signed_by             varchar(80),
         op_hash               varchar(80),
         intent                operator_wallet_intent NOT NULL,
         asset_kind            operator_wallet_asset_kind NOT NULL,
         asset_contract        varchar(40),
         asset_token_id        varchar(40),
         total_recipients      integer NOT NULL DEFAULT 0,
         total_amount          numeric(40, 0) NOT NULL DEFAULT 0,
         counterparty_contract varchar(40),
         payload               jsonb,
         started_at            timestamp NOT NULL DEFAULT now(),
         finished_at           timestamp,
         status                operator_wallet_run_status NOT NULL DEFAULT 'prepared',
         error_message         text,
         notes                 text
       )`,
      `CREATE INDEX IF NOT EXISTS operator_wallet_runs_status_idx
         ON operator_wallet_runs (status)`,
      `CREATE INDEX IF NOT EXISTS operator_wallet_runs_intent_idx
         ON operator_wallet_runs (intent, started_at DESC)`,
      `ALTER TABLE reward_ledger
         ADD COLUMN IF NOT EXISTS operator_wallet_run_id integer
         REFERENCES operator_wallet_runs(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS reward_ledger_operator_run_idx
         ON reward_ledger (operator_wallet_run_id)`,
      `CREATE TABLE IF NOT EXISTS operator_wallet_balances (
         id             serial PRIMARY KEY,
         asset_kind     operator_wallet_asset_kind NOT NULL,
         asset_contract varchar(40),
         asset_token_id varchar(40),
         balance        numeric(40, 0) NOT NULL DEFAULT 0,
         low_threshold  numeric(40, 0),
         checked_at     timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS operator_wallet_balances_asset_idx
         ON operator_wallet_balances (asset_kind, COALESCE(asset_contract, ''), COALESCE(asset_token_id, ''))`,
      // ── Phase 10 — WTF recapture ────────────────────────────
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_enum e
                        JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = 'auto_verify_type'
                          AND e.enumlabel = 'wtf_swapped_in_buyback') THEN
           ALTER TYPE auto_verify_type ADD VALUE 'wtf_swapped_in_buyback';
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_enum e
                        JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = 'auto_verify_type'
                          AND e.enumlabel = 'wtf_paid_to_operator_at_least') THEN
           ALTER TYPE auto_verify_type ADD VALUE 'wtf_paid_to_operator_at_least';
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'buyback_window_status') THEN
           CREATE TYPE buyback_window_status AS ENUM (
             'draft','funded','open','closed','swept','cancelled'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wtf_auction_status') THEN
           CREATE TYPE wtf_auction_status AS ENUM (
             'draft','live','ended','settled','cancelled'
           );
         END IF;
       END$$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'side_quest_entry_fee_status') THEN
           CREATE TYPE side_quest_entry_fee_status AS ENUM (
             'pending','confirmed','refunded'
           );
         END IF;
       END$$`,
      `ALTER TABLE seasons
         ADD COLUMN IF NOT EXISTS ante_wtf_required numeric(40, 0) NOT NULL DEFAULT 0`,
      `ALTER TABLE season_contestants
         ADD COLUMN IF NOT EXISTS ante_paid_wtf numeric(40, 0) NOT NULL DEFAULT 0`,
      `ALTER TABLE season_contestants
         ADD COLUMN IF NOT EXISTS ante_op_hash varchar(80)`,
      `ALTER TABLE season_contestants
         ADD COLUMN IF NOT EXISTS ante_paid_at timestamp`,
      `ALTER TABLE side_quests
         ADD COLUMN IF NOT EXISTS entry_fee_wtf numeric(40, 0) NOT NULL DEFAULT 0`,
      `ALTER TABLE side_quests
         ADD COLUMN IF NOT EXISTS auto_verify_config jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `CREATE TABLE IF NOT EXISTS buyback_windows (
         id                       serial PRIMARY KEY,
         label                    varchar(120) NOT NULL,
         contract_address         varchar(40) NOT NULL,
         network                  collection_contract_network NOT NULL DEFAULT 'ghostnet',
         status                   buyback_window_status NOT NULL DEFAULT 'draft',
         rate_mutez_per_wtf       numeric(40, 0) NOT NULL,
         per_seller_cap_wtf       numeric(40, 0) NOT NULL,
         total_xtz_budget_mutez   numeric(40, 0) NOT NULL,
         opens_at                 timestamp NOT NULL,
         closes_at                timestamp NOT NULL,
         merkle_root              varchar(80),
         snapshot_min_balance_wtf numeric(40, 0) NOT NULL DEFAULT 0,
         snapshot_block_level     integer,
         created_by_user_id       integer REFERENCES users(id) ON DELETE SET NULL,
         operator_fund_run_id     integer REFERENCES operator_wallet_runs(id) ON DELETE SET NULL,
         operator_withdraw_xtz_run_id integer REFERENCES operator_wallet_runs(id) ON DELETE SET NULL,
         operator_withdraw_wtf_run_id integer REFERENCES operator_wallet_runs(id) ON DELETE SET NULL,
         swaps_observed           integer NOT NULL DEFAULT 0,
         wtf_recaptured           numeric(40, 0) NOT NULL DEFAULT 0,
         xtz_dispensed_mutez      numeric(40, 0) NOT NULL DEFAULT 0,
         notes                    text,
         created_at               timestamp NOT NULL DEFAULT now(),
         updated_at               timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS buyback_windows_status_idx ON buyback_windows(status)`,
      `CREATE INDEX IF NOT EXISTS buyback_windows_opens_at_idx ON buyback_windows(opens_at)`,
      `CREATE TABLE IF NOT EXISTS buyback_allowlist (
         id                    serial PRIMARY KEY,
         window_id             integer NOT NULL REFERENCES buyback_windows(id) ON DELETE CASCADE,
         wallet_address        varchar(40) NOT NULL,
         user_id               integer REFERENCES users(id) ON DELETE SET NULL,
         max_wtf               numeric(40, 0) NOT NULL,
         snapshot_balance_wtf  numeric(40, 0) NOT NULL,
         merkle_proof          jsonb NOT NULL,
         eligibility_reason    varchar(40) NOT NULL,
         swapped_wtf           numeric(40, 0) NOT NULL DEFAULT 0,
         swapped_at            timestamp,
         swap_op_hash          varchar(80),
         created_at            timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS buyback_allowlist_unique_idx
         ON buyback_allowlist(window_id, wallet_address)`,
      `CREATE INDEX IF NOT EXISTS buyback_allowlist_user_idx
         ON buyback_allowlist(user_id)`,
      `CREATE TABLE IF NOT EXISTS wtf_auctions (
         id                serial PRIMARY KEY,
         title             varchar(200) NOT NULL,
         description       text,
         perk_kind         varchar(60) NOT NULL,
         starts_at         timestamp NOT NULL,
         ends_at           timestamp NOT NULL,
         min_bid_wtf       numeric(40, 0) NOT NULL DEFAULT 1,
         bid_increment_wtf numeric(40, 0) NOT NULL DEFAULT 1,
         status            wtf_auction_status NOT NULL DEFAULT 'draft',
         winning_bid_id    integer,
         settlement_op_hash varchar(80),
         created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
         created_at        timestamp NOT NULL DEFAULT now(),
         updated_at        timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS wtf_auctions_status_idx ON wtf_auctions(status)`,
      `CREATE INDEX IF NOT EXISTS wtf_auctions_ends_at_idx ON wtf_auctions(ends_at)`,
      `CREATE TABLE IF NOT EXISTS wtf_auction_bids (
         id             serial PRIMARY KEY,
         auction_id     integer NOT NULL REFERENCES wtf_auctions(id) ON DELETE CASCADE,
         user_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         wallet_address varchar(40) NOT NULL,
         amount_wtf     numeric(40, 0) NOT NULL,
         created_at     timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS wtf_auction_bids_auction_idx
         ON wtf_auction_bids(auction_id, amount_wtf DESC)`,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'wtf_auctions_winning_bid_fk'
         ) THEN
           ALTER TABLE wtf_auctions
             ADD CONSTRAINT wtf_auctions_winning_bid_fk
             FOREIGN KEY (winning_bid_id) REFERENCES wtf_auction_bids(id)
             ON DELETE SET NULL;
         END IF;
       END$$`,
      `CREATE TABLE IF NOT EXISTS side_quest_entry_fees (
         id             serial PRIMARY KEY,
         side_quest_id  integer NOT NULL REFERENCES side_quests(id) ON DELETE CASCADE,
         user_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         wallet_address varchar(40) NOT NULL,
         amount_wtf     numeric(40, 0) NOT NULL,
         status         side_quest_entry_fee_status NOT NULL DEFAULT 'pending',
         op_hash        varchar(80),
         confirmed_at   timestamp,
         created_at     timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS side_quest_entry_fees_unique_idx
         ON side_quest_entry_fees(side_quest_id, user_id)`,
      `CREATE INDEX IF NOT EXISTS side_quest_entry_fees_status_idx
         ON side_quest_entry_fees(status)`,
      `CREATE TABLE IF NOT EXISTS wtf_recapture_events (
         id             bigserial PRIMARY KEY,
         user_id        integer REFERENCES users(id) ON DELETE SET NULL,
         wallet_address varchar(40) NOT NULL,
         source         varchar(40) NOT NULL,
         source_ref_id  integer,
         amount_wtf     numeric(40, 0) NOT NULL,
         op_hash        varchar(80),
         observed_at    timestamp NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS wtf_recapture_events_user_idx
         ON wtf_recapture_events(user_id, observed_at DESC)`,
      `CREATE INDEX IF NOT EXISTS wtf_recapture_events_source_idx
         ON wtf_recapture_events(source, observed_at DESC)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS wtf_recapture_events_op_hash_idx
         ON wtf_recapture_events(op_hash, wallet_address)
         WHERE op_hash IS NOT NULL`,
    ];

    for (const sql of ddl) {
      try {
        await client.query(sql);
      } catch (err) {
        console.warn(
          "[gameshow-boot] ddl warning:",
          (err as Error)?.message || err
        );
      }
    }

    // Seed the two Phase 6 reference "WTF Games" cartridges. Idempotent —
    // row only inserted when the slug is absent so operator edits stick.
    const seeds = [
      {
        slug: "inverse-snake",
        title: "Inverse Snake",
        description:
          "The apple chases you. Survive the apple. Score ticks up every second you stay alive.",
        category: "wtf-games",
        embed_path: "/games/wtf/inverse-snake/index.html",
        weird_variant_of: "snake",
      },
      {
        slug: "backwards-pong",
        title: "Backwards Pong",
        description:
          "The ball pulls your paddle. Try to keep the ball on screen anyway.",
        category: "wtf-games",
        embed_path: "/games/wtf/backwards-pong/index.html",
        weird_variant_of: "pong",
      },
    ];

    for (const g of seeds) {
      try {
        await client.query(
          `INSERT INTO console_games
             (slug, title, description, category, embed_path,
              verification_mode, weird_variant_of, active)
           VALUES ($1,$2,$3,$4,$5,'parent_postmessage',$6,true)
           ON CONFLICT (slug) DO NOTHING`,
          [
            g.slug,
            g.title,
            g.description,
            g.category,
            g.embed_path,
            g.weird_variant_of,
          ]
        );
      } catch (err) {
        console.warn(
          `[gameshow-boot] console_games seed ${g.slug} failed:`,
          (err as Error)?.message || err
        );
      }
    }
  } finally {
    client.release();
  }
}
