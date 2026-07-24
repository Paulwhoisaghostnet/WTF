import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./fund-mainnet-deployer.ts", import.meta.url),
  "utf8",
);

test("Marketplace V2 funding is a bounded mainnet treasury-to-root transfer", () => {
  assert.match(source, /NetXdQprcVkpaWU/);
  assert.match(source, /arcade-treasury/);
  assert.match(source, /tz1T397DtvefNp62r1juJv6NeQ7qxc3fSWZZ/);
  assert.match(source, /tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo/);
  assert.match(source, /MAX_FUNDING_MUTEZ = 3_450_000/);
  assert.match(source, /FUND_WTF_OS_ROOT_FOR_MARKETPLACE_V2/);
  assert.match(source, /--dry-run/);
});
