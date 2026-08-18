#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ValidationResult,
  validateAddress,
  validateContractAddress as validateContractAddressFromTaquito,
  validateOperation,
} from "@taquito/utils";

export const APP_ORDER = Object.freeze([
  "ch-ease",
  "macaroni",
  "spaghetti",
  "gnocchi",
  "ravioli",
  "rotini",
  "penne",
  "lasagna",
  "colander",
]);

export const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";
export const APP_PROOF_SCHEMA = "pastaprotocol-app-proof@1";
export const PACKAGE_SCHEMA = "pastaprotocol-proof-package@1";
export const GNOCCHI_HISTORICAL_INDEXER_SCHEMA =
  "pastaprotocol-gnocchi-historical-indexer-proof@1";
const RAVIOLI_REQUIRED_CAPABILITY_IDS = Object.freeze([
  "deterministic_vault-ui-live-proof",
  "blind_funded_pool-ui-live-proof",
  "blind_allocated_mint-ui-live-proof",
  "blind_generative_mint-ui-live-proof",
  "hybrid_atomic_pack-ui-live-proof",
  "blind-sealed-reveal-ui-live-proof",
  "limited-edition-expiry-deconfliction-ui-live-proof",
  "withheld-reveal-refund-closure-ui-live-proof",
  "durable-signer-journal-ui-live-proof",
]);
const RAVIOLI_MODE_NAMES = Object.freeze([
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
]);
export const RAVIOLI_MODE_MAX_SUPPLIES = Object.freeze([1, 2, 1, 1, 1]);
export const RAVIOLI_MODE_OPEN_COUNTS = Object.freeze([1, 2, 1, 1, 1]);
export const RAVIOLI_V3_JOURNAL_ENTRYPOINT_COUNTS = Object.freeze({
  add_minter: 3,
  add_pack_minter: 2,
  add_router: 5,
  buy: 7,
  cancel_unrevealed_pack: 1,
  commit_recipe: 8,
  create_allocation: 3,
  create_pack: 6,
  create_resource: 2,
  finalize_blind_pack: 5,
  finalize_pack: 1,
  mint: 1,
  open_pack: 6,
  recover_adapter: 1,
  refund_blind_claims: 1,
  set_pack_contents: 4,
  set_sale: 1,
  transfer: 2,
  update_operators: 3,
  withdraw_refund: 1,
});
export const RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT = 4;
export const RAVIOLI_V3_DEPENDENCY_ORIGINATION_COUNT = 2;
export const RAVIOLI_V3_JOURNAL_ACTOR_COUNTS = Object.freeze({
  creator: 49,
  collector1: 11,
  collector2: 7,
});
export const RAVIOLI_V3_JOURNAL_PIN_COUNT = 34;
export const RAVIOLI_V3_JOURNAL_WRITE_COUNT =
  RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT +
  Object.values(RAVIOLI_V3_JOURNAL_ENTRYPOINT_COUNTS).reduce(
    (total, count) => total + count,
    0,
  );
const RAVIOLI_JOURNAL_INTENT_SCHEMA =
  "pastaprotocol-ravioli-ui-live-journal-intent@2";
const RAVIOLI_JOURNAL_EFFECTIVE_INTENT_SCHEMA =
  "pastaprotocol-ravioli-ui-live-journal-intent@3";
const RAVIOLI_JOURNAL_EVENT_SCHEMA =
  "pastaprotocol-ravioli-ui-live-journal-event@2";
const RAVIOLI_JOURNAL_FINAL_SCHEMA =
  "pastaprotocol-ravioli-ui-live-journal-final@2";
const RAVIOLI_PLAN_EXTENSION_SCHEMA =
  "pastaprotocol-ravioli-ui-live-plan-extension@1";
const RAVIOLI_BASE_OPERATION_COUNT = 66;
const RAVIOLI_PLAN_EXTENSION_EVENT_INDEX = 87;
const RAVIOLI_MODE_OPEN_SHAPES = Object.freeze([
  Object.freeze({ actions: 1, escrow: 1, gnocchiFulfill: 0, gnocchiMint: 0, rotiniFulfill: 0, rotiniMint: 0, deltaKinds: Object.freeze(["escrow"]) }),
  Object.freeze({ actions: 1, escrow: 1, gnocchiFulfill: 0, gnocchiMint: 0, rotiniFulfill: 0, rotiniMint: 0, deltaKinds: Object.freeze(["escrow"]) }),
  Object.freeze({ actions: 1, escrow: 0, gnocchiFulfill: 1, gnocchiMint: 1, rotiniFulfill: 0, rotiniMint: 0, deltaKinds: Object.freeze(["allocated"]) }),
  Object.freeze({ actions: 2, escrow: 0, gnocchiFulfill: 0, gnocchiMint: 0, rotiniFulfill: 2, rotiniMint: 2, deltaKinds: Object.freeze(["generative", "generative"]) }),
  Object.freeze({ actions: 3, escrow: 1, gnocchiFulfill: 1, gnocchiMint: 1, rotiniFulfill: 1, rotiniMint: 1, deltaKinds: Object.freeze(["escrow-plus-allocated", "generative"]) }),
]);

const APP_RULES = Object.freeze({
  "ch-ease": {
    role: "preparation",
    requiredOperationKinds: [],
    minScreenshots: 2,
  },
  macaroni: {
    role: "token-publisher",
    requiredOperationKinds: ["origination", "mint"],
    minScreenshots: 3,
  },
  spaghetti: {
    role: "token-publisher",
    requiredOperationKinds: ["origination", "mint"],
    minScreenshots: 3,
  },
  gnocchi: {
    role: "token-publisher",
    requiredOperationKinds: ["origination", "mint"],
    minScreenshots: 3,
  },
  ravioli: {
    role: "token-publisher",
    requiredOperationKinds: ["origination", "mint", "open"],
    minScreenshots: 3,
  },
  rotini: {
    role: "token-publisher",
    requiredOperationKinds: ["origination", "reserve", "finalize"],
    minScreenshots: 3,
  },
  penne: {
    role: "token-publisher",
    requiredOperationKinds: ["origination", "distribute"],
    minScreenshots: 3,
  },
  lasagna: {
    role: "exhibition-registry",
    requiredOperationKinds: ["origination", "publish"],
    minScreenshots: 3,
  },
  colander: {
    role: "management",
    requiredOperationKinds: ["manage"],
    minScreenshots: 3,
  },
});

const PROHIBITED_JSON_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "authtoken",
  "bearertoken",
  "cookie",
  "credential",
  "jwt",
  "keyringmasterkey",
  "mnemonic",
  "passphrase",
  "password",
  "privatekey",
  "secretkey",
  "seedphrase",
]);

const PROHIBITED_FILE_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:credentials?|keyring)(?:[._-]|$)/i,
  /(?:^|[._-])(?:mnemonic|private-key|secret-key)(?:[._-]|$)/i,
  /\.(?:key|p12|pfx|pem)$/i,
];

const SECRET_TEXT_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{24,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*\b/i,
]);
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[_ -]?key|authorization|mnemonic|passphrase|password|private[_ -]?key|secret[_ -]?key|seed[_ -]?phrase)\s*[:=]\s*(?!REDACTED\b)["']?[^\s"'<>]{8,}/i;
const SECRET_ASSIGNMENT_EXTENSIONS = new Set([".csv", ".json", ".log", ".md", ".txt", ".yaml", ".yml"]);

const ROLE_BOUNDARIES = Object.freeze({
  "ch-ease": Object.freeze({
    contracts:
      "No contract is originated by CH-EASE; it prepares, pins, exports, and hands a package to a publisher app.",
    tokens:
      "No token is minted by CH-EASE; its role-correct proof is the prepared package, pinned bytes, export, and publisher handoff.",
  }),
  lasagna: Object.freeze({
    contracts:
      "Lasagna originates an exhibition registry contract and publishes exhibition revisions to that registry.",
    tokens:
      "No FA2 token is minted by Lasagna; it is an exhibition registry, so the registry contract, publication operation, and pinned exhibition metadata are the role-correct evidence.",
  }),
  colander: Object.freeze({
    contracts:
      "No contract is originated by Colander; it discovers and manages contracts originated by the other Pasta apps.",
    tokens:
      "No token is minted by Colander; its role-correct proof is discovery plus an applied management operation against a same-run sibling contract.",
  }),
});

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TOKEN_ID = /^(?:0|[1-9][0-9]*)$/;
const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1 = /^b[a-z2-7]{20,}$/;
const SCREENSHOT_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export class ProofPackageError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProofPackageError";
  }
}

function fail(message) {
  throw new ProofPackageError(message);
}

function expectObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function expectArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function expectString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function expectSafeId(value, label) {
  const id = expectString(value, label);
  if (!SAFE_ID.test(id)) fail(`${label} is not a safe identifier: ${id}`);
  return id;
}

function expectSha256(value, label) {
  const digest = expectString(value, label);
  if (!SHA256.test(digest)) fail(`${label} must be a lowercase SHA-256 digest`);
  return digest;
}

function digestBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function deterministicJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => deterministicJson(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${deterministicJson(value[key])}`).join(",")}}`;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateNoSecrets(value, label = "manifest") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoSecrets(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (
      typeof value === "string" &&
      (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) ||
        /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}\b/.test(value))
    ) {
      fail(`${label} contains signing material; proof packages must be non-secret`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (PROHIBITED_JSON_KEYS.has(normalized)) {
      fail(`${label}.${key} is prohibited in a non-secret proof package`);
    }
    validateNoSecrets(child, `${label}.${key}`);
  }
}

