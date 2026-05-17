import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/lib/backfill-seeders.ts", "utf8");

test("bounded backfill seeders sort candidates deterministically before LIMIT", () => {
  for (const contract of [
    /ORDER BY[\s\S]*CASE WHEN l\.address IS NULL THEN 0 ELSE 1 END ASC,[\s\S]*COALESCE\(l\.last_resolved_at, TIMESTAMP 'epoch'\) ASC,[\s\S]*s\.address ASC[\s\S]*LIMIT 50000/,
    /ORDER BY priority ASC, s\.sold_at ASC, s\.id ASC[\s\S]*LIMIT 200000/,
    /ORDER BY MIN\(m\.priority\)::int ASC, m\.addr ASC[\s\S]*LIMIT 100000/,
    /ORDER BY[\s\S]*MIN\(m\.priority\)::int ASC,[\s\S]*COALESCE\(MAX\(s\.refreshed_at\), TIMESTAMP 'epoch'\) ASC,[\s\S]*m\.token_contract ASC,[\s\S]*m\.token_id ASC[\s\S]*LIMIT 25000/,
    /ORDER BY id ASC[\s\S]*LIMIT 50000/,
    /ORDER BY[\s\S]*a\.timestamp ASC,[\s\S]*a\.wallet_address ASC,[\s\S]*a\.token_contract ASC,[\s\S]*a\.token_id ASC[\s\S]*LIMIT 50000/,
  ]) {
    assert.match(source, contract);
  }
});

test("post-limit backfill seeder selects preserve stable output order", () => {
  for (const contract of [
    /SELECT[\s\S]*FROM candidates[\s\S]*ORDER BY priority ASC, sold_at ASC, id ASC/,
    /SELECT addr, priority[\s\S]*FROM final[\s\S]*ORDER BY priority ASC, addr ASC/,
    /SELECT token_contract, token_id, priority[\s\S]*FROM final[\s\S]*ORDER BY priority ASC, sort_refreshed_at ASC, token_contract ASC, token_id ASC/,
  ]) {
    assert.match(source, contract);
  }
});
