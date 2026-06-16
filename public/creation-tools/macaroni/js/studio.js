/* Macaroni Studio — creator flow:
   network → drop details → tokens (CSV + media) → IPFS pinning →
   stages/allowlists → deploy & sync → page design & export. */

"use strict";

const $ = (id) => document.getElementById(id);
const logEl = $("log");
function log(msg, cls) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `\n[${time}] ${msg}`;
  logEl.scrollTop = logEl.scrollHeight;
  if (cls === "err") console.error(msg);
}

function setStatus(id, msg, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = cls || "muted";
}

function notify(msg, cls = "err", statusId) {
  const text = String(msg || "Something went wrong.");
  const notice = $("studioNotice");
  if (notice) {
    notice.textContent = text;
    notice.className = `notice ${cls}`;
    notice.hidden = false;
  }
  if (statusId) setStatus(statusId, text, cls);
  return false;
}

function clearNotice() {
  const notice = $("studioNotice");
  if (notice) {
    notice.textContent = "";
    notice.hidden = true;
  }
}

const STORE_KEY = "macaroni.studio.v1";
const ALLOWED_THEME_NAMES = new Set(["dark", "gallery", "paper", "neon"]);
const ALLOWED_FONT_STACKS = new Set([
  "",
  "Georgia, 'Times New Roman', serif",
  "'Courier New', monospace",
  "Futura, 'Trebuchet MS', sans-serif",
]);
const SAFE_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MB = 1024 * 1024;
const GB = 1024 * MB;
const OBJKT_ARTIFACT_AVERAGE_BYTES = 250 * MB;
const OBJKT_ARTIFACT_MAX_BYTES = 1 * GB;
const OBJKT_COLLECTION_IMAGE_MAX_BYTES = 1 * MB;
const OBJKT_COLLECTION_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const OBJKT_COLLECTION_IMAGE_LABEL = "1 MB, square JPG/PNG";
const OBJKT_TOKEN_PREVIEW_MAX_BYTES = 2 * MB;
const OBJKT_TOKEN_PREVIEW_MAX_SIDE = 800;
const OBJKT_TOKEN_PREVIEW_LABEL = "2 MB token preview";
const KT1_CONTRACT_ADDRESS = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const IS_NATIVE_APP = Boolean(window.MACARONI_DESKTOP && window.MACARONI_DESKTOP.native);
const INSTALLER_PLATFORMS = [
  { key: "macos", id: "installerMacos", label: "macOS" },
  { key: "windows", id: "installerWindows", label: "Windows" },
  { key: "raspberry-pi", id: "installerRaspberryPi", label: "Raspberry Pi" },
];

function normalizeOptionalAddress(value) {
  const text = String(value || "").trim();
  const compact = text.replace(/\s+/g, "");
  if (!compact) return "";
  if (/^(tz1|tz2|tz3|tz4|KT1)(?:…|\.{3})?$/i.test(compact)) return "";
  if (!MD.isAddress(text)) return "";
  return text;
}

function isValidKt1Address(value) {
  return KT1_CONTRACT_ADDRESS.test(String(value || "").trim());
}

function invalidAddressNotice(label, value, statusId) {
  const shown = value ? ` "${value}"` : "";
  return notify(
    `${label}${shown} is not a valid Tezos address (tz1…/tz2…/tz3…/tz4…/KT1…). ` +
      "Clear the field to use your connected wallet.",
    "err",
    statusId
  );
}

function freshDropState() {
  return {
    network: "shadownet",
    rpc: "",
    drop: {
      title: "",
      symbol: "",
      description: "",
      royaltyPct: 10,
      royaltyAddr: "",
      treasuryAddr: "",
      coverCid: "",
      coverMime: "",
      contractMetaCid: "",
      revealMode: "instant", // instant | delayed
      revealDelayDays: 7, // auto-reveal window (delayed mode), 0–30
      placeholderCid: "", // pinned pre-reveal metadata (delayed mode)
    },
    pin: { kind: "pinata", jwt: "", url: "", gateway: MD.DEFAULT_GATEWAY },
    tokens: [], // {id, name, description, attributes, tags, fileName, mediaBytes, mediaCid, mediaMime, previewCid, previewMime, previewBytes, metadataCid}
    stages: [], // {start, price, useAllowlist, maxPerWallet, allowlist:[{address,capacity}]}
    contract: "",
    page: { theme: "dark", accent: "", font: "", blocks: "", css: "", code: "" },
  };
}

const state = freshDropState();

// Files can't be persisted; kept in-memory keyed by base name (id).
const mediaFiles = new Map();
let coverFile = null;
let canUseWtfosPinning = false;

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

