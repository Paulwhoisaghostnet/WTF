CREATE TABLE "desktop_app_settings" (
	"app_key" varchar(50) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_channel_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"token_contract" varchar(36) NOT NULL,
	"token_id" text NOT NULL,
	"source_uri" text NOT NULL,
	"title" varchar(300),
	"mime_type" varchar(120) NOT NULL,
	"thumbnail_uri" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_playlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"transition_seconds" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_playlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"playlist_id" integer NOT NULL,
	"video_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desktop_app_settings" ADD CONSTRAINT "desktop_app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_channels" ADD CONSTRAINT "tv_channels_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_channel_videos" ADD CONSTRAINT "tv_channel_videos_channel_id_tv_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."tv_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_playlists" ADD CONSTRAINT "tv_playlists_channel_id_tv_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."tv_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_playlist_items" ADD CONSTRAINT "tv_playlist_items_playlist_id_tv_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."tv_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_playlist_items" ADD CONSTRAINT "tv_playlist_items_video_id_tv_channel_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."tv_channel_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tv_channel_owner_idx" ON "tv_channels" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_channel_slug_unique_idx" ON "tv_channels" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_channel_owner_slug_unique_idx" ON "tv_channels" USING btree ("owner_user_id","slug");--> statement-breakpoint
CREATE INDEX "tv_video_channel_idx" ON "tv_channel_videos" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_video_unique_token_per_channel_idx" ON "tv_channel_videos" USING btree ("channel_id","token_contract","token_id");--> statement-breakpoint
CREATE INDEX "tv_playlist_channel_idx" ON "tv_playlists" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "tv_playlist_active_idx" ON "tv_playlists" USING btree ("channel_id","is_active");--> statement-breakpoint
CREATE INDEX "tv_playlist_item_playlist_idx" ON "tv_playlist_items" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "tv_playlist_item_video_idx" ON "tv_playlist_items" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_playlist_item_unique_idx" ON "tv_playlist_items" USING btree ("playlist_id","video_id");

