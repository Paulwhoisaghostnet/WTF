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
const IMPLICIT_ACCOUNT_ADDRESS = /^(tz1|tz2|tz3|tz4)[1-9A-HJ-NP-Za-km-z]{33}$/;
const MACARONI_SECURE_PROFILE_ID = "macaroni-secure-v35";
const MACARONI_SEALED_V3_PROFILE_ID = "macaroni-commitment-v3";
const MACARONI_CONTRACT_VERSIONS = new Set(["macaroni-v1", "macaroni-editions-v2", "macaroni-commitment-v3"]);
const MACARONI_PROFILE_IDS = new Set([MACARONI_SECURE_PROFILE_ID, ...MACARONI_CONTRACT_VERSIONS]);
const MACARONI_V35_CAPABILITY_ENDPOINT = "/api/macaroni/v35/capabilities";
const MACARONI_V35_COMPANION_READINESS_ENDPOINT = "/api/macaroni/v35/companion/readiness";
const MACARONI_V35_COMPANION_PREFIX = "/api/macaroni/v35/companion";
const MACARONI_V35_COMPANION_PROJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MACARONI_V35_REQUIRED_CAPABILITY = "use_managed_macaroni";
const MACARONI_V35_ARTIFACT = "contract/macaroni-v35.contract.json";
const MACARONI_V35_TEMPLATE = "contract/macaroni-v35.template.json";
const LEGACY_RISK_WARNING = "I understand Legacy Macaroni is a public-inventory surprise mint, not a truly blind or cryptographically random mint. Artwork may be discovered or copied before purchase; allocations may be predictable; and reveal completion may depend on a human transaction.";
const LAUNCH_JOURNAL_VERSION = 1;
const LAUNCH_PENDING_STATUSES = new Set(["submitted", "confirming"]);
const MINTER_ROYALTY_MODES = new Set(["first_minter", "rolling_pool"]);
const MACARONI_LEGACY_ARTIFACT = "contract/mydrop.contract.json";
const MACARONI_V2_ARTIFACT = "contract/macaroni-v2.contract.json";
const MACARONI_V3_ARTIFACT = "contract/macaroni-v3.contract.json";
const IS_NATIVE_APP = Boolean(window.MACARONI_DESKTOP && window.MACARONI_DESKTOP.native);
const MACARONI_REVEAL_SERVICE_ORIGIN = IS_NATIVE_APP ? "https://wtfos.app" : "";
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

function normalizeOptionalHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function normalizePublicUrlTemplate(value, placeholder) {
  const token = `{${placeholder}}`;
  const sentinel = `__MACARONI_${placeholder.replace(/[^a-z0-9]/gi, "_").toUpperCase()}__`;
  const source = String(value || "").trim();
  if (!source.includes(token)) return "";
  const normalized = normalizeOptionalHttpUrl(source.replace(token, sentinel));
  return normalized ? normalized.replace(sentinel, token) : "";
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

function normalizeTokenQuantity(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`bad quantity "${value}" — quantity must be a positive integer`);
  return n;
}

function normalizeMinterRoyaltyMode(value) {
  const mode = String(value || "").trim();
  return MINTER_ROYALTY_MODES.has(mode) ? mode : "first_minter";
}

function normalizeContractVersion(value) {
  const version = String(value || "").trim();
  return MACARONI_CONTRACT_VERSIONS.has(version) ? version : "macaroni-v1";
}

function normalizeProfileId(value) {
  const profile = String(value || "").trim();
  return MACARONI_PROFILE_IDS.has(profile) ? profile : MACARONI_SECURE_PROFILE_ID;
}

function isSecureV35Profile() {
  return state.drop.profileId === MACARONI_SECURE_PROFILE_ID;
}

function isLegacyCompatibilityProfile() {
  return state.drop.profileId === "macaroni-v1" || state.drop.profileId === "macaroni-editions-v2";
}

function isSealedV3CompatibilityProfile() {
  return state.drop.profileId === MACARONI_SEALED_V3_PROFILE_ID;
}

function legacyRiskIsAcknowledged() {
  return Boolean(
    state.drop.legacyRiskAcknowledged &&
    state.drop.legacyRiskWarning === LEGACY_RISK_WARNING &&
    state.drop.legacyRiskAcknowledgedAt
  );
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "").replace(/^0x/i, "");
  if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2) throw new Error("invalid commitment nonce");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function metadataCommitment(metadataCid, nonceHex) {
  const uri = new TextEncoder().encode("ipfs://" + metadataCid);
  const nonce = hexToBytes(nonceHex);
  if (nonce.length !== 32) throw new Error("metadata commitment nonce must be 32 bytes");
  const payload = new Uint8Array(uri.length + nonce.length);
  payload.set(uri, 0);
  payload.set(nonce, uri.length);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", payload)));
}

async function ensureTokenCommitment(token) {
  if (!token.metadataCid) throw new Error(`token ${token.id} metadata is not pinned`);
  if (
    token.commitmentMetadataCid === token.metadataCid &&
    /^[0-9a-f]{64}$/i.test(token.metadataNonce || "") &&
    /^[0-9a-f]{64}$/i.test(token.metadataCommitment || "")
  ) return token.metadataCommitment;
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  token.metadataNonce = bytesToHex(nonce);
  token.metadataCommitment = await metadataCommitment(token.metadataCid, token.metadataNonce);
  token.commitmentMetadataCid = token.metadataCid;
  save();
  return token.metadataCommitment;
}

async function ensureV3Commitments() {
  for (const token of state.tokens) await ensureTokenCommitment(token);
}

function minterRoyaltyBps() {
  return Math.round(Number(state.drop.minterRoyaltyPct || 0) * 100);
}

function creatorRoyaltyBps() {
  return Math.round(Number(state.drop.royaltyPct || 0) * 100);
}

function minterRoyaltiesEnabled() {
  return !!state.drop.minterRoyaltiesEnabled && minterRoyaltyBps() > 0;
}

function tokenEditionTotal() {
  return state.tokens.reduce((sum, t) => sum + normalizeTokenQuantity(t.quantity), 0);
}

function placeholderPool() {
  return Array.isArray(state.drop.placeholderPool) ? state.drop.placeholderPool : [];
}

function hasMultiplePlaceholderPool() {
  if (state.drop.revealMode !== "delayed") return false;
  return placeholderPool().filter((p) => p && p.metadataCid).length > 1 || placeholderFiles.length > 1;
}

function dropRequiresMacaroniV2() {
  return state.tokens.some((t) => normalizeTokenQuantity(t.quantity) > 1) ||
    minterRoyaltiesEnabled() ||
    hasMultiplePlaceholderPool();
}

function macaroniContractProfile() {
  const selected = isSecureV35Profile()
    ? MACARONI_SEALED_V3_PROFILE_ID
    : normalizeContractVersion(state.drop.contractVersion);
  const usesV35 = isSecureV35Profile();
  const usesV2 = selected === "macaroni-editions-v2";
  const usesV3 = !usesV35 && selected === "macaroni-commitment-v3";
  const usesEditionStorage = usesV2 || usesV3;
  return {
    id: selected,
    artifact: usesV35 ? MACARONI_V35_ARTIFACT : usesV3 ? MACARONI_V3_ARTIFACT : usesV2 ? MACARONI_V2_ARTIFACT : MACARONI_LEGACY_ARTIFACT,
    selected,
    profileId: state.drop.profileId,
    usesV35,
    usesV2,
    usesV3,
    usesEditionStorage,
    requiresV2: dropRequiresMacaroniV2(),
    incompatible: !usesEditionStorage && dropRequiresMacaroniV2(),
  };
}

function assertSelectedContractSupportsDraft() {
  const profile = macaroniContractProfile();
  if (!profile.incompatible) return profile;
  throw new Error(
    "This draft uses Macaroni V2-only features. Select Macaroni V2 in Drop details, " +
    "or turn off multi-editions, minter royalties, and multiple unrevealed placeholder images."
  );
}

function assertDisplayPolicySupported() {
  if (state.drop.revealMode !== "delayed") return;
  if (state.drop.laterPolicy === "absolute-time") {
    const scheduled = new Date(state.drop.revealAt || "");
    if (!state.drop.revealAt || Number.isNaN(scheduled.getTime())) {
      throw new Error("Choose a valid date and time for the automatic-later display policy.");
    }
  }
  if (isSecureV35Profile()) return;
  if (state.drop.laterPolicy !== "rolling-delay") {
    throw new Error(
      "The selected compatibility contract supports only a rolling per-purchase delay. " +
      "Absolute-time and after-sellout display policies require Secure V3.5 readiness."
    );
  }
}

function assertProfileActionReady(action) {
  assertDisplayPolicySupported();
  if (isSecureV35Profile()) {
    const readiness = state.infrastructure.readiness || {};
    if (!readiness.ready) {
      throw new Error(
        `Secure V3.5 ${action} is blocked: ${readiness.reason || "contract and fulfillment readiness have not been verified."} ` +
        "Macaroni will not substitute a compatibility contract."
      );
    }
    if (!secureArtifactAvailable) {
      throw new Error(`Secure V3.5 ${action} is blocked because the validated contract artifact is unavailable.`);
    }
    if (state.infrastructure.assetStrategy === "public_prepin_private_manifest") {
      const strategyReady = state.infrastructure.kind === "wtfos-managed"
        ? managedMacaroniCapability?.assetStrategies?.public_prepin_private_manifest?.available !== false
        : Array.isArray(state.infrastructure.readiness?.assetStrategies) &&
          state.infrastructure.readiness.assetStrategies.includes("public_prepin_private_manifest");
      if (!strategyReady) {
        throw new Error(`Secure V3.5 ${action} is blocked because the selected provider has not reported public pre-pinning ready.`);
      }
      if (!state.infrastructure.publicPrepinRiskAcknowledged) {
        throw new Error(
          `Secure V3.5 ${action} is blocked until you acknowledge that public pre-pinning publishes the artwork before allocation and carries copy-mint risk.`
        );
      }
    }
    if (["deployment", "publishing", "export"].includes(action) && state.infrastructure.privateInventory?.ready !== true) {
      throw new Error(
        `Secure V3.5 ${action} is blocked because this project's private inventory has not been staged and verified. ` +
        "Artwork will not be copied into the static site or public IPFS as a shortcut."
      );
    }
    if (["publishing", "export"].includes(action) &&
        !secureSetupStepComplete(secureV35SetupSnapshot, "activate_sale")) {
      throw new Error(
        `Secure V3.5 ${action} is blocked until the final sale-opening transaction is finalized and the fulfillment service confirms it is active. ` +
        "Return to the Launch Checklist; a partially configured drop page will not be published."
      );
    }
    if (["publishing", "export"].includes(action) && state.infrastructure.kind === "companion") {
      const service = state.infrastructure.readiness || {};
      if (service.publicCollectorReady !== true) {
        throw new Error(
          `Secure V3.5 ${action} is blocked: ${service.publicCollectorReason || "Companion has not verified a public HTTPS endpoint for collectors."}`
        );
      }
      const collectorUrls = [
        service.publicStatusUrl,
        String(service.claimStatusUrlTemplate || "").replace("{claimId}", "0"),
        String(service.purchaseStatusUrlTemplate || "").replace("{operationHash}", "oo-placeholder"),
        service.wakeUrl,
      ];
      if (collectorUrls.some((value) => {
        try {
          const url = new URL(String(value || ""));
          return url.protocol !== "https:" || ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
        } catch (_) {
          return true;
        }
      })) {
        throw new Error(
          `Secure V3.5 ${action} is blocked because remote collectors need the Companion's configured public HTTPS service URL. ` +
          "The private local administrator port is never placed in an exported drop page."
        );
      }
    }
  }
  if (isLegacyCompatibilityProfile() && !legacyRiskIsAcknowledged()) {
    throw new Error(`Legacy ${action} is blocked until the required public-inventory risk warning is acknowledged under Advanced.`);
  }
}

function assertConfigActionReady(cfg, action) {
  const configProfile = cfg?.profile?.id || cfg?.contractVersion || "";
  if (configProfile === MACARONI_SECURE_PROFILE_ID && !state.infrastructure.readiness?.ready) {
    throw new Error(`Secure V3.5 ${action} is blocked until contract and fulfillment readiness are verified.`);
  }
  if (configProfile === MACARONI_SECURE_PROFILE_ID && state.infrastructure.privateInventory?.ready !== true) {
    throw new Error(`Secure V3.5 ${action} is blocked until this project's private inventory is staged and verified.`);
  }
  if (["macaroni-v1", "macaroni-editions-v2"].includes(configProfile) && !legacyRiskIsAcknowledged()) {
    throw new Error(`Legacy ${action} is blocked until the required public-inventory risk warning is acknowledged under Advanced.`);
  }
}

async function loadContractCodeForDraft() {
  const profile = macaroniContractProfile();
  const res = await fetch(profile.artifact);
  if (!res.ok) {
    if (profile.usesEditionStorage) {
      throw new Error(
        `${profile.id} was selected, but ${profile.artifact} is not present in this build. ` +
        `Compile the selected Macaroni contract template after installing SmartPy, then deploy again.`
      );
    }
    throw new Error(`Could not load ${profile.artifact}`);
  }
  return { profile, code: await res.json() };
}

function freshDropState() {
  return {
    network: "shadownet",
    rpc: "",
    drop: {
      profileId: MACARONI_SECURE_PROFILE_ID,
      title: "",
      symbol: "",
      description: "",
      contractVersion: MACARONI_SEALED_V3_PROFILE_ID,
      royaltyPct: 10,
      royaltyAddr: "",
      treasuryAddr: "",
      coverCid: "",
      coverMime: "",
      contractMetaCid: "",
      revealMode: "instant", // instant | delayed
      revealDelayDays: 7, // auto-reveal window (delayed mode), 0–30
      claimIntervalSeconds: 0,
      laterPolicy: "rolling-delay", // rolling-delay | absolute-time | after-sellout
      revealAt: "",
      revealOperator: "",
      placeholderCid: "", // pinned pre-reveal metadata (delayed mode)
      placeholderPool: [], // [{name, mime, cid, metadataCid}]
      minterRoyaltiesEnabled: false,
      minterRoyaltyPct: 0,
      minterRoyaltyMode: "first_minter", // first_minter | rolling_pool
      royaltyUpdaterAddr: "",
      royaltyUpdateEndpoint: "",
      legacyRiskAcknowledged: false,
      legacyRiskAcknowledgedAt: "",
      legacyRiskWarning: "",
    },
    infrastructure: {
      kind: IS_NATIVE_APP ? "companion" : "wtfos-managed",
      assetStrategy: "pin_on_claim",
      publicPrepinRiskAcknowledged: false,
      publicPrepinRiskAcknowledgedAt: "",
      manuallySelected: false,
      capability: null,
      readiness: {
        ready: false,
        code: "checking",
        reason: "Secure V3.5 readiness has not been verified yet.",
      },
      privateInventory: {
        ready: false,
        projectId: "",
        clientSetupId: "",
        registrationDigest: "",
        registrationFingerprint: "",
        setupPath: "",
        reason: "Private inventory has not been staged and verified for this project.",
        companionCoverUploadId: "",
        companionCoverUploaded: false,
      },
    },
    pin: { kind: "pinata", url: "", gateway: MD.DEFAULT_GATEWAY },
    tokens: [], // {id, quantity, name, description, attributes, tags, fileName, mediaBytes, mediaCid, mediaMime, previewCid, previewMime, previewBytes, metadataCid, metadataNonce, metadataCommitment, commitmentMetadataCid}
    stages: [], // {start, price, useAllowlist, maxPerWallet, allowlist:[{address,capacity}]}
    contract: "",
    launchJournal: { version: LAUNCH_JOURNAL_VERSION, steps: {} },
    page: {
      theme: "dark",
      accent: "",
      font: "",
      blocks: "",
      css: "",
      code: "",
      shareTwitter: "",
      shareBsky: "",
      shareText: "",
    },
  };
}

const state = freshDropState();

// Files can't be persisted; kept in-memory keyed by base name (id).
const mediaFiles = new Map();
let coverFile = null;
let placeholderFiles = [];
let canUseWtfosPinning = false;
let wtfosAccessState = IS_NATIVE_APP ? "native" : "loading";
let wtfosRoleTooltipPinned = false;
let managedMacaroniCapabilityState = IS_NATIVE_APP ? "native" : "loading";
let managedMacaroniCapability = null;
let secureArtifactAvailable = false;
let secureV35Template = null;
let secureV35SetupSnapshot = null;
let sessionPinJwt = "";

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

function sanitizeSocialHandle(value) {
  let text = String(value || "").trim();
  text = text
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/@?/i, "")
    .replace(/^https?:\/\/(?:www\.)?bsky\.app\/profile\/@?/i, "")
    .replace(/^@+/, "")
    .split(/[?#\s]/)[0]
    .replace(/\/+$/, "");
  return text.replace(/[^a-z0-9._-]/gi, "").slice(0, 120);
}

function shareFieldText(value, max = 600) {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, max).trim();
}

function configRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stripPrivateConfigFields(value) {
  if (Array.isArray(value)) return value.map(stripPrivateConfigFields);
  if (!value || typeof value !== "object") return value;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(?:secret|private.?key|api.?key|jwt|credential|nonce|preimage)/i.test(key)) continue;
    safe[key] = stripPrivateConfigFields(item);
  }
  return safe;
}

function sanitizeDropConfig(cfg) {
  const input = stripPrivateConfigFields(cfg && typeof cfg === "object" ? cfg : {});
  const theme = input.theme && typeof input.theme === "object" ? input.theme : {};
  const social = configRecord(input.social);
  const share = configRecord(input.share);
  const service = configRecord(input.service);
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
      template: shareFieldText(share.template),
      xText: shareFieldText(share.xText || share.twitterText),
      bskyText: shareFieldText(share.bskyText || share.blueskyText),
    },
    service: {
      schema: String(service.schema || ""),
      provider: ["wtfos_managed", "creator_companion"].includes(service.provider) ? service.provider : "",
      publicStatusUrl: normalizeOptionalHttpUrl(service.publicStatusUrl),
      claimStatusUrlTemplate: normalizePublicUrlTemplate(service.claimStatusUrlTemplate, "claimId"),
      purchaseStatusUrlTemplate: normalizePublicUrlTemplate(service.purchaseStatusUrlTemplate, "operationHash"),
      wakeUrl: normalizeOptionalHttpUrl(service.wakeUrl),
      projectId: String(service.projectId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120),
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
  if (perms && (perms.trusted_market_creator === true || perms.use_managed_macaroni === true)) return true;
  const roles = Array.isArray(user?.roles)
    ? user.roles
    : user?.role
      ? [user.role]
      : [];
  return roles.some((role) =>
    ["admin", "host", "cohost", "trusted_creator", "trusted_market_creator", "cobwebsaints_full_user"].includes(String(role))
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
      ? "Advanced pre-pinning publishes content-addressed files before the legitimate mint, creating a weaker confidentiality and possible copy window. Eligible creators can use wtfOS pinning or their own Pinata/IPFS node."
      : "Advanced pre-pinning publishes content-addressed files before the legitimate mint, creating a weaker confidentiality and possible copy window. Use your own Pinata JWT or IPFS node.";
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

function setWtfosRoleTooltipOpen(open) {
  const gate = $("publishWtfOSGate");
  const help = $("publishWtfOSRoleHelp");
  const tooltip = $("publishWtfOSRoleTooltip");
  const nextOpen = Boolean(open && wtfosAccessState === "denied" && gate && !gate.hidden);
  if (gate) gate.dataset.tooltipOpen = String(nextOpen);
  if (help) help.setAttribute("aria-expanded", String(nextOpen));
  if (tooltip) tooltip.hidden = !nextOpen;
}

function closeWtfosRoleTooltip() {
  wtfosRoleTooltipPinned = false;
  setWtfosRoleTooltipOpen(false);
}

function setupWtfosRoleTooltip() {
  const gate = $("publishWtfOSGate");
  const help = $("publishWtfOSRoleHelp");
  if (!gate || !help) return;

  gate.addEventListener("pointerenter", () => setWtfosRoleTooltipOpen(true));
  gate.addEventListener("pointerleave", () => {
    if (!wtfosRoleTooltipPinned && !gate.contains(document.activeElement)) {
      setWtfosRoleTooltipOpen(false);
    }
  });
  gate.addEventListener("focusin", () => setWtfosRoleTooltipOpen(true));
  gate.addEventListener("focusout", (event) => {
    if (event.relatedTarget && gate.contains(event.relatedTarget)) return;
    closeWtfosRoleTooltip();
  });
  help.addEventListener("click", () => {
    wtfosRoleTooltipPinned = !wtfosRoleTooltipPinned;
    setWtfosRoleTooltipOpen(wtfosRoleTooltipPinned);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || gate.dataset.tooltipOpen !== "true") return;
    event.preventDefault();
    closeWtfosRoleTooltip();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!gate.contains(event.target)) closeWtfosRoleTooltip();
  });
}

function renderPublishAccess() {
  const btn = $("btnPublishWtfOS");
  const gate = $("publishWtfOSGate");
  const help = $("publishWtfOSRoleHelp");
  const confirmedRoleDenial = wtfosAccessState === "denied";
  const accessGranted = wtfosAccessState === "granted";
  const showHostedPublish = confirmedRoleDenial || accessGranted;
  if (gate) {
    gate.hidden = !showHostedPublish;
    gate.dataset.roleLocked = String(confirmedRoleDenial);
    if (confirmedRoleDenial) {
      gate.setAttribute("role", "group");
      gate.setAttribute("aria-label", "Publish to wtfOS unavailable");
    } else {
      gate.removeAttribute("role");
      gate.removeAttribute("aria-label");
    }
  }
  if (btn) {
    btn.disabled = !accessGranted;
    if (confirmedRoleDenial) btn.setAttribute("aria-describedby", "publishWtfOSRoleTooltip");
    else btn.removeAttribute("aria-describedby");
  }
  if (help) help.hidden = !confirmedRoleDenial;
  closeWtfosRoleTooltip();
  const hint = $("publishPathHint");
  if (hint) {
    hint.innerHTML = accessGranted
      ? '<strong>Export website</strong> downloads <code>macaroni-site.zip</code> for self-hosting. <strong>Publish to wtfOS</strong> requires a deployed or resumed <code>KT1...</code> contract and saves the mint page to your <code>username.wtfos.me/drop-title</code> site path. <strong>Download site package</strong> includes a separate <code>drop.config.js</code> for quick config swaps on an existing host.'
      : confirmedRoleDenial
      ? '<strong>Export website</strong> downloads <code>macaroni-site.zip</code> for installing the mint site on your own website. <strong>Publish to wtfOS</strong> is restricted to Trusted Market Creators to prevent abuse; contact an admin through the Contact Admin app to request access. <strong>Download site package</strong> includes a separate <code>drop.config.js</code> for quick config swaps on an existing host.'
      : '<strong>Export website</strong> downloads <code>macaroni-site.zip</code> for installing the mint site on your own website. <strong>Download site package</strong> includes a separate <code>drop.config.js</code> for quick config swaps on an existing host.';
  }
}

async function refreshPinningAccess() {
  if (IS_NATIVE_APP) {
    canUseWtfosPinning = false;
    wtfosAccessState = "native";
    renderPinKindOptions();
    return;
  }
  try {
    const res = await MD.apiFetch("/api/auth/user");
    if (res.ok) {
      canUseWtfosPinning = hasWtfosPinningAccess(await res.json());
      wtfosAccessState = canUseWtfosPinning ? "granted" : "denied";
    } else {
      canUseWtfosPinning = false;
      wtfosAccessState = "unavailable";
    }
  } catch (_) {
    canUseWtfosPinning = false;
    wtfosAccessState = "unavailable";
  }
  renderPinKindOptions();
}

function managedAccessRequestHref(denial) {
  const path = String(denial?.adminInboxPath || "").trim();
  const requestText = String(denial?.requestText || "").trim();
  if (!path || !requestText) return "";
  const url = new URL(path, location.origin);
  url.searchParams.set("template", requestText);
  return url.pathname + url.search;
}

async function v35ArtifactIsAvailable() {
  try {
    const [contractResponse, templateResponse] = await Promise.all([
      fetch(MACARONI_V35_ARTIFACT, { cache: "no-store" }),
      fetch(MACARONI_V35_TEMPLATE, { cache: "no-store" }),
    ]);
    if (!contractResponse.ok || !templateResponse.ok) return false;
    const [contract, template] = await Promise.all([
      contractResponse.json(),
      templateResponse.json(),
    ]);
    const funding = template?.measuredFundingPolicy;
    const subsidy = Number(funding?.fulfillmentSubsidyMutez ?? funding?.minimumFulfillmentSubsidyMutez);
    const reserve = Number(funding?.initialContractReserveMutez ?? funding?.fiveSettlementStartupMutez);
    const finalizer = Number(funding?.finalizerLiquidStartupFloorMutez ?? funding?.finalizerStartupMutez);
    const verified = Array.isArray(contract) && contract.length > 0 &&
      template?.templateVersion === "macaroni-secure-claim-v3.5" &&
      Number.isSafeInteger(subsidy) && subsidy > 0 &&
      reserve === subsidy * 5 && Number.isSafeInteger(finalizer) && finalizer >= reserve;
    secureV35Template = verified ? template : null;
    return verified;
  } catch (_) {
    secureV35Template = null;
    return false;
  }
}

function formatMeasuredMutez(value) {
  const mutez = Number(value);
  if (!Number.isSafeInteger(mutez) || mutez < 0) return "pending measurement";
  return `${(mutez / 1_000_000).toFixed(6)} XTZ`;
}

function secureMeasuredFunding() {
  const policy = secureV35Template?.measuredFundingPolicy ||
    managedMacaroniCapability?.managed?.fundingPolicy || null;
  if (!policy) return null;
  const subsidy = Number(policy.fulfillmentSubsidyMutez ?? policy.minimumFulfillmentSubsidyMutez);
  const baseReserve = Number(policy.initialContractReserveMutez ?? policy.fiveSettlementStartupMutez);
  const finalizer = Number(policy.finalizerLiquidStartupFloorMutez ?? policy.finalizerStartupMutez);
  const origination = Number(policy.maximumObservedOriginationMutez);
  if (!Number.isSafeInteger(subsidy) || subsidy <= 0 || baseReserve !== subsidy * 5) return null;
  return { subsidy, baseReserve, finalizer, origination, policy };
}

