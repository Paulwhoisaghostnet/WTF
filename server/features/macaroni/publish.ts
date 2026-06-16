const MACARONI_ASSET_PATH = "/creation-tools/macaroni";
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

export function sanitizeMacaroniConfigForPublish(
  input: Record<string, unknown>
): Record<string, unknown> {
  const theme = asRecord(input.theme);
  return {
    ...input,
    theme: {
      name: sanitizeThemeName(theme.name),
      accent: sanitizeCssColor(theme.accent),
      font: sanitizeFontStack(theme.font),
      customCss: "",
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
  const escapedTitle = escapeHtml(title);
  const configJson = safeScriptJson(config);

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapedTitle}</title>
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
    <div class="muted" id="allowStatus" role="status" aria-live="polite" style="margin-top:6px"></div>
    <div class="muted" id="walletLimitStatus" aria-live="polite"></div>
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
<script src="${assetBase}/js/common.js"></script>
<script src="${assetBase}/js/drop.js"></script>
</body>
</html>`;
}
