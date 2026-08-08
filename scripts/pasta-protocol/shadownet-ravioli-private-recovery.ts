import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";

const PUBLISH_RECOVERY_SCHEMA = "pasta-ravioli-publish-recovery@1";
const PUBLISH_RECOVERY_ENCODING = "pasta-recovery-canonical@1";
const PRIVATE_SNAPSHOT_SCHEMA = "pastaprotocol-ravioli-private-recovery-snapshot@1";
const OPEN_KIT_SCHEMA = "pasta-ravioli-open-kit@3";
const PUBLIC_REVEAL_SCHEMA = "pasta-ravioli-public-reveal@1";
const SEALED_REVEAL_REFERENCE_SCHEMA = "pasta-ravioli-sealed-reveal-reference@1";
const DRAFT_KEY_PREFIX = "pasta.ravioli.publish-recovery-draft.v1:";
const PACK_KEY_PREFIX = "pasta.ravioli.publish-recovery.v1:";
const TEZOS_ACCOUNT_RE = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;
const TEZOS_CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const OPERATION_HASH_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const HEX_32_RE = /^[0-9a-f]{64}$/;
const IPFS_URI_RE = /^ipfs:\/\/[A-Za-z0-9]+$/;
const LEGACY_ESCROW_STAGE_RE =
  /^AUTHORIZE_ESCROW_(KT1[1-9A-HJ-NP-Za-km-z]{4}\u2026[1-9A-HJ-NP-Za-km-z]{4}):(PREPARED|SUBMITTED|CONFIRMED)$/;
const NETWORKS = new Set(["mainnet", "shadownet"]);
const RECOVERY_STATUSES = new Set(["IN_PROGRESS", "FAILED", "COMPLETE"]);
const PACK_MODES = new Set([
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
]);

export const RAVIOLI_PRIVATE_RECOVERY_MAX_RECORD_BYTES = 4_000_000;
export const RAVIOLI_PRIVATE_RECOVERY_MAX_TOTAL_BYTES = 16_000_000;
export const RAVIOLI_PRIVATE_RECOVERY_MAX_RECORDS = 64;

const MAX_JSON_DEPTH = 96;
const MAX_JSON_NODES_PER_RECORD = 100_000;
const MAX_OBJECT_KEYS = 4_096;
const MAX_ARRAY_ITEMS = 4_096;
const TOP_LEVEL_KEYS = Object.freeze([
  "schema",
  "encoding",
  "status",
  "draftId",
  "network",
  "account",
  "contract",
  "tokenId",
  "kit",
  "product",
  "history",
  "createdAt",
  "updatedAt",
]);
const PRODUCT_KEYS = Object.freeze([
  "name",
  "mode",
  "editions",
  "target",
  "workflow",
  "expectedTerminalStage",
]);
const HISTORY_REQUIRED_KEYS = Object.freeze(["stage", "status", "at"]);
const HISTORY_OPTIONAL_KEYS = Object.freeze(["operationHash", "details"]);
const OPEN_KIT_KEYS = Object.freeze([
  "schema",
  "network",
  "contract",
  "tokenId",
  "mode",
  "manifestUri",
  "blindSecurity",
  "warning",
  "editionPolicy",
  "recipes",
]);
const EDITION_POLICY_KEYS = Object.freeze([
  "requiresLimitedWrapper",
  "wrapperEditionClass",
  "earliestChildEnd",
  "wrapperSaleStart",
  "wrapperSaleEnd",
  "revealDeadline",
  "openDeadline",
]);
const PUBLIC_REVEAL_KEYS = Object.freeze([
  "schema",
  "network",
  "contract",
  "tokenId",
  "mode",
  "manifestUri",
  "maxSupply",
  "itemCount",
  "openKit",
]);
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);

type JsonObject = Record<string, unknown>;

type BrowserRecoveryRecord = Readonly<{
  key: string;
  value: string;
}>;

type PrivateRecoveryManifestRecord = Readonly<{
  storageKey: string;
  file: string;
  byteLength: number;
  sha256: string;
}>;