function renderSecureMeasuredCosts() {
  const measured = secureMeasuredFunding();
  const anyFreeStage = state.stages.some((stage) => Number(stage.price) === 0 && String(stage.price).trim() !== "");
  const fullFreeReserve = measured ? tokenEditionTotal() * measured.subsidy : 0;
  const requiredReserve = measured
    ? Math.max(measured.baseReserve, anyFreeStage ? fullFreeReserve : 0)
    : 0;
  const evidence = measured?.policy?.measuredAt || measured?.policy?.version || "";
  if ($("deploymentCostRequirement")) {
    $("deploymentCostRequirement").textContent = measured && Number.isSafeInteger(measured.origination)
      ? `Every request is live-estimated before signing. The final V3.5 Shadownet origination benchmark was ${formatMeasuredMutez(measured.origination)}; the current network estimate shown in the review is authoritative.`
      : "Every request is live-estimated before signing. No deployment amount is guessed.";
  }
  if ($("reserveCostRequirement")) {
    $("reserveCostRequirement").textContent = measured
      ? `${formatMeasuredMutez(requiredReserve)} for this draft: at least five conservative fulfillment envelopes${anyFreeStage ? ", expanded to cover every unit because a free stage cannot replenish the reserve" : ""}. Evidence ${evidence ? `measured ${new Date(evidence).toLocaleString()}` : "is embedded in the reviewed contract package"}.`
      : "Pending measured contract evidence. Launch remains blocked rather than guessing a reserve.";
  }
  if ($("purchaseContributionRequirement")) {
    $("purchaseContributionRequirement").textContent = measured
      ? `${formatMeasuredMutez(measured.subsidy)} fixed per paid unit—never a percentage. It is retained by the contract and reimbursed only after successful fulfillment; free purchases contribute nothing.`
      : "Pending measured contract evidence. Macaroni will not invent a fee or percentage.";
  }
  const advancedFunding = $("advancedFundingSummary");
  if (advancedFunding) {
    const operator = measured && Number.isSafeInteger(measured.finalizer)
      ? ` A self-hosted finalizer also needs at least ${formatMeasuredMutez(measured.finalizer)} liquid startup balance for arming plus five conservative operations; successful calls replenish it from the contract reserve.`
      : "";
    advancedFunding.textContent = measured
      ? `Measured policy: ${formatMeasuredMutez(measured.subsidy)} per fulfilled unit and ${formatMeasuredMutez(requiredReserve)} initial contract reserve for this draft.${operator}`
      : "Funding remains blocked until the reviewed measurement record is available.";
  }
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

async function sha256Text(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

function secureReleaseRegistration() {
  if (state.drop.revealMode !== "delayed") {
    return { fulfillmentTrigger: "immediate", claimDelaySeconds: 0, fulfillmentScheduledAt: null };
  }
  if (state.drop.laterPolicy === "absolute-time") {
    const date = new Date(state.drop.revealAt || "");
    if (!state.drop.revealAt || Number.isNaN(date.getTime())) {
      throw new Error("Choose the automatic display date and time before staging private artwork.");
    }
    return { fulfillmentTrigger: "absolute_time", claimDelaySeconds: 0, fulfillmentScheduledAt: date.toISOString() };
  }
  if (state.drop.laterPolicy === "after-sellout") {
    return { fulfillmentTrigger: "sellout", claimDelaySeconds: 0, fulfillmentScheduledAt: null };
  }
  const days = Number(state.drop.revealDelayDays);
  if (!Number.isFinite(days) || days < 0) throw new Error("Enter a valid non-negative delay.");
  return {
    fulfillmentTrigger: "rolling_delay",
    claimDelaySeconds: Math.round(days * 86_400),
    fulfillmentScheduledAt: null,
  };
}

function secureRegistrationIntent() {
  const administrator = MD.getAccount();
  if (!IMPLICIT_ACCOUNT_ADDRESS.test(administrator || "")) {
    throw new Error("Connect a tz1/tz2/tz3/tz4 creator wallet before preparing Secure V3.5.");
  }
  const salesProceedsAddress = state.drop.treasuryAddr || administrator;
  if (!IMPLICIT_ACCOUNT_ADDRESS.test(salesProceedsAddress)) {
    throw new Error("Secure V3.5 sales proceeds must go to a tz1/tz2/tz3/tz4 wallet so payouts and the final reserve return cannot be rejected.");
  }
  const release = secureReleaseRegistration();
  const requestedInterval = Math.round(Number(state.drop.claimIntervalSeconds || 0));
  if (!Number.isSafeInteger(requestedInterval) || requestedInterval < 0) {
    throw new Error("Automatic fulfillment spacing must be a non-negative whole number of seconds.");
  }
  return {
    network: state.network,
    administrator,
    physicalSupply: tokenEditionTotal(),
    provider: state.infrastructure.kind === "wtfos-managed" ? "wtfos_managed" : "creator_companion",
    assetStrategy: state.infrastructure.assetStrategy,
    ...release,
    claimIntervalSeconds: release.fulfillmentTrigger === "rolling_delay" ? requestedInterval : 0,
    salesProceedsAddress,
  };
}

async function secureRegistrationFingerprint(intent) {
  return sha256Text(stableJson(intent));
}

function secureManagedFetch(path, options) {
  if (state.infrastructure.kind !== "wtfos-managed") {
    throw new Error("This action belongs to the wtfOS-managed path. Open the Companion setup guide for a self-hosted project.");
  }
  return MD.apiFetch(path, options);
}

function secureCompanionFetch(path, options = {}) {
  if (state.infrastructure.kind !== "companion") {
    throw new Error("This action belongs to the self-hosted Companion path.");
  }
  if (!IS_NATIVE_APP || state.infrastructure.readiness?.studioApiReady !== true) {
    throw new Error(
      "The protected Companion Studio bridge is not ready. Start the installed Companion and complete its readiness check; Macaroni will not put its administrator token in this page."
    );
  }
  return fetch(`${MACARONI_V35_COMPANION_PREFIX}${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
}

function isCompanionProjectId(value) {
  return MACARONI_V35_COMPANION_PROJECT.test(String(value || "").trim());
}

function hasSecureProjectRegistration() {
  const value = state.infrastructure.privateInventory?.projectId;
  if (state.infrastructure.kind === "companion") return isCompanionProjectId(value);
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0;
}

function companionReleasePolicy(intent) {
  if (intent.fulfillmentTrigger === "immediate") return { kind: "immediate" };
  if (intent.fulfillmentTrigger === "sellout") return { kind: "sellout" };
  if (intent.fulfillmentTrigger === "absolute_time") {
    return { kind: "scheduled", at: intent.fulfillmentScheduledAt };
  }
  return { kind: "rolling_delay", seconds: intent.claimDelaySeconds };
}

function updateCompanionPublicService(project) {
  const statusUrl = normalizeOptionalHttpUrl(project?.publicStatusUrl);
  const claimStatusUrlTemplate = normalizePublicUrlTemplate(project?.claimStatusUrlTemplate, "claimId");
  const purchaseStatusUrlTemplate = normalizePublicUrlTemplate(project?.purchaseStatusUrlTemplate, "operationHash");
  const wakeUrl = normalizeOptionalHttpUrl(project?.wakeUrl);
  const publicStaticManifestUrl = normalizeOptionalHttpUrl(project?.publicStaticManifestUrl);
  if (!statusUrl || !claimStatusUrlTemplate || !purchaseStatusUrlTemplate || !wakeUrl) return;
  state.infrastructure.readiness = {
    ...(state.infrastructure.readiness || {}),
    publicCollectorReady: true,
    publicStatusUrl: statusUrl,
    publicStaticManifestUrl,
    claimStatusUrlTemplate,
    purchaseStatusUrlTemplate,
    wakeUrl,
  };
}

function normalizeCompanionV35Setup(project) {
  if (!project || project.schema !== "pasta.macaroni-companion-project.v1" || !isCompanionProjectId(project.dropRef)) {
    throw new Error("Companion returned an invalid durable project document.");
  }
  const completed = new Set(project.creatorSetup?.completedSteps || []);
  const steps = [...completed].map((key, index) => ({
    id: index + 1,
    key,
    status: "complete",
    details: { logicalStep: String(key).split(":")[0] },
  }));
  const addSyntheticStep = (key, condition, parameters = {}) => {
    if (!condition || steps.some((step) => step.key === key)) return;
    steps.push({ id: steps.length + 1, key, status: "complete", details: { logicalStep: key }, parameters });
  };
  const tokens = Array.isArray(project.tokens) ? project.tokens : [];
  const stagedSupply = tokens.reduce((sum, token) => sum + Number(token.quantity || 0), 0);
  const fullyStaged = stagedSupply === Number(project.physicalSupply) && stagedSupply > 0;
  addSyntheticStep("stage_private_assets", fullyStaged);
  addSyntheticStep(
    "public_contract_metadata",
    project.publicContractMetadata?.state === "pinned_verified",
    {
      contractMetadataUri: project.publicContractMetadata?.contractMetadataUri || "",
      coverUri: project.publicContractMetadata?.publicCoverUri || "",
    }
  );
  addSyntheticStep("fulfillment_armed", project.lifecycle?.fulfillmentArmed === true);
  addSyntheticStep("activate_sale", project.lifecycle?.saleActivated === true);
  addSyntheticStep("close_sale", project.lifecycle?.salePermanentlyClosed === true);
  return {
    schema: "pasta.macaroni-v35-studio-setup.v1",
    provider: "companion",
    drop: {
      id: project.dropRef,
      clientSetupId: project.dropRef,
      registrationDigest: project.registrationDigest,
      contract: project.contract || "",
      status: project.state,
      serviceReady: state.infrastructure.readiness?.ready === true,
    },
    steps,
    attempts: project.creatorSetup?.activeAttempt ? [{
      id: project.creatorSetup.activeAttempt.attemptId,
      state: project.creatorSetup.activeAttempt.state,
      operationHash: project.creatorSetup.activeAttempt.operationHash || "",
      setupStepId: -1,
      intent: "companion_creator_action",
    }] : [],
    privateInventory: tokens.map((token) => ({
      kind: "metadata",
      tokenId: Number(token.tokenId),
      quantity: Number(token.quantity),
      metadataCommitment: token.metadataCommitment,
    })),
    companionProject: project,
  };
}

function secureSetupStepComplete(snapshot, key) {
  return Array.isArray(snapshot?.steps) && snapshot.steps.some((step) =>
    (step.key === key || step.details?.logicalStep === key) && step.status === "complete"
  );
}

async function refreshManagedV35Setup() {
  const inventory = state.infrastructure.privateInventory || {};
  if (state.infrastructure.kind === "companion") {
    if (!isCompanionProjectId(inventory.projectId)) {
      secureV35SetupSnapshot = null;
      return null;
    }
    const response = await secureCompanionFetch(`/projects/${encodeURIComponent(inventory.projectId)}`);
    const project = await response.json().catch(() => ({}));
    if (!response.ok || project.schema !== "pasta.macaroni-companion-project.v1") {
      throw new Error(project.message || project.error || "Could not restore the durable Companion project.");
    }
    const body = normalizeCompanionV35Setup(project);
    secureV35SetupSnapshot = body;
    inventory.clientSetupId = project.dropRef;
    inventory.projectId = project.dropRef;
    inventory.registrationDigest = project.registrationDigest;
    inventory.setupPath = `${MACARONI_V35_COMPANION_PREFIX}/projects/${project.dropRef}`;
    const staged = secureSetupStepComplete(body, "stage_private_assets");
    inventory.ready = staged;
    inventory.reason = staged
      ? "Every private artwork and metadata CAR is staged, committed, encrypted, and recoverable in Companion."
      : `${project.tokens?.length || 0}/${state.tokens.length} token rows are durably staged in Companion.`;
    updateCompanionPublicService(project);
    if (isValidKt1Address(project.contract)) {
      state.contract = project.contract;
      $("contractAddr").value = state.contract;
    }
    save();
    renderTokens();
    renderStages();
    renderProfileAndInfrastructure();
    renderLaunchChecklist();
    return body;
  }
  const projectId = Number(inventory.projectId);
  if (state.infrastructure.kind !== "wtfos-managed" || !Number.isSafeInteger(projectId) || projectId < 1) {
    secureV35SetupSnapshot = null;
    return null;
  }
  const path = inventory.setupPath || `/api/macaroni/v35/drops/${projectId}/setup`;
  const response = await secureManagedFetch(path, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.schema !== "wtfos.macaroni-v35-setup.v1") {
    throw new Error(body.error || "Could not restore the durable Secure V3.5 setup.");
  }
  secureV35SetupSnapshot = body;
  inventory.projectId = String(body.drop.id);
  inventory.clientSetupId = body.drop.clientSetupId;
  inventory.registrationDigest = body.drop.registrationDigest;
  inventory.setupPath = path;
  const staged = secureSetupStepComplete(body, "stage_private_assets");
  inventory.ready = staged;
  inventory.reason = staged
    ? "Every private artwork and metadata CAR is staged, committed, and recoverable."
    : `${body.privateInventory?.filter((asset) => asset.kind === "metadata").length || 0}/${state.tokens.length} token rows are durably staged.`;
  if (isValidKt1Address(body.drop.contract)) {
    state.contract = body.drop.contract;
    $("contractAddr").value = state.contract;
  }
  for (const attempt of body.attempts || []) {
    const localStepId = `secure:${attempt.intent}:${attempt.id}`;
    const mappedStatus = attempt.state === "applied" ? "applied"
      : attempt.state === "wallet_rejected" ? "declined"
      : attempt.state === "awaiting_signature" ? "ready"
      : ["submitted", "confirming", "needs_reconciliation"].includes(attempt.state) ? "confirming"
      : attempt.state === "failed" ? "failed" : "not-ready";
    writeLaunchStep(localStepId, {
      status: mappedStatus,
      hash: attempt.operationHash || "",
      entrypoint: attempt.entrypoint || "",
      contract: attempt.target || attempt.originatedContract || "",
      message: attempt.error || (mappedStatus === "applied" ? "Server and finalized chain state agree this step is complete." : "Durable setup state restored."),
      managedAttemptId: attempt.id,
    });
  }
  save();
  renderTokens();
  renderStages();
  renderProfileAndInfrastructure();
  renderLaunchChecklist();
  return body;
}

function newClientSetupId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function ensureManagedV35Registration() {
  if (state.infrastructure.kind === "companion") return ensureCompanionV35Registration();
  const existingProjectId = Number(state.infrastructure.privateInventory?.projectId);
  if (Number.isSafeInteger(existingProjectId) && existingProjectId > 0) {
    const restored = await refreshManagedV35Setup();
    const intent = secureRegistrationIntent();
    const fingerprint = await secureRegistrationFingerprint(intent);
    if (state.infrastructure.privateInventory.registrationFingerprint &&
        state.infrastructure.privateInventory.registrationFingerprint !== fingerprint) {
      throw new Error("Network, supply, proceeds, storage, or display timing changed after this secure setup was registered. Start a new drop so the existing private commitments cannot be silently reinterpreted.");
    }
    return restored;
  }
  const intent = secureRegistrationIntent();
  if (!Number.isSafeInteger(intent.physicalSupply) || intent.physicalSupply < 1) {
    throw new Error("Add at least one token row before staging private artwork.");
  }
  const clientSetupId = state.infrastructure.privateInventory?.clientSetupId || newClientSetupId();
  const identity = {
    clientSetupId,
    network: intent.network,
    contract: null,
    administrator: intent.administrator,
  };
  const challengeResponse = await secureManagedFetch("/api/macaroni/v35/registration/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
  });
  const challenge = await challengeResponse.json().catch(() => ({}));
  if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
    throw new Error(challenge.error || "Could not prepare the private-staging wallet proof.");
  }
  await requestTransactionReview({
    kind: "Wallet signature · no transaction",
    title: "Create your recoverable secure setup",
    summary: "This purpose-bound message proves which creator wallet owns this one private Macaroni project. It cannot transfer tez or NFTs.",
    action: "Authorize private staging and the resumable launch checklist",
    network: state.network,
    wallet: intent.administrator,
    entrypoint: "Off-chain message · no contract entrypoint",
    amount: "0 XTZ",
    fee: "No network fee",
    storage: "No on-chain storage",
    irreversible: "The project id and its encrypted inventory commitments remain associated with this creator account. No contract or public artwork is created yet.",
    ifSign: "wtfOS creates a durable private setup that you can return to after a disconnect.",
    ifDecline: "Nothing is created or charged. Your local draft stays here and this step remains available.",
  });
  const signed = await MD.signMessage(challenge.message);
  const registrationResponse = await secureManagedFetch("/api/macaroni/v35/drops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientSetupId,
      ...intent,
      proof: {
        nonce: challenge.nonce,
        publicKey: signed.publicKey,
        signature: signed.signature,
      },
    }),
  });
  const body = await registrationResponse.json().catch(() => ({}));
  if (!registrationResponse.ok || !body.dropId || !body.registrationDigest) {
    throw new Error(body.error || "Could not create the durable Secure V3.5 setup.");
  }
  state.infrastructure.privateInventory.clientSetupId = clientSetupId;
  state.infrastructure.privateInventory.projectId = String(body.dropId);
  state.infrastructure.privateInventory.registrationDigest = body.registrationDigest;
  state.infrastructure.privateInventory.registrationFingerprint = await secureRegistrationFingerprint(intent);
  state.infrastructure.privateInventory.setupPath = body.setupPath || `/api/macaroni/v35/drops/${body.dropId}/setup`;
  state.infrastructure.privateInventory.reason = "Secure setup created. Artwork is ready to be staged privately.";
  save();
  return refreshManagedV35Setup();
}

async function ensureCompanionV35Registration() {
  const inventory = state.infrastructure.privateInventory;
  const intent = secureRegistrationIntent();
  const fingerprint = await secureRegistrationFingerprint(intent);
  if (isCompanionProjectId(inventory.projectId)) {
    const restored = await refreshManagedV35Setup();
    if (inventory.registrationFingerprint && inventory.registrationFingerprint !== fingerprint) {
      throw new Error(
        "Network, supply, proceeds, storage, or display timing changed after Companion registered this secure project. Start a new drop so its private commitments cannot be reinterpreted."
      );
    }
    if (!inventory.registrationFingerprint) {
      inventory.registrationFingerprint = fingerprint;
      save();
    }
    return restored;
  }
  const measured = secureMeasuredFunding();
  if (!measured) throw new Error("The reviewed fulfillment funding policy is unavailable.");
  await MD.assertOperationSafety();
  const dropRef = inventory.clientSetupId && isCompanionProjectId(inventory.clientSetupId)
    ? inventory.clientSetupId
    : newClientSetupId();
  const creatorPublicKey = typeof MD.getPublicKey === "function" ? await MD.getPublicKey() : "";
  const request = {
    dropRef,
    network: intent.network,
    creator: intent.administrator,
    ...(creatorPublicKey ? { creatorPublicKey } : {}),
    administrator: intent.administrator,
    treasury: intent.salesProceedsAddress,
    physicalSupply: intent.physicalSupply,
    assetStrategy: intent.assetStrategy,
    releasePolicy: companionReleasePolicy(intent),
    claimIntervalSeconds: intent.claimIntervalSeconds,
    fulfillmentSubsidyMutez: measured.subsidy,
  };
  const response = await secureCompanionFetch("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const project = await response.json().catch(() => ({}));
  if (!response.ok || project.schema !== "pasta.macaroni-companion-project.v1") {
    throw new Error(project.message || project.error || "Companion could not create the durable private project.");
  }
  inventory.clientSetupId = dropRef;
  inventory.projectId = dropRef;
  inventory.registrationDigest = project.registrationDigest;
  inventory.registrationFingerprint = fingerprint;
  inventory.setupPath = `${MACARONI_V35_COMPANION_PREFIX}/projects/${dropRef}`;
  inventory.reason = "Companion project created. Artwork is ready for encrypted local staging.";
  updateCompanionPublicService(project);
  save();
  return refreshManagedV35Setup();
}

function managedV35PublicMetadata(setup = secureV35SetupSnapshot) {
  const companion = setup?.companionProject?.publicContractMetadata;
  if (companion?.state === "pinned_verified" &&
      /^ipfs:\/\/\S+$/.test(String(companion.contractMetadataUri || "")) &&
      /^ipfs:\/\/\S+$/.test(String(companion.publicCoverUri || ""))) {
    return {
      contractMetadataUri: companion.contractMetadataUri,
      coverUri: companion.publicCoverUri,
      contractMetadataCid: String(companion.contractMetadataUri).slice(7),
      coverCid: String(companion.publicCoverUri).slice(7),
    };
  }
  const step = (setup?.steps || []).find((candidate) =>
    candidate.key === "public_contract_metadata" && candidate.status === "complete"
  );
  const parameters = step?.parameters || {};
  return /^ipfs:\/\/\S+$/.test(String(parameters.contractMetadataUri || "")) &&
    /^ipfs:\/\/\S+$/.test(String(parameters.coverUri || ""))
    ? parameters
    : null;
}

async function ensureManagedV35PublicMetadata(setup) {
  if (state.infrastructure.kind === "companion") return ensureCompanionV35PublicMetadata(setup);
  const existing = managedV35PublicMetadata(setup);
  if (existing) {
    state.drop.contractMetaCid = String(existing.contractMetadataCid || existing.contractMetadataUri.slice(7));
    state.drop.coverCid = String(existing.coverCid || existing.coverUri.slice(7));
    save();
    return existing;
  }
  if (!coverFile) {
    throw new Error(
      "Re-select the collection logo/cover before continuing. It is public collection branding, while the token artwork remains privately staged."
    );
  }
  const projectId = Number(state.infrastructure.privateInventory?.projectId);
  if (!Number.isSafeInteger(projectId) || projectId < 1) {
    throw new Error("Create the recoverable secure setup before pinning public collection metadata.");
  }
  const form = new FormData();
  form.append("registrationDigest", state.infrastructure.privateInventory.registrationDigest);
  form.append("name", state.drop.title);
  form.append("description", state.drop.description);
  form.append("cover", coverFile, coverFile.name || "macaroni-v35-cover");
  setStatus("privateStagingStatus", "Pinning the public collection cover and contract description…", "muted");
  const response = await secureManagedFetch(
    `/api/macaroni/v35/drops/${projectId}/public-contract-metadata`,
    { method: "POST", body: form }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !/^ipfs:\/\/\S+$/.test(String(body.contractMetadataUri || ""))) {
    throw new Error(body.error || "Could not pin the public collection cover and contract metadata.");
  }
  state.drop.contractMetaCid = String(body.contractMetadataCid || body.contractMetadataUri.slice(7));
  state.drop.coverCid = String(body.coverCid || String(body.coverUri || "").slice(7));
  save();
  return body;
}

async function putCompanionPrivateUpload(dropRef, uploadId, file) {
  const response = await secureCompanionFetch(
    `/projects/${encodeURIComponent(dropRef)}/uploads/${encodeURIComponent(uploadId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": file?.type || "application/octet-stream" },
      body: file,
    }
  );
  const body = await response.json().catch(() => ({}));
  const alreadyPresent = response.status === 409 && body.error === "upload_exists";
  if ((!response.ok || body.schema !== "pasta.macaroni-companion-upload.v1") && !alreadyPresent) {
    throw new Error(body.message || body.error || "Companion could not encrypt the private upload.");
  }
  return uploadId;
}

async function ensureCompanionV35PublicMetadata(setup) {
  const existing = managedV35PublicMetadata(setup);
  if (existing) {
    state.drop.contractMetaCid = String(existing.contractMetadataCid || existing.contractMetadataUri.slice(7));
    state.drop.coverCid = String(existing.coverCid || existing.coverUri.slice(7));
    save();
    return existing;
  }
  if (!coverFile) {
    throw new Error(
      "Re-select the collection logo/cover before continuing. Companion will publish this collection branding, while token artwork stays encrypted and private."
    );
  }
  const inventory = state.infrastructure.privateInventory;
  const dropRef = inventory.projectId;
  if (!isCompanionProjectId(dropRef)) throw new Error("Create the durable Companion project first.");
  const uploadId = isCompanionProjectId(inventory.companionCoverUploadId)
    ? inventory.companionCoverUploadId
    : newClientSetupId();
  inventory.companionCoverUploadId = uploadId;
  save();
  if (!inventory.companionCoverUploaded) {
    setStatus("privateStagingStatus", "Encrypting the collection cover in Companion…", "muted");
    await putCompanionPrivateUpload(dropRef, uploadId, coverFile);
    inventory.companionCoverUploaded = true;
    save();
  }
  setStatus("privateStagingStatus", "Publishing the public collection cover and contract description…", "muted");
  const response = await secureCompanionFetch(
    `/projects/${encodeURIComponent(dropRef)}/public-contract-metadata`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId,
        name: state.drop.title,
        description: state.drop.description,
      }),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.schema !== "pasta.macaroni-companion-public-contract-metadata.v1") {
    throw new Error(body.message || body.error || "Companion could not publish the collection metadata.");
  }
  state.drop.contractMetaCid = String(body.contractMetadataUri || "").replace(/^ipfs:\/\//, "");
  state.drop.coverCid = String(body.publicCoverUri || "").replace(/^ipfs:\/\//, "");
  save();
  await refreshManagedV35Setup();
  return {
    contractMetadataUri: body.contractMetadataUri,
    coverUri: body.publicCoverUri,
    contractMetadataCid: state.drop.contractMetaCid,
    coverCid: state.drop.coverCid,
  };
}

function secureReadinessFailure(code, reason) {
  return { ready: false, code, reason };
}

function secureTransactionHandlerIsAvailable(readiness = state.infrastructure.readiness) {
  if (state.infrastructure.kind === "wtfos-managed") return typeof MD.apiFetch === "function";
  return readiness?.studioApiReady === true;
}

async function companionReadiness() {
  try {
    const response = IS_NATIVE_APP
      ? await fetch(MACARONI_V35_COMPANION_READINESS_ENDPOINT, { cache: "no-store" })
      : await MD.apiFetch(MACARONI_V35_COMPANION_READINESS_ENDPOINT);
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ready === true && body.network && body.network !== state.network) {
      return secureReadinessFailure(
        "companion_network_mismatch",
        `Companion is configured for ${body.network}, while this drop is set to ${state.network}. Change one of them before staging or signing.`
      );
    }
    if (!response.ok || body.ready !== true) {
      return secureReadinessFailure(
        body.code || "companion_setup_required",
        body.reason || "Macaroni Companion has not proved private staging, pinner, funded signer, durable queue, monitoring, and recovery readiness."
      );
    }
    const existing = state.infrastructure.readiness || {};
    const publicBaseUrl = normalizeOptionalHttpUrl(body.publicBaseUrl).replace(/\/+$/, "");
    const canRetainProjectUrls = body.publicCollectorReady === true && publicBaseUrl &&
      [existing.publicStatusUrl, existing.claimStatusUrlTemplate, existing.purchaseStatusUrlTemplate, existing.wakeUrl]
        .filter(Boolean)
        .every((value) => String(value).startsWith(`${publicBaseUrl}/`));
    return {
      ready: body.studioApiReady === true,
      studioApiReady: body.studioApiReady === true,
      code: body.studioApiReady === true ? "ready" : "companion_studio_adapter_unavailable",
      reason: body.studioApiReady === true
        ? body.reason || "Macaroni Companion readiness verified."
        : body.reason || "Companion is healthy, but its private Studio adapter is not available in this app build.",
      assetStrategies: Array.isArray(body.assetStrategies) ? body.assetStrategies : [],
      managementUrl: normalizeOptionalHttpUrl(body.managementUrl),
      publicCollectorReady: body.publicCollectorReady === true,
      publicCollectorCode: String(body.publicCollectorCode || "companion_public_endpoint_unverified"),
      publicCollectorReason: String(body.publicCollectorReason || "Configure and verify the public HTTPS collector endpoint before activation or export."),
      publicBaseUrl,
      collectorOrigin: normalizeOptionalHttpUrl(body.collectorOrigin),
      localDevelopmentOnly: body.localDevelopmentOnly === true,
      ...(canRetainProjectUrls ? {
        publicStatusUrl: existing.publicStatusUrl,
        claimStatusUrlTemplate: existing.claimStatusUrlTemplate,
        purchaseStatusUrlTemplate: existing.purchaseStatusUrlTemplate,
        wakeUrl: existing.wakeUrl,
      } : {}),
    };
  } catch (_) {
    return secureReadinessFailure(
      "companion_unreachable",
      "Macaroni Companion is not reachable. Start the Companion and complete its doctor check before launching."
    );
  }
}

async function refreshSecureV35Readiness() {
  secureArtifactAvailable = await v35ArtifactIsAvailable();
  let readiness;
  if (!secureArtifactAvailable) {
    readiness = secureReadinessFailure(
      "contract_artifact_unavailable",
      "The validated Secure V3.5 contract artifact is not available in this build. Deployment, publishing, and export stay locked; Macaroni will not substitute Legacy."
    );
  } else if (state.infrastructure.kind === "wtfos-managed") {
    if (managedMacaroniCapabilityState !== "granted") {
      readiness = secureReadinessFailure(
        "managed_access_unavailable",
        "Managed Macaroni access has not been granted. Request access or select the self-hosted Companion under Advanced."
      );
    } else if (managedMacaroniCapability?.managed?.service?.ready !== true) {
      readiness = secureReadinessFailure(
        managedMacaroniCapability?.managed?.service?.code || "managed_service_not_ready",
        managedMacaroniCapability?.managed?.service?.reason || "The managed private fulfillment service is not ready."
      );
    } else if (!secureTransactionHandlerIsAvailable()) {
      readiness = secureReadinessFailure(
        "transaction_handler_unavailable",
        "The Secure V3.5 reviewed transaction handler is not available in this Studio build. Launch stays locked."
      );
    } else {
      readiness = { ready: true, code: "ready", reason: "Validated contract and wtfOS managed fulfillment service are ready." };
    }
  } else {
    readiness = await companionReadiness();
    if (readiness.ready && !secureTransactionHandlerIsAvailable(readiness)) {
      readiness = secureReadinessFailure(
        "transaction_handler_unavailable",
        "Companion is reachable, but the Secure V3.5 reviewed transaction handler is unavailable. Launch stays locked."
      );
    }
  }
  state.infrastructure.readiness = readiness;
  save();
  renderProfileAndInfrastructure();
  renderSecureMeasuredCosts();
  renderTokens();
  renderLaunchChecklist();
  return readiness;
}

async function refreshManagedMacaroniCapability() {
  if (IS_NATIVE_APP) {
    managedMacaroniCapabilityState = "native";
    managedMacaroniCapability = null;
    state.infrastructure.kind = "companion";
    state.infrastructure.manuallySelected = false;
    save();
    renderProfileAndInfrastructure();
    await refreshSecureV35Readiness();
    if (isCompanionProjectId(state.infrastructure.privateInventory?.projectId) &&
        state.infrastructure.readiness?.ready === true) {
      try {
        await refreshManagedV35Setup();
      } catch (error) {
        state.infrastructure.privateInventory.ready = false;
        state.infrastructure.privateInventory.reason = error.message || String(error);
        save();
        renderTokens();
      }
    }
    return;
  }
  managedMacaroniCapabilityState = "loading";
  renderProfileAndInfrastructure();
  try {
    const response = await MD.apiFetch(
      `${MACARONI_V35_CAPABILITY_ENDPOINT}?network=${encodeURIComponent(state.network)}`
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.schema !== "wtfos.macaroni-v35-capabilities.v1") {
      throw new Error(body.error || `capability request failed (${response.status})`);
    }
    managedMacaroniCapability = body;
    managedMacaroniCapabilityState = body.managed?.allowed ? "granted" : "denied";
    if (body.managed?.allowed && !state.infrastructure.manuallySelected) {
      state.infrastructure.kind = "wtfos-managed";
    } else if (!body.managed?.allowed && !state.infrastructure.manuallySelected) {
      state.infrastructure.kind = "wtfos-managed";
    }
  } catch (error) {
    managedMacaroniCapability = null;
    managedMacaroniCapabilityState = "unavailable";
    if (!state.infrastructure.manuallySelected) state.infrastructure.kind = "wtfos-managed";
    console.warn("Managed Macaroni capability unavailable", error);
  }
  save();
  renderProfileAndInfrastructure();
  await refreshSecureV35Readiness();
  if (state.infrastructure.kind === "wtfos-managed" && Number(state.infrastructure.privateInventory?.projectId) > 0) {
    try {
      await refreshManagedV35Setup();
    } catch (error) {
      state.infrastructure.privateInventory.ready = false;
      state.infrastructure.privateInventory.reason = error.message || String(error);
      save();
      renderTokens();
    }
  }
}

function nativeCompanionNextStep(readiness) {
  const code = String(readiness?.code || "");
  if (code === "companion_starting") {
    return "The local service is starting. Wait for it to finish, then choose Check again.";
  }
  if (code === "companion_network_mismatch") {
    return "Open the config folder and make the Companion network match this drop, then choose Check again.";
  }
  if (code === "companion_identity_mismatch") {
    return "Another process owns the configured Companion port. Close that process or choose a free port in the private config, then choose Check again.";
  }
  if (code === "companion_unreachable") {
    return "Open the setup guide and config folder, correct the local service setup, then choose Check again.";
  }
  if (code === "transaction_handler_unavailable" || code === "companion_studio_adapter_unavailable") {
    return "Restart this installed app after confirming it is the current V3.5 build, then choose Check again.";
  }
  return "Open the guide, finish the finalizer, IPFS, RPC, public HTTPS, and disclosure settings in the private config, then choose Check again.";
}

function renderNativeCompanionSetup() {
  const card = $("nativeCompanionSetup");
  if (!card) return;
  const visible = IS_NATIVE_APP && isSecureV35Profile() && state.infrastructure.kind === "companion";
  card.hidden = !visible;
  const attention = $("nativeCompanionAttention");
  if (attention) attention.hidden = !visible || state.infrastructure.readiness?.ready !== true
    || !isCompanionProjectId(state.infrastructure.privateInventory?.projectId);
  if (!visible) return;
  const readiness = state.infrastructure.readiness || {};
  const ready = readiness.ready === true;
  $("nativeCompanionSetupTitle").textContent = ready ? "Companion is ready" : "Finish Companion setup";
  $("nativeCompanionSetupBadge").textContent = ready ? "Ready" : "Action required";
  $("nativeCompanionSetupBadge").className = `pill ${ready ? "ok" : "warn"}`;
  $("nativeCompanionSetupReason").textContent = ready
    ? "The complete local doctor and private Studio adapter checks passed. You can return to the drop steps below."
    : `${readiness.reason || "Macaroni has not verified the local Companion yet"} ${nativeCompanionNextStep(readiness)}`;
  const bridge = window.MACARONI_DESKTOP || {};
  $("btnOpenCompanionSetupGuide").disabled = typeof bridge.openCompanionSetupGuide !== "function";
  $("btnOpenCompanionConfigFolder").disabled = typeof bridge.openCompanionConfigFolder !== "function";
  $("btnCheckCompanionAgain").textContent = ready ? "Check readiness again" : "Check again";
}

async function inspectNativeCompanionAttention() {
  const list = $("nativeCompanionAttentionList");
  const dropRef = state.infrastructure.privateInventory?.projectId;
  if (!isCompanionProjectId(dropRef)) {
    list.textContent = "Register this Companion project before inspecting its claim work.";
    return;
  }
  list.textContent = "Checking the local journal and chain…";
  try {
    const response = await secureCompanionFetch(`/projects/${encodeURIComponent(dropRef)}/attention`);
    const body = await response.json();
    if (!response.ok || body.schema !== "pasta.macaroni-companion-attention.v1") {
      throw new Error(body.message || "Companion attention status is unavailable");
    }
    window.dispatchEvent(new CustomEvent("pasta-protocol", { detail: {
      type: "macaroni.companion.attention.viewed", app: "macaroni", count: body.items.length,
    } }));
    list.replaceChildren();
    if (!body.items.length) {
      list.textContent = "No claim or publication work currently needs attention.";
      return;
    }
    for (const item of body.items) {
      const card = document.createElement("div");
      card.className = "notice warn";
      const detail = document.createElement("p");
      const diagnosis = {
        contract_reserve_changed: "Contract fulfillment reserve needs funding or preflight correction.",
        finalizer_funding_or_reveal: "Finalizer account must be revealed and funded before signing.",
        fee_cap_exceeded: "Estimated settlement cost exceeds the configured subsidy; review funding policy before retrying.",
        pinning_authorization: "The pinner rejected authorization. Correct its credentials before retrying.",
        pinning_integrity: "The pinner returned a CAR root that does not match the commitment. Inspect the provider and committed files before retrying.",
        pinning_configuration: "No CAR-capable pinner is configured. Set up a provider before retrying.",
        pinning_retrying: "Publication is retrying automatically. Check the pinner and public gateway if this persists.",
      }[item.diagnostic] || "";
      const workLabel = item.workType === "settle_claim" ? `Claim ${item.claimId} settlement`
        : item.workType === "publish_artifact_car" ? `Claim ${item.claimId} artwork publication`
          : item.workType === "publish_metadata_car" ? `Claim ${item.claimId} metadata publication`
            : "Fulfillment arm";
      detail.textContent = `${workLabel} · ${item.chainState} · attempt ${item.attemptNumber}${item.operationHash ? ` · ${item.operationHash}` : ""}${diagnosis ? ` · ${diagnosis}` : ""}`;
      card.appendChild(detail);
      if (item.retrySafe) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn ghost small";
        button.textContent = "Retry verified work";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const retry = await secureCompanionFetch(`/projects/${encodeURIComponent(dropRef)}/attention/${item.id}/retry`, { method: "POST" });
            const result = await retry.json();
            if (!retry.ok || result.accepted !== true) throw new Error(result.item?.chainState || result.code || "Recovery is still blocked");
            window.dispatchEvent(new CustomEvent("pasta-protocol", { detail: {
              type: "macaroni.companion.attention.retry_requested", app: "macaroni", workType: item.workType,
            } }));
            await inspectNativeCompanionAttention();
          } catch (error) {
            detail.textContent = `Retry blocked: ${error.message || String(error)}. Inspect again before taking another action.`;
            button.disabled = false;
          }
        });
        card.appendChild(button);
      }
      list.appendChild(card);
    }
  } catch (error) {
    list.textContent = `Attention status is unavailable: ${error.message || String(error)}`;
  }
}

