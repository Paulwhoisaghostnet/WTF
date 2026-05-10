CREATE TABLE IF NOT EXISTS "diary_entries" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "title" varchar(180) NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "classification" varchar(80) DEFAULT 'general' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "entry_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cross_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "diary_entries_user_entry_at_idx"
  ON "diary_entries" USING btree ("user_id", "entry_at");

CREATE INDEX IF NOT EXISTS "diary_entries_user_classification_idx"
  ON "diary_entries" USING btree ("user_id", "classification");

CREATE INDEX IF NOT EXISTS "diary_entries_user_updated_idx"
  ON "diary_entries" USING btree ("user_id", "updated_at");
