import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("wallet surveillance inserts feed the challenge SystemEvent spine", () => {
  const source = readFileSync("server/lib/wallet-events.ts", "utf8");
  const triggers = readFileSync("server/challenges/registries/triggers.ts", "utf8");

  assert.match(source, /import \{ ingestSystemEvent \}/);
  assert.match(source, /function blockchainSystemEventType/);
  assert.match(source, /blockchain\.tezos\.\$\{eventType\}/);
  assert.match(source, /rawRefType:\s*"wallet_event"/);
  assert.match(source, /sourceModule:\s*"wallet-events"/);
  assert.match(triggers, /key:\s*"blockchain\.tezos\.activity"/);
  assert.match(triggers, /"blockchain\.tezos\.token_mint"/);
  assert.match(triggers, /"blockchain\.tezos\.contract_call"/);
});
