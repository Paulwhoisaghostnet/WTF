CREATE TYPE "public"."dm_conversation_type" AS ENUM('direct', 'studio');--> statement-breakpoint
CREATE TYPE "public"."dm_message_type" AS ENUM('text', 'studio_system', 'studio_event');--> statement-breakpoint
CREATE TYPE "public"."studio_annotation_kind" AS ENUM('pin', 'sticky_note', 'draw', 'arrow', 'rect', 'text', 'highlight');--> statement-breakpoint
CREATE TYPE "public"."studio_member_role" AS ENUM('owner', 'editor', 'commenter', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."studio_storage_backend" AS ENUM('local_disk', 'google_drive');--> statement-breakpoint
CREATE TYPE "public"."wallet_event_type" AS ENUM('token_transfer_in', 'token_transfer_out', 'token_mint', 'token_burn', 'xtz_transfer_in', 'xtz_transfer_out', 'contract_call', 'delegation', 'origination');--> statement-breakpoint
CREATE TABLE "studio_annotation_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"annotation_id" integer NOT NULL,
	"author_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "studio_annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"file_version" integer DEFAULT 1 NOT NULL,
	"author_id" integer,
	"kind" "studio_annotation_kind" NOT NULL,
	"page_or_frame" integer,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_file_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"version" integer NOT NULL,
	"uploader_id" integer,
	"source_uri" text NOT NULL,
	"preview_uri" text,
	"thumbnail_uri" text,
	"size_bytes" bigint NOT NULL,
	"file_hash" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"folder_id" integer,
	"uploader_id" integer,
	"name" varchar(300) NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"source_uri" text NOT NULL,
	"preview_uri" text,
	"thumbnail_uri" text,
	"file_hash" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_folder_id" integer,
	"name" varchar(200) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_platform_storage" (
	"id" serial PRIMARY KEY NOT NULL,
	"backend" "studio_storage_backend" NOT NULL,
	"account_email" varchar(320),
	"scopes" text,
	"credential_cipher" text NOT NULL,
	"credential_nonce" varchar(64) NOT NULL,
	"root_folder_id" varchar(128),
	"quota_bytes_limit" bigint,
	"quota_bytes_usage" bigint,
	"quota_refreshed_at" timestamp,
	"connected_by_user_id" integer,
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "studio_member_role" DEFAULT 'viewer' NOT NULL,
	"invited_by" integer,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_opened_at" timestamp,
	"last_opened_file_id" integer
);
--> statement-breakpoint
CREATE TABLE "studio_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"owner_user_id" integer NOT NULL,
	"cover_image_url" text,
	"storage_backend" "studio_storage_backend" DEFAULT 'local_disk' NOT NULL,
	"storage_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storage_quota_bytes" bigint DEFAULT 524288000 NOT NULL,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"conversation_id" integer,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_storage_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"backend" "studio_storage_backend" NOT NULL,
	"account_email" varchar(320),
	"scopes" text,
	"credential_cipher" text NOT NULL,
	"credential_nonce" varchar(64) NOT NULL,
	"expires_at" timestamp,
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_user_state" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"last_open_project_id" integer,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" varchar(36) NOT NULL,
	"user_id" integer,
	"event_type" "wallet_event_type" NOT NULL,
	"level" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"op_hash" varchar(100),
	"tzkt_kind" varchar(16) NOT NULL,
	"tzkt_transfer_id" bigint,
	"tzkt_operation_id" bigint,
	"token_contract" varchar(36),
	"token_id" text,
	"token_standard" varchar(12),
	"token_amount" text,
	"token_name" text,
	"token_symbol" text,
	"token_thumbnail" text,
	"counterparty_address" varchar(36),
	"xtz_amount_mutez" bigint,
	"marketplace" varchar(50),
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" varchar(36) NOT NULL,
	"last_transfer_id" bigint DEFAULT 0 NOT NULL,
	"last_operation_id" bigint DEFAULT 0 NOT NULL,
	"last_level" bigint DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp,
	"last_sync_status" varchar(16),
	"last_sync_error" text,
	"events_tracked" bigint DEFAULT 0 NOT NULL,
	"backfilled" boolean DEFAULT false NOT NULL,
	"backfilled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_sync_cursors_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