function sanitizeDropConfig(cfg) {
  const input = cfg && typeof cfg === "object" ? cfg : {};
  const theme = input.theme && typeof input.theme === "object" ? input.theme : {};
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

function sizeLabel(bytes) {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${bytes} bytes`;
}

function makePinUploadProgress(label, fallbackBytes) {
  let lastPercent = -1;
  let lastLoadedBucket = -1;
  return {
    onUploadProgress(event) {
      const loaded = Math.max(0, Number(event && event.loaded) || 0);
      const total = Math.max(0, Number(event && event.total) || Number(fallbackBytes) || 0);
      if (!total) {
        const loadedBucket = Math.floor(loaded / MB);
        if (loadedBucket === lastLoadedBucket) return;
        lastLoadedBucket = loadedBucket;
        $("pinStatus").textContent = `${label}: uploading ${sizeLabel(loaded)}…`;
        return;
      }
      const percent = Math.min(100, Math.floor((loaded / total) * 100));
      if (percent === lastPercent) return;
      lastPercent = percent;
      $("pinStatus").textContent = `${label}: uploading ${sizeLabel(Math.min(loaded, total))} / ${sizeLabel(total)} (${percent}%)…`;
    },
    onUploadComplete() {
      $("pinStatus").textContent = `${label}: upload complete, waiting for IPFS CID…`;
    },
  };
}

function validateArtifactFile(file) {
  if (!file) return false;
  if (file.size > OBJKT_ARTIFACT_MAX_BYTES) {
    return notify(`${file.name} is ${sizeLabel(file.size)}. Macaroni artifacts must be ≤1 GB.`);
  }
  return true;
}

function artifactSizePolicy() {
  const sizes = [];
  const missingSizeTokens = [];
  const overMax = [];
  for (const t of state.tokens) {
    const f = mediaFiles.get(String(t.id));
    const size = f ? f.size : Number(t.mediaBytes || 0);
    if (Number.isFinite(size) && size > 0) {
      sizes.push({ token: t, size });
      if (size > OBJKT_ARTIFACT_MAX_BYTES) overMax.push({ token: t, size });
    } else if (t.fileName || t.mediaCid) {
      missingSizeTokens.push(t);
    }
  }
  const totalBytes = sizes.reduce((sum, item) => sum + item.size, 0);
  const averageBytes = sizes.length ? totalBytes / sizes.length : 0;
  return { sizes, missingSizeTokens, overMax, totalBytes, averageBytes };
}

function assertArtifactSizePolicy({ requireKnownSizes = false } = {}) {
  const policy = artifactSizePolicy();
  if (policy.overMax.length) {
    const first = policy.overMax[0];
    throw new Error(
      `Token ${first.token.id} artifact is ${sizeLabel(first.size)}. ` +
      "Macaroni artifacts must be ≤1 GB each."
    );
  }
  if (requireKnownSizes && policy.missingSizeTokens.length) {
    const ids = policy.missingSizeTokens.slice(0, 8).map((t) => t.id).join(", ");
    const extra = policy.missingSizeTokens.length > 8 ? "…" : "";
    throw new Error(
      `Macaroni needs artwork file sizes for token(s) ${ids}${extra} before it can verify the 250 MB average. ` +
      "Re-select those artwork files or re-import the CSV/media before continuing."
    );
  }
  if (policy.sizes.length && policy.averageBytes > OBJKT_ARTIFACT_AVERAGE_BYTES) {
    throw new Error(
      `Average artifact size is ${sizeLabel(policy.averageBytes)} across ${policy.sizes.length} token(s). ` +
      "Keep the drop average at or below 250 MB so gateways and OBJKT can load it reliably."
    );
  }
  return policy;
}

function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

async function validateCollectionCover(file) {
  if (!file) return false;
  if (!OBJKT_COLLECTION_IMAGE_MIME_TYPES.has(file.type)) {
    return notify(`Collection logo/cover must be ${OBJKT_COLLECTION_IMAGE_LABEL}.`);
  }
  if (file.size > OBJKT_COLLECTION_IMAGE_MAX_BYTES) {
    return notify(`Collection logo/cover is ${sizeLabel(file.size)}. OBJKT collection logos must be ≤1 MB.`);
  }
  const dims = await imageDimensions(file);
  if (!dims.width || dims.width !== dims.height) {
    return notify(`Collection logo/cover must be square for OBJKT (${dims.width || "?"}×${dims.height || "?"} selected).`);
  }
  return true;
}

function tokenNeedsMediaPreview(t) {
  const mime = String(t.mediaMime || "").toLowerCase();
  return mime === "image/gif" || mime.startsWith("video/");
}

function tokenNeedsCover(t) {
  return !String(t.mediaMime || "").startsWith("image/") && !tokenNeedsMediaPreview(t);
}

function hasWtfosPinningAccess(user) {
  const perms = user && (user.effectivePermissions || user.permissions || {});
  if (perms && perms.trusted_market_creator === true) return true;
  const roles = Array.isArray(user?.roles)
    ? user.roles
    : user?.role
      ? [user.role]
      : [];
  return roles.some((role) =>
    ["admin", "host", "cohost", "trusted_creator", "trusted_market_creator"].includes(String(role))
  );
}

function pinKindAllowed(kind) {
  return kind !== "wtfos" || canUseWtfosPinning;
}

function fallbackPinKind() {
  return "pinata";
}

function selectedPinKind() {
  return pinKindAllowed(state.pin.kind) ? state.pin.kind : fallbackPinKind();
}

function addPinKindOption(value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  $("pinKind").appendChild(opt);
}

function renderPinKindOptions() {
  const select = $("pinKind");
  select.innerHTML = "";
  if (!canUseWtfosPinning && state.pin.kind === "wtfos") {
    state.pin.kind = fallbackPinKind();
    save();
  }
  if (canUseWtfosPinning) addPinKindOption("wtfos", "wtfOS IPFS pinning");
  addPinKindOption("pinata", "Pinata (JWT)");
  addPinKindOption("node", "Own IPFS node (HTTP API)");
  select.value = selectedPinKind();
  const intro = $("pinIntro");
  if (intro) {
    intro.textContent = canUseWtfosPinning
      ? "Your art and metadata are pinned to IPFS. Trusted creators can use wtfOS platform pinning or their own Pinata/IPFS node."
      : "Your art and metadata are pinned to IPFS. Use your own Pinata JWT or IPFS node.";
  }
  const hint = $("pinAccessHint");
  if (hint) {
    hint.textContent = IS_NATIVE_APP
      ? "Macaroni Desktop uses your own Pinata JWT or IPFS node. wtfOS hosted pinning and subdomain publishing are not included."
      : canUseWtfosPinning
      ? "wtfOS pinning and wtfOS subdomain publishing are enabled for this trusted creator account."
      : "Any wtfOS user can deploy a blind-drop contract here. wtfOS pinning and wtfOS subdomain publishing appear only for trusted creators.";
  }
  renderPublishAccess();
  togglePinFields();
}

function renderPublishAccess() {
  const btn = $("btnPublishWtfOS");
  if (btn) {
    btn.hidden = !canUseWtfosPinning;
    btn.disabled = !canUseWtfosPinning;
  }
  const hint = $("publishPathHint");
  if (hint) {
    hint.innerHTML = canUseWtfosPinning
      ? '<strong>Export website</strong> downloads <code>macaroni-site.zip</code> for self-hosting. <strong>Publish to wtfOS</strong> requires a deployed or resumed <code>KT1...</code> contract and saves the mint page to your <code>username.wtfos.me/drop-title</code> site path. <strong>Download site package</strong> includes a separate <code>drop.config.js</code> for quick config swaps on an existing host.'
      : '<strong>Export website</strong> downloads <code>macaroni-site.zip</code> for installing the mint site on your own website. <strong>Download site package</strong> includes a separate <code>drop.config.js</code> for quick config swaps on an existing host.';
  }
}

async function refreshPinningAccess() {
  if (IS_NATIVE_APP) {
    canUseWtfosPinning = false;
    renderPinKindOptions();
    return;
  }
  try {
    const res = await MD.apiFetch("/api/auth/user");
    if (res.ok) canUseWtfosPinning = hasWtfosPinningAccess(await res.json());
    else canUseWtfosPinning = false;
  } catch (_) {
    canUseWtfosPinning = false;
  }
  renderPinKindOptions();
}

// ---------- persistence ----------
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function normalizeState() {
  if (!MD.getNetworks()[state.network]) state.network = "shadownet";
  if (!state.drop || typeof state.drop !== "object") state.drop = freshDropState().drop;
  state.drop.royaltyAddr = normalizeOptionalAddress(state.drop.royaltyAddr);
  state.drop.treasuryAddr = normalizeOptionalAddress(state.drop.treasuryAddr);
  if (!state.pin || typeof state.pin !== "object") state.pin = freshDropState().pin;
  if (!state.pin.gateway) state.pin.gateway = MD.DEFAULT_GATEWAY;
  if (!Array.isArray(state.tokens)) state.tokens = [];
  state.tokens.forEach((t) => {
    if (!t || typeof t !== "object") return;
    t.previewCid = t.previewCid || "";
    t.previewMime = t.previewMime || "";
    t.previewBytes = Number(t.previewBytes || 0);
    if (tokenNeedsMediaPreview(t) && !t.previewCid) t.metadataCid = "";
  });
  if (!Array.isArray(state.stages)) state.stages = [];
  if (!state.page || typeof state.page !== "object") state.page = freshDropState().page;
  state.page.theme = sanitizeThemeName(state.page.theme);
  state.page.accent = sanitizeCssColor(state.page.accent);
  state.page.font = sanitizeFontStack(state.page.font);
  state.page.css = "";
}

function replaceState(next) {
  const defaults = freshDropState();
  const input = next && typeof next === "object" ? next : {};
  const merged = {
    ...defaults,
    ...input,
    drop: { ...defaults.drop, ...(input.drop && typeof input.drop === "object" ? input.drop : {}) },
    pin: { ...defaults.pin, ...(input.pin && typeof input.pin === "object" ? input.pin : {}) },
    tokens: Array.isArray(input.tokens) ? input.tokens : defaults.tokens,
    stages: Array.isArray(input.stages) ? input.stages : defaults.stages,
    page: { ...defaults.page, ...(input.page && typeof input.page === "object" ? input.page : {}) },
  };
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, merged);
  normalizeState();
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) replaceState(JSON.parse(raw));
    else normalizeState();
  } catch (e) {
    console.warn("could not restore draft", e);
    replaceState(freshDropState());
  }
}

// ---------- network / wallet ----------
function applyNetwork() {
  state.network = $("network").value;
  state.rpc = $("rpc").value.trim();
  MD.setupToolkit(state.network, state.rpc || undefined);
  $("netLabel").textContent =
    state.network + " · " + (state.rpc || MD.getNetworks()[state.network].rpc);
  save();
  // A session paired on another network must not survive a network switch.
  MD.ensureSessionNetwork().then((addr) => {
    $("walletAddr").value = addr || "";
    $("btnConnect").textContent = addr ? MD.short(addr) : "Connect wallet";
    if (!addr && state.network === "mainnet")
      log("network set to mainnet — connect your wallet to continue");
  }).catch(() => {});
}

async function connect() {
  try {
    applyNetwork();
    const addr = await MD.connectWallet("Macaroni Studio");
    $("walletAddr").value = addr;
    $("btnConnect").textContent = MD.short(addr);
    log("wallet connected: " + addr);
  } catch (e) {
    log("wallet connect failed: " + e.message, "err");
  }
}

// ---------- tokens ----------
const RESERVED_COLS = new Set(["id", "name", "description", "tags"]);

async function onCsv(file) {
  try {
    const rows = await MD.parseCsv(file);
    const tokens = [];
    for (const r of rows) {
      if (!r.id) continue;
      const id = parseInt(r.id, 10);
      if (!Number.isInteger(id) || id < 1) throw new Error(`bad id "${r.id}" — ids must be positive integers`);
      const attributes = [];
      for (const k of Object.keys(r)) {
        if (!RESERVED_COLS.has(k) && r[k] !== "") attributes.push({ name: k, value: r[k] });
      }
      tokens.push({
        id,
        name: r.name || `#${id}`,
        description: r.description || "",
        tags: r.tags ? r.tags.split(/[;,]\s*/) : [],
        attributes,
        fileName: "",
        mediaBytes: 0,
        mediaCid: "",
        mediaMime: "",
        previewCid: "",
        previewMime: "",
        previewBytes: 0,
        metadataCid: "",
      });
    }
    tokens.sort((a, b) => a.id - b.id);
    const seen = new Set();
    for (const t of tokens) {
      if (seen.has(t.id)) throw new Error("duplicate id " + t.id);
      seen.add(t.id);
    }
    // keep already-pinned CIDs when re-uploading the same ids
    const prev = new Map(state.tokens.map((t) => [t.id, t]));
    for (const t of tokens) {
      const old = prev.get(t.id);
      if (old) Object.assign(t, {
        mediaCid: old.mediaCid, mediaMime: old.mediaMime, mediaBytes: old.mediaBytes || 0,
        previewCid: old.previewCid || "", previewMime: old.previewMime || "", previewBytes: old.previewBytes || 0,
        metadataCid: "", // metadata depends on sheet content → re-pin
        fileName: old.fileName,
      });
    }
    state.tokens = tokens;
    matchMedia_();
    renderTokens();
    save();
    log(`token sheet loaded: ${tokens.length} tokens`);
  } catch (e) {
    log("CSV error: " + e.message, "err");
    notify("Token sheet error: " + e.message);
  }
}

function onMedia(files) {
  let accepted = 0;
  for (const f of files) {
    if (!validateArtifactFile(f)) continue;
    const base = f.name.replace(/\.[^.]+$/, "");
    mediaFiles.set(base, f);
    accepted++;
  }
  matchMedia_();
  renderTokens();
  log(`${accepted} artwork file(s) added (${mediaFiles.size} total)`);
}

