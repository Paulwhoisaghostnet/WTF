import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMacaroniPublishedHtml } from "./macaroni-compat";

test("published Macaroni pages are served with the current runtime", () => {
  const html = `<!doctype html>
<html>
<head><title>Old Macaroni Drop</title></head>
<body>
<script>window.DROP_CONFIG = {"title":"Old Drop"};</script>
<script id="macaroniCommonJs">window.MacaroniDrop = {};</script>
<script id="macaroniDropJs">console.log("Stage \${act + 1} live", "Temple / Kukai / Umami", "mint(s)");</script>
</body>
</html>`;

  const normalized = normalizeMacaroniPublishedHtml(html);

  assert.match(normalized, /data-macaroni-runtime-compat="current"/);
  assert.match(normalized, /data-macaroni-runtime-compat-style/);
  assert.match(normalized, /https:\/\/wtfos\.app\/creation-tools\/macaroni\/vendor\/octez-connect\.js/);
  assert.match(normalized, /https:\/\/wtfos\.app\/creation-tools\/macaroni\/js\/octez-wallet\.js/);
  assert.match(normalized, /installOctezPrimaryWallet\(\{ patchBeacon: true \}\)/);
  assert.ok(normalized.indexOf("vendor/octez-connect.js") < normalized.indexOf('id="macaroniCommonJs"'));
  assert.ok(normalized.indexOf("js/octez-wallet.js") < normalized.indexOf('id="macaroniCommonJs"'));
  assert.match(normalized, /Mint is Live/);
  assert.match(normalized, /Currently on Sale Stage/);
  assert.match(normalized, /https:\/\/x\.com\/intent\/post/);
  assert.match(normalized, /https:\/\/bsky\.app\/intent\/compose/);
  assert.match(normalized, /function creatorShareIdentity\(service, meta\)/);
  assert.match(normalized, /function tokenShareMediaUrl\(meta\)/);
  assert.match(normalized, /function ensureShareMedia\(text, media\)/);
  assert.match(normalized, /function dropShareText\(service, stage, statusText\)/);
  assert.match(normalized, /function updateDropShareLinks\(stage, statusText\)/);
  assert.match(normalized, /function walletTokenPresentation\(mintedIds, ownedIds\)/);
  assert.match(normalized, /fetchMintedTokenIds/);
  assert.match(normalized, /Currently owned/);
  assert.match(normalized, /function loadCustomRecentMintsCompat\(options\)/);
  assert.match(normalized, /airportersRecentGrid/);
  assert.match(normalized, /customRecentMintLimit\(grid\)/);
  assert.doesNotMatch(normalized, /Temple \/ Kukai \/ Umami/);
  assert.doesNotMatch(normalized, /Stage \$\{act \+ 1\} live/);
  assert.doesNotMatch(normalized, /mint\(s\)/);
});

test("published Macaroni compatibility removes named-network RPC overrides before runtime swap", () => {
  const html = `<!doctype html>
<html>
<body>
<script>window.DROP_CONFIG = {"network":"mainnet"};</script>
<script id="macaroniCommonJs">function beaconNetworkSpec(){ return { type: net.beaconNetwork, rpcUrl }; }</script>
<script id="macaroniDropJs">console.log("old drop");</script>
</body>
</html>`;

  const normalized = normalizeMacaroniPublishedHtml(html);

  assert.doesNotMatch(normalized, /\{ type: net\.beaconNetwork,\s*rpcUrl \}/);
  assert.match(normalized, /\{ type: net\.beaconNetwork \}/);
});

test("published Macaroni compatibility does not duplicate Octez bridge tags", () => {
  const html = `<!doctype html>
<html>
<body>
<script>window.DROP_CONFIG = {"network":"mainnet"};</script>
<script src="https://wtfos.app/creation-tools/macaroni/js/octez-wallet.js"></script>
<script id="macaroniCommonJs">window.MacaroniDrop = {};</script>
<script id="macaroniDropJs">console.log("old drop");</script>
</body>
</html>`;

  const normalized = normalizeMacaroniPublishedHtml(html);

  assert.equal((normalized.match(/octez-wallet\.js/g) || []).length, 1);
});

test("non-Macaroni pages are not rewritten", () => {
  const html = "<main><h1>Plain user site</h1></main>";
  assert.equal(normalizeMacaroniPublishedHtml(html), html);
});