async function runNativeCompanionSetupAction(action) {
  const bridge = window.MACARONI_DESKTOP || {};
  const button = action === "guide" ? $("btnOpenCompanionSetupGuide") : $("btnOpenCompanionConfigFolder");
  const method = action === "guide" ? bridge.openCompanionSetupGuide : bridge.openCompanionConfigFolder;
  if (!IS_NATIVE_APP || typeof method !== "function") {
    return setStatus("nativeCompanionActionStatus", "This protected setup action is available only inside Macaroni Desktop or Pasta Suite Desktop.", "err");
  }
  button.disabled = true;
  setStatus(
    "nativeCompanionActionStatus",
    action === "guide" ? "Copying and opening the safe setup kit…" : "Opening the private Companion config location…",
    "muted",
  );
  try {
    await method();
    setStatus(
      "nativeCompanionActionStatus",
      action === "guide"
        ? "Setup guide opened. Macaroni copied only the approved guide and standalone source files; it did not copy generated keys, tokens, private files, or local data."
        : "Config folder opened with the active .env selected. Do not share this folder or place it in the static website.",
      "ok",
    );
  } catch (error) {
    setStatus("nativeCompanionActionStatus", error?.message || "Macaroni could not open that setup resource.", "err");
  } finally {
    button.disabled = false;
  }
}

async function checkNativeCompanionAgain() {
  if (!IS_NATIVE_APP) return;
  const button = $("btnCheckCompanionAgain");
  button.disabled = true;
  setStatus("nativeCompanionActionStatus", "Checking the local doctor and private Studio adapter…", "muted");
  try {
    const readiness = await refreshSecureV35Readiness();
    setStatus(
      "nativeCompanionActionStatus",
      readiness.ready
        ? "Companion is ready. Your secure creation and launch steps are unlocked."
        : `${readiness.reason || "Companion is not ready yet"} ${nativeCompanionNextStep(readiness)}`,
      readiness.ready ? "ok" : "err",
    );
  } finally {
    button.disabled = false;
  }
}

function renderProfileAndInfrastructure() {
  const secure = isSecureV35Profile();
  const managed = state.infrastructure.kind === "wtfos-managed";
  const accessGranted = managedMacaroniCapabilityState === "granted";
  const denied = managedMacaroniCapabilityState === "denied";
  const native = managedMacaroniCapabilityState === "native";
  const managedRadio = $("infraManaged");
  const companionRadio = $("infraCompanion");
  if (managedRadio) {
    managedRadio.checked = managed;
    managedRadio.disabled = !accessGranted;
  }
  if (companionRadio) companionRadio.checked = !managed;
  const simpleOwner = $("simpleServiceOwner");
  const simpleDetail = $("simpleServiceOwnerDetail");
  if (simpleOwner) {
    simpleOwner.textContent = managed && !accessGranted
      ? "wtfOS managed fulfillment unavailable · action required"
      : managed
      ? "wtfOS managed fulfillment selected automatically"
      : "Self-hosted Companion selected · setup required";
  }
  if (simpleDetail) {
    simpleDetail.textContent = managed && !accessGranted
      ? "Macaroni will not switch providers for you. Use the account-specific request below or explicitly select Companion."
      : managed
      ? "wtfOS operates private staging, pinning, signer, queue, monitoring, and recovery for this profile."
      : "The static page stays simple, but your always-on Companion must pass its doctor check before launch.";
  }
  const recovery = $("managedAccessRecovery");
  const denial = managedMacaroniCapability?.managed?.denial;
  if (recovery) recovery.hidden = !(denied || native || managedMacaroniCapabilityState === "unavailable");
  if ($("managedRequiredCapability")) {
    $("managedRequiredCapability").textContent = managedMacaroniCapability?.managed?.requiredPermission || MACARONI_V35_REQUIRED_CAPABILITY;
  }
  if ($("managedAccessReason")) {
    $("managedAccessReason").textContent = native
      ? "Managed service is unavailable in the local app. Use the Companion path below."
      : managedMacaroniCapabilityState === "unavailable"
      ? "Macaroni could not verify managed access. Managed launch remains selected but blocked; choose Companion explicitly if you want to self-host."
      : denial?.nextStep || managedMacaroniCapability?.managed?.reason || "Managed access is not available for this account.";
  }
  const requestLink = $("requestManagedAccess");
  const requestHref = managedAccessRequestHref(denial);
  if (requestLink) {
    requestLink.hidden = !requestHref;
    if (requestHref) requestLink.href = requestHref;
  }
  const requestTemplate = $("managedRequestTemplate");
  if (requestTemplate) {
    const text = String(denial?.requestText || "").trim();
    requestTemplate.hidden = !text;
    requestTemplate.textContent = text ? `Request template: ${text}` : "";
  }
  if ($("btnUseSecureProfile")) {
    $("btnUseSecureProfile").classList.toggle("selected", secure);
    $("btnUseSecureProfile").setAttribute("aria-pressed", String(secure));
  }
  const status = $("profileStatus");
  const readiness = state.infrastructure.readiness || {};
  if (status) {
    status.textContent = !secure
      ? isSealedV3CompatibilityProfile() ? "Advanced: deterministic, not random" : "Advanced: Legacy compatibility"
      : readiness.ready ? "Secure infrastructure ready" : "Secure launch blocked";
    status.className = `pill ${secure && readiness.ready ? "ok" : secure ? "warn" : ""}`.trim();
  }
  const readinessEl = $("secureReadiness");
  if (readinessEl) {
    readinessEl.textContent = secure
      ? readiness.reason || "Secure readiness is being checked."
      : isSealedV3CompatibilityProfile()
      ? "Sealed deterministic V3 is selected under Advanced. It fixes creator-defined order before sale, but it is not random."
      : legacyRiskIsAcknowledged()
      ? "Legacy risk acknowledged for this project. The collector page will display a persistent Legacy warning."
      : "Legacy is selected but its required risk warning has not been acknowledged. Deploy, publish, and export remain blocked.";
    readinessEl.className = `notice ${secure && readiness.ready ? "ok" : "warn"}`;
  }
  renderNativeCompanionSetup();
  if ($("responsibilityBadge")) {
    $("responsibilityBadge").textContent = managed ? "wtfOS operates service" : "Creator operates Companion";
  }
  if ($("serviceOwnerRequirement")) {
    $("serviceOwnerRequirement").textContent = managed
      ? "wtfOS managed private staging, pinner, funded signer, durable queue, monitoring, and recovery."
      : "Creator-run Companion with private storage, pinner credentials, funded signer, durable queue, monitoring, backups, and recovery.";
  }
  if ($("storagePlanRequirement")) {
    $("storagePlanRequirement").textContent = managed
      ? "wtfOS managed private staging and pin-on-fulfillment. Plan price is pending provider measurement."
      : "Creator-provided private storage plus Pinata or Kubo. Hosting/provider cost is separate and must be configured in Companion.";
  }
  if ($("offlineResultRequirement")) {
    $("offlineResultRequirement").textContent = managed
      ? "The purchase claim remains locked while wtfOS retries from its durable journal; status stays visible to creator and collector."
      : "The purchase claim remains locked. Fulfillment pauses while Companion is offline and resumes from its durable journal after recovery.";
  }
  renderSecureMeasuredCosts();
  const strategy = state.infrastructure.assetStrategy === "public_prepin_private_manifest"
    ? "public_prepin_private_manifest"
    : "pin_on_claim";
  const publicPrepinOption = $("assetStrategy")?.querySelector('option[value="public_prepin_private_manifest"]');
  const managedPublicPrepinReady = managedMacaroniCapability?.assetStrategies?.public_prepin_private_manifest?.available !== false;
  const companionPublicPrepinReady = Array.isArray(state.infrastructure.readiness?.assetStrategies) &&
    state.infrastructure.readiness.assetStrategies.includes("public_prepin_private_manifest");
  const publicPrepinReady = managed ? managedPublicPrepinReady : companionPublicPrepinReady;
  if (publicPrepinOption) publicPrepinOption.disabled = !publicPrepinReady;
  if ($("assetStrategy")) $("assetStrategy").value = strategy;
  if ($("publicPrepinWarning")) $("publicPrepinWarning").hidden = strategy !== "public_prepin_private_manifest";
  if ($("publicPrepinRiskAcknowledged")) {
    $("publicPrepinRiskAcknowledged").checked = !!state.infrastructure.publicPrepinRiskAcknowledged;
  }
  // Secure files always travel through Managed/Companion staging. Even the
  // Advanced public-prepin strategy is executed there so a browser credential,
  // CID map, or private file never becomes part of this static Studio bundle.
  if ($("secIpfs")) $("secIpfs").hidden = secure;
  if ($("btnPin")) $("btnPin").disabled = secure;
  if ($("assetStrategyHint")) {
    $("assetStrategyHint").textContent = strategy === "public_prepin_private_manifest"
      ? publicPrepinReady
        ? "The files are published to IPFS before sale while the committed allocation order stays private. Review the pre-mint copy risk below."
        : "The selected provider has not reported public pre-pinning ready. Launch remains blocked; Macaroni will not downgrade silently."
      : "Raw files stay in private staging. After the forced allocation and final NFT mint confirm, the fulfillment service publishes the exact assigned CARs.";
  }
  renderSecureSetupLocks();
}

function renderSecureSetupLocks() {
  const secure = isSecureV35Profile();
  const registered = secure && hasSecureProjectRegistration();
  const staged = registered && state.infrastructure.privateInventory?.ready === true;
  const privateRowsStarted = (secureV35SetupSnapshot?.privateInventory || []).some((asset) => asset.kind === "metadata");
  const contentLocked = staged || privateRowsStarted || Boolean(managedV35PublicMetadata());
  for (const id of [
    "network", "rpc", "treasuryAddr", "revealMode", "laterPolicy", "revealDelay", "claimIntervalSeconds",
    "revealAt", "assetStrategy", "infraManaged", "infraCompanion", "csvFile",
  ]) {
    const element = $(id);
    if (element) {
      element.disabled = registered ||
        (id === "infraManaged" && managedMacaroniCapabilityState !== "granted");
    }
  }
  for (const id of [
    "dropTitle", "dropSymbol", "dropDesc", "royaltyPct", "royaltyAddr", "minterRoyaltiesEnabled",
    "minterRoyaltyPct", "minterRoyaltyMode", "royaltyUpdaterAddr", "royaltyUpdateEndpoint",
  ]) {
    const element = $(id);
    if (element) element.disabled = contentLocked;
  }
  if ($("mediaFiles")) $("mediaFiles").disabled = staged;
  const status = $("privateStagingStatus");
  if (status && registered && !staged) {
    status.title = "Network, supply, proceeds wallet, storage strategy, and display policy are locked to this recoverable setup. Start a new drop to change them.";
  } else if (status) {
    status.removeAttribute("title");
  }
}

function fillShareFields() {
  if ($("shareTwitter")) $("shareTwitter").value = state.page.shareTwitter || "";
  if ($("shareBsky")) $("shareBsky").value = state.page.shareBsky || "";
  if ($("shareText")) $("shareText").value = state.page.shareText || "";
}

async function refreshCreatorSocialDefaults() {
  if (IS_NATIVE_APP) return;
  try {
    const res = await MD.apiFetch("/api/profile/social");
    if (!res.ok) return;
    const profile = await res.json();
    let changed = false;
    const twitter = profile.twitterPublic ? sanitizeSocialHandle(profile.twitterHandle) : "";
    const bsky = sanitizeSocialHandle(profile.atprotoHandle);
    if (!sanitizeSocialHandle(state.page.shareTwitter) && twitter) {
      state.page.shareTwitter = twitter;
      changed = true;
    }
    if (!sanitizeSocialHandle(state.page.shareBsky) && bsky) {
      state.page.shareBsky = bsky;
      changed = true;
    }
    if (!changed) return;
    fillShareFields();
    save();
    syncCodeFromForm();
    refreshPreview();
  } catch (_) {
    // Standalone exports and native builds do not have wtfOS profile defaults.
  }
}

// ---------- persistence ----------
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(safeCreatorStateSnapshot()));
}

function safeCreatorStateSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(state));
  if (snapshot.pin) delete snapshot.pin.jwt;
  const privateInventoryProfile = snapshot.drop?.profileId === MACARONI_SECURE_PROFILE_ID ||
    snapshot.drop?.profileId === MACARONI_SEALED_V3_PROFILE_ID;
  if (privateInventoryProfile && Array.isArray(snapshot.tokens)) {
    snapshot.tokens = snapshot.tokens.map((token) => {
      const safe = { ...token };
      [
        "mediaCid",
        "metadataCid",
        "metadataNonce",
        "commitmentMetadataCid",
        "privateStorageRef",
        "storageRef",
        "preimage",
      ].forEach((key) => delete safe[key]);
      return safe;
    });
  }
  return snapshot;
}

function creatorOperationHash(operation) {
  const hash = String(operation?.opHash || operation?.hash || operation?.operationHash || "").trim();
  return /^o[1-9A-HJ-NP-Za-km-z]{30,}$/.test(hash) ? hash : "";
}

function creatorOperationLink(hash) {
  if (!hash) return "";
  const base = state.network === "shadownet" ? "https://shadownet.tzkt.io/" : "https://tzkt.io/";
  return base + hash;
}

function launchStep(stepId) {
  return state.launchJournal?.steps?.[stepId] || null;
}

function writeLaunchStep(stepId, patch) {
  if (!state.launchJournal || typeof state.launchJournal !== "object") {
    state.launchJournal = { version: LAUNCH_JOURNAL_VERSION, steps: {} };
  }
  if (!state.launchJournal.steps || typeof state.launchJournal.steps !== "object") state.launchJournal.steps = {};
  const previous = launchStep(stepId) || {};
  state.launchJournal.steps[stepId] = {
    ...previous,
    ...patch,
    stepId,
    network: state.network,
    wallet: patch.wallet || previous.wallet || MD.getAccount() || "",
    updatedAt: new Date().toISOString(),
  };
  save();
  renderLaunchChecklist();
  return state.launchJournal.steps[stepId];
}

function displayLaunchStatus(status) {
  return {
    "not-ready": "Not ready",
    ready: "Ready",
    "awaiting-signature": "Awaiting signature",
    submitted: "Submitted",
    confirming: "Confirming",
    applied: "Applied",
    failed: "Failed · retry",
    declined: "Declined · resume",
  }[status] || "Not ready";
}

function setLaunchListRow(stepName, status, detail) {
  const row = document.querySelector(`[data-launch-step="${stepName}"]`);
  if (!row) return;
  row.dataset.status = status;
  const label = row.querySelector("[data-step-state]");
  if (label) {
    label.textContent = displayLaunchStatus(status);
    if (detail) label.title = detail;
  }
}

function latestJournalStatus(prefix) {
  const entries = Object.values(state.launchJournal?.steps || {})
    .filter((entry) => entry && (entry.stepId === prefix || entry.stepId.startsWith(prefix + ":")))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  if (!entries.length) return null;
  if (entries.some((entry) => entry.status === "failed")) return entries.find((entry) => entry.status === "failed");
  if (entries.some((entry) => LAUNCH_PENDING_STATUSES.has(entry.status))) {
    return entries.find((entry) => LAUNCH_PENDING_STATUSES.has(entry.status));
  }
  return entries[0];
}

function secureServerStepStatus(...keys) {
  const snapshot = secureV35SetupSnapshot;
  if (!snapshot) return null;
  const steps = (snapshot.steps || []).filter((step) => {
    const logical = step.details?.logicalStep || String(step.key || "").split(":")[0];
    return keys.includes(step.key) || keys.includes(logical);
  });
  if (!steps.length) return null;
  if (steps.every((step) => step.status === "complete")) return "applied";
  const stepIds = new Set(steps.map((step) => step.id));
  const attempts = (snapshot.attempts || []).filter((attempt) => stepIds.has(attempt.setupStepId));
  if (attempts.some((attempt) => ["submitted", "confirming", "needs_reconciliation"].includes(attempt.state))) return "confirming";
  if (attempts.some((attempt) => attempt.state === "awaiting_signature")) return "ready";
  if (attempts.some((attempt) => attempt.state === "wallet_rejected")) return "declined";
  if (attempts.some((attempt) => attempt.state === "failed")) return "failed";
  return "ready";
}

