import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrations = readFileSync("scripts/apply-production-migrations.sh", "utf8");
const deploy = readFileSync("scripts/server-deploy.sh", "utf8");
const wtfLiveMigration = readFileSync("drizzle/0097_wtf_live_rooms.sql", "utf8");
const wtfLiveTipMigration = readFileSync("drizzle/0100_wtf_live_tip_items.sql", "utf8");
const transparentArtHandleMigration = readFileSync(
  "drizzle/0113_w_digest_transparentart_handle.sql",
  "utf8"
);

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

test("LAW.TT1/10 production migrations refuse every implicit empty-ledger bootstrap", () => {
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
    /if \[\[ "\$ledger_count" == "0" \]\]; then[\s\S]*exit 1[\s\S]*fi/
  );
  assert.doesNotMatch(migrations, /bootstrap-existing-db/);
  assert.doesNotMatch(migrations, /schema_present/);
});

test("LAW.TT1/10 applied migration filenames are bound to immutable checksums", () => {
  assert.match(
    migrations,
    /SELECT sha256 FROM \$\{LEDGER_TABLE\} WHERE filename = '\$\{safe_filename\}' LIMIT 1;/
  );
  assert.match(migrations, /if \[\[ "\$stored_sha256" != "\$sha256" \]\]; then/);
  assert.match(migrations, /checksum mismatch for applied migration \$\{filename\}/);
  assert.doesNotMatch(migrations, /ON CONFLICT \(filename\) DO UPDATE/);
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

test("WTF LIVE tip seed respects production in-app market score constraints", () => {
  const scores = [
    ...wtfLiveTipMigration.matchAll(
      /^\s+(\d+),\n\s+true,\n\s+true,\n\s+'\{"kind":"live-tip"/gm
    ),
  ].map((match) => Number(match[1]));

  assert.equal(scores.length, 6);
  for (const score of scores) {
    assert.ok(score >= 1 && score <= 10, `price_score ${score} is outside 1..10`);
  }
});

test("W digest handle correction is forward-only and preserves referenced posts", () => {
  assert.match(transparentArtHandleMigration, /BEGIN;/);
  assert.match(transparentArtHandleMigration, /VALUES \('_transparentart', true, 'seed'\)/);
  assert.match(
    transparentArtHandleMigration,
    /UPDATE w_digest_posts\s+SET handle = '_transparentart'\s+WHERE handle = 'transparentart';/
  );
  assert.match(
    transparentArtHandleMigration,
    /DELETE FROM w_digest_handles\s+WHERE handle = 'transparentart';/
  );
  assert.match(transparentArtHandleMigration, /COMMIT;/);
});