type DirectoryIdentity = Readonly<{
  path: string;
  device: bigint;
  inode: bigint;
}>;

export type CaptureRavioliPrivateRecoveryOptions = Readonly<{
  page: Page;
  privateOutputDirectory: string;
  publicProofRunRoot: string;
}>;

export type RavioliPrivateRecoveryCapture = Readonly<{
  path: string;
  sha256: string;
  count: number;
}>;

function fail(message: string): never {
  throw new Error(`Ravioli private recovery ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requirePlainObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonObject;
}

function requireExactKeys(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[] = [],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  if (actual.some((key) => !allowed.has(key)) || required.some((key) => !actual.includes(key))) {
    fail(`${label} has an unexpected key set`);
  }
}

function requireBoundedString(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (
    typeof value !== "string"
    || value.length > maxLength
    || (!allowEmpty && value.length === 0)
  ) {
    fail(`${label} is invalid`);
  }
  return value;
}

function requireNatural(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} is invalid`);
  }
  return value;
}

function requireIsoTimestamp(value: unknown, label: string): string {
  const timestamp = requireBoundedString(value, label, 64);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== timestamp) {
    fail(`${label} is invalid`);
  }
  return timestamp;
}

function assertBoundedJson(value: unknown): void {
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES_PER_RECORD) fail("record JSON exceeds its node limit");
    if (depth > MAX_JSON_DEPTH) fail("record JSON exceeds its depth limit");
    if (candidate === null || typeof candidate === "boolean") return;
    if (typeof candidate === "string") return;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) fail("record JSON contains a non-finite number");
      return;
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > MAX_ARRAY_ITEMS) fail("record JSON array exceeds its item limit");
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    if (typeof candidate !== "object") fail("record JSON contains an unsupported value");
    const entries = Object.entries(candidate as JsonObject);
    if (entries.length > MAX_OBJECT_KEYS) fail("record JSON object exceeds its key limit");
    for (const [key, item] of entries) {
      if (FORBIDDEN_JSON_KEYS.has(key)) fail("record JSON contains a forbidden key");
      visit(item, depth + 1);
    }
  };
  visit(value, 0);
}

function canonicalJsonValue(value: unknown): unknown {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || typeof value === "number"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalJsonValue(item));
  const object = requirePlainObject(value, "canonical recovery value");
  const output: JsonObject = {};
  for (const key of Object.keys(object).sort()) output[key] = canonicalJsonValue(object[key]);
  return output;
}

function canonicalJsonSha256(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(canonicalJsonValue(value)), "utf8"));
}

function requireNetwork(value: unknown, label: string): string {
  const network = requireBoundedString(value, label, 32);
  if (!NETWORKS.has(network)) fail(`${label} is unsupported`);
  return network;
}

function requireAccount(value: unknown, label: string): string {
  const account = requireBoundedString(value, label, 64);
  if (!TEZOS_ACCOUNT_RE.test(account)) fail(`${label} is invalid`);
  return account;
}

function requireContract(value: unknown, label: string): string {
  const contract = requireBoundedString(value, label, 64);
  if (!TEZOS_CONTRACT_RE.test(contract)) fail(`${label} is invalid`);
  return contract;
}

function requireIpfsUri(value: unknown, label: string): string {
  const uri = requireBoundedString(value, label, 256);
  if (!IPFS_URI_RE.test(uri)) fail(`${label} is invalid`);
  return uri;
}

function validateEditionPolicy(value: unknown): void {
  const policy = requirePlainObject(value, "open-kit edition policy");
  requireExactKeys(policy, EDITION_POLICY_KEYS, [], "open-kit edition policy");
  if (typeof policy.requiresLimitedWrapper !== "boolean") {
    fail("open-kit edition policy flag is invalid");
  }
  if (!["fixed-supply", "limited-edition"].includes(String(policy.wrapperEditionClass || ""))) {
    fail("open-kit wrapper edition class is invalid");
  }
  for (const field of ["earliestChildEnd", "wrapperSaleStart", "wrapperSaleEnd", "revealDeadline", "openDeadline"]) {
    const candidate = policy[field];
    if (candidate !== null) requireIsoTimestamp(candidate, `open-kit ${field}`);
  }
}