function matchMedia_() {
  for (const t of state.tokens) {
    const f = mediaFiles.get(String(t.id));
    if (f) {
      if (t.fileName !== f.name || Number(t.mediaBytes || 0) !== f.size) {
        t.mediaCid = "";
        t.previewCid = "";
        t.previewMime = "";
        t.previewBytes = 0;
        t.metadataCid = "";
      }
      t.fileName = f.name;
      t.mediaBytes = f.size;
      t.mediaMime = f.type || "application/octet-stream";
    }
  }
}

function renderTokens() {
  const total = state.tokens.length;
  const withArt = state.tokens.filter((t) => t.fileName).length;
  const pinned = state.tokens.filter((t) => t.metadataCid).length;
  const policy = artifactSizePolicy();
  const averageOk = !policy.sizes.length || policy.averageBytes <= OBJKT_ARTIFACT_AVERAGE_BYTES;
  $("tokenSummary").innerHTML =
    `<span class="pill ${total ? "ok" : ""}">${total} tokens</span>` +
    `<span class="pill ${withArt === total && total ? "ok" : "warn"}">${withArt}/${total} artworks matched</span>` +
    `<span class="pill ${pinned === total && total ? "ok" : ""}">${pinned}/${total} pinned</span>` +
    `<span class="pill ${averageOk ? "ok" : "bad"}">avg ${sizeLabel(policy.averageBytes)} / 250 MB</span>`;

  const tbl = $("tokenTable");
  if (!total) { tbl.innerHTML = ""; return; }
  let html = "<tr><th></th><th>id</th><th>name</th><th>traits</th><th>artifact</th><th>IPFS</th></tr>";
  for (const t of state.tokens) {
    const f = mediaFiles.get(String(t.id));
    const img = f && f.type.startsWith("image/")
      ? `<img src="${URL.createObjectURL(f)}" alt="" />`
      : t.mediaCid
        ? `<img src="${MD.ipfsToHttp("ipfs://" + t.mediaCid, state.pin.gateway)}" alt="" />`
        : "·";
    const art = t.fileName
      ? `<span class="pill ok">${t.fileName}</span>`
      : `<span class="pill bad">missing artifact</span>`;
    const pin = t.metadataCid
      ? `<span class="pill ok">pinned</span>`
      : tokenNeedsMediaPreview(t) && t.mediaCid && !t.previewCid
        ? `<span class="pill warn">media pinned, token preview pending</span>`
        : t.previewCid
          ? `<span class="pill warn">media + preview pinned, metadata pending</span>`
          : t.mediaCid
            ? `<span class="pill warn">media pinned, metadata pending</span>`
            : `<span class="pill">—</span>`;
    html += `<tr><td>${img}</td><td class="mono">${t.id}</td><td>${esc(t.name)}</td><td class="muted">${t.attributes.length}</td><td>${art}</td><td>${pin}</td></tr>`;
  }
  tbl.innerHTML = html;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- IPFS pinning ----------
function pinProvider() {
  const kind = selectedPinKind();
  if (kind === "wtfos") return { kind: "wtfos" };
  return kind === "pinata"
    ? { kind: "pinata", jwt: state.pin.jwt }
    : { kind: "node", url: state.pin.url };
}

function royaltyShares() {
  const pct = Number(state.drop.royaltyPct || 0);
  const addr = state.drop.royaltyAddr || MD.getAccount();
  if (!pct || !addr) return null;
  // objkt-compatible: decimals 4 → 10% = 1000
  return { decimals: 4, shares: { [addr]: Math.round(pct * 100) } };
}

function blobFromCanvas(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob && blob.size > 0) resolve(blob);
      else reject(new Error(`Could not encode ${type} preview`));
    }, type, quality);
  });
}

