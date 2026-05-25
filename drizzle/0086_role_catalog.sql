CREATE TABLE IF NOT EXISTS "roles" (
  "slug" varchar(64) PRIMARY KEY,
  "label" varchar(100) NOT NULL,
  "category" varchar(40) DEFAULT 'access' NOT NULL,
  "purpose" text DEFAULT '' NOT NULL,
  "description" text,
  "access_level" integer DEFAULT 0 NOT NULL,
  "sort_order" integer DEFAULT 1000 NOT NULL,
  "color" varchar(24),
  "icon" varchar(64),
  "default_wtf_os_access" boolean DEFAULT false NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "is_assignable" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "roles_category_idx" ON "roles" ("category");
CREATE INDEX IF NOT EXISTS "roles_sort_idx" ON "roles" ("sort_order");

INSERT INTO "roles" (
  "slug",
  "label",
  "category",
  "purpose",
  "access_level",
  "sort_order",
  "color",
  "icon",
  "default_wtf_os_access",
  "is_system",
  "is_assignable",
  "updated_at"
) VALUES
  ('admin', 'Admin', 'access', 'Full platform operator role with all permissions and WTF OS access.', 100, 10, '#d10000', 'shield', true, true, true, now()),
  ('host', 'Host', 'gameshow', 'Gameshow operator role for running rounds, challenges, and contestant flow.', 80, 20, '#005eb8', 'mic', true, true, true, now()),
  ('cohost', 'Cohost', 'gameshow', 'Assistant operator role for supporting live gameshow operations.', 70, 30, '#007d7e', 'users', true, true, true, now()),
  ('resident_wizard', 'Resident Wizard', 'moderation', 'Trusted community steward with elevated social and creative capabilities.', 60, 40, '#6a3fb5', 'sparkles', true, true, true, now()),
  ('trusted_creator', 'Trusted Creator', 'builder', 'Creator key for Studio, arcade, TV, marketplace, and WTF OS expansion tools.', 50, 50, '#0f7a3b', 'hammer', true, true, true, now()),
  ('test_subject', 'Test Subject', 'experimental', 'Experimental access key for labs, trials, and unstable WTF OS surfaces.', 35, 60, '#7a4b00', 'flask', false, true, true, now()),
  ('contestant', 'Contestant', 'gameshow', 'Participant role for challenges, side quests, and standard community play.', 30, 70, '#1d4ed8', 'trophy', true, true, true, now()),
  ('witness', 'Witness', 'access', 'Default account role for browsing public/community surfaces.', 10, 80, '#444', 'eye', true, true, true, now()),
  ('time_out', 'time out', 'restriction', 'Restriction role for accounts that should not access apps or participate.', -100, 900, '#111', 'ban', false, true, true, now())
ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "category" = EXCLUDED."category",
  "purpose" = EXCLUDED."purpose",
  "access_level" = EXCLUDED."access_level",
  "sort_order" = EXCLUDED."sort_order",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "default_wtf_os_access" = EXCLUDED."default_wtf_os_access",
  "is_system" = true,
  "is_assignable" = EXCLUDED."is_assignable",
  "updated_at" = now();

ALTER TABLE "user_roles"
  ALTER COLUMN "role" TYPE varchar(64) USING "role"::text;

ALTER TABLE "role_permissions"
  ALTER COLUMN "role" TYPE varchar(64) USING "role"::text;

ALTER TABLE "role_surface_access"
  ALTER COLUMN "role" TYPE varchar(64) USING "role"::text;

ALTER TABLE "token_gates"
  ALTER COLUMN "granted_role" TYPE varchar(64) USING "granted_role"::text;
