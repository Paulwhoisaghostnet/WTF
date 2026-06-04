import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrations = readFileSync("scripts/apply-production-migrations.sh", "utf8");
const deploy = readFileSync("scripts/server-deploy.sh", "utf8");
const wtfLiveMigration = readFileSync("drizzle/0097_wtf_live_rooms.sql", "utf8");

test("LAW.TT1/10 production migrations fail closed on SQL errors", () => {
  assert.match(migrations, /set -euo pipefail/);
  assert.match(
    migrations,
    /docker compose exec -T postgres psql -U wtf -d wtf -v ON_ERROR_STOP=1 "\$@"/
  );
  assert.match(
    migrations,
    /docker compose exec -T postgres psql -U wtf -d wtf -v ON_ERROR_STOP=1 < "\$1"/
  );
  assert.doesNotMatch(migrations, /ON_ERROR_STOP=0/);
  assert.doesNotMatch(migrations, /psql_file "\$sql_file"\s*\|\|\s*true/);
});

test("LAW.TT1/10 production migrations refuse implicit fresh-db bootstrap", () => {
  assert.match(
    migrations,
    /fresh database detected with no production ledger; refusing implicit bootstrap/
  );
  assert.match(
    migrations,
    /Initialize the base schema through a reviewed bootstrap path/
  );
  assert.match(
    migrations,
    /if \[\[ "\$ledger_count" == "0" && "\$schema_present" != "t" \]\]; then[\s\S]*exit 1[\s\S]*fi/
  );
});

test("LAW.TT1/10 migration ledger records only after the SQL file applies", () => {
  assert.match(
    migrations,
    /echo "\[deploy-migrations\] apply \$\{filename\}"\s+psql_file "\$sql_file"\s+psql_query -c/
  );
  assert.match(migrations, /VALUES \('\$\{safe_filename\}', '\$\{safe_sha256\}', 'applied-by-server-deploy'\)/);
});

test("LAW.TT1/10 deploy starts the app only after production migrations pass", () => {
  assert.match(deploy, /set -euo pipefail/);
  assert.match(
    deploy,
    /docker compose stop app[\s\S]*bash "\$ROOT_DIR\/scripts\/apply-production-migrations\.sh"[\s\S]*docker compose up -d --remove-orphans --force-recreate app caddy/
  );
  assert.doesNotMatch(deploy, /npm run db:push/);
  assert.doesNotMatch(deploy, /drizzle-kit push/);
});

test("WTF LIVE persistent room tables have a numbered production migration", () => {
  assert.match(wtfLiveMigration, /CREATE TABLE IF NOT EXISTS wtf_live_rooms/);
  assert.match(wtfLiveMigration, /CREATE TABLE IF NOT EXISTS wtf_live_stages/);
  assert.match(wtfLiveMigration, /owner_user_id integer NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(wtfLiveMigration, /CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_rooms_slug_idx/);
  assert.match(wtfLiveMigration, /CREATE UNIQUE INDEX IF NOT EXISTS wtf_live_stages_slug_idx/);
});
