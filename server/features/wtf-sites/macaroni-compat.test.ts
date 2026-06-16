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
  assert.match(normalized, /Mint is Live/);
  assert.match(normalized, /Currently on Sale Stage/);
  assert.match(normalized, /https:\/\/x\.com\/intent\/post/);
  assert.match(normalized, /https:\/\/bsky\.app\/intent\/compose/);
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

test("non-Macaroni pages are not rewritten", () => {
  const html = "<main><h1>Plain user site</h1></main>";
  assert.equal(normalizeMacaroniPublishedHtml(html), html);
});
