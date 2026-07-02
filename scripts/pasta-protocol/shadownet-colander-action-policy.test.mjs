import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/pasta-protocol/shadownet-colander-action-e2e.ts", "utf8");

test("Colander Shadownet action proof is wired as an explicit package command", () => {
  assert.equal(
    packageJson.scripts["pasta:shadownet:colander:action"],
    "tsx scripts/pasta-protocol/shadownet-colander-action-e2e.ts",
  );
  assert.equal(
    packageJson.scripts["pasta:shadownet:colander:action:check"],
    "node --test scripts/pasta-protocol/shadownet-colander-action-policy.test.mjs",
  );
});

test("Colander action proof is opt-in and Shadownet-only", () => {
  assert.match(source, /PASTA_SHADOWNET_COLANDER_E2E_EXECUTE/);
  assert.match(source, /explicit execute flag is required/);
  assert.match(source, /TEZOS_NETWORK \|\| "shadownet"/);
  assert.match(source, /TEZOS_NETWORK=mainnet/);
  assert.match(source, /probeRpcChainId\(\)/);
  assert.match(source, /assertShadownet\(tezos, "administrator startup"\)/);
  assert.match(source, /assertShadownet\(tezos, "before Colander set_current_revision"\)/);
});

test("Colander action proof uses the shared adapter registry before sending", () => {
  assert.match(source, /detectPastaContract\(entrypoints\)/);
  assert.match(source, /availableActions\(adapter, entrypoints\)/);
  assert.match(source, /adapter\?\.kind, "exhibition"/);
  assert.match(source, /candidate\) => candidate\.id === "set_current_revision"/);
  assert.match(source, /action\.access, "curator"/);
  assert.match(source, /action\.group, "curation"/);
});

test("Colander action proof targets the existing Lasagna proof contract safely", () => {
  assert.match(source, /KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r/);
  assert.match(source, /storageBefore\.administrator/);
  assert.match(source, /storageBefore\.pending_administrator/);
  assert.match(source, /storageBefore\.current_revision/);
  assert.match(source, /storageBefore\.revision_count/);
  assert.match(source, /"Some" in \(value as any\)/);
  assert.match(source, /methodsObject\.set_current_revision\(0\)/);
  assert.match(source, /tezos\.estimate\.transfer/);
  assert.match(source, /administrator wallet balance cannot cover estimated Colander action fee/);
});

test("Colander action proof records indexed operation evidence", () => {
  assert.match(source, /shadownet-colander-action-report\.md/);
  assert.match(source, /operations\/transactions\/\$\{encodeURIComponent\(op\.hash\)\}/);
  assert.match(source, /operationMatches\(operation, administrator\.address\)/);
  assert.match(source, /parameter\?\.entrypoint === "set_current_revision"/);
  assert.match(source, /operation\?\.status === "applied"/);
  assert.match(source, /post-operation storage/);
});