function scaleCanvasForMedia(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

async function makeStillImagePreview(file, maxSide, type, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === "function") await img.decode();
    else await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error("Could not read media dimensions");
    const canvas = scaleCanvasForMedia(width, height, maxSide);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return blobFromCanvas(canvas, type, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function waitForMediaEvent(el, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      el.removeEventListener(eventName, onEvent);
      el.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not read media preview frame"));
    };
    el.addEventListener(eventName, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

async function makeStillVideoPreview(file, maxSide, type, quality) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    await waitForMediaEvent(video, "loadedmetadata");
    const duration = Number(video.duration || 0);
    if (Number.isFinite(duration) && duration > 0) {
      video.currentTime = Math.min(Math.max(0.1, duration * 0.12), Math.max(0.1, duration - 0.05));
      await waitForMediaEvent(video, "seeked").catch(() => undefined);
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("Could not read video dimensions");
    const canvas = scaleCanvasForMedia(width, height, maxSide);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return blobFromCanvas(canvas, type, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileLooksVideo(file) {
  return String(file?.type || "").toLowerCase().startsWith("video/") ||
    /\.(mp4|webm|mov)$/i.test(String(file?.name || ""));
}

function makeStillMediaImagePreview(file, maxSide, type, quality) {
  return fileLooksVideo(file)
    ? makeStillVideoPreview(file, maxSide, type, quality)
    : makeStillImagePreview(file, maxSide, type, quality);
}

async function makeStandaloneMediaPreview(file) {
  const attempts = [
    { side: OBJKT_TOKEN_PREVIEW_MAX_SIDE, type: "image/png", quality: 0.92, ext: "png" },
    { side: 640, type: "image/png", quality: 0.9, ext: "png" },
    { side: 480, type: "image/jpeg", quality: 0.86, ext: "jpg" },
    { side: 320, type: "image/jpeg", quality: 0.82, ext: "jpg" },
  ];
  let best = null;
  for (const attempt of attempts) {
    const blob = await makeStillMediaImagePreview(file, attempt.side, attempt.type, attempt.quality);
    const out = { blob, mime: blob.type || attempt.type, ext: attempt.ext };
    if (!best || blob.size < best.blob.size) best = out;
    if (blob.size <= OBJKT_TOKEN_PREVIEW_MAX_BYTES) return out;
  }
  return best;
}

async function makeHostedMediaPreview(file) {
  const fd = new FormData();
  fd.append("file", file, file.name || "source.media");
  const res = await MD.apiFetch("/api/macaroni/media-preview", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  if (!blob || blob.size <= 0) throw new Error("Hosted preview response was empty");
  if (blob.size > OBJKT_TOKEN_PREVIEW_MAX_BYTES)
    throw new Error(`Hosted preview was ${sizeLabel(blob.size)}, above ${OBJKT_TOKEN_PREVIEW_LABEL}`);
  return { blob, mime: blob.type || "image/gif", ext: "gif" };
}

async function makeMediaPreview(file) {
  try {
    return await makeHostedMediaPreview(file);
  } catch (err) {
    log("hosted token preview unavailable, using local still preview: " + (err.message || err), "warn");
    const fallback = await makeStandaloneMediaPreview(file);
    if (!fallback || !fallback.blob) throw new Error("Could not create token preview");
    return fallback;
  }
}

async function pinMediaPreview(provider, token, file, indexLabel) {
  if (!tokenNeedsMediaPreview(token) || token.previewCid) return;
  if (!file) {
    throw new Error(`token ${token.id} is media and needs its original file re-selected so Macaroni can create an OBJKT preview`);
  }
  $("pinStatus").textContent = `creating token preview ${token.id} (${indexLabel})…`;
  const preview = await makeMediaPreview(file);
  if (!preview || !preview.blob) throw new Error(`could not create preview for media token ${token.id}`);
  if (preview.blob.size > OBJKT_TOKEN_PREVIEW_MAX_BYTES) {
    throw new Error(
      `token ${token.id} preview is ${sizeLabel(preview.blob.size)}. ` +
      `token previews must be ≤${sizeLabel(OBJKT_TOKEN_PREVIEW_MAX_BYTES)} for OBJKT.`
    );
  }
  const base = String(file.name || `${token.id}.gif`).replace(/\.[^.]+$/, "");
  const name = `${base}-objkt-preview.${preview.ext || "gif"}`;
  $("pinStatus").textContent = `pinning token preview ${token.id} (${indexLabel})…`;
  token.previewCid = await MD.pinBlob(
    provider,
    preview.blob,
    name,
    makePinUploadProgress(`token preview ${token.id}`, preview.blob.size)
  );
  token.previewMime = preview.mime || preview.blob.type || "image/gif";
  token.previewBytes = preview.blob.size;
  token.metadataCid = "";
  save();
}

function buildTokenMetadata(t) {
  const creator = MD.getAccount() || state.drop.royaltyAddr || "";
  const artifact = "ipfs://" + t.mediaCid;
  const cover = state.drop.coverCid ? "ipfs://" + state.drop.coverCid : "";
  if (tokenNeedsMediaPreview(t) && !t.previewCid)
    throw new Error(`token ${t.id} needs a smaller token preview for OBJKT metadata`);
  if (tokenNeedsCover(t) && !cover) throw new Error(`token ${t.id} needs the collection cover for OBJKT preview metadata`);
  const display = t.previewCid ? "ipfs://" + t.previewCid : tokenNeedsCover(t) ? cover : artifact;
  const formats = [{ uri: artifact, mimeType: t.mediaMime }];
  if (display && display !== artifact)
    formats.push({ uri: display, mimeType: t.previewMime || state.drop.coverMime || "image/png" });
  const meta = {
    name: t.name,
    description: t.description || state.drop.description,
    decimals: 0,
    isBooleanAmount: true,
    symbol: state.drop.symbol || undefined,
    artifactUri: artifact,
    displayUri: display,
    thumbnailUri: display,
    minter: creator || undefined,
    creators: creator ? [creator] : undefined,
    formats,
    tags: t.tags && t.tags.length ? t.tags : undefined,
    attributes: t.attributes.length ? t.attributes : undefined,
  };
  const roy = royaltyShares();
  if (roy) meta.royalties = roy;
  Object.keys(meta).forEach((k) => meta[k] === undefined && delete meta[k]);
  return meta;
}

async function pinAll() {
  readForm();
  const provider = pinProvider();
  clearNotice();
  if (provider.kind === "pinata" && !provider.jwt) return notify("Enter your Pinata JWT first.", "err", "pinStatus");
  if (provider.kind === "node" && !provider.url) return notify("Enter your IPFS node API URL first.", "err", "pinStatus");
  if (!state.tokens.length) return notify("Upload your token sheet first.", "err", "pinStatus");
  const missing = state.tokens.filter((t) => !t.fileName && !t.mediaCid);
  if (missing.length) return notify(`${missing.length} token(s) have no artwork file. Every row needs an artifact.`, "err", "pinStatus");
  if (!state.drop.coverCid && !coverFile)
    return notify(`Add a collection logo/cover image (${OBJKT_COLLECTION_IMAGE_LABEL}) before pinning.`, "err", "pinStatus");
  if (state.drop.coverCid && state.drop.coverMime && !OBJKT_COLLECTION_IMAGE_MIME_TYPES.has(state.drop.coverMime))
    return notify(`Re-upload the collection logo/cover as ${OBJKT_COLLECTION_IMAGE_LABEL} before pinning.`, "err", "pinStatus");
  for (const t of state.tokens) {
    const f = mediaFiles.get(String(t.id));
    if (f && !validateArtifactFile(f)) return;
  }
  try {
    assertArtifactSizePolicy({ requireKnownSizes: true });
  } catch (e) {
    return notify(e.message, "err", "pinStatus");
  }
  // Royalties are baked into the pinned metadata — a missing receiver here
  // would silently ship 0% royalties forever.
  if (state.drop.royaltyAddr && !MD.isAddress(state.drop.royaltyAddr))
    return invalidAddressNotice("Royalty receiver", state.drop.royaltyAddr, "pinStatus");
  if (Number(state.drop.royaltyPct) > 0 && !state.drop.royaltyAddr && !MD.getAccount())
    return notify(
      `Royalties are set to ${state.drop.royaltyPct}% but there is no receiver: ` +
      "connect your wallet or fill in the royalty receiver before pinning, " +
      "otherwise the metadata is pinned without royalties — permanently.",
      "err",
      "pinStatus"
    );

  const btn = $("btnPin");
  btn.disabled = true;
  try {
    // cover image first
    if (coverFile && !state.drop.coverCid) {
      $("pinStatus").textContent = "pinning cover…";
      state.drop.coverCid = await MD.pinBlob(
        provider,
        coverFile,
        coverFile.name,
        makePinUploadProgress("cover", coverFile.size)
      );
      state.drop.coverMime = coverFile.type;
      save();
      log("cover pinned: " + state.drop.coverCid);
    }
    // delayed reveal: the cover doubles as the pre-reveal placeholder artwork
    if (state.drop.revealMode === "delayed" && !state.drop.placeholderCid) {
      if (!state.drop.coverCid)
        throw new Error("delayed reveal needs a cover image — it is shown on unrevealed tokens");
      $("pinStatus").textContent = "pinning placeholder…";
      const cover = "ipfs://" + state.drop.coverCid;
      const ph = {
        name: (state.drop.title || "Drop") + " — unrevealed",
        description:
          "This token has not been revealed yet. A random artwork from the collection will be assigned at reveal.",
        decimals: 0,
        isBooleanAmount: true,
        symbol: state.drop.symbol || undefined,
        artifactUri: cover,
        displayUri: cover,
        thumbnailUri: cover,
        formats: [{ uri: cover, mimeType: state.drop.coverMime || "image/png" }],
      };
      const roy = royaltyShares();
      if (roy) ph.royalties = roy;
      Object.keys(ph).forEach((k) => ph[k] === undefined && delete ph[k]);
      state.drop.placeholderCid = await MD.pinJson(provider, ph, "placeholder.json");
      save();
      log("placeholder pinned: " + state.drop.placeholderCid);
    }
    const todo = state.tokens.filter((t) => !t.metadataCid);
    let done = 0;
    for (const t of todo) {
      const f = mediaFiles.get(String(t.id));
      if (!t.mediaCid) {
        if (!f) throw new Error(`artwork file for token ${t.id} is not loaded (re-select your files)`);
        const mediaLabel = `media ${t.id} (${done + 1}/${todo.length})`;
        $("pinStatus").textContent = `pinning ${mediaLabel}…`;
        t.mediaCid = await MD.pinBlob(provider, f, f.name, makePinUploadProgress(mediaLabel, f.size));
        save();
      }
      if (tokenNeedsMediaPreview(t) && !t.previewCid) {
        await pinMediaPreview(provider, t, f, `${done + 1}/${todo.length}`);
      }
      $("pinStatus").textContent = `pinning metadata ${t.id} (${done + 1}/${todo.length})…`;
      t.metadataCid = await MD.pinJson(provider, buildTokenMetadata(t), `${t.id}.json`);
      save();
      done++;
      $("pinBar").style.width = Math.round((done / todo.length) * 100) + "%";
      if (done % 10 === 0) renderTokens();
    }
    $("pinBar").style.width = "100%";
    $("pinStatus").textContent = "all pinned ✓";
    renderTokens();
    log(`pinning complete: ${state.tokens.length} tokens`);
  } catch (e) {
    $("pinStatus").textContent = "error — see log";
    log("pinning failed: " + e.message, "err");
    notify("Pinning failed: " + e.message, "err", "pinStatus");
  } finally {
    btn.disabled = false;
  }
}

// ---------- stages ----------
function setStageStatus(i, msg, cls = "muted") {
  const el = $("stagesEditor").querySelector(`[data-stage-status="${i}"]`);
  if (!el) return;
  el.textContent = msg;
  el.className = cls;
}

function readStageInputs(i) {
  const stage = state.stages[i];
  if (!stage) return false;
  $("stagesEditor").querySelectorAll(`[data-i="${i}"][data-f]`).forEach((el) => {
    stage[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
  });
  return true;
}

function saveStage(i, msg = "stage saved") {
  if (!readStageInputs(i)) return;
  save();
  setStageStatus(i, msg, "ok");
  log(`stage ${i + 1}: settings saved`);
}

function renderStages() {
  const host = $("stagesEditor");
  host.innerHTML = "";
  state.stages.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "panel";
    div.style.margin = "10px 0";
    div.innerHTML = `
      <div class="spread">
        <div class="row" style="gap:8px"><h3 style="margin:0">Stage ${i + 1}</h3><span class="muted" data-stage-status="${i}">saved</span></div>
        <div class="row" style="gap:8px">
          <button class="btn small" data-stage-save="${i}" type="button">Save stage</button>
          <button class="btn danger small" data-del="${i}" type="button">remove</button>
        </div>
      </div>
      <div class="grid3">
        <div><label>Start (your local time)</label>
          <input type="datetime-local" data-f="start" data-i="${i}" value="${s.start || ""}" /></div>
        <div><label>Price (ꜩ, up to 6 decimals)</label>
          <input type="number" min="0" step="0.000001" data-f="price" data-i="${i}" value="${s.price ?? ""}" /></div>
        <div><label>Max per wallet (blank = unlimited)</label>
          <input type="number" min="1" step="1" data-f="maxPerWallet" data-i="${i}" value="${s.maxPerWallet ?? ""}" /></div>
      </div>
      <div class="row" style="margin-top:8px">
        <label style="margin:0"><input type="checkbox" data-f="useAllowlist" data-i="${i}" ${s.useAllowlist ? "checked" : ""}/> allowlist only</label>
        <input type="file" accept=".csv" data-allow="${i}" style="width:auto" />
        <span class="pill ${s.allowlist?.length ? "ok" : ""}">${s.allowlist?.length || 0} addresses</span>
      </div>`;
    host.appendChild(div);
  });
  host.querySelectorAll("[data-f]").forEach((el) => {
    el.addEventListener("change", () => {
      const i = +el.dataset.i;
      readStageInputs(i);
      save();
      setStageStatus(i, "edited", "warn");
    });
  });
  host.querySelectorAll("[data-stage-save]").forEach((el) =>
    el.addEventListener("click", () => saveStage(+el.dataset.stageSave))
  );
  host.querySelectorAll("[data-del]").forEach((el) =>
    el.addEventListener("click", () => {
      state.stages.splice(+el.dataset.del, 1);
      save();
      renderStages();
    })
  );
  host.querySelectorAll("[data-allow]").forEach((el) =>
    el.addEventListener("change", async () => {
      const i = +el.dataset.allow;
      const file = el.files[0];
      if (!file) return;
      try {
        state.stages[i].allowlist = await parseAllowlist(file);
        state.stages[i].useAllowlist = true;
        save();
        renderStages();
        setStageStatus(i, "allowlist saved", "ok");
        log(`stage ${i + 1}: allowlist with ${state.stages[i].allowlist.length} addresses`);
      } catch (e) {
        notify("Allowlist error: " + e.message);
      }
    })
  );
}

async function parseAllowlist(file) {
  const rows = await MD.parseCsvRows(file);
  const out = [];
  for (const r of rows) {
    const addr = String(r[0] || "").replace(/^\ufeff/, "").trim();
    if (!addr || addr.toLowerCase() === "address") continue;
    if (!/^(tz1|tz2|tz3|tz4|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr))
      throw new Error("invalid address: " + addr);
    const cap = parseInt(r[1], 10);
    out.push({ address: addr, capacity: Number.isInteger(cap) && cap > 0 ? cap : 1 });
  }
  if (!out.length) throw new Error("no valid rows found");
  return out;
}

// ---------- deploy & sync ----------
const CHUNK = 40;

function tezToMutez(t) {
  return Math.round(parseFloat(t || "0") * 1_000_000);
}

function stageRecords() {
  const sorted = [...state.stages].sort((a, b) => new Date(a.start) - new Date(b.start));
  return sorted.map((s, i) => {
    if (!s.start) throw new Error(`stage ${i + 1}: missing start time`);
    if (s.price === "" || s.price == null) throw new Error(`stage ${i + 1}: missing price`);
    return {
      key: i,
      value: {
        start: new Date(s.start).toISOString(),
        price: tezToMutez(s.price),
        use_allowlist: !!s.useAllowlist,
        max_per_wallet: s.maxPerWallet ? Number(s.maxPerWallet) : null,
      },
      allowlist: s.allowlist || [],
    };
  });
}

function tokenInfoUri(tokenInfo) {
  if (!tokenInfo) return "";
  const hex = typeof tokenInfo.get === "function" ? tokenInfo.get("") : tokenInfo[""];
  if (!hex) return "";
  try {
    return MD.hexToUtf8(hex);
  } catch (_) {
    return "";
  }
}

async function buildContractMetadataCid() {
  const provider = pinProvider();
  const meta = {
    name: state.drop.title,
    description: state.drop.description,
    version: "1.0.0",
    authors: [MD.getAccount() || ""],
    homepage: "",
    interfaces: ["TZIP-012", "TZIP-016", "TZIP-021"],
    imageUri: state.drop.coverCid ? "ipfs://" + state.drop.coverCid : undefined,
  };
  Object.keys(meta).forEach((k) => meta[k] === undefined && delete meta[k]);
  return MD.pinJson(provider, meta, "contract_metadata.json");
}

async function deploy() {
  try {
    readForm();
    clearNotice();
    if (!MD.getAccount()) return notify("Connect your wallet first.", "err", "deployStatus");
    if (!state.drop.title || !state.drop.description) return notify("Title and description are required.", "err", "deployStatus");
    if (!state.tokens.length) return notify("Upload tokens first.", "err", "deployStatus");
    if (state.tokens.some((t) => !t.metadataCid)) return notify("Pin all media + metadata first (step 4).", "err", "deployStatus");
    try {
      assertArtifactSizePolicy({ requireKnownSizes: true });
    } catch (e) {
      return notify(e.message, "err", "deployStatus");
    }
    if (!state.stages.length) return notify("Configure at least one sale stage (step 5).", "err", "deployStatus");
    if (state.drop.treasuryAddr && !MD.isAddress(state.drop.treasuryAddr))
      return invalidAddressNotice("Treasury", state.drop.treasuryAddr, "deployStatus");
    const delayed = state.drop.revealMode === "delayed";
    const delayDays = Number(state.drop.revealDelayDays);
    if (delayed && (!Number.isFinite(delayDays) || delayDays < 0 || delayDays > 30))
      return notify("Auto-reveal window must be between 0 and 30 days.", "err", "deployStatus");
    if (delayed && !state.drop.placeholderCid)
      return notify("Pin all media + metadata first (step 4) — delayed reveal also pins the placeholder.", "err", "deployStatus");
    const stages = stageRecords(); // validates

    // Hard guard: RPC chain id + wallet session must both match the selected
    // network before anything signs.
    $("deployStatus").textContent = "verifying network…";
    await MD.assertOperationSafety();

    const btn = $("btnDeploy");
    btn.disabled = true;
    $("deployStatus").textContent = "pinning contract metadata…";
    if (!state.drop.contractMetaCid) {
      state.drop.contractMetaCid = await buildContractMetadataCid();
      save();
      log("contract metadata pinned: " + state.drop.contractMetaCid);
    }

    $("deployStatus").textContent = "loading contract code…";
    const code = await (await fetch("contract/mydrop.contract.json")).json();

    const me = MD.getAccount();
    const M = TZ.MichelsonMap;
    const metadataMap = new M();
    metadataMap.set("", MD.utf8ToHex("ipfs://" + state.drop.contractMetaCid));
    const placeholderMap = new M();
    if (delayed)
      placeholderMap.set("", MD.utf8ToHex("ipfs://" + state.drop.placeholderCid));

    const storage = {
      administrator: me,
      pending_administrator: null,
      treasury: state.drop.treasuryAddr || me,
      metadata: metadataMap,
      ledger: new M(),
      operators: new M(),
      token_metadata: new M(),
      pending_tokens: new M(),
      slots: new M(),
      supply: 0,
      minted: 0,
      seed_salt: "00",
      stages: new M(),
      allowlist: new M(),
      stage_minted: new M(),
      locked: false,
      paused: false,
      delayed_reveal: delayed,
      placeholder: placeholderMap,
      reveal_delay: delayed ? Math.round(delayDays * 86400) : 604800,
      unrevealed_since: null,
      revealed: 0,
      entropy: "00",
    };

    $("deployStatus").textContent = "waiting for wallet signature…";
    log("originating contract…");
    const tezos = MD.getToolkit();
    const op = await tezos.wallet.originate({ code, storage }).send();
    $("deployStatus").textContent = "waiting for confirmation…";
    const contract = await op.contract();
    state.contract = contract.address;
    $("contractAddr").value = contract.address;
    save();
    $("deployStatus").textContent = "deployed ✓";
    $("btnSync").disabled = false;
    log("contract deployed at " + contract.address);
    log("explorer: " + MD.explorerUrl(state.network, contract.address));
  } catch (e) {
    $("deployStatus").textContent = "deploy failed";
    log("deploy failed: " + (e.message || JSON.stringify(e)), "err");
    notify("Deploy failed: " + (e.message || e), "err", "deployStatus");
  } finally {
    $("btnDeploy").disabled = false;
  }
}

async function sync() {
  try {
    readForm();
    const kt = $("contractAddr").value.trim() || state.contract;
    clearNotice();
    if (!kt) return notify("Deploy first, or paste an existing contract address.", "err", "deployStatus");
    if (!isValidKt1Address(kt))
      return notify("Contract address must be a KT1… address.", "err", "deployStatus");
    state.contract = kt;
    save();
    if (state.tokens.length && state.tokens.some((t) => !t.metadataCid))
      return notify("Pin all local token metadata before syncing token changes.", "err", "deployStatus");
    if (state.tokens.length) {
      try {
        assertArtifactSizePolicy({ requireKnownSizes: true });
      } catch (e) {
        return notify(e.message, "err", "deployStatus");
      }
    }

    await MD.assertOperationSafety();
    const tezos = MD.getToolkit();
    const c = await tezos.wallet.at(kt);
    const st = await (await tezos.contract.at(kt)).storage();
    const already = Number(st.supply);
    log(`sync: contract has ${already}/${state.tokens.length} tokens loaded`);

    const M = TZ.MichelsonMap;
    const batchify = (t) => {
      const info = new M();
      info.set("", MD.utf8ToHex("ipfs://" + t.metadataCid));
      return { token_id: t.id - 1, token_info: info };
    };

    if (state.tokens.length && already > state.tokens.length)
      return notify(
        `This contract already has ${already} token(s) loaded, but your CSV has ` +
        `${state.tokens.length}. Re-import the full CSV before syncing token changes.`,
        "err",
        "deployStatus"
      );

    const replaceTodo = [];
    if (state.tokens.length && !st.locked) {
      const existing = state.tokens.filter((t) => t.id - 1 < already);
      for (const t of existing) {
        const desired = "ipfs://" + t.metadataCid;
        const current = tokenInfoUri(await st.pending_tokens.get(t.id - 1));
        if (current !== desired) replaceTodo.push(t);
      }
    } else if (state.tokens.length && st.locked) {
      log("sync: sale is locked; existing token metadata cannot be replaced");
    }

    const todo = state.tokens.filter((t) => t.id - 1 >= already);
    const stages = stageRecords();
    const entries = [];
    for (const s of stages)
      for (const a of s.allowlist)
        entries.push({ stage: s.key, holder: a.address, capacity: a.capacity });

    const totalSteps = Math.max(
      1,
      Math.ceil(replaceTodo.length / CHUNK) +
        Math.ceil(todo.length / CHUNK) +
        1 +
        (entries.length ? Math.ceil(entries.length / 200) : 1)
    );
    let step = 0;
    const bump = () => { $("syncBar").style.width = Math.round((++step / totalSteps) * 100) + "%"; };

    for (let i = 0; i < replaceTodo.length; i += CHUNK) {
      const chunk = replaceTodo.slice(i, i + CHUNK).map(batchify);
      log(`replace_tokens ${chunk[0].token_id}…${chunk[chunk.length - 1].token_id} (${chunk.length}) — approve in wallet`);
      const op = await MD.sendWalletOp(c.methodsObject.replace_tokens(chunk), {}, { gasPerUnit: 180_000, units: chunk.length });
      await op.confirmation(1);
      bump();
    }

    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK).map(batchify);
      log(`add_tokens ${chunk[0].token_id}…${chunk[chunk.length - 1].token_id} (${chunk.length}) — approve in wallet`);
      const op = await MD.sendWalletOp(c.methodsObject.add_tokens(chunk), {}, { gasPerUnit: 180_000, units: chunk.length });
      await op.confirmation(1);
      bump();
    }

    const sm = new M();
    for (const s of stages) sm.set(s.key, s.value);
    log("set_stages (" + stages.length + ")");
    const opS = await MD.sendWalletOp(c.methodsObject.set_stages(sm), {}, { gasPerUnit: 120_000, units: stages.length });
    await opS.confirmation(1);
    bump();

    if (entries.length) {
      for (let i = 0; i < entries.length; i += 200) {
        const chunk = entries.slice(i, i + 200);
        log(`set_allowlist ${i}…${i + chunk.length - 1}`);
        const op = await MD.sendWalletOp(c.methodsObject.set_allowlist(chunk), {}, { gasPerUnit: 80_000, units: chunk.length });
        await op.confirmation(1);
        bump();
      }
    } else {
      bump();
    }
    $("syncBar").style.width = "100%";
    $("deployStatus").textContent = "in sync ✓";
    log("sync complete — your drop is live on-chain.");
    log("objkt collection (mainnet only): " + MD.objktUrl(state.network, kt));
    log("tip: Save studio backup (Resume panel) so you can restore this draft later.");
  } catch (e) {
    log("sync failed: " + (e.message || JSON.stringify(e)), "err");
    notify("Sync failed: " + (e.message || e) + " Click Sync again to resume.", "err", "deployStatus");
  }
}

// Admin reveal: assign artworks to all unrevealed blanks, in 50-token batches.
async function revealMinted() {
  const btn = $("btnReveal");
  try {
    readForm();
    const kt = $("contractAddr").value.trim() || state.contract;
    clearNotice();
    if (!kt) return notify("Deploy first, or paste your contract address.", "err", "deployStatus");
    await MD.assertOperationSafety();
    btn.disabled = true;
    const tezos = MD.getToolkit();
    const c = await tezos.wallet.at(kt);
    for (;;) {
      const st = await (await tezos.contract.at(kt)).storage();
      const pending = Number(st.minted) - Number(st.revealed);
      if (pending <= 0) break;
      const n = Math.min(50, pending);
      $("deployStatus").textContent = `revealing ${n} of ${pending} pending…`;
      log(`reveal(${n}) — ${pending} unrevealed`);
      const op = await MD.sendWalletOp(c.methodsObject.reveal(n), {}, { gasPerUnit: 420_000, units: n });
      await op.confirmation(1);
    }
    $("deployStatus").textContent = "all revealed ✓";
    log("reveal complete — every minted token has its artwork.");
  } catch (e) {
    log("reveal failed: " + (e.message || JSON.stringify(e)), "err");
    notify("Reveal failed: " + (e.message || e), "err", "deployStatus");
  } finally {
    btn.disabled = false;
  }
}

// ---------- page design / export ----------
function buildConfig() {
  readForm();
  return sanitizeDropConfig({
    network: state.network,
    rpc: state.rpc || MD.getNetworks()[state.network].rpc,
    contract: $("contractAddr").value.trim() || state.contract,
    title: state.drop.title,
    description: state.drop.description,
    cover: state.drop.coverCid ? "ipfs://" + state.drop.coverCid : "",
    gateway: state.pin.gateway || MD.DEFAULT_GATEWAY,
    theme: {
      name: state.page.theme,
      accent: state.page.accent,
      font: state.page.font,
      customCss: "",
    },
    blocks: state.page.blocks
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(h|p|img):\s*(.*)$/i);
        return m ? { type: m[1].toLowerCase(), value: m[2] } : { type: "p", value: l };
      }),
  });
}

