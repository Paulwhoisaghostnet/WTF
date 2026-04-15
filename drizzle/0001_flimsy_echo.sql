ALTER TYPE "public"."user_role" ADD VALUE 'admin' BEFORE 'host';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'resident_wizard' BEFORE 'contestant';--> statement-breakpoint
CREATE TABLE "board_thread_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "board_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(220) NOT NULL,
	"body" text NOT NULL,
	"created_by" integer NOT NULL,
	"view_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_reward_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"submission_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"claimable" boolean DEFAULT true NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"flag_slug" varchar(200) NOT NULL,
	"reward_escrow_slug" varchar(120),
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_conversation_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "dm_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer,
	"active" boolean DEFAULT true NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"reason" varchar(120) NOT NULL,
	"metadata" jsonb,
	"awarded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD COLUMN "xp_awarded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD COLUMN "xp_awarded_at" timestamp;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_escrow_slug" varchar(120);--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_token_contract" varchar(36);--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_token_id" text;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_token_amount" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "reward_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "reward_escrow_slug" varchar(120);--> statement-breakpoint
ALTER TABLE "user_owned_tokens" ADD COLUMN "creator_address" varchar(36);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twitter_handle" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twitter_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twitter_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discord_handle" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discord_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discord_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pfp_token_contract" varchar(36);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pfp_token_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pfp_image_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "experience_points" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "board_thread_replies" ADD CONSTRAINT "board_thread_replies_thread_id_board_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."board_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_thread_replies" ADD CONSTRAINT "board_thread_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_threads" ADD CONSTRAINT "board_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_reward_flags" ADD CONSTRAINT "challenge_reward_flags_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_reward_flags" ADD CONSTRAINT "challenge_reward_flags_submission_id_challenge_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."challenge_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_reward_flags" ADD CONSTRAINT "challenge_reward_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_conversation_participants" ADD CONSTRAINT "dm_conversation_participants_conversation_id_dm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_conversation_participants" ADD CONSTRAINT "dm_conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_conversations" ADD CONSTRAINT "dm_conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_conversation_id_dm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_thread_reply_thread_idx" ON "board_thread_replies" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "board_thread_reply_user_idx" ON "board_thread_replies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "board_thread_created_idx" ON "board_threads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "board_thread_creator_idx" ON "board_threads" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "board_thread_active_idx" ON "board_threads" USING btree ("active");--> statement-breakpoint
CREATE INDEX "reward_flag_user_idx" ON "challenge_reward_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reward_flag_challenge_idx" ON "challenge_reward_flags" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_flag_submission_unique_idx" ON "challenge_reward_flags" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_flag_user_challenge_unique_idx" ON "challenge_reward_flags" USING btree ("user_id","challenge_id");--> statement-breakpoint
CREATE INDEX "dm_participant_user_idx" ON "dm_conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dm_participant_conversation_idx" ON "dm_conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_participant_conversation_user_unique_idx" ON "dm_conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "dm_conversations_last_message_idx" ON "dm_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "dm_message_conversation_idx" ON "dm_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "dm_message_sender_idx" ON "dm_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "xp_event_user_idx" ON "xp_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "xp_event_created_idx" ON "xp_events" USING btree ("created_at");