function validateOpenKit(value: unknown, expectedNetwork?: string): JsonObject {
  const kit = requirePlainObject(value, "open kit");
  const hasSealedReveal = Object.prototype.hasOwnProperty.call(kit, "sealedReveal");
  requireExactKeys(kit, OPEN_KIT_KEYS, hasSealedReveal ? ["sealedReveal"] : [], "open kit");
  if (kit.schema !== OPEN_KIT_SCHEMA) fail("open-kit schema is unsupported");
  const network = requireNetwork(kit.network, "open-kit network");
  if (expectedNetwork && network !== expectedNetwork) fail("open-kit network does not match its recovery");
  requireContract(kit.contract, "open-kit contract");
  requireNatural(kit.tokenId, "open-kit token id");
  const mode = requireBoundedString(kit.mode, "open-kit mode", 64);
  if (!PACK_MODES.has(mode)) fail("open-kit mode is unsupported");
  requireIpfsUri(kit.manifestUri, "open-kit manifest URI");
  if (!["commit-reveal-ui-hidden-chain-public", "public"].includes(String(kit.blindSecurity || ""))) {
    fail("open-kit disclosure policy is unsupported");
  }
  requireBoundedString(kit.warning, "open-kit warning", 512);
  validateEditionPolicy(kit.editionPolicy);
  if (!Array.isArray(kit.recipes) || kit.recipes.length < 1 || kit.recipes.length > 64) {
    fail("open-kit recipe count is invalid");
  }
  const nonces = new Set<string>();
  for (let index = 0; index < kit.recipes.length; index += 1) {
    const recipe = requirePlainObject(kit.recipes[index], `open-kit recipe ${index}`);
    requireExactKeys(recipe, ["serial", "nonce", "actions"], [], `open-kit recipe ${index}`);
    if (requireNatural(recipe.serial, `open-kit recipe ${index} serial`) !== index) {
      fail(`open-kit recipe ${index} serial is invalid`);
    }
    const nonce = requireBoundedString(recipe.nonce, `open-kit recipe ${index} nonce`, 64);
    if (!HEX_32_RE.test(nonce) || nonces.has(nonce)) {
      fail(`open-kit recipe ${index} nonce is invalid`);
    }
    nonces.add(nonce);
    if (!Array.isArray(recipe.actions) || recipe.actions.length < 1 || recipe.actions.length > 64) {
      fail(`open-kit recipe ${index} actions are invalid`);
    }
    for (const action of recipe.actions) requirePlainObject(action, `open-kit recipe ${index} action`);
  }
  if (hasSealedReveal) {
    const sealed = requirePlainObject(kit.sealedReveal, "open-kit sealed reveal");
    requireExactKeys(
      sealed,
      ["schema", "contentsUri", "salt", "offset", "envelopeSha256"],
      [],
      "open-kit sealed reveal",
    );
    if (sealed.schema !== SEALED_REVEAL_REFERENCE_SCHEMA) fail("open-kit sealed-reveal schema is unsupported");
    requireIpfsUri(sealed.contentsUri, "open-kit sealed-reveal URI");
    if (!HEX_32_RE.test(String(sealed.salt || "")) || !HEX_32_RE.test(String(sealed.envelopeSha256 || ""))) {
      fail("open-kit sealed-reveal digest material is invalid");
    }
    if (requireNatural(sealed.offset, "open-kit sealed-reveal offset") >= kit.recipes.length) {
      fail("open-kit sealed-reveal offset is invalid");
    }
  }
  return kit;
}

