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
  insertAfter("mintPreflight", '<div class="muted" id="royaltyStatus" role="status" aria-live="polite"></div>');
  insertAfter("allowStatus", '<div class="muted" id="walletLimitStatus" aria-live="polite"></div>');
  insertAfter(
    "walletLimitStatus",
    '<div class="drop-share" id="dropSharePanel" aria-label="Share this blind mint">' +
      '<span class="muted">Share this blind mint</span>' +
      '<div class="mint-share-row">' +
        '<a class="mint-share" id="dropShareX" target="_blank" rel="noopener" href="#">X</a>' +
        '<a class="mint-share" id="dropShareBsky" target="_blank" rel="noopener" href="#">Bluesky</a>' +
      '</div>' +
    '</div>'
  );
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
    "royaltyStatus",
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
  setAttrs($("dropShareX"), { "aria-label": "Share this blind mint on X" });
  setAttrs($("dropShareBsky"), { "aria-label": "Share this blind mint on Bluesky" });
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

function countWord(count, singular, plural) {
  return Number(count) === 1 ? singular : plural;
}

function countLabel(count, singular, plural) {
  return `${count} ${countWord(count, singular, plural)}`;
}

function storageNatToNumber(value) {
  if (value == null || value === false) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value.toNumber === "function") {
    const n = value.toNumber();
    return Number.isFinite(n) ? n : null;
  }
  if (value.Some != null) return storageNatToNumber(value.Some);
  if (value.some != null) return storageNatToNumber(value.some);
  if (value.value != null) return storageNatToNumber(value.value);
  if (value.int != null) return storageNatToNumber(value.int);
  if (value.prim === "Some" && Array.isArray(value.args)) return storageNatToNumber(value.args[0]);
  return null;
}

