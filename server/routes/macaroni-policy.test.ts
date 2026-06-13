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
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");

  assert.match(commonSource, /\/api\/auth\/csrf-token/);
  assert.match(commonSource, /X-CSRF-Token/);
  assert.match(commonSource, /\/api\/macaroni\/ipfs\/pin/);
  assert.match(studioSource, /\/api\/auth\/user/);
  assert.match(studioSource, /trusted_market_creator/);
  assert.match(studioSource, /addPinKindOption\("wtfos"/);
  assert.match(studioSource, /MD\.apiFetch\("\/api\/macaroni\/publish"/);
  assert.equal(commonSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioHtml.includes('<option value="wtfos">'), false);
});

test("Macaroni exposes OBJKT-compatible media limits in Studio and server pinning", () => {
  const routeSource = readFileSync("server/routes/macaroni.ts", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");

  assert.match(routeSource, /DEFAULT_IPFS_MAX_BYTES = 250 \* 1024 \* 1024/);
  assert.match(studioSource, /OBJKT_ARTIFACT_MAX_BYTES = 250 \* MB/);
  assert.match(studioSource, /OBJKT_COLLECTION_IMAGE_MAX_BYTES = 1 \* MB/);
  assert.match(studioSource, /new Set\(\["image\/jpeg", "image\/png"\]\)/);
  assert.match(studioSource, /validateArtifactFile\(f\)/);
  assert.match(studioSource, /validateCollectionCover\(coverFile\)/);
  assert.match(studioSource, /OBJKT_COLLECTION_IMAGE_MIME_TYPES\.has\(state\.drop\.coverMime\)/);
  assert.match(studioSource, /tokenNeedsCover\(t\) \? cover : artifact/);
  assert.match(studioHtml, /Collection logo \/ cover \(≤1 MB, square JPG\/PNG\)/);
  assert.match(studioHtml, /accept="image\/png,image\/jpeg"/);
  assert.match(studioHtml, /Artwork files \(≤250 MB each, named by id\)/);
  assert.doesNotMatch(studioHtml, /≤5 MB/);
});

test("Macaroni generated pages use Fileship defaults, accessible controls, and one connect flow", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");
  const dropHtml = readFileSync("public/creation-tools/macaroni/drop.html", "utf8");
  const dropConfig = readFileSync("public/creation-tools/macaroni/drop.config.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");

  assert.match(commonSource, /const DEFAULT_GATEWAY = "https:\/\/ipfs\.fileship\.xyz\/"/);
  assert.match(dropConfig, /gateway:\s*"https:\/\/ipfs\.fileship\.xyz\/"/);
  assert.match(studioHtml, /placeholder="https:\/\/ipfs\.fileship\.xyz\/"/);
  assert.match(commonSource, /let connectPromise = null/);
  assert.match(commonSource, /if \(connectPromise\) return connectPromise/);
  assert.match(dropSource, /let walletConnecting = false/);
  assert.match(dropSource, /aria-busy/);
  assert.match(dropSource, /connect\.disabled = walletConnecting \|\| connected/);
  assert.match(dropHtml, /<main class="wrap narrow" id="main">/);
  assert.match(dropHtml, /role="progressbar"/);
  assert.match(dropHtml, /aria-live="polite"/);
  assert.match(dropHtml, /aria-label="Decrease mint quantity"/);
});

test("Macaroni generated mint quantity clamps to live supply and wallet allowance", () => {
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");

  assert.match(dropSource, /const MINT_QTY_UI_CAP = 10/);
  assert.match(dropSource, /function collectionRemaining\(\)/);
  assert.match(dropSource, /function effectiveQtyMax\(stage\)/);
  assert.match(dropSource, /limits\.push\(left\)/);
  assert.match(dropSource, /stage\.maxPerWallet/);
  assert.match(dropSource, /stage\.useAllowlist/);
  assert.match(dropSource, /allowRemaining/);
  assert.match(dropSource, /walletAllowancePending\(stage\)/);
  assert.match(dropSource, /syncMintQuantityUi\(stage\)/);
  assert.match(dropSource, /await refresh\(\)/);
  assert.match(dropSource, /only \$\{max\} mint\(s\) are currently available for this wallet/);
  assert.match(dropSource, /qtyPlus[\s\S]*effectiveQtyMax\(activeStage\(\)\)/);
});