function renderLaunchChecklist() {
  const secure = isSecureV35Profile();
  const ready = !secure || state.infrastructure.readiness?.ready === true;
  const legacyBlocked = isLegacyCompatibilityProfile() && !legacyRiskIsAcknowledged();
  const profileReady = ready && !legacyBlocked;
  const hasTokenRows = state.tokens.length > 0;
  const staged = secure
    ? state.infrastructure.privateInventory?.ready === true
    : hasTokenRows && state.tokens.every((token) => token.metadataCid);
  const deployRecord = latestJournalStatus("deploy-contract");
  const syncRecord = latestJournalStatus("sync");
  if (secure) {
    const deployment = secureServerStepStatus("originate_contract") || (state.contract ? "applied" : null);
    const inventory = secureServerStepStatus("inventory_complete", "finalize_setup");
    const sale = secureServerStepStatus("set_stages", "allowlist_complete");
    const reserve = secureServerStepStatus("fund_fulfillment_reserve");
    const armed = secureServerStepStatus("fulfillment_armed", "arm_fulfillment");
    const active = secureServerStepStatus("activate_sale") ||
      (["active", "paused", "finishing", "completed"].includes(secureV35SetupSnapshot?.drop?.status) ? "applied" : null);
    const pendingAttempt = (secureV35SetupSnapshot?.attempts || []).some((attempt) =>
      ["submitted", "confirming", "needs_reconciliation"].includes(attempt.state)
    );
    setLaunchListRow("readiness", profileReady ? "ready" : "not-ready", state.infrastructure.readiness?.reason || "");
    setLaunchListRow("stage-private-inventory", staged ? "applied" : profileReady && hasTokenRows ? "ready" : "not-ready");
    setLaunchListRow("deploy-contract", deployment || (profileReady && staged ? "ready" : "not-ready"));
    setLaunchListRow("sync-inventory", inventory || (deployment === "applied" ? "ready" : "not-ready"));
    setLaunchListRow("configure-sale", sale || (inventory === "applied" ? "ready" : "not-ready"));
    setLaunchListRow("fund-reserve", reserve || (sale === "applied" ? "ready" : "not-ready"));
    setLaunchListRow("authorize-automation", armed || (reserve === "applied" ? "ready" : "not-ready"));
    setLaunchListRow("activate-sale", active || (armed === "applied" ? "ready" : "not-ready"));
    setLaunchListRow("publish-page", active === "applied" && secureV35SetupSnapshot?.drop?.serviceReady ? "ready" : "not-ready");
    const deployButton = $("btnDeploy");
    if (deployButton) deployButton.disabled = Boolean(deployment === "applied" || state.contract) ||
      !(profileReady && staged) || pendingAttempt;
    const syncButton = $("btnSync");
    if (syncButton) {
      syncButton.disabled = deployment !== "applied" || pendingAttempt || active === "applied";
      syncButton.textContent = active === "applied" ? "Sale opened ✓" : "Review next setup transaction";
    }
    if ($("secureCloseAction")) {
      $("secureCloseAction").hidden = deployment !== "applied" ||
        ["closed", "cancelled", "completed"].includes(secureV35SetupSnapshot?.drop?.status);
    }
    const overall = $("launchOverallStatus");
    if (overall) {
      overall.textContent = active === "applied" ? "Secure sale active" : profileReady ? "Launch in progress" : "Not ready";
      overall.className = `pill ${active === "applied" ? "ok" : "warn"}`;
    }
    return;
  }
  setLaunchListRow("readiness", profileReady ? "ready" : "not-ready", state.infrastructure.readiness?.reason || "");
  setLaunchListRow("stage-private-inventory", staged ? "applied" : profileReady && hasTokenRows ? "ready" : "not-ready");
  setLaunchListRow("deploy-contract", deployRecord?.status || (profileReady && staged ? "ready" : "not-ready"), deployRecord?.message);
  setLaunchListRow("sync-inventory", syncRecord?.status || (state.contract ? "ready" : "not-ready"), syncRecord?.message);
  setLaunchListRow("configure-sale", state.contract ? (syncRecord?.status || "ready") : "not-ready");
  setLaunchListRow("authorize-automation", isSealedV3CompatibilityProfile() && state.contract ? (syncRecord?.status || "ready") : "not-ready");
  setLaunchListRow("fund-reserve", secure ? "not-ready" : "not-ready");
  setLaunchListRow("activate-sale", "not-ready");
  setLaunchListRow("publish-page", secure ? "not-ready" : state.contract && syncRecord?.status === "applied" ? "ready" : "not-ready");
  const deployButton = $("btnDeploy");
  if (deployButton) {
    deployButton.disabled = Boolean(state.contract) || deployRecord?.status === "applied" ||
      !(profileReady && staged) || LAUNCH_PENDING_STATUSES.has(deployRecord?.status);
  }
  const syncButton = $("btnSync");
  if (syncButton) syncButton.disabled = !state.contract || LAUNCH_PENDING_STATUSES.has(syncRecord?.status);
  const overall = $("launchOverallStatus");
  if (overall) {
    overall.textContent = profileReady ? (state.contract ? "Launch in progress" : "Ready to prepare") : "Not ready";
    overall.className = `pill ${profileReady ? "ok" : "warn"}`;
  }
}

async function reconcileLaunchStep(stepId) {
  const record = launchStep(stepId);
  if (!record?.hash || !LAUNCH_PENDING_STATUSES.has(record.status)) return record;
  const api = MD.TZKT_API?.[record.network || state.network];
  if (!api) return record;
  try {
    const response = await fetch(`${api}/v1/operations/${encodeURIComponent(record.hash)}`, { cache: "no-store" });
    if (!response.ok) {
      writeLaunchStep(stepId, { status: "confirming", message: "Operation is not indexed yet. Macaroni will check again before retry." });
      return launchStep(stepId);
    }
    const json = await response.json();
    const rows = (Array.isArray(json) ? json : [json]).filter((row) => row?.hash === record.hash);
    const expected = rows.find((row) => {
      if (record.entrypoint && row?.parameter?.entrypoint !== record.entrypoint) return false;
      const target = row?.target?.address || row?.target || row?.originatedContract?.address || "";
      if (record.contract && record.entrypoint && target !== record.contract) return false;
      return true;
    });
    if (!expected) {
      writeLaunchStep(stepId, { status: "confirming", message: "The exact operation is indexed without the expected target yet; retry remains locked." });
    } else if (expected.status === "applied") {
      writeLaunchStep(stepId, { status: "applied", message: "Independently indexed as applied." });
    } else {
      writeLaunchStep(stepId, { status: "failed", message: `Operation was ${expected.status || "rejected"}. Review before retry.` });
    }
  } catch (error) {
    writeLaunchStep(stepId, { status: "confirming", message: `Could not reconcile yet: ${error.message || error}` });
  }
  return launchStep(stepId);
}

async function reconcileLaunchJournal() {
  const pending = Object.values(state.launchJournal?.steps || {}).filter((entry) =>
    entry && entry.stepId && entry.hash && LAUNCH_PENDING_STATUSES.has(entry.status)
  );
  for (const entry of pending) await reconcileLaunchStep(entry.stepId);
  renderLaunchChecklist();
}

async function guardLaunchRetry(stepId) {
  const record = await reconcileLaunchStep(stepId);
  if (record?.hash && LAUNCH_PENDING_STATUSES.has(record.status)) {
    throw new Error(
      `Operation ${MD.short(record.hash)} is still ${record.status}. Check ${creatorOperationLink(record.hash)}; Macaroni will not submit a duplicate.`
    );
  }
  return record;
}

function fillTransactionReview(details) {
  $("transactionReviewKind").textContent = details.kind || "Wallet transaction";
  $("transactionReviewTitle").textContent = details.title || "Review before signing";
  $("transactionReviewSummary").textContent = details.summary || "Review this action before your wallet opens.";
  $("reviewAction").textContent = details.action || "—";
  $("reviewNetwork").textContent = details.network || state.network;
  $("reviewWallet").textContent = details.wallet || MD.getAccount() || "Wallet not connected";
  $("reviewEntrypoint").textContent = details.entrypoint || "Contract origination";
  $("reviewAmount").textContent = details.amount || "0 tez";
  $("reviewFee").textContent = details.fee || "Pending live wallet estimate";
  $("reviewStorage").textContent = details.storage || "Pending live wallet estimate";
  $("reviewIrreversible").textContent = details.irreversible || "No irreversible effect described.";
  $("reviewIfSign").textContent = details.ifSign || "The wallet submits the described action.";
  $("reviewIfDecline").textContent = details.ifDecline || "Nothing is submitted; this checklist step remains available.";
  const existing = details.existing || null;
  $("reviewExistingOperation").hidden = !existing;
  if (existing) {
    $("reviewOperationStatus").textContent = `${displayLaunchStatus(existing.status)}${existing.hash ? ` · ${MD.short(existing.hash)}` : ""}`;
    const link = $("reviewOperationLink");
    link.hidden = !existing.hash;
    if (existing.hash) link.href = creatorOperationLink(existing.hash);
  }
  if ($("btnApproveTransaction")) {
    $("btnApproveTransaction").textContent = details.approveLabel || "Continue to wallet";
  }
  if ($("btnDeclineTransaction")) {
    $("btnDeclineTransaction").textContent = details.declineLabel || "Decline for now";
  }
}

function requestTransactionReview(details) {
  const dialog = $("transactionReviewDialog");
  if (!dialog || typeof dialog.showModal !== "function") {
    throw new Error("This browser cannot display the required transaction review sheet. Nothing was submitted.");
  }
  fillTransactionReview(details);
  return new Promise((resolve, reject) => {
    const handleClose = () => {
      if (dialog.returnValue === "default") resolve(true);
      else {
        const error = new Error(details.declineError || "Signature declined for now. The checklist step is saved and can be resumed later.");
        error.macaroniDeclined = true;
        reject(error);
      }
    };
    dialog.addEventListener("close", handleClose, { once: true });
    dialog.showModal();
  });
}

function requestOperationHashRecovery(details = {}) {
  const dialog = $("operationHashRecoveryDialog");
  if (!dialog || typeof dialog.showModal !== "function") {
    throw new Error("This browser cannot display the required wallet outcome check. The step remains locked.");
  }
  $("operationHashRecoverySummary").textContent = details.blocker ||
    "Macaroni cannot yet prove whether the wallet broadcast the reviewed transaction.";
  $("recoveryOperationHash").value = "";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve({
      choice: dialog.returnValue || "cancel",
      operationHash: $("recoveryOperationHash").value.trim(),
    }), { once: true });
    dialog.showModal();
  });
}

async function reviewedWalletOperation(method, transferOpts, estimateOpts, review) {
  const stepId = review.stepId;
  const existing = await guardLaunchRetry(stepId);
  const limits = await MD.estimateWalletOp(method, transferOpts || {}, estimateOpts || {});
  try {
    await requestTransactionReview({
      ...review,
      existing,
      fee: `${MD.fmtTez(limits.fee || 0)} · live-measured now`,
      storage: `${limits.storageLimit || 0} byte limit · up to ${MD.fmtTez(limits.storageFeeMutez || 0)} · live-measured now`,
    });
  } catch (error) {
    writeLaunchStep(stepId, { status: "declined", message: error.message || String(error) });
    throw error;
  }
  writeLaunchStep(stepId, {
    status: "awaiting-signature",
    action: review.action,
    entrypoint: review.entrypoint || "",
    contract: review.contract || state.contract || "",
    feeMutez: limits.fee || 0,
    storageLimit: limits.storageLimit || 0,
  });
  const sendOpts = {
    ...(transferOpts || {}),
    gasLimit: limits.gasLimit,
    storageLimit: limits.storageLimit,
  };
  if (limits.fee != null) sendOpts.fee = limits.fee;
  try {
    const operation = await MD.withRpcFallback(() => method.send(sendOpts));
    const hash = creatorOperationHash(operation);
    if (!hash) throw new Error("wallet did not return an operation hash");
    writeLaunchStep(stepId, { status: "submitted", hash, link: creatorOperationLink(hash), message: "Wallet submitted the operation; waiting for confirmation." });
    return operation;
  } catch (error) {
    writeLaunchStep(stepId, {
      status: error.macaroniDeclined ? "declined" : "failed",
      message: error.message || String(error),
    });
    throw error;
  }
}

function markReviewedOperationApplied(stepId, operation) {
  const hash = creatorOperationHash(operation) || launchStep(stepId)?.hash || "";
  writeLaunchStep(stepId, { status: "applied", hash, link: creatorOperationLink(hash), message: "Independently indexed as applied." });
}

async function runReviewedContractOperation(method, transferOpts, estimateOpts, review) {
  const existing = await reconcileLaunchStep(review.stepId);
  if (existing?.status === "applied") {
    log(`${review.entrypoint || review.stepId} already applied — skipping duplicate submission`);
    return null;
  }
  const operation = await reviewedWalletOperation(method, transferOpts, estimateOpts, review);
  await operation.confirmation(1);
  await MD.assertOperationApplied(operation, {
    network: state.network,
    contractAddress: review.contract || state.contract,
    entrypoint: review.indexedEntrypoint || review.entrypoint,
  });
  markReviewedOperationApplied(review.stepId, operation);
  return operation;
}

function normalizeState() {
  if (!MD.getNetworks()[state.network]) state.network = "shadownet";
  if (!state.drop || typeof state.drop !== "object") state.drop = freshDropState().drop;
  state.drop.profileId = normalizeProfileId(state.drop.profileId);
  state.drop.contractVersion = normalizeContractVersion(state.drop.contractVersion);
  if (state.drop.profileId !== MACARONI_SECURE_PROFILE_ID) {
    state.drop.contractVersion = normalizeContractVersion(state.drop.profileId);
  }
  state.drop.royaltyAddr = normalizeOptionalAddress(state.drop.royaltyAddr);
  state.drop.treasuryAddr = normalizeOptionalAddress(state.drop.treasuryAddr);
  if (!Array.isArray(state.drop.placeholderPool)) state.drop.placeholderPool = [];
  state.drop.minterRoyaltiesEnabled = !!state.drop.minterRoyaltiesEnabled;
  state.drop.minterRoyaltyPct = Number(state.drop.minterRoyaltyPct || 0);
  state.drop.minterRoyaltyMode = normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode);
  state.drop.royaltyUpdaterAddr = normalizeOptionalAddress(state.drop.royaltyUpdaterAddr);
  state.drop.royaltyUpdateEndpoint = normalizeOptionalHttpUrl(state.drop.royaltyUpdateEndpoint);
  state.drop.revealOperator = normalizeOptionalAddress(state.drop.revealOperator);
  if (!["rolling-delay", "absolute-time", "after-sellout"].includes(state.drop.laterPolicy)) {
    state.drop.laterPolicy = "rolling-delay";
  }
  state.drop.revealAt = String(state.drop.revealAt || "");
  state.drop.claimIntervalSeconds = Math.max(0, Math.round(Number(state.drop.claimIntervalSeconds || 0)));
  state.drop.legacyRiskAcknowledged = !!state.drop.legacyRiskAcknowledged;
  state.drop.legacyRiskAcknowledgedAt = String(state.drop.legacyRiskAcknowledgedAt || "");
  state.drop.legacyRiskWarning = String(state.drop.legacyRiskWarning || "");
  if (!state.infrastructure || typeof state.infrastructure !== "object") {
    state.infrastructure = freshDropState().infrastructure;
  }
  if (!["wtfos-managed", "companion"].includes(state.infrastructure.kind)) {
    state.infrastructure.kind = IS_NATIVE_APP ? "companion" : "wtfos-managed";
  }
  if (!["pin_on_claim", "public_prepin_private_manifest"].includes(state.infrastructure.assetStrategy)) {
    state.infrastructure.assetStrategy = "pin_on_claim";
  }
  state.infrastructure.publicPrepinRiskAcknowledged = !!state.infrastructure.publicPrepinRiskAcknowledged;
  state.infrastructure.publicPrepinRiskAcknowledgedAt = String(state.infrastructure.publicPrepinRiskAcknowledgedAt || "");
  state.infrastructure.manuallySelected = !!state.infrastructure.manuallySelected;
  if (!state.infrastructure.readiness || typeof state.infrastructure.readiness !== "object") {
    state.infrastructure.readiness = freshDropState().infrastructure.readiness;
  }
  if (!state.infrastructure.privateInventory || typeof state.infrastructure.privateInventory !== "object") {
    state.infrastructure.privateInventory = freshDropState().infrastructure.privateInventory;
  }
  state.infrastructure.privateInventory.companionCoverUploadId =
    String(state.infrastructure.privateInventory.companionCoverUploadId || "");
  state.infrastructure.privateInventory.companionCoverUploaded =
    !!state.infrastructure.privateInventory.companionCoverUploaded;
  if (state.drop.profileId === MACARONI_SECURE_PROFILE_ID) {
    state.infrastructure.readiness = secureReadinessFailure(
      "checking",
      "Secure V3.5 readiness must be reverified for this session; browser-saved readiness is never trusted."
    );
    state.infrastructure.privateInventory.ready = false;
  }
  if (!state.launchJournal || typeof state.launchJournal !== "object") {
    state.launchJournal = { version: LAUNCH_JOURNAL_VERSION, steps: {} };
  }
  state.launchJournal.version = LAUNCH_JOURNAL_VERSION;
  if (!state.launchJournal.steps || typeof state.launchJournal.steps !== "object") state.launchJournal.steps = {};
  if (!state.pin || typeof state.pin !== "object") state.pin = freshDropState().pin;
  delete state.pin.jwt;
  if (!state.pin.gateway) state.pin.gateway = MD.DEFAULT_GATEWAY;
  if (!Array.isArray(state.tokens)) state.tokens = [];
  state.tokens.forEach((t) => {
    if (!t || typeof t !== "object") return;
    t.quantity = normalizeTokenQuantity(t.quantity);
    t.previewCid = t.previewCid || "";
    t.previewMime = t.previewMime || "";
    t.previewBytes = Number(t.previewBytes || 0);
    t.metadataNonce = t.metadataNonce || "";
    t.metadataCommitment = t.metadataCommitment || "";
    t.commitmentMetadataCid = t.commitmentMetadataCid || "";
    if (!t.secureUploads || typeof t.secureUploads !== "object") t.secureUploads = {};
    if (tokenNeedsMediaPreview(t) && !t.previewCid) t.metadataCid = "";
    if (!t.metadataCid || t.commitmentMetadataCid !== t.metadataCid) {
      t.metadataNonce = "";
      t.metadataCommitment = "";
      t.commitmentMetadataCid = "";
    }
  });
  if (!Array.isArray(state.stages)) state.stages = [];
  if (!state.page || typeof state.page !== "object") state.page = freshDropState().page;
  state.page.theme = sanitizeThemeName(state.page.theme);
  state.page.accent = sanitizeCssColor(state.page.accent);
  state.page.font = sanitizeFontStack(state.page.font);
  state.page.css = "";
  state.page.shareTwitter = shareFieldText(state.page.shareTwitter, 160);
  state.page.shareBsky = shareFieldText(state.page.shareBsky, 160);
  state.page.shareText = shareFieldText(state.page.shareText);
}

function replaceState(next) {
  const defaults = freshDropState();
  const input = next && typeof next === "object" ? next : {};
  const merged = {
    ...defaults,
    ...input,
    drop: { ...defaults.drop, ...(input.drop && typeof input.drop === "object" ? input.drop : {}) },
    infrastructure: {
      ...defaults.infrastructure,
      ...(input.infrastructure && typeof input.infrastructure === "object" ? input.infrastructure : {}),
      readiness: {
        ...defaults.infrastructure.readiness,
        ...(input.infrastructure?.readiness && typeof input.infrastructure.readiness === "object"
          ? input.infrastructure.readiness
          : {}),
      },
      privateInventory: {
        ...defaults.infrastructure.privateInventory,
        ...(input.infrastructure?.privateInventory && typeof input.infrastructure.privateInventory === "object"
          ? input.infrastructure.privateInventory
          : {}),
      },
    },
    pin: { ...defaults.pin, ...(input.pin && typeof input.pin === "object" ? input.pin : {}) },
    tokens: Array.isArray(input.tokens) ? input.tokens : defaults.tokens,
    stages: Array.isArray(input.stages) ? input.stages : defaults.stages,
    page: { ...defaults.page, ...(input.page && typeof input.page === "object" ? input.page : {}) },
    launchJournal: {
      ...defaults.launchJournal,
      ...(input.launchJournal && typeof input.launchJournal === "object" ? input.launchJournal : {}),
      steps: input.launchJournal?.steps && typeof input.launchJournal.steps === "object"
        ? input.launchJournal.steps
        : defaults.launchJournal.steps,
    },
  };
  if (!input.drop?.profileId && input.drop?.contractVersion) {
    merged.drop.profileId = normalizeContractVersion(input.drop.contractVersion);
  }
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, merged);
  normalizeState();
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) replaceState(JSON.parse(raw));
    else normalizeState();
    save();
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
const RESERVED_COLS = new Set(["id", "name", "description", "tags", "quantity"]);

async function onCsv(file) {
  if (isSecureV35Profile() && hasSecureProjectRegistration()) {
    return notify("The token sheet is locked to this recoverable secure setup. Start a new drop before changing inventory or edition quantities.", "warn");
  }
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
        quantity: normalizeTokenQuantity(r.quantity),
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
        quantity: normalizeTokenQuantity(t.quantity),
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
        t.metadataNonce = "";
        t.metadataCommitment = "";
        t.commitmentMetadataCid = "";
        const privatelyStaged = (secureV35SetupSnapshot?.privateInventory || []).some((asset) =>
          asset.kind === "metadata" && Number(asset.tokenId) === t.id - 1
        );
        if (isSecureV35Profile() && !privatelyStaged) t.secureUploads = {};
      }
      t.fileName = f.name;
      t.mediaBytes = f.size;
      t.mediaMime = f.type || "application/octet-stream";
    }
  }
}

function renderTokens() {
  const total = state.tokens.length;
  const editions = tokenEditionTotal();
  const pinned = state.tokens.filter((t) => t.metadataCid).length;
  const privatelyStagedIds = new Set(
    (secureV35SetupSnapshot?.privateInventory || [])
      .filter((asset) => asset.kind === "metadata")
      .map((asset) => Number(asset.tokenId))
  );
  const privatelyStaged = privatelyStagedIds.size;
  const withArt = state.tokens.filter((token) => isSecureV35Profile()
    ? privatelyStagedIds.has(token.id - 1) || mediaFiles.has(String(token.id))
    : token.fileName).length;
  const policy = artifactSizePolicy();
  const averageOk = !policy.sizes.length || policy.averageBytes <= OBJKT_ARTIFACT_AVERAGE_BYTES;
  $("tokenSummary").innerHTML =
    `<span class="pill ${total ? "ok" : ""}">${total} token row${total === 1 ? "" : "s"}</span>` +
    `<span class="pill ${editions ? "ok" : ""}">${editions} edition${editions === 1 ? "" : "s"}</span>` +
    `<span class="pill ${withArt === total && total ? "ok" : "warn"}">${withArt}/${total} artworks matched</span>` +
    (isSecureV35Profile()
      ? `<span class="pill ${privatelyStaged === total && total ? "ok" : ""}">${privatelyStaged}/${total} privately staged</span>`
      : `<span class="pill ${pinned === total && total ? "ok" : ""}">${pinned}/${total} pinned</span>`) +
    `<span class="pill ${averageOk ? "ok" : "bad"}">avg ${sizeLabel(policy.averageBytes)} / 250 MB</span>`;

  const stageButton = $("btnStagePrivate");
  if (stageButton) {
    stageButton.disabled = !isSecureV35Profile() || state.infrastructure.readiness?.ready !== true ||
      !total || withArt !== total || state.infrastructure.privateInventory?.ready === true;
    stageButton.textContent = state.infrastructure.privateInventory?.ready
      ? "Private inventory staged ✓"
      : privatelyStaged > 0 ? "Continue private staging" : "Stage private artwork";
  }
  if ($("privateStagingStatus")) {
    $("privateStagingStatus").textContent = isSecureV35Profile()
      ? state.infrastructure.privateInventory?.reason || "Private inventory has not been staged."
      : "Private staging is used only by Secure V3.5.";
    $("privateStagingStatus").className = state.infrastructure.privateInventory?.ready ? "ok" : "muted";
  }

  const tbl = $("tokenTable");
  if (!total) { tbl.innerHTML = ""; return; }
  let html = `<tr><th></th><th>id</th><th>editions</th><th>name</th><th>traits</th><th>artifact</th><th>${isSecureV35Profile() ? "Secure status" : "IPFS"}</th></tr>`;
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
    const pin = isSecureV35Profile()
      ? privatelyStagedIds.has(t.id - 1)
        ? `<span class="pill ok">private + committed</span>`
        : `<span class="pill">not staged</span>`
      : t.metadataCid
      ? `<span class="pill ok">pinned</span>`
      : tokenNeedsMediaPreview(t) && t.mediaCid && !t.previewCid
        ? `<span class="pill warn">media pinned, token preview pending</span>`
        : t.previewCid
          ? `<span class="pill warn">media + preview pinned, metadata pending</span>`
          : t.mediaCid
            ? `<span class="pill warn">media pinned, metadata pending</span>`
            : `<span class="pill">—</span>`;
    html += `<tr><td>${img}</td><td class="mono">${t.id}</td><td>${normalizeTokenQuantity(t.quantity)}</td><td>${esc(t.name)}</td><td class="muted">${t.attributes.length}</td><td>${art}</td><td>${pin}</td></tr>`;
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
    ? { kind: "pinata", jwt: sessionPinJwt }
    : { kind: "node", url: state.pin.url };
}

function royaltyShares() {
  const pct = Number(state.drop.royaltyPct || 0);
  const addr = state.drop.royaltyAddr || MD.getAccount();
  if (!pct || !addr) return null;
  // objkt-compatible: decimals 4 → 10% = 1000
  return { decimals: 4, shares: { [addr]: Math.round(pct * 100) } };
}

function royaltyPolicyMetadata() {
  if (!minterRoyaltiesEnabled()) return undefined;
  return {
    minterPoolBps: minterRoyaltyBps(),
    mode: normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode),
    updater: state.drop.royaltyUpdaterAddr || MD.getAccount() || "",
    mutableUntil:
      normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode) === "rolling_pool"
        ? "sellout_or_creator_lock"
        : "first_mint_sync",
  };
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
  token.metadataNonce = "";
  token.metadataCommitment = "";
  token.commitmentMetadataCid = "";
  save();
}

