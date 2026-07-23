import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./run-isolated-signer-smoke.sh", import.meta.url),
  "utf8",
);

test("Casino network smoke fails closed on chain id and isolates signer policy", () => {
  assert.match(source, /WTF_CASINO_NETWORK:-shadownet/);
  assert.match(source, /expected_chain_id=NetXsqzbfFenSTS/);
  assert.match(source, /expected_chain_id=NetXdQprcVkpaWU/);
  assert.match(source, /if \[\[ "\$\{chain_id\}" != "\$\{expected_chain_id\}" \]\]/);
  assert.match(source, /WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID=contract-admin/);
  assert.match(source, /WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION=1/);
  assert.match(source, /WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ=2000000/);
  assert.match(source, /WTF_OPERATOR_SIGNER_CALL_MUTEZ=1000000/);
  assert.match(source, /runuser -u wtf-signer -m/);
  assert.match(source, /WTF_CASINO_EXISTING_CONTRACT/);
  assert.match(source, /originationHash:\s*origination\?\.opHash \|\| null/);
  assert.match(source, /trap cleanup EXIT/);
});