test("Macaroni generated pages only publish bounded theme CSS", () => {
  const publishSource = readFileSync("server/features/macaroni/publish.ts", "utf8");
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");

  assert.match(publishSource, /sanitizeMacaroniConfigForPublish/);
  assert.match(publishSource, /SAFE_HEX_COLOR/);
  assert.match(publishSource, /customCss:\s*""/);
  assert.match(dropSource, /sanitizeCssColor/);
  assert.match(dropSource, /sanitizeFontStack/);
  assert.match(dropSource, /\$\("customCss"\)\.textContent = ""/);
  assert.match(studioSource, /sanitizeDropConfig/);
  assert.match(studioSource, /customCss:\s*""/);
  assert.match(studioHtml, /<input type="hidden" id="pageCss" value="" \/>/);
  assert.equal(studioHtml.includes("Custom CSS"), false);
  assert.doesNotMatch(dropSource, /customCss\)[\s\S]{0,80}\.textContent = CFG\.theme\.customCss/);
  assert.doesNotMatch(studioSource, /customCss:\s*state\.page\.css/);
});

test("Macaroni treats Shadownet as a first-class RPC and chain-id guarded network", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");
  const vendorSource = readFileSync("public/creation-tools/macaroni/vendor/tezos.js", "utf8");
  const frameSource = readFileSync("client/src/features/creation-tools/CreationToolFrame.tsx", "utf8");

  assert.match(commonSource, /shadownet:\s*{\s*label:\s*"Shadownet \(test\)"/s);
  assert.match(commonSource, /rpc:\s*"https:\/\/rpc\.shadownet\.teztnets\.com"/);
  assert.match(commonSource, /beaconNetwork:\s*"shadownet"/);
  assert.match(commonSource, /shadownet:\s*"NetXsqzbfFenSTS"/);
  assert.match(commonSource, /await assertRpcChainId\(true\)/);
  assert.match(commonSource, /preferredNetwork:\s*beaconPreferredNetwork\(\)/);
  assert.match(commonSource, /enableMetrics:\s*false/);
  assert.match(commonSource, /const resetClient = !\(options && options\.resetClient === false\)/);
  assert.match(commonSource, /wallet = makeWallet\(appName,\s*{\s*resetClient:\s*false\s*}\)/);
  assert.match(commonSource, /function disableBeaconMetrics\(client\)/);
  assert.match(commonSource, /client\.sendMetrics = \(\) => \{\}/);
  assert.match(commonSource, /featuredWallets:\s*\["kukai",\s*"temple",\s*"umami"\]/);
  assert.match(commonSource, /async function resetBeaconPickerState\(\)/);
  assert.match(commonSource, /await resetBeaconPickerState\(\)/);
  assert.match(commonSource, /wallet\.client\.setActivePeer\(undefined\)/);
  assert.match(commonSource, /sdk-secret-seed/);
  assert.match(commonSource, /matrix-selected-node/);
  assert.match(commonSource, /clearBeaconStorage\(\{\s*preserveIdentity:\s*true\s*\}\)/);
  assert.match(commonSource, /readWalletSession/);
  assert.match(commonSource, /acc\.address !== stored\.address/);
  assert.match(commonSource, /async function disconnectWallet\(\)/);
  assert.match(dropSource, /btnDisconnect/);
  assert.match(dropSource, /refreshBalance\("checked before mint"\)/);
  assert.match(dropSource, /fetchOwnedTokenIds/);
  assert.match(dropSource, /stage\.maxPerWallet/);
  assert.match(vendorSource, /rR\(\{\.\.\.e,matrixNodes:t\},e\?\.resetClient\)/);
  assert.match(vendorSource, /shadownet:"https:\/\/shadownet\.kukai\.app"/);
  assert.match(frameSource, /allow-popups-to-escape-sandbox/);
  assert.equal(commonSource.includes("shadownet rotates"), false);
});
