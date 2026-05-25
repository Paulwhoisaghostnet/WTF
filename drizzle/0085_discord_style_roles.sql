DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'test_subject'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'test_subject' AFTER 'trusted_creator';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_roles" (
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" "user_role" NOT NULL,
  "assigned_by" integer REFERENCES "users"("id") ON DELETE set null,
  "assigned_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_roles_user_role_pk" PRIMARY KEY ("user_id", "role")
);

CREATE INDEX IF NOT EXISTS "user_roles_role_idx" ON "user_roles" ("role");

INSERT INTO "user_roles" ("user_id", "role", "assigned_at")
SELECT "id", "role", COALESCE("updated_at", now())
FROM "users"
ON CONFLICT ("user_id", "role") DO NOTHING;

INSERT INTO "user_roles" ("user_id", "role", "assigned_at")
SELECT "id", 'admin'::"user_role", now()
FROM "users"
WHERE "username" = 'wtf-admin'
ON CONFLICT ("user_id", "role") DO NOTHING;

CREATE TABLE IF NOT EXISTS "role_surface_access" (
  "id" serial PRIMARY KEY,
  "role" "user_role" NOT NULL,
  "surface_id" varchar(120) NOT NULL,
  "granted" boolean NOT NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_surface_access_unique_idx"
  ON "role_surface_access" ("role", "surface_id");

CREATE INDEX IF NOT EXISTS "role_surface_access_role_idx"
  ON "role_surface_access" ("role");

CREATE INDEX IF NOT EXISTS "role_surface_access_surface_idx"
  ON "role_surface_access" ("surface_id");
