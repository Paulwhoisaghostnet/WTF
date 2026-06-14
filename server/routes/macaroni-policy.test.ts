import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Macaroni server routes keep publishing trusted-only while hosted pinning can use Pin Collector", () => {
  const source = readFileSync("server/routes/macaroni.ts", "utf8");

  assert.match(source, /requirePermission\("trusted_market_creator", "use_wtfos_pinning"\)/);
  assert.match(source, /requirePermission\("trusted_market_creator"\)/);
  assert.match(source, /stageAndPinUpload/);
  assert.match(source, /scopeType:\s*"macaroni_drop"/);
  assert.equal(source.includes("WTFGAMESHOW_IPFS_JWT"), false);
  assert.equal(source.includes("pinFileToIPFS"), false);
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
  assert.match(studioSource, /use_wtfos_pinning/);
  assert.match(studioSource, /wtf_pin_collector/);
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

test("Macaroni Studio uses sandbox-safe inline feedback instead of browser modals", () => {
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
  const themeSource = readFileSync("public/creation-tools/macaroni/css/theme.css", "utf8");
  const deploySource = studioSource.slice(
    studioSource.indexOf("async function deploy()"),
    studioSource.indexOf("async function sync()")
  );

  assert.match(studioHtml, /id="studioNotice" class="notice" role="status" aria-live="polite" hidden/);
  assert.match(studioSource, /function notify\(msg, cls = "err", statusId\)/);
  assert.match(studioSource, /function normalizeOptionalAddress\(value\)/);
  assert.match(studioSource, /if \(!MD\.isAddress\(text\)\) return ""/);
  assert.match(studioHtml, /id="treasuryAddr"[^>]+autocomplete="off"[^>]+autocapitalize="none"[^>]+spellcheck="false"/);
  assert.match(studioHtml, /id="royaltyAddr"[^>]+autocomplete="off"[^>]+autocapitalize="none"[^>]+spellcheck="false"/);
  assert.match(studioSource, /invalidAddressNotice\("Treasury", state\.drop\.treasuryAddr, "deployStatus"\)/);
  assert.match(deploySource, /treasury:\s*state\.drop\.treasuryAddr \|\| me/);
  assert.match(deploySource, /await MD\.assertOperationSafety\(\)/);
  assert.match(deploySource, /tezos\.wallet\.originate\(\{ code, storage \}\)\.send\(\)/);
  assert.doesNotMatch(deploySource, /state\.network\s*===\s*"mainnet"/);
  assert.doesNotMatch(studioSource, /mainnetDeployConfirm|requestMainnetDeployConfirmation|btnConfirmMainnetDeploy|btnCancelMainnetDeploy/);
  assert.match(themeSource, /\.notice\.err/);
  assert.doesNotMatch(studioSource, /(^|[^\w.])alert\s*\(/);
  assert.doesNotMatch(studioSource, /(^|[^\w.])confirm\s*\(/);
});

test("Macaroni Studio can reset drafts, restore backups, and visibly save sale stages", () => {
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");

  assert.match(studioHtml, /id="btnNewDrop"[^>]*>New drop \/ clear forms<\/button>/);
  assert.match(studioHtml, /restore a Studio backup JSON/);
  assert.match(studioHtml, /id="importBackup" accept="\.json,application\/json"/);
  assert.match(studioSource, /function freshDropState\(\)/);
  assert.match(studioSource, /function replaceState\(next\)/);
  assert.match(studioSource, /function startNewDrop\(\)/);
  assert.match(studioSource, /localStorage\.removeItem\(STORE_KEY\)/);
  assert.match(studioSource, /mediaFiles\.clear\(\)/);
  assert.match(studioSource, /coverFile = null/);
  assert.match(studioSource, /replaceState\(draft\)/);
  assert.match(studioSource, /btnNewDrop"\)\.addEventListener\("click", startNewDrop\)/);
  assert.match(studioSource, /data-stage-save/);
  assert.match(studioSource, /function saveStage\(i/);
  assert.match(studioSource, /data-stage-status/);
  assert.match(studioSource, /setStageStatus\(i, "edited", "warn"\)/);
});

test("Macaroni Studio keeps resume first and uses full-width workspace tabs", () => {
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
  const themeSource = readFileSync("public/creation-tools/macaroni/css/theme.css", "utf8");

  assert.ok(
    studioHtml.indexOf('id="secResume"') < studioHtml.indexOf('id="secNetwork"'),
    "resume section should be the first drop/contract panel"
  );
  assert.match(studioHtml, /<div class="tabs" role="tablist" aria-label="Macaroni workspace">/);
  assert.match(studioHtml, /id="tabDrop"[^>]+role="tab"[^>]+aria-selected="true"[^>]+aria-controls="viewDrop"[^>]+tabindex="0"/);
  assert.match(studioHtml, /id="tabPage"[^>]+role="tab"[^>]+aria-selected="false"[^>]+aria-controls="viewPage"[^>]+tabindex="-1"[^>]*>Drop Page Designer<\/button>/);
  assert.match(studioHtml, /id="viewDrop" role="tabpanel" aria-labelledby="tabDrop"/);
  assert.match(studioHtml, /id="viewPage" role="tabpanel" aria-labelledby="tabPage"/);
  assert.match(themeSource, /\.tabs\s*{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  const tabRule = themeSource.slice(themeSource.indexOf(".tab {"), themeSource.indexOf(".tab.active"));
  assert.match(tabRule, /width:\s*100%;/);
  assert.match(tabRule, /justify-content:\s*center;/);
  assert.match(tabRule, /min-height:\s*50px;/);
  assert.match(studioSource, /tabDrop"\)\.setAttribute\("aria-selected", page \? "false" : "true"\)/);
  assert.match(studioSource, /tabPage"\)\.setAttribute\("aria-selected", page \? "true" : "false"\)/);
  assert.match(studioSource, /tabDrop"\)\.tabIndex = page \? -1 : 0/);
  assert.match(studioSource, /tabPage"\)\.tabIndex = page \? 0 : -1/);
  assert.match(studioSource, /function onWorkspaceTabKey\(e\)/);
  assert.match(studioSource, /ArrowRight[\s\S]*activateWorkspaceTab\("page"\)/);
  assert.match(studioSource, /ArrowLeft[\s\S]*activateWorkspaceTab\("drop"\)/);
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
  assert.match(commonSource, /function configureWalletClient\(w\)/);
  assert.match(commonSource, /const resetClient = !\(options && options\.resetClient === false\)/);
  assert.match(commonSource, /wallet = makeWallet\(appName\)/);
  assert.match(commonSource, /function disableBeaconMetrics\(client\)/);
  assert.match(commonSource, /client\.sendMetrics = \(\) => \{\}/);
  assert.match(commonSource, /featuredWallets:\s*\["kukai",\s*"temple",\s*"umami"\]/);
  assert.match(commonSource, /async function resetBeaconPickerState\(\)/);
  assert.match(commonSource, /await resetBeaconPickerState\(\)/);
  assert.match(commonSource, /wallet\.client\.setActivePeer\(undefined\)/);
  assert.match(commonSource, /clearBeaconStorage\(\{\s*preserveIdentity:\s*true\s*\}\);\s*wallet = null;\s*activeAccount = null/s);
  assert.doesNotMatch(commonSource, /dropWallet/);
  assert.doesNotMatch(commonSource, /if \(!wallet\) wallet = makeWallet\(appName,\s*\{\s*resetClient:\s*false\s*\}\);\s*else configureWalletClient\(wallet\);/);
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
