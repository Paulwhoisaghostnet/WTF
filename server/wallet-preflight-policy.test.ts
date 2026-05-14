import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inAppMarketRoutes = readFileSync("server/routes/in-app-market.ts", "utf8");
const clubDuesService = readFileSync("server/features/club-dues/service.ts", "utf8");
const casinoAccess = readFileSync("server/features/casino/access.ts", "utf8");

test("user-value payment intents reject unlinked wallet addresses before signing", () => {
  assert.match(inAppMarketRoutes, /assertLinkedWalletForUser/);
  assert.match(inAppMarketRoutes, /parsed\.data\.currency === "wtf"/);
  assert.match(inAppMarketRoutes, /await assertLinkedWalletForUser/);

  assert.match(clubDuesService, /assertLinkedWalletForUser/);
  assert.match(clubDuesService, /const walletAddress = await assertLinkedWalletForUser/);
  assert.match(clubDuesService, /walletAddress,/);

  assert.match(casinoAccess, /assertLinkedWalletForUser/);
  assert.match(casinoAccess, /const walletAddress = await assertLinkedWalletForUser/);
  assert.match(casinoAccess, /walletAddress,/);
});