function validatePublicReveal(value: unknown, expectedNetwork: string): JsonObject {
  const reveal = requirePlainObject(value, "sealed preimage public reveal");
  requireExactKeys(reveal, PUBLIC_REVEAL_KEYS, [], "sealed preimage public reveal");
  if (reveal.schema !== PUBLIC_REVEAL_SCHEMA) fail("sealed preimage public-reveal schema is unsupported");
  const network = requireNetwork(reveal.network, "sealed preimage public-reveal network");
  if (network !== expectedNetwork) fail("sealed preimage public-reveal network does not match its recovery");
  requireContract(reveal.contract, "sealed preimage public-reveal contract");
  requireNatural(reveal.tokenId, "sealed preimage public-reveal token id");
  const mode = requireBoundedString(reveal.mode, "sealed preimage public-reveal mode", 64);
  if (!PACK_MODES.has(mode) || mode === "deterministic_vault") {
    fail("sealed preimage public-reveal mode is invalid");
  }
  requireIpfsUri(reveal.manifestUri, "sealed preimage public-reveal manifest URI");
  const maxSupply = requireNatural(reveal.maxSupply, "sealed preimage public-reveal supply");
  if (maxSupply < 1 || maxSupply > 64) fail("sealed preimage public-reveal supply is invalid");
  const itemCount = requireNatural(reveal.itemCount, "sealed preimage public-reveal item count");
  if (itemCount < 1 || itemCount > 64) fail("sealed preimage public-reveal item count is invalid");
  const kit = validateOpenKit(reveal.openKit, expectedNetwork);
  if (
    kit.contract !== reveal.contract
    || kit.tokenId !== reveal.tokenId
    || kit.mode !== reveal.mode
    || kit.manifestUri !== reveal.manifestUri
    || (kit.recipes as unknown[]).length !== maxSupply
  ) {
    fail("sealed preimage public reveal does not match its open kit");
  }
  if (Object.prototype.hasOwnProperty.call(kit, "sealedReveal")) {
    fail("sealed preimage public reveal unexpectedly includes the private reveal reference");
  }
  return reveal;
}

function shortTezosAddress(value: string): string {
  return `${value.slice(0, 7)}\u2026${value.slice(-4)}`;
}

function validateLegacyEscrowPrepared(
  entry: JsonObject,
  expectedShortTarget: string,
  network: string,
  account: string,
): string {
  if (Object.prototype.hasOwnProperty.call(entry, "operationHash")) {
    fail("legacy escrow PREPARED stage unexpectedly has an operation hash");
  }
  const details = requirePlainObject(entry.details, "legacy escrow PREPARED details");
  requireExactKeys(details, ["intent", "intentSha256"], [], "legacy escrow PREPARED details");
  const intentSha256 = String(details.intentSha256 || "");
  if (!HEX_32_RE.test(intentSha256)) fail("legacy escrow PREPARED intent digest is invalid");
  const intent = requirePlainObject(details.intent, "legacy escrow PREPARED intent");
  requireExactKeys(
    intent,
    ["network", "signer", "expectedCounter", "action", "target", "entrypoint", "payload"],
    [],
    "legacy escrow PREPARED intent",
  );
  if (intent.network !== network || intent.signer !== account) {
    fail("legacy escrow PREPARED signer scope does not match its recovery");
  }
  if (intent.expectedCounter !== null) requireNatural(intent.expectedCounter, "legacy escrow expected counter");
  if (intent.action !== "call" || intent.entrypoint !== "update_operators") {
    fail("legacy escrow PREPARED intent action is invalid");
  }
  const target = requireContract(intent.target, "legacy escrow PREPARED target");
  if (shortTezosAddress(target) !== expectedShortTarget) {
    fail("legacy escrow stage does not match its full target");
  }
  if (!Array.isArray(intent.payload) || intent.payload.length < 1 || intent.payload.length > 64) {
    fail("legacy escrow PREPARED update batch is invalid");
  }
  for (let index = 0; index < intent.payload.length; index += 1) {
    const update = requirePlainObject(intent.payload[index], `legacy escrow update ${index}`);
    requireExactKeys(update, ["add_operator"], [], `legacy escrow update ${index}`);
    const addOperator = requirePlainObject(update.add_operator, `legacy escrow update ${index} payload`);
    requireExactKeys(
      addOperator,
      ["owner", "operator", "token_id"],
      [],
      `legacy escrow update ${index} payload`,
    );
    if (addOperator.owner !== account) fail(`legacy escrow update ${index} owner is invalid`);
    requireContract(addOperator.operator, `legacy escrow update ${index} operator`);
    requireNatural(addOperator.token_id, `legacy escrow update ${index} token id`);
  }
  if (canonicalJsonSha256(intent) !== intentSha256) {
    fail("legacy escrow PREPARED intent digest does not match its payload");
  }
  return intentSha256;
}