function maxPerWalletFromStage(stage) {
  const n = storageNatToNumber(stage?.max_per_wallet ?? stage?.maxPerWallet);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function walletTokensHeadingText(count) {
  const n = Number(count || 0);
  return n > 0 ? `Your ${countLabel(n, "drop token", "drop tokens")}` : "Your drop tokens";
}

function updateWalletTokensHeading(count) {
  setText("ownedMintsHeading", walletTokensHeadingText(count));
}

function walletTokenStatusText(stats) {
  const parts = [];
  if (stats.stage?.maxPerWallet && stats.stageMinted != null) {
    parts.push(`Minted this stage: ${stats.stageMinted}/${stats.stage.maxPerWallet}`);
  } else {
    parts.push(`Minted from this drop: ${stats.mintedCount}`);
  }
  if (stats.stage?.maxPerWallet && stats.stageMinted != null && stats.mintedCount !== stats.stageMinted) {
    parts.push(`Minted from this drop: ${stats.mintedCount}`);
  }
  parts.push(`Currently owned: ${stats.ownedCount}`);
  return parts.join(" · ");
}

function setWalletTokenStatus(stats, prefix) {
  const text = walletTokenStatusText(stats);
  setText("ownedMintStatus", prefix ? `${prefix} ${text}` : text);
}

function uniqueTokenIds(ids) {
  const seen = new Set();
  return (ids || [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id >= 0)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function walletTokenPresentation(mintedIds, ownedIds) {
  const minted = uniqueTokenIds(mintedIds);
  const owned = uniqueTokenIds(ownedIds);
  const ownedSet = new Set(owned);
  const mintedSet = new Set(minted);
  const ids = [...minted, ...owned.filter((id) => !mintedSet.has(id))];
  const context = new Map();
  minted.forEach((id) => {
    context.set(id, ownedSet.has(id) ? "minted by you" : "minted by you · no longer held");
  });
  owned.forEach((id) => {
    if (!context.has(id)) context.set(id, "owned · minted by another wallet");
  });
  return { ids, minted, owned, context };
}

function shortAddressIfNeeded(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^(tz1|tz2|tz3|tz4|KT1)[1-9A-HJ-NP-Za-km-z]+$/.test(text) ? MD.short(text) : text;
}

function dropArtistName(meta) {
  const creators = Array.isArray(meta?.creators) ? meta.creators : [];
  const authors = Array.isArray(CFG.authors) ? CFG.authors : [];
  const candidates = [
    CFG.artist,
    CFG.artistName,
    CFG.creatorName,
    ...authors,
    ...creators,
    meta?.minter,
    CFG.creator,
    CFG.author,
  ];
  for (const candidate of candidates) {
    const name = shortAddressIfNeeded(candidate);
    if (name) return name;
  }
  return "the artist";
}

function shareDropUrl() {
  try {
    const url = new URL(location.href);
    url.hash = "";
    return url.href;
  } catch (_) {
    return location.href;
  }
}

function tokenDisplayName(meta, id) {
  return String(meta?.name || "#" + (id + 1));
}

function normalizeShareHandle(value) {
  let text = String(value || "").trim();
  text = text
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/@?/i, "")
    .replace(/^https?:\/\/(?:www\.)?bsky\.app\/profile\/@?/i, "")
    .replace(/^@+/, "")
    .split(/[?#\s]/)[0]
    .replace(/\/+$/, "");
  return text.replace(/[^a-z0-9._-]/gi, "").slice(0, 120);
}

function shareRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function creatorSocialHandle(service) {
  const social = shareRecord(CFG.social);
  const creatorSocial = shareRecord(CFG.creatorSocial);
  const share = shareRecord(CFG.share);
  const candidates =
    service === "bsky"
      ? [
          social.bsky,
          social.bluesky,
          creatorSocial.bsky,
          creatorSocial.bluesky,
          share.bskyHandle,
          share.blueskyHandle,
          CFG.bskyHandle,
          CFG.blueskyHandle,
          CFG.bsky,
        ]
      : [
          social.twitter,
          social.x,
          creatorSocial.twitter,
          creatorSocial.x,
          share.twitterHandle,
          share.xHandle,
          CFG.twitterHandle,
          CFG.xHandle,
          CFG.twitter,
          CFG.x,
        ];
  for (const candidate of candidates) {
    const handle = normalizeShareHandle(candidate);
    if (handle) return handle;
  }
  return "";
}

function creatorShareIdentity(service, meta) {
  const handle = creatorSocialHandle(service);
  return handle ? `@${handle}` : dropArtistName(meta);
}

function tokenShareMediaUrl(meta) {
  const uri = tokenArtifactUri(meta) || tokenPreviewUri(meta);
  return safeHttpUrl(MD.ipfsToHttp(uri, CFG.gateway || MD.DEFAULT_GATEWAY));
}

function shareTemplateFor(service) {
  const share = shareRecord(CFG.share);
  const template =
    service === "bsky"
      ? share.bskyText || share.blueskyText || share.template || CFG.shareText
      : share.xText || share.twitterText || share.template || CFG.shareText;
  return String(template || "").trim();
}

function fillShareTemplate(template, values) {
  return template.replace(/\{(token|artist|creator|collection|url|media|service)\}/gi, (_, key) => {
    const lookup = String(key || "").toLowerCase();
    return values[lookup] || "";
  });
}

function ensureShareMedia(text, media) {
  const body = String(text || "").trim();
  if (!media || body.includes(media)) return body;
  return `${body}\n${media}`;
}

function collectionCoverUrl() {
  return safeHttpUrl(MD.ipfsToHttp(CFG.cover, CFG.gateway || MD.DEFAULT_GATEWAY));
}

function shareIntentUrl(service, text) {
  if (service === "bsky") return `https://bsky.app/intent/compose?${new URLSearchParams({ text }).toString()}`;
  return `https://x.com/intent/post?${new URLSearchParams({ text }).toString()}`;
}

function mintShareText(service, meta, id) {
  const media = tokenShareMediaUrl(meta);
  const values = {
    token: tokenDisplayName(meta, id),
    artist: dropArtistName(meta),
    creator: creatorShareIdentity(service, meta),
    collection: CFG.title || "this collection",
    url: shareDropUrl(),
    media,
    service: service === "bsky" ? "Bluesky" : "X",
  };
  const template = shareTemplateFor(service);
  if (template) return ensureShareMedia(fillShareTemplate(template, values), media);
  return ensureShareMedia(
    `I just minted ${values.token} from ${values.creator}'s blind mint drop for ${values.collection}. Mint your own here ${values.url}.`,
    media
  );
}

function shareUrlFor(service, meta, id) {
  return shareIntentUrl(service, mintShareText(service, meta, id));
}

function stagePositionText(stage) {
  if (!stage) return "";
  const index = stages.findIndex((s) => s.id === stage.id);
  const total = Math.max(1, stages.length || 1);
  if (total === 1) return "Mint stage";
  return `Stage ${Math.max(0, index) + 1} of ${total}`;
}

function dropSupplyShareLine() {
  if (!storage) return "";
  const supply = Number(storage.supply);
  const minted = Number(storage.minted);
  if (!Number.isFinite(supply) || !Number.isFinite(minted)) return "";
  return `Minted: ${minted}/${supply}${supply > minted ? `, ${supply - minted} remaining` : ""}`;
}

function dropStageShareLines(stage, statusText) {
  const lines = [];
  if (statusText) lines.push(`Sale: ${statusText}`);
  if (stage) {
    const live = stage.start <= new Date();
    lines.push(`${stagePositionText(stage)}: ${live ? "live" : "opens"} ${live ? "now" : stage.start.toLocaleString()}`);
    lines.push(`Mint cost: ${MD.fmtTez(stage.priceMutez)} each`);
    lines.push(`Wallet limit: ${stage.maxPerWallet ? `${stage.maxPerWallet} per wallet` : "no per-wallet cap"}`);
    lines.push(`Access: ${stage.useAllowlist ? "allowlist only" : "public mint"}`);
  } else {
    lines.push("Stage: not scheduled");
  }
  const supplyLine = dropSupplyShareLine();
  if (supplyLine) lines.push(supplyLine);
  return lines;
}

function dropShareText(service, stage, statusText) {
  const cover = collectionCoverUrl();
  const title = CFG.title || "this blind mint drop";
  const creator = creatorShareIdentity(service, null);
  const lines = [
    `${title} blind mint${creator ? ` by ${creator}` : ""}.`,
    ...dropStageShareLines(stage, statusText),
    `Mint page: ${shareDropUrl()}`,
  ];
  if (cover) lines.push(`Cover image: ${cover}`);
  return lines.filter(Boolean).join("\n");
}

function updateDropShareLinks(stage, statusText) {
  const title = CFG.title || "this blind mint";
  const x = $("dropShareX");
  const bsky = $("dropShareBsky");
  if (!x && !bsky) return;
  if (x) {
    x.href = shareIntentUrl("x", dropShareText("x", stage, statusText));
    x.setAttribute("aria-label", `Share ${title} blind mint on X`);
  }
  if (bsky) {
    bsky.href = shareIntentUrl("bsky", dropShareText("bsky", stage, statusText));
    bsky.setAttribute("aria-label", `Share ${title} blind mint on Bluesky`);
  }
}

function makeMintShareLink(service, label, meta, id) {
  const link = document.createElement("a");
  link.className = "mint-share";
  link.href = shareUrlFor(service, meta, id);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  link.setAttribute("aria-label", `Share ${tokenDisplayName(meta, id)} on ${label}`);
  return link;
}

function makeMintShareLinks(meta, id) {
  const row = document.createElement("div");
  row.className = "mint-share-row";
  row.append(makeMintShareLink("x", "X", meta, id), makeMintShareLink("bsky", "Bluesky", meta, id));
  return row;
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

function renderTokenCard(card, meta, id, sealed, contextLabel) {
  const cap = document.createElement("div");
  cap.className = "cap";
  const name = document.createElement("span");
  name.textContent = `${tokenDisplayName(meta, id)}${sealed ? " · sealed" : ""}`;
  cap.appendChild(name);
  if (contextLabel) {
    const source = document.createElement("span");
    source.className = "mint-context";
    source.textContent = contextLabel;
    cap.appendChild(source);
  }
  if (!sealed) cap.appendChild(makeMintShareLinks(meta, id));
  const media = document.createElement("div");
  media.className = "token-media";
  if (!renderMediaPreview(media, meta, `${tokenDisplayName(meta, id)} artwork`)) {
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

async function tokenIsSealed(tokenId) {
  if (!storage?.delayed_reveal) return false;
  if (storage.token_placeholder) {
    try {
      const placeholder = await storage.token_placeholder.get(String(tokenId));
      return placeholder != null;
    } catch (_) {
      try {
        const placeholder = await storage.token_placeholder.get(Number(tokenId));
        return placeholder != null;
      } catch (_) {
        return false;
      }
    }
  }
  return Number(tokenId) >= Number(storage.revealed || 0);
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
  const sealed = await tokenIsSealed(tokenId);
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

function customRecentMintLimit(grid) {
  return Math.max(CUSTOM_RECENT_MINT_LIMIT, grid?.children?.length || 0);
}

function customRecentMintCaption(transfer, identity, meta) {
  const id = Number(transfer.tokenId);
  const title = tokenDisplayName(meta, Number.isInteger(id) ? id : 0);
  const who = identity?.label || transfer.minterAlias || MD.short(transfer.minter);
  if (transfer.sealed) return `${title} - sealed`;
  if (transfer.metadataPending) return `${title} - updating metadata`;
  return `${title} - minted by ${who}`;
}

function renderCustomRecentMintCards(grid, noteEl, transfers, identities) {
  if (!grid || !noteEl) return;
  grid.replaceChildren();
  noteEl.textContent = transfers.length ? `${transfers.length} recent mints` : "No recent mints yet.";
  for (const transfer of transfers) {
    const id = Number(transfer.tokenId);
    const meta = transfer.token?.metadata || {};
    const identity = identities.get(transfer.minter) || {
      address: transfer.minter,
      label: transfer.minterAlias || MD.short(transfer.minter),
      source: transfer.minterAlias ? "tzkt" : "address",
    };
    const button = document.createElement("button");
    button.className = "airporters-recent-card";
    button.type = "button";
    button.dataset.tokenId = String(id);
    const mediaRendered =
      !transfer.sealed &&
      !transfer.metadataPending &&
      renderMediaPreview(button, meta, `${tokenDisplayName(meta, id)} preview`);
    if (mediaRendered) {
      button.addEventListener("click", () => {
        const url = safeHttpUrl(MD.ipfsToHttp(tokenArtifactUri(meta) || tokenPreviewUri(meta), CFG.gateway || MD.DEFAULT_GATEWAY));
        if (url) window.open(url, "_blank", "noopener");
      });
    } else {
      button.disabled = true;
      const placeholder = document.createElement("div");
      placeholder.className = transfer.metadataPending ? "airporters-sealed airporters-pending" : "airporters-sealed";
      placeholder.textContent = transfer.sealed ? "sealed" : "updating";
      button.appendChild(placeholder);
    }
    const cap = document.createElement("span");
    cap.textContent = customRecentMintCaption(transfer, identity, meta);
    button.appendChild(cap);
    grid.appendChild(button);
  }
}

async function loadCustomRecentMintsCompat(options) {
  const grid = $("airportersRecentGrid");
  const noteEl = $("airportersRecentNote");
  if (!grid || !noteEl || !CFG.contract) return;
  const minted = storage ? Number(storage.minted || 0) : "";
  const revealed = storage ? Number(storage.revealed || 0) : "";
  const key = `${CFG.network || "mainnet"}:${CFG.contract}:${minted}:${revealed}:${grid.children.length}`;
  if (!options?.force && key === customRecentCompatKey) return;
  customRecentCompatKey = key;
  const seq = ++customRecentCompatSeq;
  try {
    const fetched = await MD.fetchRecentMintTransfers(
      CFG.network || "mainnet",
      CFG.contract,
      customRecentMintLimit(grid)
    );
    const transfers = await hydrateRecentMints(fetched);
    if (seq !== customRecentCompatSeq) return;
    const identities = await MD.fetchWalletIdentities(
      CFG.network || "mainnet",
      transfers.map((mint) => mint.minter).filter(Boolean)
    );
    if (seq !== customRecentCompatSeq) return;
    renderCustomRecentMintCards(grid, noteEl, transfers, identities);
  } catch (e) {
    if (seq !== customRecentCompatSeq) return;
    noteEl.textContent = "Could not load recent mints: " + (e.message || e);
  }
}

function scheduleCustomRecentMintsCompat() {
  [0, 1500, 5000].forEach((delay) => {
    setTimeout(() => loadCustomRecentMintsCompat({ force: delay > 0 }), delay);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleCustomRecentMintsCompat);
} else {
  scheduleCustomRecentMintsCompat();
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

function minterRoyaltyConfig() {
  const cfg = CFG.minterRoyalties && typeof CFG.minterRoyalties === "object" ? CFG.minterRoyalties : {};
  const bps = Number(cfg.bps || 0);
  return {
    enabled: !!cfg.enabled && bps > 0,
    bps,
    percent: Number(cfg.percent || bps / 100),
    mode: cfg.mode === "rolling_pool" ? "rolling_pool" : "first_minter",
    updater: String(cfg.updater || ""),
    updateEndpoint: String(cfg.updateEndpoint || ""),
    lock: String(cfg.lock || ""),
  };
}

function minterRoyaltyLabel() {
  const cfg = minterRoyaltyConfig();
  if (!cfg.enabled) return "";
  return cfg.mode === "rolling_pool"
    ? `Minter royalty pool: ${cfg.percent}% split across minters until sellout or creator lock.`
    : `Minter royalty pool: ${cfg.percent}% assigned to the first minter of each token.`;
}

function renderMinterRoyaltyStatus() {
  const cfg = minterRoyaltyConfig();
  if (!cfg.enabled) {
    setText("royaltyStatus", "");
    return;
  }
  const mutable =
    cfg.mode === "rolling_pool"
      ? " Royalty metadata can update after each mint until the pool is locked."
      : " Royalty metadata locks after the first-minter sync for that token.";
  setText("royaltyStatus", minterRoyaltyLabel() + mutable);
}

// ---------- chain state ----------
MD.setupToolkit(CFG.network || "mainnet", CFG.rpc);
let storage = null;
let stages = []; // [{id, start:Date, priceMutez, useAllowlist, maxPerWallet}]
let qty = 1;
let sessionIds = []; // token ids minted in this browser session
let walletTokenContextLabels = new Map();
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
let customRecentCompatSeq = 0;
let customRecentCompatKey = "";
let walletConnecting = false;
let walletRestoring = true;
const MINT_QTY_UI_CAP = 10;
const RECENT_MINT_LIMIT = 8;
const CUSTOM_RECENT_MINT_LIMIT = 10;

function revealState() {
  if (!storage) return null;
  const queuePending =
    storage.reveal_tail != null && storage.reveal_cursor != null
      ? Math.max(0, Number(storage.reveal_tail) - Number(storage.reveal_cursor))
      : null;
  return {
    delayed: !!storage.delayed_reveal,
    pending: queuePending != null ? queuePending : Number(storage.minted) - Number(storage.revealed),
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

function currentStageLiveLabel(stage, activeIndex, totalStages) {
  const total = Math.max(1, Number(totalStages || 0));
  const position = Math.max(1, Number(activeIndex || 0) + 1);
  const base =
    total === 1
      ? "Mint is Live"
      : `Currently on Sale Stage ${position} of ${total}`;
  return (
    base +
    (stage && stage.useAllowlist ? " · allowlist only" : "") +
    (stage && stage.maxPerWallet ? ` · max ${stage.maxPerWallet}/wallet` : "")
  );
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
    setText("walletLimitStatus", stage?.maxPerWallet ? `Max ${countLabel(stage.maxPerWallet, "mint", "mints")} per wallet.` : "");
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
          ? `you are allowlisted — ${allowRemaining}/${capNumber} ${countWord(allowRemaining, "mint", "mints")} remaining for this stage`
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
      ? `Max ${countLabel(stage.maxPerWallet, "mint", "mints")} per wallet.`
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
    throw new Error(`only ${max} ${countWord(max, "mint is", "mints are")} currently available for this wallet`);
  }
  const total = stage.priceMutez * amount;
  const { c, estimate } = await MD.withRpcFallback(async () => {
    const tezos = MD.getToolkit();
    const contract = await tezos.wallet.at(CFG.contract);
    const limits = await MD.estimateWalletOp(
      contract.methodsObject.mint(amount),
      { amount: total, mutez: true },
      { gasPerUnit: 480_000, units: amount, throwOnRecoverableRpcError: true }
    );
    return { c: contract, estimate: limits };
  });
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
    updateWalletTokensHeading(0);
    walletTokenContextLabels = new Map();
    setText("ownedMintStatus", "");
    if ($("revealGrid")) $("revealGrid").innerHTML = "";
    if ($("revealSection")) $("revealSection").style.display = "none";
    return;
  }
  const seq = ++ownedMintLoadSeq;
  setText("ownedMintStatus", "Checking this wallet's drop tokens...");
  if (!storage) await refresh();
  if (!storage || seq !== ownedMintLoadSeq) return;
  try {
    const [ownedIds, mintedIds] = await Promise.all([
      MD.fetchOwnedTokenIds(CFG.network || "mainnet", CFG.contract, me),
      MD.fetchMintedTokenIds(CFG.network || "mainnet", CFG.contract, me),
    ]);
    if (seq !== ownedMintLoadSeq) return;
    const stage = activeStage(new Date());
    const stageMinted = stage ? await readStageWalletMinted(stage) : null;
    if (seq !== ownedMintLoadSeq) return;
    const walletTokens = walletTokenPresentation(mintedIds, ownedIds);
    walletTokenContextLabels = walletTokens.context;
    updateWalletTokensHeading(walletTokens.ids.length);
    const stats = {
      stage,
      stageMinted,
      mintedCount: walletTokens.minted.length,
      ownedCount: walletTokens.owned.length,
    };
    if (!walletTokens.ids.length) {
      setWalletTokenStatus(stats, "No drop tokens found for this wallet yet.");
      $("revealGrid").innerHTML = "";
      $("revealSection").style.display = "none";
      return;
    }
    sessionIds = [...new Set([...sessionIds, ...walletTokens.ids])];
    $("revealSection").style.display = "";
    setWalletTokenStatus(stats);
    await reveal(walletTokens.ids);
  } catch (e) {
    setText("ownedMintStatus", "Could not load wallet drop tokens: " + (e.message || e));
  }
}

async function refresh() {
  if (!CFG.contract) {
    $("supplyText").textContent = "drop not deployed yet — check back soon";
    $("stagesList").innerHTML = '<div class="muted">no stages configured</div>';
    updateDropShareLinks(null, "Drop page is live; contract is not deployed yet");
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
        maxPerWallet: maxPerWalletFromStage(v),
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
  renderMinterRoyaltyStatus();
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
    updateDropShareLinks(activeStage(now) || stages[0] || null, "Minting is paused by the creator");
    disableMintControls();
    return;
  }
  if (left <= 0 && supply > 0) {
    $("stageInfo").textContent = "Sold out — thank you!";
    $("price").textContent = "";
    updateDropShareLinks(activeStage(now) || stages[stages.length - 1] || null, "Sold out");
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
    updateDropShareLinks(next || null, next ? `Starts ${next.start.toLocaleString()}` : "Sale not scheduled yet");
    disableMintControls();
    return;
  }
  const stageIndex = stages.findIndex((s) => s.id === act);
  const stage = stages[stageIndex] || stages.find((s) => s.id === act);
  const stageLabel = currentStageLiveLabel(stage, stageIndex >= 0 ? stageIndex : act, stages.length);
  $("stageInfo").textContent = stageLabel;
  updateDropShareLinks(stage, stageLabel);
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
      `<span class="countdown">${rs.pending}</span> sealed ${countWord(rs.pending, "mint", "mints")} — ` +
      "the auto-reveal window is open: <strong>anyone</strong> can trigger the reveal.";
  } else if (openAt) {
    // render() runs every second, so this ticks like the stage countdown.
    const dt = openAt - now;
    const d = Math.floor(dt / 86400000),
      h = Math.floor((dt % 86400000) / 3600000),
      m = Math.floor((dt % 3600000) / 60000),
      s = Math.floor((dt % 60000) / 1000);
    $("revealInfo").innerHTML =
      `${countLabel(rs.pending, "sealed mint", "sealed mints")} awaiting reveal — public auto-reveal opens in ` +
      `<span class="countdown">${d ? d + "d " : ""}${h}h ${m}m ${s}s</span>` +
      " · the creator can reveal sooner.";
  } else {
    $("revealInfo").textContent = `${countLabel(rs.pending, "sealed mint", "sealed mints")} awaiting reveal.`;
  }
  $("btnReveal").style.display = open ? "" : "none";
  $("btnReveal").disabled = !MD.getAccount();
}

function operationHash(op) {
  const hash = op?.opHash || op?.hash || op?.operationHash || "";
  return typeof hash === "string" && /^o[1-9A-HJ-NP-Za-km-z]{30,}$/.test(hash) ? hash : "";
}

function operationLink(hash) {
  if (!hash) return "";
  const base =
    {
      mainnet: "https://tzkt.io/",
      shadownet: "https://shadownet.tzkt.io/",
    }[CFG.network || "mainnet"] || "https://tzkt.io/";
  return base + hash;
}

function operationRpcBase() {
  const networkRpc = MD.getNetworks?.()[CFG.network || "mainnet"]?.rpc;
  return String(CFG.rpc || networkRpc || "").replace(/\/+$/, "");
}

function setOperationProgressStatus(statusId, actionLabel, hash, suffix) {
  const el = $(statusId);
  if (!el || !hash) return false;
  const link = document.createElement("a");
  link.href = operationLink(hash);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = MD.short(hash);
  link.setAttribute("aria-label", `${actionLabel} operation ${hash}`);
  el.replaceChildren(`wallet returned ${actionLabel} hash (`, link, `); ${suffix}`);
  return true;
}

function operationErrorMessage(e) {
  return e?.data?.[0]?.with?.string || e?.message || String(e);
}

function isConfirmationTimeout(e) {
  const msg = operationErrorMessage(e);
  return /confirmation polling timed out|polling timed out|confirmation.*timed out|timeout.*confirmation/i.test(msg);
}

function macaroniOperationError(prefix, message) {
  const err = new Error(message);
  err.macaroniPrefix = prefix;
  return err;
}

function tzktApiBase() {
  return (MD.TZKT_API && (MD.TZKT_API[CFG.network || "mainnet"] || MD.TZKT_API.mainnet)) || "https://api.tzkt.io";
}

function operationTargetAddress(row) {
  return row?.target?.address || row?.target || "";
}

function operationEntrypoint(row) {
  return row?.parameter?.entrypoint || "";
}

function operationFailureText(row) {
  const error = Array.isArray(row?.errors) ? row.errors[0] : null;
  const id = error?.id || error?.with?.string || row?.status || "operation rejected";
  return String(id).replace(/^proto\.[^.]+\./, "");
}

async function fetchOperationTransactions(hash) {
  const res = await fetch(`${tzktApiBase()}/v1/operations/transactions/${encodeURIComponent(hash)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`operation lookup failed: ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}

async function lookupRelevantOperation(hash, entrypoint) {
  const rows = await fetchOperationTransactions(hash);
  return rows.find((row) => {
    if (!row || row.hash !== hash) return false;
    if (CFG.contract && operationTargetAddress(row) !== CFG.contract) return false;
    if (entrypoint && operationEntrypoint(row) !== entrypoint) return false;
    return true;
  });
}

async function lookupRpcMempoolOperation(hash) {
  const base = operationRpcBase();
  if (!base) return null;
  const res = await fetch(`${base}/chains/main/mempool/pending_operations`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  for (const state of ["applied", "refused", "branch_refused", "branch_delayed", "outdated", "unprocessed"]) {
    const rows = Array.isArray(json?.[state]) ? json[state] : [];
    const row = rows.find((item) => item?.hash === hash);
    if (row) return { state, row };
  }
  return null;
}

async function lookupOperationVisibility(hash, entrypoint) {
  const row = await lookupRelevantOperation(hash, entrypoint);
  if (row) return { kind: "indexed", row };
  const mempool = await lookupRpcMempoolOperation(hash).catch(() => null);
  if (mempool) return { kind: "mempool", mempool };
  return null;
}

async function waitForIndexedOperation(hash, entrypoint) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await lookupRelevantOperation(hash, entrypoint);
    if (row) return row;
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return null;
}

async function confirmWalletOperation(op, entrypoint, statusId, actionLabel) {
  const submittedHash = operationHash(op);
  if (submittedHash) {
    setOperationProgressStatus(statusId, actionLabel, submittedHash, "checking public nodes...");
    const visible = await lookupOperationVisibility(submittedHash, entrypoint).catch(() => null);
    if (visible?.row?.status === "applied") {
      setText(statusId, `${actionLabel} confirmed by indexer (${MD.short(submittedHash)})`);
      return { status: "confirmed", hash: submittedHash, source: "tzkt", row: visible.row };
    }
    if (visible?.row && visible.row.status && visible.row.status !== "applied") {
      throw macaroniOperationError(
        `${actionLabel} failed`,
        `operation ${visible.row.status}: ${operationFailureText(visible.row)} (${MD.short(submittedHash)})`
      );
    }
    const suffix = visible?.mempool
      ? `seen in node mempool (${visible.mempool.state}); waiting for block confirmation...`
      : "not visible on public nodes yet; waiting for chain confirmation...";
    setOperationProgressStatus(statusId, actionLabel, submittedHash, suffix);
  }
  try {
    await op.confirmation(1);
    return { status: "confirmed", hash: submittedHash, source: "wallet" };
  } catch (e) {
    if (!isConfirmationTimeout(e)) throw e;
    const hash = submittedHash || operationHash(op);
    if (!hash) {
      throw macaroniOperationError(
        `${actionLabel} not confirmed`,
        "wallet confirmation timed out before an operation hash was returned"
      );
    }
    const shortHash = MD.short(hash);
    setOperationProgressStatus(statusId, actionLabel, hash, "checking chain confirmation...");
    const row = await waitForIndexedOperation(hash, entrypoint);
    if (row?.status === "applied") {
      setText(statusId, `${actionLabel} confirmed by indexer (${shortHash})`);
      return { status: "confirmed", hash, source: "tzkt", row };
    }
    if (row && row.status && row.status !== "applied") {
      throw macaroniOperationError(
        `${actionLabel} failed`,
        `operation ${row.status}: ${operationFailureText(row)} (${shortHash})`
      );
    }
    const mempool = await lookupRpcMempoolOperation(hash).catch(() => null);
    if (mempool) {
      throw macaroniOperationError(
        `${actionLabel} not confirmed`,
        `operation ${shortHash} is still ${mempool.state.replace(/_/g, " ")} on the configured node. Check ${operationLink(hash)} before retrying.`
      );
    }
    const pendingState = entrypoint === "mint" ? "no mint was indexed yet" : "the operation has not been indexed yet";
    throw macaroniOperationError(
      `${actionLabel} not confirmed`,
      `wallet returned operation ${shortHash}, but it is not visible on public Tezos nodes and ${pendingState}. Check ${operationLink(hash)} before retrying.`
    );
  }
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
    await confirmWalletOperation(op, "reveal", "revealOpStatus", "reveal");
    $("revealOpStatus").textContent = "revealed ✓";
    await refresh();
    if (sessionIds.length) await reveal(sessionIds); // refresh this session's cards
  } catch (e) {
    const msg = operationErrorMessage(e);
    $("revealOpStatus").textContent = (e?.macaroniPrefix || "reveal failed") + ": " + msg;
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
  await confirmWalletOperation(op, "mint", "mintStatus", "mint");
  return extractMintedIds(op);
}

async function mintBatch(c, priceMutez, amount) {
  if (amount <= 1) {
    $("mintStatus").textContent = "approve in your wallet…";
    return mintOnce(c, priceMutez);
  }
  $("mintStatus").textContent = "approve in your wallet…";
  try {
    const total = priceMutez * amount;
    const op = await MD.sendWalletOp(
      c.methodsObject.mint(amount),
      { amount: total, mutez: true },
      { gasPerUnit: 480_000, units: amount }
    );
    $("mintStatus").textContent = "minting… waiting for confirmation";
    await confirmWalletOperation(op, "mint", "mintStatus", "mint");
    const ids = await extractMintedIds(op);
    if (ids.length) return ids;
    return mintBatchSingles(c, priceMutez, amount);
  } catch (e) {
    const msg = operationErrorMessage(e);
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

async function maybeSyncMinterRoyalties(ids) {
  const cfg = minterRoyaltyConfig();
  if (!cfg.enabled || !ids.length) return;
  const uniqueIds = [...new Set(ids)];
  if (!cfg.updateEndpoint) {
    setText(
      "royaltyStatus",
      minterRoyaltyLabel() +
        " Mint was recorded; royalty metadata sync is pending until the creator or configured updater pushes the revised metadata."
    );
    return;
  }
  setText("royaltyStatus", "Updating minter royalty metadata...");
  const payload = {
    network: CFG.network || "mainnet",
    contract: CFG.contract,
    minter: MD.getAccount(),
    tokenIds: uniqueIds,
    mode: cfg.mode,
    bps: cfg.bps,
    tokens: Array.isArray(CFG.tokens) ? CFG.tokens.filter((t) => uniqueIds.includes(Number(t.id))) : [],
    reveal: CFG.reveal || null,
  };
  try {
    const res = await fetch(cfg.updateEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      body = null;
    }
    if (!res.ok || body?.ok === false) {
      throw new Error(body?.error || "royalty metadata updater rejected the mint");
    }
  } catch (e) {
    setText(
      "royaltyStatus",
      "Mint confirmed, but minter royalty metadata sync is pending: " + (e.message || e)
    );
    return;
  }
  setText(
    "royaltyStatus",
    cfg.mode === "rolling_pool"
      ? "Minter royalty metadata updated; pool remains mutable until sellout or creator lock."
      : "Minter royalty metadata updated and ready to lock for first-minter mode."
  );
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
    $("mintStatus").textContent = "approve in your wallet…";
    const ids = await mintBatch(c, stage.priceMutez, qty);
    sessionIds.push(...ids);
    walletStatusCache = { key: "", status: null };
    $("mintStatus").textContent = "confirmed! revealing…";
    await refreshBalance("checked after mint");
    await reveal(ids);
    await maybeSyncMinterRoyalties(ids);
    await loadOwnedMints();
    await loadRecentMints({ force: true });
    const delayed = !!storage?.delayed_reveal;
    $("mintStatus").textContent = ids.length
      ? `minted ${countLabel(ids.length, "token", "tokens")} ✓` + (delayed ? " — sealed until reveal (see below)" : "")
      : "minted ✓ (check your wallet)";
    refresh();
  } catch (e) {
    const msg = operationErrorMessage(e);
    const prefix = e?.macaroniPrefix || "mint failed";
    $("mintStatus").textContent =
      prefix + ": " + msg + (/more time than the operation/i.test(msg) ? " — try quantity 1" : "");
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
      const sealed = await tokenIsSealed(id);
      card.classList.toggle("sealed", sealed);
      renderTokenCard(card, meta, id, sealed, walletTokenContextLabels.get(Number(id)) || "");
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
  walletTokenContextLabels = new Map();
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
  updateWalletTokensHeading(0);
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
setInterval(() => loadCustomRecentMintsCompat({ force: true }), 30000);