// ---------- code editor (drop.config.js) ----------
const CODE_PREFIX = "window.DROP_CONFIG = ";

function parseCode(text) {
  let body = text.trim();
  const eq = body.indexOf("=");
  if (body.startsWith("window.DROP_CONFIG") && eq !== -1) body = body.slice(eq + 1);
  body = body.trim().replace(/;\s*$/, "");
  const cfg = JSON.parse(body);
  if (!cfg || typeof cfg !== "object") throw new Error("config must be an object");
  return cfg;
}

/* The code box overrides the visual controls when it holds a valid edit;
   touching the controls regenerates it. */
function currentConfig() {
  if (state.page.code) {
    try {
      return sanitizeDropConfig(parseCode(state.page.code));
    } catch (e) { /* stale override — fall back to controls */ }
  }
  return buildConfig();
}

function syncCodeFromForm() {
  state.page.code = "";
  $("pageCode").value = CODE_PREFIX + JSON.stringify(buildConfig(), null, 2) + ";\n";
  $("codeStatus").textContent = "generated from controls";
  save();
}

function onCodeEdit() {
  const text = $("pageCode").value;
  try {
    parseCode(text);
    state.page.code = text;
    $("codeStatus").textContent = "✓ valid — overriding controls (preview & export use this)";
    save();
    refreshPreview();
  } catch (e) {
    $("codeStatus").textContent = "✗ " + e.message;
  }
}