function validateHistory(value: unknown, network: string, account: string): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1_024) {
    fail("record history is invalid");
  }
  const legacyEscrowProgress = new Map<string, {
    digest: string;
    phase: "PREPARED" | "SUBMITTED" | "CONFIRMED";
  }>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = requirePlainObject(value[index], `history entry ${index}`);
    requireExactKeys(entry, HISTORY_REQUIRED_KEYS, HISTORY_OPTIONAL_KEYS, `history entry ${index}`);
    const stage = requireBoundedString(entry.stage, `history entry ${index} stage`, 160);
    const legacyEscrowStage = stage.match(LEGACY_ESCROW_STAGE_RE);
    if (!/^[A-Z0-9_:-]+$/.test(stage) && !legacyEscrowStage) {
      fail(`history entry ${index} stage is invalid`);
    }
    if (!RECOVERY_STATUSES.has(String(entry.status || ""))) {
      fail(`history entry ${index} status is invalid`);
    }
    requireIsoTimestamp(entry.at, `history entry ${index} timestamp`);
    if (Object.prototype.hasOwnProperty.call(entry, "operationHash")) {
      if (!OPERATION_HASH_RE.test(String(entry.operationHash || ""))) {
        fail(`history entry ${index} operation hash is invalid`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(entry, "details")) {
      requirePlainObject(entry.details, `history entry ${index} details`);
    }
    if (legacyEscrowStage) {
      const shortTarget = legacyEscrowStage[1];
      const phase = legacyEscrowStage[2] as "PREPARED" | "SUBMITTED" | "CONFIRMED";
      const baseStage = `AUTHORIZE_ESCROW_${shortTarget}`;
      if (phase === "PREPARED") {
        if (legacyEscrowProgress.has(baseStage)) fail("legacy escrow PREPARED stage is duplicated");
        legacyEscrowProgress.set(baseStage, {
          digest: validateLegacyEscrowPrepared(entry, shortTarget, network, account),
          phase,
        });
      } else {
        const previous = legacyEscrowProgress.get(baseStage);
        const expectedPrevious = phase === "SUBMITTED" ? "PREPARED" : "SUBMITTED";
        if (!previous || previous.phase !== expectedPrevious) {
          fail(`legacy escrow ${phase} stage is out of order`);
        }
        if (!Object.prototype.hasOwnProperty.call(entry, "operationHash")) {
          fail(`legacy escrow ${phase} stage has no operation hash`);
        }
        const details = requirePlainObject(entry.details, `legacy escrow ${phase} details`);
        requireExactKeys(details, ["intentSha256"], [], `legacy escrow ${phase} details`);
        if (details.intentSha256 !== previous.digest) {
          fail(`legacy escrow ${phase} intent digest does not match PREPARED`);
        }
        legacyEscrowProgress.set(baseStage, { digest: previous.digest, phase });
      }
    }
    if (stage === "SEALED_REVEAL_PREIMAGE_SAVED_BEFORE_PIN") {
      const details = requirePlainObject(entry.details, "sealed preimage details");
      requireExactKeys(details, ["salt", "offset", "publicReveal"], [], "sealed preimage details");
      if (!HEX_32_RE.test(String(details.salt || ""))) fail("sealed preimage salt is invalid");
      const reveal = validatePublicReveal(details.publicReveal, network);
      if (requireNatural(details.offset, "sealed preimage offset") >= Number(reveal.maxSupply)) {
        fail("sealed preimage offset is invalid");
      }
    }
  }
}

