import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrations = readFileSync("scripts/apply-production-migrations.sh", "utf8");
const deploy = readFileSync("scripts/server-deploy.sh", "utf8");
const health = readFileSync("server/lib/health.ts", "utf8");
const healthTest = readFileSync("server/lib/health.test.ts", "utf8");

const deploySurface = `${migrations}\n${deploy}`;

test("LAW.DR1/04 deploy dry-run evidence keeps migrations fail-closed", () => {
  assert.match(migrations, /set -euo pipefail/);
  assert.match(migrations, /-v ON_ERROR_STOP=1/);
  assert.doesNotMatch(migrations, /ON_ERROR_STOP=0/);
  assert.doesNotMatch(migrations, /psql_file "\$sql_file"\s*\|\|\s*true/);
  assert.match(migrations, /fresh database detected with no production ledger; refusing implicit bootstrap/);
});

test("LAW.DR2/04 deploy dry-run evidence has no interactive schema prompt path", () => {
  assert.doesNotMatch(deploySurface, /npm run db:push/);
  assert.doesNotMatch(deploySurface, /drizzle-kit\s+push/);
  assert.doesNotMatch(deploySurface, /read\s+-p/);
  assert.doesNotMatch(deploySurface, /select\s+.+\s+in\s+/);
  assert.doesNotMatch(deploySurface, /docker compose exec(?! -T)/);
});

test("LAW.DR3/04 deploy dry-run evidence starts app only after schema readiness", () => {
  assert.match(
    deploy,
    /docker compose up -d postgres[\s\S]*pg_isready[\s\S]*docker compose stop app[\s\S]*apply-production-migrations\.sh[\s\S]*docker compose up -d --remove-orphans app caddy/
  );
  assert.match(deploy, /if curl -fsS http:\/\/localhost:3000\/api\/health/);
  assert.match(deploy, /health check failed[\s\S]*docker compose logs --tail=80 app/);
});

test("LAW.DR4/04 deploy dry-run evidence locks health readiness fields", () => {
  for (const field of [
    "db: DbHealth",
    "chain: ContractHealth",
    "jobs: JobHealth",
    "version:",
    "runtime:",
  ]) {
    assert.match(health, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(healthTest, /health snapshot reports db, chain, contract, version, and job readiness/);
  assert.match(healthTest, /snapshot\.db\.ok/);
  assert.match(healthTest, /snapshot\.chain\.ok/);
  assert.match(healthTest, /snapshot\.jobs\.ok/);
  assert.match(healthTest, /snapshot\.version\.commitRef/);
});