// ---------- live preview ----------
let previewTimer = null;
function refreshPreview(immediate) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    localStorage.setItem("macaroni.preview", JSON.stringify(currentConfig()));
    const frame = $("previewFrame");
    if (!frame.src) frame.src = frame.dataset.src;
    else frame.contentWindow.location.reload();
  }, immediate ? 0 : 400);
}

function showView(view) {
  const page = view === "page";
  $("viewDrop").style.display = page ? "none" : "";
  $("viewPage").style.display = page ? "" : "none";
  $("tabDrop").classList.toggle("active", !page);
  $("tabPage").classList.toggle("active", page);
  $("tabDrop").setAttribute("aria-selected", page ? "false" : "true");
  $("tabPage").setAttribute("aria-selected", page ? "true" : "false");
  $("tabDrop").tabIndex = page ? -1 : 0;
  $("tabPage").tabIndex = page ? 0 : -1;
  if (page) {
    $("pageCode").value = state.page.code || CODE_PREFIX + JSON.stringify(buildConfig(), null, 2) + ";\n";
    $("codeStatus").textContent = state.page.code ? "✓ custom code active" : "generated from controls";
    refreshPreview(true);
  }
}

function activateWorkspaceTab(view) {
  showView(view);
  $(view === "page" ? "tabPage" : "tabDrop").focus();
}

function onWorkspaceTabKey(e) {
  if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "End") {
    e.preventDefault();
    activateWorkspaceTab("page");
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Home") {
    e.preventDefault();
    activateWorkspaceTab("drop");
  }
}

// ---------- export ----------
function configJs() {
  const cfg = currentConfig();
  if (!cfg.contract) {
    notify("No contract address set — exporting a draft mint site.", "warn", "exportStatus");
  }
  return CODE_PREFIX + JSON.stringify(cfg, null, 2) + ";\n";
}

function assertWtfOSPublishReady(cfg) {
  const contract = String(cfg?.contract || "").trim();
  if (!isValidKt1Address(contract)) {
    throw new Error("Deploy or resume a KT1 contract before publishing to wtfOS.");
  }
  return { ...cfg, contract };
}

function setExportStatus(msg, ok) {
  const el = $("exportStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = ok === "warn" ? "warn" : ok ? "ok" : "err";
}

async function exportSite() {
  const body = configJs();
  if (body === null) return;
  setExportStatus("Exporting…", true);
  $("btnExport").disabled = true;
  let wroteFolder = false;
  try {
    const r = await fetch("/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: body }),
    });
    let j;
    try {
      j = await r.json();
    } catch (_) {
      throw new Error("server did not return JSON — run the app via serve.py / serve.command");
    }
    if (!j.ok) throw new Error(j.error || "export failed");
    wroteFolder = true;
    log("Website written to " + j.path);
  } catch (e) {
    log("folder export: " + e.message + " — downloading zip instead", wroteFolder ? "err" : "");
  }
  try {
    await MDSiteBundle.downloadSiteZip(body, "macaroni-site.zip");
    const msg = wroteFolder
      ? "Exported to site/ folder and macaroni-site.zip downloaded (includes wallet connect)."
      : "Downloaded macaroni-site.zip — unzip and upload; includes index.html, drop.config.js, and wallet stack.";
    setExportStatus(msg, true);
    log(msg);
  } catch (e) {
    setExportStatus("Export failed: " + e.message, false);
    log("export failed: " + e.message, "err");
    notify("Export failed: " + e.message, "err", "exportStatus");
  } finally {
    $("btnExport").disabled = false;
  }
}

