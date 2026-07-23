import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./run-isolated-signer-smoke.sh", import.meta.url),
  "utf8",
);

test("Club dues release smoke proves both network and two-step control", () => {
  assert.match(source, /expected_chain_id=NetXsqzbfFenSTS/);
  assert.match(source, /expected_chain_id=NetXdQprcVkpaWU/);
  assert.match(source, /WTF_CLUB_DUES_DEPLOYER_WALLET_ID:-contract-admin/);
  assert.match(source, /WTF_CLUB_DUES_PAYMENT_WALLET_ID:-club-dues-manager/);
  assert.match(source, /WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION=1/);
  assert.match(source, /runuser -u wtf-signer -m/);
  assert.match(source, /WTF_CLUB_DUES_EXISTING_CONTRACT/);
  assert.match(source, /WTF_CLUB_DUES_RESUME_STAGE/);
  assert.match(source, /after_accept_admin/);
  assert.match(source, /after_propose_admin/);
  assert.match(source, /wait_applied/);
  assert.match(source, /custom contract-admin "\$\{contract_address\}" propose_admin/);
  assert.match(source, /custom club-dues-manager "\$\{contract_address\}" accept_admin/);
  assert.match(source, /custom club-dues-manager "\$\{contract_address\}" propose_admin/);
  assert.match(source, /custom contract-admin "\$\{contract_address\}" accept_admin/);
  assert.match(source, /WTF_OPERATOR_SIGNER_CALL_MUTEZ=1000000/);
  assert.match(source, /custom "\$\{payment_wallet_id\}" "\$\{contract_address\}" pay_membership/);
  assert.match(source, /trap cleanup EXIT/);
});