function buildTokenMetadata(t) {
  const creator = MD.getAccount() || state.drop.royaltyAddr || "";
  const artifact = "ipfs://" + t.mediaCid;
  const cover = state.drop.coverCid ? "ipfs://" + state.drop.coverCid : "";
  const quantity = normalizeTokenQuantity(t.quantity);
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
    isBooleanAmount: quantity === 1,
    editions: quantity,
    supply: quantity,
    symbol: state.drop.symbol || undefined,
    artifactUri: artifact,
    displayUri: display,
    thumbnailUri: display,
    minter: creator || undefined,
    creators: creator ? [creator] : undefined,
    formats,
    tags: t.tags && t.tags.length ? t.tags : undefined,
    attributes: t.attributes.length ? t.attributes : undefined,
    macaroni: {
      contractVersion: macaroniContractProfile().id,
      royaltyPolicy: royaltyPolicyMetadata(),
    },
  };
  const roy = royaltyShares();
  if (roy) meta.royalties = roy;
  Object.keys(meta).forEach((k) => meta[k] === undefined && delete meta[k]);
  return meta;
}

function buildSecurePrivateTokenMetadata(t) {
  const creator = MD.getAccount() || state.drop.royaltyAddr || "";
  const quantity = normalizeTokenQuantity(t.quantity);
  const meta = {
    name: t.name,
    description: t.description || state.drop.description,
    decimals: 0,
    isBooleanAmount: quantity === 1,
    editions: quantity,
    supply: quantity,
    symbol: state.drop.symbol || undefined,
    minter: creator || undefined,
    creators: creator ? [creator] : undefined,
    tags: t.tags && t.tags.length ? t.tags : undefined,
    attributes: t.attributes.length ? t.attributes : undefined,
    macaroni: {
      contractVersion: MACARONI_SECURE_PROFILE_ID,
      privateUntilClaim: state.infrastructure.assetStrategy === "pin_on_claim",
      royaltyPolicy: royaltyPolicyMetadata(),
    },
  };
  const royalties = royaltyShares();
  if (royalties) meta.royalties = royalties;
  Object.keys(meta).forEach((key) => meta[key] === undefined && delete meta[key]);
  return meta;
}

async function stageSecurePrivateInventory() {
  readForm();
  clearNotice();
  if (!isSecureV35Profile()) return notify("Private staging is available only for Secure V3.5.", "warn", "privateStagingStatus");
  if (state.infrastructure.readiness?.ready !== true) {
    return notify(state.infrastructure.readiness?.reason || "Secure private staging is not ready.", "err", "privateStagingStatus");
  }
  if (!MD.getAccount()) return notify("Connect your creator wallet before creating the recoverable private setup.", "err", "privateStagingStatus");
  if (!state.drop.title || !state.drop.description) return notify("Add the drop title and description first.", "err", "privateStagingStatus");
  if (!state.tokens.length) return notify("Add the token sheet first.", "err", "privateStagingStatus");
  if (hasSecureProjectRegistration() && !secureV35SetupSnapshot) {
    try {
      await refreshManagedV35Setup();
    } catch (error) {
      return notify(error.message || String(error), "err", "privateStagingStatus");
    }
  }
  const missing = state.tokens.filter((token) => !mediaFiles.get(String(token.id)) &&
    !(secureV35SetupSnapshot?.privateInventory || []).some((asset) => asset.kind === "metadata" && Number(asset.tokenId) === token.id - 1));
  if (missing.length) {
    return notify(`Re-select artwork for ${missing.length} unstaged token row${missing.length === 1 ? "" : "s"}. Private files are never saved in the browser draft.`, "err", "privateStagingStatus");
  }
  try {
    assertArtifactSizePolicy({ requireKnownSizes: true });
    if (state.drop.royaltyAddr && !MD.isAddress(state.drop.royaltyAddr)) {
      throw new Error("Enter a valid royalty receiver or clear it to use the connected creator wallet.");
    }
    if (creatorRoyaltyBps() + minterRoyaltyBps() > 10_000) {
      throw new Error("Creator royalties plus the minter royalty pool cannot exceed 100%.");
    }
    const button = $("btnStagePrivate");
    button.disabled = true;
    setStatus("privateStagingStatus", "Creating or restoring the durable private setup…", "muted");
    if (state.infrastructure.kind === "companion") {
      await stageCompanionV35PrivateInventory();
      setStatus("privateStagingStatus", "Private inventory encrypted, committed, and recoverable in Companion ✓", "ok");
      log(`Secure V3.5 Companion inventory staged: ${state.tokens.length} token rows / ${tokenEditionTotal()} physical units.`);
      return;
    }
    let setup = await ensureManagedV35Registration();
    await ensureManagedV35PublicMetadata(setup);
    setup = await refreshManagedV35Setup();
    const stagedIds = new Set((setup?.privateInventory || [])
      .filter((asset) => asset.kind === "metadata")
      .map((asset) => Number(asset.tokenId)));
    const remaining = state.tokens.filter((token) => !stagedIds.has(token.id - 1));
    for (let index = 0; index < remaining.length; index += 1) {
      const token = remaining[index];
      const artifact = mediaFiles.get(String(token.id));
      if (!artifact) throw new Error(`Re-select the private artwork file for token ${token.id}.`);
      const metadata = buildSecurePrivateTokenMetadata(token);
      const form = new FormData();
      form.append("registrationDigest", state.infrastructure.privateInventory.registrationDigest);
      form.append("tokenId", String(token.id - 1));
      form.append("quantity", String(normalizeTokenQuantity(token.quantity)));
      form.append("metadata", JSON.stringify(metadata));
      form.append("artifact", artifact, artifact.name);
      let displayFile = null;
      let thumbnailFile = null;
      if (tokenNeedsMediaPreview(token)) {
        setStatus("privateStagingStatus", `Preparing a private Objkt preview for ${token.name}…`, "muted");
        const preview = await makeStandaloneMediaPreview(artifact);
        if (!preview?.blob || preview.blob.size > OBJKT_TOKEN_PREVIEW_MAX_BYTES) {
          throw new Error(`Could not make the required private ${OBJKT_TOKEN_PREVIEW_LABEL} for token ${token.id}.`);
        }
        const previewName = `${token.id}-objkt-preview.${preview.ext || "png"}`;
        displayFile = new File([preview.blob], previewName, { type: preview.blob.type || "image/png" });
        thumbnailFile = new File([preview.blob], previewName, { type: preview.blob.type || "image/png" });
        form.append("display", displayFile, displayFile.name);
        form.append("thumbnail", thumbnailFile, thumbnailFile.name);
      } else if (tokenNeedsCover(token)) {
        if (!coverFile) throw new Error(`Token ${token.id} needs the collection cover re-selected as its private Objkt preview.`);
        displayFile = coverFile;
        thumbnailFile = coverFile;
        form.append("display", displayFile, displayFile.name);
        form.append("thumbnail", thumbnailFile, thumbnailFile.name);
      }
      setStatus("privateStagingStatus", `Encrypting and staging token ${token.id} (${index + 1}/${remaining.length})…`, "muted");
      const descriptor = (file) => file ? {
        fileName: file.name,
        byteSize: file.size,
        mimeType: file.type || "application/octet-stream",
      } : null;
      const ticketResponse = await secureManagedFetch(
        `/api/macaroni/v35/drops/${state.infrastructure.privateInventory.projectId}/private-assets/upload-ticket`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationDigest: state.infrastructure.privateInventory.registrationDigest,
            tokenId: token.id - 1,
            quantity: normalizeTokenQuantity(token.quantity),
            metadata,
            artifact: descriptor(artifact),
            display: descriptor(displayFile),
            thumbnail: descriptor(thumbnailFile),
          }),
        }
      );
      const ticket = await ticketResponse.json().catch(() => ({}));
      if (!ticketResponse.ok || ticket.schema !== "wtfos.macaroni-v35-private-upload-ticket.v1"
        || !ticket.token || !ticket.uploadUrl) {
        throw new Error(ticket.error || `Could not authorize private upload for token ${token.id}.`);
      }
      const response = await MD.uploadFormData(ticket.uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${ticket.token}` },
        body: form,
        credentials: "omit",
      }, {
        onUploadProgress: ({ loaded, total }) => {
          const progress = total > 0 ? ` ${Math.min(100, Math.round((loaded / total) * 100))}%` : "";
          setStatus(
            "privateStagingStatus",
            `Securely uploading token ${token.id} (${index + 1}/${remaining.length})…${progress}`,
            "muted"
          );
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.tokenRowStaged !== true) {
        throw new Error(result.error || `Private staging failed for token ${token.id}.`);
      }
      setup = await refreshManagedV35Setup();
    }
    setup = await refreshManagedV35Setup();
    if (!secureSetupStepComplete(setup, "stage_private_assets")) {
      throw new Error("The private files were accepted, but the complete inventory has not passed the durable staging check yet.");
    }
    setStatus("privateStagingStatus", "Private inventory staged, encrypted, committed, and recoverable ✓", "ok");
    log(`Secure V3.5 private inventory staged: ${state.tokens.length} token rows / ${tokenEditionTotal()} physical units.`);
  } catch (error) {
    state.infrastructure.privateInventory.ready = false;
    state.infrastructure.privateInventory.reason = error.message || String(error);
    save();
    notify(error.message || String(error), error.macaroniDeclined ? "warn" : "err", "privateStagingStatus");
  } finally {
    renderTokens();
    renderLaunchChecklist();
  }
}

function companionUploadState(token) {
  if (!token.secureUploads || typeof token.secureUploads !== "object") token.secureUploads = {};
  return token.secureUploads;
}

async function ensureCompanionTokenUpload(dropRef, token, key, file) {
  if (!file) throw new Error(`Re-select the ${key} file for token ${token.id}.`);
  const uploads = companionUploadState(token);
  const idKey = `${key}Id`;
  const doneKey = `${key}Uploaded`;
  const uploadId = isCompanionProjectId(uploads[idKey]) ? uploads[idKey] : newClientSetupId();
  uploads[idKey] = uploadId;
  save();
  if (!uploads[doneKey]) {
    await putCompanionPrivateUpload(dropRef, uploadId, file);
    uploads[doneKey] = true;
    save();
  }
  return uploadId;
}

async function stageCompanionV35PrivateInventory() {
  let setup = await ensureCompanionV35Registration();
  await ensureCompanionV35PublicMetadata(setup);
  setup = await refreshManagedV35Setup();
  const dropRef = state.infrastructure.privateInventory.projectId;
  const stagedIds = new Set((setup?.privateInventory || [])
    .filter((asset) => asset.kind === "metadata")
    .map((asset) => Number(asset.tokenId)));
  const remaining = state.tokens.filter((token) => !stagedIds.has(token.id - 1));
  for (let index = 0; index < remaining.length; index += 1) {
    const token = remaining[index];
    const artifact = mediaFiles.get(String(token.id));
    if (!artifact) throw new Error(`Re-select the private artwork file for token ${token.id}.`);
    setStatus(
      "privateStagingStatus",
      `Encrypting token ${token.id} in Companion (${index + 1}/${remaining.length})…`,
      "muted"
    );
    const uploadId = await ensureCompanionTokenUpload(dropRef, token, "artifact", artifact);
    let displayUploadId;
    let thumbnailUploadId;
    if (tokenNeedsMediaPreview(token)) {
      const uploads = companionUploadState(token);
      const needsPreview = !uploads.displayUploaded || !uploads.thumbnailUploaded;
      let preview = null;
      if (needsPreview) {
        setStatus("privateStagingStatus", `Preparing a private Objkt preview for ${token.name}…`, "muted");
        preview = await makeStandaloneMediaPreview(artifact);
        if (!preview?.blob || preview.blob.size > OBJKT_TOKEN_PREVIEW_MAX_BYTES) {
          throw new Error(`Could not make the required private ${OBJKT_TOKEN_PREVIEW_LABEL} for token ${token.id}.`);
        }
      }
      displayUploadId = await ensureCompanionTokenUpload(dropRef, token, "display", preview?.blob || artifact);
      thumbnailUploadId = await ensureCompanionTokenUpload(dropRef, token, "thumbnail", preview?.blob || artifact);
    } else if (tokenNeedsCover(token)) {
      if (!coverFile) throw new Error(`Token ${token.id} needs the collection cover re-selected as its private Objkt preview.`);
      displayUploadId = await ensureCompanionTokenUpload(dropRef, token, "display", coverFile);
      thumbnailUploadId = await ensureCompanionTokenUpload(dropRef, token, "thumbnail", coverFile);
    }
    const response = await secureCompanionFetch(
      `/projects/${encodeURIComponent(dropRef)}/tokens/${token.id - 1}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          ...(displayUploadId ? { displayUploadId } : {}),
          ...(thumbnailUploadId ? { thumbnailUploadId } : {}),
          quantity: normalizeTokenQuantity(token.quantity),
          metadata: buildSecurePrivateTokenMetadata(token),
        }),
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || Number(result.tokenId) !== token.id - 1 || !/^[0-9a-f]{64}$/i.test(String(result.metadataCommitment || ""))) {
      throw new Error(result.message || result.error || `Companion staging failed for token ${token.id}.`);
    }
    setup = await refreshManagedV35Setup();
  }
  setup = await refreshManagedV35Setup();
  if (!secureSetupStepComplete(setup, "stage_private_assets")) {
    throw new Error("Companion accepted the files, but the fixed physical inventory is not complete yet.");
  }
}

function buildPlaceholderMetadata(source, index, poolSize) {
  const artifact = source?.cid ? "ipfs://" + source.cid : state.drop.coverCid ? "ipfs://" + state.drop.coverCid : "";
  if (!artifact) throw new Error("delayed reveal needs an unrevealed placeholder artifact");
  const meta = {
    name: `${state.drop.title || "Drop"} — unrevealed ${poolSize > 1 ? index + 1 : ""}`.trim(),
    description:
      "This token has not been revealed yet. Its creator-committed metadata remains sealed until the contract allows reveal.",
    decimals: 0,
    isBooleanAmount: true,
    symbol: state.drop.symbol || undefined,
    artifactUri: artifact,
    displayUri: artifact,
    thumbnailUri: artifact,
    formats: [{ uri: artifact, mimeType: source?.mime || state.drop.coverMime || "image/png" }],
    macaroni: {
      unrevealedPlaceholder: true,
      placeholderIndex: index,
      placeholderPoolSize: poolSize,
      royaltyPolicy: royaltyPolicyMetadata(),
    },
  };
  const roy = royaltyShares();
  if (roy) meta.royalties = roy;
  Object.keys(meta).forEach((k) => meta[k] === undefined && delete meta[k]);
  return meta;
}

async function pinAll() {
  readForm();
  clearNotice();
  if (isSecureV35Profile()) {
    return notify(
      state.infrastructure.assetStrategy === "public_prepin_private_manifest"
        ? "Secure V3.5 public pre-pinning is performed by the selected Managed or Companion service during staged preparation. This browser never receives a private CID map or reusable pinning credential."
        : "Secure V3.5 does not pre-pin final artwork. It keeps CARs private, confirms the committed NFT mint, then publishes those exact CARs to public IPFS.",
      "warn",
      "pinStatus"
    );
  }
  try {
    assertSelectedContractSupportsDraft();
  } catch (e) {
    return notify(e.message, "err", "pinStatus");
  }
  const provider = pinProvider();
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
  if (minterRoyaltiesEnabled()) {
    if (creatorRoyaltyBps() + minterRoyaltyBps() > 10_000)
      return notify("Creator royalties plus the minter royalty pool cannot exceed 100%.", "err", "pinStatus");
    const updater = state.drop.royaltyUpdaterAddr || MD.getAccount();
    if (!updater || !MD.isAddress(updater))
      return notify("Minter royalties need a valid royalty updater address. Connect your wallet or fill it in.", "err", "pinStatus");
  }

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
    // delayed reveal: creators may provide a pool of unrevealed artifacts.
    // Without an explicit pool, the collection cover remains the fallback.
    if (state.drop.revealMode === "delayed") {
      if (!placeholderFiles.length && !state.drop.coverCid && !placeholderPool().length)
        throw new Error("delayed reveal needs a cover image or at least one unrevealed placeholder image");
      if (placeholderFiles.length) {
        state.drop.placeholderPool = [];
        for (let i = 0; i < placeholderFiles.length; i++) {
          const f = placeholderFiles[i];
          if (!f.type.startsWith("image/")) throw new Error(`${f.name} is not an image placeholder`);
          if (!validateArtifactFile(f)) throw new Error(`${f.name} is too large for an unrevealed placeholder`);
          $("pinStatus").textContent = `pinning unrevealed placeholder ${i + 1}/${placeholderFiles.length}…`;
          const cid = await MD.pinBlob(
            provider,
            f,
            f.name,
            makePinUploadProgress(`unrevealed placeholder ${i + 1}`, f.size)
          );
          state.drop.placeholderPool.push({ name: f.name, mime: f.type || "image/png", cid, metadataCid: "" });
          save();
        }
      }
      if (!placeholderPool().length) {
        state.drop.placeholderPool = [{
          name: "collection-cover",
          mime: state.drop.coverMime || "image/png",
          cid: state.drop.coverCid,
          metadataCid: state.drop.placeholderCid || "",
        }];
      }
      for (let i = 0; i < state.drop.placeholderPool.length; i++) {
        const source = state.drop.placeholderPool[i];
        if (source.metadataCid) continue;
        $("pinStatus").textContent = `pinning unrevealed metadata ${i + 1}/${state.drop.placeholderPool.length}…`;
        source.metadataCid = await MD.pinJson(
          provider,
          buildPlaceholderMetadata(source, i, state.drop.placeholderPool.length),
          `placeholder-${i + 1}.json`
        );
        save();
        log("placeholder pinned: " + source.metadataCid);
      }
      state.drop.placeholderCid = state.drop.placeholderPool[0]?.metadataCid || "";
      save();
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
      if (macaroniContractProfile().usesV3) await ensureTokenCommitment(t);
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
  const planLocked = isSecureV35Profile() && secureSetupStepComplete(secureV35SetupSnapshot, "creator_plan");
  host.innerHTML = "";
  state.stages.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "panel";
    div.style.margin = "10px 0";
    div.innerHTML = `
      <div class="spread">
        <div class="row" style="gap:8px"><h3 style="margin:0">Stage ${i + 1}</h3><span class="muted" data-stage-status="${i}">saved</span></div>
        <div class="row" style="gap:8px">
          <button class="btn small" data-stage-save="${i}" type="button" ${planLocked ? "disabled" : ""}>Save stage</button>
          <button class="btn danger small" data-del="${i}" type="button" ${planLocked ? "disabled" : ""}>remove</button>
        </div>
      </div>
      <div class="grid3">
        <div><label>Start (your local time)</label>
          <input type="datetime-local" data-f="start" data-i="${i}" value="${s.start || ""}" ${planLocked ? "disabled" : ""} /></div>
        <div><label>Price (ꜩ, up to 6 decimals)</label>
          <input type="number" min="0" step="0.000001" data-f="price" data-i="${i}" value="${s.price ?? ""}" ${planLocked ? "disabled" : ""} /></div>
        <div><label>Max per wallet (blank = unlimited)</label>
          <input type="number" min="1" step="1" data-f="maxPerWallet" data-i="${i}" value="${s.maxPerWallet ?? ""}" ${planLocked ? "disabled" : ""} /></div>
      </div>
      <div class="row" style="margin-top:8px">
        <label style="margin:0"><input type="checkbox" data-f="useAllowlist" data-i="${i}" ${s.useAllowlist ? "checked" : ""} ${planLocked ? "disabled" : ""}/> allowlist only</label>
        <input type="file" accept=".csv" data-allow="${i}" style="width:auto" ${planLocked ? "disabled" : ""} />
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
  if ($("btnAddStage")) $("btnAddStage").disabled = planLocked;
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
const STORAGE_PROFILE = Object.freeze({
  inventory: Object.freeze({ storageBase: 400, storagePerUnit: 900 }),
  stages: Object.freeze({ storageBase: 300, storagePerUnit: 300 }),
  allowlist: Object.freeze({ storageBase: 400, storagePerUnit: 260 }),
  reveal: Object.freeze({ storageBase: 400, storagePerUnit: 900 }),
});

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

function revealServiceFetch(path, options) {
  const url = MACARONI_REVEAL_SERVICE_ORIGIN + path;
  return IS_NATIVE_APP
    ? fetch(url, { ...(options || {}), credentials: "omit" })
    : MD.apiFetch(url, options);
}

function automaticRevealRequestUrl() {
  return `${MACARONI_REVEAL_SERVICE_ORIGIN || location.origin}/api/macaroni/reveal-request`;
}

async function automaticRevealOperator() {
  const res = await revealServiceFetch(`/api/macaroni/reveal-operator?network=${encodeURIComponent(state.network)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.enabled || !MD.isAddress(body.address)) {
    throw new Error(body.error || `Automatic V3 reveal is not configured for ${state.network}.`);
  }
  state.drop.revealOperator = body.address;
  save();
  return body.address;
}

async function registerAutomaticV3Reveal(contractAddress) {
  const delaySeconds = state.drop.revealMode === "delayed"
    ? Math.round(Number(state.drop.revealDelayDays) * 86400)
    : 0;
  const stepId = `sync:authorize-automation:${state.drop.revealMode}:${delaySeconds}`;
  const existing = await guardLaunchRetry(stepId);
  if (existing?.status === "applied") {
    log("automatic reveal authorization already registered for these settings — skipping duplicate signature");
    return existing;
  }
  const identity = {
    network: state.network,
    contract: contractAddress,
    administrator: MD.getAccount(),
  };
  const challengeRes = await revealServiceFetch("/api/macaroni/reveal-automation/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
  });
  const challenge = await challengeRes.json().catch(() => ({}));
  if (!challengeRes.ok || !challenge.nonce || !challenge.message) {
    throw new Error(challenge.error || "Could not create automatic reveal wallet challenge");
  }
  try {
    await requestTransactionReview({
      kind: "Wallet signature · no transaction",
      title: "Authorize automatic reveal",
      summary: "This purpose-bound message proves that the connected wallet administers this one contract. It cannot transfer tez or NFTs.",
      action: "Sign the automatic-reveal authorization challenge",
      network: state.network,
      wallet: MD.getAccount(),
      entrypoint: "Off-chain message · no contract entrypoint",
      amount: "0 tez",
      fee: "No network fee",
      storage: "No on-chain storage",
      irreversible: "The fulfillment service stores this authorization for the named contract until it is replaced or the drop ends.",
      ifSign: "The service can submit eligible reveal operations for this contract according to the configured policy.",
      ifDecline: "No authorization is stored. Setup pauses here and can be resumed without repeating completed transactions.",
      existing,
    });
  } catch (error) {
    writeLaunchStep(stepId, { status: "declined", message: error.message || String(error) });
    throw error;
  }
  writeLaunchStep(stepId, {
    status: "awaiting-signature",
    action: "Authorize automatic reveal",
    entrypoint: "off-chain message",
    contract: contractAddress,
  });
  let signed;
  try {
    signed = await MD.signMessage(challenge.message);
  } catch (error) {
    writeLaunchStep(stepId, { status: "failed", message: error.message || String(error) });
    throw error;
  }
  const res = await revealServiceFetch("/api/macaroni/reveal-automation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...identity,
      mode: state.drop.revealMode,
      revealDelaySeconds: delaySeconds,
      tokens: state.tokens.map((token) => ({
        tokenId: token.id - 1,
        metadataUri: "ipfs://" + token.metadataCid,
        nonce: token.metadataNonce,
        commitment: token.metadataCommitment,
      })),
      proof: {
        nonce: challenge.nonce,
        publicKey: signed.publicKey,
        signature: signed.signature,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not register automatic V3 reveal");
  state.drop.revealOperator = body.revealOperator || state.drop.revealOperator;
  save();
  writeLaunchStep(stepId, {
    status: "applied",
    message: "Purpose-bound authorization registered with the automatic reveal service.",
  });
  return body;
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

async function estimateReviewedOrigination(code, storage) {
  const estimate = await MD.withRpcFallback(() => MD.getToolkit().estimate.originate({ code, storage }));
  const rawGas = Number(estimate?.gasLimit);
  const rawStorage = Number(estimate?.storageLimit);
  const rawFee = Number(estimate?.suggestedFeeMutez);
  if (![rawGas, rawStorage, rawFee].every(Number.isFinite)) {
    throw new Error("Could not obtain a complete live origination fee and storage estimate. Nothing was submitted.");
  }
  // Match the existing Macaroni wallet-operation headroom policy in common.js.
  const gasLimit = Math.min(1_040_000, Math.ceil(rawGas * 1.65) + 40_000);
  const storageLimit = Math.min(60_000, Math.ceil(rawStorage * 1.5) + 120);
  const fee = Math.ceil(rawFee * 1.35) + 500;
  const storageFeeMutez = Math.max(Number(estimate?.burnFeeMutez || 0), storageLimit * 250);
  return { gasLimit, storageLimit, fee, storageFeeMutez };
}

function managedV35CreatorPlan() {
  const publicMetadata = managedV35PublicMetadata();
  if (!publicMetadata?.contractMetadataUri) {
    throw new Error("Pin and bind the public collection cover and contract description before preparing deployment.");
  }
  const measured = secureMeasuredFunding();
  if (!measured) throw new Error("The reviewed fulfillment funding policy is unavailable.");
  const records = stageRecords();
  if (!records.length) throw new Error("Configure at least one sale stage before preparing deployment.");
  const stages = records.map((record) => {
    const priceMutez = Number(record.value.price);
    if (priceMutez > 0 && priceMutez < measured.subsidy) {
      throw new Error(
        `Sale stage ${record.key + 1} is priced below the ${formatMeasuredMutez(measured.subsidy)} fixed fulfillment amount. ` +
        "Use a free stage, or raise its per-unit price so automatic fulfillment cannot become underfunded."
      );
    }
    return {
      stage: record.key,
      start: record.value.start,
      priceMutez,
      useAllowlist: record.value.use_allowlist,
      maxPerWallet: record.value.max_per_wallet,
    };
  });
  const allowlist = records.flatMap((record) => (record.allowlist || []).map((row) => {
    if (!IMPLICIT_ACCOUNT_ADDRESS.test(String(row.address || ""))) {
      throw new Error(`Stage ${record.key + 1} contains ${row.address || "an invalid wallet"}. Secure allowlists require a tz1/tz2/tz3/tz4 wallet.`);
    }
    const capacity = Number(row.capacity);
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error(`Stage ${record.key + 1} contains an invalid allowlist capacity.`);
    }
    return { capacity, holder: row.address, stage: record.key };
  }));
  return {
    contractMetadataUri: publicMetadata.contractMetadataUri,
    minterRoyalty: {
      enabled: minterRoyaltiesEnabled(),
      bps: minterRoyaltyBps(),
      mode: normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode) === "rolling_pool" ? 1 : 0,
    },
    stages,
    allowlist,
  };
}

function secureManagedActionStepId(action) {
  return `secure:${String(action?.step || action?.entrypoint || "action")}:${String(action?.attemptId || "pending")}`;
}

function validateSecureManagedAction(action) {
  if (!action || !Number.isSafeInteger(Number(action.attemptId)) || Number(action.attemptId) < 1) {
    throw new Error("The managed service did not return a durable action identifier.");
  }
  if (!/^[0-9a-f]{64}$/.test(String(action.intentDigest || ""))) {
    throw new Error("The managed service returned an invalid immutable intent digest.");
  }
  if (!/^[A-Za-z0-9:._-]{1,200}$/.test(String(action.requestId || ""))) {
    throw new Error("The fulfillment service returned an invalid durable request identifier.");
  }
  if (action.network !== state.network) throw new Error("The prepared action is for a different Tezos network.");
  if (action.signer !== MD.getAccount()) throw new Error("The prepared action belongs to a different creator wallet.");
  const amountMutez = Number(action.amountMutez || 0);
  if (!Number.isSafeInteger(amountMutez) || amountMutez < 0) throw new Error("The prepared action has an invalid tez amount.");
  if (action.entrypoint === "origination") {
    if (!Array.isArray(action.parameters?.code) || !action.parameters?.storage) {
      throw new Error("The reviewed origination code or storage is missing.");
    }
  } else {
    if (!MD.isAddress(String(action.target || ""))) throw new Error("The prepared transaction target is invalid.");
    if (!action.parameters || !("micheline" in action.parameters)) {
      throw new Error("The exact reviewed transaction parameters are missing.");
    }
    if (isValidKt1Address(state.contract) && action.step !== "reveal_creator_key" && action.target !== state.contract) {
      throw new Error("The prepared transaction does not target this project's attached contract.");
    }
  }
  return action;
}

function paddedSecureActionLimits(estimate) {
  const gas = Number(estimate?.gasLimit);
  const storage = Number(estimate?.storageLimit);
  const fee = Number(estimate?.suggestedFeeMutez);
  const opSize = Number(estimate?.opSize ?? estimate?.operationSize);
  if (![gas, storage, fee].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      !Number.isSafeInteger(opSize) || opSize < 1) {
    throw new Error("The live Tezos estimate is incomplete; nothing will be submitted.");
  }
  const gasLimit = Math.min(1_040_000, Math.ceil(gas * 1.65) + 40_000);
  const bufferedEstimateFee = Math.ceil(fee * 1.35) + 500;
  const paddedGasFeeFloor = Number(MD.feeFloorForGasLimit(gasLimit, estimate));
  if (!Number.isSafeInteger(paddedGasFeeFloor) || paddedGasFeeFloor < 0) {
    throw new Error("The live Tezos estimate cannot produce a safe fee for the padded gas limit; nothing will be submitted.");
  }
  return {
    gasLimit,
    storageLimit: Math.min(60_000, Math.ceil(storage * 1.5) + 120),
    fee: Math.max(bufferedEstimateFee, paddedGasFeeFloor),
    storageFeeMutez: Math.max(0, Number(estimate?.totalCostMutez || 0) - fee),
  };
}

async function secureManagedActionLimits(action) {
  // The server/Companion creates this estimate with the creator's public key
  // installed on a read-only Taquito signer. The browser toolkit intentionally
  // has only a wallet provider, so calling toolkit.estimate here would fail
  // before the review dialog for unrevealed keys and originations.
  return paddedSecureActionLimits(action.liveEstimate);
}

function secureActionReviewText(action, limits) {
  const amount = Number(action.amountMutez || 0);
  const explanation = action.explanation || {};
  const title = {
    reveal_creator_key: "Reveal this wallet's public key",
    originate_contract: "Deploy your Secure V3.5 collection",
    add_tokens_v35: "Load committed token rows",
    append_token_slots_v35: "Load weighted edition slots",
    set_stages: "Set sale stages",
    set_allowlist: "Set an allowlist batch",
    finalize_setup: "Permanently lock the complete setup",
    fund_fulfillment_reserve: "Fund automatic fulfillment",
    activate_sale: "Open the sale",
    close_sale: "Permanently close the sale",
  }[action.step] || "Review the next secure setup action";
  const irreversible = action.step === "finalize_setup"
    ? "Token commitments, edition quantities, allocation slots, and sale configuration become permanent."
    : action.step === "activate_sale"
      ? "Collectors can purchase after this operation is finalized. The saved setup cannot be replaced."
      : action.step === "close_sale"
        ? "The sale can never reopen. Existing paid claims still finish before unused reserve returns."
        : action.step === "fund_fulfillment_reserve"
          ? "The amount is held by this collection contract for successful fulfillment calls. It returns only after final fulfillment or a safe permanent close."
          : explanation.whatYouAreSigning || "Only the exact server-issued action shown here is submitted.";
  return {
    kind: action.entrypoint === "origination" ? "Contract origination" : "Secure setup transaction",
    title,
    summary: explanation.whatYouAreSigning || "Macaroni prepared this exact action from your locked creator plan and live chain state.",
    action: explanation.whatYouAreSigning || title,
    network: action.network,
    wallet: action.signer,
    entrypoint: action.entrypoint,
    amount: formatMeasuredMutez(amount),
    fee: `${formatMeasuredMutez(limits.fee)} wallet fee limit · padded from the live estimate`,
    storage: `${limits.storageLimit} byte limit · up to ${formatMeasuredMutez(limits.storageFeeMutez)} from the live estimate`,
    irreversible,
    ifSign: explanation.ifYouSign || "This exact action is submitted and durably reconciled before the checklist advances.",
    ifDecline: explanation.ifYouDoNotSign || "Nothing changes on-chain. The checklist stays at this step for later.",
  };
}

async function recordSecureManagedWalletRejection(action, reason) {
  const projectId = state.infrastructure.privateInventory?.projectId;
  if (!hasSecureProjectRegistration()) return;
  const companion = state.infrastructure.kind === "companion";
  const response = await (companion
    ? secureCompanionFetch(
        `/projects/${encodeURIComponent(projectId)}/creator-attempts/${action.attemptId}/rejected`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: action.requestId,
            reason: String(reason || "Creator declined before broadcast").slice(0, 500),
            confirmNoBroadcast: true,
          }),
        }
      )
    : secureManagedFetch(
        `/api/macaroni/v35/drops/${Number(projectId)}/attempts/${action.attemptId}/wallet-rejected`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: action.requestId,
            reason: String(reason || "Creator declined before broadcast").slice(0, 500),
            confirmNoBroadcast: true,
          }),
        }
      ));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || "Macaroni could not record the confirmed no-broadcast outcome.");
  }
}

