const MACARONI_ASSET_PATH = "/creation-tools/macaroni";
const DEFAULT_IPFS_GATEWAY = "https://ipfs.fileship.xyz/";
const ALLOWED_THEME_NAMES = new Set(["dark", "gallery", "paper", "neon"]);
const ALLOWED_FONT_STACKS = new Set([
  "",
  "Georgia, 'Times New Roman', serif",
  "'Courier New', monospace",
  "Futura, 'Trebuchet MS', sans-serif",
]);
const SAFE_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeThemeName(value: unknown): string {
  const theme = String(value || "").trim();
  return ALLOWED_THEME_NAMES.has(theme) ? theme : "dark";
}

function sanitizeCssColor(value: unknown): string {
  const color = String(value || "").trim();
  return SAFE_HEX_COLOR.test(color) ? color : "";
}

function sanitizeFontStack(value: unknown): string {
  const font = String(value || "").trim();
  return ALLOWED_FONT_STACKS.has(font) ? font : "";
}

function sanitizeSocialHandle(value: unknown): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/@?/i, "")
    .replace(/^https?:\/\/(?:www\.)?bsky\.app\/profile\/@?/i, "")
    .replace(/^@+/, "")
    .split(/[?#\s]/)[0]
    .replace(/\/+$/, "");
  return cleaned.replace(/[^a-z0-9._-]/gi, "").slice(0, 120);
}

function sanitizeShareText(value: unknown): string {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, 600).trim();
}

function publicMediaUrl(value: unknown, gateway: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const gw = String(gateway || DEFAULT_IPFS_GATEWAY).replace(/\/+$/, "") + "/";
  if (raw.startsWith("ipfs://")) return `${gw}${raw.slice("ipfs://".length).replace(/^\/+/, "")}`;
  return "";
}

export function sanitizeMacaroniConfigForPublish(
  input: Record<string, unknown>
): Record<string, unknown> {
  const theme = asRecord(input.theme);
  const social = asRecord(input.social);
  const share = asRecord(input.share);
  return {
    ...input,
    theme: {
      name: sanitizeThemeName(theme.name),
      accent: sanitizeCssColor(theme.accent),
      font: sanitizeFontStack(theme.font),
      customCss: "",
    },
    social: {
      twitter: sanitizeSocialHandle(social.twitter || social.x),
      bsky: sanitizeSocialHandle(social.bsky || social.bluesky),
    },
    share: {
      template: sanitizeShareText(share.template),
      xText: sanitizeShareText(share.xText || share.twitterText),
      bskyText: sanitizeShareText(share.bskyText || share.blueskyText),
    },
  };
}

export function macaroniStaticAssetBase(publicOrigin: string): string {
  return `${String(publicOrigin || "").replace(/\/+$/, "")}${MACARONI_ASSET_PATH}`;
}

export function slugForDropTitle(title: unknown): string {
  const base = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "macaroni-drop";
}

