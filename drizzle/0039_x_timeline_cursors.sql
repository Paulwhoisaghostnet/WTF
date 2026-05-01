-- Cursor for W timeline search worker (since_id for /tweets/search/recent)
CREATE TABLE IF NOT EXISTS "x_timeline_cursors" (
	"scope_key" varchar(128) PRIMARY KEY NOT NULL,
	"since_id" varchar(64),
	"updated_at" timestamp DEFAULT now() NOT NULL
);

COMMENT ON TABLE "x_timeline_cursors" IS 'High-water marks for low-cost W timeline discovery (search since_id).';

CREATE INDEX IF NOT EXISTS "x_timeline_author_handle_idx" ON "x_timeline_posts" ("author_handle");