DROP INDEX "tv_schedule_time_idx";--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ALTER COLUMN "media_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ALTER COLUMN "ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD COLUMN "conversation_type" "dm_conversation_type" DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD COLUMN "studio_project_id" integer;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD COLUMN "title" varchar(200);--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "message_type" "dm_message_type" DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_bids" ADD COLUMN "onchain_status" varchar(24) DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_bids" ADD COLUMN "onchain_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "marketplace_bids" ADD COLUMN "onchain_verified_sender" varchar(36);--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "onchain_status" varchar(24) DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "onchain_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "onchain_verified_sender" varchar(36);--> statement-breakpoint
ALTER TABLE "tv_bumpers" ADD COLUMN "category" varchar(20) DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "tv_channel_videos" ADD COLUMN "creator_name" text;--> statement-breakpoint
ALTER TABLE "tv_channel_videos" ADD COLUMN "creator_address" varchar(64);--> statement-breakpoint
ALTER TABLE "tv_channel_videos" ADD COLUMN "collection_name" text;--> statement-breakpoint
ALTER TABLE "tv_channel_videos" ADD COLUMN "minted_at" timestamp;--> statement-breakpoint
ALTER TABLE "tv_channels" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ADD COLUMN "playlist_id" integer;--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ADD COLUMN "label" varchar(120);--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ADD COLUMN "start_minute_of_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ADD COLUMN "end_minute_of_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temp_password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temp_password_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "studio_annotation_comments" ADD CONSTRAINT "studio_annotation_comments_annotation_id_studio_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."studio_annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_annotation_comments" ADD CONSTRAINT "studio_annotation_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_annotations" ADD CONSTRAINT "studio_annotations_file_id_studio_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."studio_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_annotations" ADD CONSTRAINT "studio_annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_annotations" ADD CONSTRAINT "studio_annotations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_file_versions" ADD CONSTRAINT "studio_file_versions_file_id_studio_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."studio_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_file_versions" ADD CONSTRAINT "studio_file_versions_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_files" ADD CONSTRAINT "studio_files_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_files" ADD CONSTRAINT "studio_files_folder_id_studio_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."studio_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_files" ADD CONSTRAINT "studio_files_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_folders" ADD CONSTRAINT "studio_folders_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_folders" ADD CONSTRAINT "studio_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_platform_storage" ADD CONSTRAINT "studio_platform_storage_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_project_members" ADD CONSTRAINT "studio_project_members_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_project_members" ADD CONSTRAINT "studio_project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_project_members" ADD CONSTRAINT "studio_project_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_conversation_id_dm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_storage_accounts" ADD CONSTRAINT "studio_storage_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_user_state" ADD CONSTRAINT "studio_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_user_state" ADD CONSTRAINT "studio_user_state_last_open_project_id_studio_projects_id_fk" FOREIGN KEY ("last_open_project_id") REFERENCES "public"."studio_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_events" ADD CONSTRAINT "wallet_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_annotation_comments_annotation_idx" ON "studio_annotation_comments" USING btree ("annotation_id");--> statement-breakpoint
CREATE INDEX "studio_annotation_comments_author_idx" ON "studio_annotation_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "studio_annotations_file_idx" ON "studio_annotations" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "studio_annotations_author_idx" ON "studio_annotations" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "studio_annotations_kind_idx" ON "studio_annotations" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "studio_annotations_resolved_idx" ON "studio_annotations" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "studio_file_versions_file_idx" ON "studio_file_versions" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_file_version_unique_idx" ON "studio_file_versions" USING btree ("file_id","version");--> statement-breakpoint
CREATE INDEX "studio_files_project_idx" ON "studio_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_files_folder_idx" ON "studio_files" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "studio_files_uploader_idx" ON "studio_files" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "studio_files_deleted_idx" ON "studio_files" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "studio_files_archived_idx" ON "studio_files" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "studio_folders_project_idx" ON "studio_folders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_folders_parent_idx" ON "studio_folders" USING btree ("parent_folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_platform_storage_backend_unique_idx" ON "studio_platform_storage" USING btree ("backend");--> statement-breakpoint
CREATE INDEX "studio_project_members_project_idx" ON "studio_project_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_project_members_user_idx" ON "studio_project_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_project_member_unique_idx" ON "studio_project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "studio_projects_owner_idx" ON "studio_projects" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "studio_projects_archived_idx" ON "studio_projects" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "studio_projects_conversation_idx" ON "studio_projects" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "studio_storage_accounts_user_idx" ON "studio_storage_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_storage_accounts_user_backend_unique_idx" ON "studio_storage_accounts" USING btree ("user_id","backend");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_wallet_event_transfer" ON "wallet_events" USING btree ("wallet_address","tzkt_transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_wallet_event_operation" ON "wallet_events" USING btree ("wallet_address","tzkt_operation_id","tzkt_kind");--> statement-breakpoint
CREATE INDEX "idx_wallet_events_wallet_time" ON "wallet_events" USING btree ("wallet_address","timestamp");--> statement-breakpoint
CREATE INDEX "idx_wallet_events_user_time" ON "wallet_events" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_wallet_events_token" ON "wallet_events" USING btree ("token_contract","token_id");--> statement-breakpoint
CREATE INDEX "idx_wallet_events_type" ON "wallet_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_wallet_cursors_backfilled" ON "wallet_sync_cursors" USING btree ("backfilled");--> statement-breakpoint
ALTER TABLE "tv_schedule_entries" ADD CONSTRAINT "tv_schedule_entries_playlist_id_tv_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."tv_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dm_conversations_type_idx" ON "dm_conversations" USING btree ("conversation_type");--> statement-breakpoint
CREATE INDEX "dm_conversations_studio_project_idx" ON "dm_conversations" USING btree ("studio_project_id");--> statement-breakpoint
CREATE INDEX "dm_message_pinned_idx" ON "dm_messages" USING btree ("conversation_id","pinned");--> statement-breakpoint
CREATE INDEX "dm_message_type_idx" ON "dm_messages" USING btree ("message_type");--> statement-breakpoint
CREATE INDEX "listing_onchain_status_idx" ON "marketplace_listings" USING btree ("onchain_status");--> statement-breakpoint
CREATE INDEX "tv_bumper_category_idx" ON "tv_bumpers" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tv_channel_sort_idx" ON "tv_channels" USING btree ("owner_user_id","sort_order");--> statement-breakpoint
CREATE INDEX "tv_schedule_playlist_idx" ON "tv_schedule_entries" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "tv_schedule_time_idx" ON "tv_schedule_entries" USING btree ("channel_id","start_minute_of_day");