async function publishWtfOSSite() {
  if (!canUseWtfosPinning)
    return notify("wtfOS publishing is available only to trusted creators. Export the site package for your own host.", "err", "exportStatus");
  let cfg;
  try {
    cfg = assertWtfOSPublishReady(currentConfig());
  } catch (e) {
    const message = (e && e.message) || "Deploy or resume a KT1 contract before publishing to wtfOS.";
    notify(message, "err", "exportStatus");
    log("wtfOS publish blocked: " + message, "err");
    return;
  }
  setExportStatus("Publishing to wtfOS…", true);
  $("btnPublishWtfOS").disabled = true;
  try {
    const r = await MD.apiFetch("/api/macaroni/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: cfg }),
    });
    let j;
    try {
      j = await r.json();
    } catch (_) {
      throw new Error("server did not return JSON");
    }
    if (!r.ok || !j.ok) throw new Error(j.error || "publish failed");
    const pendingReason = j.publishStatus === "pending_pds_delivery"
      ? "PDS delivery is still catching up"
      : ".me serving is still catching up";
    const msg = j.live === false
      ? `Published in wtfOS; ${pendingReason}. ${j.url}`
      : `Published to ${j.url}`;
    setExportStatus(msg, j.live === false ? "warn" : true);
    log(msg);
  } catch (e) {
    setExportStatus("wtfOS publish failed: " + e.message, false);
    log("wtfOS publish failed: " + e.message, "err");
    notify("wtfOS publish failed: " + e.message, "err", "exportStatus");
  } finally {
    $("btnPublishWtfOS").disabled = false;
  }
}

function setInstallerLink(platform, item) {
  const btn = $(platform.id);
  if (!btn) return;
  const available = item && item.available && item.url;
  btn.textContent = item?.label || platform.label;
  btn.classList.toggle("disabled", !available);
  btn.setAttribute("aria-disabled", available ? "false" : "true");
  if (available) {
    btn.href = item.url;
    btn.download = item.fileName || "";
    btn.removeAttribute("tabindex");
  } else {
    btn.removeAttribute("href");
    btn.removeAttribute("download");
    btn.tabIndex = -1;
  }
}

async function refreshInstallerDownloads() {
  if (IS_NATIVE_APP) {
    const section = $("secInstallers");
    if (section) section.hidden = true;
    return;
  }
  const status = $("installerStatus");
  try {
    const res = await MD.apiFetch("/api/macaroni/installers");
    if (!res.ok) throw new Error(res.status === 401 ? "sign in to view installer downloads" : `installer manifest unavailable (${res.status})`);
    const json = await res.json();
    const byKey = new Map((json.installers || []).map((item) => [item.key, item]));
    let available = 0;
    for (const platform of INSTALLER_PLATFORMS) {
      const item = byKey.get(platform.key) || { key: platform.key, label: platform.label, available: false };
      if (item.available) available++;
      setInstallerLink(platform, item);
    }
    if (status) {
      status.textContent = available
        ? `${available} desktop installer package${available === 1 ? "" : "s"} available.`
        : "Desktop installer packages are not published yet. Export the website package for self-hosting today.";
      status.className = available ? "ok" : "muted";
    }
  } catch (e) {
    for (const platform of INSTALLER_PLATFORMS)
      setInstallerLink(platform, { key: platform.key, label: platform.label, available: false });
    if (status) {
      status.textContent = "Installer downloads unavailable: " + e.message;
      status.className = "muted";
    }
  }
}

async function downloadSitePackage(body) {
  body = body ?? configJs();
  if (body === null) return;
  setExportStatus("Building site package…", true);
  try {
    await MDSiteBundle.downloadSiteZip(body, "macaroni-site.zip");
    const blob = new Blob([body], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "drop.config.js";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    const msg =
      "Downloaded macaroni-site.zip (full mint site + wallet connect) and drop.config.js.";
    setExportStatus(msg, true);
    log(msg);
  } catch (e) {
    setExportStatus("Package download failed: " + e.message, false);
    log("package download failed: " + e.message, "err");
    notify("Package download failed: " + e.message, "err", "exportStatus");
  }
}

function previewPage() {
  localStorage.setItem("macaroni.preview", JSON.stringify(currentConfig()));
  window.open("drop.html?preview=1", "_blank");
}

// ---------- form <-> state ----------
function readForm() {
  state.drop.title = $("dropTitle").value.trim();
  state.drop.symbol = $("dropSymbol").value.trim();
  state.drop.description = $("dropDesc").value.trim();
  state.drop.royaltyPct = Number($("royaltyPct").value);
  state.drop.royaltyAddr = normalizeOptionalAddress($("royaltyAddr").value);
  state.drop.treasuryAddr = normalizeOptionalAddress($("treasuryAddr").value);
  if ($("royaltyAddr").value.trim() !== state.drop.royaltyAddr) $("royaltyAddr").value = state.drop.royaltyAddr;
  if ($("treasuryAddr").value.trim() !== state.drop.treasuryAddr) $("treasuryAddr").value = state.drop.treasuryAddr;
  state.drop.revealMode = $("revealMode").value;
  state.drop.revealDelayDays = Number($("revealDelay").value || 7);
  const pinKind = $("pinKind").value;
  state.pin.kind = pinKindAllowed(pinKind) ? pinKind : fallbackPinKind();
  state.pin.jwt = $("pinJwt").value.trim();
  state.pin.url = $("pinUrl").value.trim();
  state.pin.gateway = $("gateway").value.trim();
  state.page.theme = $("pageTheme").value;
  state.page.accent = sanitizeCssColor($("pageAccent").value);
  state.page.font = sanitizeFontStack($("pageFont").value);
  state.page.blocks = $("pageBlocks").value;
  state.page.css = "";
  save();
  toggleRevealFields();
}

function toggleRevealFields() {
  const delayed = state.drop.revealMode === "delayed";
  $("revealDelayWrap").style.display = delayed ? "" : "none";
  $("revealHint").style.display = delayed ? "" : "none";
  $("btnReveal").style.display = delayed ? "" : "none";
}

function fillForm() {
  if (!["wtfos", "pinata", "node"].includes(state.pin.kind)) state.pin.kind = fallbackPinKind();
  state.drop.royaltyAddr = normalizeOptionalAddress(state.drop.royaltyAddr);
  state.drop.treasuryAddr = normalizeOptionalAddress(state.drop.treasuryAddr);
  $("network").value = state.network;
  $("rpc").value = state.rpc;
  $("dropTitle").value = state.drop.title;
  $("dropSymbol").value = state.drop.symbol;
  $("dropDesc").value = state.drop.description;
  $("royaltyPct").value = String(state.drop.royaltyPct);
  $("royaltyAddr").value = state.drop.royaltyAddr;
  $("treasuryAddr").value = state.drop.treasuryAddr;
  $("revealMode").value = state.drop.revealMode || "instant";
  $("revealDelay").value = String(state.drop.revealDelayDays ?? 7);
  toggleRevealFields();
  $("pinJwt").value = state.pin.jwt;
  $("pinUrl").value = state.pin.url;
  $("gateway").value = state.pin.gateway;
  renderPinKindOptions();
  $("contractAddr").value = state.contract;
  state.page.theme = sanitizeThemeName(state.page.theme);
  state.page.accent = sanitizeCssColor(state.page.accent);
  state.page.font = sanitizeFontStack(state.page.font);
  state.page.css = "";
  $("pageTheme").value = state.page.theme;
  $("pageAccent").value = state.page.accent;
  $("pageFont").value = state.page.font;
  $("pageBlocks").value = state.page.blocks;
  $("pageCss").value = state.page.css;
  if (state.contract) $("btnSync").disabled = false;
  if (state.drop.coverCid)
    $("coverPreview").innerHTML =
      `<img src="${MD.ipfsToHttp("ipfs://" + state.drop.coverCid, state.pin.gateway)}" style="max-width:160px;border-radius:8px" />`;
}

function togglePinFields() {
  const pinata = $("pinKind").value === "pinata";
  const node = $("pinKind").value === "node";
  $("pinJwtWrap").style.display = pinata ? "" : "none";
  $("pinUrlWrap").style.display = node ? "" : "none";
}

// ---------- resume existing drop ----------
function setResumeStatus(msg, ok) {
  const el = $("resumeStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = ok ? "ok" : "muted";
}

function applyImportedConfig(cfg) {
  if (cfg.network) state.network = cfg.network;
  if (cfg.rpc) state.rpc = cfg.rpc;
  if (cfg.contract) state.contract = cfg.contract;
  if (cfg.title) state.drop.title = cfg.title;
  if (cfg.description) state.drop.description = cfg.description;
  if (cfg.gateway) state.pin.gateway = cfg.gateway;
  if (cfg.theme) {
    state.page.theme = sanitizeThemeName(cfg.theme.name || state.page.theme);
    state.page.accent = sanitizeCssColor(cfg.theme.accent);
    state.page.font = sanitizeFontStack(cfg.theme.font);
    state.page.css = "";
  }
  if (Array.isArray(cfg.blocks))
    state.page.blocks = cfg.blocks
      .map((b) => (b.type && b.value != null ? `${b.type}: ${b.value}` : ""))
      .filter(Boolean)
      .join("\n");
}

function parseDropConfigText(text) {
  const trimmed = text.trim();
  const m = trimmed.match(/DROP_CONFIG\s*=\s*([\s\S]+?);?\s*$/);
  return JSON.parse(m ? m[1] : trimmed);
}

async function loadFromChain(kt) {
  kt = (kt || $("resumeAddr").value.trim() || $("contractAddr").value.trim()).trim();
  if (!isValidKt1Address(kt))
    return notify("Enter a valid KT1… contract address.", "err", "resumeStatus");
  readForm();
  applyNetwork();
  setResumeStatus("Loading on-chain status…", true);
  try {
    const { storage, metadata } = await MD.fetchContractStatus(state.network, kt);
    state.contract = kt;
    $("contractAddr").value = kt;
    $("resumeAddr").value = kt;
    if (metadata?.name) state.drop.title = metadata.name;
    if (metadata?.description) state.drop.description = metadata.description;
    state.drop.revealMode = storage.delayed_reveal ? "delayed" : "instant";
    if (storage.reveal_delay != null)
      state.drop.revealDelayDays = Math.round(Number(storage.reveal_delay) / 86400);
    const loaded = Number(storage.supply || 0);
    const sold = Number(storage.minted || 0);
    const locked = !!storage.locked;
    $("btnSync").disabled = false;
    save();
    fillForm();
    syncCodeFromForm();
    const localNote = state.tokens.length
      ? `${state.tokens.length} token row(s) in this draft.`
      : "Re-import CSV + artwork if you need to edit token metadata or stages.";
    const msg =
      `Resumed ${kt}: ${loaded} token(s) loaded on-chain, ${sold} minted` +
      (locked ? ", sale locked" : "") +
      `. ${localNote} Connect wallet → Sync to push stages/allowlists, or export your mint site.`;
    setResumeStatus(msg, true);
    log(msg);
    return { loaded, sold, locked };
  } catch (e) {
    setResumeStatus("Could not load contract: " + e.message, false);
    log("resume failed: " + e.message, "err");
    notify("Could not load contract: " + e.message, "err", "resumeStatus");
    return null;
  }
}

async function importConfigFile(file) {
  try {
    const cfg = parseDropConfigText(await file.text());
    applyImportedConfig(cfg);
    $("network").value = state.network;
    save();
    fillForm();
    applyNetwork();
    syncCodeFromForm();
    log("Imported " + file.name);
    if (state.contract) await loadFromChain(state.contract);
    else setResumeStatus("Imported config — paste or deploy a contract address to continue.", true);
  } catch (e) {
    notify("Could not read drop.config.js: " + e.message, "err", "resumeStatus");
  }
}

async function importStudioBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    const draft = data.state || data;
    if (!draft || typeof draft !== "object") throw new Error("missing state object");
    replaceState(draft);
    save();
    fillForm();
    applyNetwork();
    renderTokens();
    renderStages();
    syncCodeFromForm();
    if (state.contract) await loadFromChain(state.contract);
    else setResumeStatus("Studio backup restored.", true);
    log("Imported studio backup " + file.name);
  } catch (e) {
    notify("Could not read backup: " + e.message, "err", "resumeStatus");
  }
}

