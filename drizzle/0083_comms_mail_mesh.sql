CREATE TYPE "public"."communication_source_kind" AS ENUM(
  'mail',
  'dm',
  'board',
  'w',
  'telegram',
  'dicksword',
  'bluesky',
  'mastodon',
  'objkt',
  'tezos_domains',
  'hackchat',
  'system'
);

CREATE TYPE "public"."communication_item_kind" AS ENUM(
  'email',
  'dm',
  'board_post',
  'external_post',
  'notification',
  'system'
);

CREATE TYPE "public"."mail_mailbox_status" AS ENUM(
  'reserved',
  'active',
  'suspended',
  'revoked'
);

CREATE TYPE "public"."mail_message_direction" AS ENUM('inbound', 'outbound');

CREATE TYPE "public"."mail_message_status" AS ENUM(
  'received',
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed'
);

CREATE TABLE IF NOT EXISTS "communication_sources" (
  "id" serial PRIMARY KEY,
  "key" varchar(80) NOT NULL UNIQUE,
  "label" varchar(160) NOT NULL,
  "source_kind" "communication_source_kind" NOT NULL,
  "adapter_key" varchar(80) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "read_only" boolean DEFAULT true NOT NULL,
  "route_base" varchar(240),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "communication_sources_kind_idx"
  ON "communication_sources" ("source_kind", "enabled");
CREATE INDEX IF NOT EXISTS "communication_sources_adapter_idx"
  ON "communication_sources" ("adapter_key");

CREATE TABLE IF NOT EXISTS "communication_identities" (
  "id" serial PRIMARY KEY,
  "user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
  "source_id" integer NOT NULL REFERENCES "public"."communication_sources"("id") ON DELETE cascade,
  "identity_key" varchar(240) NOT NULL,
  "display_name" varchar(240),
  "handle" varchar(240),
  "profile_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "communication_identity_source_key_idx"
  ON "communication_identities" ("source_id", "identity_key");
CREATE INDEX IF NOT EXISTS "communication_identity_user_idx"
  ON "communication_identities" ("user_id");
CREATE INDEX IF NOT EXISTS "communication_identity_handle_idx"
  ON "communication_identities" ("handle");

CREATE TABLE IF NOT EXISTS "communication_threads" (
  "id" serial PRIMARY KEY,
  "source_id" integer NOT NULL REFERENCES "public"."communication_sources"("id") ON DELETE cascade,
  "external_thread_ref" varchar(260) NOT NULL,
  "title" varchar(260) NOT NULL,
  "route_path" varchar(400),
  "origin_url" text,
  "last_item_at" timestamp DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "communication_threads_source_ref_idx"
  ON "communication_threads" ("source_id", "external_thread_ref");
CREATE INDEX IF NOT EXISTS "communication_threads_last_item_idx"
  ON "communication_threads" ("last_item_at");

CREATE TABLE IF NOT EXISTS "communication_items" (
  "id" serial PRIMARY KEY,
  "source_id" integer NOT NULL REFERENCES "public"."communication_sources"("id") ON DELETE cascade,
  "thread_id" integer REFERENCES "public"."communication_threads"("id") ON DELETE set null,
  "target_user_id" integer REFERENCES "public"."users"("id") ON DELETE cascade,
  "actor_identity_id" integer REFERENCES "public"."communication_identities"("id") ON DELETE set null,
  "external_ref" varchar(260) NOT NULL,
  "item_kind" "communication_item_kind" NOT NULL,
  "title" varchar(260) NOT NULL,
  "summary" text,
  "body" text,
  "author_label" varchar(240),
  "route_path" varchar(400),
  "origin_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "communication_items_source_ref_idx"
  ON "communication_items" ("source_id", "external_ref");
CREATE INDEX IF NOT EXISTS "communication_items_target_time_idx"
  ON "communication_items" ("target_user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "communication_items_source_time_idx"
  ON "communication_items" ("source_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "communication_items_kind_time_idx"
  ON "communication_items" ("item_kind", "occurred_at");

CREATE TABLE IF NOT EXISTS "communication_read_states" (
  "id" serial PRIMARY KEY,
  "item_id" integer NOT NULL REFERENCES "public"."communication_items"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "read_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "communication_read_item_user_idx"
  ON "communication_read_states" ("item_id", "user_id");
CREATE INDEX IF NOT EXISTS "communication_read_user_idx"
  ON "communication_read_states" ("user_id", "read_at");

CREATE TABLE IF NOT EXISTS "communication_links" (
  "id" serial PRIMARY KEY,
  "item_id" integer NOT NULL REFERENCES "public"."communication_items"("id") ON DELETE cascade,
  "link_kind" varchar(60) NOT NULL,
  "label" varchar(180) NOT NULL,
  "route_path" varchar(400),
  "external_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "communication_links_item_idx"
  ON "communication_links" ("item_id");
CREATE INDEX IF NOT EXISTS "communication_links_kind_idx"
  ON "communication_links" ("link_kind");

CREATE TABLE IF NOT EXISTS "mail_mailboxes" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "local_part" varchar(63) NOT NULL,
  "domain" varchar(255) NOT NULL,
  "address" varchar(320) NOT NULL UNIQUE,
  "status" "mail_mailbox_status" DEFAULT 'reserved' NOT NULL,
  "wtf_subdomain_grant_id" integer REFERENCES "public"."wtf_subdomain_grants"("id") ON DELETE set null,
  "provisioned_at" timestamp,
  "revoked_at" timestamp,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mail_mailboxes_local_domain_idx"
  ON "mail_mailboxes" ("local_part", "domain");
CREATE INDEX IF NOT EXISTS "mail_mailboxes_user_idx"
  ON "mail_mailboxes" ("user_id");
CREATE INDEX IF NOT EXISTS "mail_mailboxes_status_idx"
  ON "mail_mailboxes" ("status");

CREATE TABLE IF NOT EXISTS "mail_messages" (
  "id" serial PRIMARY KEY,
  "mailbox_id" integer NOT NULL REFERENCES "public"."mail_mailboxes"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "direction" "mail_message_direction" NOT NULL,
  "status" "mail_message_status" NOT NULL,
  "provider" varchar(40) DEFAULT 'resend' NOT NULL,
  "provider_message_id" varchar(240),
  "message_id_header" varchar(320),
  "from_address" varchar(320) NOT NULL,
  "from_name" varchar(240),
  "to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "bcc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subject" varchar(500) NOT NULL,
  "text_body" text,
  "html_body" text,
  "comms_item_id" integer REFERENCES "public"."communication_items"("id") ON DELETE set null,
  "raw_payload" jsonb,
  "received_at" timestamp,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mail_messages_user_created_idx"
  ON "mail_messages" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "mail_messages_mailbox_created_idx"
  ON "mail_messages" ("mailbox_id", "created_at");
CREATE INDEX IF NOT EXISTS "mail_messages_provider_idx"
  ON "mail_messages" ("provider", "provider_message_id");
CREATE INDEX IF NOT EXISTS "mail_messages_status_idx"
  ON "mail_messages" ("status");

CREATE TABLE IF NOT EXISTS "mail_attachments" (
  "id" serial PRIMARY KEY,
  "message_id" integer NOT NULL REFERENCES "public"."mail_messages"("id") ON DELETE cascade,
  "filename" varchar(260) NOT NULL,
  "content_type" varchar(160),
  "byte_size" integer,
  "provider_attachment_id" varchar(240),
  "storage_key" text,
  "safe_to_preview" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mail_attachments_message_idx"
  ON "mail_attachments" ("message_id");
CREATE INDEX IF NOT EXISTS "mail_attachments_provider_idx"
  ON "mail_attachments" ("provider_attachment_id");

CREATE TABLE IF NOT EXISTS "mail_outbox" (
  "id" serial PRIMARY KEY,
  "mailbox_id" integer NOT NULL REFERENCES "public"."mail_mailboxes"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "mail_message_id" integer REFERENCES "public"."mail_messages"("id") ON DELETE set null,
  "status" "mail_message_status" DEFAULT 'queued' NOT NULL,
  "provider" varchar(40) DEFAULT 'resend' NOT NULL,
  "provider_message_id" varchar(240),
  "last_error" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "queued_at" timestamp DEFAULT now() NOT NULL,
  "sent_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mail_outbox_user_status_idx"
  ON "mail_outbox" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "mail_outbox_status_idx"
  ON "mail_outbox" ("status", "queued_at");

CREATE TABLE IF NOT EXISTS "mail_delivery_events" (
  "id" serial PRIMARY KEY,
  "mail_message_id" integer REFERENCES "public"."mail_messages"("id") ON DELETE set null,
  "mailbox_id" integer REFERENCES "public"."mail_mailboxes"("id") ON DELETE set null,
  "event_type" varchar(80) NOT NULL,
  "provider" varchar(40) DEFAULT 'resend' NOT NULL,
  "provider_message_id" varchar(240),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mail_delivery_events_message_idx"
  ON "mail_delivery_events" ("mail_message_id");
CREATE INDEX IF NOT EXISTS "mail_delivery_events_type_idx"
  ON "mail_delivery_events" ("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "mail_delivery_events_provider_idx"
  ON "mail_delivery_events" ("provider", "provider_message_id");
