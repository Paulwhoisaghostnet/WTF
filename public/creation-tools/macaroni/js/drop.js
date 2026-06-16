/* Macaroni — public mint page. Reads drop.config.js (or studio preview),
   shows live contract state, mints, and reveals the randomly assigned tokens. */

"use strict";

const $ = (id) => document.getElementById(id);

function insertAfter(anchorId, html) {
  if ($(html.match(/id="([^"]+)"/)?.[1] || "")) return;
  const anchor = $(anchorId);
  if (!anchor) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  anchor.insertAdjacentElement("afterend", wrap.firstElementChild);
}

function ensureMintSiteEnhancements() {
  if (!$("btnDisconnect") && $("btnConnect")) {
    const btn = document.createElement("button");
    btn.className = "btn ghost small";
    btn.id = "btnDisconnect";
    btn.type = "button";
    btn.style.display = "none";
    btn.textContent = "Disconnect";
    $("btnConnect").insertAdjacentElement("afterend", btn);
  }
  insertAfter("mintStatus", '<div class="muted" id="walletBalance" role="status" aria-live="polite"></div>');
  insertAfter("walletBalance", '<div class="muted" id="mintPreflight" aria-live="polite"></div>');
  insertAfter("allowStatus", '<div class="muted" id="walletLimitStatus" aria-live="polite"></div>');
  insertAfter("revealGrid", '<div class="muted" id="ownedMintStatus" role="status" aria-live="polite" style="text-align:center;margin-top:10px"></div>');
  insertAfter(
    "revealSection",
    '<section class="panel recent-mints" id="recentMintsSection" aria-labelledby="recentMintsHeading">' +
      '<div class="spread"><h2 id="recentMintsHeading">Recent mints:</h2>' +
      '<span class="muted" id="recentMintsStatus" role="status" aria-live="polite"></span></div>' +
      '<div class="recent-mints-list" id="recentMintsList"></div>' +
    '</section>'
  );
}

ensureMintSiteEnhancements();

function setAttrs(el, attrs) {
  if (!el) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) el.removeAttribute(key);
    else el.setAttribute(key, String(value));
  }
}

function ensureDropAccessibility() {
  const topbar = document.querySelector(".topbar");
  if (topbar && topbar.tagName !== "HEADER") topbar.setAttribute("role", "banner");
  const main = document.querySelector("main") || document.querySelector(".wrap.narrow");
  if (main) {
    if (!main.id) main.id = "main";
    if (main.tagName !== "MAIN") main.setAttribute("role", "main");
  }
  setAttrs(document.querySelector(".hero"), { "aria-labelledby": "title" });
  const mintPanel = $("mintPanel");
  if (mintPanel) {
    setAttrs(mintPanel, { "aria-labelledby": "mintHeading" });
    if (!$("mintHeading")) {
      const heading = document.createElement("h2");
      heading.id = "mintHeading";
      heading.className = "sr-only";
      heading.textContent = "Mint this drop";
      mintPanel.prepend(heading);
    }
  }
  const progress = $("supplyProgress") || $("supplyBar")?.parentElement;
  if (progress) {
    if (!progress.id) progress.id = "supplyProgress";
    setAttrs(progress, {
      role: "progressbar",
      "aria-label": "Minted supply",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": progress.getAttribute("aria-valuenow") || "0",
    });
  }
  const statusIds = [
    "stageInfo",
    "mintStatus",
    "walletBalance",
    "allowStatus",
    "ownedMintStatus",
    "revealOpStatus",
    "recentMintsStatus",
  ];
  statusIds.forEach((id) => setAttrs($(id), { role: "status", "aria-live": "polite" }));
  ["supplyText", "modeNote", "mintPreflight", "walletLimitStatus", "revealInfo"].forEach((id) =>
    setAttrs($(id), { "aria-live": "polite" })
  );
  const buttonAttrs = {
    btnConnect: { type: "button", "aria-label": "Connect wallet" },
    btnDisconnect: { type: "button" },
    qtyMinus: { type: "button", "aria-label": "Decrease mint quantity" },
    qtyPlus: { type: "button", "aria-label": "Increase mint quantity" },
    btnMint: { type: "button" },
    btnReveal: { type: "button" },
  };
  for (const [id, attrs] of Object.entries(buttonAttrs)) {
    const button = $(id);
    if (!button) continue;
    if (attrs.type) button.type = attrs.type;
    setAttrs(button, attrs);
  }
  setAttrs($("qty"), { "aria-label": "Mint quantity", "aria-live": "polite" });
}

ensureDropAccessibility();

// ---------- config ----------
let CFG = window.DROP_CONFIG || null;
if (new URLSearchParams(location.search).get("preview")) {
  try {
    const draft = localStorage.getItem("macaroni.preview");
    if (draft) CFG = JSON.parse(draft);
  } catch (e) { /* fall back to file config */ }
}
if (!CFG) {
  document.body.innerHTML =
    '<div class="wrap narrow"><div class="panel"><h2>No drop configured</h2>' +
    "<p>Export <code>drop.config.js</code> from the Studio and place it in this folder.</p>" +
    '<p><a class="btn" href="studio.html">Open Studio</a></p></div></div>';
  throw new Error("missing drop.config.js");
}

const ALLOWED_THEME_NAMES = new Set(["dark", "gallery", "paper", "neon"]);
const ALLOWED_FONT_STACKS = new Set([
  "",
  "Georgia, 'Times New Roman', serif",
  "'Courier New', monospace",
  "Futura, 'Trebuchet MS', sans-serif",
]);
const SAFE_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function sanitizeThemeName(value) {
  const theme = String(value || "").trim();
  return ALLOWED_THEME_NAMES.has(theme) ? theme : "dark";
}

