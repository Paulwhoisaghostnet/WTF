CREATE TABLE "token_gates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"token_contract" varchar(36) NOT NULL,
	"token_id" text,
	"min_balance" text DEFAULT '1' NOT NULL,
	"granted_role" "user_role",
	"granted_permissions" jsonb DEFAULT '[]'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "w_feed_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"account_username" varchar(100),
	"tweet_id" varchar(64) NOT NULL,
	"tweet_data" jsonb NOT NULL,
	"published_at" timestamp NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tv_playlist_items" ADD COLUMN "media_item_id" integer;--> statement-breakpoint
ALTER TABLE "token_gates" ADD CONSTRAINT "token_gates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_gate_contract_idx" ON "token_gates" USING btree ("token_contract");--> statement-breakpoint
CREATE INDEX "token_gate_active_idx" ON "token_gates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "w_feed_cache_account_idx" ON "w_feed_cache" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "w_feed_cache_published_idx" ON "w_feed_cache" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "w_feed_cache_tweet_unique_idx" ON "w_feed_cache" USING btree ("tweet_id");--> statement-breakpoint
ALTER TABLE "tv_playlist_items" ADD CONSTRAINT "tv_playlist_items_media_item_id_user_media_library_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."user_media_library"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tv_playlist_item_media_idx" ON "tv_playlist_items" USING btree ("media_item_id");