function validateNoSecretBytes(bytes, label, relativePath) {
  const text = bytes.toString("utf8");
  for (const pattern of SECRET_TEXT_PATTERNS) {
    if (pattern.test(text)) {
      fail(`${label} contains probable signing material or credentials; proof packages must be non-secret`);
    }
  }
  const extension = path.extname(relativePath).toLowerCase();
  if (SECRET_ASSIGNMENT_EXTENSIONS.has(extension) && SECRET_ASSIGNMENT_PATTERN.test(text)) {
    fail(`${label} contains probable signing material or credentials; proof packages must be non-secret`);
  }
  if (extension === ".json") {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      fail(`${label} uses a .json filename but is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    validateNoSecrets(parsed, label);
  }
}

function validateEvidenceFilename(relativePath, label) {
  if (PROHIBITED_FILE_PATTERNS.some((pattern) => pattern.test(relativePath))) {
    fail(`${label} is prohibited in a non-secret proof package: ${relativePath}`);
  }
}

function normalizeRelativePath(value, label, requiredRoot) {
  const raw = expectString(value, label);
  if (raw.includes("\\") || path.posix.isAbsolute(raw)) {
    fail(`${label} must be a portable relative path`);
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    fail(`${label} escapes its app evidence directory`);
  }
  if (normalized !== raw) fail(`${label} must already be normalized: ${raw}`);
  if (requiredRoot && !normalized.startsWith(`${requiredRoot}/`)) {
    fail(`${label} must be stored below ${requiredRoot}/`);
  }
  validateEvidenceFilename(normalized, label);
  return normalized;
}

function resolveInside(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(root, ...relativePath.split("/"));
  if (resolved === absoluteRoot || !resolved.startsWith(`${absoluteRoot}${path.sep}`)) {
    fail(`${label} escapes ${root}`);
  }
  return resolved;
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateHttpUrl(value, label, { requireHttps = false } = {}) {
  const raw = expectString(value, label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`${label} is not a valid URL: ${raw}`);
  }
  if (parsed.username || parsed.password) fail(`${label} must not contain URL credentials`);
  if (parsed.hash) fail(`${label} must not contain a fragment`);
  if (parsed.protocol === "https:") return parsed;
  const localHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]" ||
      parsed.hostname === "::1");
  if (!requireHttps && localHttp) return parsed;
  fail(`${label} must use HTTPS${requireHttps ? "" : " or loopback HTTP"}`);
}

function validateTzktUrl(value, identifier, label) {
  const parsed = validateHttpUrl(value, label, { requireHttps: true });
  if (parsed.hostname !== "shadownet.tzkt.io") {
    fail(`${label} must point to the Shadownet TzKT explorer`);
  }
  let pathSegments;
  try {
    pathSegments = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
  } catch {
    fail(`${label} contains an invalid encoded path`);
  }
  if (!pathSegments.includes(identifier)) {
    fail(`${label} does not contain its evidence identifier ${identifier}`);
  }
  return parsed.href;
}

function parseExactShadownetTokenUrl(value) {
  const parsed = new URL(value);
  if (parsed.hostname !== "shadownet.tzkt.io" || parsed.search) return null;
  let pathSegments;
  try {
    pathSegments = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
  } catch {
    return null;
  }
  if (pathSegments.length !== 3 || pathSegments[1] !== "tokens" || !TOKEN_ID.test(pathSegments[2])) {
    return null;
  }
  try {
    return {
      contractAddress: validateContractAddress(pathSegments[0], "Ravioli capability token URL contract"),
      tokenId: pathSegments[2],
    };
  } catch {
    return null;
  }
}

function validatePublicGatewayUrl(value, cid, label) {
  const parsed = validateHttpUrl(value, label, { requireHttps: true });
  const hostname = parsed.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)) {
    fail(`${label} must be a public HTTPS gateway, not a loopback host`);
  }
  let pathSegments;
  try {
    pathSegments = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
  } catch {
    fail(`${label} contains an invalid encoded path`);
  }
  const cidInPath = pathSegments.includes(cid);
  const cidInSubdomain = hostname.split(".").includes(cid.toLowerCase());
  if (!cidInPath && !cidInSubdomain) {
    fail(`${label} must contain CID ${cid} as a path segment or subdomain`);
  }
  return parsed;
}

function validateContractAddress(value, label) {
  const address = expectString(value, label);
  if (validateContractAddressFromTaquito(address) !== ValidationResult.VALID) {
    fail(`${label} is not a valid Tezos KT1 address: ${address}`);
  }
  return address;
}

function validateOperationHash(value, label) {
  const hash = expectString(value, label);
  if (validateOperation(hash) !== ValidationResult.VALID) {
    fail(`${label} is not a valid Tezos operation hash: ${hash}`);
  }
  return hash;
}

function validateIpfsUri(value, label) {
  const raw = expectString(value, label);
  if (!raw.startsWith("ipfs://")) fail(`${label} must use ipfs://`);
  const remainder = raw.slice("ipfs://".length);
  const [cid, ...segments] = remainder.split("/");
  if (!CID_V0.test(cid) && !CID_V1.test(cid)) fail(`${label} contains a malformed CID: ${cid}`);
  let decodedSegments;
  try {
    decodedSegments = segments.map((segment) => decodeURIComponent(segment));
  } catch {
    fail(`${label} contains an invalid encoded path`);
  }
  if (decodedSegments.some((segment) => segment === ".." || segment === ".")) {
    fail(`${label} contains an unsafe IPFS path`);
  }
  return { uri: raw, cid };
}

function hasScreenshotMagic(bytes, extension) {
  if (extension === ".png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === ".gif") {
    const signature = bytes.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (extension === ".webp") {
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

async function validateScreenshot(appRoot, screenshot, index, app) {
  const label = `${app}.screenshots[${index}]`;
  const source = expectObject(screenshot, label);
  const stage = expectSafeId(source.stage, `${label}.stage`);
  const relativePath = normalizeRelativePath(source.path, `${label}.path`, "screenshots");
  const expectedDigest = expectSha256(source.sha256, `${label}.sha256`);
  const caption = expectString(source.caption, `${label}.caption`);
  const absolutePath = resolveInside(appRoot, relativePath, `${label}.path`);
  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    fail(`${label}.path cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (bytes.length < 32) fail(`${label}.path is missing or empty: ${relativePath}`);
  validateNoSecretBytes(bytes, `${label}.path`, relativePath);
  const extension = path.extname(relativePath).toLowerCase();
  if (!SCREENSHOT_EXTENSIONS.has(extension) || !hasScreenshotMagic(bytes, extension)) {
    fail(`${label}.path is not a supported screenshot image: ${relativePath}`);
  }
  const actualDigest = digestBytes(bytes);
  if (actualDigest !== expectedDigest) {
    fail(`${label}.sha256 does not match ${relativePath}: expected ${expectedDigest}, got ${actualDigest}`);
  }
  return { stage, path: relativePath, sha256: actualDigest, bytes: bytes.length, caption };
}

function expectSafeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function expectCanonicalNat(value, label) {
  const text = expectString(value, label);
  if (!TOKEN_ID.test(text)) fail(`${label} must be a canonical non-negative integer string`);
  return text;
}

function expectBoolean(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

function validateProofRequest(value, label, expectedPath, expectedQuery = {}) {
  const source = expectObject(value, label);
  if (source.method !== "GET") fail(`${label}.method must be GET`);
  const parsed = validateHttpUrl(source.url, `${label}.url`, { requireHttps: true });
  if (parsed.hostname !== "api.shadownet.tzkt.io") {
    fail(`${label}.url must use the Shadownet TzKT API`);
  }
  if (decodeURIComponent(parsed.pathname) !== expectedPath) {
    fail(`${label}.url must use path ${expectedPath}`);
  }
  for (const [key, expected] of Object.entries(expectedQuery)) {
    if (parsed.searchParams.get(key) !== String(expected)) {
      fail(`${label}.url query ${key} must equal ${expected}`);
    }
  }
  const url = parsed.href;
  if (source.url !== url) fail(`${label}.url must be in canonical URL form`);
  const digest = expectSha256(source.sha256, `${label}.sha256`);
  const expectedDigest = digestBytes(Buffer.from(`GET\n${url}\n`, "utf8"));
  if (digest !== expectedDigest) fail(`${label}.sha256 does not bind its exact GET URL`);
  return { method: "GET", url, sha256: digest };
}

function validateProofResponse(value, label) {
  const source = expectObject(value, label);
  const status = expectSafeInteger(source.status, `${label}.status`, 100);
  if (status < 200 || status >= 300) fail(`${label}.status must be a successful HTTP status`);
  return {
    status,
    byteCount: expectSafeInteger(source.byteCount, `${label}.byteCount`, 1),
    rawSha256: expectSha256(source.rawSha256, `${label}.rawSha256`),
    canonicalSha256: expectSha256(source.canonicalSha256, `${label}.canonicalSha256`),
  };
}

function validateHistoricalTokenState(value, label) {
  const source = expectObject(value, label);
  const balances = expectArray(source.balances, `${label}.balances`).map((entry, index) => {
    const balance = expectObject(entry, `${label}.balances[${index}]`);
    const account = expectString(balance.account, `${label}.balances[${index}].account`);
    if (validateAddress(account) !== ValidationResult.VALID) {
      fail(`${label}.balances[${index}].account is not a valid Tezos address`);
    }
    const amount = expectCanonicalNat(balance.balance, `${label}.balances[${index}].balance`);
    if (amount === "0") fail(`${label}.balances[${index}].balance must be positive`);
    return { account, balance: amount };
  });
  const accounts = balances.map((entry) => entry.account);
  if (new Set(accounts).size !== accounts.length) fail(`${label}.balances contains duplicate accounts`);
  if ([...accounts].sort(compareText).join("\n") !== accounts.join("\n")) {
    fail(`${label}.balances must be sorted by account`);
  }
  const totalSupply = expectCanonicalNat(source.totalSupply, `${label}.totalSupply`);
  const calculatedSupply = balances
    .reduce((sum, entry) => sum + BigInt(entry.balance), 0n)
    .toString();
  if (totalSupply !== calculatedSupply) {
    fail(`${label}.totalSupply does not equal the sum of positive balances`);
  }
  const holdersCount = expectSafeInteger(source.holdersCount, `${label}.holdersCount`, 0);
  if (holdersCount !== balances.length) {
    fail(`${label}.holdersCount does not equal the positive balance count`);
  }
  return { balances, totalSupply, holdersCount };
}

function expectedHistoricalBalanceChanges(proofState, currentState) {
  const proof = new Map(proofState.balances.map((entry) => [entry.account, entry.balance]));
  const current = new Map(currentState.balances.map((entry) => [entry.account, entry.balance]));
  return [...new Set([...proof.keys(), ...current.keys()])]
    .sort(compareText)
    .flatMap((account) => {
      const proofBalance = proof.get(account) || "0";
      const currentBalance = current.get(account) || "0";
      return proofBalance === currentBalance ? [] : [{ account, proofBalance, currentBalance }];
    });
}

function validateGnocchiHistoricalIndexerArtifact(bytes, label, app) {
  if (app !== "gnocchi") fail(`${label} historical-indexer-snapshot is only valid for gnocchi`);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const source = expectObject(parsed, label);
  validateNoSecrets(source, label);
  if (source.schema !== GNOCCHI_HISTORICAL_INDEXER_SCHEMA) {
    fail(`${label}.schema must be ${GNOCCHI_HISTORICAL_INDEXER_SCHEMA}`);
  }
  if (source.app !== "gnocchi") fail(`${label}.app must be gnocchi`);
  const network = expectObject(source.network, `${label}.network`);
  if (network.name !== "shadownet" || network.chainId !== SHADOWNET_CHAIN_ID) {
    fail(`${label}.network must identify Shadownet ${SHADOWNET_CHAIN_ID}`);
  }
  const tzktApiBase = validateHttpUrl(network.tzktApiBase, `${label}.network.tzktApiBase`, {
    requireHttps: true,
  });
  if (tzktApiBase.hostname !== "api.shadownet.tzkt.io") {
    fail(`${label}.network.tzktApiBase must use the Shadownet TzKT API`);
  }
  const sourceManifest = expectObject(source.sourceManifest, `${label}.sourceManifest`);
  const normalizedSourceManifest = {
    runId: expectSafeId(sourceManifest.runId, `${label}.sourceManifest.runId`),
    capturedAt: expectString(sourceManifest.capturedAt, `${label}.sourceManifest.capturedAt`),
    preSupplementSha256: expectSha256(
      sourceManifest.preSupplementSha256,
      `${label}.sourceManifest.preSupplementSha256`,
    ),
    acceptedOperationsSha256: expectSha256(
      sourceManifest.acceptedOperationsSha256,
      `${label}.sourceManifest.acceptedOperationsSha256`,
    ),
    tokenIdentitiesSha256: expectSha256(
      sourceManifest.tokenIdentitiesSha256,
      `${label}.sourceManifest.tokenIdentitiesSha256`,
    ),
  };
  const contractAddress = validateContractAddress(source.contractAddress, `${label}.contractAddress`);
  const proofLevel = expectSafeInteger(source.proofLevel, `${label}.proofLevel`, 1);
  const acceptedOperations = expectArray(source.acceptedOperations, `${label}.acceptedOperations`).map(
    (entry, index) => {
      const operationLabel = `${label}.acceptedOperations[${index}]`;
      const operation = expectObject(entry, operationLabel);
      const hash = validateOperationHash(operation.hash, `${operationLabel}.hash`);
      const kind = expectSafeId(operation.kind, `${operationLabel}.kind`);
      const operationContract = validateContractAddress(
        operation.contractAddress,
        `${operationLabel}.contractAddress`,
      );
      if (operationContract !== contractAddress) fail(`${operationLabel} references the wrong contract`);
      if (operation.status !== "applied") fail(`${operationLabel}.status must be applied`);
      const entrypoint = kind === "origination"
        ? operation.entrypoint === null
          ? null
          : fail(`${operationLabel}.entrypoint must be null for origination`)
        : expectSafeId(operation.entrypoint, `${operationLabel}.entrypoint`);
      return {
        hash,
        kind,
        contractAddress: operationContract,
        entrypoint,
        status: "applied",
        level: expectSafeInteger(operation.level, `${operationLabel}.level`, 1),
        request: validateProofRequest(
          operation.request,
          `${operationLabel}.request`,
          `/v1/operations/${hash}`,
        ),
        response: validateProofResponse(operation.response, `${operationLabel}.response`),
      };
    },
  );
  if (acceptedOperations.length === 0) fail(`${label}.acceptedOperations must not be empty`);
  if (new Set(acceptedOperations.map((entry) => entry.hash)).size !== acceptedOperations.length) {
    fail(`${label}.acceptedOperations contains duplicate operation hashes`);
  }
  const maximumLevel = Math.max(...acceptedOperations.map((entry) => entry.level));
  if (maximumLevel !== proofLevel) fail(`${label}.proofLevel must be the last accepted operation level`);
  const terminal = expectObject(source.terminalAcceptedOperation, `${label}.terminalAcceptedOperation`);
  const terminalHash = validateOperationHash(terminal.hash, `${label}.terminalAcceptedOperation.hash`);
  const terminalLevel = expectSafeInteger(
    terminal.level,
    `${label}.terminalAcceptedOperation.level`,
    1,
  );
  if (
    terminalLevel !== proofLevel ||
    !acceptedOperations.some((operation) => operation.hash === terminalHash && operation.level === proofLevel)
  ) {
    fail(`${label}.terminalAcceptedOperation must identify an accepted operation at proofLevel`);
  }

  const tokens = expectArray(source.tokens, `${label}.tokens`).map((entry, index) => {
    const tokenLabel = `${label}.tokens[${index}]`;
    const token = expectObject(entry, tokenLabel);
    const tokenId = expectCanonicalNat(token.tokenId, `${tokenLabel}.tokenId`);
    const proofState = validateHistoricalTokenState(token.proofState, `${tokenLabel}.proofState`);
    const historicalRequest = expectObject(token.historicalRequest, `${tokenLabel}.historicalRequest`);
    const historical = {
      request: validateProofRequest(
        historicalRequest.request,
        `${tokenLabel}.historicalRequest.request`,
        `/v1/tokens/historical_balances/${proofLevel}`,
        {
          "token.contract": contractAddress,
          "token.tokenId": tokenId,
          limit: "10000",
        },
      ),
      response: validateProofResponse(
        historicalRequest.response,
        `${tokenLabel}.historicalRequest.response`,
      ),
    };
    const comparison = expectObject(token.currentComparison, `${tokenLabel}.currentComparison`);
    const currentState = validateHistoricalTokenState(
      comparison.state,
      `${tokenLabel}.currentComparison.state`,
    );
    const currentRequest = validateProofRequest(
      comparison.request,
      `${tokenLabel}.currentComparison.request`,
      "/v1/tokens/balances",
      {
        "token.contract": contractAddress,
        "token.tokenId": tokenId,
        "balance.gt": "0",
        limit: "10000",
      },
    );
    const currentResponse = validateProofResponse(
      comparison.response,
      `${tokenLabel}.currentComparison.response`,
    );
    const changes = expectArray(comparison.changes, `${tokenLabel}.currentComparison.changes`).map(
      (changeValue, changeIndex) => {
        const changeLabel = `${tokenLabel}.currentComparison.changes[${changeIndex}]`;
        const change = expectObject(changeValue, changeLabel);
        const account = expectString(change.account, `${changeLabel}.account`);
        if (validateAddress(account) !== ValidationResult.VALID) {
          fail(`${changeLabel}.account is not a valid Tezos address`);
        }
        return {
          account,
          proofBalance: expectCanonicalNat(change.proofBalance, `${changeLabel}.proofBalance`),
          currentBalance: expectCanonicalNat(change.currentBalance, `${changeLabel}.currentBalance`),
        };
      },
    );
    const expectedChanges = expectedHistoricalBalanceChanges(proofState, currentState);
    if (JSON.stringify(changes) !== JSON.stringify(expectedChanges)) {
      fail(`${tokenLabel}.currentComparison.changes does not match proof/current balances`);
    }
    const mutationDetected = expectBoolean(
      comparison.mutationDetected,
      `${tokenLabel}.currentComparison.mutationDetected`,
    );
    if (mutationDetected !== (changes.length > 0)) {
      fail(`${tokenLabel}.currentComparison.mutationDetected does not match its changes`);
    }
    return {
      tokenId,
      proofState,
      historicalRequest: historical,
      currentComparison: {
        state: currentState,
        request: currentRequest,
        response: currentResponse,
        mutationDetected,
        changes,
      },
    };
  });
  if (tokens.length === 0) fail(`${label}.tokens must not be empty`);
  if (new Set(tokens.map((entry) => entry.tokenId)).size !== tokens.length) {
    fail(`${label}.tokens contains duplicate token ids`);
  }
  return {
    schema: GNOCCHI_HISTORICAL_INDEXER_SCHEMA,
    contractAddress,
    proofLevel,
    terminalOperationHash: terminalHash,
    acceptedOperations,
    tokens,
    sourceManifest: normalizedSourceManifest,
  };
}

function validateRavioliLimitedEditionPolicyArtifact(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} must contain valid JSON`);
  }
  const source = expectObject(value, `${label}.policy`);
  if (source.schema !== "pastaprotocol-ravioli-limited-edition-policy-evidence@1") {
    fail(`${label}.policy.schema is unsupported`);
  }
  if (source.capabilityId !== "limited-edition-expiry-deconfliction-ui-live-proof") {
    fail(`${label}.policy.capabilityId drifted`);
  }
  if (source.status !== "PASSED") fail(`${label}.policy.status must be PASSED`);
  const network = expectObject(source.network, `${label}.policy.network`);
  if (network.name !== "shadownet" || network.chainId !== SHADOWNET_CHAIN_ID) {
    fail(`${label}.policy.network must be Tezos Shadownet`);
  }
  const wrapper = expectObject(source.wrapper, `${label}.policy.wrapper`);
  const child = expectObject(source.child, `${label}.policy.child`);
  const invariant = expectObject(source.invariant, `${label}.policy.invariant`);
  const wrapperContract = validateContractAddress(wrapper.contract, `${label}.policy.wrapper.contract`);
  const wrapperTokenId = expectSafeInteger(wrapper.tokenId, `${label}.policy.wrapper.tokenId`);
  const wrapperMaxSupply = expectSafeInteger(wrapper.maxSupply, `${label}.policy.wrapper.maxSupply`, 1);
  const wrapperSaleEnd = expectString(wrapper.saleEnd, `${label}.policy.wrapper.saleEnd`);
  const childExpiryCommittedOnChain = expectString(wrapper.childExpiryCommittedOnChain, `${label}.policy.wrapper.childExpiryCommittedOnChain`);
  const childContract = validateContractAddress(child.contract, `${label}.policy.child.contract`);
  const childTokenId = expectSafeInteger(child.tokenId, `${label}.policy.child.tokenId`);
  const childMaxSupply = expectSafeInteger(child.maxSupply, `${label}.policy.child.maxSupply`, 1);
  const childExpiry = expectString(child.expiry, `${label}.policy.child.expiry`);
  for (const [name, timestamp] of [["wrapper.saleEnd", wrapperSaleEnd], ["wrapper.childExpiryCommittedOnChain", childExpiryCommittedOnChain], ["child.expiry", childExpiry]]) {
    if (!Number.isFinite(Date.parse(timestamp))) fail(`${label}.policy.${name} must be an ISO timestamp`);
  }
  if (Date.parse(childExpiryCommittedOnChain) !== Date.parse(childExpiry)) {
    fail(`${label}.policy committed child expiry differs from the child`);
  }
  if (Date.parse(wrapperSaleEnd) >= Date.parse(childExpiry)) {
    fail(`${label}.policy wrapper must end strictly before its child`);
  }
  if (child.active !== true || child.policyLocked !== true) fail(`${label}.policy child must be active and policy-locked`);
  for (const key of [
    "wrapperIsFiniteSupply",
    "wrapperIsFiniteTime",
    "wrapperEndsBeforeChild",
    "childPolicyStoredInPack",
    "wrapperDeadlineStoredInPack",
    "wrapperIssuedAtomicallyWithSale",
  ]) {
    if (expectBoolean(invariant[key], `${label}.policy.invariant.${key}`) !== true) {
      fail(`${label}.policy.invariant.${key} must be true`);
    }
  }
  const rejected = expectArray(source.rejectedInvalidPolicies, `${label}.policy.rejectedInvalidPolicies`);
  if (rejected.length < 3 || rejected.some((entry, index) => !expectString(entry, `${label}.policy.rejectedInvalidPolicies[${index}]`))) {
    fail(`${label}.policy must retain at least three invalid-policy rejections`);
  }
  return {
    wrapperContract,
    wrapperTokenId: String(wrapperTokenId),
    wrapperMaxSupply,
    wrapperSaleEnd,
    childContract,
    childTokenId: String(childTokenId),
    childMaxSupply,
    childExpiry,
  };
}

function validateRavioliModeOutcomeArtifact(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} must contain valid JSON`);
  }
  const source = expectObject(value, `${label}.outcome`);
  if (source.schema !== "pastaprotocol-ravioli-mode-outcome@1") fail(`${label}.outcome.schema is unsupported`);
  const network = expectObject(source.network, `${label}.outcome.network`);
  if (network.name !== "shadownet" || network.chainId !== SHADOWNET_CHAIN_ID) fail(`${label}.outcome.network must be Shadownet`);
  const tokenId = expectSafeInteger(source.tokenId, `${label}.outcome.tokenId`);
  if (tokenId >= RAVIOLI_MODE_NAMES.length || source.mode !== RAVIOLI_MODE_NAMES[tokenId]) fail(`${label}.outcome mode/token mismatch`);
  const expectedEditionCount = expectSafeInteger(source.expectedEditionCount, `${label}.outcome.expectedEditionCount`, 1);
  if (expectedEditionCount !== RAVIOLI_MODE_OPEN_COUNTS[tokenId]) fail(`${label}.outcome sold/open count drift`);
  const maxSupply = expectSafeInteger(source.maxSupply, `${label}.outcome.maxSupply`, 1);
  if (maxSupply !== RAVIOLI_MODE_MAX_SUPPLIES[tokenId]) fail(`${label}.outcome wrapper max-supply drift`);
  if (expectedEditionCount > maxSupply) fail(`${label}.outcome sold/open count exceeds wrapper supply`);
  const operationHashes = expectArray(source.operationHashes, `${label}.outcome.operationHashes`).map(
    (hash, index) => validateOperationHash(hash, `${label}.outcome.operationHashes[${index}]`),
  );
  if (operationHashes.length === 0 || new Set(operationHashes).size !== operationHashes.length) fail(`${label}.outcome operation partition is empty or duplicated`);
  const purchases = expectArray(source.purchaseCheckpoints, `${label}.outcome.purchaseCheckpoints`);
  const opens = expectArray(source.openOutcomes, `${label}.outcome.openOutcomes`);
  if (purchases.length !== expectedEditionCount || opens.length !== expectedEditionCount) fail(`${label}.outcome purchase/open count drift`);
  const serials = [];
  for (const [index, entry] of purchases.entries()) {
    const purchase = expectObject(entry, `${label}.outcome.purchaseCheckpoints[${index}]`);
    if (expectSafeInteger(purchase.tokenId, `${label}.outcome.purchaseCheckpoints[${index}].tokenId`) !== tokenId) fail(`${label}.outcome purchase token drift`);
    const hash = validateOperationHash(purchase.operationHash, `${label}.outcome.purchaseCheckpoints[${index}].operationHash`);
    if (!operationHashes.includes(hash)) fail(`${label}.outcome purchase hash escapes the mode partition`);
    if (expectSafeInteger(purchase.balance, `${label}.outcome.purchaseCheckpoints[${index}].balance`, 1) < 1) fail(`${label}.outcome purchase lacks a live wrapper balance`);
  }
  for (const [index, entry] of opens.entries()) {
    const open = expectObject(entry, `${label}.outcome.openOutcomes[${index}]`);
    if (expectSafeInteger(open.tokenId, `${label}.outcome.openOutcomes[${index}].tokenId`) !== tokenId) fail(`${label}.outcome open token drift`);
    const openSerial = expectSafeInteger(open.serial, `${label}.outcome.openOutcomes[${index}].serial`);
    serials.push(openSerial);
    const collector = expectString(open.collector, `${label}.outcome.openOutcomes[${index}].collector`);
    if (validateAddress(collector) !== ValidationResult.VALID || !collector.startsWith("tz")) fail(`${label}.outcome collector is not a valid implicit Tezos address`);
    const hash = validateOperationHash(open.operationHash, `${label}.outcome.openOutcomes[${index}].operationHash`);
    if (!operationHashes.includes(hash)) fail(`${label}.outcome open hash escapes the mode partition`);
    const operationTreeSha256 = expectSha256(open.operationTreeSha256, `${label}.outcome.openOutcomes[${index}].operationTreeSha256`);
    const operationTree = expectArray(open.operationTree, `${label}.outcome.openOutcomes[${index}].operationTree`);
    if (operationTree.length === 0) fail(`${label}.outcome open tree is empty`);
    if (digestBytes(Buffer.from(deterministicJson(operationTree), "utf8")) !== operationTreeSha256) {
      fail(`${label}.outcome open tree does not match its SHA-256 commitment`);
    }
    const openShape = RAVIOLI_MODE_OPEN_SHAPES[tokenId];
    const exactCallCounts = expectObject(open.exactCallCounts, `${label}.outcome.openOutcomes[${index}].exactCallCounts`);
    for (const key of ["actions", "escrow", "gnocchiFulfill", "gnocchiMint", "rotiniFulfill", "rotiniMint"]) {
      if (expectSafeInteger(exactCallCounts[key], `${label}.outcome.openOutcomes[${index}].exactCallCounts.${key}`) !== openShape[key]) {
        fail(`${label}.outcome exact ${key} call count drift`);
      }
    }
    const operationRows = operationTree.map((value, rowIndex) => {
      const row = expectObject(value, `${label}.outcome.openOutcomes[${index}].operationTree[${rowIndex}]`);
      if (row.status !== "applied") fail(`${label}.outcome open tree contains a non-applied operation`);
      return row;
    });
    const entrypointCount = (entrypoint) => operationRows.filter((row) => row.entrypoint === entrypoint).length;
    if (entrypointCount("open_pack") !== 1) fail(`${label}.outcome open tree must contain one open_pack root`);
    if (entrypointCount("transfer") !== openShape.escrow) fail(`${label}.outcome open tree escrow call count drift`);
    if (entrypointCount("fulfill") !== openShape.gnocchiFulfill + openShape.rotiniFulfill) fail(`${label}.outcome open tree adapter call count drift`);
    if (entrypointCount("mint_reserved") !== openShape.gnocchiMint) fail(`${label}.outcome open tree allocated-mint call count drift`);
    if (entrypointCount("mint_pack_iteration") !== openShape.rotiniMint) fail(`${label}.outcome open tree generative-mint call count drift`);
    const rootRow = operationRows.find((row) => row.entrypoint === "open_pack");
    const rootValue = expectObject(rootRow.value, `${label}.outcome open_pack value`);
    if (expectCanonicalNat(rootValue.token_id, `${label}.outcome open_pack token_id`) !== String(tokenId)) {
      fail(`${label}.outcome open_pack token drift`);
    }
    if (expectArray(rootValue.actions, `${label}.outcome open_pack actions`).length !== openShape.actions) fail(`${label}.outcome open_pack action count drift`);
    const deltas = expectArray(open.balanceDeltas, `${label}.outcome.openOutcomes[${index}].balanceDeltas`);
    if (deltas.length !== openShape.deltaKinds.length) fail(`${label}.outcome child balance-delta count drift`);
    const deltaKinds = [];
    for (const [deltaIndex, deltaValue] of deltas.entries()) {
      const delta = expectObject(deltaValue, `${label}.outcome.openOutcomes[${index}].balanceDeltas[${deltaIndex}]`);
      deltaKinds.push(expectString(delta.kind, `${label}.outcome delta kind`));
      const amount = expectSafeInteger(delta.amount, `${label}.outcome delta amount`, 1);
      if (expectSafeInteger(delta.delta, `${label}.outcome delta`, 1) !== amount) fail(`${label}.outcome child balance delta differs from its promised amount`);
      const before = expectSafeInteger(delta.before, `${label}.outcome balance before`);
      if (expectSafeInteger(delta.after, `${label}.outcome balance after`) !== before + amount) fail(`${label}.outcome child balance arithmetic drift`);
      validateContractAddress(delta.contract, `${label}.outcome child contract`);
      expectSafeInteger(delta.tokenId, `${label}.outcome child tokenId`);
    }
    if (tokenId === 1) {
      const expectedEscrowProvenance = openSerial === 0
        ? "escrow-returned-claim"
        : "escrow-transferred-claim";
      if (deltaKinds.length !== 1 || deltaKinds[0] !== expectedEscrowProvenance) {
        fail(`${label}.outcome blind funded-pool claim provenance drift`);
      }
    }
    const normalizedDeltaKinds = deltaKinds.map((kind) =>
      kind === "escrow-returned-claim" || kind === "escrow-transferred-claim"
        ? "escrow"
        : kind
    );
    if (JSON.stringify(normalizedDeltaKinds.sort()) !== JSON.stringify([...openShape.deltaKinds].sort())) {
      fail(`${label}.outcome child delivery kinds drift`);
    }
  }
  if (new Set(serials).size !== expectedEditionCount || Math.min(...serials) !== 0 || Math.max(...serials) !== expectedEditionCount - 1) {
    fail(`${label}.outcome open serials are incomplete`);
  }
  return { tokenId, mode: RAVIOLI_MODE_NAMES[tokenId], operationHashes };
}

function parseRavioliJournalJson(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} must contain valid JSON`);
  }
  return expectObject(value, label);
}

function validateRavioliRecoverAdapterOperation(value, label) {
  const source = expectObject(value, label);
  if (
    source.id !== "withheld-reveal-refund:creator-recover-adapter" ||
    source.proofPartition !== "withheld-reveal-refund" ||
    expectSafeInteger(source.globalOrdinal, `${label}.globalOrdinal`, 1) !== 67 ||
    source.actor !== "creator" ||
    expectSafeInteger(source.operationSequence, `${label}.operationSequence`, 1) !== 49 ||
    source.action !== "call" ||
    source.targetRole !== "router" ||
    source.entrypoint !== "recover_adapter" ||
    expectSafeInteger(source.tokenId, `${label}.tokenId`) !== 5 ||
    source.adapterRole !== "gnocchiAdapter" ||
    expectSafeInteger(source.adapterKind, `${label}.adapterKind`) !== 1 ||
    expectSafeInteger(source.resourceId, `${label}.resourceId`) !== 2 ||
    expectSafeInteger(source.capacity, `${label}.capacity`, 1) !== 2
  ) {
    fail(`${label} differs from the authenticated token-5 Gnocchi capacity recovery`);
  }
  return source;
}

function validateRavioliJournalIntentArtifact(bytes, label) {
  const source = parseRavioliJournalJson(bytes, `${label}.intent`);
  if (
    source.schema !== RAVIOLI_JOURNAL_INTENT_SCHEMA &&
    source.schema !== RAVIOLI_JOURNAL_EFFECTIVE_INTENT_SCHEMA
  ) {
    fail(`${label}.intent.schema is unsupported`);
  }
  if (source.status !== "IMMUTABLE") fail(`${label}.intent.status must be IMMUTABLE`);
  const journalId = expectSha256(source.journalId, `${label}.intent.journalId`);
  const matrix = expectArray(source.matrix, `${label}.intent.matrix`);
  const expectedOperationCount =
    source.schema === RAVIOLI_JOURNAL_INTENT_SCHEMA
      ? RAVIOLI_BASE_OPERATION_COUNT
      : RAVIOLI_V3_JOURNAL_WRITE_COUNT;
  if (matrix.length !== expectedOperationCount) {
    fail(`${label}.intent matrix must contain ${expectedOperationCount} operations`);
  }
  const matrixSha256 = expectSha256(
    source.matrixSha256,
    `${label}.intent.matrixSha256`,
  );
  if (
    digestBytes(Buffer.from(deterministicJson(matrix), "utf8")) !==
    matrixSha256
  ) {
    fail(`${label}.intent matrix does not match its SHA-256 commitment`);
  }
  const recoveryOperations = matrix.filter(
    (operation) => operation?.entrypoint === "recover_adapter",
  );
  if (source.schema === RAVIOLI_JOURNAL_INTENT_SCHEMA) {
    if (recoveryOperations.length !== 0) {
      fail(`${label}.legacy intent must preserve the immutable base-66 plan`);
    }
  } else {
    if (recoveryOperations.length !== 1) {
      fail(`${label}.effective intent must contain exactly one recover_adapter operation`);
    }
    validateRavioliRecoverAdapterOperation(
      recoveryOperations[0],
      `${label}.intent recover_adapter`,
    );
  }
  return {
    schema: source.schema,
    journalId,
    matrixSha256,
    operationCount: matrix.length,
  };
}

function validateRavioliJournalEventArtifact(bytes, label) {
  const source = parseRavioliJournalJson(bytes, `${label}.event`);
  if (source.schema !== RAVIOLI_JOURNAL_EVENT_SCHEMA) {
    fail(`${label}.event.schema is unsupported`);
  }
  const eventIndex = expectSafeInteger(source.eventIndex, `${label}.event.eventIndex`, 1);
  const phase = expectString(source.phase, `${label}.event.phase`);
  const journalId = expectSha256(source.journalId, `${label}.event.journalId`);
  const actor = expectString(source.actor, `${label}.event.actor`);
  if (!["creator", "collector1", "collector2"].includes(actor)) {
    fail(`${label}.event.actor is unsupported`);
  }
  if (phase === "PIN") {
    const pinSequence = expectSafeInteger(
      source.pinSequence,
      `${label}.event.pinSequence`,
      1,
    );
    const artifact = expectObject(source.artifact, `${label}.event.artifact`);
    const fileName = expectString(artifact.fileName, `${label}.event.artifact.fileName`);
    const pinPath = normalizeRelativePath(
      artifact.path,
      `${label}.event.artifact.path`,
      "pins",
    );
    const sha256 = expectSha256(
      artifact.sha256,
      `${label}.event.artifact.sha256`,
    );
    const byteLength = expectSafeInteger(
      artifact.byteLength,
      `${label}.event.artifact.byteLength`,
      1,
    );
    return {
      phase,
      eventIndex,
      journalId,
      actor,
      pin: { pinSequence, fileName, path: pinPath, sha256, byteLength },
    };
  }
  if (phase === "PLAN_EXTENSION") {
    if (
      eventIndex !== RAVIOLI_PLAN_EXTENSION_EVENT_INDEX ||
      actor !== "creator"
    ) {
      fail(`${label}.event plan extension is outside authenticated event 87`);
    }
    const extension = expectObject(
      source.extension,
      `${label}.event.extension`,
    );
    if (
      extension.schema !== RAVIOLI_PLAN_EXTENSION_SCHEMA ||
      extension.extensionId !==
        "ravioli-event86-withheld-gnocchi-capacity-recovery-v1" ||
      expectSafeInteger(
        extension.baseOperationCount,
        `${label}.event.extension.baseOperationCount`,
      ) !== RAVIOLI_BASE_OPERATION_COUNT ||
      expectSafeInteger(
        extension.semanticBoundary,
        `${label}.event.extension.semanticBoundary`,
      ) !== 23
    ) {
      fail(`${label}.event plan-extension boundary drifted`);
    }
    const extensionOperations = expectArray(
      extension.operations,
      `${label}.event.extension.operations`,
    );
    if (extensionOperations.length !== 1) {
      fail(`${label}.event plan extension must append exactly one operation`);
    }
    validateRavioliRecoverAdapterOperation(
      extensionOperations[0],
      `${label}.event.extension.operations[0]`,
    );
    const extensionSha256 = expectSha256(
      source.extensionSha256,
      `${label}.event.extensionSha256`,
    );
    if (
      digestBytes(Buffer.from(deterministicJson(extension), "utf8")) !==
      extensionSha256
    ) {
      fail(`${label}.event plan extension does not match its SHA-256 commitment`);
    }
    if (
      expectSafeInteger(
        source.effectiveOperationCount,
        `${label}.event.effectiveOperationCount`,
      ) !== RAVIOLI_V3_JOURNAL_WRITE_COUNT
    ) {
      fail(`${label}.event effective operation count drifted`);
    }
    return {
      phase,
      eventIndex,
      journalId,
      actor,
      extension: {
        baseIntentSha256: expectSha256(
          extension.baseIntentSha256,
          `${label}.event.extension.baseIntentSha256`,
        ),
        baseMatrixSha256: expectSha256(
          extension.baseMatrixSha256,
          `${label}.event.extension.baseMatrixSha256`,
        ),
        effectiveMatrixSha256: expectSha256(
          source.effectiveMatrixSha256,
          `${label}.event.effectiveMatrixSha256`,
        ),
      },
    };
  }
  return { phase, eventIndex, journalId, actor };
}

function validateRavioliJournalFinalArtifact(bytes, label) {
  const source = parseRavioliJournalJson(bytes, `${label}.final`);
  if (
    source.schema !== RAVIOLI_JOURNAL_FINAL_SCHEMA ||
    source.status !== "FINALIZED"
  ) {
    fail(`${label}.final must be a finalized Ravioli journal`);
  }
  const journalId = expectSha256(source.journalId, `${label}.final.journalId`);
  const intentSha256 = expectSha256(
    source.intentSha256,
    `${label}.final.intentSha256`,
  );
  const counts = expectObject(source.counts, `${label}.final.counts`);
  const actors = expectObject(counts.actors, `${label}.final.counts.actors`);
  for (const [actor, expected] of Object.entries(
    RAVIOLI_V3_JOURNAL_ACTOR_COUNTS,
  )) {
    if (
      expectSafeInteger(
        actors[actor],
        `${label}.final.counts.actors.${actor}`,
      ) !== expected
    ) {
      fail(`${label}.final actor counts must be creator/collector1/collector2 = 49/11/7`);
    }
  }
  const expectedCounts = {
    originations: RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT,
    calls: RAVIOLI_V3_JOURNAL_WRITE_COUNT - RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT,
    buys: 7,
    opens: 6,
    transfers: 2,
    refunds: 1,
    pins: RAVIOLI_V3_JOURNAL_PIN_COUNT,
  };
  for (const [name, expected] of Object.entries(expectedCounts)) {
    if (
      expectSafeInteger(counts[name], `${label}.final.counts.${name}`) !==
      expected
    ) {
      fail(`${label}.final ${name} count must be ${expected}`);
    }
  }
  const plan = expectObject(source.plan, `${label}.final.plan`);
  if (
    plan.mode !== "native-effective-intent" &&
    plan.mode !== "authenticated-post-event86-extension"
  ) {
    fail(`${label}.final plan mode is unsupported`);
  }
  return {
    journalId,
    intentSha256,
    counts: {
      actors: Object.fromEntries(
        Object.keys(RAVIOLI_V3_JOURNAL_ACTOR_COUNTS).map((actor) => [
          actor,
          actors[actor],
        ]),
      ),
      ...expectedCounts,
      events: expectSafeInteger(counts.events, `${label}.final.counts.events`, 1),
    },
    plan: {
      mode: plan.mode,
      baseIntentSha256: expectSha256(
        plan.baseIntentSha256,
        `${label}.final.plan.baseIntentSha256`,
      ),
      baseMatrixSha256: expectSha256(
        plan.baseMatrixSha256,
        `${label}.final.plan.baseMatrixSha256`,
      ),
      planExtensionRecordSha256:
        plan.planExtensionRecordSha256 === null
          ? null
          : expectSha256(
              plan.planExtensionRecordSha256,
              `${label}.final.plan.planExtensionRecordSha256`,
            ),
      effectiveMatrixSha256: expectSha256(
        plan.effectiveMatrixSha256,
        `${label}.final.plan.effectiveMatrixSha256`,
      ),
    },
  };
}

async function validateArtifact(appRoot, artifact, index, app) {
  const label = `${app}.artifacts[${index}]`;
  const source = expectObject(artifact, label);
  const id = expectSafeId(source.id, `${label}.id`);
  const kind = expectSafeId(source.kind, `${label}.kind`);
  const relativePath = normalizeRelativePath(source.path, `${label}.path`, "artifacts");
  const expectedDigest = expectSha256(source.sha256, `${label}.sha256`);
  const absolutePath = resolveInside(appRoot, relativePath, `${label}.path`);
  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    fail(`${label}.path cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (bytes.length === 0) fail(`${label}.path is empty: ${relativePath}`);
  validateNoSecretBytes(bytes, `${label}.path`, relativePath);
  const actualDigest = digestBytes(bytes);
  if (actualDigest !== expectedDigest) {
    fail(`${label}.sha256 does not match ${relativePath}: expected ${expectedDigest}, got ${actualDigest}`);
  }
  const historicalIndexerSnapshot = kind === "historical-indexer-snapshot"
    ? validateGnocchiHistoricalIndexerArtifact(bytes, label, app)
    : null;
  const ravioliLimitedEditionPolicy = kind === "limited-edition-policy-evidence"
    ? validateRavioliLimitedEditionPolicyArtifact(bytes, label)
    : null;
  const ravioliModeOutcome = kind === "mode-outcome-evidence"
    ? validateRavioliModeOutcomeArtifact(bytes, label)
    : null;
  const ravioliJournalIntent =
    app === "ravioli" && kind === "durable-journal-intent"
      ? validateRavioliJournalIntentArtifact(bytes, label)
      : null;
  const ravioliJournalEvent =
    app === "ravioli" && kind === "durable-journal-event"
      ? validateRavioliJournalEventArtifact(bytes, label)
      : null;
  const ravioliJournalFinal =
    app === "ravioli" && kind === "durable-journal-finalization"
      ? validateRavioliJournalFinalArtifact(bytes, label)
      : null;

  const hasAnyPinField = [source.ipfsUri, source.gatewayUrl, source.retrievedSha256].some(
    (value) => value !== undefined,
  );
  let pin = null;
  if (hasAnyPinField) {
    const parsedIpfs = validateIpfsUri(source.ipfsUri, `${label}.ipfsUri`);
    const gateway = validatePublicGatewayUrl(
      source.gatewayUrl,
      parsedIpfs.cid,
      `${label}.gatewayUrl`,
    );
    const retrievedSha256 = expectSha256(source.retrievedSha256, `${label}.retrievedSha256`);
    if (retrievedSha256 !== actualDigest) {
      fail(`${label}.retrievedSha256 does not match the packaged artifact digest`);
    }
    pin = {
      cid: parsedIpfs.cid,
      ipfsUri: parsedIpfs.uri,
      gatewayUrl: gateway.href,
      retrievedSha256,
    };
  }
  const normalized = {
    id,
    kind,
    path: relativePath,
    sha256: actualDigest,
    bytes: bytes.length,
    ...(pin || {}),
    ...(historicalIndexerSnapshot ? { historicalIndexerSnapshot } : {}),
    ...(ravioliLimitedEditionPolicy ? { ravioliLimitedEditionPolicy } : {}),
    ...(ravioliModeOutcome ? { ravioliModeOutcome } : {}),
    ...(ravioliJournalIntent ? { ravioliJournalIntent } : {}),
    ...(ravioliJournalEvent ? { ravioliJournalEvent } : {}),
    ...(ravioliJournalFinal ? { ravioliJournalFinal } : {}),
  };
  if (app === "ravioli" && kind === "durable-journal-pin-bytes") {
    Object.defineProperty(normalized, "_ravioliJournalPinBytes", {
      value: bytes,
      enumerable: false,
    });
  }
  return normalized;
}

function requirePinnedArtifact(artifact, label) {
  if (!artifact?.ipfsUri || !artifact?.gatewayUrl || !artifact?.retrievedSha256) {
    fail(`${label} must include ipfsUri, HTTPS gatewayUrl, and retrievedSha256`);
  }
}

function validateContract(contract, index, app) {
  const label = `${app}.contracts[${index}]`;
  const source = expectObject(contract, label);
  const address = validateContractAddress(source.address, `${label}.address`);
  return {
    address,
    kind: expectSafeId(source.kind, `${label}.kind`),
    explorerUrl: validateTzktUrl(source.explorerUrl, address, `${label}.explorerUrl`),
  };
}

function validateOperationRecord(operation, index, app) {
  const label = `${app}.operations[${index}]`;
  const source = expectObject(operation, label);
  const kind = expectSafeId(source.kind, `${label}.kind`);
  const hash = validateOperationHash(source.hash, `${label}.hash`);
  const contractAddress = validateContractAddress(source.contractAddress, `${label}.contractAddress`);
  if (source.status !== "applied") fail(`${label}.status must be applied`);
  const entrypoint =
    kind === "origination"
      ? source.entrypoint === undefined
        ? null
        : expectSafeId(source.entrypoint, `${label}.entrypoint`)
      : expectSafeId(source.entrypoint, `${label}.entrypoint`);
  return {
    kind,
    hash,
    contractAddress,
    entrypoint,
    status: "applied",
    explorerUrl: validateTzktUrl(source.explorerUrl, hash, `${label}.explorerUrl`),
  };
}

function validateTokenRecord(token, index, app, artifactsById) {
  const label = `${app}.tokens[${index}]`;
  const source = expectObject(token, label);
  const id = expectSafeId(source.id, `${label}.id`);
  const contractAddress = validateContractAddress(source.contractAddress, `${label}.contractAddress`);
  const tokenId = expectString(source.tokenId, `${label}.tokenId`);
  if (!TOKEN_ID.test(tokenId)) fail(`${label}.tokenId must be a canonical non-negative integer`);
  const metadataArtifactId = expectSafeId(source.metadataArtifactId, `${label}.metadataArtifactId`);
  const mediaArtifactId = expectSafeId(source.mediaArtifactId, `${label}.mediaArtifactId`);
  const metadataArtifact = artifactsById.get(metadataArtifactId);
  const mediaArtifact = artifactsById.get(mediaArtifactId);
  if (!metadataArtifact) fail(`${label}.metadataArtifactId does not exist: ${metadataArtifactId}`);
  if (!mediaArtifact) fail(`${label}.mediaArtifactId does not exist: ${mediaArtifactId}`);
  requirePinnedArtifact(metadataArtifact, `${label} metadata artifact`);
  requirePinnedArtifact(mediaArtifact, `${label} media artifact`);
  const metadataUri = validateIpfsUri(source.metadataUri, `${label}.metadataUri`).uri;
  const artifactUri = validateIpfsUri(source.artifactUri, `${label}.artifactUri`).uri;
  if (metadataUri !== metadataArtifact.ipfsUri) {
    fail(`${label}.metadataUri does not match artifact ${metadataArtifactId}`);
  }
  if (artifactUri !== mediaArtifact.ipfsUri) {
    fail(`${label}.artifactUri does not match artifact ${mediaArtifactId}`);
  }
  const explorerUrl = validateTzktUrl(source.explorerUrl, contractAddress, `${label}.explorerUrl`);
  const tokenPathSegments = decodeURIComponent(new URL(explorerUrl).pathname).split("/").filter(Boolean);
  const tokensIndex = tokenPathSegments.indexOf("tokens");
  if (tokensIndex < 0 || tokenPathSegments[tokensIndex + 1] !== tokenId) {
    fail(`${label}.explorerUrl does not identify token ${tokenId}`);
  }
  let historicalState = null;
  const hasHistoricalField = [
    source.historicalStateArtifactId,
    source.proofLevel,
    source.proofTotalSupply,
    source.proofHoldersCount,
  ].some((value) => value !== undefined);
  if (app === "gnocchi") {
    const historicalStateArtifactId = expectSafeId(
      source.historicalStateArtifactId,
      `${label}.historicalStateArtifactId`,
    );
    const historicalArtifact = artifactsById.get(historicalStateArtifactId);
    if (!historicalArtifact) {
      fail(`${label}.historicalStateArtifactId does not exist: ${historicalStateArtifactId}`);
    }
    if (historicalArtifact.kind !== "historical-indexer-snapshot") {
      fail(`${label}.historicalStateArtifactId must reference a historical-indexer-snapshot`);
    }
    requirePinnedArtifact(historicalArtifact, `${label} historical state artifact`);
    const proofLevel = expectSafeInteger(source.proofLevel, `${label}.proofLevel`, 1);
    const proofTotalSupply = expectCanonicalNat(
      source.proofTotalSupply,
      `${label}.proofTotalSupply`,
    );
    const proofHoldersCount = expectSafeInteger(
      source.proofHoldersCount,
      `${label}.proofHoldersCount`,
      0,
    );
    const snapshot = historicalArtifact.historicalIndexerSnapshot?.tokens.find(
      (entry) => entry.tokenId === tokenId,
    );
    if (!snapshot) fail(`${label} is absent from its historical snapshot artifact`);
    if (historicalArtifact.historicalIndexerSnapshot.proofLevel !== proofLevel) {
      fail(`${label}.proofLevel does not match its historical snapshot`);
    }
    if (snapshot.proofState.totalSupply !== proofTotalSupply) {
      fail(`${label}.proofTotalSupply does not match its historical snapshot`);
    }
    if (snapshot.proofState.holdersCount !== proofHoldersCount) {
      fail(`${label}.proofHoldersCount does not match its historical snapshot`);
    }
    historicalState = {
      historicalStateArtifactId,
      proofLevel,
      proofTotalSupply,
      proofHoldersCount,
    };
  } else if (hasHistoricalField) {
    fail(`${label} historical proof-time fields are only supported for gnocchi`);
  }
  return {
    id,
    contractAddress,
    tokenId,
    explorerUrl,
    metadataArtifactId,
    mediaArtifactId,
    metadataUri,
    artifactUri,
    ...(historicalState || {}),
  };
}

function validateRoleEvidenceEntry(entry, index, app) {
  const label = `${app}.roleEvidence[${index}]`;
  const source = expectObject(entry, label);
  const kind = expectSafeId(source.kind, `${label}.kind`);
  const normalized = { kind };
  if (source.artifactId !== undefined) {
    normalized.artifactId = expectSafeId(source.artifactId, `${label}.artifactId`);
  }
  if (source.contractAddress !== undefined) {
    normalized.contractAddress = validateContractAddress(source.contractAddress, `${label}.contractAddress`);
  }
  if (source.operationHash !== undefined) {
    normalized.operationHash = validateOperationHash(source.operationHash, `${label}.operationHash`);
  }
  if (source.targetApp !== undefined) {
    normalized.targetApp = expectString(source.targetApp, `${label}.targetApp`);
    if (!APP_ORDER.includes(normalized.targetApp)) fail(`${label}.targetApp is not a Pasta app`);
  }
  normalized.url = validateHttpUrl(source.url, `${label}.url`).href;
  return normalized;
}

function validateCapability(capability, index, app, evidence) {
  const label = `${app}.capabilities[${index}]`;
  const source = expectObject(capability, label);
  const id = expectSafeId(source.id, `${label}.id`);
  const description = expectString(source.description, `${label}.description`);
  const references = expectObject(source.evidence, `${label}.evidence`);
  const screenshots = expectArray(references.screenshots, `${label}.evidence.screenshots`).map(
    (entry, itemIndex) => expectSafeId(entry, `${label}.evidence.screenshots[${itemIndex}]`),
  );
  if (screenshots.length === 0) fail(`${label} must reference at least one screenshot stage`);

  const referenceGroups = {
    artifacts: evidence.artifacts,
    contracts: evidence.contracts,
    operations: evidence.operations,
    roleEvidence: evidence.roleEvidence,
    tokens: evidence.tokens,
  };
  const normalizedEvidence = { screenshots };
  let referencedEvidenceCount = 0;
  for (const [group, known] of Object.entries(referenceGroups)) {
    const values = expectArray(references[group] ?? [], `${label}.evidence.${group}`).map(
      (entry, itemIndex) => expectString(entry, `${label}.evidence.${group}[${itemIndex}]`),
    );
    for (const value of values) {
      if (!known.has(value)) fail(`${label}.evidence.${group} references unknown evidence: ${value}`);
    }
    normalizedEvidence[group] = values;
    referencedEvidenceCount += values.length;
  }
  normalizedEvidence.urls = expectArray(references.urls ?? [], `${label}.evidence.urls`).map(
    (entry, itemIndex) => validateHttpUrl(entry, `${label}.evidence.urls[${itemIndex}]`).href,
  );
  referencedEvidenceCount += normalizedEvidence.urls.length;
  if (referencedEvidenceCount === 0) {
    fail(`${label} must reference artifacts, contracts, operations, tokens, role evidence, or URLs`);
  }
  return { id, description, evidence: normalizedEvidence };
}

function classifyRavioliJournalPin(fileName) {
  if (/^ravioli-wrapper-[0-5]\.(?:png|gif|zip)$/.test(fileName)) {
    return "wrapperMedia";
  }
  if (fileName === "token.json") return "tokenMetadata";
  if (fileName === "ravioli-pack-manifest.json") return "packManifest";
  if (fileName === "ravioli-public-reveal-0.json") return "publicReveal";
  if (/^ravioli-sealed-reveal-[1-5]\.json$/.test(fileName)) {
    return "sealedReveal";
  }
  if (/^ravioli-generated-token(?:-.+)?\.json$/.test(fileName)) {
    return "generatedMetadata";
  }
  if (
    /^ravioli-generated-(?!token-).+\.(?:png|gif|zip)$/.test(fileName) ||
    /^ravioli-[0-5]-\d+-\d+\.(?:png|gif|zip)$/.test(fileName)
  ) {
    return "generatedMedia";
  }
  if (
    fileName === "collection.json" ||
    /^pasta-.+-contract\.json$/.test(fileName)
  ) {
    return "contractMetadata";
  }
  return null;
}

function validateRavioliRevealPin(bytes, category, fileName, label) {
  const source = parseRavioliJournalJson(bytes, `${label}.pin`);
  if (category === "publicReveal") {
    if (
      source.schema !== "pasta-ravioli-public-reveal@1" ||
      expectSafeInteger(source.tokenId, `${label}.pin.tokenId`) !== 0
    ) {
      fail(`${label} must be the exact token-0 public reveal`);
    }
    return;
  }
  const tokenMatch = fileName.match(/^ravioli-sealed-reveal-([1-5])\.json$/);
  const tokenId = Number(tokenMatch?.[1]);
  const aad = expectObject(source.aad, `${label}.pin.aad`);
  if (
    source.schema !== "pasta-ravioli-sealed-reveal@1" ||
    source.cipher !== "AES-256-GCM" ||
    source.keyDerivation !==
      "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)" ||
    aad.schema !== "pasta-ravioli-sealed-reveal@1" ||
    expectSafeInteger(aad.tokenId, `${label}.pin.aad.tokenId`) !== tokenId
  ) {
    fail(`${label} must be the exact token-${tokenId} sealed reveal envelope`);
  }
  expectString(source.iv, `${label}.pin.iv`);
  expectString(source.ciphertext, `${label}.pin.ciphertext`);
}

function validateRavioliJournalEvidence(artifacts) {
  const intents = artifacts.filter((artifact) => artifact.ravioliJournalIntent);
  const finals = artifacts.filter((artifact) => artifact.ravioliJournalFinal);
  if (intents.length !== 1 || finals.length !== 1) {
    fail("ravioli must package exactly one durable journal intent and finalization");
  }
  const intentArtifact = intents[0];
  const finalArtifact = finals[0];
  const intent = intentArtifact.ravioliJournalIntent;
  const final = finalArtifact.ravioliJournalFinal;
  if (
    final.journalId !== intent.journalId ||
    final.intentSha256 !== intentArtifact.sha256 ||
    final.plan.baseIntentSha256 !== intentArtifact.sha256 ||
    final.plan.baseMatrixSha256 !== intent.matrixSha256
  ) {
    fail("ravioli durable journal finalization does not bind its immutable intent");
  }

  const journalEvents = artifacts
    .filter((artifact) => artifact.ravioliJournalEvent)
    .map((artifact) => ({
      artifact,
      event: artifact.ravioliJournalEvent,
    }));
  if (journalEvents.some(({ event }) => event.journalId !== intent.journalId)) {
    fail("ravioli durable journal contains an event from another journal");
  }
  const planExtensions = journalEvents.filter(
    ({ event }) => event.phase === "PLAN_EXTENSION",
  );
  if (intent.schema === RAVIOLI_JOURNAL_INTENT_SCHEMA) {
    if (
      intent.operationCount !== RAVIOLI_BASE_OPERATION_COUNT ||
      planExtensions.length !== 1 ||
      final.plan.mode !== "authenticated-post-event86-extension"
    ) {
      fail("ravioli legacy intent requires immutable base66 plus authenticated event87");
    }
    const extensionArtifact = planExtensions[0].artifact;
    const extension = planExtensions[0].event.extension;
    if (
      extension.baseIntentSha256 !== intentArtifact.sha256 ||
      extension.baseMatrixSha256 !== intent.matrixSha256 ||
      extension.effectiveMatrixSha256 !== final.plan.effectiveMatrixSha256 ||
      final.plan.planExtensionRecordSha256 !== extensionArtifact.sha256
    ) {
      fail("ravioli event87 extension provenance does not bind base66 to the effective plan");
    }
  } else if (
    intent.operationCount !== RAVIOLI_V3_JOURNAL_WRITE_COUNT ||
    planExtensions.length !== 0 ||
    final.plan.mode !== "native-effective-intent" ||
    final.plan.planExtensionRecordSha256 !== null ||
    final.plan.effectiveMatrixSha256 !== intent.matrixSha256
  ) {
    fail("ravioli native effective intent provenance drifted");
  }

  const pinEvents = journalEvents
    .filter(({ event }) => event.phase === "PIN")
    .sort((left, right) => left.event.pin.pinSequence - right.event.pin.pinSequence);
  if (pinEvents.length !== RAVIOLI_V3_JOURNAL_PIN_COUNT) {
    fail(`ravioli durable journal must contain exactly ${RAVIOLI_V3_JOURNAL_PIN_COUNT} PIN events`);
  }
  const pinArtifacts = artifacts.filter(
    (artifact) => artifact.kind === "durable-journal-pin-bytes",
  );
  if (pinArtifacts.length !== RAVIOLI_V3_JOURNAL_PIN_COUNT) {
    fail(`ravioli durable journal must package exactly ${RAVIOLI_V3_JOURNAL_PIN_COUNT} pin-byte artifacts`);
  }
  const pinArtifactsByPath = new Map(
    pinArtifacts.map((artifact) => [
      artifact.path.replace(/^artifacts\/journal\//, ""),
      artifact,
    ]),
  );
  const categories = {
    wrapperMedia: [],
    tokenMetadata: [],
    packManifest: [],
    publicReveal: [],
    sealedReveal: [],
    generatedMedia: [],
    generatedMetadata: [],
    contractMetadata: [],
  };
  for (const [index, { event }] of pinEvents.entries()) {
    const expectedSequence = index + 1;
    if (event.pin.pinSequence !== expectedSequence) {
      fail("ravioli durable journal PIN sequence is not contiguous from 1 through 34");
    }
    const pinArtifact = pinArtifactsByPath.get(event.pin.path);
    if (
      !pinArtifact ||
      pinArtifact.sha256 !== event.pin.sha256 ||
      pinArtifact.bytes !== event.pin.byteLength
    ) {
      fail(`ravioli PIN ${expectedSequence} does not bind its packaged exact bytes`);
    }
    const category = classifyRavioliJournalPin(event.pin.fileName);
    if (!category) {
      fail(`ravioli PIN ${expectedSequence} has an unsupported proof filename: ${event.pin.fileName}`);
    }
    categories[category].push(event.pin.fileName);
    if (category === "publicReveal" || category === "sealedReveal") {
      validateRavioliRevealPin(
        pinArtifact._ravioliJournalPinBytes,
        category,
        event.pin.fileName,
        `ravioli PIN ${expectedSequence}`,
      );
    }
  }
  const expectedCategoryCounts = {
    wrapperMedia: 6,
    tokenMetadata: 6,
    packManifest: 6,
    publicReveal: 1,
    sealedReveal: 5,
    generatedMedia: 3,
    generatedMetadata: 3,
    contractMetadata: 4,
  };
  for (const [category, expected] of Object.entries(expectedCategoryCounts)) {
    if (categories[category].length !== expected) {
      fail(`ravioli ${category} PIN-call count must be ${expected}`);
    }
  }
  if (
    JSON.stringify(
      categories.wrapperMedia
        .map((fileName) => Number(fileName.match(/^ravioli-wrapper-([0-5])\./)?.[1]))
        .sort((left, right) => left - right),
    ) !== JSON.stringify([0, 1, 2, 3, 4, 5]) ||
    JSON.stringify([...new Set(categories.sealedReveal)].sort()) !==
      JSON.stringify(
        Array.from(
          { length: 5 },
          (_, index) => `ravioli-sealed-reveal-${index + 1}.json`,
        ),
      )
  ) {
    fail("ravioli reveal/media PIN inventory does not cover wrapper 0-5 and sealed tokens 1-5");
  }
  return {
    planMode: final.plan.mode,
    actors: final.counts.actors,
    pinCount: pinEvents.length,
    pinBreakdown: Object.fromEntries(
      Object.entries(categories).map(([category, names]) => [
        category,
        names.length,
      ]),
    ),
  };
}

async function walkRegularFiles(root) {
  const results = [];
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      validateEvidenceFilename(relativePath, "evidence file");
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`proof evidence must not contain symlinks: ${relativePath}`);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        results.push({ relativePath, absolutePath });
      } else {
        fail(`proof evidence contains a non-regular file: ${relativePath}`);
      }
    }
  }
  await visit(root);
  return results;
}

export async function validateAppManifest(runRoot, app) {
  const appRoot = path.join(runRoot, app);
  const manifestPath = path.join(appRoot, "manifest.json");
  let manifestBytes;
  try {
    manifestBytes = await readFile(manifestPath);
  } catch (error) {
    fail(`${app}/manifest.json is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    fail(`${app}/manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  expectObject(manifest, `${app} manifest`);
  validateNoSecrets(manifest, `${app} manifest`);
  if (manifest.schema !== APP_PROOF_SCHEMA) {
    fail(`${app}.schema must be ${APP_PROOF_SCHEMA}`);
  }
  if (manifest.app !== app) fail(`${app}.app must be ${app}`);
  const rules = APP_RULES[app];
  if (manifest.role !== rules.role) fail(`${app}.role must be ${rules.role}`);
  const runId = expectSafeId(manifest.runId, `${app}.runId`);
  const capturedAt = expectString(manifest.capturedAt, `${app}.capturedAt`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(capturedAt) || Number.isNaN(Date.parse(capturedAt))) {
    fail(`${app}.capturedAt must be a valid UTC ISO-8601 timestamp`);
  }
  const network = expectObject(manifest.network, `${app}.network`);
  if (network.name !== "shadownet") fail(`${app}.network.name must be shadownet`);
  if (network.chainId !== SHADOWNET_CHAIN_ID) {
    fail(`${app}.network.chainId must be ${SHADOWNET_CHAIN_ID}`);
  }
  const rpcUrl = validateHttpUrl(network.rpcUrl, `${app}.network.rpcUrl`, { requireHttps: true }).href;

  const screenshotSources = expectArray(manifest.screenshots, `${app}.screenshots`);
  if (screenshotSources.length < rules.minScreenshots) {
    fail(`${app} requires at least ${rules.minScreenshots} stage screenshots`);
  }
  const screenshots = [];
  for (let index = 0; index < screenshotSources.length; index += 1) {
    screenshots.push(await validateScreenshot(appRoot, screenshotSources[index], index, app));
  }
  const screenshotStages = new Set(screenshots.map((entry) => entry.stage));
  if (screenshotStages.size !== screenshots.length) fail(`${app}.screenshots stages must be unique`);
  const screenshotStageByDigest = new Map();
  for (const screenshot of screenshots) {
    const previousStage = screenshotStageByDigest.get(screenshot.sha256);
    if (previousStage) {
      fail(
        `${app}.screenshots must use distinct screenshot bytes for distinct stages; ` +
          `${previousStage} and ${screenshot.stage} share the same SHA-256 ${screenshot.sha256}`,
      );
    }
    screenshotStageByDigest.set(screenshot.sha256, screenshot.stage);
  }

  const artifactSources = expectArray(manifest.artifacts, `${app}.artifacts`);
  if (artifactSources.length === 0) fail(`${app}.artifacts must not be empty`);
  const artifacts = [];
  for (let index = 0; index < artifactSources.length; index += 1) {
    artifacts.push(await validateArtifact(appRoot, artifactSources[index], index, app));
  }
  const artifactsById = new Map(artifacts.map((entry) => [entry.id, entry]));
  if (artifactsById.size !== artifacts.length) fail(`${app}.artifacts ids must be unique`);

  const contracts = expectArray(manifest.contracts, `${app}.contracts`).map((entry, index) =>
    validateContract(entry, index, app),
  );
  const contractsByAddress = new Map(contracts.map((entry) => [entry.address, entry]));
  if (contractsByAddress.size !== contracts.length) fail(`${app}.contracts addresses must be unique`);

  const operations = expectArray(manifest.operations, `${app}.operations`).map((entry, index) =>
    validateOperationRecord(entry, index, app),
  );
  const operationsByHash = new Map(operations.map((entry) => [entry.hash, entry]));
  if (operationsByHash.size !== operations.length) fail(`${app}.operations hashes must be unique`);

  const tokens = expectArray(manifest.tokens, `${app}.tokens`).map((entry, index) =>
    validateTokenRecord(entry, index, app, artifactsById),
  );
  const tokensById = new Map(tokens.map((entry) => [entry.id, entry]));
  if (tokensById.size !== tokens.length) fail(`${app}.tokens ids must be unique`);
  if (new Set(tokens.map((entry) => `${entry.contractAddress}:${entry.tokenId}`)).size !== tokens.length) {
    fail(`${app}.tokens contract/token identifiers must be unique`);
  }

  const roleEvidence = expectArray(manifest.roleEvidence, `${app}.roleEvidence`).map((entry, index) =>
    validateRoleEvidenceEntry(entry, index, app),
  );
  const roleEvidenceKinds = new Set(roleEvidence.map((entry) => entry.kind));
  if (roleEvidenceKinds.size !== roleEvidence.length) fail(`${app}.roleEvidence kinds must be unique`);

  if (app === "ch-ease") {
    if (contracts.length || operations.length || tokens.length) {
      fail("ch-ease is an offline preparation app and must not claim contracts, operations, or tokens");
    }
    const preparedPackage = artifacts.find((entry) => entry.kind === "prepared-package");
    if (!preparedPackage) fail("ch-ease requires a prepared-package artifact");
    const packageExport = roleEvidence.find((entry) => entry.kind === "package-export");
    const handoff = roleEvidence.find((entry) => entry.kind === "publisher-handoff");
    if (!packageExport || packageExport.artifactId !== preparedPackage.id) {
      fail("ch-ease requires package-export role evidence linked to its prepared-package artifact");
    }
    if (!handoff?.targetApp || APP_RULES[handoff.targetApp]?.role !== "token-publisher") {
      fail("ch-ease requires publisher-handoff role evidence targeting a token publisher");
    }
  } else if (rules.role === "token-publisher") {
    if (contracts.length === 0) fail(`${app} requires at least one originated contract`);
    if (tokens.length === 0) fail(`${app} requires at least one token record`);
    if (roleEvidence.length !== 0) fail(`${app} uses token evidence, not roleEvidence`);
    for (const contract of contracts) {
      if (!operations.some((entry) => entry.kind === "origination" && entry.contractAddress === contract.address)) {
        fail(`${app} contract ${contract.address} has no matching origination operation`);
      }
    }
    for (const operation of operations) {
      if (!contractsByAddress.has(operation.contractAddress)) {
        fail(`${app} operation ${operation.hash} references an unlisted contract`);
      }
    }
    for (const token of tokens) {
      if (!contractsByAddress.has(token.contractAddress)) {
        fail(`${app} token ${token.id} references an unlisted contract`);
      }
    }
    if (app === "gnocchi") {
      const historicalArtifacts = artifacts.filter(
        (entry) => entry.kind === "historical-indexer-snapshot",
      );
      if (historicalArtifacts.length !== 1) {
        fail("gnocchi requires exactly one pinned historical-indexer-snapshot artifact");
      }
      const historicalArtifact = historicalArtifacts[0];
      requirePinnedArtifact(historicalArtifact, "gnocchi historical indexer snapshot");
      const snapshot = historicalArtifact.historicalIndexerSnapshot;
      if (!contractsByAddress.has(snapshot.contractAddress)) {
        fail("gnocchi historical snapshot references an unlisted contract");
      }
      if (
        snapshot.sourceManifest.runId !== runId ||
        snapshot.sourceManifest.capturedAt !== capturedAt
      ) {
        fail("gnocchi historical snapshot source manifest identity does not match the app manifest");
      }
      if (snapshot.acceptedOperations.length !== operations.length) {
        fail("gnocchi historical snapshot must bind every accepted manifest operation");
      }
      for (const operation of operations) {
        const historicalOperation = snapshot.acceptedOperations.find(
          (entry) => entry.hash === operation.hash,
        );
        if (
          !historicalOperation ||
          historicalOperation.kind !== operation.kind ||
          historicalOperation.contractAddress !== operation.contractAddress ||
          historicalOperation.entrypoint !== operation.entrypoint ||
          historicalOperation.status !== operation.status
        ) {
          fail(`gnocchi historical snapshot does not bind operation ${operation.hash} exactly`);
        }
      }
      if (!operationsByHash.has(snapshot.terminalOperationHash)) {
        fail("gnocchi historical snapshot terminal operation is absent from the manifest");
      }
      const snapshotTokenIds = new Set(snapshot.tokens.map((entry) => entry.tokenId));
      if (
        snapshotTokenIds.size !== tokens.length ||
        tokens.some((token) => !snapshotTokenIds.has(token.tokenId))
      ) {
        fail("gnocchi historical snapshot token set does not match the manifest");
      }
      if (tokens.some((token) => token.historicalStateArtifactId !== historicalArtifact.id)) {
        fail("every gnocchi token must reference the one historical snapshot artifact");
      }
    }
  } else if (app === "lasagna") {
    if (contracts.length === 0) fail("lasagna requires an exhibition registry contract");
    if (tokens.length !== 0) fail("lasagna is a non-FA2 registry and must not claim token issuance");
    for (const contract of contracts) {
      if (!operations.some((entry) => entry.kind === "origination" && entry.contractAddress === contract.address)) {
        fail(`lasagna contract ${contract.address} has no matching origination operation`);
      }
    }
    for (const operation of operations) {
      if (!contractsByAddress.has(operation.contractAddress)) {
        fail(`lasagna operation ${operation.hash} references an unlisted contract`);
      }
    }
    const publication = roleEvidence.find((entry) => entry.kind === "exhibition-publication");
    if (!publication?.artifactId || !publication.contractAddress || !publication.operationHash) {
      fail("lasagna requires complete exhibition-publication role evidence");
    }
    const exhibitionArtifact = artifactsById.get(publication.artifactId);
    if (!exhibitionArtifact || exhibitionArtifact.kind !== "exhibition-metadata") {
      fail("lasagna exhibition-publication must reference an exhibition-metadata artifact");
    }
    requirePinnedArtifact(exhibitionArtifact, "lasagna exhibition metadata");
    if (!contractsByAddress.has(publication.contractAddress)) {
      fail("lasagna exhibition-publication references an unlisted contract");
    }
    const publicationOperation = operationsByHash.get(publication.operationHash);
    if (!publicationOperation || publicationOperation.contractAddress !== publication.contractAddress) {
      fail("lasagna exhibition-publication references an unlisted operation");
    }
  } else if (app === "colander") {
    if (contracts.length !== 0 || tokens.length !== 0) {
      fail("colander manages existing contracts and must not claim originated contracts or tokens");
    }
    const discovery = roleEvidence.find((entry) => entry.kind === "contract-discovery");
    const management = roleEvidence.find((entry) => entry.kind === "management-action");
    if (!discovery?.contractAddress) fail("colander requires contract-discovery role evidence");
    if (!management?.contractAddress || !management.operationHash || !management.artifactId) {
      fail("colander requires complete management-action role evidence");
    }
    const receipt = artifactsById.get(management.artifactId);
    if (!receipt || receipt.kind !== "management-receipt") {
      fail("colander management-action must reference a management-receipt artifact");
    }
    const operation = operationsByHash.get(management.operationHash);
    if (!operation || operation.contractAddress !== management.contractAddress) {
      fail("colander management-action does not match its applied operation record");
    }
  }

  for (const requiredKind of rules.requiredOperationKinds) {
    if (!operations.some((entry) => entry.kind === requiredKind)) {
      fail(`${app} requires an applied ${requiredKind} operation record`);
    }
  }

  const capabilitySources = expectArray(manifest.capabilities, `${app}.capabilities`);
  if (capabilitySources.length === 0) fail(`${app}.capabilities must not be empty`);
  const capabilityEvidence = {
    artifacts: new Set(artifacts.map((entry) => entry.id)),
    contracts: new Set(contracts.map((entry) => entry.address)),
    operations: new Set(operations.map((entry) => entry.hash)),
    roleEvidence: roleEvidenceKinds,
    tokens: new Set(tokens.map((entry) => entry.id)),
  };
  const capabilities = capabilitySources.map((entry, index) =>
    validateCapability(entry, index, app, capabilityEvidence),
  );
  if (new Set(capabilities.map((entry) => entry.id)).size !== capabilities.length) {
    fail(`${app}.capabilities ids must be unique`);
  }

  if (app === "ravioli") {
    if (
      operations.length !==
        RAVIOLI_V3_JOURNAL_WRITE_COUNT +
          RAVIOLI_V3_DEPENDENCY_ORIGINATION_COUNT
    ) {
      fail(
        "ravioli operation graph differs from its semantic v3 journal plan plus exact dependency originations",
      );
    }
    const journalEvidence = validateRavioliJournalEvidence(artifacts);
    if (
      JSON.stringify(journalEvidence.actors) !==
      JSON.stringify(RAVIOLI_V3_JOURNAL_ACTOR_COUNTS)
    ) {
      fail("ravioli durable journal actor partition drifted");
    }
    for (const requiredId of RAVIOLI_REQUIRED_CAPABILITY_IDS) {
      if (!capabilities.some((entry) => entry.id === requiredId)) {
        fail(`ravioli requires capability ${requiredId}`);
      }
    }
    const router = contracts.find(
      (contract) => contract.kind === "atomic-pack-router",
    );
    if (!router) {
      fail("ravioli must identify its atomic-pack router");
    }
    const modeOutcomeOperationSets = [];
    for (const [tokenId, modeId] of RAVIOLI_REQUIRED_CAPABILITY_IDS.slice(0, 5).entries()) {
      const modeCapability = capabilities.find((entry) => entry.id === modeId);
      const wrapperToken = tokens.find(
        (token) =>
          token.contractAddress === router.address &&
          token.tokenId === String(tokenId),
      );
      if (!wrapperToken || !modeCapability.evidence.tokens.includes(wrapperToken.id)) {
        fail(`${modeId} must reference Ravioli wrapper token ${tokenId}`);
      }
      if (modeCapability.evidence.operations.length === 0) {
        fail(`${modeId} must reference its exact operation partition`);
      }
      const outcomeArtifacts = modeCapability.evidence.artifacts
        .map((artifactId) => artifactsById.get(artifactId))
        .filter((artifact) => artifact?.kind === "mode-outcome-evidence");
      if (outcomeArtifacts.length !== 1) {
        fail(`${modeId} must reference exactly one mode-outcome-evidence artifact`);
      }
      const outcome = outcomeArtifacts[0].ravioliModeOutcome;
      if (!outcome || outcome.tokenId !== tokenId) fail(`${modeId} mode-outcome evidence token drift`);
      if (JSON.stringify([...outcome.operationHashes].sort()) !== JSON.stringify([...modeCapability.evidence.operations].sort())) {
        fail(`${modeId} operation references differ from its exact mode-outcome partition`);
      }
      modeOutcomeOperationSets.push(outcome.operationHashes);
      if (tokenId >= 3) {
        const generatedKinds = new Set(modeCapability.evidence.artifacts.map((artifactId) => artifactsById.get(artifactId)?.kind));
        if (!generatedKinds.has("generated-token-media") || !generatedKinds.has("generated-token-metadata")) {
          fail(`${modeId} must reference its generated media and metadata pins`);
        }
      }
    }
    const productOperationHashes = modeOutcomeOperationSets.flat();
    const productOperationSet = new Set(productOperationHashes);
    if (productOperationHashes.length !== productOperationSet.size) {
      fail("ravioli mode-outcome operation partitions must be non-overlapping");
    }
    const journalCapability = capabilities.find((entry) => entry.id === "durable-signer-journal-ui-live-proof");
    if (!journalCapability) {
      fail("ravioli durable signer journal capability is missing");
    }
    const journalOperationHashes = journalCapability.evidence.operations;
    const journalOperationSet = new Set(journalOperationHashes);
    if (
      journalOperationHashes.length !== RAVIOLI_V3_JOURNAL_WRITE_COUNT ||
      journalOperationSet.size !== RAVIOLI_V3_JOURNAL_WRITE_COUNT
    ) {
      fail("ravioli durable journal capability must cover the exact semantic v3 write plan");
    }
    if (productOperationHashes.some((hash) => !journalOperationSet.has(hash))) {
      fail("ravioli mode-outcome operation partition escapes the durable journal");
    }
    const withheldCapability = capabilities.find(
      (entry) =>
        entry.id === "withheld-reveal-refund-closure-ui-live-proof",
    );
    const withheldWrapper = tokens.find(
      (token) =>
        token.contractAddress === router.address && token.tokenId === "5",
    );
    if (
      !withheldWrapper ||
      !withheldCapability.evidence.tokens.includes(withheldWrapper.id)
    ) {
      fail("withheld-reveal-refund-closure-ui-live-proof must reference Ravioli wrapper token 5");
    }
    const withheldOperationHashes = withheldCapability.evidence.operations;
    const withheldOperationSet = new Set(withheldOperationHashes);
    if (
      withheldOperationHashes.length !== 12 ||
      withheldOperationSet.size !== 12 ||
      withheldOperationHashes.some((hash) => !journalOperationSet.has(hash))
    ) {
      fail("ravioli withheld-reveal-refund closure must cover its exact 12-write partition");
    }
    if (
      [...withheldOperationSet].some((hash) => productOperationSet.has(hash))
    ) {
      fail("ravioli withheld-reveal-refund partition overlaps a green product");
    }
    const withheldRecoveryOperations = operations.filter(
      (operation) =>
        withheldOperationSet.has(operation.hash) &&
        operation.entrypoint === "recover_adapter",
    );
    if (withheldRecoveryOperations.length !== 1) {
      fail("ravioli withheld-reveal-refund closure must include exactly one recover_adapter write");
    }
    const withheldArtifacts = withheldCapability.evidence.artifacts
      .map((artifactId) => artifactsById.get(artifactId))
      .filter(
        (artifact) => artifact?.kind === "withheld-reveal-refund-evidence",
      );
    if (withheldArtifacts.length !== 1) {
      fail("ravioli withheld-reveal-refund closure must reference its red-path evidence");
    }
    if (
      new Set([...productOperationHashes, ...withheldOperationHashes]).size !==
      65
    ) {
      fail("ravioli green and red product partitions must cover all 65 non-infrastructure writes");
    }
    const dependencyOperations = operations.filter((entry) => !journalOperationSet.has(entry.hash));
    if (
      dependencyOperations.length !== RAVIOLI_V3_DEPENDENCY_ORIGINATION_COUNT ||
      dependencyOperations.some((entry) => entry.kind !== "origination")
    ) {
      fail("ravioli manifest must add the exact dependency originations outside its semantic journal");
    }
    const journalOperations = operations.filter((entry) => journalOperationSet.has(entry.hash));
    const journalOriginations = journalOperations.filter(
      (entry) => entry.kind === "origination",
    );
    if (journalOriginations.length !== RAVIOLI_V3_JOURNAL_ORIGINATION_COUNT) {
      fail("ravioli journal origination count differs from the semantic v3 plan");
    }
    const actualEntrypointCounts = Object.fromEntries(
      Object.keys(RAVIOLI_V3_JOURNAL_ENTRYPOINT_COUNTS).map((entrypoint) => [
        entrypoint,
        journalOperations.filter((entry) => entry.entrypoint === entrypoint)
          .length,
      ]),
    );
    if (
      JSON.stringify(actualEntrypointCounts) !==
      JSON.stringify(RAVIOLI_V3_JOURNAL_ENTRYPOINT_COUNTS)
    ) {
      fail("ravioli journal entrypoint counts differ from the semantic v3 plan");
    }
    const recognizedJournalCalls = Object.values(actualEntrypointCounts).reduce(
      (total, count) => total + count,
      0,
    );
    if (
      recognizedJournalCalls + journalOriginations.length !==
      journalOperations.length
    ) {
      fail("ravioli journal contains an operation outside the semantic v3 plan");
    }
    const requiredContractKinds = new Set([
      "gnocchi-dependency",
      "rotini-dependency",
      "blind-pack-controller",
      "atomic-pack-router",
      "allocation-helper",
      "generative-helper",
    ]);
    if (
      contracts.length !== requiredContractKinds.size ||
      contracts.some((entry) => !requiredContractKinds.has(entry.kind))
    ) {
      fail("ravioli must bind exactly its two dependencies, controller, router, and two helpers");
    }
    const generatedTokens = tokens
      .filter(
        (token) =>
          token.contractAddress !== router.address &&
          ["3", "4", "5"].includes(token.tokenId),
      )
      .sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
    const generatedContractAddresses = new Set(
      generatedTokens.map((token) => token.contractAddress),
    );
    const generatedRotiniContract =
      generatedContractAddresses.size === 1
        ? contracts.find(
            (contract) =>
              contract.address === [...generatedContractAddresses][0],
          )
        : null;
    if (
      generatedTokens.length !== 3 ||
      generatedRotiniContract?.kind !== "rotini-dependency" ||
      JSON.stringify(generatedTokens.map((token) => token.tokenId)) !==
        JSON.stringify(["3", "4", "5"])
    ) {
      fail("ravioli must record generated Rotini product tokens 3, 4, and 5");
    }
    for (const token of generatedTokens) {
      const metadata = artifactsById.get(token.metadataArtifactId);
      const media = artifactsById.get(token.mediaArtifactId);
      if (
        metadata?.kind !== "generated-token-metadata" ||
        media?.kind !== "generated-token-media"
      ) {
        fail(`ravioli generated Rotini token ${token.tokenId} must bind its generated metadata and media`);
      }
    }
    const generativeCapability = capabilities.find(
      (entry) => entry.id === "blind_generative_mint-ui-live-proof",
    );
    const hybridCapability = capabilities.find(
      (entry) => entry.id === "hybrid_atomic_pack-ui-live-proof",
    );
    if (
      !generatedTokens
        .slice(0, 2)
        .every((token) => generativeCapability.evidence.tokens.includes(token.id)) ||
      !hybridCapability.evidence.tokens.includes(generatedTokens[2].id)
    ) {
      fail("ravioli generated Rotini token records must be owned by their generating capabilities");
    }
    const capabilityId = "limited-edition-expiry-deconfliction-ui-live-proof";
    const capability = capabilities.find((entry) => entry.id === capabilityId);
    if (!capability) fail(`ravioli requires capability ${capabilityId}`);
    if (capability.evidence.screenshots.length === 0) {
      fail(`${capabilityId} must reference at least one screenshot`);
    }

    const routers = contracts.filter((entry) => entry.kind === "atomic-pack-router");
    if (routers.length !== 1) {
      fail(`${capabilityId} requires exactly one atomic-pack-router contract`);
    }
    const limitedEditionRouter = routers[0];
    if (!capability.evidence.contracts.includes(limitedEditionRouter.address)) {
      fail(`${capabilityId} must reference the Ravioli atomic-pack-router contract`);
    }

    const wrapperTokens = tokens.filter(
      (token) =>
        token.contractAddress === limitedEditionRouter.address && capability.evidence.tokens.includes(token.id),
    );
    if (wrapperTokens.length === 0) {
      fail(`${capabilityId} must reference a Ravioli wrapper token`);
    }

    const policyArtifacts = capability.evidence.artifacts
      .map((artifactId) => artifactsById.get(artifactId))
      .filter((artifact) => artifact?.kind === "limited-edition-policy-evidence");
    if (policyArtifacts.length !== 1) {
      fail(`${capabilityId} must reference a limited-edition-policy-evidence artifact`);
    }
    const policy = policyArtifacts[0].ravioliLimitedEditionPolicy;
    if (!policy) fail(`${capabilityId} policy artifact did not pass semantic validation`);
    if (policy.wrapperContract !== limitedEditionRouter.address) fail(`${capabilityId} policy wrapper contract differs from the router`);
    if (!wrapperTokens.some((token) => token.tokenId === policy.wrapperTokenId)) {
      fail(`${capabilityId} policy wrapper token is not referenced by the capability`);
    }
    if (policy.childContract === limitedEditionRouter.address) fail(`${capabilityId} policy child must be an external finite token`);

    const exactTokenUrls = capability.evidence.urls
      .map((url) => parseExactShadownetTokenUrl(url))
      .filter(Boolean);
    const hasWrapperUrl = wrapperTokens.some((token) =>
      exactTokenUrls.some(
        (url) => url.contractAddress === token.contractAddress && url.tokenId === token.tokenId,
      ),
    );
    if (!hasWrapperUrl) {
      fail(`${capabilityId} must link its referenced Ravioli wrapper token exactly`);
    }
    const hasChildUrl = exactTokenUrls.some(
      (url) => url.contractAddress !== limitedEditionRouter.address,
    );
    if (!hasChildUrl) {
      fail(`${capabilityId} must link an exact child token on Shadownet TzKT`);
    }
  }

  const referenced = {
    artifacts: new Set(),
    contracts: new Set(),
    operations: new Set(),
    roleEvidence: new Set(),
    screenshots: new Set(),
    tokens: new Set(),
  };
  for (const capability of capabilities) {
    for (const group of Object.keys(referenced)) {
      for (const value of capability.evidence[group] || []) referenced[group].add(value);
    }
  }
  const expectedCoverage = {
    artifacts: artifacts.map((entry) => entry.id),
    contracts: contracts.map((entry) => entry.address),
    operations: operations.map((entry) => entry.hash),
    roleEvidence: roleEvidence.map((entry) => entry.kind),
    screenshots: screenshots.map((entry) => entry.stage),
    tokens: tokens.map((entry) => entry.id),
  };
  for (const [group, expected] of Object.entries(expectedCoverage)) {
    const missing = expected.filter((value) => !referenced[group].has(value));
    if (missing.length) {
      fail(`${app}.capabilities do not cover ${group}: ${missing.join(", ")}`);
    }
  }

  const appFiles = await walkRegularFiles(appRoot);
  const declaredFiles = new Set([
    "manifest.json",
    ...screenshots.map((entry) => entry.path),
    ...artifacts.map((entry) => entry.path),
  ]);
  const actualFiles = new Set(appFiles.map((entry) => entry.relativePath));
  const undeclared = [...actualFiles].filter((entry) => !declaredFiles.has(entry));
  const missing = [...declaredFiles].filter((entry) => !actualFiles.has(entry));
  if (undeclared.length) fail(`${app} contains undeclared evidence files: ${undeclared.join(", ")}`);
  if (missing.length) fail(`${app} declares missing evidence files: ${missing.join(", ")}`);

  const files = [];
  for (const file of appFiles) {
    const bytes = await readFile(file.absolutePath);
    files.push({
      relativePath: `apps/${app}/${file.relativePath}`,
      sourcePath: file.absolutePath,
      bytes: bytes.length,
      sha256: digestBytes(bytes),
    });
  }

  return {
    app,
    role: rules.role,
    runId,
    capturedAt,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID, rpcUrl },
    manifestPath: `apps/${app}/manifest.json`,
    manifestSha256: digestBytes(manifestBytes),
    screenshots,
    artifacts,
    contracts,
    operations,
    tokens,
    roleEvidence,
    capabilities,
    files,
  };
}

export async function validateProofRun(runDirectory) {
  const runRoot = path.resolve(runDirectory);
  let rootStat;
  try {
    rootStat = await stat(runRoot);
  } catch (error) {
    fail(`proof run directory is missing: ${runRoot} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!rootStat.isDirectory()) fail(`proof run path is not a directory: ${runRoot}`);

  const rootEntries = await readdir(runRoot, { withFileTypes: true });
  const actualApps = rootEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const unexpected = rootEntries
    .filter((entry) => !entry.isDirectory() || !APP_ORDER.includes(entry.name))
    .map((entry) => entry.name);
  if (unexpected.length) fail(`proof run contains unexpected root entries: ${unexpected.sort(compareText).join(", ")}`);
  const missingApps = APP_ORDER.filter((app) => !actualApps.includes(app));
  if (missingApps.length) fail(`proof run is missing required apps: ${missingApps.join(", ")}`);

  const apps = [];
  for (const app of APP_ORDER) apps.push(await validateAppManifest(runRoot, app));
  const runIds = new Set(apps.map((entry) => entry.runId));
  if (runIds.size !== 1) fail(`all app manifests must use one runId; found ${[...runIds].join(", ")}`);

  const contractClaims = new Map();
  const operationClaims = new Map();
  for (const app of apps) {
    for (const contract of app.contracts) {
      const claims = contractClaims.get(contract.address) || [];
      claims.push({ app: app.app, contract });
      contractClaims.set(contract.address, claims);
    }
    for (const operation of app.operations) {
      const claims = operationClaims.get(operation.hash) || [];
      claims.push({ app: app.app, operation });
      operationClaims.set(operation.hash, claims);
    }
  }
  const dependencyKinds = new Map([
    ["gnocchi", "gnocchi-dependency"],
    ["rotini", "rotini-dependency"],
  ]);
  const contractOwners = new Map();
  for (const [address, claims] of contractClaims) {
    if (claims.length === 1) {
      contractOwners.set(address, claims[0].app);
      continue;
    }
    const ravioliClaim = claims.find((claim) => claim.app === "ravioli");
    const dependencyClaim = claims.find((claim) => dependencyKinds.has(claim.app));
    if (
      claims.length !== 2 ||
      !ravioliClaim ||
      !dependencyClaim ||
      ravioliClaim.contract.kind !== dependencyKinds.get(dependencyClaim.app)
    ) {
      fail(`contract ${address} has unsupported cross-app claims: ${claims.map((claim) => claim.app).join(", ")}`);
    }
    contractOwners.set(address, dependencyClaim.app);
  }
  const operationOwners = new Map();
  for (const [hash, claims] of operationClaims) {
    if (claims.length === 1) {
      operationOwners.set(hash, claims[0].app);
      continue;
    }
    const ravioliClaim = claims.find((claim) => claim.app === "ravioli");
    const dependencyClaim = claims.find((claim) => dependencyKinds.has(claim.app));
    const dependencyKind = dependencyClaim ? dependencyKinds.get(dependencyClaim.app) : null;
    const ravioliContractClaim = ravioliClaim
      ? contractClaims.get(ravioliClaim.operation.contractAddress)?.find((claim) => claim.app === "ravioli")
      : null;
    if (
      claims.length !== 2 ||
      !ravioliClaim ||
      !dependencyClaim ||
      ravioliClaim.operation.kind !== "origination" ||
      dependencyClaim.operation.kind !== "origination" ||
      ravioliClaim.operation.contractAddress !== dependencyClaim.operation.contractAddress ||
      ravioliContractClaim?.contract.kind !== dependencyKind
    ) {
      fail(`operation ${hash} has unsupported cross-app claims: ${claims.map((claim) => claim.app).join(", ")}`);
    }
    operationOwners.set(hash, dependencyClaim.app);
  }

  const colander = apps.find((entry) => entry.app === "colander");
  for (const evidence of colander.roleEvidence) {
    if (evidence.contractAddress && !contractOwners.has(evidence.contractAddress)) {
      fail(`colander ${evidence.kind} references a contract absent from this proof run: ${evidence.contractAddress}`);
    }
    if (evidence.kind === "contract-discovery") {
      validateTzktUrl(evidence.url, evidence.contractAddress, "colander contract-discovery URL");
    }
    if (evidence.kind === "management-action") {
      validateTzktUrl(evidence.url, evidence.operationHash, "colander management-action URL");
    }
  }
  for (const operation of colander.operations) {
    if (!contractOwners.has(operation.contractAddress)) {
      fail(`colander operation references a contract absent from this proof run: ${operation.contractAddress}`);
    }
  }

  return {
    runRoot,
    runId: apps[0].runId,
    network: { name: "shadownet", chainId: SHADOWNET_CHAIN_ID },
    rpcUrls: [...new Set(apps.map((entry) => entry.network.rpcUrl))].sort(compareText),
    apps,
  };
}

function publicAppSummary(app) {
  const roleBoundary =
    ROLE_BOUNDARIES[app.app] ||
    Object.freeze({
      contracts:
        "This token-publisher proof requires at least one app-originated contract with a matching applied origination operation.",
      tokens:
        "This token-publisher proof requires at least one indexed token linked to pinned metadata and media artifacts.",
    });
  return {
    app: app.app,
    role: app.role,
    capturedAt: app.capturedAt,
    proofPath: `apps/${app.app}/PROOF.md`,
    manifestPath: app.manifestPath,
    manifestSha256: app.manifestSha256,
    roleBoundary,
    capabilities: app.capabilities,
    screenshots: app.screenshots,
    artifacts: app.artifacts,
    contracts: app.contracts,
    operations: app.operations,
    tokens: app.tokens,
    roleEvidence: app.roleEvidence,
  };
}

function buildAggregate(validation) {
  const sourceFiles = validation.apps
    .flatMap((app) => app.files.map(({ sourcePath: _sourcePath, ...file }) => file))
    .sort((a, b) => compareText(a.relativePath, b.relativePath));
  return {
    schema: PACKAGE_SCHEMA,
    runId: validation.runId,
    network: validation.network,
    rpcUrls: validation.rpcUrls,
    appOrder: APP_ORDER,
    validation: {
      status: "PASSED",
      mode: "offline-structural-and-content-digest",
      liveNetworkQueriedByAssembler: false,
      requirements: {
        allNineAppsPresent: true,
        capabilityEvidenceTraceable: true,
        roleBoundariesEnforced: true,
        localEvidenceDigestsVerified: true,
        pinnedArtifactRetrievalDigestsRecorded: true,
        gnocchiProofTimeSupplyAndHoldersBound: true,
        ravioliModeOutcomesSemanticallyValidated: true,
        ravioliEffective67WritePlanValidated: true,
        ravioliJournalPinCallBreakdownValidated: true,
        ravioliGeneratedRotiniTokensValidated: true,
        ravioliDependencyReuseConstrained: true,
        tezosIdentifiersChecksumValidated: true,
        shadownetExplorerUrlsValidated: true,
        nonSecretManifestFilenamesAndEvidenceBytesValidated: true,
      },
    },
    apps: validation.apps.map(publicAppSummary),
    sourceFiles,
  };
}

function markdownEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[()[\]|\\]/g, (character) => `\\${character}`);
}

