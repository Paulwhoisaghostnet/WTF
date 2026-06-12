import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Macaroni server routes keep pinning and publishing behind trusted creator permission", () => {
  const source = readFileSync("server/routes/macaroni.ts", "utf8");
  const permissionUses = source.match(/requirePermission\("trusted_market_creator"\)/g) ?? [];

  assert.equal(permissionUses.length, 2);
  assert.match(source, /WTFGAMESHOW_IPFS_JWT/);
  assert.match(source, /pinFileToIPFS/);
  assert.equal(source.includes("VITE_PINATA_JWT"), false);
});

test("Macaroni static API calls use the wtfOS CSRF boundary and do not embed pinning secrets", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");

  assert.match(commonSource, /\/api\/auth\/csrf-token/);
  assert.match(commonSource, /X-CSRF-Token/);
  assert.match(commonSource, /\/api\/macaroni\/ipfs\/pin/);
  assert.match(studioSource, /MD\.apiFetch\("\/api\/macaroni\/publish"/);
  assert.equal(commonSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioSource.includes("VITE_PINATA_JWT"), false);
});

test("Macaroni treats Shadownet as a first-class RPC and chain-id guarded network", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");
  const vendorSource = readFileSync("public/creation-tools/macaroni/vendor/tezos.js", "utf8");

  assert.match(commonSource, /shadownet:\s*{\s*label:\s*"Shadownet \(test\)"/s);
  assert.match(commonSource, /rpc:\s*"https:\/\/rpc\.shadownet\.teztnets\.com"/);
  assert.match(commonSource, /beaconNetwork:\s*"shadownet"/);
  assert.match(commonSource, /shadownet:\s*"NetXsqzbfFenSTS"/);
  assert.match(commonSource, /await assertRpcChainId\(true\)/);
  assert.match(commonSource, /preferredNetwork:\s*beaconPreferredNetwork\(\)/);
  assert.match(commonSource, /enableMetrics:\s*false/);
  assert.match(commonSource, /resetClient:\s*true/);
  assert.match(commonSource, /function disableBeaconMetrics\(client\)/);
  assert.match(commonSource, /client\.sendMetrics = \(\) => \{\}/);
  assert.match(commonSource, /featuredWallets:\s*\["kukai",\s*"temple",\s*"umami"\]/);
  assert.match(commonSource, /async function resetBeaconPickerState\(\)/);
  assert.match(commonSource, /await resetBeaconPickerState\(\)/);
  assert.match(commonSource, /wallet\.client\.setActivePeer\(undefined\)/);
  assert.match(commonSource, /sdk-secret-seed/);
  assert.match(commonSource, /matrix-selected-node/);
  assert.match(commonSource, /clearBeaconStorage\(\{\s*preserveIdentity:\s*true\s*\}\)/);
  assert.match(commonSource, /if \(!wallet\) return null/);
  assert.doesNotMatch(commonSource, /restoreWallet[\s\S]*wallet = makeWallet/);
  assert.match(vendorSource, /rR\(\{\.\.\.e,matrixNodes:t\},e\?\.resetClient\)/);
  assert.match(vendorSource, /shadownet:"https:\/\/shadownet\.kukai\.app"/);
  assert.equal(commonSource.includes("shadownet rotates"), false);
});
