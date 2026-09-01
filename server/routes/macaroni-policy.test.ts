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
  assert.match(source, /MACARONI_INSTALLER_MACOS_SHA256/);
  assert.match(source, /MACARONI_INSTALLER_WINDOWS_URL/);
  assert.match(source, /MACARONI_INSTALLER_WINDOWS_SHA256/);
  assert.match(source, /MACARONI_INSTALLER_RASPBERRY_PI_URL/);
  assert.match(source, /MACARONI_INSTALLER_RASPBERRY_PI_SHA256/);
  assert.match(source, /fileName: "Macaroni-Studio\.exe"/);
  assert.doesNotMatch(source, /fileName: "Macaroni-Studio\.msi"/);
  assert.match(source, /safeInstallerUrl/);
  assert.match(source, /safeInstallerSha256/);
  assert.match(source, /sha256: sha256 \|\| null/);
  assert.match(source, /available: Boolean\(url && sha256\)/);
  assert.match(source, /url: url && sha256 \? url : null/);
  assert.match(source, /function isLoopbackInstallerHost\(hostname: string\): boolean/);
  assert.match(source, /url\.protocol === "https:"/);
  assert.match(source, /process\.env\.NODE_ENV !== "production" && url\.protocol === "http:" && isLoopbackInstallerHost\(url\.hostname\)/);
  assert.doesNotMatch(source, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
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
  const themeCss = readFileSync("public/creation-tools/macaroni/css/theme.css", "utf8");

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
  assert.match(studioSource, /wtfosAccessState = canUseWtfosPinning \? "granted" : "denied"/);
  assert.match(studioSource, /const confirmedRoleDenial = wtfosAccessState === "denied"/);
  assert.match(studioSource, /function setupWtfosRoleTooltip\(\)/);
  assert.match(studioSource, /gate\.addEventListener\("pointerenter"/);
  assert.match(studioSource, /event\.key !== "Escape"/);
  assert.match(studioSource, /document\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(studioSource, /gate\.setAttribute\("aria-disabled"/);
  assert.match(studioSource, /btn\.disabled = !accessGranted/);
  assert.doesNotMatch(studioSource, /btn\.hidden = !canUseWtfosPinning/);
  assert.match(studioSource, /Export the site package for your own host/);
  assert.match(studioSource, /\/api\/macaroni\/installers/);
  assert.match(studioSource, /function shortSha256\(value\)/);
  assert.match(studioSource, /SHA-256 checksums/);
  assert.match(studioSource, /MD\.apiFetch\("\/api\/macaroni\/publish"/);
  assert.equal(commonSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioHtml.includes('<option value="wtfos">'), false);
  assert.match(studioHtml, /id="publishWtfOSGate" hidden/);
  assert.match(studioHtml, /id="btnPublishWtfOS" disabled/);
  assert.match(studioHtml, /id="publishWtfOSRoleHelp"[\s\S]*aria-controls="publishWtfOSRoleTooltip"[\s\S]*aria-expanded="false"[\s\S]*hidden/);
  assert.match(studioHtml, /id="publishWtfOSRoleTooltip" role="tooltip" hidden/);
  assert.match(studioHtml, /Trusted Market Creator role to prevent abuse[\s\S]*Contact Admin app/);
  assert.match(themeCss, /\.publish-access-gate\[data-role-locked="true"\]\[data-tooltip-open="true"\] \.publish-access-tooltip/);
  assert.match(themeCss, /\.publish-access-tooltip::after/);
  assert.match(themeCss, /pointer-events: auto/);
  assert.match(themeCss, /\.btn:not\(:disabled\):hover/);
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

test("Macaroni social share presets include creator handles and token media URLs", () => {
  const routeSource = readFileSync("server/routes/macaroni.ts", "utf8");
  const publishSource = readFileSync("server/features/macaroni/publish.ts", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
  const dropHtml = readFileSync("public/creation-tools/macaroni/drop.html", "utf8");
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");

  assert.match(studioHtml, /id="shareTwitter"/);
  assert.match(studioHtml, /id="shareBsky"/);
  assert.match(studioHtml, /id="shareText"/);
  assert.match(studioHtml, /\{token\}[\s\S]*\{creator\}[\s\S]*\{collection\}[\s\S]*\{url\}[\s\S]*\{media\}/);
  assert.match(studioSource, /async function refreshCreatorSocialDefaults\(\)/);
  assert.match(studioSource, /MD\.apiFetch\("\/api\/profile\/social"\)/);
  assert.match(studioSource, /profile\.twitterPublic/);
  assert.match(studioSource, /profile\.atprotoHandle/);
  assert.match(studioSource, /shareTwitter/);
  assert.match(studioSource, /shareBsky/);
  assert.match(studioSource, /share:\s*\{\s*template: shareFieldText\(state\.page\.shareText\)/s);
  assert.match(studioSource, /social:\s*\{\s*twitter: sanitizeSocialHandle\(state\.page\.shareTwitter\),\s*bsky: sanitizeSocialHandle\(state\.page\.shareBsky\)/s);

  assert.match(routeSource, /atprotoAccounts/);
  assert.match(routeSource, /users/);
  assert.match(routeSource, /async function loadMacaroniCreatorSocial\(userId: number\)/);
  assert.match(routeSource, /twitterPublic/);
  assert.match(routeSource, /isNull\(atprotoAccounts\.disconnectedAt\)/);
  assert.match(routeSource, /function enrichMacaroniCreatorSocial/);
  assert.match(routeSource, /const publishedConfig = enrichMacaroniCreatorSocial\(config, creatorSocial\)/);
  assert.match(routeSource, /config: publishedConfig/);

  assert.match(publishSource, /function sanitizeSocialHandle/);
  assert.match(publishSource, /function sanitizeShareText/);
  assert.match(publishSource, /social:\s*\{\s*twitter: sanitizeSocialHandle\(social\.twitter \|\| social\.x\),\s*bsky: sanitizeSocialHandle\(social\.bsky \|\| social\.bluesky\)/s);
  assert.match(publishSource, /share:\s*\{\s*template: sanitizeShareText\(share\.template\)/s);
  assert.match(publishSource, /twitter:creator/);
  assert.match(publishSource, /twitter:image/);
  assert.match(publishSource, /id="dropSharePanel"/);

  assert.match(dropHtml, /id="dropSharePanel"/);
  assert.match(dropHtml, /id="dropShareX"/);
  assert.match(dropHtml, /id="dropShareBsky"/);

  assert.match(dropSource, /function creatorSocialHandle\(service\)/);
  assert.match(dropSource, /function creatorShareIdentity\(service, meta\)/);
  assert.match(dropSource, /function tokenShareMediaUrl\(meta\)/);
  assert.match(dropSource, /tokenArtifactUri\(meta\) \|\| tokenPreviewUri\(meta\)/);
  assert.match(dropSource, /function collectionCoverUrl\(\)/);
  assert.match(dropSource, /const X_POST_LIMIT = 280/);
  assert.match(dropSource, /const X_URL_WEIGHT = 23/);
  assert.match(dropSource, /function weightedXCharCount\(text\)/);
  assert.match(dropSource, /function trimForXPost\(text\)/);
  assert.match(dropSource, /function shareIntentUrl\(service, text\)/);
  assert.match(dropSource, /service === "x" \? trimForXPost\(text\) : compactShareText\(text\)/);
  assert.match(dropSource, /function shareTemplateFor\(service\)/);
  assert.match(dropSource, /function ensureShareMedia\(text, media\)/);
  assert.match(dropSource, /function mintShareText\(service, meta, id\)/);
  assert.match(dropSource, /function dropXShareText\(stage, statusText\)/);
  assert.match(dropSource, /if \(service === "x"\) return dropXShareText\(stage, statusText\)/);
  assert.match(dropSource, /function dropShareText\(service, stage, statusText\)/);
  assert.match(dropSource, /function updateDropShareLinks\(stage, statusText\)/);
  assert.match(dropSource, /macaroni\.drop_shared/);
  assert.match(dropSource, /data-macaroni-handle/);
  assert.match(dropSource, /creator: creatorShareIdentity\(service, meta\)/);
  assert.match(dropSource, /media,/);
  assert.match(dropSource, /mintShareText\(service, meta, id\)/);
  assert.match(dropSource, /Mint cost:/);
  assert.match(dropSource, /Wallet limit:/);
  assert.match(dropSource, /Access:/);
  assert.match(dropSource, /Mint page:/);
  assert.match(dropSource, /Cover image:/);
  assert.match(dropSource, /updateDropShareLinks\(stage, stageLabel\)/);
  assert.match(dropSource, /https:\/\/x\.com\/intent\/post/);
  assert.match(dropSource, /https:\/\/bsky\.app\/intent\/compose/);
  assert.doesNotMatch(dropSource, /api\.twitter\.com|api\.bsky\.app|com\.atproto\.repo\.createRecord/);
});

test("Macaroni generated sale stages have bounded X share text and calendar links", () => {
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");
  const themeSource = readFileSync("public/creation-tools/macaroni/css/theme.css", "utf8");

  assert.match(dropSource, /const X_POST_LIMIT = 280/);
  assert.match(dropSource, /function compactShareText\(text\)/);
  assert.match(dropSource, /function weightedXCharCount\(text\)/);
  assert.match(dropSource, /while \(body && weightedXCharCount\(`\$\{body\}\$\{marker\}\$\{suffix\}`\) > X_POST_LIMIT\)/);
  assert.match(dropSource, /function dropXShareText\(stage, statusText\)/);
  assert.match(dropSource, /max \$\{stage\.maxPerWallet\}\/wallet/);
  assert.match(dropSource, /function stageCalendarLinks\(stage\)/);
  assert.match(dropSource, /https:\/\/calendar\.google\.com\/calendar\/render/);
  assert.match(dropSource, /data:text\/calendar;charset=utf-8/);
  assert.match(dropSource, /BEGIN:VCALENDAR/);
  assert.match(dropSource, /Add to calendar/);
  assert.match(dropSource, /macaroni\.drop_calendar_added/);
  assert.match(dropSource, /new CustomEvent\("macaroni:interaction"/);
  assert.match(dropSource, /download="\$\{esc\(calendar\.filename\)\}"/);
  assert.match(dropSource, /stageCalendarDescription\(stage\)/);
  assert.match(dropSource, /Mint page: \$\{shareDropUrl\(\)\}/);
  assert.match(themeSource, /\.stage-row-actions/);
  assert.match(themeSource, /\.stage-calendar-row/);
  assert.match(themeSource, /\.stage-calendar/);
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
  assert.match(dropSource, /function operationRpcBase\(\)/);
  assert.match(dropSource, /function setOperationProgressStatus\(statusId, actionLabel, hash, suffix\)/);
  assert.match(dropSource, /wallet returned \$\{actionLabel\} hash/);
  assert.match(dropSource, /checking public nodes/);
  assert.match(dropSource, /not visible on public nodes yet/);
  assert.match(dropSource, /waiting for chain confirmation/);
  assert.match(dropSource, /async function confirmWalletOperation\(op, entrypoint, statusId, actionLabel\)/);
  assert.match(dropSource, /op\.confirmation\(1\)/);
  assert.match(dropSource, /\/v1\/operations\/transactions\/\$\{encodeURIComponent\(hash\)\}/);
  assert.match(dropSource, /\/chains\/main\/mempool\/pending_operations/);
  assert.match(dropSource, /seen in node mempool/);
  assert.match(dropSource, /operationTargetAddress\(row\) !== CFG\.contract/);
  assert.match(dropSource, /operationEntrypoint\(row\) !== entrypoint/);
  assert.match(dropSource, /row\?\.status === "applied"/);
  assert.match(dropSource, /row\.status && row\.status !== "applied"/);
  assert.match(dropSource, /\`\$\{actionLabel\} not confirmed\`/);
  assert.match(dropSource, /wallet returned operation \$\{shortHash\}, but it is not visible on public Tezos nodes/);
  assert.match(dropSource, /Check \$\{operationLink\(hash\)\} before retrying/);
  assert.doesNotMatch(dropSource, /confirmation\(1\);\s*return extractMintedIds\(op\)/);
});

test("Macaroni wallet operations align Beacon active account RPC before signing", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");

  assert.match(commonSource, /function accountNeedsNetworkSync\(acc\)/);
  assert.match(commonSource, /function syncActiveAccountNetwork\(acc, options\)/);
  assert.match(commonSource, /normalizedRpc\(current\.rpcUrl\) !== normalizedRpc\(expected\.rpcUrl\)/);
  assert.match(commonSource, /wallet\.client\.setActiveAccount\(updated\)/);
  assert.match(commonSource, /network: beaconNetworkSpec\(\)/);
  assert.match(commonSource, /ensureSessionNetwork\(\{ requireRpc: true \}\)/);
  assert.match(commonSource, /could not align wallet operation RPC/);
});

test("Macaroni drop wallet runtime prefers Octez Connect with Beacon backup", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");
  const octezWalletSource = readFileSync("public/creation-tools/macaroni/js/octez-wallet.js", "utf8");
  const octezVendorSource = readFileSync("public/creation-tools/macaroni/vendor/octez-connect.js", "utf8");
  const dropHtml = readFileSync("public/creation-tools/macaroni/drop.html", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
  const siteBundle = readFileSync("public/creation-tools/macaroni/js/site-bundle.js", "utf8");

  assert.match(commonSource, /\? \{ type: "custom", name: netKey, rpcUrl \}\s*: \{ type: net\.beaconNetwork \}/);
  assert.doesNotMatch(commonSource, /\{ type: net\.beaconNetwork,\s*rpcUrl \}/);
  assert.match(commonSource, /TZ\.installOctezPrimaryWallet/);
  assert.match(commonSource, /const WalletClass = TZ\.OctezPrimaryWallet \|\| TZ\.BeaconWallet/);

  assert.match(octezVendorSource, /MacaroniOctezConnect/);
  assert.match(octezVendorSource, /getDAppClientInstance/);
  assert.match(octezVendorSource, /beacon-node-1\.octez\.io/);
  assert.doesNotMatch(octezVendorSource, /eval\(/);

  assert.match(octezWalletSource, /function installOctezPrimaryWallet/);
  assert.match(octezWalletSource, /providerName = "octez\.connect"/);
  assert.match(octezWalletSource, /this\.beaconBackup = new NativeBeaconWallet/);
  assert.match(octezWalletSource, /this\.walletProvider = this\.octezProvider/);
  assert.match(octezWalletSource, /this\.walletProvider = this\.beaconBackup/);
  assert.match(octezWalletSource, /patchBeacon/);

  for (const html of [dropHtml, studioHtml]) {
    assert.match(html, /vendor\/octez-connect\.js/);
    assert.match(html, /js\/octez-wallet\.js/);
    assert.ok(html.indexOf("vendor/octez-connect.js") < html.indexOf("js/common.js"));
    assert.ok(html.indexOf("js/octez-wallet.js") < html.indexOf("js/common.js"));
  }
  assert.match(siteBundle, /"vendor\/octez-connect\.js"/);
  assert.match(siteBundle, /"js\/octez-wallet\.js"/);
});

test("Macaroni wallet operation fees track the padded gas limit that is actually sent", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");

  assert.match(commonSource, /TEZOS_MINIMAL_MUTEZ_PER_GAS_UNIT = 0\.1/);
  assert.match(commonSource, /DEFAULT_OPERATION_SIZE_BYTES = 1800/);
  assert.match(commonSource, /function feeFloorForGasLimit\(gasLimit, est, opts\)/);
  assert.match(commonSource, /gas \* TEZOS_MINIMAL_MUTEZ_PER_GAS_UNIT/);
  assert.match(commonSource, /feeFloorBuffer \|\| 1\.2/);
  assert.match(commonSource, /feeTipMutez \|\| 1_000/);
  assert.match(commonSource, /const paddedFeeFloor = feeFloorForGasLimit\(gasLimit, est, opts\)/);
  assert.match(commonSource, /fee = Math\.max\(estimateFee, paddedFeeFloor \|\| 0\)/);
  assert.match(commonSource, /fee = feeFloorForGasLimit\(gasLimit, null, opts\)/);
  assert.match(commonSource, /if \(limits\.fee != null\) sendOpts\.fee = limits\.fee/);
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
  assert.match(dropSource, /function walletTokensHeadingText\(count\)/);
  assert.match(dropSource, /Your \$\{countLabel\(n, "drop token", "drop tokens"\)\}/);
  assert.match(dropSource, /function walletTokenPresentation\(mintedIds, ownedIds\)/);
  assert.match(dropSource, /context\.set\(id, ownedSet\.has\(id\) \? "minted by you" : "minted by you · no longer held"\)/);
  assert.match(dropSource, /context\.set\(id, "owned · minted by another wallet"\)/);
  assert.match(dropSource, /Minted this stage: \$\{stats\.stageMinted\}\/\$\{stats\.stage\.maxPerWallet\}/);
  assert.match(dropSource, /Currently owned: \$\{stats\.ownedCount\}/);
  assert.match(dropSource, /function mintShareText\(service, meta, id\)/);
  assert.match(dropSource, /function dropShareText\(service, stage, statusText\)/);
  assert.match(dropSource, /function updateDropShareLinks\(stage, statusText\)/);
  assert.match(dropSource, /creator: creatorShareIdentity\(service, meta\)/);
  assert.match(dropSource, /tokenShareMediaUrl\(meta\)/);
  assert.match(dropSource, /https:\/\/x\.com\/intent\/post/);
  assert.match(dropSource, /https:\/\/bsky\.app\/intent\/compose/);
  assert.doesNotMatch(dropSource, /twitter\.com\/intent\/tweet/);
  assert.doesNotMatch(dropSource, /mint\(s\) currently held/);
  assert.doesNotMatch(dropSource, /Temple \/ Kukai \/ Umami/);
  assert.match(dropHtml, /Your drop tokens/);
  assert.match(dropHtml, /id="dropSharePanel"/);
  assert.match(publishSource, /Your drop tokens/);
  assert.match(publishSource, /id="dropSharePanel"/);
  assert.match(themeSource, /\.drop-share/);
  assert.match(themeSource, /\.mint-share-row/);
  assert.match(themeSource, /\.mint-share/);
  assert.match(themeSource, /\.mint-context/);
  assert.match(dropSource, /aria-busy/);
  assert.match(dropSource, /const busy = walletConnecting \|\| walletRestoring/);
  assert.match(dropSource, /connect\.disabled = busy \|\| connected/);
  assert.match(dropSource, /walletRestoring \? "Checking wallet\.\.\."/);
  assert.match(dropSource, /\.then\(async \(addr\) => \{\s*walletRestoring = false;\s*setWalletButtons/s);
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
  assert.match(dropSource, /function loadCustomRecentMintsCompat\(options\)/);
  assert.match(dropSource, /"airportersRecentGrid"/);
  assert.match(dropSource, /customRecentMintLimit\(grid\)/);
  assert.match(dropSource, /MD\.fetchRecentMintTransfers\(\s*CFG\.network \|\| "mainnet",\s*CFG\.contract,\s*customRecentMintLimit\(grid\)\s*\)/s);
  assert.match(dropSource, /button\.dataset\.tokenId = String\(id\)/);
  assert.match(dropSource, /setInterval\(\(\) => loadCustomRecentMintsCompat\(\{ force: true \}\), 30000\)/);
  assert.match(dropSource, /fetchWalletIdentities\(CFG\.network \|\| "mainnet", addresses\)/);
  assert.match(dropSource, /const previewUri = tokenPreviewUri\(meta\)/);
  assert.match(dropSource, /safeHttpUrl\(MD\.ipfsToHttp\(previewUri, CFG\.gateway \|\| MD\.DEFAULT_GATEWAY\)\)/);
  assert.match(commonSource, /async function fetchRecentMintTransfers\(networkKey, kt, limit\)/);
  assert.match(commonSource, /async function fetchMintedTokenIds\(networkKey, kt, holder\)/);
  assert.match(commonSource, /url\.searchParams\.set\("to", holder\)/);
  assert.match(commonSource, /url\.searchParams\.set\("from\.null", "true"\)/);
  assert.match(commonSource, /url\.searchParams\.set\("select", "token\.tokenId"\)/);
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

test("Macaroni Studio models V2 editions, minter royalties, and placeholder pools", () => {
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");
  const dropConfig = readFileSync("public/creation-tools/macaroni/drop.config.js", "utf8");
  const sampleCsv = readFileSync("public/creation-tools/macaroni/sample/tokens.csv", "utf8");
  const compileSource = readFileSync("scripts/macaroni/compile-v2-contract-template.mjs", "utf8");
  const compiledTemplate = JSON.parse(
    readFileSync("public/creation-tools/macaroni/contract/macaroni-v2.template.json", "utf8")
  );
  const compiledContract = JSON.parse(
    readFileSync("public/creation-tools/macaroni/contract/macaroni-v2.contract.json", "utf8")
  );

  assert.match(studioHtml, /id="contractVersion"/);
  assert.match(studioHtml, /value="macaroni-v1"/);
  assert.match(studioHtml, /value="macaroni-editions-v2"/);
  assert.match(studioHtml, /id="minterRoyaltiesEnabled"/);
  assert.match(studioHtml, /id="minterRoyaltyPct"/);
  assert.match(studioHtml, /id="minterRoyaltyMode"/);
  assert.match(studioHtml, /id="royaltyUpdaterAddr"/);
  assert.match(studioHtml, /id="royaltyUpdateEndpoint"/);
  assert.match(studioHtml, /id="placeholderFiles"[^>]*multiple/);

  assert.match(studioSource, /const MACARONI_CONTRACT_VERSIONS = new Set\(\["macaroni-v1", "macaroni-editions-v2", "macaroni-commitment-v3"\]\)/);
  assert.match(studioSource, /const MACARONI_V2_ARTIFACT = "contract\/macaroni-v2\.contract\.json"/);
  assert.match(studioSource, /function normalizeTokenQuantity\(value\)/);
  assert.match(studioSource, /function normalizeOptionalHttpUrl\(value\)/);
  assert.match(studioSource, /function normalizeContractVersion\(value\)/);
  assert.match(studioSource, /function dropRequiresMacaroniV2\(\)/);
  assert.match(studioSource, /function assertSelectedContractSupportsDraft\(\)/);
  assert.match(studioSource, /function royaltyPolicyMetadata\(\)/);
  assert.match(studioSource, /function buildPlaceholderMetadata\(source, index, poolSize\)/);
  assert.match(studioSource, /tokenSummary:\s*\{\s*tokenCount: state\.tokens\.length,\s*editionCount: tokenEditionTotal\(\)/s);
  assert.match(studioSource, /placeholderPool:\s*pool/);
  assert.match(studioSource, /minterRoyalties:\s*\{/);
  assert.match(studioSource, /updateStrategy: minterRoyaltiesEnabled\(\) \? "drop_page_or_creator_triggered" : "none"/);
  assert.match(studioSource, /storage = \{[\s\S]*token_supply: new M\(\)[\s\S]*token_minted: new M\(\)[\s\S]*placeholder_pool: placeholderPoolMap[\s\S]*minter_royalty_config:/);
  assert.match(studioSource, /const ep = contractIsV3 \? "replace_tokens_v3" : contractIsV2 \? "replace_tokens_v2" : "replace_tokens"/);
  assert.match(studioSource, /const ep = contractIsV3 \? "add_tokens_v3" : contractIsV2 \? "add_tokens_v2" : "add_tokens"/);
  assert.match(studioSource, /quantity: normalizeTokenQuantity\(t\.quantity\)/);

  assert.match(dropSource, /function minterRoyaltyConfig\(\)/);
  assert.match(dropSource, /async function tokenIsSealed\(tokenId\)/);
  assert.match(dropSource, /storage\.token_placeholder\.get\(String\(tokenId\)\)/);
  assert.match(dropSource, /function maybeSyncMinterRoyalties\(ids\)/);
  assert.match(dropSource, /await maybeSyncMinterRoyalties\(ids\)/);
  assert.match(dropSource, /storage\.reveal_tail != null && storage\.reveal_cursor != null/);
  assert.match(dropSource, /royalty metadata sync is pending until the creator or configured updater pushes the revised metadata/);

  assert.match(dropConfig, /contractVersion: "macaroni-v1"/);
  assert.match(dropConfig, /placeholderPool: \[\]/);
  assert.match(dropConfig, /minterRoyalties:\s*\{/);
  assert.match(dropConfig, /updateEndpoint: ""/);
  assert.match(sampleCsv, /^id,quantity,name,description,tags/m);
  assert.match(compileSource, /scenarioName = "deploy_macaroni_blind_mint_v2_template"/);
  assert.match(compileSource, /macaroni-v2\.contract\.json/);
  assert.match(compileSource, /macaroni-v2\.template\.json/);
  assert.equal(compiledTemplate.templateVersion, "macaroni-editions-v2");
  assert.ok(compiledTemplate.entrypoints.includes("add_tokens_v2"));
  assert.ok(compiledTemplate.entrypoints.includes("replace_tokens_v2"));
  assert.ok(compiledTemplate.entrypoints.includes("update_minter_royalty_metadata"));
  assert.ok(compiledTemplate.entrypoints.includes("lock_minter_royalties"));
  assert.ok(Array.isArray(compiledContract));
  assert.ok(compiledContract.length > 0);
});

test("Macaroni V2 SmartPy source exposes edition and royalty entrypoints", () => {
  const source = readFileSync("contracts/wtf-collections/MacaroniBlindMintFA2V2.py", "utf8");

  assert.match(source, /@sp\.module/);
  assert.match(source, /LedgerKeyType: type = sp\.record\(owner=sp\.address, token_id=sp\.nat\)/);
  assert.match(source, /TokenBatchItemType: type = sp\.record\(token_id=sp\.nat, token_info=sp\.map\[sp\.string, sp\.bytes\], quantity=sp\.nat\)/);
  assert.match(source, /self\.data\.token_supply = sp\.cast\(sp\.big_map\(\), sp\.big_map\[sp\.nat, sp\.nat\]\)/);
  assert.match(source, /self\.data\.token_minted = sp\.cast\(sp\.big_map\(\), sp\.big_map\[sp\.nat, sp\.nat\]\)/);
  assert.match(source, /self\.data\.placeholder_pool = sp\.cast\(placeholder_pool, sp\.big_map\[sp\.nat, TokenMetadataType\]\)/);
  assert.match(source, /self\.data\.minter_royalty_config = sp\.cast\(minter_royalty_config, RoyaltyConfigType\)/);
  assert.match(source, /def add_tokens_v2\(self, tokens\):/);
  assert.match(source, /def replace_tokens_v2\(self, tokens\):/);
  assert.match(source, /for slot_index in sp\.range\(0, token\.quantity\):/);
  assert.match(source, /self\.data\.slots\[self\.data\.supply\] = token\.token_id/);
  assert.match(source, /placeholder_index = sp\.mod\(/);
  assert.match(source, /def update_minter_royalty_metadata\(self, params\):/);
  assert.match(source, /def lock_minter_royalties\(self, token_id\):/);
  assert.match(source, /assert cfg\.mode == 0 or sold_out or sp\.sender == self\.data\.administrator, "ROYALTY_POOL_OPEN"/);
  assert.match(source, /def deploy_macaroni_blind_mint_v2_template\(\):/);
});

test("Macaroni V3 seals final metadata behind nonce-backed commitments", () => {
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
  const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
  const dropSource = readFileSync("public/creation-tools/macaroni/js/drop.js", "utf8");
  const contractSource = readFileSync("contracts/wtf-collections/MacaroniBlindMintFA2V3.py", "utf8");
  const compileSource = readFileSync("scripts/macaroni/compile-v3-contract-template.mjs", "utf8");
  const revealServiceSource = readFileSync("server/features/macaroni/reveal-automation.ts", "utf8");
  const revealAuthSource = readFileSync("server/features/macaroni/reveal-auth.ts", "utf8");
  const routeSource = readFileSync("server/routes/macaroni.ts", "utf8");
  const schemaSource = readFileSync("shared/schema-macaroni.ts", "utf8");
  const appSource = readFileSync("server/app.ts", "utf8");
  const compiledTemplate = JSON.parse(
    readFileSync("public/creation-tools/macaroni/contract/macaroni-v3.template.json", "utf8")
  );
  const compiledContract = JSON.parse(
    readFileSync("public/creation-tools/macaroni/contract/macaroni-v3.contract.json", "utf8")
  );

  assert.match(studioHtml, /value="macaroni-commitment-v3"/);
  assert.match(studioSource, /const MACARONI_V3_ARTIFACT = "contract\/macaroni-v3\.contract\.json"/);
  assert.match(studioSource, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(studioSource, /crypto\.subtle\.digest\("SHA-256", payload\)/);
  assert.match(studioSource, /metadata_commitment: t\.metadataCommitment/);
  assert.match(studioSource, /profile\.usesV3[\s\S]*id: t\.id - 1,[\s\S]*displayId: t\.id,[\s\S]*quantity: normalizeTokenQuantity\(t\.quantity\),[\s\S]*:\s*\{[\s\S]*metadata: t\.metadataCid/s);
  assert.match(studioSource, /token_commitments: new M\(\), revealed_tokens: new M\(\), inventory_finalized: false/);
  assert.doesNotMatch(studioSource, /usesV3 && state\.drop\.revealMode !== "delayed"/);
  assert.match(studioSource, /delayed_reveal: delayed/);
  assert.match(studioSource, /reveal_operator: revealOperator/);
  assert.match(studioSource, /registerAutomaticV3Reveal\(kt\)/);
  assert.match(studioSource, /in sync · inventory sealed · automatic reveal active/);
  assert.match(studioSource, /methodsObject\.finalize_inventory\(\)/);
  assert.match(studioSource, /does not claim provably random selection/);
  assert.match(dropSource, /does not claim provably random selection/);
  assert.match(studioSource, /serviceUrl: profile\.usesV3 \? automaticRevealRequestUrl\(\) : ""/);
  assert.match(dropSource, /async function requestAutomaticV3Reveal\(\)/);
  assert.match(dropSource, /await requestAutomaticV3Reveal\(\)/);
  assert.match(studioSource, /const localCommitment = await metadataCommitment\(token\.metadataCid, token\.metadataNonce\)/);
  assert.match(studioSource, /if \(localCommitment !== committed\)/);
  assert.match(studioSource, /c\.methodsObject\.reveal_tokens_v3\(chunk\)/);
  assert.match(dropSource, /function isCommitmentV3\(\)/);
  assert.match(dropSource, /if \(isCommitmentV3\(\)\) return;/);

  assert.match(contractSource, /self\.data\.token_commitments = sp\.cast\(sp\.big_map\(\), sp\.big_map\[sp\.nat, sp\.bytes\]\)/);
  assert.match(contractSource, /def add_tokens_v3\(self, tokens\):/);
  assert.match(contractSource, /def finalize_inventory\(self\):/);
  assert.match(contractSource, /assert not self\.data\.inventory_finalized, "INVENTORY_FINALIZED"/);
  assert.match(contractSource, /assert self\.data\.inventory_finalized, "INVENTORY_NOT_FINALIZED"/);
  assert.match(contractSource, /allocation_index = sp\.as_nat\(remaining - 1\)/);
  assert.doesNotMatch(contractSource, /draw = sp\.mod\(sp\.level/);
  assert.match(contractSource, /def reveal_tokens_v3\(self, items\):/);
  assert.match(contractSource, /self\.data\.reveal_operator = sp\.cast\(reveal_operator, sp\.address\)/);
  assert.match(contractSource, /def _only_admin_or_reveal_operator\(self\):/);
  assert.match(contractSource, /sp\.sender == self\.data\.reveal_operator/);
  assert.match(contractSource, /if self\.data\.delayed_reveal:/);
  assert.doesNotMatch(contractSource, /self\.data\.delayed_reveal and sp\.sender != self\.data\.administrator/);
  assert.match(contractSource, /_sender=admin,[\s\S]*_now=sp\.timestamp\(69\),[\s\S]*_exception="TOO_EARLY"/);
  assert.match(contractSource, /"TOO_EARLY"/);
  assert.match(contractSource, /assert self\.data\.token_minted\.get\(item\.token_id, default=sp\.nat\(0\)\) > 0, "TOKEN_NOT_MINTED"/);
  assert.match(contractSource, /"TOKEN_NOT_SOLD_OUT"/);
  assert.match(contractSource, /commitment = sp\.sha256\(sp\.concat\(\[item\.metadata_uri, item\.nonce\]\)\)/);
  assert.match(contractSource, /assert commitment == self\.data\.token_commitments\[item\.token_id\], "BAD_REVEAL"/);
  assert.doesNotMatch(contractSource, /pending_tokens/);

  assert.match(routeSource, /router\.get\("\/api\/macaroni\/reveal-operator"/);
  assert.match(routeSource, /router\.post\("\/api\/macaroni\/reveal-automation\/challenge"/);
  assert.match(routeSource, /await verifyMacaroniRevealRegistrationProof\(registration, proof\)/);
  assert.match(routeSource, /"\/api\/macaroni\/reveal-automation",\s*async \(req, res\)/s);
  assert.match(routeSource, /router\.post\("\/api\/macaroni\/reveal-request"/);
  assert.match(studioSource, /MACARONI_REVEAL_SERVICE_ORIGIN = IS_NATIVE_APP \? "https:\/\/wtfos\.app" : ""/);
  assert.match(studioSource, /credentials: "omit"/);
  assert.match(studioSource, /await MD\.signMessage\(challenge\.message\)/);
  assert.match(studioSource, /This does not send a transaction or charge tez/);
  assert.match(studioSource, /one free signature proving control of the contract/);
  assert.match(studioSource, /proof:\s*\{[\s\S]*nonce: challenge\.nonce,[\s\S]*publicKey: signed\.publicKey,[\s\S]*signature: signed\.signature/s);
  assert.match(revealAuthSource, /MACARONI_REVEAL_REGISTRATION_VERSION/);
  assert.match(revealAuthSource, /verifyPublicKeyOwnership/);
  assert.match(revealAuthSource, /consumeWalletAuthNonce/);
  assert.match(revealAuthSource, /verifyWalletSignature/);
  assert.match(revealServiceSource, /MACARONI_REVEAL_OPERATOR_MAINNET_SECRET_KEY/);
  assert.match(revealServiceSource, /MACARONI_REVEAL_OPERATOR_SHADOWNET_SECRET_KEY/);
  assert.match(revealServiceSource, /MACARONI_REVEAL_ENCRYPTION_KEY/);
  assert.match(revealServiceSource, /createCipheriv\("aes-256-gcm"/);
  assert.match(revealServiceSource, /V3 reveal manifest must contain every token id exactly once/);
  assert.match(revealServiceSource, /Number\(storage\.token_count\) !== tokens\.length/);
  assert.match(revealServiceSource, /V3 token inventory must be permanently finalized/);
  assert.match(revealServiceSource, /minted <= 0 \|\| minted !== supply/);
  assert.match(revealServiceSource, /contract\.methodsObject\.reveal_tokens_v3\(batch\)\.send\(\)/);
  assert.match(revealServiceSource, /export async function requestMacaroniReveal/);
  assert.match(schemaSource, /export const macaroniRevealJobs = pgTable/);
  assert.match(appSource, /function shouldAllowMacaroniRevealOrigin/);
  assert.match(appSource, /path === "\/api\/macaroni\/reveal-request"/);
  assert.match(appSource, /"127\.0\.0\.1", "localhost", "::1"/);
  assert.match(appSource, /callback\(null, \{ origin: true, credentials: false \}\)/);

  assert.match(compileSource, /scenarioName = "deploy_macaroni_blind_mint_v3_template"/);
  assert.equal(compiledTemplate.templateVersion, "macaroni-commitment-v3");
  assert.ok(compiledTemplate.entrypoints.includes("add_tokens_v3"));
  assert.ok(compiledTemplate.entrypoints.includes("replace_tokens_v3"));
  assert.ok(compiledTemplate.entrypoints.includes("finalize_inventory"));
  assert.ok(compiledTemplate.entrypoints.includes("reveal_tokens_v3"));
  assert.ok(Array.isArray(compiledContract));
  assert.ok(compiledContract.length > 0);
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
  const octezWalletSource = readFileSync("public/creation-tools/macaroni/js/octez-wallet.js", "utf8");
  const vendorSource = readFileSync("public/creation-tools/macaroni/vendor/tezos.js", "utf8");
  const frameSource = readFileSync("client/src/features/creation-tools/CreationToolFrame.tsx", "utf8");

  assert.match(commonSource, /shadownet:\s*{\s*label:\s*"Shadownet \(test\)"/s);
  assert.match(commonSource, /rpc:\s*"https:\/\/tezos-shadownet\.octez\.io\/"/);
  assert.match(commonSource, /rpcFallbacks:\s*\["https:\/\/tcinfra\.net\/rpc\/tezos\/shadownet"\]/);
  assert.match(commonSource, /rpcFallbacks:\s*\["https:\/\/tcinfra\.net\/rpc\/tezos\/mainnet"\]/);
  assert.match(commonSource, /beaconNetwork:\s*"shadownet"/);
  assert.match(commonSource, /shadownet:\s*"NetXsqzbfFenSTS"/);
  assert.match(commonSource, /await assertRpcChainId\(true\)/);
  assert.match(commonSource, /withRpcReadFallback\(\(\) => getToolkit\(\)\.rpc\.getChainId\(\)\)/);
  assert.match(commonSource, /DEFAULT_RPC_READ_TIMEOUT_MS = 5_000/);
  assert.match(commonSource, /withRpcFallback\(\(\) => withRpcReadDeadline\(fn, timeoutMs\)\)/);
  assert.match(commonSource, /withRpcReadFallback\(\(\) => getToolkit\(\)\.tz\.getBalance\(target\)\)/);
  assert.match(commonSource, /pack_data/);
  assert.match(commonSource, /preferredNetwork:\s*beaconPreferredNetwork\(\)/);
  assert.match(commonSource, /enableMetrics:\s*false/);
  assert.match(commonSource, /function configureWalletClient\(w\)/);
  assert.match(commonSource, /const resetClient = !\(options && options\.resetClient === false\)/);
  assert.match(commonSource, /const subscribedWalletClients = new WeakSet\(\)/);
  assert.match(commonSource, /ACTIVE_ACCOUNT_SET/);
  assert.match(commonSource, /subscribeToEvent\(activeAccountEventName\(\), updateActiveAccountFromEvent\)/);
  assert.match(commonSource, /function ensureWallet\(appName, options\)/);
  assert.match(commonSource, /if \(!wallet\) wallet = makeWallet\(appName, options\)/);
  assert.match(commonSource, /function disableBeaconMetrics\(client\)/);
  assert.match(commonSource, /client\.sendMetrics = \(\) => \{\}/);
  assert.match(commonSource, /featuredWallets:\s*\["kukai",\s*"temple",\s*"umami"\]/);
  assert.match(commonSource, /async function resetBeaconPickerState\(\)/);
  assert.match(commonSource, /await resetBeaconPickerState\(\)/);
  assert.match(commonSource, /wallet\.client\.setActivePeer\(undefined\)/);
  assert.match(commonSource, /clearBeaconStorage\(\{\s*preserveIdentity:\s*true\s*\}\);\s*activeAccount = null/s);
  assert.doesNotMatch(commonSource, /clearBeaconStorage\(\{\s*preserveIdentity:\s*true\s*\}\);\s*wallet = null/s);
  assert.doesNotMatch(commonSource, /wallet = null;\s*return doConnect\(\)/);
  assert.doesNotMatch(commonSource, /dropWallet/);
  assert.match(commonSource, /sdk-secret-seed/);
  assert.match(commonSource, /matrix-selected-node/);
  assert.match(commonSource, /clearBeaconStorage\(\{\s*preserveIdentity:\s*true\s*\}\)/);
  assert.match(commonSource, /readWalletSession/);
  assert.match(commonSource, /acc\.address !== stored\.address/);
  assert.match(commonSource, /async function disconnectWallet\(\)/);
  assert.match(dropSource, /btnDisconnect/);
  assert.match(dropSource, /refreshBalance\("checked before mint"\)/);
  assert.match(dropSource, /fetchOwnedTokenIds/);
  assert.match(dropSource, /fetchMintedTokenIds/);
  assert.match(dropSource, /stage\.maxPerWallet/);
  assert.match(dropSource, /function storageNatToNumber\(value\)/);
  assert.match(dropSource, /function maxPerWalletFromStage\(stage\)/);
  assert.match(dropSource, /value\.prim === "Some"/);
  assert.match(dropSource, /maxPerWallet:\s*maxPerWalletFromStage\(v\)/);
  assert.match(dropSource, /MD\.withRpcFallback/);
  assert.match(dropSource, /throwOnRecoverableRpcError:\s*true/);
  assert.match(octezWalletSource, /configure\(options\)/);
  assert.match(octezWalletSource, /subscribeToEvent\(eventName, handler\)/);
  assert.match(vendorSource, /PsUshuai9/);
  assert.match(vendorSource, /25\.0\.0/);
  assert.doesNotMatch(vendorSource, /version:[`"']24\.3\.0/);
  assert.match(vendorSource, /matrixNodes:t/);
  assert.match(vendorSource, /beacon-node-1\.octez\.io/);
  assert.match(vendorSource, /shadownet:"https:\/\/shadownet\.kukai\.app"/);
  assert.match(frameSource, /allow-popups-to-escape-sandbox/);
  assert.equal(commonSource.includes("shadownet rotates"), false);
});