function appLocalPrefix(app, scope) {
  return scope === "aggregate" ? `apps/${app.app}/` : "";
}

function renderCapabilityEvidence(app, capability, scope) {
  const prefix = appLocalPrefix(app, scope);
  const screenshots = new Map(app.screenshots.map((entry) => [entry.stage, entry]));
  const artifacts = new Map(app.artifacts.map((entry) => [entry.id, entry]));
  const contracts = new Map(app.contracts.map((entry) => [entry.address, entry]));
  const operations = new Map(app.operations.map((entry) => [entry.hash, entry]));
  const tokens = new Map(app.tokens.map((entry) => [entry.id, entry]));
  const roleEvidence = new Map(app.roleEvidence.map((entry) => [entry.kind, entry]));
  const groups = [];
  if (capability.evidence.screenshots.length) {
    groups.push(
      `  - Screenshots: ${capability.evidence.screenshots
        .map((stage) => {
          const screenshot = screenshots.get(stage);
          return `[\`${markdownEscape(stage)}\`](${prefix}${screenshot.path})`;
        })
        .join(", ")}`,
    );
  }
  if (capability.evidence.contracts.length) {
    groups.push(
      `  - Contracts: ${capability.evidence.contracts
        .map((address) => `[\`${address}\`](${contracts.get(address).explorerUrl})`)
        .join(", ")}`,
    );
  }
  if (capability.evidence.tokens.length) {
    groups.push(
      `  - Tokens: ${capability.evidence.tokens
        .map((id) => {
          const token = tokens.get(id);
          return `[\`${markdownEscape(id)} (${token.contractAddress}:${token.tokenId})\`](${token.explorerUrl})`;
        })
        .join(", ")}`,
    );
  }
  if (capability.evidence.operations.length) {
    groups.push(
      `  - Operations: ${capability.evidence.operations
        .map((hash) => `[\`${hash}\`](${operations.get(hash).explorerUrl})`)
        .join(", ")}`,
    );
  }
  if (capability.evidence.artifacts.length) {
    groups.push(
      `  - Artifacts: ${capability.evidence.artifacts
        .map((id) => {
          const artifact = artifacts.get(id);
          const target = artifact.gatewayUrl || `${prefix}${artifact.path}`;
          return `[\`${markdownEscape(id)}\`](${target})`;
        })
        .join(", ")}`,
    );
  }
  if (capability.evidence.roleEvidence.length) {
    groups.push(
      `  - Role evidence: ${capability.evidence.roleEvidence
        .map((kind) => `[\`${markdownEscape(kind)}\`](${roleEvidence.get(kind).url})`)
        .join(", ")}`,
    );
  }
  if (capability.evidence.urls.length) {
    groups.push(
      `  - Additional links: ${capability.evidence.urls
        .map((url) => `[${markdownEscape(url)}](${url})`)
        .join(", ")}`,
    );
  }
  return groups;
}

function renderAppEvidence(app, scope, { includeHeading = true } = {}) {
  const prefix = appLocalPrefix(app, scope);
  const lines = [];
  if (includeHeading) lines.push(`## ${markdownEscape(app.app)}`, "");
  lines.push(
    `- Role: \`${app.role}\``,
    `- Captured: \`${app.capturedAt}\``,
    `- Manifest: [\`manifest.json\`](${prefix}manifest.json) — SHA-256 \`${app.manifestSha256}\``,
  );
  if (scope === "aggregate") {
    lines.push(`- Standalone app proof: [\`PROOF.md\`](${app.proofPath})`);
  }
  lines.push(
    "",
    "### Role boundary",
    "",
    `- Contracts: ${markdownEscape(app.roleBoundary.contracts)}`,
    `- Tokens: ${markdownEscape(app.roleBoundary.tokens)}`,
    "",
    "### Capability-to-evidence map",
    "",
  );
  for (const capability of app.capabilities) {
    lines.push(`- \`${capability.id}\`: ${markdownEscape(capability.description)}`);
    lines.push(...renderCapabilityEvidence(app, capability, scope));
  }
  lines.push("", "### Stage screenshots", "");
  for (const screenshot of app.screenshots) {
    lines.push(
      `- \`${screenshot.stage}\`: [${markdownEscape(screenshot.caption)}](${prefix}${screenshot.path}) — ${screenshot.bytes} bytes — SHA-256 \`${screenshot.sha256}\``,
    );
  }
  if (app.contracts.length) {
    lines.push("", "### Shadownet contracts", "");
    for (const contract of app.contracts) {
      lines.push(
        `- [\`${contract.address}\`](${contract.explorerUrl}) — \`${markdownEscape(contract.kind)}\``,
      );
    }
  }
  if (app.tokens.length) {
    lines.push("", "### Shadownet tokens and pinned payloads", "");
    for (const token of app.tokens) {
      const metadata = app.artifacts.find((entry) => entry.id === token.metadataArtifactId);
      const media = app.artifacts.find((entry) => entry.id === token.mediaArtifactId);
      lines.push(
        `- [\`${token.contractAddress}:${token.tokenId}\`](${token.explorerUrl}) (evidence id \`${markdownEscape(token.id)}\`)`,
        `  - Metadata: CID [\`${metadata.cid}\`](${metadata.gatewayUrl}) — \`${metadata.ipfsUri}\` — retrieved SHA-256 \`${metadata.retrievedSha256}\``,
        `  - Media: CID [\`${media.cid}\`](${media.gatewayUrl}) — \`${media.ipfsUri}\` — retrieved SHA-256 \`${media.retrievedSha256}\``,
      );
      if (token.historicalStateArtifactId) {
        const historical = app.artifacts.find(
          (entry) => entry.id === token.historicalStateArtifactId,
        );
        lines.push(
          `  - Proof-time state at level \`${token.proofLevel}\`: supply \`${token.proofTotalSupply}\`, holders \`${token.proofHoldersCount}\``,
          `  - Historical indexer snapshot: CID [\`${historical.cid}\`](${historical.gatewayUrl}) — retrieved SHA-256 \`${historical.retrievedSha256}\``,
        );
      }
    }
  }
  if (app.operations.length) {
    lines.push("", "### Applied Shadownet operations", "");
    for (const operation of app.operations) {
      lines.push(
        `- \`${operation.kind}\`: [\`${operation.hash}\`](${operation.explorerUrl})${operation.entrypoint ? ` — entrypoint \`${operation.entrypoint}\`` : ""} — contract \`${operation.contractAddress}\``,
      );
    }
  }
  if (app.roleEvidence.length) {
    lines.push("", "### Role evidence", "");
    for (const evidence of app.roleEvidence) {
      const details = [
        evidence.artifactId ? `artifact \`${evidence.artifactId}\`` : null,
        evidence.contractAddress ? `contract \`${evidence.contractAddress}\`` : null,
        evidence.operationHash ? `operation \`${evidence.operationHash}\`` : null,
        evidence.targetApp ? `target \`${evidence.targetApp}\`` : null,
      ].filter(Boolean);
      lines.push(
        `- \`${evidence.kind}\`: [evidence link](${evidence.url})${details.length ? ` — ${details.join(" — ")}` : ""}`,
      );
    }
  }
  lines.push("", "### Packaged and pinned artifacts", "");
  for (const artifact of app.artifacts) {
    lines.push(
      `- \`${artifact.id}\` (\`${artifact.kind}\`): [packaged file](${prefix}${artifact.path}) — ${artifact.bytes} bytes — SHA-256 \`${artifact.sha256}\``,
    );
    if (artifact.gatewayUrl) {
      lines.push(
        `  - CID [\`${artifact.cid}\`](${artifact.gatewayUrl}) — \`${artifact.ipfsUri}\` — [public gateway](${artifact.gatewayUrl}) — retrieved SHA-256 \`${artifact.retrievedSha256}\``,
      );
    }
  }
  lines.push("");
  return lines;
}

