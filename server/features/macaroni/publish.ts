const MACARONI_ASSET_PATH = "/creation-tools/macaroni";

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
  const title = String(input.config.title || "Macaroni Drop");
  const escapedTitle = escapeHtml(title);
  const configJson = safeScriptJson(input.config);

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

<div class="topbar">
  <span class="brand" id="brand">Macaroni</span>
  <div class="row">
    <span class="net muted" id="netLabel"></span>
    <button class="btn small" id="btnConnect">Connect wallet</button>
    <button class="btn ghost small" id="btnDisconnect" style="display:none">Disconnect</button>
  </div>
</div>

<div class="hero">
  <img class="cover" id="cover" alt="" style="display:none" />
  <h1 id="title">...</h1>
  <p class="muted narrow" id="desc" style="margin:0 auto"></p>
</div>

<div class="wrap narrow">

  <section class="panel mint-box" id="mintPanel">
    <div class="progress" style="margin-bottom:14px"><div id="supplyBar"></div></div>
    <div class="muted" id="supplyText">loading collection...</div>
    <div class="mode-note" id="modeNote" style="display:none"></div>
    <hr class="sep" />
    <div id="stageInfo" class="muted"></div>
    <div class="price" id="price"></div>
    <div class="row" style="justify-content:center;margin:16px 0">
      <div class="qty">
        <button id="qtyMinus">-</button>
        <span id="qty">1</span>
        <button id="qtyPlus">+</button>
      </div>
      <button class="btn" id="btnMint" disabled>Mint</button>
    </div>
    <div class="muted" id="mintStatus"></div>
    <div class="muted" id="walletBalance"></div>
    <div class="muted" id="mintPreflight"></div>
    <div class="muted" id="allowStatus" style="margin-top:6px"></div>
    <div class="muted" id="walletLimitStatus"></div>
    <div id="revealPending" style="display:none">
      <hr class="sep" />
      <div class="muted" id="revealInfo"></div>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn ghost" id="btnReveal" style="display:none">Reveal now</button>
      </div>
      <div class="muted" id="revealOpStatus"></div>
    </div>
  </section>

  <section id="revealSection" style="display:none">
    <h2 style="text-align:center">Your mints</h2>
    <div class="reveal-grid" id="revealGrid"></div>
    <div class="muted" id="ownedMintStatus" style="text-align:center;margin-top:10px"></div>
  </section>

  <section class="panel">
    <h3>Sale schedule</h3>
    <div class="stages-list" id="stagesList"></div>
  </section>

  <div id="contentBlocks"></div>

  <footer class="credits">
    <span id="contractLink"></span><br/>
    Powered by <strong>Macaroni</strong> - open-source blind mints on Tezos - 0% platform fee
  </footer>
</div>

<script>window.DROP_CONFIG = ${configJson};</script>
<script src="${assetBase}/vendor/tezos.js"></script>
<script src="${assetBase}/js/common.js"></script>
<script src="${assetBase}/js/drop.js"></script>
</body>
</html>`;
}
