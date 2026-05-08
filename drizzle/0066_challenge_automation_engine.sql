CREATE TABLE IF NOT EXISTS "challenge_system_events" (
  "id" serial PRIMARY KEY,
  "event_id" varchar(140) NOT NULL,
  "event_type" varchar(140) NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "wallet_address" varchar(64),
  "source" varchar(80) NOT NULL,
  "source_module" varchar(80),
  "raw_ref_type" varchar(80),
  "raw_ref_id" varchar(160),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "challenge_system_events_event_id_idx"
  ON "challenge_system_events" ("event_id");
CREATE INDEX IF NOT EXISTS "challenge_system_events_type_time_idx"
  ON "challenge_system_events" ("event_type", "occurred_at");
CREATE INDEX IF NOT EXISTS "challenge_system_events_user_type_time_idx"
  ON "challenge_system_events" ("user_id", "event_type", "occurred_at");
CREATE INDEX IF NOT EXISTS "challenge_system_events_wallet_time_idx"
  ON "challenge_system_events" ("wallet_address", "occurred_at");
CREATE INDEX IF NOT EXISTS "challenge_system_events_raw_ref_idx"
  ON "challenge_system_events" ("raw_ref_type", "raw_ref_id");

CREATE TABLE IF NOT EXISTS "challenge_automation_definitions" (
  "id" serial PRIMARY KEY,
  "title" varchar(260) NOT NULL,
  "description" text,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "start_time" timestamp with time zone,
  "end_time" timestamp with time zone,
  "eligibility_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "condition_tree" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reward_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "repeatability" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "per_user_completion_limit" integer DEFAULT 1 NOT NULL,
  "global_completion_limit" integer,
  "summary" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "challenge_automation_status_time_idx"
  ON "challenge_automation_definitions" ("status", "start_time", "end_time");
CREATE INDEX IF NOT EXISTS "challenge_automation_created_by_idx"
  ON "challenge_automation_definitions" ("created_by");
CREATE UNIQUE INDEX IF NOT EXISTS "challenge_automation_seed_key_idx"
  ON "challenge_automation_definitions" (("metadata"->>'seedKey'))
  WHERE "metadata"->>'seedKey' IS NOT NULL;

CREATE TABLE IF NOT EXISTS "challenge_automation_progress" (
  "id" serial PRIMARY KEY,
  "challenge_id" integer NOT NULL REFERENCES "challenge_automation_definitions"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wallet_address" varchar(64),
  "state" varchar(24) DEFAULT 'in_progress' NOT NULL,
  "counted_events" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "satisfied_condition_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "first_event_at" timestamp with time zone,
  "last_event_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "reward_status" varchar(24) DEFAULT 'pending' NOT NULL,
  "audit_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "challenge_automation_progress_user_idx"
  ON "challenge_automation_progress" ("challenge_id", "user_id");
CREATE INDEX IF NOT EXISTS "challenge_automation_progress_state_idx"
  ON "challenge_automation_progress" ("challenge_id", "state");
CREATE INDEX IF NOT EXISTS "challenge_automation_progress_user_time_idx"
  ON "challenge_automation_progress" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "challenge_automation_completions" (
  "id" serial PRIMARY KEY,
  "challenge_id" integer NOT NULL REFERENCES "challenge_automation_definitions"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "progress_id" integer REFERENCES "challenge_automation_progress"("id") ON DELETE SET NULL,
  "completion_key" varchar(160) DEFAULT 'default' NOT NULL,
  "reward_status" varchar(24) DEFAULT 'pending' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "rewarded_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "challenge_automation_completion_unique_idx"
  ON "challenge_automation_completions" ("challenge_id", "user_id", "completion_key");
CREATE INDEX IF NOT EXISTS "challenge_automation_completion_user_time_idx"
  ON "challenge_automation_completions" ("user_id", "completed_at");

CREATE TABLE IF NOT EXISTS "challenge_automation_action_logs" (
  "id" serial PRIMARY KEY,
  "challenge_id" integer NOT NULL REFERENCES "challenge_automation_definitions"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "completion_id" integer REFERENCES "challenge_automation_completions"("id") ON DELETE CASCADE,
  "action_key" varchar(80) NOT NULL,
  "action_index" integer DEFAULT 0 NOT NULL,
  "idempotency_key" varchar(220) NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "result_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "challenge_automation_action_idempotency_idx"
  ON "challenge_automation_action_logs" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "challenge_automation_action_completion_idx"
  ON "challenge_automation_action_logs" ("completion_id");
CREATE INDEX IF NOT EXISTS "challenge_automation_action_status_idx"
  ON "challenge_automation_action_logs" ("status");

CREATE TABLE IF NOT EXISTS "challenge_automation_audit_logs" (
  "id" serial PRIMARY KEY,
  "challenge_id" integer REFERENCES "challenge_automation_definitions"("id") ON DELETE SET NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "system_event_id" integer REFERENCES "challenge_system_events"("id") ON DELETE SET NULL,
  "progress_id" integer REFERENCES "challenge_automation_progress"("id") ON DELETE SET NULL,
  "action" varchar(80) NOT NULL,
  "status" varchar(24) DEFAULT 'info' NOT NULL,
  "message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "challenge_automation_audit_challenge_time_idx"
  ON "challenge_automation_audit_logs" ("challenge_id", "created_at");
CREATE INDEX IF NOT EXISTS "challenge_automation_audit_user_time_idx"
  ON "challenge_automation_audit_logs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "challenge_automation_audit_event_idx"
  ON "challenge_automation_audit_logs" ("system_event_id");

INSERT INTO "challenge_automation_definitions" (
  "title",
  "description",
  "status",
  "condition_tree",
  "reward_actions",
  "repeatability",
  "per_user_completion_limit",
  "summary",
  "metadata"
) VALUES
(
  'Example: Messageboard Regular',
  'Post 10 times on the messageboard and at least once in the configured channel, then award EXP.',
  'draft',
  '{
    "id": "root",
    "type": "group",
    "operator": "all",
    "children": [
      {
        "id": "board-posts-10",
        "type": "event",
        "triggerKey": "messageboard.post.created",
        "eventTypes": ["messageboard.post.created"],
        "comparator": "count_gte",
        "threshold": 10
      },
      {
        "id": "board-channel-once",
        "type": "event",
        "triggerKey": "messageboard.channel.post.created",
        "eventTypes": ["messageboard.channel.post.created"],
        "comparator": "exists",
        "filters": { "metadata": { "channelId": 1 } }
      }
    ]
  }'::jsonb,
  '[{
    "key": "award_exp",
    "params": {
      "amount": 50,
      "reason": "messageboard_regular_challenge"
    }
  }]'::jsonb,
  '{"mode": "once"}'::jsonb,
  1,
  'Complete this challenge by posting at least 10 times on the messageboard and posting at least once in channel #1. Reward: 50 EXP.',
  '{"seedKey": "messageboard_regular_v1", "example": true}'::jsonb
),
(
  'Example: FA2 Token Holder Unlock',
  'Own a specific FA2 token id, then unlock a configured inventory reward.',
  'draft',
  '{
    "id": "root",
    "type": "group",
    "operator": "all",
    "children": [
      {
        "id": "owns-fa2-token",
        "type": "predicate",
        "predicateKey": "tezos.owns_specific_token_id",
        "params": {
          "contractAddress": "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
          "tokenId": "3",
          "minimumQuantity": 1
        }
      }
    ]
  }'::jsonb,
  '[{
    "key": "unlock_inventory_item",
    "params": {
      "sku": "fa2-holder-unlock",
      "quantity": 1,
      "metadata": { "source": "challenge_automation_seed" }
    }
  }, {
    "key": "create_notification",
    "params": {
      "title": "Challenge reward unlocked",
      "body": "Your FA2 ownership challenge reward has been unlocked."
    }
  }]'::jsonb,
  '{"mode": "once"}'::jsonb,
  1,
  'Complete this challenge by owning token #3 from the configured FA2 contract. Reward: unlock the configured inventory item.',
  '{"seedKey": "fa2_specific_token_unlock_v1", "example": true}'::jsonb
),
(
  'Example: 3 Interactions In 24 Hours',
  'Complete any 3 tracked app interactions within 24 hours, then award WTF and EXP.',
  'draft',
  '{
    "id": "root",
    "type": "group",
    "operator": "all",
    "children": [
      {
        "id": "three-tracked-interactions",
        "type": "event",
        "triggerKey": "app.interaction.tracked",
        "eventTypes": ["app.interaction.tracked"],
        "comparator": "count_gte",
        "threshold": 3,
        "window": { "amount": 24, "unit": "hour" }
      }
    ]
  }'::jsonb,
  '[{
    "key": "award_exp",
    "params": {
      "amount": 50,
      "reason": "daily_interaction_challenge"
    }
  }, {
    "key": "queue_wtf_reward",
    "params": {
      "amountWtf": 10,
      "reason": "3 tracked interactions in 24 hours"
    }
  }]'::jsonb,
  '{"mode": "daily"}'::jsonb,
  1,
  'Complete this challenge by finishing any 3 tracked app interactions within 24 hours. Reward: 50 EXP and 10 WTF.',
  '{"seedKey": "three_interactions_24h_v1", "example": true}'::jsonb
)
ON CONFLICT DO NOTHING;
