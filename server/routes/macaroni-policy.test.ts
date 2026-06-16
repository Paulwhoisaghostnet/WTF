import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Macaroni server routes keep wtfOS pinning and publishing trusted-creator only", () => {
  const source = readFileSync("server/routes/macaroni.ts", "utf8");

  const trustedRouteChecks = source.match(/requirePermission\("trusted_market_creator"\)/g) || [];
  assert.ok(trustedRouteChecks.length >= 2, "pinning and publishing should both require trusted_market_creator");
  assert.doesNotMatch(source, /requirePermission\("trusted_market_creator", "use_wtfos_pinning"\)/);
  assert.match(source, /router\.get\("\/api\/macaroni\/installers", isAuthenticated/);
  assert.match(source, /MACARONI_INSTALLER_MACOS_URL/);
  assert.match(source, /MACARONI_INSTALLER_WINDOWS_URL/);
  assert.match(source, /MACARONI_INSTALLER_RASPBERRY_PI_URL/);
  assert.match(source, /safeInstallerUrl/);
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
  assert.match(commonSource, /\/api\/macaroni\/ipfs\/upload-ticket/);
  assert.match(commonSource, /ticket\.uploadUrl/);
  assert.match(commonSource, /Authorization: "Bearer " \+ ticket\.token/);
  assert.match(commonSource, /credentials: "omit"/);
  assert.match(studioSource, /\/api\/auth\/user/);
  assert.match(studioSource, /trusted_market_creator/);
  assert.doesNotMatch(studioSource, /use_wtfos_pinning/);
  assert.doesNotMatch(studioSource, /wtf_pin_collector/);
  assert.match(studioSource, /pin:\s*\{ kind: "pinata"/);
  assert.match(studioSource, /addPinKindOption\("wtfos"/);
  assert.match(studioSource, /btn\.hidden = !canUseWtfosPinning/);
  assert.match(studioSource, /Export the site package for your own host/);
  assert.match(studioSource, /\/api\/macaroni\/installers/);
  assert.match(studioSource, /MD\.apiFetch\("\/api\/macaroni\/publish"/);
  assert.equal(commonSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioHtml.includes('<option value="wtfos">'), false);
  assert.match(studioHtml, /id="btnPublishWtfOS" hidden/);
  assert.match(studioHtml, /id="installerMacos"/);
  assert.match(studioHtml, /id="installerWindows"/);
  assert.match(studioHtml, /id="installerRaspberryPi"/);
});

test("Macaroni wtfOS publish requires a deployed KT1 contract", () => {
  const routeSource = readFileSync("server/routes/macaroni.ts", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");

  assert.match(routeSource, /const KT1_CONTRACT_ADDRESS = \/\^KT1/);
  assert.match(routeSource, /function normalizeMacaroniContract\(value: unknown\): string \| null/);
  assert.match(routeSource, /const contract = normalizeMacaroniContract\(config\.contract\)/);
  assert.match(routeSource, /Deploy or resume a KT1 contract before publishing to wtfOS\./);
  assert.match(routeSource, /config\.contract = contract/);
  assert.match(routeSource, /publishQueuedWtfosOutboxForSource/);
  assert.match(routeSource, /listWtfosOutboxForSource/);
  assert.match(routeSource, /sourceRefType:\s*"wtf_user_site_version"/);
  assert.match(routeSource, /probePublicMacaroniUrl/);
  assert.match(routeSource, /publishStatus/);
  assert.match(routeSource, /const live = pdsDelivery\.ready && publicProbe\.live/);
  assert.match(routeSource, /pending_pds_delivery/);
  assert.match(routeSource, /pending_public_serving/);

  assert.match(studioSource, /const KT1_CONTRACT_ADDRESS = \/\^KT1/);
  assert.match(studioSource, /function isValidKt1Address\(value\)/);
  assert.match(studioSource, /function assertWtfOSPublishReady\(cfg\)/);
  assert.match(studioSource, /Deploy or resume a KT1 contract before publishing to wtfOS\./);
  assert.match(studioSource, /cfg = assertWtfOSPublishReady\(currentConfig\(\)\)/);
  assert.match(studioSource, /j\.live === false/);
  assert.match(studioSource, /pending_pds_delivery/);
  assert.match(studioSource, /PDS delivery is still catching up/);
  assert.match(studioSource, /\.me serving is still catching up/);
  assert.doesNotMatch(
    studioSource,
    /async function publishWtfOSSite\(\) \{\s*const body = configJs\(\)/,
    "wtfOS publish must not reuse draft-tolerant website export config"
  );
  assert.match(studioHtml, /Publish to wtfOS<\/strong> requires a deployed or resumed <code>KT1/);
});

test("Macaroni exposes practical media limits in Studio and server pinning", () => {
  const routeSource = readFileSync("server/routes/macaroni.ts", "utf8");
  const limitSource = readFileSync("server/features/macaroni/upload-limits.ts", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(routeSource, /features\/macaroni\/upload-limits/);
  assert.match(limitSource, /MACARONI_IPFS_HARD_MAX_BYTES = 1024 \* MEBIBYTE_BYTES/);
  assert.match(limitSource, /MACARONI_IPFS_AVERAGE_MAX_BYTES = 250 \* MEBIBYTE_BYTES/);
  assert.match(limitSource, /function macaroniIpfsMaxBytes\(\): number \{\s*return MACARONI_IPFS_HARD_MAX_BYTES;\s*\}/s);
  assert.match(routeSource, /uploadLimitLabel\(macaroniIpfsMaxBytes\(\)\)/);
  assert.match(studioSource, /const GB = 1024 \* MB/);
  assert.match(studioSource, /OBJKT_ARTIFACT_AVERAGE_BYTES = 250 \* MB/);
  assert.match(studioSource, /OBJKT_ARTIFACT_MAX_BYTES = 1 \* GB/);
  assert.match(studioSource, /mediaBytes: 0/);
  assert.match(studioSource, /function artifactSizePolicy\(\)/);
  assert.match(studioSource, /assertArtifactSizePolicy\(\{ requireKnownSizes: true \}\)/);
  assert.match(studioSource, /OBJKT_COLLECTION_IMAGE_MAX_BYTES = 1 \* MB/);
  assert.match(studioSource, /new Set\(\["image\/jpeg", "image\/png"\]\)/);
  assert.match(studioSource, /validateArtifactFile\(f\)/);
  assert.match(studioSource, /validateCollectionCover\(coverFile\)/);
  assert.match(studioSource, /OBJKT_COLLECTION_IMAGE_MIME_TYPES\.has\(state\.drop\.coverMime\)/);
  assert.match(studioSource, /function tokenNeedsMediaPreview\(t\)/);
  assert.match(studioSource, /mime === "image\/gif" \|\| mime\.startsWith\("video\/"\)/);
  assert.match(studioSource, /\/api\/macaroni\/media-preview/);
  assert.match(studioSource, /tokenNeedsMediaPreview\(t\) && !t\.previewCid/);
  assert.match(studioSource, /const display = t\.previewCid \? "ipfs:\/\/" \+ t\.previewCid : tokenNeedsCover\(t\) \? cover : artifact/);
  assert.match(studioSource, /formats\.push\(\{ uri: display, mimeType: t\.previewMime \|\| state\.drop\.coverMime \|\| "image\/png" \}\)/);
  assert.match(studioHtml, /Collection logo \/ cover \(≤1 MB, square JPG\/PNG\)/);
  assert.match(studioHtml, /accept="image\/png,image\/jpeg"/);
  assert.match(studioHtml, /Artwork files \(≤1 GB each, ≤250 MB average, named by id\)/);
  assert.match(envExample, /Macaroni hosted uploads use a fixed 1 GB/);
  assert.match(envExample, /average 250 MB or less/);
  assert.match(envExample, /MACARONI_DIRECT_UPLOAD_ORIGIN=/);
  assert.match(envExample, /MACARONI_UPLOAD_TICKET_SECRET=/);
  assert.doesNotMatch(studioHtml, /≤5 MB/);
  assert.doesNotMatch(studioHtml, /≤250 MB each/);
});

test("Macaroni hosted pinning has a direct-origin ticketed upload lane", () => {
  const routeSource = readFileSync("server/routes/macaroni.ts", "utf8");
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const caddyfile = readFileSync("Caddyfile", "utf8");

  assert.match(routeSource, /MACARONI_UPLOAD_AUDIENCE = "macaroni-ipfs-upload"/);
  assert.match(routeSource, /MACARONI_UPLOAD_PATH = "\/api\/macaroni\/ipfs\/upload"/);
  assert.match(routeSource, /MACARONI_DIRECT_UPLOAD_ORIGIN/);
  assert.match(routeSource, /MACARONI_UPLOAD_TICKET_SECRET/);
  assert.match(routeSource, /router\.post\(\s*"\/api\/macaroni\/ipfs\/upload-ticket",\s*requirePermission\("trusted_market_creator"\)/s);
  assert.match(routeSource, /createHmac\("sha256", macaroniUploadTicketSecret\(\)\)/);
  assert.match(routeSource, /timingSafeEqual/);
  assert.match(routeSource, /usedUploadTickets\.set\(ticket\.jti, ticket\.exp\)/);
  assert.match(routeSource, /router\.post\(\s*MACARONI_UPLOAD_PATH,\s*requireMacaroniUploadTicket,\s*runPinUpload/s);
  assert.match(routeSource, /file\.buffer\.length !== ticket\.byteSize/);
  assert.match(routeSource, /userId: ticket\.sub/);
  assert.match(commonSource, /async function issueWtfosUploadTicket/);
  assert.match(commonSource, /\/api\/macaroni\/ipfs\/upload-ticket/);
  assert.match(commonSource, /uploadFormData\(ticket\.uploadUrl/);
  assert.match(commonSource, /xhr\.upload\.onprogress/);
  assert.match(commonSource, /credentials: "omit"/);
  assert.match(commonSource, /Configure the direct Macaroni upload hostname/);
  assert.match(studioSource, /function makePinUploadProgress/);
  assert.match(studioSource, /upload complete, waiting for IPFS CID/);
  assert.match(caddyfile, /upload\.wtfos\.app,\s*upload\.5-78-202-50\.sslip\.io\s*\{[\s\S]*handle \/api\/macaroni\/ipfs\/upload[\s\S]*handle\s*\{\s*respond 404\s*\}[\s\S]*\}/);
});

test("Macaroni creates OBJKT-sized per-token previews for GIF and video media", () => {
  const routeSource = readFileSync("server/routes/macaroni.ts", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");
  const themeSource = readFileSync("public/creation-tools/macaroni/css/theme.css", "utf8");

  assert.match(routeSource, /MACARONI_TOKEN_PREVIEW_MAX_BYTES = 2 \* 1024 \* 1024/);
  assert.match(routeSource, /MACARONI_TOKEN_PREVIEW_TIMEOUT_MS = 45_000/);
  assert.match(routeSource, /MACARONI_TOKEN_PREVIEW_MAX_CONCURRENT = 2/);
  assert.match(routeSource, /MACARONI_TOKEN_PREVIEW_MIME_TYPES = new Set\(\[[\s\S]*"video\/mp4"[\s\S]*"video\/webm"/);
  assert.match(routeSource, /router\.post\(\s*"\/api\/macaroni\/media-preview",\s*isAuthenticated,\s*runTokenPreviewUpload/s);
  assert.match(routeSource, /tryAcquireMacaroniTokenPreviewSlot\(\)/);
  assert.match(routeSource, /res\.status\(429\)\.json\(\{ error: "Macaroni token preview processing is busy; try again in a moment" \}\)/);
  assert.match(routeSource, /spawn\("ffmpeg"/);
  assert.match(routeSource, /child\.kill\("SIGKILL"\)/);
  assert.match(routeSource, /palettegen=max_colors/);
  assert.match(routeSource, /X-Macaroni-Preview-Kind", "animated-gif"/);

  assert.match(studioSource, /const OBJKT_TOKEN_PREVIEW_MAX_BYTES = 2 \* MB/);
  assert.match(studioSource, /function makeStillVideoPreview\(file, maxSide, type, quality\)/);
  assert.match(studioSource, /video\.currentTime/);
  assert.match(studioSource, /async function makeHostedMediaPreview\(file\)/);
  assert.match(studioSource, /MD\.apiFetch\("\/api\/macaroni\/media-preview"/);
  assert.match(studioSource, /async function pinMediaPreview\(provider, token, file, indexLabel\)/);
  assert.match(studioSource, /token\.previewCid = await MD\.pinBlob/);
  assert.match(studioSource, /artifactUri:\s*artifact/);
  assert.match(studioSource, /displayUri:\s*display/);
  assert.match(studioSource, /thumbnailUri:\s*display/);

  assert.match(dropSource, /function tokenLooksVideo\(meta\)/);
  assert.match(dropSource, /if \(\(tokenLooksGif\(meta\) \|\| tokenLooksVideo\(meta\)\) && \(!preferred \|\| sameIpfsUri\(preferred, CFG\.cover\)\)\)/);
  assert.match(dropSource, /const video = document\.createElement\("video"\)/);
  assert.match(dropSource, /hydrateRecentMints\(fetched\)/);
  assert.match(dropSource, /recentMintsRetryTimer = setTimeout/);
  assert.match(themeSource, /\.recent-mint-media img,\s*\.recent-mint-media video/s);
});

test("Macaroni generated mint pages classify confirmation polling timeouts by operation hash", () => {
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");

  assert.match(dropSource, /function isConfirmationTimeout\(e\)/);
  assert.match(dropSource, /confirmation polling timed out\|polling timed out/);
  assert.match(dropSource, /function operationHash\(op\)/);
  assert.match(dropSource, /function setOperationProgressStatus\(statusId, actionLabel, hash, suffix\)/);
  assert.match(dropSource, /waiting for chain confirmation/);
  assert.match(dropSource, /async function confirmWalletOperation\(op, entrypoint, statusId, actionLabel\)/);
  assert.match(dropSource, /op\.confirmation\(1\)/);
  assert.match(dropSource, /\/v1\/operations\/transactions\/\$\{encodeURIComponent\(hash\)\}/);
  assert.match(dropSource, /operationTargetAddress\(row\) !== CFG\.contract/);
  assert.match(dropSource, /operationEntrypoint\(row\) !== entrypoint/);
  assert.match(dropSource, /row\?\.status === "applied"/);
  assert.match(dropSource, /row\.status && row\.status !== "applied"/);
  assert.match(dropSource, /\`\$\{actionLabel\} not confirmed\`/);
  assert.match(dropSource, /Check \$\{operationLink\(hash\)\} before retrying/);
  assert.doesNotMatch(dropSource, /confirmation\(1\);\s*return extractMintedIds\(op\)/);
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
  const publishSource = readFileSync("server/features/macaroni/publish.ts", "utf8");
  const themeSource = readFileSync("public/creation-tools/macaroni/css/theme.css", "utf8");

  assert.match(commonSource, /const DEFAULT_GATEWAY = "https:\/\/ipfs\.fileship\.xyz\/"/);
  assert.match(dropConfig, /gateway:\s*"https:\/\/ipfs\.fileship\.xyz\/"/);
  assert.match(studioHtml, /placeholder="https:\/\/ipfs\.fileship\.xyz\/"/);
  assert.match(commonSource, /let connectPromise = null/);
  assert.match(commonSource, /if \(connectPromise\) return connectPromise/);
  assert.match(dropSource, /let walletConnecting = false/);
  assert.match(dropSource, /let walletRestoring = true/);
  assert.match(dropSource, /function currentStageLiveLabel\(stage, activeIndex, totalStages\)/);
  assert.match(dropSource, /Mint is Live/);
  assert.match(dropSource, /Currently on Sale Stage \$\{position\} of \$\{total\}/);
  assert.match(dropSource, /currentStageLiveLabel\(stage, stageIndex >= 0 \? stageIndex : act, stages\.length\)/);
  assert.doesNotMatch(dropSource, /Stage \$\{act \+ 1\} live/);
  assert.match(dropSource, /function ownedMintsHeadingText\(count\)/);
  assert.match(dropSource, /Your \$\{countLabel\(n, "mint", "mints"\)\}/);
  assert.match(dropSource, /function mintShareText\(meta, id\)/);
  assert.match(dropSource, /I just minted \$\{tokenDisplayName\(meta, id\)\} from/);
  assert.match(dropSource, /https:\/\/x\.com\/intent\/post/);
  assert.match(dropSource, /https:\/\/bsky\.app\/intent\/compose/);
  assert.doesNotMatch(dropSource, /twitter\.com\/intent\/tweet/);
  assert.doesNotMatch(dropSource, /mint\(s\) currently held/);
  assert.doesNotMatch(dropSource, /Temple \/ Kukai \/ Umami/);
  assert.match(themeSource, /\.mint-share-row/);
  assert.match(themeSource, /\.mint-share/);
  assert.match(dropSource, /aria-busy/);
  assert.match(dropSource, /const busy = walletConnecting \|\| walletRestoring/);
  assert.match(dropSource, /connect\.disabled = busy \|\| connected/);
  assert.match(dropSource, /walletRestoring \? "Checking wallet\.\.\."/);
  assert.match(dropSource, /if \(walletRestoring \|\| walletConnecting \|\| MD\.getAccount\(\)\) return/);
  assert.match(dropSource, /Wallet session expired\. Connect again to mint\./);
  assert.match(dropHtml, /<main class="wrap narrow" id="main">/);
  assert.match(dropHtml, /role="progressbar"/);
  assert.match(dropHtml, /aria-live="polite"/);
  assert.match(dropHtml, /aria-label="Decrease mint quantity"/);
  assert.match(dropHtml, /id="recentMintsSection"/);
  assert.match(dropHtml, /Recent mints:/);
  assert.match(publishSource, /id="recentMintsSection"/);
  assert.match(dropSource, /fetchRecentMintTransfers\(CFG\.network \|\| "mainnet", CFG\.contract, RECENT_MINT_LIMIT\)/);
  assert.match(dropSource, /fetchWalletIdentities\(CFG\.network \|\| "mainnet", addresses\)/);
  assert.match(dropSource, /const previewUri = tokenPreviewUri\(meta\)/);
  assert.match(dropSource, /safeHttpUrl\(MD\.ipfsToHttp\(previewUri, CFG\.gateway \|\| MD\.DEFAULT_GATEWAY\)\)/);
  assert.match(commonSource, /async function fetchRecentMintTransfers\(networkKey, kt, limit\)/);
  assert.match(commonSource, /\/v1\/tokens\/transfers/);
  assert.match(commonSource, /url\.searchParams\.set\("token\.contract", kt\)/);
  assert.match(commonSource, /url\.searchParams\.set\("sort\.desc", "id"\)/);
  assert.match(commonSource, /\(!row\.from \|\| !row\.from\.address\)/);
  assert.match(commonSource, /async function fetchObjktIdentities\(addresses\)/);
  assert.match(commonSource, /https:\/\/data\.objkt\.com\/v3\/graphql/);
  assert.match(commonSource, /"Content-Type": "text\/plain"/);
  assert.match(commonSource, /async function fetchTzktIdentities\(networkKey, addresses\)/);
  assert.match(commonSource, /\/v1\/accounts\/\$\{address\}/);
  assert.match(commonSource, /async function fetchWalletIdentities\(networkKey, addresses\)/);
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
  assert.match(dropSource, /only \$\{max\} \$\{countWord\(max, "mint is", "mints are"\)\} currently available for this wallet/);
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
