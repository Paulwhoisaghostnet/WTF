CREATE TYPE "public"."challenge_status" AS ENUM('draft', 'active', 'grading', 'completed');--> statement-breakpoint
CREATE TYPE "public"."channel_access" AS ENUM('all', 'contestants', 'hosts', 'witnesses');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('async', 'sync', 'thread');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('pending', 'pass', 'fail', 'bonus');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'sold', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."listing_type" AS ENUM('auction', 'buy_now');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'link', 'system');--> statement-breakpoint
CREATE TYPE "public"."quest_status" AS ENUM('draft', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('upcoming', 'active', 'grading', 'completed');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('upcoming', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('host', 'cohost', 'contestant', 'witness');--> statement-breakpoint
CREATE TABLE "challenge_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content_text" text,
	"content_url" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"grade" "grade" DEFAULT 'pending' NOT NULL,
	"reward_distributed" boolean DEFAULT false NOT NULL,
	"reward_op_hash" varchar(51),
	"graded_by" integer,
	"graded_at" timestamp,
	"feedback" text
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer,
	"title" varchar(300) NOT NULL,
	"description" text NOT NULL,
	"criteria" text,
	"rules" text,
	"reward_amount_wtf" bigint DEFAULT 0,
	"reward_type" varchar(20) DEFAULT 'wtf',
	"status" "challenge_status" DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deadline" timestamp
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"type" "channel_type" DEFAULT 'async' NOT NULL,
	"access_level" "channel_access" DEFAULT 'all' NOT NULL,
	"season_id" integer,
	"parent_message_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" varchar(100),
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"category" varchar(100),
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_bids" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"bidder_user_id" integer NOT NULL,
	"amount_wtf" bigint NOT NULL,
	"op_hash" varchar(51),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_user_id" integer NOT NULL,
	"token_contract" varchar(36) NOT NULL,
	"token_id" text NOT NULL,
	"token_name" varchar(300),
	"token_thumbnail" text,
	"amount" integer DEFAULT 1 NOT NULL,
	"listing_type" "listing_type" DEFAULT 'buy_now' NOT NULL,
	"price_wtf" bigint NOT NULL,
	"min_bid_wtf" bigint,
	"end_time" timestamp,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"on_chain_id" varchar(100),
	"op_hash" varchar(51),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"message_type" "message_type" DEFAULT 'text' NOT NULL,
	"thread_parent_id" integer,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"number" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"status" "round_status" DEFAULT 'upcoming' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"number" integer NOT NULL,
	"status" "season_status" DEFAULT 'upcoming' NOT NULL,
	"description" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "side_quest_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"side_quest_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"proof_text" text,
	"proof_url" text,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"approved" boolean,
	"approved_by" integer,
	"reward_op_hash" varchar(51)
);
--> statement-breakpoint
CREATE TABLE "side_quests" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text NOT NULL,
	"criteria" text,
	"reward_amount_wtf" bigint DEFAULT 0,
	"status" "quest_status" DEFAULT 'draft' NOT NULL,
	"max_completions" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deadline" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_owned_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_address" varchar(36) NOT NULL,
	"token_contract" varchar(36) NOT NULL,
	"token_id" text NOT NULL,
	"balance" text NOT NULL,
	"token_name" text,
	"token_symbol" text,
	"token_thumbnail" text,
	"metadata" jsonb,
	"on_trade_board" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wallet_address" varchar(36) NOT NULL,
	"tez_domain" varchar(255),
	"is_primary" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(255),
	"password_hash" text,
	"display_name" varchar(100),
	"avatar_url" text,
	"role" "user_role" DEFAULT 'witness' NOT NULL,
	"twitter_id" varchar(100),
	"discord_id" varchar(100),
	"google_id" varchar(100),
	"github_id" varchar(100),
	"bio" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_bids" ADD CONSTRAINT "marketplace_bids_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_bids" ADD CONSTRAINT "marketplace_bids_bidder_user_id_users_id_fk" FOREIGN KEY ("bidder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "side_quest_completions" ADD CONSTRAINT "side_quest_completions_side_quest_id_side_quests_id_fk" FOREIGN KEY ("side_quest_id") REFERENCES "public"."side_quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "side_quest_completions" ADD CONSTRAINT "side_quest_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "side_quest_completions" ADD CONSTRAINT "side_quest_completions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "side_quests" ADD CONSTRAINT "side_quests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_owned_tokens" ADD CONSTRAINT "user_owned_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_challenge_idx" ON "challenge_submissions" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "submission_user_idx" ON "challenge_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listing_seller_idx" ON "marketplace_listings" USING btree ("seller_user_id");--> statement-breakpoint
CREATE INDEX "message_channel_idx" ON "messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "message_user_idx" ON "messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "messages" USING btree ("thread_parent_id");--> statement-breakpoint
CREATE INDEX "owned_tokens_user_wallet_idx" ON "user_owned_tokens" USING btree ("user_id","wallet_address");--> statement-breakpoint
CREATE INDEX "owned_tokens_user_last_seen_idx" ON "user_owned_tokens" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "owned_tokens_wallet_last_seen_idx" ON "user_owned_tokens" USING btree ("user_id","wallet_address","last_seen_at");--> statement-breakpoint
CREATE INDEX "owned_tokens_contract_token_idx" ON "user_owned_tokens" USING btree ("token_contract","token_id");--> statement-breakpoint
CREATE INDEX "owned_tokens_trade_board_idx" ON "user_owned_tokens" USING btree ("user_id","on_trade_board");--> statement-breakpoint
CREATE UNIQUE INDEX "owned_tokens_unique_idx" ON "user_owned_tokens" USING btree ("user_id","wallet_address","token_contract","token_id");--> statement-breakpoint
CREATE INDEX "wallet_address_idx" ON "user_wallets" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "wallet_user_idx" ON "user_wallets" USING btree ("user_id");