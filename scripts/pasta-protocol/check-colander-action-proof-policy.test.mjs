import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/pasta-protocol/check-colander-action-proof.mjs", "utf8");

test("recorded Colander action proof verifier is wired as explicit package commands", () => {
  assert.equal(
    packageJson.scripts["pasta:shadownet:colander:action-proof"],
    "node scripts/pasta-protocol/check-colander-action-proof.mjs",
  );
  assert.equal(
    packageJson.scripts["pasta:shadownet:colander:action-proof:check"],
    "node --test scripts/pasta-protocol/check-colander-action-proof-policy.test.mjs",
  );
});

test("recorded Colander action proof verifier is non-spending", () => {
  assert.doesNotMatch(source, /PASTA_SHADOWNET_COLANDER_E2E_EXECUTE/);
  assert.doesNotMatch(source, /\.send\(/);
  assert.doesNotMatch(source, /loadSignerPair/);
  assert.doesNotMatch(source, /buildToolkit/);
  assert.match(source, /Refusing to verify Shadownet Colander proof with TEZOS_NETWORK=mainnet/);
});

test("recorded Colander action proof verifier checks the report artifact", () => {
  assert.match(source, /shadownet-colander-action-report\.md/);
  assert.match(source, /- Status: PASSED/);
  assert.match(source, /Signer wallet id/);
  assert.match(source, /TzKT indexed the operation as an applied transaction/);
});

test("recorded Colander action proof verifier checks TzKT operation identity and storage", () => {
  assert.match(source, /https:\/\/api\.shadownet\.tzkt\.io\/v1/);
  assert.match(source, /operations\/transactions\/\$\{encodeURIComponent\(OPERATION_HASH\)\}/);
  assert.match(source, /oo2qtySsskwgYE41BAvN2jxYpvi1L8zugNwyk1JHXUWbYCj8P3h/);
  assert.match(source, /KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r/);
  assert.match(source, /tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej/);
  assert.match(source, /set_current_revision/);
  assert.match(source, /operation\?\.status === "applied"/);
  assert.match(source, /operation\?\.storage\?\.administrator === ADMINISTRATOR/);
  assert.match(source, /storageText\(operation\?\.storage\?\.current_revision\) === PARAMETER_VALUE/);
  assert.match(source, /storageText\(operation\?\.storage\?\.revision_count\) === EXPECTED_REVISION_COUNT/);
});