function validateProduct(value: unknown): void {
  const product = requirePlainObject(value, "record product");
  requireExactKeys(product, PRODUCT_KEYS, [], "record product");
  requireBoundedString(product.name, "record product name", 512);
  requireBoundedString(product.mode, "record product mode", 64);
  const editions = requireNatural(product.editions, "record product editions");
  if (editions < 1 || editions > 1_000_000) fail("record product editions are invalid");
  if (!["existing_contract", "new_collection"].includes(String(product.target || ""))) {
    fail("record product target is invalid");
  }
  requireBoundedString(product.workflow, "record product workflow", 64);
  requireBoundedString(product.expectedTerminalStage, "record terminal stage", 160);
}

function parseRecoveryRecord(candidate: BrowserRecoveryRecord, ordinal: number): {
  key: string;
  bytes: Buffer;
} {
  const bytes = Buffer.from(candidate.value, "utf8");
  if (bytes.toString("utf8") !== candidate.value) fail(`record ${ordinal} is not lossless UTF-8`);
  if (bytes.byteLength > RAVIOLI_PRIVATE_RECOVERY_MAX_RECORD_BYTES) {
    fail(`record ${ordinal} exceeds its byte limit`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.value);
  } catch {
    fail(`record ${ordinal} is not valid JSON`);
  }
  assertBoundedJson(parsed);
  const record = requirePlainObject(parsed, `record ${ordinal}`);
  requireExactKeys(record, TOP_LEVEL_KEYS, [], `record ${ordinal}`);
  if (record.schema !== PUBLISH_RECOVERY_SCHEMA || record.encoding !== PUBLISH_RECOVERY_ENCODING) {
    fail(`record ${ordinal} schema is unsupported`);
  }
  if (!RECOVERY_STATUSES.has(String(record.status || ""))) fail(`record ${ordinal} status is invalid`);
  const draftId = requireBoundedString(record.draftId, `record ${ordinal} draft id`, 32);
  if (!/^[0-9a-f]{32}$/.test(draftId)) fail(`record ${ordinal} draft id is invalid`);
  const network = requireNetwork(record.network, `record ${ordinal} network`);
  const account = requireAccount(record.account, `record ${ordinal} account`);
  const contract = record.contract === null ? null : requireContract(record.contract, `record ${ordinal} contract`);
  const tokenId = record.tokenId === null ? null : requireNatural(record.tokenId, `record ${ordinal} token id`);
  if ((contract === null) !== (tokenId === null)) fail(`record ${ordinal} contract/token identity is incomplete`);
  validateProduct(record.product);
  validateHistory(record.history, network, account);
  requireIsoTimestamp(record.createdAt, `record ${ordinal} creation time`);
  requireIsoTimestamp(record.updatedAt, `record ${ordinal} update time`);
  if (Date.parse(String(record.updatedAt)) < Date.parse(String(record.createdAt))) {
    fail(`record ${ordinal} timestamps are invalid`);
  }
  if (record.kit !== null) {
    const kit = validateOpenKit(record.kit, network);
    if (contract === null || tokenId === null || kit.contract !== contract || kit.tokenId !== tokenId) {
      fail(`record ${ordinal} open kit does not match its record identity`);
    }
  }

  const draftMatch = candidate.key.match(
    /^pasta\.ravioli\.publish-recovery-draft\.v1:([^:]+):([^:]+):([0-9a-f]{32})$/,
  );
  const packMatch = candidate.key.match(
    /^pasta\.ravioli\.publish-recovery\.v1:([^:]+):(KT1[1-9A-HJ-NP-Za-km-z]{33}):([0-9]+)$/,
  );
  if (draftMatch) {
    if (draftMatch[1] !== network || draftMatch[2] !== account || draftMatch[3] !== draftId) {
      fail(`record ${ordinal} draft key does not match its identity`);
    }
  } else if (packMatch) {
    if (
      contract === null
      || tokenId === null
      || packMatch[1] !== network
      || packMatch[2] !== contract
      || Number(packMatch[3]) !== tokenId
    ) {
      fail(`record ${ordinal} pack key does not match its identity`);
    }
  } else {
    fail(`record ${ordinal} storage key is invalid`);
  }
  return { key: candidate.key, bytes };
}

