import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("server/routes/wallets.ts", "utf8");
const component = readFileSync("client/src/components/WalletDossier.tsx", "utf8");
const profile = readFileSync("client/src/pages/Profile.tsx", "utf8");

test("wallet relationship graph is scoped to the authenticated user", () => {
  assert.match(route, /router\.get\("\/api\/profile\/wallet-graph", isAuthenticated/);
  assert.match(route, /eq\(userWallets\.userId, user\.id\)/);
  assert.match(route, /eq\(walletHoldings\.userId, user\.id\)/);
  assert.doesNotMatch(route, /req\.query\.address/);
});

test("wallet relationship graph maps only indexed wallet evidence", () => {
  assert.match(route, /linked_wallet/);
  assert.match(route, /owns_domain/);
  assert.match(route, /holds_token/);
  assert.match(route, /created_by/);
  assert.match(route, /\.limit\(120\)/);
  assert.match(route, /resolveTezosDomainsIdentity/);
  assert.match(route, /tokenMetadata\.creatorAddress/);
});

test("profile renders wallet relationship graph without a new crawler surface", () => {
  assert.match(component, /export function WalletRelationshipGraph/);
  assert.match(component, /\/api\/profile\/wallet-graph/);
  assert.match(component, /Wallets/);
  assert.match(component, /Indexed tokens/);
  assert.match(component, /Creator addresses/);
  assert.match(profile, /<WalletRelationshipGraph \/>/);
});