export function buildMacaroniPublishedHtml(input: {
  config: Record<string, unknown>;
  publicOrigin: string;
}): string {
  const assetBase = macaroniStaticAssetBase(input.publicOrigin);
  const config = sanitizeMacaroniConfigForPublish(input.config);
  const title = String(config.title || "Macaroni Drop");
  const description = String(config.description || "").trim().slice(0, 300);
  const coverUrl = publicMediaUrl(config.cover, config.gateway);
  const social = asRecord(config.social);
  const twitterCreator = sanitizeSocialHandle(social.twitter);
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const escapedCoverUrl = escapeHtml(coverUrl);
  const configJson = safeScriptJson(config);
  const socialMeta = [
    `<meta property="og:title" content="${escapedTitle}" />`,
    description ? `<meta property="og:description" content="${escapedDescription}" />` : "",
    coverUrl ? `<meta property="og:image" content="${escapedCoverUrl}" />` : "",
    `<meta name="twitter:card" content="${coverUrl ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapedTitle}" />`,
    description ? `<meta name="twitter:description" content="${escapedDescription}" />` : "",
    coverUrl ? `<meta name="twitter:image" content="${escapedCoverUrl}" />` : "",
    twitterCreator ? `<meta name="twitter:creator" content="@${escapeHtml(twitterCreator)}" />` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapedTitle}</title>
${socialMeta}
<link rel="stylesheet" href="${assetBase}/css/theme.css" />
<style id="customCss"></style>
</head>
<body>

<header class="topbar">
  <span class="brand" id="brand">Macaroni</span>
  <div class="row">
    <span class="net muted" id="netLabel"></span>
    <button class="btn small" id="btnConnect" type="button" aria-label="Connect wallet">Connect wallet</button>
    <button class="btn ghost small" id="btnDisconnect" type="button" style="display:none">Disconnect</button>
  </div>
</header>

<section class="hero" aria-labelledby="title">
  <img class="cover" id="cover" alt="" style="display:none" />
  <h1 id="title">...</h1>
  <p class="muted narrow" id="desc" style="margin:0 auto"></p>
</section>

<main class="wrap narrow" id="main">

  <section class="panel mint-box" id="mintPanel" aria-labelledby="mintHeading">
    <h2 class="sr-only" id="mintHeading">Mint this drop</h2>
    <div class="progress" id="supplyProgress" role="progressbar" aria-label="Minted supply" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" style="margin-bottom:14px"><div id="supplyBar"></div></div>
    <div class="muted" id="supplyText" aria-live="polite">loading collection...</div>
    <div class="mode-note" id="modeNote" aria-live="polite" style="display:none"></div>
    <hr class="sep" />
    <div id="stageInfo" class="muted" role="status" aria-live="polite"></div>
    <div class="price" id="price"></div>
    <div class="row" style="justify-content:center;margin:16px 0">
      <div class="qty">
        <button id="qtyMinus" type="button" aria-label="Decrease mint quantity">-</button>
        <span id="qty" aria-label="Mint quantity" aria-live="polite">1</span>
        <button id="qtyPlus" type="button" aria-label="Increase mint quantity">+</button>
      </div>
      <button class="btn" id="btnMint" type="button" disabled>Mint</button>
    </div>
    <div class="muted" id="mintStatus" role="status" aria-live="polite"></div>
    <div class="muted" id="walletBalance" role="status" aria-live="polite"></div>
    <div class="muted" id="mintPreflight" aria-live="polite"></div>
    <div class="muted" id="royaltyStatus" role="status" aria-live="polite"></div>
    <div class="muted" id="allowStatus" role="status" aria-live="polite" style="margin-top:6px"></div>
    <div class="muted" id="walletLimitStatus" aria-live="polite"></div>
    <div class="drop-share" id="dropSharePanel" aria-label="Share this blind mint">
      <span class="muted">Share this blind mint</span>
      <div class="mint-share-row">
        <a class="mint-share" id="dropShareX" target="_blank" rel="noopener" href="#">X</a>
        <a class="mint-share" id="dropShareBsky" target="_blank" rel="noopener" href="#">Bluesky</a>
      </div>
    </div>
    <div id="revealPending" style="display:none">
      <hr class="sep" />
      <div class="muted" id="revealInfo" aria-live="polite"></div>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn ghost" id="btnReveal" type="button" style="display:none">Reveal now</button>
      </div>
      <div class="muted" id="revealOpStatus" role="status" aria-live="polite"></div>
    </div>
  </section>

  <section id="revealSection" aria-labelledby="ownedMintsHeading" style="display:none">
    <h2 id="ownedMintsHeading" style="text-align:center">Your drop tokens</h2>
    <div class="reveal-grid" id="revealGrid"></div>
    <div class="muted" id="ownedMintStatus" role="status" aria-live="polite" style="text-align:center;margin-top:10px"></div>
  </section>

  <section class="panel recent-mints" id="recentMintsSection" aria-labelledby="recentMintsHeading">
    <div class="spread">
      <h2 id="recentMintsHeading">Recent mints:</h2>
      <span class="muted" id="recentMintsStatus" role="status" aria-live="polite"></span>
    </div>
    <div class="recent-mints-list" id="recentMintsList"></div>
  </section>

  <section class="panel" aria-labelledby="saleScheduleHeading">
    <h2 id="saleScheduleHeading">Sale schedule</h2>
    <div class="stages-list" id="stagesList"></div>
  </section>

  <div id="contentBlocks"></div>

  <footer class="credits">
    <span id="contractLink"></span><br/>
    Powered by <strong>Macaroni</strong> - open-source blind mints on Tezos - 0% platform fee
  </footer>
</main>

<script>window.DROP_CONFIG = ${configJson};</script>
<script src="${assetBase}/vendor/tezos.js"></script>
<script src="${assetBase}/vendor/octez-connect.js"></script>
<script src="${assetBase}/js/octez-wallet.js"></script>
<script src="${assetBase}/js/common.js"></script>
<script src="${assetBase}/js/drop.js"></script>
</body>
</html>`;
}