function rejectTraversal(input: string, label: string): string {
  if (typeof input !== "string" || !path.isAbsolute(input) || input.includes("\0")) {
    fail(`${label} must be an absolute path`);
  }
  const root = path.parse(input).root;
  const withoutRoot = input.slice(root.length);
  if (withoutRoot.split(/[\\/]/).some((segment) => segment === "." || segment === "..")) {
    fail(`${label} contains path traversal`);
  }
  const withoutTrailingSeparator = input.length > root.length ? input.replace(/[\\/]+$/, "") : input;
  if (path.normalize(withoutTrailingSeparator) !== withoutTrailingSeparator) {
    fail(`${label} is not normalized`);
  }
  return path.resolve(withoutTrailingSeparator);
}

async function requireExistingDirectory(input: string, label: string): Promise<string> {
  const resolved = rejectTraversal(input, label);
  const info = await lstat(resolved).catch(() => null);
  if (!info || !info.isDirectory() || info.isSymbolicLink()) {
    fail(`${label} must be an existing non-symlink directory`);
  }
  return realpath(resolved);
}

async function requirePrivateDirectory(input: string): Promise<DirectoryIdentity> {
  const resolved = rejectTraversal(input, "output directory");
  const root = path.parse(resolved).root;
  let current = root;
  for (const segment of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) fail("output directory path contains a non-directory");
    if (info.isSymbolicLink()) fail("output directory path contains a symbolic link");
    if (!info.isDirectory()) fail("output directory path contains a non-directory");
  }
  const canonical = await realpath(resolved);
  if (canonical !== resolved) fail("output directory path is not canonical");
  const info = await lstat(resolved);
  if ((info.mode & 0o077) !== 0) {
    fail("output directory must not grant group or world permissions");
  }
  return {
    path: canonical,
    device: BigInt(info.dev),
    inode: BigInt(info.ino),
  };
}

function pathIsWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

async function assertPrivateDirectoryUnchanged(identity: DirectoryIdentity): Promise<void> {
  const current = await requirePrivateDirectory(identity.path);
  if (current.device !== identity.device || current.inode !== identity.inode) {
    fail("output directory changed during capture");
  }
}

export async function validateRavioliPrivateRecoveryOutputDirectory(options: {
  privateOutputDirectory: string;
  publicProofRunRoot: string;
}): Promise<string> {
  const privateDirectory = await requirePrivateDirectory(options.privateOutputDirectory);
  const publicRoot = await requireExistingDirectory(options.publicProofRunRoot, "public proof root");
  if (pathIsWithin(publicRoot, privateDirectory.path)) {
    fail("output directory must be outside the public proof root");
  }
  if (pathIsWithin(privateDirectory.path, publicRoot)) {
    fail("output directory and public proof root must be disjoint");
  }
  return privateDirectory.path;
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function durableExclusiveWrite(filePath: string, bytes: Uint8Array): Promise<void> {
  const parent = path.dirname(filePath);
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    fail("snapshot write parent is not a real directory");
  }
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const written = await readFile(filePath);
  if (!written.equals(Buffer.from(bytes))) fail("snapshot byte verification failed");
}

