import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const rewardsRoute = readFileSync(
  new URL("./routes/rewards.ts", import.meta.url),
  "utf8"
);
const claimClient = readFileSync(
  new URL("../client/src/lib/tezos/reward-redemption.ts", import.meta.url),
  "utf8"
);

test("reward cashouts create escrow redemptions instead of direct FA2 payouts", () => {
  assert.match(rewardsRoute, /WTF_REWARD_ESCROW_CONTRACT/);
  assert.match(rewardsRoute, /entrypoint:\s*"create_redemption"/);
  assert.match(rewardsRoute, /waitForRewardRedemptionCreation/);
  assert.match(rewardsRoute, /creationStatus === "failed"/);
  assert.doesNotMatch(rewardsRoute, /intent:\s*"disburse_wtf"/);
  assert.match(rewardsRoute, /status:\s*"claimable"/);
});

test("reward settlement verifies the exact applied user claim before marking paid", () => {
  assert.match(rewardsRoute, /operation\.status === "applied"/);
  assert.match(rewardsRoute, /operation\.sender\?\.address === opts\.redemption\.claimant/);
  assert.match(rewardsRoute, /operation\.target\?\.address === opts\.redemption\.contract/);
  assert.match(rewardsRoute, /entrypoint === "claim_redemption"/);
  assert.match(rewardsRoute, /markWtfRewardLedgerPaid/);
});

test("browser claim uses wallet API, network preflight, and confirmation", () => {
  assert.match(claimClient, /assertNetworkReadyForSend\(walletAddress\)/);
  assert.match(claimClient, /tezos\.wallet\.at\(redemption\.contract\)/);
  assert.match(claimClient, /\.claim_redemption\(/);
  assert.match(claimClient, /await operation\.confirmation\(1\)/);
  assert.match(claimClient, /return operation\.opHash/);
});