function sanitizeCssColor(value) {
  const color = String(value || "").trim();
  return SAFE_HEX_COLOR.test(color) ? color : "";
}

function sanitizeFontStack(value) {
  const font = String(value || "").trim();
  return ALLOWED_FONT_STACKS.has(font) ? font : "";
}

// ---------- theming ----------
const root = document.documentElement;
const theme = CFG.theme && typeof CFG.theme === "object" ? CFG.theme : {};
root.dataset.theme = sanitizeThemeName(theme.name);
const accent = sanitizeCssColor(theme.accent);
if (accent) root.style.setProperty("--accent", accent);
const font = sanitizeFontStack(theme.font);
if (font) {
  root.style.setProperty("--font-body", font);
  root.style.setProperty("--font-display", font);
}
$("customCss").textContent = "";

// ---------- static content ----------
document.title = CFG.title || "Macaroni";
$("brand").textContent = "⬤ " + (CFG.title || "Macaroni");
$("title").textContent = CFG.title || "";
$("desc").textContent = CFG.description || "";
$("netLabel").textContent = CFG.network;
if (CFG.cover) {
  const img = $("cover");
  img.src = MD.ipfsToHttp(CFG.cover, CFG.gateway);
  img.alt = `${CFG.title || "Drop"} cover image`;
  img.style.display = "";
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function safeHttpUrl(raw) {
  try {
    const url = new URL(String(raw || ""), location.href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

function setCardStatus(card, text) {
  const cap = document.createElement("div");
  cap.className = "cap";
  cap.textContent = text;
  card.replaceChildren(cap);
}

function tokenPrimaryMime(meta) {
  if (!meta || typeof meta !== "object") return "";
  const direct = String(meta.mimeType || meta.mime_type || "").toLowerCase();
  if (direct) return direct;
  const formats = Array.isArray(meta.formats) ? meta.formats : [];
  return String(formats[0]?.mimeType || formats[0]?.mime_type || "").toLowerCase();
}

function tokenArtifactUri(meta) {
  if (!meta || typeof meta !== "object") return "";
  return meta.artifactUri || (Array.isArray(meta.formats) && meta.formats[0] && meta.formats[0].uri) || "";
}

function tokenLooksVideo(meta) {
  const mime = tokenPrimaryMime(meta);
  if (mime.startsWith("video/")) return true;
  const formats = Array.isArray(meta?.formats) ? meta.formats : [];
  return formats.some((format) => String(format?.mimeType || format?.mime_type || "").toLowerCase().startsWith("video/"));
}

function tokenLooksGif(meta) {
  const mime = tokenPrimaryMime(meta);
  if (mime === "image/gif") return true;
  const formats = Array.isArray(meta?.formats) ? meta.formats : [];
  return formats.some((format) => String(format?.mimeType || format?.mime_type || "").toLowerCase() === "image/gif");
}

function renderMediaPreview(parent, meta, label) {
  const previewUri = tokenPreviewUri(meta);
  const url = safeHttpUrl(MD.ipfsToHttp(previewUri, CFG.gateway || MD.DEFAULT_GATEWAY));
  if (!url) return false;
  const artifactUri = tokenArtifactUri(meta);
  if (tokenLooksVideo(meta) && sameIpfsUri(previewUri, artifactUri)) {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;
    video.preload = "metadata";
    video.setAttribute("aria-label", label);
    parent.appendChild(video);
    return true;
  }
  const img = document.createElement("img");
  img.src = url;
  img.alt = label;
  img.loading = "lazy";
  parent.appendChild(img);
  return true;
}

function renderTokenCard(card, meta, id, sealed) {
  const cap = document.createElement("div");
  cap.className = "cap";
  cap.textContent = `${meta.name || "#" + (id + 1)}${sealed ? " · sealed" : ""}`;
  const media = document.createElement("div");
  media.className = "token-media";
  if (!renderMediaPreview(media, meta, `${meta.name || "Token #" + (id + 1)} artwork`)) {
    card.replaceChildren(cap);
    return;
  }
  card.replaceChildren(...media.childNodes, cap);
}

function tokenPreviewUri(meta) {
  if (!meta || typeof meta !== "object") return CFG.cover || "";
  const artifact = tokenArtifactUri(meta);
  const preferred = meta.thumbnailUri || meta.displayUri || "";
  if ((tokenLooksGif(meta) || tokenLooksVideo(meta)) && (!preferred || sameIpfsUri(preferred, CFG.cover))) {
    return artifact || preferred || CFG.cover || "";
  }
  return (
    meta.thumbnailUri ||
    meta.displayUri ||
    meta.artifactUri ||
    (Array.isArray(meta.formats) && meta.formats[0] && meta.formats[0].uri) ||
    CFG.cover ||
    ""
  );
}

function normalizeIpfsRef(uri) {
  return String(uri || "")
    .trim()
    .replace(/^ipfs:\/\//i, "")
    .replace(/^https?:\/\/[^/]+\/ipfs\//i, "")
    .replace(/\/+$/, "");
}

function sameIpfsUri(a, b) {
  const left = normalizeIpfsRef(a);
  const right = normalizeIpfsRef(b);
  return !!left && !!right && left === right;
}

function metadataLooksPending(meta, sealed) {
  if (sealed) return false;
  if (!meta || typeof meta !== "object") return true;
  const name = String(meta.name || "");
  const preview = tokenPreviewUri(meta);
  if (/sealed|unrevealed|pending/i.test(name) && sameIpfsUri(preview, CFG.cover)) return true;
  if (!meta.artifactUri && !meta.displayUri && !meta.thumbnailUri) return true;
  return false;
}

async function fetchTokenMetadataFromStorage(tokenId) {
  if (!storage || !storage.token_metadata) return null;
  try {
    const tm = await storage.token_metadata.get(String(tokenId));
    const hex = tm && tm.token_info && typeof tm.token_info.get === "function"
      ? tm.token_info.get("")
      : tm?.token_info?.[""];
    if (!hex) return null;
    const uri = MD.hexToUtf8(hex);
    const metaUrl = safeHttpUrl(MD.ipfsToHttp(uri, CFG.gateway || MD.DEFAULT_GATEWAY));
    if (!metaUrl) return null;
    const res = await fetch(metaUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function hydrateRecentMintTransfer(transfer) {
  const tokenId = Number(transfer.tokenId);
  const sealed = !!storage?.delayed_reveal && tokenId >= Number(storage.revealed || 0);
  const chainMeta = await fetchTokenMetadataFromStorage(tokenId);
  const metadata = chainMeta || transfer.token?.metadata || {};
  return {
    ...transfer,
    sealed,
    metadataPending: metadataLooksPending(metadata, sealed),
    token: {
      ...(transfer.token || {}),
      metadata,
    },
  };
}

async function hydrateRecentMints(transfers) {
  if (!transfers.length || !storage) return transfers;
  return Promise.all(transfers.map((transfer) => hydrateRecentMintTransfer(transfer)));
}

function tokenNumber(tokenId) {
  const id = Number(tokenId);
  return Number.isInteger(id) && id >= 0 ? id + 1 : tokenId;
}

function formatMintTime(value) {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function setRecentMintsMessage(message) {
  const list = $("recentMintsList");
  if (list) list.replaceChildren();
  setText("recentMintsStatus", message);
}

function identityProfileUrl(identity) {
  if (!identity?.address) return "";
  return CFG.network === "mainnet" && identity.source === "objkt"
    ? `https://objkt.com/profile/${identity.address}`
    : MD.explorerUrl(CFG.network || "mainnet", identity.address);
}

function renderRecentMints(transfers, identities) {
  const list = $("recentMintsList");
  if (!list) return;
  list.replaceChildren();
  if (!transfers.length) {
    setText("recentMintsStatus", "No recent mints yet.");
    return;
  }
  setText("recentMintsStatus", `${transfers.length} recent mint${transfers.length === 1 ? "" : "s"}`);
  for (const transfer of transfers) {
    const meta = transfer.token?.metadata || {};
    const identity = identities.get(transfer.minter) || {
      address: transfer.minter,
      label: transfer.minterAlias || MD.short(transfer.minter),
      source: transfer.minterAlias ? "tzkt" : "address",
    };
    const item = document.createElement("article");
    item.className = "recent-mint";

    const media = document.createElement("a");
    media.className = "recent-mint-media";
    media.href = MD.explorerUrl(CFG.network || "mainnet", CFG.contract);
    media.target = "_blank";
    media.rel = "noopener";
    if (!renderMediaPreview(media, meta, `${meta.name || "Token #" + tokenNumber(transfer.tokenId)} preview`)) {
      const placeholder = document.createElement("span");
      placeholder.textContent = "#" + tokenNumber(transfer.tokenId);
      media.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "recent-mint-body";
    const title = document.createElement("strong");
    title.textContent =
      (meta.name || `Token #${tokenNumber(transfer.tokenId)}`) +
      (transfer.sealed ? " · sealed" : transfer.metadataPending ? " · updating" : "");
    const line = document.createElement("div");
    line.className = "muted";
    line.append("minted by ");
    const profile = document.createElement("a");
    profile.href = identityProfileUrl(identity);
    profile.target = "_blank";
    profile.rel = "noopener";
    profile.title = `${identity.address}${identity.source !== "address" ? ` via ${identity.source}` : ""}`;
    profile.textContent = identity.label;
    line.appendChild(profile);
    const time = document.createElement("div");
    time.className = "recent-mint-time muted";
    time.textContent = formatMintTime(transfer.timestamp);
    body.append(title, line, time);
    item.append(media, body);
    list.appendChild(item);
  }
}

async function loadRecentMints(options) {
  if (!$("recentMintsList")) return;
  if (!CFG.contract) {
    recentMintsKey = "";
    setRecentMintsMessage("Recent mint activity appears after deployment.");
    return;
  }
  const minted = storage ? Number(storage.minted) : "";
  const revealed = storage ? Number(storage.revealed || 0) : "";
  const delayed = storage ? Number(!!storage.delayed_reveal) : "";
  const key = `${CFG.network || "mainnet"}:${CFG.contract}:${minted}:${revealed}:${delayed}`;
  if (!options?.force && key === recentMintsKey) return;
  recentMintsKey = key;
  const seq = ++recentMintsLoadSeq;
  setText("recentMintsStatus", "Loading recent mints...");
  try {
    const fetched = await MD.fetchRecentMintTransfers(CFG.network || "mainnet", CFG.contract, RECENT_MINT_LIMIT);
    const transfers = await hydrateRecentMints(fetched);
    if (seq !== recentMintsLoadSeq) return;
    const addresses = transfers.map((mint) => mint.minter).filter(Boolean);
    const identities = await MD.fetchWalletIdentities(CFG.network || "mainnet", addresses);
    if (seq !== recentMintsLoadSeq) return;
    renderRecentMints(transfers, identities);
    if (recentMintsRetryTimer) clearTimeout(recentMintsRetryTimer);
    const needsRetry = transfers.some((transfer) => transfer.metadataPending || transfer.sealed);
    if (needsRetry) {
      recentMintsRetryTimer = setTimeout(() => {
        recentMintsKey = "";
        loadRecentMints({ force: true });
      }, 12000);
    }
  } catch (e) {
    if (seq !== recentMintsLoadSeq) return;
    setRecentMintsMessage("Could not load recent mints: " + (e.message || e));
  }
}
$("contentBlocks").innerHTML = (CFG.blocks || [])
  .map((b) => {
    if (b.type === "h") return `<h2>${esc(b.value)}</h2>`;
    if (b.type === "img")
      return `<p style="text-align:center"><img src="${esc(MD.ipfsToHttp(b.value, CFG.gateway))}" alt="Drop content image" loading="lazy" style="max-width:100%;border-radius:var(--radius)" /></p>`;
    return `<p>${esc(b.value)}</p>`;
  })
  .join("");
if (CFG.contract)
  $("contractLink").innerHTML =
    `contract <a class="mono" target="_blank" rel="noopener" href="${MD.explorerUrl(CFG.network, CFG.contract)}">${CFG.contract}</a>`;

// ---------- chain state ----------
MD.setupToolkit(CFG.network || "mainnet", CFG.rpc);
let storage = null;
let stages = []; // [{id, start:Date, priceMutez, useAllowlist, maxPerWallet}]
let qty = 1;
let sessionIds = []; // token ids minted in this browser session
let lastRevealed = -1;
let walletBalanceMutez = null;
let currentStageWalletRemaining = null;
let walletStatusSeq = 0;
let walletStatusCache = { key: "", status: null };
let walletStatusLoadingKey = "";
let ownedMintLoadSeq = 0;
let recentMintsLoadSeq = 0;
let recentMintsKey = "";
let recentMintsRetryTimer = null;
let walletConnecting = false;
let walletRestoring = true;
const MINT_QTY_UI_CAP = 10;
const RECENT_MINT_LIMIT = 8;

function revealState() {
  if (!storage) return null;
  return {
    delayed: !!storage.delayed_reveal,
    pending: Number(storage.minted) - Number(storage.revealed),
    since: storage.unrevealed_since ? new Date(storage.unrevealed_since) : null,
    delayMs: Number(storage.reveal_delay) * 1000,
  };
}

function activeStageId(now) {
  let act = -1;
  for (const s of stages) if (s.start <= now) act = Math.max(act, s.id);
  return act;
}

function activeStage(now) {
  const id = activeStageId(now || new Date());
  return stages.find((s) => s.id === id) || null;
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text || "";
}

function setWalletButtons(connected) {
  const connect = $("btnConnect");
  if (connect) {
    const account = MD.getAccount();
    const busy = walletConnecting || walletRestoring;
    connect.textContent = walletRestoring ? "Checking wallet..." : walletConnecting ? "Connecting wallet..." : connected ? MD.short(account) : "Connect wallet";
    connect.disabled = busy || connected;
    connect.setAttribute("aria-busy", busy ? "true" : "false");
    connect.setAttribute(
      "aria-label",
      walletRestoring ? "Checking wallet session" : walletConnecting ? "Connecting wallet" : connected ? `Connected wallet ${account}` : "Connect wallet"
    );
  }
  if ($("btnDisconnect")) $("btnDisconnect").style.display = connected ? "" : "none";
}

async function refreshBalance(label) {
  const me = MD.getAccount();
  if (!me) {
    walletBalanceMutez = null;
    setText("walletBalance", "Connect a wallet to check balance.");
    return null;
  }
  try {
    walletBalanceMutez = await MD.getBalanceMutez(me);
    setText("walletBalance", `Wallet balance: ${MD.fmtTez(walletBalanceMutez)}${label ? ` · ${label}` : ""}`);
    return walletBalanceMutez;
  } catch (e) {
    walletBalanceMutez = null;
    setText("walletBalance", "Could not refresh wallet balance: " + (e.message || e));
    return null;
  }
}

function walletStatusKey(stage) {
  return [
    CFG.contract || "",
    MD.getAccount() || "",
    stage?.id ?? "",
    stage?.maxPerWallet ?? "",
    stage?.useAllowlist ? "allow" : "open",
    storage ? Number(storage.supply) : "",
    storage ? Number(storage.minted) : "",
  ].join(":");
}

function stageNeedsWalletAllowance(stage) {
  return !!stage && (!!stage.maxPerWallet || !!stage.useAllowlist);
}

function collectionRemaining() {
  if (!storage) return null;
  const supply = Number(storage.supply);
  const minted = Number(storage.minted);
  if (!Number.isFinite(supply) || !Number.isFinite(minted)) return null;
  return Math.max(0, supply - minted);
}

function freshWalletStatus(stage) {
  if (!stage) return null;
  return walletStatusCache.key === walletStatusKey(stage) ? walletStatusCache.status : null;
}

function walletAllowancePending(stage) {
  return !!MD.getAccount() && stageNeedsWalletAllowance(stage) && !freshWalletStatus(stage);
}

function effectiveQtyMax(stage) {
  const limits = [MINT_QTY_UI_CAP];
  const left = collectionRemaining();
  if (left != null) limits.push(left);
  if (stage?.maxPerWallet) limits.push(stage.maxPerWallet);
  const status = freshWalletStatus(stage);
  if (status?.remaining != null) {
    limits.push(status.remaining);
  } else if (walletAllowancePending(stage)) {
    limits.push(1);
  }
  const max = Math.min(...limits.filter((n) => Number.isFinite(Number(n))).map(Number));
  return Number.isFinite(max) ? Math.max(0, Math.floor(max)) : MINT_QTY_UI_CAP;
}

function disableMintControls() {
  if ($("btnMint")) $("btnMint").disabled = true;
  if ($("qtyPlus")) $("qtyPlus").disabled = true;
  if ($("qtyMinus")) $("qtyMinus").disabled = qty <= 1;
}

function syncMintQuantityUi(stage) {
  const max = effectiveQtyMax(stage);
  if (max > 0 && qty > max) qty = max;
  if (qty < 1) qty = 1;
  if ($("qty")) $("qty").textContent = qty;
  if ($("price")) $("price").textContent = stage ? MD.fmtTez(stage.priceMutez * qty) : "";

  const pending = walletAllowancePending(stage);
  const canMint = !!MD.getAccount() && !!stage && max > 0 && qty <= max && !pending;
  if ($("btnMint")) $("btnMint").disabled = !canMint;
  if ($("qtyPlus")) $("qtyPlus").disabled = pending || max <= 0 || qty >= max;
  if ($("qtyMinus")) $("qtyMinus").disabled = qty <= 1 || max <= 0;
  return { max, pending };
}

function applyWalletStageStatus(status) {
  currentStageWalletRemaining = status.remaining;
  setText("walletLimitStatus", status.limitText);
  setText("allowStatus", status.allowText);
  syncMintQuantityUi(status.stage);
}

async function readStageWalletMinted(stage) {
  if (!storage || !stage || !MD.getAccount() || !storage.stage_minted) return null;
  try {
    const minted = await storage.stage_minted.get({ stage: stage.id, holder: MD.getAccount() });
    return minted == null ? 0 : Number(minted);
  } catch (_) {
    return 0;
  }
}

async function updateWalletStatus(stage, options) {
  const me = MD.getAccount();
  if (!me) {
    currentStageWalletRemaining = null;
    walletStatusLoadingKey = "";
    setText("allowStatus", "connect a wallet to mint");
    setText("walletLimitStatus", stage?.maxPerWallet ? `Max ${stage.maxPerWallet} mint(s) per wallet.` : "");
    syncMintQuantityUi(stage);
    return;
  }
  const key = walletStatusKey(stage);
  if (!options?.force && walletStatusCache.key === key && walletStatusCache.status) {
    applyWalletStageStatus(walletStatusCache.status);
    return;
  }
  if (!options?.force && walletStatusLoadingKey === key) {
    syncMintQuantityUi(stage);
    return;
  }
  const seq = ++walletStatusSeq;
  walletStatusLoadingKey = key;
  currentStageWalletRemaining = null;
  if (stageNeedsWalletAllowance(stage)) setText("walletLimitStatus", "Checking this wallet's mint allowance...");
  syncMintQuantityUi(stage);

  const status = { stage, allowText: "", limitText: "", remaining: null };
  const remainingCaps = [];
  const minted = stageNeedsWalletAllowance(stage) ? await readStageWalletMinted(stage) : null;
  if (stage?.useAllowlist) {
    try {
      const cap = await storage.allowlist.get({ stage: stage.id, holder: me });
      const capNumber = cap == null ? 0 : Number(cap);
      const used = minted == null ? 0 : minted;
      const allowRemaining = Math.max(0, capNumber - used);
      if (capNumber > 0) {
        remainingCaps.push(allowRemaining);
        status.allowText = allowRemaining > 0
          ? `you are allowlisted — ${allowRemaining}/${capNumber} mint(s) remaining for this stage`
          : `you used this stage's allowlist allowance (${capNumber}/${capNumber})`;
      } else {
        remainingCaps.push(0);
        status.allowText = "this wallet is not on the allowlist for this stage";
      }
    } catch (_) {
      remainingCaps.push(0);
      status.allowText = "this wallet is not on the allowlist for this stage";
    }
  }
  if (stage?.maxPerWallet) {
    const remaining = minted == null ? null : Math.max(0, stage.maxPerWallet - minted);
    if (remaining != null) remainingCaps.push(remaining);
    status.limitText = remaining == null
      ? `Max ${stage.maxPerWallet} mint(s) per wallet.`
      : `This wallet minted ${minted}/${stage.maxPerWallet} for this stage · ${remaining} remaining.`;
  }
  status.remaining = remainingCaps.length ? Math.min(...remainingCaps) : null;
  if (seq !== walletStatusSeq) return;
  walletStatusLoadingKey = "";
  walletStatusCache = { key, status };
  applyWalletStageStatus(status);
}

async function preflightMint(stage, amount) {
  if (!stage) throw new Error("no active sale stage is available");
  await MD.assertOperationSafety();
  await refresh();
  const freshStage = activeStage(new Date());
  if (!freshStage || freshStage.id !== stage.id) {
    throw new Error("sale stage changed while preparing mint — review the current stage and try again");
  }
  stage = freshStage;
  await refreshBalance("checked before mint");
  await updateWalletStatus(stage, { force: true });
  const max = effectiveQtyMax(stage);
  if (max <= 0) {
    throw new Error("no mints are currently available for this wallet");
  }
  if (amount > max) {
    qty = max;
    syncMintQuantityUi(stage);
    throw new Error(`only ${max} mint(s) are currently available for this wallet`);
  }
  const tezos = MD.getToolkit();
  const c = await tezos.wallet.at(CFG.contract);
  const total = stage.priceMutez * amount;
  const estimate = await MD.estimateWalletOp(
    c.methodsObject.mint(amount),
    { amount: total, mutez: true },
    { gasPerUnit: 480_000, units: amount }
  );
  const required = total + (estimate.fee || 0) + (estimate.storageFeeMutez || 0);
  const estimateText =
    `Mint cost: ${MD.fmtTez(total)}` +
    (estimate.fee != null ? ` · fee est. ${MD.fmtTez(estimate.fee)}` : " · fee estimate unavailable") +
    ` · storage cap ${MD.fmtTez(estimate.storageFeeMutez || 0)}`;
  setText("mintPreflight", estimateText);
  if (walletBalanceMutez != null && walletBalanceMutez < required) {
    throw new Error(`wallet balance ${MD.fmtTez(walletBalanceMutez)} is below estimated total ${MD.fmtTez(required)}`);
  }
  return { c, stage };
}

async function loadOwnedMints() {
  const me = MD.getAccount();
  if (!me || !CFG.contract) {
    setText("ownedMintStatus", "");
    return;
  }
  const seq = ++ownedMintLoadSeq;
  setText("ownedMintStatus", "Checking this wallet's mints...");
  if (!storage) await refresh();
  if (!storage || seq !== ownedMintLoadSeq) return;
  try {
    const ids = await MD.fetchOwnedTokenIds(CFG.network || "mainnet", CFG.contract, me);
    if (seq !== ownedMintLoadSeq) return;
    if (!ids.length) {
      setText("ownedMintStatus", "No mints found for this wallet yet.");
      return;
    }
    sessionIds = [...new Set([...sessionIds, ...ids])];
    $("revealSection").style.display = "";
    setText("ownedMintStatus", `${ids.length} mint(s) currently held by this wallet.`);
    await reveal(ids);
  } catch (e) {
    setText("ownedMintStatus", "Could not load wallet mints: " + (e.message || e));
  }
}

async function refresh() {
  if (!CFG.contract) {
    $("supplyText").textContent = "drop not deployed yet — check back soon";
    $("stagesList").innerHTML = '<div class="muted">no stages configured</div>';
    loadRecentMints();
    return;
  }
  try {
    const tezos = MD.getToolkit();
    const c = await tezos.contract.at(CFG.contract);
    storage = await c.storage();
    stages = [];
    const sm = storage.stages;
    const push = (k, v) =>
      stages.push({
        id: Number(k),
        start: new Date(v.start),
        priceMutez: Number(v.price),
        useAllowlist: !!v.use_allowlist,
        maxPerWallet: v.max_per_wallet != null ? Number(v.max_per_wallet) : null,
      });
    if (sm && typeof sm.forEach === "function") sm.forEach((v, k) => push(k, v));
    stages.sort((a, b) => a.id - b.id);
    render();
    loadRecentMints();
    // flip this session's cards when a reveal lands while the page is open
    const revealedNow = Number(storage.revealed);
    if (revealedNow !== lastRevealed && sessionIds.length) reveal(sessionIds);
    lastRevealed = revealedNow;
  } catch (e) {
    $("supplyText").textContent = "could not load contract: " + (e.message || e);
  }
}

function render() {
  if (!storage) return;
  const supply = Number(storage.supply);
  const minted = Number(storage.minted);
  const left = supply - minted;
  const rs = revealState();
  const mintedPct = supply ? Math.round((minted / supply) * 100) : 0;
  $("supplyBar").style.width = mintedPct + "%";
  const progress = $("supplyProgress") || $("supplyBar")?.parentElement;
  if (progress) {
    progress.setAttribute("aria-valuenow", String(mintedPct));
    progress.setAttribute("aria-valuetext", `${minted} of ${supply} minted`);
  }
  $("supplyText").textContent =
    `${minted} / ${supply} minted · ${left} remaining` +
    (rs && rs.delayed && rs.pending > 0 ? ` · ${rs.pending} sealed` : "");

  // Collectors should know the reveal mechanics BEFORE they mint.
  const note = $("modeNote");
  if (rs && rs.delayed) {
    note.style.display = "";
    const days = Math.round((rs.delayMs / 86400000) * 10) / 10;
    note.textContent =
      "Sealed drop — every mint starts sealed and is assigned a random artwork at reveal." +
      (days > 0
        ? ` If the creator hasn't revealed within ${days} day(s), anyone can trigger the reveal right here.`
        : " Anyone can trigger the reveal at any time.");
  } else {
    note.style.display = "none";
  }

  const now = new Date();
  const act = activeStageId(now);

  // schedule list
  $("stagesList").innerHTML = stages
    .map((s) => {
      const isActive = s.id === act;
      const when = s.start.toLocaleString();
      const tags =
        (s.useAllowlist ? '<span class="pill warn">allowlist</span> ' : "") +
        (s.maxPerWallet ? `<span class="pill">max ${s.maxPerWallet}/wallet</span>` : "");
      return `<div class="stage-row ${isActive ? "active" : ""}">
        <div><strong>Stage ${s.id + 1}</strong> · ${when}</div>
        <div>${tags} <strong>${MD.fmtTez(s.priceMutez)}</strong></div>
      </div>`;
    })
    .join("") || '<div class="muted">no stages configured</div>';

  renderRevealPanel(now);

  // mint box
  if (storage.paused) {
    $("stageInfo").textContent = "Minting is paused by the creator.";
    $("price").textContent = "";
    disableMintControls();
    return;
  }
  if (left <= 0 && supply > 0) {
    $("stageInfo").textContent = "Sold out — thank you!";
    $("price").textContent = "";
    disableMintControls();
    return;
  }
  if (act < 0) {
    const next = stages.find((s) => s.start > now);
    if (next) {
      const dt = next.start - now;
      const d = Math.floor(dt / 86400000),
        h = Math.floor((dt % 86400000) / 3600000),
        m = Math.floor((dt % 3600000) / 60000),
        s = Math.floor((dt % 60000) / 1000);
      $("stageInfo").textContent = `Starts in ${d ? d + "d " : ""}${h}h ${m}m ${s}s`;
    } else {
      $("stageInfo").textContent = "Sale not scheduled yet.";
    }
    $("price").textContent = "";
    disableMintControls();
    return;
  }
  const stage = stages.find((s) => s.id === act);
  $("stageInfo").textContent =
    `Stage ${act + 1} live` +
    (stage.useAllowlist ? " · allowlist only" : "") +
    (stage.maxPerWallet ? ` · max ${stage.maxPerWallet}/wallet` : "");
  syncMintQuantityUi(stage);
  updateWalletStatus(stage);
}

// Delayed-reveal status: countdown to the public window, then a permissionless
// "Reveal now" crank — this is the auto-reveal fallback in action.
function renderRevealPanel(now) {
  const rs = revealState();
  const panel = $("revealPending");
  if (!rs || !rs.delayed || rs.pending <= 0) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";
  const openAt = rs.since ? new Date(rs.since.getTime() + rs.delayMs) : null;
  const open = openAt && now >= openAt;
  if (open) {
    $("revealInfo").innerHTML =
      `<span class="countdown">${rs.pending}</span> sealed mint(s) — ` +
      "the auto-reveal window is open: <strong>anyone</strong> can trigger the reveal.";
  } else if (openAt) {
    // render() runs every second, so this ticks like the stage countdown.
    const dt = openAt - now;
    const d = Math.floor(dt / 86400000),
      h = Math.floor((dt % 86400000) / 3600000),
      m = Math.floor((dt % 3600000) / 60000),
      s = Math.floor((dt % 60000) / 1000);
    $("revealInfo").innerHTML =
      `${rs.pending} sealed mint(s) awaiting reveal — public auto-reveal opens in ` +
      `<span class="countdown">${d ? d + "d " : ""}${h}h ${m}m ${s}s</span>` +
      " · the creator can reveal sooner.";
  } else {
    $("revealInfo").textContent = `${rs.pending} sealed mint(s) awaiting reveal.`;
  }
  $("btnReveal").style.display = open ? "" : "none";
  $("btnReveal").disabled = !MD.getAccount();
}

async function publicReveal() {
  const rs = revealState();
  if (!rs || rs.pending <= 0) return;
  const btn = $("btnReveal");
  btn.disabled = true;
  $("revealOpStatus").textContent = "verifying network…";
  try {
    await MD.assertOperationSafety();
    $("revealOpStatus").textContent = "waiting for wallet…";
    const tezos = MD.getToolkit();
    const c = await tezos.wallet.at(CFG.contract);
    const op = await MD.sendWalletOp(
      c.methodsObject.reveal(Math.min(50, rs.pending)),
      {},
      { gasPerUnit: 420_000, units: Math.min(50, rs.pending) }
    );
    $("revealOpStatus").textContent = "revealing… waiting for confirmation";
    await op.confirmation(1);
    $("revealOpStatus").textContent = "revealed ✓";
    await refresh();
    if (sessionIds.length) await reveal(sessionIds); // refresh this session's cards
  } catch (e) {
    const msg = e?.data?.[0]?.with?.string || e.message || String(e);
    $("revealOpStatus").textContent = "reveal failed: " + msg;
  } finally {
    btn.disabled = false;
  }
}

// ---------- mint ----------
async function mintOnce(c, priceMutez) {
  const op = await MD.sendWalletOp(
    c.methodsObject.mint(1),
    { amount: priceMutez, mutez: true },
    { gasPerUnit: 480_000, units: 1 }
  );
  $("mintStatus").textContent = "minting… waiting for confirmation";
  await op.confirmation(1);
  return extractMintedIds(op);
}

async function mintBatch(c, priceMutez, amount) {
  if (amount <= 1) {
    $("mintStatus").textContent = "approve in your wallet (Temple / Kukai / Umami)…";
    return mintOnce(c, priceMutez);
  }
  $("mintStatus").textContent = "approve in your wallet (Temple / Kukai / Umami)…";
  try {
    const total = priceMutez * amount;
    const op = await MD.sendWalletOp(
      c.methodsObject.mint(amount),
      { amount: total, mutez: true },
      { gasPerUnit: 480_000, units: amount }
    );
    $("mintStatus").textContent = "minting… waiting for confirmation";
    await op.confirmation(1);
    const ids = await extractMintedIds(op);
    if (ids.length) return ids;
    return mintBatchSingles(c, priceMutez, amount);
  } catch (e) {
    const msg = e?.data?.[0]?.with?.string || e.message || String(e);
    if (!/more time than the operation|gas|exceeded/i.test(msg)) throw e;
    $("mintStatus").textContent = "batch gas tight — minting one at a time…";
    return mintBatchSingles(c, priceMutez, amount);
  }
}

async function mintBatchSingles(c, priceMutez, amount) {
  const ids = [];
  for (let i = 0; i < amount; i++) {
    await refreshBalance(`before mint ${i + 1}`);
    $("mintStatus").textContent = `minting ${i + 1} of ${amount}… approve in wallet`;
    ids.push(...(await mintOnce(c, priceMutez)));
    await refreshBalance(`after mint ${i + 1}`);
  }
  return ids;
}

async function mint() {
  const me = MD.getAccount();
  if (!me) return;
  const now = new Date();
  const act = activeStageId(now);
  if (act < 0) return;
  let stage = stages.find((s) => s.id === act);

  const btn = $("btnMint");
  btn.disabled = true;
  $("mintStatus").textContent = "verifying network…";
  try {
    // Blocks the send if the RPC, wallet session, balance, or wallet limit is unsafe.
    const preflight = await preflightMint(stage, qty);
    const c = preflight.c;
    stage = preflight.stage;
    $("mintStatus").textContent = "approve in your wallet (Temple / Kukai / Umami)…";
    const ids = await mintBatch(c, stage.priceMutez, qty);
    sessionIds.push(...ids);
    walletStatusCache = { key: "", status: null };
    $("mintStatus").textContent = "confirmed! revealing…";
    await refreshBalance("checked after mint");
    await reveal(ids);
    await loadOwnedMints();
    await loadRecentMints({ force: true });
    const delayed = !!storage?.delayed_reveal;
    $("mintStatus").textContent = ids.length
      ? `minted ${ids.length} token(s) ✓` + (delayed ? " — sealed until reveal (see below)" : "")
      : "minted ✓ (check your wallet)";
    refresh();
  } catch (e) {
    const msg = e?.data?.[0]?.with?.string || e.message || String(e);
    $("mintStatus").textContent =
      "mint failed: " + msg + (/more time than the operation/i.test(msg) ? " — try quantity 1" : "");
  } finally {
    syncMintQuantityUi(stage);
  }
}

async function extractMintedIds(op) {
  try {
    const results = await op.operationResults();
    const ids = [];
    for (const content of results) {
      const internals = content?.metadata?.internal_operation_results || [];
      for (const int_ of internals) {
        if (int_.kind === "event" && (int_.tag || "").includes("blind_mint")) {
          const v = int_.payload;
          if (v && v.int != null) ids.push(Number(v.int));
        }
      }
    }
    return ids;
  } catch (e) {
    console.warn("could not parse mint events", e);
    return [];
  }
}

async function reveal(ids) {
  if (!ids.length) return;
  $("revealSection").style.display = "";
  for (const id of ids) {
    // Upsert by token id so cards refresh in place once a blank is revealed.
    let card = $("revealGrid").querySelector(`[data-token-id="${id}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "reveal-card";
      card.dataset.tokenId = id;
      $("revealGrid").prepend(card);
    }
    const wasSealed = card.classList.contains("sealed");
    setCardStatus(card, `token #${id + 1} — loading…`);
    try {
      const tm = await storage.token_metadata.get(String(id));
      const hex = tm.token_info.get("");
      const uri = MD.hexToUtf8(hex);
      const metaUrl = safeHttpUrl(MD.ipfsToHttp(uri, CFG.gateway));
      if (!metaUrl) throw new Error("unsafe metadata URI");
      const meta = await (await fetch(metaUrl)).json();
      const sealed = !!storage.delayed_reveal && id >= Number(storage.revealed);
      card.classList.toggle("sealed", sealed);
      renderTokenCard(card, meta, id, sealed);
      if (wasSealed && !sealed) {
        // sealed → revealed: replay the pop animation for the unveiling
        card.classList.remove("flip");
        void card.offsetWidth;
        card.classList.add("flip");
      }
    } catch (e) {
      setCardStatus(card, `token #${id + 1} (metadata pending)`);
    }
  }
}

// ---------- wallet & qty ----------
$("btnConnect").addEventListener("click", async () => {
  if (walletRestoring || walletConnecting || MD.getAccount()) return;
  walletConnecting = true;
  setWalletButtons(false);
  setText("mintStatus", "connecting wallet...");
  try {
    await MD.connectWallet(CFG.title || "Macaroni");
    await refreshBalance("connected");
    render();
    await loadOwnedMints();
  } catch (e) {
    setText("mintStatus", "wallet connect cancelled or failed: " + (e.message || e));
  } finally {
    walletConnecting = false;
    setWalletButtons(!!MD.getAccount());
  }
});

$("btnDisconnect").addEventListener("click", async () => {
  await MD.disconnectWallet();
  sessionIds = [];
  walletBalanceMutez = null;
  currentStageWalletRemaining = null;
  walletStatusLoadingKey = "";
  walletStatusCache = { key: "", status: null };
  ownedMintLoadSeq++;
  setWalletButtons(false);
  setText("walletBalance", "Wallet disconnected.");
  setText("walletLimitStatus", "");
  setText("allowStatus", "connect a wallet to mint");
  setText("mintPreflight", "");
  setText("ownedMintStatus", "");
  $("revealGrid").innerHTML = "";
  $("revealSection").style.display = "none";
  render();
});

setWalletButtons(false);
MD.restoreWallet(CFG.title || "Macaroni")
  .then(async (addr) => {
    setWalletButtons(!!addr);
    if (addr) {
      await refreshBalance("restored");
      await loadOwnedMints();
    } else {
      await refreshBalance();
    }
    render();
  })
  .catch(async (err) => {
    console.warn("Macaroni wallet restore failed", err);
    await MD.disconnectWallet().catch(() => {});
    setText("walletBalance", "Wallet session expired. Connect again to mint.");
    render();
  })
  .finally(() => {
    walletRestoring = false;
    setWalletButtons(!!MD.getAccount());
    syncMintQuantityUi(activeStage());
  });

$("qtyMinus").addEventListener("click", () => {
  qty = Math.max(1, qty - 1);
  syncMintQuantityUi(activeStage());
  render();
});
$("qtyPlus").addEventListener("click", () => {
  const max = effectiveQtyMax(activeStage());
  if (max > 0) qty = Math.min(max, qty + 1);
  syncMintQuantityUi(activeStage());
  render();
});
$("btnMint").addEventListener("click", mint);
$("btnReveal").addEventListener("click", publicReveal);

refresh().then(() => loadOwnedMints());
setInterval(render, 1000);     // countdowns
setInterval(refresh, 30000);   // chain state