async function recordSecureWalletPromptStarted(action) {
  const projectId = state.infrastructure.privateInventory?.projectId;
  if (!hasSecureProjectRegistration()) {
    throw new Error("The durable secure project is missing; the wallet was not opened.");
  }
  const response = state.infrastructure.kind === "companion"
    ? await secureCompanionFetch(
        `/projects/${encodeURIComponent(projectId)}/creator-attempts/${action.attemptId}/prompt-started`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: action.requestId }),
        }
      )
    : await secureManagedFetch(
        `/api/macaroni/v35/drops/${Number(projectId)}/attempts/${action.attemptId}/wallet-prompt-started`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: action.requestId }),
        }
      );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Macaroni could not durably mark the wallet prompt. Nothing was submitted.");
  }
  if (body.proceedToWalletSend !== true) {
    throw new Error(
      body.operationHash
        ? "Macaroni found an existing operation for this step. Nothing new was submitted; refresh the checklist to reconcile it."
        : "The fulfillment service did not authorize this exact wallet send. Nothing was submitted."
    );
  }
}

function authenticatedRemoteWalletAbort(error, capturedEvent) {
  // Only Beacon's raw OPERATION_REQUEST_ERROR event retains the remote peer
  // and request identities. A Taquito catch object, even one named "aborted",
  // is never enough to release a hashless prompt for retry.
  const candidate = capturedEvent?.errorResponse;
  const caught = error && typeof error === "object" ? error : null;
  const walletErrorType = String(candidate?.errorType || "").trim();
  const walletResponseId = String(candidate?.id || "").trim();
  const walletSenderId = String(candidate?.senderId || "").trim();
  const beaconVersion = String(candidate?.version || "").trim();
  if (String(candidate?.type || "") !== "error") return null;
  if (walletErrorType !== "ABORTED_ERROR") return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(walletResponseId)) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{10,80}$/.test(walletSenderId)) return null;
  if (!beaconVersion || beaconVersion.length > 20) return null;
  // The bundled Octez/Beacon client rethrows the original raw ErrorResponse.
  // Correlating every identity field prevents a delayed event from another
  // wallet request from releasing this action. A transformed catch object has
  // no such identity and deliberately remains quarantined.
  if (!caught
      || String(caught.type || "") !== "error"
      || String(caught.errorType || "") !== walletErrorType
      || String(caught.id || "") !== walletResponseId
      || String(caught.senderId || "") !== walletSenderId
      || String(caught.version || "") !== beaconVersion) return null;
  return { walletErrorType, walletResponseId, walletSenderId, beaconVersion };
}

async function recordSecureWalletPromptAbort(action, evidence) {
  const projectId = state.infrastructure.privateInventory?.projectId;
  if (!hasSecureProjectRegistration()) {
    throw new Error("The durable secure project is missing; the wallet decline cannot be recorded safely.");
  }
  const response = state.infrastructure.kind === "companion"
    ? await secureCompanionFetch(
        `/projects/${encodeURIComponent(projectId)}/creator-attempts/${action.attemptId}/prompt-aborted`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: action.requestId,
            beaconEvent: "OPERATION_REQUEST_ERROR",
            beaconErrorResponse: {
              type: "error",
              errorType: evidence.walletErrorType,
              senderId: evidence.walletSenderId,
              id: evidence.walletResponseId,
              version: evidence.beaconVersion,
            },
          }),
        }
      )
    : await secureManagedFetch(
        `/api/macaroni/v35/drops/${Number(projectId)}/attempts/${action.attemptId}/wallet-prompt-aborted`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: action.requestId,
            walletErrorType: evidence.walletErrorType,
            walletResponseId: evidence.walletResponseId,
            walletSenderId: evidence.walletSenderId,
          }),
        }
      );
  const body = await response.json().catch(() => ({}));
  const safelyRejected = body.state === "wallet_rejected"
    && (state.infrastructure.kind === "companion" || body.retrySafe === true);
  if (!response.ok || !safelyRejected) {
    throw new Error(body.error || body.message || "The remote wallet decline could not be authenticated. This step remains locked for recovery.");
  }
  return body;
}

function durableWalletAbortEvidence(action, evidence) {
  return {
    attemptId: Number(action.attemptId),
    requestId: String(action.requestId),
    walletErrorType: evidence.walletErrorType,
    walletResponseId: evidence.walletResponseId,
    walletSenderId: evidence.walletSenderId,
    beaconVersion: evidence.beaconVersion,
  };
}

async function recoverSecureWalletPromptAborts() {
  for (const local of Object.values(state.launchJournal?.steps || {})) {
    const evidence = local?.walletAbortEvidence;
    if (!evidence) continue;
    const attemptId = Number(evidence.attemptId);
    if (!Number.isSafeInteger(attemptId) || attemptId < 1
        || attemptId !== Number(local.managedAttemptId)
        || typeof evidence.requestId !== "string"
        || !evidence.requestId) {
      throw new Error("A saved wallet-decline receipt does not match its durable setup step. The step remains locked for manual recovery.");
    }
    await recordSecureWalletPromptAbort({ attemptId, requestId: evidence.requestId }, evidence);
    writeLaunchStep(local.stepId, {
      status: "declined",
      managedAttemptId: attemptId,
      walletAbortEvidence: null,
      message: "Your authenticated wallet decline was restored and saved. No chain state changed; this step is ready to try later.",
    });
  }
}

async function recordSecureOperationHash(action, operationHash, originatedContract = "") {
  const hash = String(operationHash || "").trim();
  if (!/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(hash)) {
    throw new Error("Enter the complete Tezos operation hash beginning with o.");
  }
  const projectId = state.infrastructure.privateInventory.projectId;
  const payload = { operationHash: hash };
  if (state.infrastructure.kind === "wtfos-managed" && isValidKt1Address(originatedContract)) {
    payload.originatedContract = originatedContract;
  }
  const response = state.infrastructure.kind === "companion"
    ? await secureCompanionFetch(
        `/projects/${encodeURIComponent(projectId)}/creator-attempts/${action.attemptId}/submitted`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      )
    : await secureManagedFetch(
        `/api/macaroni/v35/drops/${Number(projectId)}/attempts/${action.attemptId}/submitted`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || "The operation hash could not be saved to the durable journal.");
  return { hash, body };
}

async function recordSecureManagedSubmission(action, operation) {
  const hash = creatorOperationHash(operation);
  if (!hash) throw new Error("The wallet did not return an operation hash. No next action will be prepared until this is reconciled.");
  const knownContract = String(operation?.contractAddress || "").trim();
  return recordSecureOperationHash(action, hash, knownContract);
}