async function readBrowserRecords(page: Page): Promise<BrowserRecoveryRecord[]> {
  const records = await page.evaluate(({ draftPrefix, packPrefix }) => {
    const matches: Array<{ key: string; value: string }> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || (!key.startsWith(draftPrefix) && !key.startsWith(packPrefix))) continue;
      const value = localStorage.getItem(key);
      if (value !== null) matches.push({ key, value });
    }
    return matches;
  }, {
    draftPrefix: DRAFT_KEY_PREFIX,
    packPrefix: PACK_KEY_PREFIX,
  });
  if (!Array.isArray(records)) fail("page publish-recovery inventory is malformed");
  if (records.length > RAVIOLI_PRIVATE_RECOVERY_MAX_RECORDS) {
    fail("page has too many publish-recovery records");
  }
  return records
    .map((record, index) => {
      if (
        record === null
        || typeof record !== "object"
        || typeof record.key !== "string"
        || typeof record.value !== "string"
      ) {
        fail(`browser record ${index} is malformed`);
      }
      return record;
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

export async function countRavioliPrivateRecoveryRecords(page: Page): Promise<number> {
  if (!page || typeof page.evaluate !== "function") fail("requires a Playwright page");
  return (await readBrowserRecords(page)).length;
}

async function captureBrowserRecords(page: Page): Promise<BrowserRecoveryRecord[]> {
  const records = await readBrowserRecords(page);
  if (records.length < 1) fail("page has no publish-recovery records");
  return records;
}

/**
 * Capture exact Ravioli Studio publish-recovery localStorage bytes before an
 * ephemeral Playwright page is closed. The returned digest authenticates the
 * private manifest; the manifest binds every exact record byte stream.
 */
export async function captureRavioliPrivateRecovery(
  options: CaptureRavioliPrivateRecoveryOptions,
): Promise<RavioliPrivateRecoveryCapture> {
  if (!options.page || typeof options.page.evaluate !== "function") fail("requires a Playwright page");
  const canonicalPrivateDirectory = await validateRavioliPrivateRecoveryOutputDirectory(options);
  const privateDirectory = await requirePrivateDirectory(canonicalPrivateDirectory);

  const browserRecords = await captureBrowserRecords(options.page);
  const records = browserRecords.map((record, index) => parseRecoveryRecord(record, index));
  const totalBytes = records.reduce((sum, record) => sum + record.bytes.byteLength, 0);
  if (totalBytes > RAVIOLI_PRIVATE_RECOVERY_MAX_TOTAL_BYTES) {
    fail("records exceed the aggregate byte limit");
  }
  if (new Set(records.map((record) => record.key)).size !== records.length) {
    fail("page returned duplicate publish-recovery keys");
  }

  await assertPrivateDirectoryUnchanged(privateDirectory);
  const temporaryDirectory = await mkdtemp(path.join(privateDirectory.path, ".ravioli-private-recovery-"));
  let committed = false;
  try {
    await chmod(temporaryDirectory, 0o700);
    const recordsDirectory = path.join(temporaryDirectory, "records");
    await mkdir(recordsDirectory, { mode: 0o700 });
    const manifestRecords: PrivateRecoveryManifestRecord[] = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const file = `records/${String(index + 1).padStart(4, "0")}.json`;
      await durableExclusiveWrite(path.join(temporaryDirectory, ...file.split("/")), record.bytes);
      manifestRecords.push({
        storageKey: record.key,
        file,
        byteLength: record.bytes.byteLength,
        sha256: sha256(record.bytes),
      });
    }
    const manifestBytes = Buffer.from(`${JSON.stringify({
      schema: PRIVATE_SNAPSHOT_SCHEMA,
      capturedAt: new Date().toISOString(),
      records: manifestRecords,
    }, null, 2)}\n`, "utf8");
    await durableExclusiveWrite(path.join(temporaryDirectory, "manifest.json"), manifestBytes);
    await syncDirectory(recordsDirectory);
    await syncDirectory(temporaryDirectory);
    await assertPrivateDirectoryUnchanged(privateDirectory);

    const suffix = randomBytes(12).toString("hex");
    const finalDirectory = path.join(privateDirectory.path, `ravioli-private-recovery-${suffix}`);
    await rename(temporaryDirectory, finalDirectory);
    committed = true;
    await syncDirectory(privateDirectory.path);
    const finalInfo = await lstat(finalDirectory);
    if (!finalInfo.isDirectory() || finalInfo.isSymbolicLink()) {
      fail("committed snapshot is not a real directory");
    }
    return {
      path: finalDirectory,
      sha256: sha256(manifestBytes),
      count: records.length,
    };
  } finally {
    if (!committed) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
