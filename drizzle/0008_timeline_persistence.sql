-- Add durable timeline cache to dramatically reduce X API calls and credit burn
-- This table stores recent posts from verified W users. The /api/w/timeline endpoint
-- will now read from here first. A background refresh job will keep it fresh.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "x_timeline_posts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"author_twitter_id" varchar(64) NOT NULL,
	"author_handle" varchar(32) NOT NULL,
	"text" text,
	"display_text" text,
	"created_at" timestamp NOT NULL,
	"raw_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"media" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"links" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"metrics" jsonb NOT NULL DEFAULT '{"likes":0,"replies":0,"reposts":0,"quotes":0}'::jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "x_timeline_author_idx" ON "x_timeline_posts" ("author_twitter_id");
CREATE INDEX IF NOT EXISTS "x_timeline_created_idx" ON "x_timeline_posts" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "x_timeline_expires_idx" ON "x_timeline_posts" ("expires_at");

--> statement-breakpoint
-- Update journal (this is the 0008 migration)
COMMENT ON TABLE "x_timeline_posts" IS 'Persistent cache for W timeline to minimize X API credit usage. Expires after ~7 days.';
