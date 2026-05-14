import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const walletsRoute = readFileSync("server/routes/wallets.ts", "utf8");
const tezNames = readFileSync("server/teznames.ts", "utf8");
const addressLabelBackfill = readFileSync("server/lib/backfill-handlers.ts", "utf8");

test("wallet surfaces use Tezos Domains GraphQL for reverse and owned domains", () => {
  assert.match(tezNames, /resolveTezosDomainsIdentity/);
  assert.match(walletsRoute, /resolveTezosDomainsIdentity/);
  assert.match(walletsRoute, /ownedTezosDomains/);
  assert.match(addressLabelBackfill, /resolveTezosDomainsIdentity/);
});