function saveStudioBackup() {
  readForm();
  const blob = new Blob(
    [JSON.stringify({ version: 1, saved: new Date().toISOString(), state }, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "macaroni-studio-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  log("Studio backup saved — store this alongside your CSV and artwork.");
}

function clearProjectFilesAndStatus() {
  mediaFiles.clear();
  coverFile = null;
  ["csvFile", "mediaFiles", "coverFile", "importConfig", "importBackup"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });
  $("coverPreview").innerHTML = "";
  $("pinBar").style.width = "0%";
  setStatus("pinStatus", "", "muted");
  setStatus("deployStatus", "", "muted");
  setStatus("exportStatus", "", "muted");
  $("log").textContent = "";
}

function startNewDrop() {
  clearNotice();
  replaceState(freshDropState());
  localStorage.removeItem(STORE_KEY);
  clearProjectFilesAndStatus();
  fillForm();
  applyNetwork();
  renderTokens();
  renderStages();
  $("resumeAddr").value = "";
  $("btnSync").disabled = true;
  syncCodeFromForm();
  showView("drop");
  setResumeStatus("New drop started. Import backup JSON any time to restore a saved project.", true);
  log("New drop slate started; wallet session unchanged.");
}

async function refreshResumeStatusIfNeeded() {
  if (!state.contract) return;
  $("resumeAddr").value = state.contract;
  try {
    const { storage } = await MD.fetchContractStatus(state.network, state.contract);
    const loaded = Number(storage.supply || 0);
    const sold = Number(storage.minted || 0);
    setResumeStatus(
      `Draft has ${state.contract}: ${loaded} on-chain / ${sold} minted. Use Load from chain after network changes.`,
      true
    );
  } catch (_) {
    /* tzkt may lag or network offline */
  }
}

// ---------- wire up ----------
load();
fillForm();
refreshPinningAccess();
applyNetwork();
renderTokens();
renderStages();
refreshResumeStatusIfNeeded();
refreshInstallerDownloads();
MD.restoreWallet("Macaroni Studio").then((addr) => {
  if (addr) {
    $("walletAddr").value = addr;
    $("btnConnect").textContent = MD.short(addr);
  }
});

$("network").addEventListener("change", applyNetwork);
$("rpc").addEventListener("change", applyNetwork);
$("btnConnect").addEventListener("click", connect);
$("csvFile").addEventListener("change", (e) => e.target.files[0] && onCsv(e.target.files[0]));
$("mediaFiles").addEventListener("change", (e) => onMedia([...e.target.files]));
$("coverFile").addEventListener("change", async (e) => {
  coverFile = e.target.files[0] || null;
  state.drop.coverCid = "";
  state.drop.placeholderCid = ""; // placeholder shows the cover → re-pin
  $("coverPreview").innerHTML = "";
  if (coverFile) {
    try {
      const ok = await validateCollectionCover(coverFile);
      if (!ok) {
        coverFile = null;
        e.target.value = "";
        return;
      }
    } catch (err) {
      notify(`Collection logo/cover must be ${OBJKT_COLLECTION_IMAGE_LABEL}. ${err.message || ""}`.trim());
      coverFile = null;
      e.target.value = "";
      return;
    }
    $("coverPreview").innerHTML = `<img src="${URL.createObjectURL(coverFile)}" style="max-width:160px;border-radius:8px" />`;
  }
});
$("pinKind").addEventListener("change", () => { togglePinFields(); readForm(); });
["pinJwt", "pinUrl", "gateway", "dropTitle", "dropSymbol", "dropDesc", "royaltyPct",
 "royaltyAddr", "treasuryAddr", "revealMode", "revealDelay"]
  .forEach((id) => $(id).addEventListener("change", readForm));

// Designer controls: regenerate code + live preview as you type.
["pageTheme", "pageAccent", "pageFont", "pageBlocks", "pageCss"].forEach((id) => {
  for (const evt of ["change", "input"]) {
    $(id).addEventListener(evt, () => {
      readForm();
      syncCodeFromForm();
      refreshPreview();
    });
  }
});
$("pageCode").addEventListener("input", onCodeEdit);
$("tabDrop").addEventListener("click", () => showView("drop"));
$("tabPage").addEventListener("click", () => showView("page"));
$("tabDrop").addEventListener("keydown", onWorkspaceTabKey);
$("tabPage").addEventListener("keydown", onWorkspaceTabKey);
$("btnRefreshPreview").addEventListener("click", () => refreshPreview(true));
$("btnPin").addEventListener("click", pinAll);
$("btnAddStage").addEventListener("click", () => {
  state.stages.push({ start: "", price: "", useAllowlist: false, maxPerWallet: "", allowlist: [] });
  save();
  renderStages();
  setStageStatus(state.stages.length - 1, "new stage", "warn");
});
$("btnResume").addEventListener("click", () => loadFromChain());
$("importConfig").addEventListener("change", (e) => e.target.files[0] && importConfigFile(e.target.files[0]));
$("importBackup").addEventListener("change", (e) => e.target.files[0] && importStudioBackup(e.target.files[0]));
$("btnSaveBackup").addEventListener("click", saveStudioBackup);
$("btnNewDrop").addEventListener("click", startNewDrop);
$("contractAddr").addEventListener("change", () => {
  const kt = $("contractAddr").value.trim();
  if (isValidKt1Address(kt)) {
    state.contract = kt;
    $("resumeAddr").value = kt;
    $("btnSync").disabled = false;
    save();
  }
});
$("btnDeploy").addEventListener("click", deploy);
$("btnSync").addEventListener("click", sync);
$("btnReveal").addEventListener("click", revealMinted);
$("btnExport").addEventListener("click", exportSite);
$("btnPublishWtfOS").addEventListener("click", publishWtfOSSite);
$("btnConfigOnly").addEventListener("click", () => downloadSitePackage());
$("btnPreview").addEventListener("click", previewPage);