async function reconcileSecureManagedAction(action) {
  const projectId = state.infrastructure.privateInventory.projectId;
  const response = state.infrastructure.kind === "companion"
    ? await secureCompanionFetch(
        `/projects/${encodeURIComponent(projectId)}/creator-attempts/${action.attemptId}/reconcile`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      )
    : await secureManagedFetch(
        `/api/macaroni/v35/drops/${Number(projectId)}/attempts/${action.attemptId}/reconcile`,
        { method: "POST" }
      );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The submitted operation could not be reconciled yet.");
  await refreshManagedV35Setup();
  if (state.infrastructure.kind === "companion" && action.step === "activate_sale" && body.state === "applied") {
    await secureCompanionFetch(`/projects/${encodeURIComponent(projectId)}/observe-activation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    await refreshManagedV35Setup();
  }
  return body;
}

async function recoverSecureManagedSubmissionHashes() {
  const projectId = state.infrastructure.privateInventory?.projectId;
  if (!hasSecureProjectRegistration() || !secureV35SetupSnapshot) return;
  const attempts = new Map((secureV35SetupSnapshot.attempts || []).map((attempt) => [Number(attempt.id), attempt]));
  for (const local of Object.values(state.launchJournal?.steps || {})) {
    const attemptId = Number(local?.managedAttemptId);
    const remote = attempts.get(attemptId);
    if (!attemptId || !local?.hash || remote?.operationHash) continue;
    const payload = { operationHash: local.hash };
    if (isValidKt1Address(local.contract)) payload.originatedContract = local.contract;
    const response = state.infrastructure.kind === "companion"
      ? await secureCompanionFetch(
          `/projects/${encodeURIComponent(projectId)}/creator-attempts/${attemptId}/submitted`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operationHash: local.hash }),
          }
        )
      : await secureManagedFetch(
          `/api/macaroni/v35/drops/${Number(projectId)}/attempts/${attemptId}/submitted`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.error || `Operation ${MD.short(local.hash)} is saved in this browser but not yet in the managed journal. Retry remains locked.`
      );
    }
  }
  await refreshManagedV35Setup();
}

async function requestNextManagedV35CreatorAction(options = {}) {
  let setup = await refreshManagedV35Setup();
  await ensureManagedV35PublicMetadata(setup);
  setup = await refreshManagedV35Setup();
  await recoverSecureWalletPromptAborts();
  await recoverSecureManagedSubmissionHashes();
  const projectId = state.infrastructure.privateInventory.projectId;
  const request = {
    registrationDigest: state.infrastructure.privateInventory.registrationDigest,
    plan: managedV35CreatorPlan(),
    ...(options.requestPermanentClose ? { requestPermanentClose: true } : {}),
  };
  const response = state.infrastructure.kind === "companion"
    ? await secureCompanionFetch(
        `/projects/${encodeURIComponent(projectId)}/creator-actions/${options.requestPermanentClose ? "close" : "next"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.requestPermanentClose ? {} : { plan: request.plan }),
        }
      )
    : await secureManagedFetch(`/api/macaroni/v35/drops/${Number(projectId)}/next-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.schema !== "wtfos.macaroni-v35-next-creator-action.v1") {
    throw new Error(body.message || body.error || "The fulfillment service could not determine the next safe creator action.");
  }
  return body;
}

async function executeManagedV35CreatorAction(action) {
  validateSecureManagedAction(action);
  await MD.assertOperationSafety();
  const stepId = secureManagedActionStepId(action);
  const existing = launchStep(stepId);
  const limits = await secureManagedActionLimits(action);
  try {
    await requestTransactionReview({ ...secureActionReviewText(action, limits), existing });
  } catch (error) {
    writeLaunchStep(stepId, {
      status: "declined",
      managedAttemptId: action.attemptId,
      message: error.message || String(error),
    });
    await recordSecureManagedWalletRejection(action, error.message || String(error));
    throw error;
  }
  writeLaunchStep(stepId, {
    status: "awaiting-signature",
    managedAttemptId: action.attemptId,
    action: action.explanation?.whatYouAreSigning || action.step,
    entrypoint: action.entrypoint,
    contract: action.target || "",
    feeMutez: limits.fee,
    storageLimit: limits.storageLimit,
    message: "The reviewed action is waiting in your wallet.",
  });
  let walletErrorCapture;
  try {
    walletErrorCapture = await MD.beginWalletOperationErrorCapture();
  } catch (error) {
    writeLaunchStep(stepId, {
      status: "confirming",
      managedAttemptId: action.attemptId,
      message: `${error.message || error} The wallet was not opened, but this prepared step remains locked until its durable prompt boundary is reconciled.`,
    });
    throw error;
  }
  try {
    await recordSecureWalletPromptStarted(action);
  } catch (error) {
    walletErrorCapture.stop();
    writeLaunchStep(stepId, {
      status: "failed",
      managedAttemptId: action.attemptId,
      message: error.message || String(error),
    });
    throw error;
  }
  let operation;
  try {
    const tezos = MD.getToolkit();
    if (action.entrypoint === "origination") {
      operation = await tezos.wallet.originate({
        code: action.parameters.code,
        init: action.parameters.storage,
        balance: Number(action.amountMutez || 0),
        mutez: true,
        fee: limits.fee,
        gasLimit: limits.gasLimit,
        storageLimit: limits.storageLimit,
      }).send();
    } else {
      const transfer = {
        to: action.target,
        amount: Number(action.amountMutez || 0),
        mutez: true,
        fee: limits.fee,
        gasLimit: limits.gasLimit,
        storageLimit: limits.storageLimit,
      };
      if (action.step !== "reveal_creator_key") {
        transfer.parameter = { entrypoint: action.entrypoint, value: action.parameters.micheline };
      }
      operation = await tezos.wallet.transfer(transfer).send();
    }
  } catch (error) {
    const authenticatedAbort = authenticatedRemoteWalletAbort(error, walletErrorCapture.take());
    if (authenticatedAbort) {
      const walletAbortEvidence = durableWalletAbortEvidence(action, authenticatedAbort);
      writeLaunchStep(stepId, {
        status: "confirming",
        managedAttemptId: action.attemptId,
        walletAbortEvidence,
        message: "Your wallet's authenticated decline is saved on this device. Macaroni is adding it to the durable setup journal now.",
      });
      try {
        await recordSecureWalletPromptAbort(action, walletAbortEvidence);
        writeLaunchStep(stepId, {
          status: "declined",
          managedAttemptId: action.attemptId,
          walletAbortEvidence: null,
          message: "Your wallet confirmed that you declined before broadcast. No chain state changed and the same checklist step is ready whenever you return.",
        });
      } catch (abortError) {
        writeLaunchStep(stepId, {
          status: "confirming",
          managedAttemptId: action.attemptId,
          message: `${abortError.message || abortError} No retry will be offered until the outcome is resolved.`,
        });
        throw abortError;
      }
      throw new Error("You declined this transaction in your wallet. Nothing changed on-chain, and the step is safely ready to try later.");
    }
    writeLaunchStep(stepId, {
      status: "confirming",
      managedAttemptId: action.attemptId,
      message: `The wallet did not return a trustworthy broadcast result: ${error.message || error}. Macaroni will inspect finalized chain and mempool state before permitting any retry.`,
    });
    throw error;
  } finally {
    walletErrorCapture.stop();
  }
  const hash = creatorOperationHash(operation);
  writeLaunchStep(stepId, {
    status: "submitted",
    managedAttemptId: action.attemptId,
    hash,
    contract: String(operation?.contractAddress || action.target || ""),
    link: creatorOperationLink(hash),
    message: "Wallet submitted the exact action. Its hash is saved locally; copying it to the durable managed journal now.",
  });
  await recordSecureManagedSubmission(action, operation);
  writeLaunchStep(stepId, {
    status: "confirming",
    managedAttemptId: action.attemptId,
    hash,
    link: creatorOperationLink(hash),
    message: "Operation hash is durable. Waiting for Tezos finality and the exact postcondition.",
  });
  try {
    await operation.confirmation(3);
  } catch (_) {
    // The durable server journal owns reconciliation after a disconnect or a
    // wallet/indexer timeout. Never resubmit from this catch path.
  }
  const reconciliation = await reconcileSecureManagedAction(action);
  const applied = reconciliation.state === "applied";
  writeLaunchStep(stepId, {
    status: applied ? "applied" : "confirming",
    managedAttemptId: action.attemptId,
    hash,
    link: creatorOperationLink(hash),
    message: applied
      ? "Finalized chain state matches the exact reviewed action."
      : reconciliation.error || "The operation is still being finalized. Return to this checklist; no duplicate will be submitted.",
  });
  return reconciliation;
}

async function advanceManagedV35(options = {}) {
  const next = await requestNextManagedV35CreatorAction(options);
  if (next.state === "reconcile" && next.action) {
    const result = await reconcileSecureManagedAction(next.action);
    notify(
      result.state === "applied"
        ? "That transaction is finalized. Review the next checklist action when you are ready."
        : result.error || "That transaction is still confirming. No duplicate was submitted.",
      result.state === "applied" ? "ok" : "warn",
      "deployStatus"
    );
    return result;
  }
  if (next.state === "awaiting_signature" && next.action) {
    const result = await executeManagedV35CreatorAction(next.action);
    notify(
      result.state === "applied"
        ? "Step complete. Your launch checklist is safely saved."
        : "Transaction submitted and safely journaled. It is still confirming; return any time.",
      result.state === "applied" ? "ok" : "warn",
      "deployStatus"
    );
    return result;
  }
  if (["waiting_for_managed_fulfillment_arm", "waiting_for_companion_fulfillment_arm"].includes(next.state)) {
    await refreshManagedV35Setup();
    notify(next.blocker || "The fulfillment service is completing its automatic readiness check. No creator signature is needed.", "warn", "deployStatus");
    return next;
  }
  if (["wallet_outcome_required", "operation_hash_recovery_required"].includes(next.state) && next.action) {
    const recovery = await requestOperationHashRecovery(next);
    if (recovery.choice === "record-hash") {
      await recordSecureOperationHash(next.action, recovery.operationHash);
      const result = await reconcileSecureManagedAction(next.action);
      notify(
        result.state === "applied"
          ? "The recovered operation is finalized and the checklist advanced safely."
          : "Operation hash saved. Macaroni will keep checking it; no duplicate will be submitted.",
        result.state === "applied" ? "ok" : "warn",
        "deployStatus"
      );
    } else {
      notify("The step remains locked while Macaroni checks for an existing operation.", "warn", "deployStatus");
    }
    return next;
  }
  if (next.state === "blocked") {
    notify(next.blocker || "Complete the indicated off-chain preparation before continuing.", "warn", "deployStatus");
    return next;
  }
  if (next.state === "complete") {
    await refreshManagedV35Setup();
    notify("Secure V3.5 setup is complete and the sale is open.", "ok", "deployStatus");
    return next;
  }
  throw new Error(`The managed service returned unsupported action state “${next.state || "unknown"}”.`);
}

async function deploySecureV35() {
  return advanceManagedV35();
}

async function syncSecureV35() {
  return advanceManagedV35();
}

async function closeSecureV35Sale() {
  readForm();
  clearNotice();
  if (!isSecureV35Profile()) return notify("Permanent close is available only for a Secure V3.5 contract.", "warn", "deployStatus");
  try {
    await advanceManagedV35({ requestPermanentClose: true });
  } catch (error) {
    notify(error.message || String(error), error.macaroniDeclined ? "warn" : "err", "deployStatus");
  } finally {
    renderLaunchChecklist();
  }
}

async function deploy() {
  try {
    readForm();
    clearNotice();
    try {
      assertProfileActionReady("deployment");
    } catch (e) {
      return notify(e.message, "err", "deployStatus");
    }
    if (isSecureV35Profile()) {
      try {
        return await deploySecureV35();
      } catch (e) {
        return notify(e.message, "err", "deployStatus");
      }
    }
    try {
      assertSelectedContractSupportsDraft();
    } catch (e) {
      return notify(e.message, "err", "deployStatus");
    }
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
    if (minterRoyaltiesEnabled()) {
      const updater = state.drop.royaltyUpdaterAddr || MD.getAccount();
      if (!updater || !MD.isAddress(updater))
        return notify("Minter royalties need a valid royalty updater address.", "err", "deployStatus");
      if (creatorRoyaltyBps() + minterRoyaltyBps() > 10_000)
        return notify("Creator royalties plus the minter royalty pool cannot exceed 100%.", "err", "deployStatus");
    }
    const stages = stageRecords(); // validates
    const revealOperator = macaroniContractProfile().usesV3
      ? await automaticRevealOperator()
      : "";

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
    const { profile, code } = await loadContractCodeForDraft();

    const me = MD.getAccount();
    const M = TZ.MichelsonMap;
    const metadataMap = new M();
    metadataMap.set("", MD.utf8ToHex("ipfs://" + state.drop.contractMetaCid));
    const placeholderMap = new M();
    if (delayed)
      placeholderMap.set("", MD.utf8ToHex("ipfs://" + state.drop.placeholderCid));

    let storage;
    if (profile.usesEditionStorage) {
      const placeholderPoolMap = new M();
      const pool = placeholderPool().length ? placeholderPool() : [{ metadataCid: state.drop.placeholderCid }];
      pool.forEach((p, i) => {
        const info = new M();
        info.set("", MD.utf8ToHex("ipfs://" + p.metadataCid));
        placeholderPoolMap.set(i, { token_id: i, token_info: info });
      });
      storage = {
        administrator: me,
        pending_administrator: null,
        ...(profile.usesV3 ? { reveal_operator: revealOperator } : {}),
        treasury: state.drop.treasuryAddr || me,
        metadata: metadataMap,
        ledger: new M(),
        operators: new M(),
        token_metadata: new M(),
        ...(profile.usesV3
          ? { token_commitments: new M(), revealed_tokens: new M(), inventory_finalized: false }
          : { pending_tokens: new M() }),
        token_supply: new M(),
        token_minted: new M(),
        slots: new M(),
        supply: 0,
        minted: 0,
        token_count: 0,
        stages: new M(),
        allowlist: new M(),
        stage_minted: new M(),
        locked: false,
        paused: false,
        delayed_reveal: delayed,
        placeholder_pool: placeholderPoolMap,
        placeholder_count: delayed ? pool.length : 0,
        token_placeholder: new M(),
        reveal_queue: new M(),
        reveal_cursor: 0,
        reveal_tail: 0,
        reveal_delay: delayed ? Math.round(delayDays * 86400) : 0,
        unrevealed_since: null,
        revealed: 0,
        minter_royalty_config: {
          enabled: minterRoyaltiesEnabled(),
          bps: minterRoyaltyBps(),
          mode: normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode) === "rolling_pool" ? 1 : 0,
          updater: state.drop.royaltyUpdaterAddr || me,
        },
        first_minter: new M(),
        minter_pool: new M(),
        minter_pool_count: new M(),
        royalty_revision: new M(),
        metadata_revision: new M(),
        royalty_locked: new M(),
      };
    } else {
      storage = {
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
    }

    $("deployStatus").textContent = "measuring origination fee and storage…";
    const originationLimits = await estimateReviewedOrigination(code, storage);
    const launchStepId = "deploy-contract";
    const existing = await guardLaunchRetry(launchStepId);
    try {
      await requestTransactionReview({
        kind: "Contract origination",
        title: "Deploy your creator-owned collection",
        summary: "This creates a new FA2 contract on the selected Tezos network. It does not list or sell anything by itself.",
        action: "Originate the selected Macaroni compatibility contract",
        network: state.network,
        wallet: MD.getAccount(),
        entrypoint: "New contract origination",
        amount: "0 tez transferred to the new contract",
        fee: `${MD.fmtTez(originationLimits.fee)} · live-measured now`,
        storage: `${originationLimits.storageLimit} byte limit · up to ${MD.fmtTez(originationLimits.storageFeeMutez)} · live-measured now`,
        irreversible: "A new contract address and its initial storage remain on-chain permanently.",
        ifSign: "Your wallet submits the origination. Macaroni records the exact operation hash and waits for independent applied status.",
        ifDecline: "Nothing is submitted. Your prepared artwork, stages, and checklist remain saved so you can return later.",
        existing,
      });
    } catch (error) {
      writeLaunchStep(launchStepId, { status: "declined", message: error.message || String(error) });
      throw error;
    }
    writeLaunchStep(launchStepId, {
      status: "awaiting-signature",
      action: "Originate collection contract",
      entrypoint: "",
      contract: "",
      feeMutez: originationLimits.fee,
      storageLimit: originationLimits.storageLimit,
    });
    $("deployStatus").textContent = "waiting for wallet signature…";
    log("originating contract…");
    const tezos = MD.getToolkit();
    const op = await tezos.wallet.originate({
      code,
      storage,
      fee: originationLimits.fee,
      gasLimit: originationLimits.gasLimit,
      storageLimit: originationLimits.storageLimit,
    }).send();
    const submittedHash = creatorOperationHash(op);
    if (!submittedHash) throw new Error("wallet did not return an operation hash");
    const derivedContract = String(op?.contractAddress || "").trim();
    if (isValidKt1Address(derivedContract)) {
      state.contract = derivedContract;
      $("contractAddr").value = derivedContract;
      MD.recordColanderContract(derivedContract);
      save();
    }
    writeLaunchStep(launchStepId, {
      status: "submitted",
      hash: submittedHash,
      contract: isValidKt1Address(derivedContract) ? derivedContract : "",
      link: creatorOperationLink(submittedHash),
      message: "Wallet submitted contract origination; waiting for confirmation.",
    });
    $("deployStatus").textContent = "waiting for confirmation…";
    const contract = await op.contract();
    await MD.assertOperationApplied(op, { network: state.network, contractAddress: contract.address });
    state.contract = contract.address;
    $("contractAddr").value = contract.address;
    MD.recordColanderContract(contract.address);
    save();
    markReviewedOperationApplied(launchStepId, op);
    $("deployStatus").textContent = "deployed ✓";
    $("btnSync").disabled = false;
    log("contract deployed at " + contract.address);
    log("explorer: " + MD.explorerUrl(state.network, contract.address));
  } catch (e) {
    const declined = Boolean(e?.macaroniDeclined);
    const current = launchStep("deploy-contract");
    if (!declined && current?.status === "submitted") {
      writeLaunchStep("deploy-contract", { status: "confirming", message: e.message || String(e) });
    } else if (!declined && current?.status === "awaiting-signature") {
      writeLaunchStep("deploy-contract", { status: "failed", message: e.message || String(e) });
    }
    $("deployStatus").textContent = declined ? "deployment paused · resume when ready" : "deploy not completed";
    log((declined ? "deploy paused: " : "deploy failed: ") + (e.message || JSON.stringify(e)), declined ? "" : "err");
    notify((declined ? "Deployment paused: " : "Deploy failed: ") + (e.message || e), declined ? "warn" : "err", "deployStatus");
  } finally {
    renderLaunchChecklist();
  }
}

async function sync() {
  try {
    readForm();
    try {
      assertProfileActionReady("setup");
    } catch (e) {
      return notify(e.message, "err", "deployStatus");
    }
    if (isSecureV35Profile()) {
      try {
        return await syncSecureV35();
      } catch (e) {
        return notify(e.message, "err", "deployStatus");
      }
    }
    let profile;
    try {
      profile = assertSelectedContractSupportsDraft();
    } catch (e) {
      return notify(e.message, "err", "deployStatus");
    }
    const kt = $("contractAddr").value.trim() || state.contract;
    clearNotice();
    if (!kt) return notify("Deploy first, or paste an existing contract address.", "err", "deployStatus");
    if (!isValidKt1Address(kt))
      return notify("Contract address must be a KT1… address.", "err", "deployStatus");
    state.contract = kt;
    save();
    if (state.tokens.length && state.tokens.some((t) => !t.metadataCid))
      return notify("Pin all local token metadata before syncing token changes.", "err", "deployStatus");
    if (profile.usesV3 && state.tokens.length) await ensureV3Commitments();
    if (state.tokens.length) {
      try {
        assertArtifactSizePolicy({ requireKnownSizes: true });
      } catch (e) {
        return notify(e.message, "err", "deployStatus");
      }
    }

    const configuredRevealOperator = profile.usesV3
      ? await automaticRevealOperator()
      : "";

    await MD.assertOperationSafety();
    const tezos = MD.getToolkit();
    const c = await tezos.wallet.at(kt);
    const st = await (await tezos.contract.at(kt)).storage();
    const contractIsV3 = st.token_commitments != null && st.revealed_tokens != null;
    const contractIsFinalizedV3 = contractIsV3 && st.inventory_finalized != null;
    const contractIsV2 = !contractIsV3 && st.token_supply != null && st.token_minted != null && st.minter_royalty_config != null;
    const contractUsesEditionStorage = contractIsV2 || contractIsV3;
    if (profile.usesV3 && !contractIsV3) {
      return notify(
        "Macaroni V3 is selected, but the selected contract is not a V3 commitment contract. " +
        "Deploy or resume a V3 contract for this draft.",
        "err",
        "deployStatus"
      );
    }
    if (profile.usesV3 && !contractIsFinalizedV3) {
      return notify(
        "This is an older V3 contract without immutable pre-sale inventory. Deploy the current V3 contract before opening the sale.",
        "err",
        "deployStatus"
      );
    }
    if (contractIsV3 && String(st.reveal_operator || "") !== configuredRevealOperator) {
      return notify(
        "This V3 contract does not authorize the current automatic reveal operator. Deploy a current V3 contract before opening the sale.",
        "err",
        "deployStatus"
      );
    }
    if (contractIsV3 && !state.tokens.length) {
      return notify(
        "Restore the V3 Studio backup containing the private metadata CIDs and nonces before syncing automatic reveal.",
        "err",
        "deployStatus"
      );
    }
    if (profile.usesV2 && !contractIsV2)
      return notify("Macaroni V2 is selected, but the selected contract is not V2.", "err", "deployStatus");
    if (!profile.usesEditionStorage && contractUsesEditionStorage)
      return notify(`This contract is Macaroni ${contractIsV3 ? "V3" : "V2"}. Select its matching version before syncing.`, "err", "deployStatus");
    const already = contractUsesEditionStorage ? Number(st.token_count || 0) : Number(st.supply);
    const editionTotal = tokenEditionTotal();
    log(`sync: contract has ${already}/${state.tokens.length} token row(s) loaded (${editionTotal} edition(s) in draft)`);

    const M = TZ.MichelsonMap;
    const batchify = (t) => {
      if (contractIsV3) {
        return {
          token_id: t.id - 1,
          metadata_commitment: t.metadataCommitment,
          quantity: normalizeTokenQuantity(t.quantity),
        };
      }
      const info = new M();
      info.set("", MD.utf8ToHex("ipfs://" + t.metadataCid));
      const entry = { token_id: t.id - 1, token_info: info };
      if (contractIsV2) entry.quantity = normalizeTokenQuantity(t.quantity);
      return entry;
    };

    if (state.tokens.length && already > state.tokens.length)
      return notify(
        `This contract already has ${already} token(s) loaded, but your CSV has ` +
        `${state.tokens.length}. Re-import the full CSV before syncing token changes.`,
        "err",
        "deployStatus"
      );

    const replaceTodo = [];
    const inventoryMutable = contractIsV3 ? !Boolean(st.inventory_finalized) : !st.locked;
    if (state.tokens.length && inventoryMutable) {
      const existing = state.tokens.filter((t) => t.id - 1 < already);
      for (const t of existing) {
        if (contractIsV3) {
          const current = String((await st.token_commitments.get(t.id - 1)) || "").replace(/^0x/i, "").toLowerCase();
          if (current !== String(t.metadataCommitment || "").toLowerCase()) replaceTodo.push(t);
        } else {
          const desired = "ipfs://" + t.metadataCid;
          const current = tokenInfoUri(await st.pending_tokens.get(t.id - 1));
          if (current !== desired) replaceTodo.push(t);
        }
      }
    } else if (state.tokens.length && !inventoryMutable) {
      log(contractIsV3
        ? "sync: V3 inventory is finalized; token rows and commitments are permanently sealed"
        : "sync: sale is locked; existing token metadata cannot be replaced");
    }

    if (contractIsV3 && Boolean(st.inventory_finalized)) {
      for (const t of state.tokens.filter((token) => token.id - 1 < already)) {
        const tokenId = t.id - 1;
        const committed = String((await st.token_commitments.get(tokenId)) || "").replace(/^0x/i, "").toLowerCase();
        const supply = Number((await st.token_supply.get(tokenId)) || 0);
        if (committed !== String(t.metadataCommitment || "").toLowerCase() || supply !== normalizeTokenQuantity(t.quantity)) {
          return notify(
            `Token ${t.id} differs from the permanently finalized V3 inventory. Restore the exact finalized backup or deploy a new contract.`,
            "err",
            "deployStatus"
          );
        }
      }
    }

    const todo = state.tokens.filter((t) => t.id - 1 >= already);
    if (contractIsV3 && Boolean(st.inventory_finalized) && todo.length) {
      return notify(
        "This V3 inventory is permanently finalized. Restore the exact finalized Studio backup or deploy a new contract for changed tokens.",
        "err",
        "deployStatus"
      );
    }
    const stages = stageRecords();
    const entries = [];
    for (const s of stages)
      for (const a of s.allowlist)
        entries.push({ stage: s.key, holder: a.address, capacity: a.capacity });

    const totalSteps = Math.max(
      1,
      Math.ceil(replaceTodo.length / CHUNK) +
        Math.ceil(todo.length / CHUNK) +
        (contractIsV3 && !Boolean(st.inventory_finalized) ? 1 : 0) +
        1 +
        (entries.length ? Math.ceil(entries.length / 200) : 1)
    );
    let step = 0;
    const bump = () => { $("syncBar").style.width = Math.round((++step / totalSteps) * 100) + "%"; };

    for (let i = 0; i < replaceTodo.length; i += CHUNK) {
      const chunk = replaceTodo.slice(i, i + CHUNK).map(batchify);
      const ep = contractIsV3 ? "replace_tokens_v3" : contractIsV2 ? "replace_tokens_v2" : "replace_tokens";
      log(`${ep} ${chunk[0].token_id}…${chunk[chunk.length - 1].token_id} (${chunk.length}) — approve in wallet`);
      await runReviewedContractOperation(c.methodsObject[ep](chunk), {}, {
        ...STORAGE_PROFILE.inventory,
        gasPerUnit: 180_000,
        units: chunk.length,
      }, {
        stepId: `sync:${ep}:${i}`,
        kind: "Inventory transaction",
        title: "Review an inventory replacement batch",
        summary: `This replaces ${chunk.length} existing pre-sale inventory record${chunk.length === 1 ? "" : "s"}.`,
        action: `Replace token records ${chunk[0].token_id}–${chunk[chunk.length - 1].token_id}`,
        contract: kt,
        entrypoint: ep,
        amount: "0 tez",
        irreversible: "After inventory or sale locking, these records cannot be changed.",
        ifSign: "The wallet submits only this replacement batch. Its hash is saved before the next batch begins.",
        ifDecline: "This batch is not submitted. Earlier applied batches remain applied and setup resumes here later.",
      });
      bump();
    }

    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK).map(batchify);
      const ep = contractIsV3 ? "add_tokens_v3" : contractIsV2 ? "add_tokens_v2" : "add_tokens";
      log(`${ep} ${chunk[0].token_id}…${chunk[chunk.length - 1].token_id} (${chunk.length}) — approve in wallet`);
      await runReviewedContractOperation(c.methodsObject[ep](chunk), {}, {
        ...STORAGE_PROFILE.inventory,
        gasPerUnit: 180_000,
        units: chunk.length,
      }, {
        stepId: `sync:${ep}:${i}`,
        kind: "Inventory transaction",
        title: "Review an inventory batch",
        summary: `This loads ${chunk.length} inventory record${chunk.length === 1 ? "" : "s"} into the collection contract.`,
        action: `Add token records ${chunk[0].token_id}–${chunk[chunk.length - 1].token_id}`,
        contract: kt,
        entrypoint: ep,
        amount: "0 tez",
        irreversible: contractIsV3
          ? "The records become permanent when the later finalize-inventory transaction is applied."
          : "The records can be changed only until the compatibility contract locks them.",
        ifSign: "The wallet submits only this inventory batch. Its hash is saved before the next batch begins.",
        ifDecline: "This batch is not submitted. Earlier applied batches remain applied and setup resumes here later.",
      });
      bump();
    }

    if (contractIsV3 && !Boolean(st.inventory_finalized)) {
      log("finalize_inventory — permanently seal token rows, quantities, commitments, and allocation order");
      await runReviewedContractOperation(c.methodsObject.finalize_inventory(), {}, {
        ...STORAGE_PROFILE.inventory,
        gasPerUnit: 80_000,
        units: 1,
      }, {
        stepId: "sync:finalize-inventory",
        kind: "Irreversible inventory transaction",
        title: "Permanently finalize V3 inventory",
        summary: "This seals the token rows, quantities, commitments, and creator-defined allocation order.",
        action: "Finalize the complete V3 inventory",
        contract: kt,
        entrypoint: "finalize_inventory",
        amount: "0 tez",
        irreversible: "Inventory and its deterministic order cannot be edited after this operation applies.",
        ifSign: "The complete loaded inventory becomes permanently sealed on-chain.",
        ifDecline: "Nothing is finalized. Sale setup pauses and must not open until you return and review this step.",
      });
      bump();
    }

    const sm = new M();
    for (const s of stages) sm.set(s.key, s.value);
    log("set_stages (" + stages.length + ")");
    await runReviewedContractOperation(c.methodsObject.set_stages(sm), {}, {
      ...STORAGE_PROFILE.stages,
      gasPerUnit: 120_000,
      units: stages.length,
    }, {
      stepId: "sync:set-stages",
      kind: "Sale configuration transaction",
      title: "Review sale stages",
      summary: `This writes ${stages.length} configured sale stage${stages.length === 1 ? "" : "s"} to the contract.`,
      action: "Set sale start times, prices, limits, and allowlist modes",
      contract: kt,
      entrypoint: "set_stages",
      amount: "0 tez",
      irreversible: "A stage that has begun or accepted purchases may no longer be safely replaceable.",
      ifSign: "The contract uses these sale settings after the operation applies.",
      ifDecline: "The new sale settings are not submitted. Inventory work already applied remains unchanged.",
    });
    bump();

    if (entries.length) {
      for (let i = 0; i < entries.length; i += 200) {
        const chunk = entries.slice(i, i + 200);
        log(`set_allowlist ${i}…${i + chunk.length - 1}`);
        await runReviewedContractOperation(c.methodsObject.set_allowlist(chunk), {}, {
          ...STORAGE_PROFILE.allowlist,
          gasPerUnit: 80_000,
          units: chunk.length,
        }, {
          stepId: `sync:set-allowlist:${i}`,
          kind: "Allowlist transaction",
          title: "Review an allowlist batch",
          summary: `This writes ${chunk.length} wallet allocation${chunk.length === 1 ? "" : "s"} for the configured sale stages.`,
          action: `Set allowlist records ${i + 1}–${i + chunk.length}`,
          contract: kt,
          entrypoint: "set_allowlist",
          amount: "0 tez",
          irreversible: "Used allowlist capacity remains part of on-chain sale history.",
          ifSign: "Only this allowlist batch is submitted and journaled.",
          ifDecline: "This batch is not submitted. Setup resumes at the same batch later.",
        });
        bump();
      }
    } else {
      bump();
    }
    if (contractIsV3) {
      $("deployStatus").textContent = "confirm creator wallet signature for automatic reveal (no transaction or fee)…";
      log("Automatic reveal needs one wallet signature to prove you control this contract. This does not send a transaction or charge tez.");
      await registerAutomaticV3Reveal(kt);
      log(`${state.drop.revealMode} reveal automation registered for ${kt}`);
    }
    $("syncBar").style.width = "100%";
    $("deployStatus").textContent = contractIsV3 ? "in sync · inventory sealed · automatic reveal active ✓" : "in sync ✓";
    log(contractIsV3
      ? "sync complete — inventory and creator-defined allocation order are permanently sealed; automatic reveal is active."
      : "sync complete — your drop is live on-chain.");
    log("objkt collection (mainnet only): " + MD.objktUrl(state.network, kt));
    log("tip: Save studio backup (Resume panel) so you can restore this draft later.");
    writeLaunchStep("sync", {
      status: "applied",
      message: contractIsV3
        ? "Inventory finalized, sale configuration applied, and automatic reveal authorization registered."
        : "Inventory and sale configuration independently confirmed as applied.",
    });
  } catch (e) {
    const declined = Boolean(e?.macaroniDeclined);
    const childPending = Object.values(state.launchJournal?.steps || {}).some((entry) =>
      entry?.stepId?.startsWith("sync:") && LAUNCH_PENDING_STATUSES.has(entry.status)
    );
    writeLaunchStep("sync", {
      status: declined ? "declined" : childPending ? "confirming" : "failed",
      message: e.message || String(e),
    });
    log((declined ? "sync paused: " : "sync failed: ") + (e.message || JSON.stringify(e)), declined ? "" : "err");
    notify(
      (declined ? "Setup paused: " : "Sync failed: ") + (e.message || e) + " Return to the checklist to resume.",
      declined ? "warn" : "err",
      "deployStatus"
    );
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
    const initial = await (await tezos.contract.at(kt)).storage();
    if (initial.token_commitments != null && initial.revealed_tokens != null) {
      const pendingItems = [];
      for (const token of state.tokens) {
        const tokenId = token.id - 1;
        if (tokenId >= Number(initial.token_count || 0)) continue;
        const minted = Number((await initial.token_minted.get(tokenId)) || 0);
        const supply = Number((await initial.token_supply.get(tokenId)) || 0);
        const revealed = await initial.revealed_tokens.get(tokenId);
        if (minted <= 0 || minted !== supply || revealed != null) continue;
        if (!token.metadataCid || !/^[0-9a-f]{64}$/i.test(token.metadataNonce || "")) {
          throw new Error(`token ${token.id} reveal secret is missing from this Studio draft`);
        }
        const committed = String((await initial.token_commitments.get(tokenId)) || "").replace(/^0x/i, "").toLowerCase();
        const localCommitment = await metadataCommitment(token.metadataCid, token.metadataNonce);
        if (localCommitment !== committed) {
          throw new Error(`token ${token.id} reveal secret does not match its on-chain commitment; restore the Studio backup used for sync`);
        }
        pendingItems.push({
          token_id: tokenId,
          metadata_uri: MD.utf8ToHex("ipfs://" + token.metadataCid),
          nonce: token.metadataNonce,
        });
      }
      for (let i = 0; i < pendingItems.length; i += CHUNK) {
        const chunk = pendingItems.slice(i, i + CHUNK);
        $("deployStatus").textContent = `revealing ${i + 1}–${i + chunk.length} of ${pendingItems.length} committed token(s)…`;
        log(`reveal_tokens_v3 ${chunk[0].token_id}…${chunk[chunk.length - 1].token_id} (${chunk.length})`);
        const op = await MD.sendWalletOp(c.methodsObject.reveal_tokens_v3(chunk), {}, {
          ...STORAGE_PROFILE.reveal,
          gasPerUnit: 50_000,
          units: chunk.length,
        });
        await op.confirmation(1);
        await MD.assertOperationApplied(op, { network: state.network, contractAddress: kt, entrypoint: "reveal_tokens_v3" });
      }
      $("deployStatus").textContent = pendingItems.length ? "all minted commitments revealed ✓" : "no minted commitments awaiting reveal";
      log(pendingItems.length ? "V3 reveal complete — every minted token has verified metadata." : "V3 reveal: nothing pending.");
      return;
    }
    for (;;) {
      const st = await (await tezos.contract.at(kt)).storage();
      const pending = Number(st.minted) - Number(st.revealed);
      if (pending <= 0) break;
      const n = Math.min(50, pending);
      $("deployStatus").textContent = `revealing ${n} of ${pending} pending…`;
      log(`reveal(${n}) — ${pending} unrevealed`);
      const op = await MD.sendWalletOp(c.methodsObject.reveal(n), {}, {
        ...STORAGE_PROFILE.reveal,
        gasPerUnit: 50_000,
        units: n,
      });
      await op.confirmation(1);
      await MD.assertOperationApplied(op, { network: state.network, contractAddress: kt, entrypoint: "reveal" });
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
  const profile = macaroniContractProfile();
  const secureV35 = isSecureV35Profile();
  const legacy = isLegacyCompatibilityProfile();
  const contractAddress = $("contractAddr").value.trim() || state.contract;
  const pool = placeholderPool()
    .filter((p) => p && p.metadataCid)
    .map((p, index) => ({
      index,
      name: p.name || `placeholder-${index + 1}`,
      mime: p.mime || "image/png",
      artifact: p.cid ? "ipfs://" + p.cid : "",
      metadata: "ipfs://" + p.metadataCid,
    }));
  return sanitizeDropConfig({
    network: state.network,
    rpc: state.rpc || MD.getNetworks()[state.network].rpc,
    contract: contractAddress,
    contractVersion: secureV35 ? MACARONI_SECURE_PROFILE_ID : profile.id,
    profile: {
      id: secureV35 ? MACARONI_SECURE_PROFILE_ID : profile.id,
      label: secureV35
        ? "Secure Blind Mint"
        : profile.usesV3
        ? "Sealed deterministic order — not random"
        : "Legacy Macaroni",
      collectorUnpredictable: secureV35,
      allocationLockedAtPurchase: secureV35,
      trustlessRandomnessClaimed: false,
    },
    title: state.drop.title,
    description: state.drop.description,
    cover: state.drop.coverCid ? "ipfs://" + state.drop.coverCid : "",
    gateway: state.pin.gateway || MD.DEFAULT_GATEWAY,
    tokenSummary: {
      tokenCount: state.tokens.length,
      editionCount: tokenEditionTotal(),
      hasMultiEditions: state.tokens.some((t) => normalizeTokenQuantity(t.quantity) > 1),
    },
    assetStrategy: secureV35 ? state.infrastructure.assetStrategy : "public_prepin_compatibility",
    tokens: state.tokens.map((t) => secureV35 || profile.usesV3
      ? {
          id: t.id - 1,
          displayId: t.id,
          quantity: normalizeTokenQuantity(t.quantity),
        }
      : {
          id: t.id - 1,
          displayId: t.id,
          quantity: normalizeTokenQuantity(t.quantity),
          name: t.name,
          metadata: t.metadataCid ? "ipfs://" + t.metadataCid : "",
          artifact: t.mediaCid ? "ipfs://" + t.mediaCid : "",
          mime: t.mediaMime || "",
        }),
    reveal: {
      mode: state.drop.revealMode,
      delayDays: Number(state.drop.revealDelayDays || 0),
      policy: state.drop.revealMode === "instant" ? "immediate" : state.drop.laterPolicy,
      at: state.drop.revealMode === "delayed" && state.drop.laterPolicy === "absolute-time"
        ? state.drop.revealAt || ""
        : "",
      allocationChangesAtDisplay: false,
      placeholderPool: secureV35 ? [] : pool,
      serviceUrl: !secureV35 && profile.usesV3 ? automaticRevealRequestUrl() : "",
    },
    service: secureV35
      ? {
          schema: "wtfos.macaroni-v35-public-service.v1",
          provider: state.infrastructure.kind === "wtfos-managed" ? "wtfos_managed" : "creator_companion",
          publicStatusUrl: state.infrastructure.kind === "wtfos-managed" && isValidKt1Address(contractAddress)
            ? `${location.origin}/api/macaroni/v35/status/${encodeURIComponent(state.network)}/${encodeURIComponent(contractAddress)}`
            : normalizeOptionalHttpUrl(state.infrastructure.readiness?.publicStatusUrl),
          claimStatusUrlTemplate: state.infrastructure.kind === "wtfos-managed" && isValidKt1Address(contractAddress)
            ? `${location.origin}/api/macaroni/v35/status/${encodeURIComponent(state.network)}/${encodeURIComponent(contractAddress)}/claims/{claimId}`
            : normalizePublicUrlTemplate(state.infrastructure.readiness?.claimStatusUrlTemplate, "claimId"),
          purchaseStatusUrlTemplate: state.infrastructure.kind === "wtfos-managed" && isValidKt1Address(contractAddress)
            ? `${location.origin}/api/macaroni/v35/status/${encodeURIComponent(state.network)}/${encodeURIComponent(contractAddress)}/purchases/{operationHash}`
            : normalizePublicUrlTemplate(state.infrastructure.readiness?.purchaseStatusUrlTemplate, "operationHash"),
          wakeUrl: state.infrastructure.kind === "wtfos-managed" && isValidKt1Address(contractAddress)
            ? `${location.origin}/api/macaroni/v35/wake/${encodeURIComponent(state.network)}/${encodeURIComponent(contractAddress)}`
            : normalizeOptionalHttpUrl(state.infrastructure.readiness?.wakeUrl),
          projectId: state.infrastructure.privateInventory?.projectId || "",
        }
      : { schema: "", provider: "", publicStatusUrl: "", projectId: "" },
    legacyRisk: legacy
      ? {
          required: true,
          warning: LEGACY_RISK_WARNING,
          publicInventory: true,
        }
      : null,
    minterRoyalties: {
      enabled: minterRoyaltiesEnabled(),
      decimals: 4,
      bps: minterRoyaltyBps(),
      percent: Number(state.drop.minterRoyaltyPct || 0),
      mode: normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode),
      updater: state.drop.royaltyUpdaterAddr || MD.getAccount() || "",
      updateEndpoint: normalizeOptionalHttpUrl(state.drop.royaltyUpdateEndpoint),
      updateStrategy: minterRoyaltiesEnabled() ? "drop_page_or_creator_triggered" : "none",
      metadataSource: "fetch_visible_and_final_token_metadata_then_patch_royalties",
      lock: normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode) === "rolling_pool"
        ? "sellout_or_creator_trigger"
        : "first_mint_sync",
    },
    theme: {
      name: state.page.theme,
      accent: state.page.accent,
      font: state.page.font,
      customCss: "",
    },
    social: {
      twitter: sanitizeSocialHandle(state.page.shareTwitter),
      bsky: sanitizeSocialHandle(state.page.shareBsky),
    },
    share: {
      template: shareFieldText(state.page.shareText),
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
function configJs(action = "export") {
  const cfg = currentConfig();
  try {
    assertProfileActionReady(action);
    assertConfigActionReady(cfg, action);
  } catch (error) {
    notify(error.message || String(error), "err", "exportStatus");
    setExportStatus(`${action[0].toUpperCase()}${action.slice(1)} blocked: ${error.message || error}`, false);
    return null;
  }
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
  const body = configJs("export");
  if (body === null) return;
  try {
    MDSiteBundle.assertSecretFreeConfig(body);
  } catch (e) {
    const message = e?.message || String(e);
    setExportStatus("Export blocked: " + message, false);
    log("export blocked before writing files: " + message, "err");
    notify("Export blocked: " + message, "err", "exportStatus");
    return;
  }
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
    const result = await MDSiteBundle.downloadSiteZip(body, "macaroni-site.zip");
    MDSiteBundle.recordColanderSite(currentConfig(), result);
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
    assertProfileActionReady("publishing");
    assertConfigActionReady(cfg, "publishing");
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
  const sha = shortSha256(item?.sha256);
  btn.textContent = item?.label || platform.label;
  btn.classList.toggle("disabled", !available);
  btn.setAttribute("aria-disabled", available ? "false" : "true");
  if (available) {
    btn.href = item.url;
    btn.download = item.fileName || "";
    btn.title = sha ? `${item.label || platform.label} SHA-256 ${sha}` : item.url;
    btn.removeAttribute("tabindex");
  } else {
    btn.removeAttribute("href");
    btn.removeAttribute("download");
    btn.removeAttribute("title");
    btn.tabIndex = -1;
  }
}

function shortSha256(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(text) ? `${text.slice(0, 12)}...${text.slice(-8)}` : "";
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
    let checksummed = 0;
    for (const platform of INSTALLER_PLATFORMS) {
      const item = byKey.get(platform.key) || { key: platform.key, label: platform.label, available: false };
      if (item.available) available++;
      if (item.available && shortSha256(item.sha256)) checksummed++;
      setInstallerLink(platform, item);
    }
    if (status) {
      status.textContent = available
        ? `${available} desktop installer package${available === 1 ? "" : "s"} available${checksummed === available ? " with SHA-256 checksums" : ""}.`
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
  body = body ?? configJs("export");
  if (body === null) return;
  setExportStatus("Building site package…", true);
  try {
    const result = await MDSiteBundle.downloadSiteZip(body, "macaroni-site.zip");
    MDSiteBundle.recordColanderSite(currentConfig(), result);
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
  state.drop.contractVersion = normalizeContractVersion($("contractVersion").value);
  state.drop.royaltyPct = Number($("royaltyPct").value);
  state.drop.royaltyAddr = normalizeOptionalAddress($("royaltyAddr").value);
  state.drop.minterRoyaltiesEnabled = !!$("minterRoyaltiesEnabled").checked;
  state.drop.minterRoyaltyPct = Number($("minterRoyaltyPct").value || 0);
  state.drop.minterRoyaltyMode = normalizeMinterRoyaltyMode($("minterRoyaltyMode").value);
  state.drop.royaltyUpdaterAddr = normalizeOptionalAddress($("royaltyUpdaterAddr").value);
  state.drop.royaltyUpdateEndpoint = normalizeOptionalHttpUrl($("royaltyUpdateEndpoint").value);
  state.drop.treasuryAddr = normalizeOptionalAddress($("treasuryAddr").value);
  if ($("royaltyAddr").value.trim() !== state.drop.royaltyAddr) $("royaltyAddr").value = state.drop.royaltyAddr;
  if ($("royaltyUpdaterAddr").value.trim() !== state.drop.royaltyUpdaterAddr) $("royaltyUpdaterAddr").value = state.drop.royaltyUpdaterAddr;
  if ($("royaltyUpdateEndpoint").value.trim() !== state.drop.royaltyUpdateEndpoint) $("royaltyUpdateEndpoint").value = state.drop.royaltyUpdateEndpoint;
  if ($("treasuryAddr").value.trim() !== state.drop.treasuryAddr) $("treasuryAddr").value = state.drop.treasuryAddr;
  state.drop.revealMode = $("revealMode").value;
  state.drop.revealDelayDays = Number($("revealDelay").value || 7);
  state.drop.claimIntervalSeconds = Math.max(0, Math.round(Number($("claimIntervalSeconds")?.value || 0)));
  state.drop.laterPolicy = $("laterPolicy").value;
  state.drop.revealAt = $("revealAt").value;
  state.infrastructure.assetStrategy = $("assetStrategy").value === "public_prepin_private_manifest"
    ? "public_prepin_private_manifest"
    : "pin_on_claim";
  const publicPrepinAcknowledged = !!$("publicPrepinRiskAcknowledged")?.checked;
  if (publicPrepinAcknowledged && !state.infrastructure.publicPrepinRiskAcknowledged) {
    state.infrastructure.publicPrepinRiskAcknowledgedAt = new Date().toISOString();
  } else if (!publicPrepinAcknowledged) {
    state.infrastructure.publicPrepinRiskAcknowledgedAt = "";
  }
  state.infrastructure.publicPrepinRiskAcknowledged = publicPrepinAcknowledged;
  const pinKind = $("pinKind").value;
  state.pin.kind = pinKindAllowed(pinKind) ? pinKind : fallbackPinKind();
  sessionPinJwt = $("pinJwt").value.trim();
  delete state.pin.jwt;
  state.pin.url = $("pinUrl").value.trim();
  state.pin.gateway = $("gateway").value.trim();
  state.page.theme = $("pageTheme").value;
  state.page.accent = sanitizeCssColor($("pageAccent").value);
  state.page.font = sanitizeFontStack($("pageFont").value);
  state.page.blocks = $("pageBlocks").value;
  state.page.css = "";
  state.page.shareTwitter = shareFieldText($("shareTwitter").value, 160);
  state.page.shareBsky = shareFieldText($("shareBsky").value, 160);
  state.page.shareText = shareFieldText($("shareText").value);
  save();
  toggleRevealFields();
  toggleMinterRoyaltyFields();
  renderContractVersionHint();
  renderProfileAndInfrastructure();
  renderLaunchChecklist();
}

function toggleRevealFields() {
  const delayed = state.drop.revealMode === "delayed";
  const policy = state.drop.laterPolicy || "rolling-delay";
  const automaticV3 = macaroniContractProfile().usesV3;
  const policyText = policy === "absolute-time"
    ? "at the one date and time configured under Advanced"
    : policy === "after-sellout"
    ? "after the collection sells out"
    : `after each purchase's configured delay`;
  $("revealHint").textContent = delayed
    ? `Artwork displays automatically ${policyText}. This affects display eligibility only; allocation is locked during purchase and cannot be changed or rerolled while waiting.`
    : "Artwork displays automatically after fulfillment. The purchase allocation is locked and cannot be changed or rerolled.";
  $("revealDelayWrap").style.display = delayed ? "" : "none";
  $("rollingDelayWrap").style.display = delayed && policy === "rolling-delay" ? "" : "none";
  $("revealAtWrap").style.display = delayed && policy === "absolute-time" ? "" : "none";
  $("revealHint").style.display = "";
  $("placeholderPoolWrap").style.display = delayed && isLegacyCompatibilityProfile() ? "" : "none";
  $("btnReveal").style.display = delayed && !automaticV3 && !isSecureV35Profile() ? "" : "none";
}

function toggleMinterRoyaltyFields() {
  const enabled = !!state.drop.minterRoyaltiesEnabled;
  $("minterRoyaltyFields").style.display = enabled ? "" : "none";
}

function renderContractVersionHint() {
  const el = $("contractVersionHint");
  if (!el) return;
  const profile = macaroniContractProfile();
  if (isSecureV35Profile()) {
    el.textContent = "Secure V3.5 remains selected. Compatibility settings below do not take effect until you explicitly choose one.";
    el.className = "muted";
  } else if (profile.incompatible) {
    el.textContent =
      "This draft uses V2-only settings. Select Macaroni V2 before pinning, deploying, or syncing.";
    el.className = "err";
  } else if (profile.usesV2) {
    el.textContent =
      "V2 supports shared-token editions, delayed placeholder pools, and minter royalty metadata revisions.";
    el.className = "muted";
  } else if (profile.usesV3) {
    el.textContent =
      state.drop.revealMode === "instant"
        ? "Sealed deterministic order — not random. V3 fixes creator-defined order before sale and does not claim provably random selection; a 1/1 reveals after mint and an edition after its final copy is allocated."
        : "Sealed deterministic order — not random. V3 fixes creator-defined order before sale and does not claim provably random selection; display waits for the supported rolling delay after token sellout.";
    el.className = "muted";
  } else {
    el.textContent = "V1 is for classic 1/1 blind drops with the existing Macaroni contract.";
    el.className = "muted";
  }
}

function selectSecureProfile() {
  state.drop.profileId = MACARONI_SECURE_PROFILE_ID;
  state.drop.contractVersion = MACARONI_SEALED_V3_PROFILE_ID;
  save();
  fillForm();
  renderProfileAndInfrastructure();
  renderLaunchChecklist();
  syncCodeFromForm();
  refreshSecureV35Readiness();
}

function useSelectedCompatibilityProfile() {
  const selected = normalizeContractVersion($("contractVersion").value);
  const legacy = selected === "macaroni-v1" || selected === "macaroni-editions-v2";
  if (legacy && !legacyRiskIsAcknowledged()) {
    $("legacyRiskStatus").textContent = "Read and acknowledge the Legacy warning before selecting V1 or V2.";
    $("legacyRiskStatus").className = "err";
    return notify("Legacy compatibility was not selected. Acknowledge its public-inventory warning first.", "warn");
  }
  state.drop.profileId = selected;
  state.drop.contractVersion = selected;
  save();
  fillForm();
  renderProfileAndInfrastructure();
  renderLaunchChecklist();
  syncCodeFromForm();
  $("legacyRiskStatus").textContent = legacy
    ? "Legacy warning acknowledged and stored with this project. Collector pages will show the same risk boundary."
    : "Sealed deterministic V3 selected. It is fixed-order compatibility, not random.";
  $("legacyRiskStatus").className = legacy ? "warn" : "muted";
}

function setLegacyRiskAcknowledgement(checked) {
  state.drop.legacyRiskAcknowledged = Boolean(checked);
  state.drop.legacyRiskAcknowledgedAt = checked ? new Date().toISOString() : "";
  state.drop.legacyRiskWarning = checked ? LEGACY_RISK_WARNING : "";
  save();
  $("legacyRiskStatus").textContent = checked
    ? "Acknowledged for this project. Selecting Legacy will add a persistent collector warning."
    : "V1/V2 cannot be selected, deployed, published, or exported until this warning is acknowledged.";
  $("legacyRiskStatus").className = checked ? "warn" : "muted";
  renderProfileAndInfrastructure();
  renderLaunchChecklist();
}

function selectInfrastructure(kind) {
  if (isSecureV35Profile() && hasSecureProjectRegistration()) {
    return notify("Infrastructure ownership is locked once the recoverable secure setup is created. Start a new drop to choose a different provider.", "warn");
  }
  if (kind === "wtfos-managed" && managedMacaroniCapabilityState !== "granted") {
    return notify("Managed Macaroni requires the use_managed_macaroni capability. Request access or use Companion.", "warn");
  }
  state.infrastructure.kind = kind === "wtfos-managed" ? "wtfos-managed" : "companion";
  state.infrastructure.manuallySelected = true;
  state.infrastructure.readiness = secureReadinessFailure("checking", "Checking the selected secure infrastructure…");
  save();
  renderProfileAndInfrastructure();
  renderLaunchChecklist();
  refreshSecureV35Readiness();
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
  state.drop.contractVersion = normalizeContractVersion(state.drop.contractVersion);
  $("contractVersion").value = state.drop.contractVersion;
  $("royaltyPct").value = String(state.drop.royaltyPct);
  $("royaltyAddr").value = state.drop.royaltyAddr;
  $("minterRoyaltiesEnabled").checked = !!state.drop.minterRoyaltiesEnabled;
  $("minterRoyaltyPct").value = String(state.drop.minterRoyaltyPct ?? 0);
  $("minterRoyaltyMode").value = normalizeMinterRoyaltyMode(state.drop.minterRoyaltyMode);
  $("royaltyUpdaterAddr").value = state.drop.royaltyUpdaterAddr || "";
  $("royaltyUpdateEndpoint").value = state.drop.royaltyUpdateEndpoint || "";
  $("treasuryAddr").value = state.drop.treasuryAddr;
  $("revealMode").value = state.drop.revealMode || "instant";
  $("revealDelay").value = String(state.drop.revealDelayDays ?? 7);
  if ($("claimIntervalSeconds")) $("claimIntervalSeconds").value = String(state.drop.claimIntervalSeconds ?? 0);
  $("laterPolicy").value = state.drop.laterPolicy || "rolling-delay";
  $("revealAt").value = state.drop.revealAt || "";
  $("legacyRiskAcknowledged").checked = legacyRiskIsAcknowledged();
  $("assetStrategy").value = state.infrastructure.assetStrategy || "pin_on_claim";
  if ($("publicPrepinRiskAcknowledged")) {
    $("publicPrepinRiskAcknowledged").checked = !!state.infrastructure.publicPrepinRiskAcknowledged;
  }
  toggleRevealFields();
  toggleMinterRoyaltyFields();
  renderContractVersionHint();
  $("pinJwt").value = sessionPinJwt;
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
  $("shareTwitter").value = state.page.shareTwitter || "";
  $("shareBsky").value = state.page.shareBsky || "";
  $("shareText").value = state.page.shareText || "";
  const poolCount = placeholderPool().filter((p) => p.metadataCid).length;
  $("placeholderPoolStatus").textContent = poolCount
    ? `${poolCount} pinned unrevealed placeholder image${poolCount === 1 ? "" : "s"}.`
    : "No custom placeholder pool selected.";
  if (state.contract) $("btnSync").disabled = false;
  if (state.drop.coverCid)
    $("coverPreview").innerHTML =
      `<img src="${MD.ipfsToHttp("ipfs://" + state.drop.coverCid, state.pin.gateway)}" style="max-width:160px;border-radius:8px" />`;
  renderProfileAndInfrastructure();
  renderLaunchChecklist();
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
  const importedProfile = cfg.profile?.id || cfg.contractVersion;
  if (importedProfile === MACARONI_SECURE_PROFILE_ID) {
    state.drop.profileId = MACARONI_SECURE_PROFILE_ID;
    state.drop.contractVersion = MACARONI_SEALED_V3_PROFILE_ID;
  } else if (cfg.contractVersion) {
    state.drop.contractVersion = normalizeContractVersion(cfg.contractVersion);
    state.drop.profileId = state.drop.contractVersion;
  }
  if (cfg.service?.provider === "creator_companion") state.infrastructure.kind = "companion";
  if (cfg.service?.provider === "wtfos_managed") state.infrastructure.kind = "wtfos-managed";
  if (importedProfile === MACARONI_SECURE_PROFILE_ID && cfg.service?.projectId) {
    state.infrastructure.privateInventory.projectId = String(cfg.service.projectId);
    if (isCompanionProjectId(cfg.service.projectId)) {
      state.infrastructure.privateInventory.clientSetupId = String(cfg.service.projectId);
    }
    state.infrastructure.readiness = {
      ...(state.infrastructure.readiness || {}),
      publicStatusUrl: normalizeOptionalHttpUrl(cfg.service.publicStatusUrl),
      claimStatusUrlTemplate: normalizePublicUrlTemplate(cfg.service.claimStatusUrlTemplate, "claimId"),
      purchaseStatusUrlTemplate: normalizePublicUrlTemplate(cfg.service.purchaseStatusUrlTemplate, "operationHash"),
      wakeUrl: normalizeOptionalHttpUrl(cfg.service.wakeUrl),
    };
  }
  if (["pin_on_claim", "public_prepin_private_manifest"].includes(cfg.assetStrategy)) {
    state.infrastructure.assetStrategy = cfg.assetStrategy;
  }
  if (cfg.gateway) state.pin.gateway = cfg.gateway;
  if (cfg.minterRoyalties && typeof cfg.minterRoyalties === "object") {
    state.drop.minterRoyaltiesEnabled = !!cfg.minterRoyalties.enabled;
    state.drop.minterRoyaltyPct = Number(cfg.minterRoyalties.percent || (Number(cfg.minterRoyalties.bps || 0) / 100));
    state.drop.minterRoyaltyMode = normalizeMinterRoyaltyMode(cfg.minterRoyalties.mode);
    state.drop.royaltyUpdaterAddr = normalizeOptionalAddress(cfg.minterRoyalties.updater || state.drop.royaltyUpdaterAddr);
    state.drop.royaltyUpdateEndpoint = normalizeOptionalHttpUrl(cfg.minterRoyalties.updateEndpoint || state.drop.royaltyUpdateEndpoint);
  }
  if (cfg.reveal && typeof cfg.reveal === "object") {
    if (cfg.reveal.mode) state.drop.revealMode = cfg.reveal.mode;
    if (cfg.reveal.delayDays != null) state.drop.revealDelayDays = Number(cfg.reveal.delayDays);
    if (["rolling-delay", "absolute-time", "after-sellout"].includes(cfg.reveal.policy)) {
      state.drop.laterPolicy = cfg.reveal.policy;
    }
    if (cfg.reveal.at) state.drop.revealAt = String(cfg.reveal.at).slice(0, 16);
    if (Array.isArray(cfg.reveal.placeholderPool)) {
      state.drop.placeholderPool = cfg.reveal.placeholderPool.map((p) => ({
        name: p.name || "",
        mime: p.mime || "image/png",
        cid: String(p.artifact || "").replace(/^ipfs:\/\//, ""),
        metadataCid: String(p.metadata || "").replace(/^ipfs:\/\//, ""),
      }));
      state.drop.placeholderCid = state.drop.placeholderPool[0]?.metadataCid || state.drop.placeholderCid;
    }
  }
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
  const social = configRecord(cfg.social);
  const share = configRecord(cfg.share);
  state.page.shareTwitter = sanitizeSocialHandle(
    social.twitter || social.x || share.twitterHandle || share.xHandle || cfg.twitterHandle || cfg.xHandle
  );
  state.page.shareBsky = sanitizeSocialHandle(
    social.bsky || social.bluesky || share.bskyHandle || share.blueskyHandle || cfg.bskyHandle || cfg.blueskyHandle
  );
  state.page.shareText = shareFieldText(
    share.template || share.xText || share.twitterText || share.bskyText || share.blueskyText || cfg.shareText
  );
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
    const contractIsV35 = storage.claims_created != null && storage.claims_settled != null && storage.setup_finalized != null;
    if (contractIsV35) {
      state.drop.profileId = MACARONI_SECURE_PROFILE_ID;
      state.drop.contractVersion = MACARONI_SEALED_V3_PROFILE_ID;
    } else if (storage.token_commitments != null) {
      state.drop.profileId = MACARONI_SEALED_V3_PROFILE_ID;
      state.drop.contractVersion = MACARONI_SEALED_V3_PROFILE_ID;
    } else if (storage.token_supply != null && storage.minter_royalty_config != null) {
      state.drop.profileId = "macaroni-editions-v2";
      state.drop.contractVersion = "macaroni-editions-v2";
    } else {
      state.drop.profileId = "macaroni-v1";
      state.drop.contractVersion = "macaroni-v1";
    }
    if (!contractIsV35) {
      state.drop.revealMode = storage.delayed_reveal ? "delayed" : "instant";
      if (storage.reveal_operator) state.drop.revealOperator = normalizeOptionalAddress(String(storage.reveal_operator));
      if (storage.reveal_delay != null)
        state.drop.revealDelayDays = Math.round(Number(storage.reveal_delay) / 86400);
    }
    const loaded = Number(storage.supply || 0);
    const sold = Number(contractIsV35 ? storage.claims_created || 0 : storage.minted || 0);
    const locked = contractIsV35 ? !!storage.setup_finalized : !!storage.locked;
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
    if (isSecureV35Profile()) {
      await refreshSecureV35Readiness();
      if (state.infrastructure.readiness?.ready && hasSecureProjectRegistration()) {
        await refreshManagedV35Setup();
      }
    }
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
    if (isSecureV35Profile()) {
      await refreshSecureV35Readiness();
      if (state.infrastructure.readiness?.ready && hasSecureProjectRegistration()) {
        await refreshManagedV35Setup();
      }
    }
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
    [JSON.stringify({ version: 1, saved: new Date().toISOString(), state: safeCreatorStateSnapshot() }, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "macaroni-studio-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  log("Studio backup saved without wallet credentials, private CIDs, reveal nonces, preimages, or private storage references.");
}

function clearProjectFilesAndStatus() {
  mediaFiles.clear();
  coverFile = null;
  placeholderFiles = [];
  ["csvFile", "mediaFiles", "coverFile", "placeholderFiles", "importConfig", "importBackup"].forEach((id) => {
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
  refreshCreatorSocialDefaults();
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
setupWtfosRoleTooltip();
load();
fillForm();
refreshManagedMacaroniCapability();
reconcileLaunchJournal();
refreshPinningAccess();
refreshCreatorSocialDefaults();
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

$("network").addEventListener("change", () => {
  applyNetwork();
  if (isSecureV35Profile()) void refreshManagedMacaroniCapability();
});
$("rpc").addEventListener("change", applyNetwork);
$("btnConnect").addEventListener("click", connect);
$("csvFile").addEventListener("change", (e) => e.target.files[0] && onCsv(e.target.files[0]));
$("mediaFiles").addEventListener("change", (e) => onMedia([...e.target.files]));
$("placeholderFiles").addEventListener("change", (e) => {
  placeholderFiles = [...e.target.files].filter((f) => {
    if (!f.type.startsWith("image/")) {
      notify(`${f.name} is not an image. Unrevealed placeholders must be image files.`);
      return false;
    }
    return validateArtifactFile(f);
  });
  state.drop.placeholderPool = [];
  state.drop.placeholderCid = "";
  const count = placeholderFiles.length;
  $("placeholderPoolStatus").textContent = count
    ? `${count} unrevealed placeholder image${count === 1 ? "" : "s"} ready to pin.`
    : "No custom placeholder pool selected.";
  save();
  renderContractVersionHint();
});
$("coverFile").addEventListener("change", async (e) => {
  const boundSecureCover = isSecureV35Profile() && Boolean(managedV35PublicMetadata());
  coverFile = e.target.files[0] || null;
  if (!boundSecureCover) {
    state.infrastructure.privateInventory.companionCoverUploadId = "";
    state.infrastructure.privateInventory.companionCoverUploaded = false;
    state.drop.coverCid = "";
  }
  state.drop.placeholderCid = ""; // placeholder shows the cover → re-pin
  state.drop.placeholderPool = [];
  placeholderFiles = [];
  if ($("placeholderFiles")) $("placeholderFiles").value = "";
  if ($("placeholderPoolStatus")) $("placeholderPoolStatus").textContent = "No custom placeholder pool selected.";
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
    if (boundSecureCover) {
      notify("Public collection branding is already locked. This re-selected file is available only for any remaining token preview uploads.", "ok");
    }
  }
});
$("pinKind").addEventListener("change", () => { togglePinFields(); readForm(); });
["pinJwt", "pinUrl", "gateway", "dropTitle", "dropSymbol", "dropDesc", "contractVersion", "royaltyPct",
 "royaltyAddr", "minterRoyaltiesEnabled", "minterRoyaltyPct", "minterRoyaltyMode",
 "royaltyUpdaterAddr", "royaltyUpdateEndpoint", "treasuryAddr", "revealMode", "revealDelay", "claimIntervalSeconds", "laterPolicy", "revealAt", "assetStrategy", "publicPrepinRiskAcknowledged"]
  .forEach((id) => $(id).addEventListener("change", readForm));

$("btnUseSecureProfile").addEventListener("click", selectSecureProfile);
$("btnUseCompatibilityProfile").addEventListener("click", useSelectedCompatibilityProfile);
$("legacyRiskAcknowledged").addEventListener("change", (event) => {
  setLegacyRiskAcknowledgement(event.target.checked);
});
$("infraManaged").addEventListener("change", () => selectInfrastructure("wtfos-managed"));
$("infraCompanion").addEventListener("change", () => selectInfrastructure("companion"));
$("btnShowCompanionOption").addEventListener("click", () => {
  $("advancedOptions").open = true;
  selectInfrastructure("companion");
  $("infraCompanion").focus();
});
$("btnOpenCompanionSetupGuide").addEventListener("click", () => runNativeCompanionSetupAction("guide"));
$("btnOpenCompanionConfigFolder").addEventListener("click", () => runNativeCompanionSetupAction("config"));
$("btnCheckCompanionAgain").addEventListener("click", checkNativeCompanionAgain);
$("btnCheckCompanionAttention").addEventListener("click", inspectNativeCompanionAttention);
$("requestManagedAccess").addEventListener("click", async () => {
  const requestText = String(managedMacaroniCapability?.managed?.denial?.requestText || "").trim();
  if (!requestText || !navigator.clipboard?.writeText) return;
  try {
    await navigator.clipboard.writeText(requestText);
    $("requestManagedAccess").textContent = "Request copied · opening Contact Admin";
  } catch (_) {
    // The exact request remains visible directly above the link when clipboard access is denied.
  }
});

// Designer controls: regenerate code + live preview as you type.
["pageTheme", "pageAccent", "pageFont", "pageBlocks", "pageCss", "shareTwitter", "shareBsky", "shareText"].forEach((id) => {
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
$("btnStagePrivate").addEventListener("click", stageSecurePrivateInventory);
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
    MD.recordColanderContract(kt);
    $("resumeAddr").value = kt;
    $("btnSync").disabled = false;
    save();
  }
});
$("btnDeploy").addEventListener("click", deploy);
$("btnSync").addEventListener("click", sync);
$("btnCloseSecureSale").addEventListener("click", closeSecureV35Sale);
$("btnReveal").addEventListener("click", revealMinted);
$("btnExport").addEventListener("click", exportSite);
$("btnPublishWtfOS").addEventListener("click", publishWtfOSSite);
$("btnConfigOnly").addEventListener("click", () => downloadSitePackage());
$("btnPreview").addEventListener("click", previewPage);
