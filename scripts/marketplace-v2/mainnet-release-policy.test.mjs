import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prepareSource = readFileSync(
  new URL("./prepare-mainnet-artifact.ts", import.meta.url),
  "utf8",
);
const runnerSource = readFileSync(
  new URL("./run-isolated-signer-mainnet.sh", import.meta.url),
  "utf8",
);

test("Marketplace V2 mainnet artifact is gated by exact Shadownet proof and size", () => {
  assert.match(prepareSource, /shadownet-existing-e2e-report\.md/);
  assert.match(prepareSource, /- Status: PASSED/);
  assert.match(prepareSource, /compiledCodeSha256 !== shadownetCodeSha256/);
  assert.match(prepareSource, /measureSignedOriginationOperationBytes/);
  assert.match(prepareSource, /MIN_OPERATION_HEADROOM/);
  assert.match(prepareSource, /legacyPolicy: "preserve-live-unmodified-for-human-recovery"/);
  assert.match(prepareSource, /deployerWalletId: "wtf-os-root"/);
  assert.match(prepareSource, /adminWalletId: "contract-admin"/);
});

test("Marketplace V2 mainnet runner isolates signing and proves final authority", () => {
  assert.match(runnerSource, /expected_chain_id=NetXdQprcVkpaWU/);
  assert.match(runnerSource, /WTF_MARKETPLACE_V2_DEPLOYER_WALLET_ID:-wtf-os-root/);
  assert.match(runnerSource, /WTF_MARKETPLACE_V2_ADMIN_WALLET_ID:-contract-admin/);
  assert.match(runnerSource, /runuser -u wtf-signer -m/);
  assert.match(runnerSource, /WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION=1/);
  assert.match(runnerSource, /WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ=0/);
  assert.match(runnerSource, /custom "\$\{admin_wallet_id\}".*pause/);
  assert.match(runnerSource, /custom "\$\{admin_wallet_id\}".*unpause/);
  assert.match(runnerSource, /assert_storage "\$\{contract_address\}" false/);
  assert.doesNotMatch(
    runnerSource,
    /KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj/,
  );
});