function renderMarkdown(aggregate) {
  const lines = [
    "# Pasta Protocol Shadownet Proof Package",
    "",
    `- Run: \`${aggregate.runId}\``,
    `- Network: Shadownet (\`${aggregate.network.chainId}\`)`,
    "- Package validation: PASSED",
    "- Validation mode: offline structure, Tezos identifier checksum, Shadownet URL shape, evidence coverage, secret-pattern screening, and byte-digest verification",
    "- Live-network behavior: captured by the supplied app evidence; the deterministic assembler does not re-query or mutate Shadownet",
    "- Public links: direct Shadownet TzKT explorer and HTTPS IPFS gateway evidence only; this report makes no marketplace-indexing claim",
    "",
    "## App evidence matrix",
    "",
    "| App proof | Role | Capabilities | Screenshots | Contracts | Tokens | Applied operations | Artifacts |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...aggregate.apps.map(
      (app) =>
        `| [${markdownEscape(app.app)}](${app.proofPath}) | ${markdownEscape(app.role)} | ${app.capabilities.length} | ${app.screenshots.length} | ${app.contracts.length} | ${app.tokens.length} | ${app.operations.length} | ${app.artifacts.length} |`,
    ),
    "",
  ];
  for (const app of aggregate.apps) lines.push(...renderAppEvidence(app, "aggregate"));
  lines.push(
    "## Integrity",
    "",
    "Every packaged file except `SHA-256SUMS` is covered by `SHA-256SUMS`. The ZIP uses fixed metadata and sorted paths so identical evidence produces identical archive bytes.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function renderPerAppMarkdown(aggregate, app) {
  const lines = [
    `# ${markdownEscape(app.app)} Shadownet Proof`,
    "",
    `- Pasta run: \`${aggregate.runId}\``,
    `- Network: Shadownet (\`${aggregate.network.chainId}\`)`,
    "- App-package validation: PASSED as part of the nine-app aggregate",
    "- Evidence links: direct TzKT and public IPFS gateway links; no marketplace-indexing claim",
    "",
    ...renderAppEvidence(app, "app", { includeHeading: false }),
    "## Package integrity",
    "",
    "This app directory, including this report, is covered by [`SHA-256SUMS`](../../SHA-256SUMS). The aggregate report is [`PASTA-PROTOCOL-PROOF.md`](../../PASTA-PROTOCOL-PROOF.md).",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function createDeterministicZip(entries) {
  if (entries.length > 0xffff) fail("proof package has too many files for a deterministic ZIP32 archive");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const fixedDosTime = 0;
  const fixedDosDate = 33; // 1980-01-01
  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const data = entry.bytes;
    if (data.length > 0xffffffff || offset > 0xffffffff) {
      fail("proof package exceeds deterministic ZIP32 limits");
    }
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(fixedDosTime, 10);
    local.writeUInt16LE(fixedDosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(fixedDosTime, 12);
    central.writeUInt16LE(fixedDosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function packageFileEntries(outputDirectory) {
  const files = await walkRegularFiles(outputDirectory);
  const entries = [];
  for (const file of files) {
    entries.push({ path: file.relativePath, bytes: await readFile(file.absolutePath) });
  }
  entries.sort((a, b) => compareText(a.path, b.path));
  return entries;
}

export async function assembleProofPackage(runDirectory, options = {}) {
  const validation = await validateProofRun(runDirectory);
  const runRoot = validation.runRoot;
  const outputDirectory = path.resolve(options.outputDirectory || `${runRoot}-proof-package`);
  const archivePath = path.resolve(options.archivePath || `${outputDirectory}.zip`);
  const force = options.force === true;
  if (isInside(runRoot, outputDirectory) || isInside(outputDirectory, runRoot)) {
    fail("output directory and proof run directory must be separate");
  }
  if (isInside(runRoot, archivePath)) fail("archive must be outside the proof run directory");
  if (isInside(outputDirectory, archivePath)) fail("archive must be outside the output directory");

  for (const [target, label] of [
    [outputDirectory, "output directory"],
    [archivePath, "archive"],
  ]) {
    try {
      await stat(target);
      if (!force) fail(`${label} already exists: ${target}; pass force: true or --force to replace it`);
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
    }
  }
  if (force) {
    await rm(outputDirectory, { recursive: true, force: true });
    await rm(archivePath, { force: true });
  }
  await mkdir(outputDirectory, { recursive: true });
  for (const app of validation.apps) {
    for (const file of app.files) {
      const destination = resolveInside(outputDirectory, file.relativePath, "package destination");
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(file.sourcePath, destination);
    }
  }

  const aggregate = buildAggregate(validation);
  const aggregateJsonPath = path.join(outputDirectory, "PASTA-PROTOCOL-PROOF.json");
  const aggregateMarkdownPath = path.join(outputDirectory, "PASTA-PROTOCOL-PROOF.md");
  await writeFile(aggregateJsonPath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
  await writeFile(aggregateMarkdownPath, renderMarkdown(aggregate), "utf8");
  for (const app of aggregate.apps) {
    const proofPath = resolveInside(outputDirectory, app.proofPath, `${app.app} proof report`);
    await writeFile(proofPath, renderPerAppMarkdown(aggregate, app), "utf8");
  }

  const preChecksumEntries = await packageFileEntries(outputDirectory);
  const checksumLines = preChecksumEntries.map(
    (entry) => `${digestBytes(entry.bytes)}  ${entry.path}`,
  );
  const checksumPath = path.join(outputDirectory, "SHA-256SUMS");
  await writeFile(checksumPath, `${checksumLines.join("\n")}\n`, "utf8");

  const archiveEntries = await packageFileEntries(outputDirectory);
  const archiveBytes = createDeterministicZip(archiveEntries);
  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(archivePath, archiveBytes);
  return {
    ok: true,
    runId: validation.runId,
    outputDirectory,
    archivePath,
    archiveSha256: digestBytes(archiveBytes),
    fileCount: archiveEntries.length,
    appCount: validation.apps.length,
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/pasta-protocol/assemble-proof-package.mjs <run-directory> [--output <directory>] [--archive <zip>] [--force]

Required run layout:
  <run-directory>/<app>/manifest.json
  <run-directory>/<app>/screenshots/*
  <run-directory>/<app>/artifacts/*

Apps (all required): ${APP_ORDER.join(", ")}
Manifest schema: ${APP_PROOF_SCHEMA}
Network: shadownet / ${SHADOWNET_CHAIN_ID}

The command validates evidence and creates PASTA-PROTOCOL-PROOF.json,
PASTA-PROTOCOL-PROOF.md, SHA-256SUMS, and a deterministic ZIP. It never
loads wallet material, queries a signer, or mutates Tezos.`);
}

function parseCliArguments(argv) {
  const args = [...argv];
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--force") {
      options.force = true;
    } else if (value === "--output" || value === "--archive") {
      const next = args[index + 1];
      if (!next || next.startsWith("--")) fail(`${value} requires a path`);
      if (value === "--output") options.outputDirectory = next;
      else options.archivePath = next;
      index += 1;
    } else if (value.startsWith("--")) {
      fail(`unknown option: ${value}`);
    } else {
      positional.push(value);
    }
  }
  if (positional.length !== 1) fail("exactly one proof run directory is required");
  return { help: false, runDirectory: positional[0], options };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const parsed = parseCliArguments(process.argv.slice(2));
    if (parsed.help) {
      printHelp();
    } else {
      const result = await assembleProofPackage(parsed.runDirectory, parsed.options);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`[pasta-proof-package] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
