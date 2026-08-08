/* Ravioli Studio — Pasta Protocol atomic pack publisher.
 *
 * Ravioli never treats a manifest as delivery. Every wrapper recipe is committed and fully funded
 * before issuance. Opening invokes escrow transfers and/or typed Gnocchi/Rotini adapters in one Tezos
 * operation; any failed child operation reverts the entire tree and preserves the wrapper.
 */
import {
  buildBundleManifest,
  buildCollectionMetadata,
  buildTokenMetadata,
  isCheasePackage,
  sanitizeRelationshipMetadata,
  validateCheasePackage,
} from "./pasta-foundation.js";

const ARTIFACTS = {
  router: "contract/pasta-bundle.contract.json",
  blindController: "contract/pasta-blind-pack-controller.contract.json",
  deploymentCertificate: "contract/pasta-ravioli-deployment-certificate.json",
  gnocchiAdapter: "contract/pasta-gnocchi-pack-adapter.contract.json",
  rotiniAdapter: "contract/pasta-rotini-pack-adapter.contract.json",
  gnocchiTarget: "../gnocchi/contract/pasta-open-edition.contract.json",
  rotiniTarget: "../rotini/contract/pasta-generative-collection.contract.json",
};
const OPEN_KIT_SCHEMA = "pasta-ravioli-open-kit@3";
const PUBLIC_REVEAL_SCHEMA = "pasta-ravioli-public-reveal@1";
const SEALED_REVEAL_SCHEMA = "pasta-ravioli-sealed-reveal@1";
const SEALED_REVEAL_REFERENCE_SCHEMA = "pasta-ravioli-sealed-reveal-reference@1";
const SEALED_REVEAL_CIPHER = "AES-256-GCM";
const SEALED_REVEAL_KDF = "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)";
const PUBLISH_RECOVERY_SCHEMA = "pasta-ravioli-publish-recovery@1";
const PUBLISH_RECOVERY_ENCODING = "pasta-recovery-canonical@1";
const PACK_MANIFEST_SCHEMA = "wtfos.pasta.pack-manifest.v2";
const MAX_ADAPTER_PAYLOAD_BYTES = 4096;
const MAX_TOTAL_ADAPTER_PAYLOAD_BYTES = 24576;
const MAX_SEALED_REVEAL_BYTES = 2_000_000;
const MAX_RECOVERY_CANONICAL_NODES = 20_000;
const MAX_RECOVERY_CANONICAL_DEPTH = 64;
const MAX_RECOVERY_MAP_ENTRIES = 4_096;
const MAX_RECOVERY_CANONICAL_BYTES = 1_048_576;
const MAX_RECOVERY_RECORD_BYTES = 4_000_000;
const MAX_MICHELSON_IDENTITY_NODES = 50_000;
const MAX_MICHELSON_IDENTITY_DEPTH = 96;
const MAX_MICHELSON_IDENTITY_BYTES = 2_000_000;
const DEPLOYMENT_CERTIFICATE_SCHEMA = "pasta-ravioli-deployment-certificate@2";
const MAX_OPERATION_DATA_LENGTH = 32_768;
const MIN_ROUTER_ORIGINATION_HEADROOM_BYTES = 1_024;
const MODE_NAMES = [
  "deterministic_vault",
  "blind_funded_pool",
  "blind_allocated_mint",
  "blind_generative_mint",
  "hybrid_atomic_pack",
];
const MD = window.MD;
const TZ = window.TZ;
const $ = (id) => document.getElementById(id);
const state = {
  network: "shadownet",
  members: [],
  currentPublishRecoveryKey: "",
  discardRecoveryArmedKey: "",
  discardRecoveryArmedValue: "",
};
const bundledCodeHashPromises = new Map();
const verifiedContractCodeIdentities = new Set();
const artifactLoadPromises = new Map();

function log(message, kind) {
  const el = $("log");
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  el.textContent += (el.textContent ? "\n" : "") + (kind === "err" ? "✗ " : "") + line;
  el.scrollTop = el.scrollHeight;
}

function bigToNum(value) {
  if (value == null) return 0;
  return typeof value === "object" && typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

function optionValue(value) {
  if (value == null) return null;
  if (typeof value === "object" && "Some" in value) return value.Some;
  if (typeof value === "object" && "None" in value) return null;
  return value;
}

function optionalDateTime(id, label) {
  const raw = $(id).value.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is invalid`);
  return parsed.toISOString();
}

function validateProductWindow(input) {
  const {
    mode,
    editions,
    saleCount,
    saleEnabled,
    saleStart,
    saleEnd,
    revealDeadline,
    openDeadline,
    earliestChildEnd,
  } = input;
  if (saleStart && saleEnd && Date.parse(saleStart) > Date.parse(saleEnd)) {
    throw new Error("Ravioli sale start must not be after its sale end");
  }
  if (mode === 0) {
    if (revealDeadline || openDeadline) {
      throw new Error("Deterministic vaults do not use blind reveal or delivery deadlines");
    }
    if (saleEnabled && saleCount > editions) throw new Error("sale quantity exceeds wrapper supply");
    return { wrapperEditionClass: saleEnabled && saleEnd ? "limited-edition" : "fixed-supply" };
  }
  if (!saleEnabled) throw new Error("Every blind Ravioli pack requires a direct primary sale");
  if (saleCount !== editions) throw new Error("Blind Ravioli sale quantity must equal its complete finite wrapper supply");
  if (!saleEnd) throw new Error("Blind Ravioli packs require a finite primary sale end");
  if (!revealDeadline) throw new Error("Blind Ravioli packs require a reveal deadline");
  if (!openDeadline) throw new Error("Blind Ravioli packs require a delivery / refund cutoff");
  const now = Date.now();
  const saleEndMs = Date.parse(saleEnd);
  const revealMs = Date.parse(revealDeadline);
  const openMs = Date.parse(openDeadline);
  if (saleEndMs <= now) throw new Error("Ravioli primary sale end must be in the future");
  if (revealMs <= saleEndMs) throw new Error("Ravioli reveal deadline must be after its primary sale end");
  if (openMs <= revealMs) throw new Error("Ravioli delivery / refund cutoff must be after its reveal deadline");
  if (earliestChildEnd && revealMs > Date.parse(earliestChildEnd)) {
    throw new Error("Ravioli reveal deadline cannot outlive its earliest LE child public mint window");
  }
  return { wrapperEditionClass: "limited-edition" };
}

async function typedBigMapGet(map, key) {
  if (!map || typeof map.get !== "function") return undefined;
  try {
    const direct = await map.get(String(key));
    if (direct !== undefined) return direct;
  } catch {
    // Taquito versions disagree on whether nat BigMap keys are strings or numbers.
  }
  return map.get(key);
}

async function currentChainTimestampMs(label = "Tezos head timestamp") {
  const header = await MD.getToolkit().rpc.getBlockHeader();
  const value = Date.parse(String(header?.timestamp || ""));
  if (!Number.isFinite(value)) throw new Error(`${label} is unavailable`);
  return value;
}

function requiredKt1(value, label) {
  const address = String(value || "").trim();
  if (!MD.isAddress(address) || !address.startsWith("KT1")) throw new Error(`${label} needs a valid KT1 contract`);
  return address;
}

function requiredNat(value, label) {
  if (value == null || typeof value === "boolean") throw new Error(`${label} must be a non-negative safe integer`);
  if (typeof value === "string" && !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  const number = bigToNum(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return number;
}

function requireExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function optionalPositiveNat(value, label) {
  const unwrapped = optionValue(value);
  if (unwrapped == null) return null;
  const number = bigToNum(unwrapped);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} is malformed`);
  return number;
}

function optionalTimestamp(value, label) {
  const unwrapped = optionValue(value);
  if (unwrapped == null) return null;
  const millis = Date.parse(String(unwrapped));
  if (!Number.isFinite(millis)) throw new Error(`${label} is malformed`);
  return new Date(millis).toISOString();
}

function entrypointNames(contract) {
  const schemas = contract?.entrypoints?.entrypoints;
  return schemas && typeof schemas === "object" && !Array.isArray(schemas) ? Object.keys(schemas) : [];
}

function requireAdapterEntrypoints(contract, label) {
  const names = new Set(entrypointNames(contract));
  for (const required of ["reserve", "fulfill", "release"]) {
    if (!names.has(required)) throw new Error(`${label} is not a supported Pasta adapter (missing ${required})`);
  }
}

function requireContractEntrypoints(contract, requiredNames, label) {
  const names = new Set(entrypointNames(contract));
  for (const required of requiredNames) {
    if (!names.has(required)) throw new Error(`${label} is missing ${required}`);
  }
}

function requireControllerViews(contract, label) {
  for (const required of ["get_pack_status", "get_claim_count", "get_last_claim", "get_claim_serial", "quote_refund", "get_refund_credit"]) {
    if (typeof contract?.contractViews?.[required] !== "function") {
      throw new Error(`${label} is missing the ${required} on-chain view`);
    }
  }
}

function michelineHasAnnotation(value, annotation, seen = new Set(), budget = { nodes: 0 }) {
  if (value == null || typeof value !== "object") return false;
  budget.nodes += 1;
  if (budget.nodes > 10_000 || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => michelineHasAnnotation(entry, annotation, seen, budget));
  if (Array.isArray(value.annots) && value.annots.includes(annotation)) return true;
  return Object.values(value).some((entry) => michelineHasAnnotation(entry, annotation, seen, budget));
}

function requiredScriptCodeHash(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} returned an invalid script-code hash`);
  }
  return value;
}

function canonicalJsonValue(value, label, context = { nodes: 0, ancestors: new Set() }, depth = 0) {
  context.nodes += 1;
  if (
    context.nodes > MAX_MICHELSON_IDENTITY_NODES
    || depth > MAX_MICHELSON_IDENTITY_DEPTH
  ) {
    throw new Error(`${label} exceeds the canonical JSON complexity limit`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return undefined;
  }
  if (!value || typeof value !== "object") throw new Error(`${label} is not JSON serializable`);
  if (context.ancestors.has(value)) throw new Error(`${label} contains a cycle`);
  context.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((child, index) => {
        const canonical = canonicalJsonValue(child, `${label}[${index}]`, context, depth + 1);
        return canonical === undefined ? null : canonical;
      });
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-plain object`);
    }
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new Error(`${label}.${key} is not a data property`);
      const canonical = canonicalJsonValue(descriptor.value, `${label}.${key}`, context, depth + 1);
      if (canonical !== undefined) result[key] = canonical;
    }
    return result;
  } finally {
    context.ancestors.delete(value);
  }
}

function canonicalJsonText(value, label) {
  const canonical = canonicalJsonValue(value, label);
  if (canonical === undefined) throw new Error(`${label} is not JSON serializable`);
  return JSON.stringify(canonical);
}

async function sha256Json(value, label) {
  const json = canonicalJsonText(value, label);
  const bytes = new TextEncoder().encode(json);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return hexFromBytes(digest);
}

function canonicalRecoveryValue(value, label, context = { nodes: 0, ancestors: new Set() }, depth = 0) {
  context.nodes += 1;
  if (context.nodes > MAX_RECOVERY_CANONICAL_NODES) throw new Error(`${label} exceeds the recovery journal node limit`);
  if (depth > MAX_RECOVERY_CANONICAL_DEPTH) throw new Error(`${label} exceeds the recovery journal depth limit`);
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} contains a non-safe integer`);
    return value;
  }
  if (typeof value === "bigint") return { __pastaRecoveryType: "bigint", value: value.toString() };
  if (typeof value !== "object") throw new Error(`${label} contains an unsupported value`);
  if (context.ancestors.has(value)) throw new Error(`${label} contains a cycle`);
  context.ancestors.add(value);
  try {
    if (value instanceof Uint8Array) {
      return { __pastaRecoveryType: "bytes", value: hexFromBytes(value) };
    }
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new Error(`${label} contains an invalid date`);
      return { __pastaRecoveryType: "date", value: value.toISOString() };
    }
    if (value instanceof TZ.MichelsonMap) {
      const entries = [...value.entries()];
      if (entries.length > MAX_RECOVERY_MAP_ENTRIES) throw new Error(`${label} exceeds the recovery journal map-entry limit`);
      const canonicalEntries = entries.map(([key, child], index) => [
        canonicalRecoveryValue(key, `${label} map key ${index}`, context, depth + 1),
        canonicalRecoveryValue(child, `${label} map value ${index}`, context, depth + 1),
      ]);
      canonicalEntries.sort((left, right) => JSON.stringify(left[0]).localeCompare(JSON.stringify(right[0])));
      return { __pastaRecoveryType: "MichelsonMap", entries: canonicalEntries };
    }
    const prototype = Object.getPrototypeOf(value);
    const constructor = Object.getOwnPropertyDescriptor(prototype || {}, "constructor")?.value;
    if (typeof constructor?.isBigNumber === "function" && constructor.isBigNumber(value)) {
      if (typeof value.isFinite !== "function" || typeof value.isInteger !== "function" || !value.isFinite() || !value.isInteger()) {
        throw new Error(`${label} contains a non-integer BigNumber`);
      }
      const decimal = value.toFixed(0);
      if (!/^-?(?:0|[1-9][0-9]*)$/.test(decimal)) throw new Error(`${label} contains an invalid BigNumber`);
      return { __pastaRecoveryType: "BigNumber", value: decimal };
    }
    if (Array.isArray(value)) {
      return value.map((child, index) => canonicalRecoveryValue(child, `${label}[${index}]`, context, depth + 1));
    }
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} contains an unsupported object`);
    const result = {};
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) throw new Error(`${label} contains a symbol property`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of ownKeys.sort()) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor)) throw new Error(`${label}.${key} is an accessor`);
      if (!descriptor.enumerable) throw new Error(`${label}.${key} is not enumerable`);
      result[key] = canonicalRecoveryValue(descriptor.value, `${label}.${key}`, context, depth + 1);
    }
    return result;
  } finally {
    context.ancestors.delete(value);
  }
}

function boundedRecoveryCanonical(value, label) {
  const canonical = canonicalRecoveryValue(value, label);
  const json = JSON.stringify(canonical);
  if (new TextEncoder().encode(json).byteLength > MAX_RECOVERY_CANONICAL_BYTES) {
    throw new Error(`${label} exceeds the recovery journal byte limit`);
  }
  return canonical;
}

async function onChainScriptCodeHash(contractAddress) {
  const rpc = MD.getToolkit()?.rpc;
  if (!rpc) throw new Error("Tezos RPC is unavailable for Ravioli router identity verification");
  if (typeof rpc.getScriptCodeHash === "function") {
    return requiredScriptCodeHash(
      await rpc.getScriptCodeHash(contractAddress),
      "Ravioli proof bridge",
    );
  }
  if (typeof rpc.getScript !== "function") {
    throw new Error("Tezos RPC cannot read Ravioli router code");
  }
  const script = await rpc.getScript(contractAddress);
  if (!script || !Array.isArray(script.code) || script.code.length === 0) {
    throw new Error("Tezos RPC returned malformed Ravioli router code");
  }
  return requiredScriptCodeHash(
    await michelsonScriptCodeHash(script.code, "on-chain Ravioli router code"),
    "Tezos RPC",
  );
}

function canonicalMichelsonValue(
  value,
  label,
  context = { nodes: 0, ancestors: new Set() },
  depth = 0,
) {
  context.nodes += 1;
  if (context.nodes > MAX_MICHELSON_IDENTITY_NODES) {
    throw new Error(`${label} exceeds the Michelson identity node limit`);
  }
  if (depth > MAX_MICHELSON_IDENTITY_DEPTH) {
    throw new Error(`${label} exceeds the Michelson identity depth limit`);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number`);
    }
    return value;
  }
  if (!value || typeof value !== "object") {
    throw new Error(`${label} contains an unsupported Michelson value`);
  }
  if (context.ancestors.has(value)) {
    throw new Error(`${label} contains a cycle`);
  }
  context.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        canonicalMichelsonValue(entry, `${label}[${index}]`, context, depth + 1)
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-plain Michelson object`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new Error(`${label} contains a symbol property`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = {};
    for (const key of keys.sort()) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(`${label}.${key} is not a plain enumerable value`);
      }
      result[key] = canonicalMichelsonValue(
        descriptor.value,
        `${label}.${key}`,
        context,
        depth + 1,
      );
    }
    return result;
  } finally {
    context.ancestors.delete(value);
  }
}

function canonicalMichelsonScriptCode(code, label) {
  if (!Array.isArray(code) || code.length < 3) throw new Error(`${label} must be a complete Michelson script`);
  const context = { nodes: 0, ancestors: new Set() };
  const sections = code.map((section, index) => {
    if (!section || typeof section !== "object" || Array.isArray(section) || typeof section.prim !== "string") {
      throw new Error(`${label} section ${index} is malformed`);
    }
    let key = section.prim;
    if (section.prim === "view") {
      const viewName = section.args?.[0]?.string;
      if (typeof viewName !== "string" || !viewName) throw new Error(`${label} view ${index} has no name`);
      key = `view:${viewName}`;
    } else if (!["parameter", "storage", "code"].includes(section.prim)) {
      throw new Error(`${label} contains unsupported section ${section.prim}`);
    }
    return {
      key,
      value: canonicalMichelsonValue(
        section,
        `${label} section ${index}`,
        context,
      ),
    };
  });
  const keys = sections.map((section) => section.key);
  for (const required of ["parameter", "storage", "code"]) {
    if (keys.filter((key) => key === required).length !== 1) throw new Error(`${label} must contain exactly one ${required} section`);
  }
  if (new Set(keys).size !== keys.length) throw new Error(`${label} contains duplicate sections or view names`);
  return sections.sort((left, right) => left.key.localeCompare(right.key)).map((section) => section.value);
}

async function michelsonScriptCodeHash(code, label) {
  const canonical = canonicalMichelsonScriptCode(code, label);
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  if (bytes.byteLength > MAX_MICHELSON_IDENTITY_BYTES) {
    throw new Error(`${label} exceeds the Michelson identity byte limit`);
  }
  return sha256Bytes(bytes);
}

function bundledArtifactCodeHash(artifactName, label) {
  let pending = bundledCodeHashPromises.get(artifactName);
  if (!pending) {
    pending = loadArtifact(artifactName).then((code) => michelsonScriptCodeHash(code, `bundled ${label} code`));
    bundledCodeHashPromises.set(artifactName, pending);
  }
  return pending;
}

async function requireExactBundledContractCode(contractAddress, artifactName, label, replacementName) {
  const identityKey = `${state.network}:${artifactName}:${contractAddress}`;
  if (verifiedContractCodeIdentities.has(identityKey)) return;
  const [bundledCodeHash, deployedCodeHash] = await Promise.all([
    bundledArtifactCodeHash(artifactName, label),
    onChainScriptCodeHash(contractAddress),
  ]);
  if (deployedCodeHash !== bundledCodeHash) {
    throw new Error(`${label} code does not match the bundled production artifact. Originate a new ${replacementName}.`);
  }
  verifiedContractCodeIdentities.add(identityKey);
}

async function inspectExistingRavioliRouter(address, options = {}) {
  const contractAddress = requiredKt1(address, "Ravioli router");
  await requireExactBundledContractCode(contractAddress, "router", "Ravioli router", "router");
  const contract = await MD.getToolkit().contract.at(contractAddress);
  const schemas = contract?.entrypoints?.entrypoints;
  const createPackSchema = schemas?.create_pack;
  if (!createPackSchema) throw new Error("Ravioli router is missing create_pack");
  if (!michelineHasAnnotation(createPackSchema, "%child_expiry")) {
    throw new Error("This router predates Ravioli LE safety (%child_expiry). Originate a new router.");
  }
  if (!michelineHasAnnotation(createPackSchema, "%wrapper_sale_end")) {
    throw new Error("This router predates atomic Ravioli LE issuance (%wrapper_sale_end). Originate a new router.");
  }
  if (!michelineHasAnnotation(createPackSchema, "%expected_token_id")) {
    throw new Error("This router predates concurrent token-id protection (%expected_token_id). Originate a new router.");
  }
  if (!michelineHasAnnotation(createPackSchema, "%manifest_uri")) {
    throw new Error("This router predates immutable pack-manifest identity (%manifest_uri). Originate a new router.");
  }
  if (!michelineHasAnnotation(createPackSchema, "%reveal_deadline")) {
    throw new Error("This router predates Ravioli v3 reveal deadlines (%reveal_deadline). Originate a new router.");
  }
  if (!michelineHasAnnotation(createPackSchema, "%open_deadline")) {
    throw new Error("This router predates Ravioli v3 delivery/refund cutoffs (%open_deadline). Originate a new router.");
  }
  requireContractEntrypoints(contract, [
    "commit_recipe",
    "finalize_pack",
    "finalize_blind_pack",
    "mint",
    "set_sale",
    "open_pack",
    "set_pack_contents",
    "refund_blind_claims",
    "cancel_unrevealed_pack",
    "recover_asset",
    "recover_adapter",
  ], "Ravioli router");
  const storage = await contract.storage();
  const administrator = String(storage.administrator || "");
  if (!MD.isAddress(administrator)) throw new Error("Ravioli router returned an invalid administrator");
  if (options.requireAdministrator !== false && administrator !== MD.getAccount()) {
    throw new Error(`Connected wallet does not administer this Ravioli router (${administrator})`);
  }
  const controllerAddress = requiredKt1(storage.blind_controller, "Ravioli bound blind controller");
  await requireExactBundledContractCode(
    controllerAddress,
    "blindController",
    "Ravioli blind controller",
    "router/controller pair",
  );
  const controller = await MD.getToolkit().contract.at(controllerAddress);
  requireContractEntrypoints(controller, [
    "register_pack",
    "assign_claims",
    "move_claim_batch",
    "reveal",
    "consume_claim",
    "refund_claims",
    "withdraw_refund",
    "cancel_unrevealed",
  ], "Ravioli blind controller");
  requireControllerViews(controller, "Ravioli blind controller");
  const tokenId = requiredNat(storage.next_token_id, "Ravioli next token id");
  return { address: contractAddress, contract, controllerAddress, controller, tokenId };
}

async function readChildEditionPolicy(contractAddress, tokenId, source = "escrow", required = false, requiredCapacity = 0) {
  const normalizedTokenId = requiredNat(tokenId, `${source} child token id`);
  if (!MD.isAddress(contractAddress) || !contractAddress.startsWith("KT1")) {
    throw new Error(`child token ${normalizedTokenId} needs a valid KT1 contract`);
  }
  if (required) await requireExactBundledContractCode(contractAddress, "gnocchiTarget", "Gnocchi allocation target", "Gnocchi contract");
  const contract = await MD.getToolkit().contract.at(contractAddress);
  const storage = await contract.storage();
  if (!storage.sales || typeof storage.sales.get !== "function") {
    if (required) throw new Error(`${source} child target is not a supported Pasta edition contract`);
    return { source, contract: contractAddress, tokenId: normalizedTokenId, maxSupply: null, end: null, active: null, locked: null };
  }
  const sale = await typedBigMapGet(storage.sales, normalizedTokenId);
  if (!sale) {
    if (required) throw new Error(`${source} child token ${normalizedTokenId} does not expose a Pasta edition policy`);
    return { source, contract: contractAddress, tokenId: normalizedTokenId, maxSupply: null, end: null, active: null, locked: null };
  }
  if (typeof sale.active !== "boolean") throw new Error(`${source} child token ${normalizedTokenId} has a malformed active policy`);
  const maxSupply = optionalPositiveNat(sale.max_supply, `${source} child max supply`);
  const start = optionalTimestamp(sale.start, `${source} child start`);
  const end = optionalTimestamp(sale.end, `${source} child end`);
  let locked = null;
  if (storage.policy_locked && typeof storage.policy_locked.get === "function") {
    const rawLocked = await typedBigMapGet(storage.policy_locked, normalizedTokenId);
    if (rawLocked !== undefined && typeof rawLocked !== "boolean") {
      throw new Error(`${source} child token ${normalizedTokenId} has a malformed policy lock`);
    }
    locked = rawLocked === true;
  }
  let issued = 0;
  let reserved = 0;
  if (required) {
    if (!storage.total_minted || typeof storage.total_minted.get !== "function" || !storage.total_reserved || typeof storage.total_reserved.get !== "function") {
      throw new Error(`${source} child target does not expose Pasta issued/reserved capacity`);
    }
    issued = requiredNat((await typedBigMapGet(storage.total_minted, normalizedTokenId)) ?? 0, `${source} child issued supply`);
    reserved = requiredNat((await typedBigMapGet(storage.total_reserved, normalizedTokenId)) ?? 0, `${source} child reserved supply`);
  }
  const policy = {
    source,
    contract: contractAddress,
    tokenId: normalizedTokenId,
    maxSupply,
    start,
    end,
    active: sale.active,
    locked,
    issued,
    reserved,
    requiredCapacity,
  };
  if (required) {
    const now = Date.now();
    if (policy.active !== true) throw new Error(`Allocated Pasta child ${normalizedTokenId} is inactive`);
    if (policy.locked !== true) throw new Error(`Allocated Pasta child ${normalizedTokenId} must have a locked edition policy`);
    if (start && Date.parse(start) > now) throw new Error(`Allocated Pasta child ${normalizedTokenId} has not started`);
    if (end && Date.parse(end) < now) throw new Error(`Allocated Pasta child ${normalizedTokenId} mint window has expired`);
    if (maxSupply != null && issued + reserved + requiredCapacity > maxSupply) {
      throw new Error(`Allocated Pasta child ${normalizedTokenId} lacks ${requiredCapacity} units of remaining capacity`);
    }
  }
  return policy;
}

async function allocationTarget(action) {
  if ($("autoAdapters").checked) {
    return {
      contract: requiredKt1($("gTargetKt").value, "Gnocchi allocation target"),
      tokenId: requiredNat($("gTokenId").value, "Gnocchi allocation token id"),
      amountPerOpen: requiredNat(action.amount, "Gnocchi allocation amount per open"),
    };
  }
  const adapterAddress = requiredKt1(action.adapter, "manual Gnocchi allocation adapter");
  await requireExactBundledContractCode(adapterAddress, "gnocchiAdapter", "Gnocchi adapter", "adapter");
  const adapter = await MD.getToolkit().contract.at(adapterAddress);
  const storage = await adapter.storage();
  if (!storage.allocations || typeof storage.allocations.get !== "function") {
    throw new Error("manual Gnocchi adapter does not expose supported allocations");
  }
  const allocation = await typedBigMapGet(storage.allocations, action.resourceId);
  if (!allocation) throw new Error(`Gnocchi allocation resource ${action.resourceId} does not exist`);
  if (allocation.active !== true) throw new Error(`Gnocchi allocation resource ${action.resourceId} is inactive`);
  requireAdapterEntrypoints(adapter, "manual Gnocchi adapter");
  return {
    contract: requiredKt1(allocation.target, "Gnocchi allocation target"),
    tokenId: requiredNat(allocation.token_id, "Gnocchi allocation token id"),
    amountPerOpen: requiredNat(allocation.amount_per_open, "Gnocchi allocation amount per open"),
  };
}

async function generativeTarget(action) {
  if ($("autoAdapters").checked) {
    return {
      contract: requiredKt1($("rTargetKt").value, "Rotini generative target"),
      projectId: requiredNat($("rProjectId").value, "Rotini project id"),
    };
  }
  const adapterAddress = requiredKt1(action.adapter, "manual Rotini adapter");
  await requireExactBundledContractCode(adapterAddress, "rotiniAdapter", "Rotini adapter", "adapter");
  const adapter = await MD.getToolkit().contract.at(adapterAddress);
  const storage = await adapter.storage();
  if (!storage.resources || typeof storage.resources.get !== "function") {
    throw new Error("manual Rotini adapter does not expose supported resources");
  }
  const resourceId = requiredNat(action.resourceId, "Rotini resource id");
  const resource = await typedBigMapGet(storage.resources, resourceId);
  if (!resource) throw new Error(`Rotini resource ${action.resourceId} does not exist`);
  if (resource.active !== true) throw new Error(`Rotini resource ${action.resourceId} is inactive`);
  requireAdapterEntrypoints(adapter, "manual Rotini adapter");
  return {
    contract: requiredKt1(resource.target, "Rotini resource target"),
    projectId: requiredNat(resource.project_id, "Rotini resource project id"),
  };
}

async function readGenerativeEditionPolicy(contractAddress, projectId, requiredCapacity = 0) {
  const targetAddress = requiredKt1(contractAddress, "Rotini generative target");
  const normalizedProjectId = requiredNat(projectId, "Rotini project id");
  await requireExactBundledContractCode(targetAddress, "rotiniTarget", "Rotini generative target", "Rotini contract");
  const contract = await MD.getToolkit().contract.at(targetAddress);
  const mintPackIterationSchema = contract?.entrypoints?.entrypoints?.mint_pack_iteration;
  if (!mintPackIterationSchema || !michelineHasAnnotation(mintPackIterationSchema, "%action_index")) {
    throw new Error("Rotini target predates distinct Ravioli action-index seeds; deploy the current Rotini contract");
  }
  const storage = await contract.storage();
  if (!storage.projects || typeof storage.projects.get !== "function") {
    throw new Error("Rotini target does not expose a supported projects map");
  }
  const project = await typedBigMapGet(storage.projects, normalizedProjectId);
  if (!project || typeof project !== "object") throw new Error(`Rotini project ${normalizedProjectId} does not exist`);
  if (typeof project.active !== "boolean") throw new Error(`Rotini project ${normalizedProjectId} has a malformed active policy`);
  if (project.active !== true) throw new Error(`Rotini project ${normalizedProjectId} is inactive`);
  if (!("max_supply" in project)) throw new Error(`Rotini project ${normalizedProjectId} has an unsupported supply policy`);
  const maxSupply = optionalPositiveNat(project.max_supply, `Rotini project ${normalizedProjectId} max supply`);
  const priceMutez = requiredNat(project.price, `Rotini project ${normalizedProjectId} price`);
  const minted = requiredNat(project.minted, `Rotini project ${normalizedProjectId} minted supply`);
  const reserved = requiredNat(project.reserved, `Rotini project ${normalizedProjectId} reserved supply`);
  if (priceMutez !== 0) throw new Error(`Rotini project ${normalizedProjectId} must be free before Ravioli can reserve it`);
  if (maxSupply != null && minted + reserved + requiredCapacity > maxSupply) {
    throw new Error(`Rotini project ${normalizedProjectId} lacks ${requiredCapacity} units of remaining capacity`);
  }
  const policy = {
    source: "generative",
    contract: targetAddress,
    projectId: normalizedProjectId,
    maxSupply,
    start: null,
    end: null,
    active: project.active,
    locked: null,
    priceMutez,
    issued: minted,
    reserved,
    requiredCapacity,
  };
  return policy;
}

async function resolveChildEditionPolicies(recipes, input) {
  const references = new Map();
  for (const action of recipes.flat()) {
    if (action.kind === "allocated") {
      const target = await allocationTarget(action);
      const key = `edition:${target.contract}:${target.tokenId}`;
      const previous = references.get(key);
      references.set(key, {
        kind: "edition", source: "allocated", ...target, required: true,
        requiredCapacity: (previous?.requiredCapacity || 0) + target.amountPerOpen,
      });
    } else if (action.kind === "generative") {
      const target = await generativeTarget(action);
      const key = `generative:${target.contract}:${target.projectId}`;
      const previous = references.get(key);
      references.set(key, { kind: "generative", ...target, requiredCapacity: (previous?.requiredCapacity || 0) + 1 });
    }
  }
  const childPolicies = await Promise.all([...references.values()].map((reference) => (
    reference.kind === "generative"
      ? readGenerativeEditionPolicy(reference.contract, reference.projectId, reference.requiredCapacity)
      : readChildEditionPolicy(reference.contract, reference.tokenId, reference.source, reference.required, reference.requiredCapacity)
  )));
  const limited = childPolicies.filter((policy) => policy.maxSupply != null && policy.end != null);
  if (input.wrapperSaleStart && input.wrapperSaleEnd && Date.parse(input.wrapperSaleStart) > Date.parse(input.wrapperSaleEnd)) {
    throw new Error("Ravioli sale start must not be after its sale end");
  }
  if (!limited.length) {
    return {
      requiresLimitedWrapper: false,
      earliestChildEnd: null,
      childExpiry: null,
      childPolicies,
    };
  }
  const earliestChildEndMs = Math.min(...limited.map((policy) => Date.parse(policy.end)));
  if (earliestChildEndMs <= Date.now()) throw new Error("LE child mint window has already expired");
  if (!input.wrapperSaleEnabled) throw new Error("LE child requires a direct Ravioli sale");
  if (!input.wrapperSaleEnd) throw new Error("LE child requires a finite Ravioli sale end");
  const wrapperEndMs = Date.parse(input.wrapperSaleEnd);
  if (wrapperEndMs <= Date.now()) throw new Error("Ravioli LE sale end must be in the future");
  if (wrapperEndMs >= earliestChildEndMs) {
    throw new Error("Ravioli primary sale must end before its earliest LE child public mint expiry");
  }
  const earliestChildEnd = new Date(earliestChildEndMs).toISOString();
  return {
    requiresLimitedWrapper: true,
    earliestChildEnd,
    childExpiry: earliestChildEnd,
    childPolicies,
  };
}

function targetMode() {
  return document.querySelector('input[name="target"]:checked')?.value || "new_collection";
}

function pinProvider() {
  return MD.pinProviderFromForm();
}

async function trackedPublishPinJson(provider, value, fileName, stage) {
  const canonicalValue = canonicalJsonValue(value, `${stage} JSON`);
  const valueSha256 = await sha256Json(canonicalValue, `${stage} JSON`);
  persistPublishRecovery(null, `${stage}:PREPARED`, null, "IN_PROGRESS", { fileName, valueSha256 });
  const uri = `ipfs://${await MD.pinJson(provider, canonicalValue, fileName)}`;
  persistPublishRecovery(null, `${stage}:CONFIRMED`, null, "IN_PROGRESS", { fileName, valueSha256, uri });
  return uri;
}

async function trackedPublishPinBlob(provider, file, fileName, stage) {
  const [byteLength, valueSha256] = [file.size, await sha256Hex(file)];
  persistPublishRecovery(null, `${stage}:PREPARED`, null, "IN_PROGRESS", { fileName, byteLength, valueSha256 });
  const uri = `ipfs://${await MD.pinBlob(provider, file, fileName)}`;
  persistPublishRecovery(null, `${stage}:CONFIRMED`, null, "IN_PROGRESS", { fileName, byteLength, valueSha256, uri });
  return uri;
}

function readRelationship() {
  return sanitizeRelationshipMetadata({
    parent_contract: $("relParent").value,
    franchise_contract: $("relFranchise").value,
    collection_group: $("relGroup").value,
  });
}

function randomHex(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomNatBelow(limit) {
  const bound = requiredNat(limit, "Ravioli random offset bound");
  if (bound < 1 || bound > 64) throw new Error("Ravioli random offset bound must be between 1 and 64");
  const ceiling = Math.floor(0x1_0000_0000 / bound) * bound;
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample); while (sample[0] >= ceiling);
  return sample[0] % bound;
}

function bytesFromHex(hex) {
  const clean = String(hex || "").replace(/^0x/, "");
  return Uint8Array.from(clean.match(/.{1,2}/g) || [], (part) => parseInt(part, 16));
}

function hexFromBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nonceCommitment(nonceHex) {
  if (typeof TZ.blake2b !== "function") throw new Error("Ravioli cryptographic helper is missing; rebuild the Tezos browser vendor");
  return hexFromBytes(TZ.blake2b(bytesFromHex(nonceHex), undefined, 32));
}

function payloadCommitment(payloadHex = "") {
  if (typeof TZ.blake2b !== "function") throw new Error("Ravioli cryptographic helper is missing; rebuild the Tezos browser vendor");
  return hexFromBytes(TZ.blake2b(bytesFromHex(payloadHex), undefined, 32));
}

function base64FromBytes(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function bytesFromBase64(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`${label} is not valid base64`);
  }
  let binary;
  try { binary = atob(value); } catch { throw new Error(`${label} is not valid base64`); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sealedRevealAad(kit) {
  return {
    schema: SEALED_REVEAL_SCHEMA,
    network: kit.network,
    contract: kit.contract,
    tokenId: kit.tokenId,
    manifestUri: kit.manifestUri,
  };
}

async function sealedRevealKey(saltHex) {
  const salt = bytesFromHex(saltHex);
  if (salt.length !== 32) throw new Error("Ravioli reveal salt must be exactly 32 bytes");
  const domain = new TextEncoder().encode(`${SEALED_REVEAL_SCHEMA}\0`);
  const material = new Uint8Array(domain.length + salt.length);
  material.set(domain);
  material.set(salt, domain.length);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptPublicReveal(publicReveal, saltHex) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = canonicalJsonValue(sealedRevealAad(publicReveal.openKit), "sealed Ravioli reveal AAD");
  const additionalData = new TextEncoder().encode(canonicalJsonText(aad, "sealed Ravioli reveal AAD"));
  const plaintext = new TextEncoder().encode(canonicalJsonText(publicReveal, "sealed Ravioli reveal plaintext"));
  const key = await sealedRevealKey(saltHex);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    key,
    plaintext,
  ));
  return {
    schema: SEALED_REVEAL_SCHEMA,
    cipher: SEALED_REVEAL_CIPHER,
    keyDerivation: SEALED_REVEAL_KDF,
    iv: base64FromBytes(iv),
    aad,
    ciphertext: base64FromBytes(ciphertext),
  };
}

async function decryptPublicReveal(envelope, saltHex, expectedKit) {
  requireExactKeys(envelope, ["schema", "cipher", "keyDerivation", "iv", "aad", "ciphertext"], "sealed Ravioli reveal");
  if (envelope.schema !== SEALED_REVEAL_SCHEMA || envelope.cipher !== SEALED_REVEAL_CIPHER || envelope.keyDerivation !== SEALED_REVEAL_KDF) {
    throw new Error("sealed Ravioli reveal uses an unsupported encryption policy");
  }
  const expectedAad = sealedRevealAad(expectedKit);
  if (canonicalJsonText(envelope.aad, "sealed Ravioli reveal AAD") !== canonicalJsonText(expectedAad, "expected sealed Ravioli reveal AAD")) {
    throw new Error("sealed Ravioli reveal context does not match this pack");
  }
  const iv = bytesFromBase64(envelope.iv, "sealed Ravioli reveal IV");
  if (iv.length !== 12) throw new Error("sealed Ravioli reveal IV must be 12 bytes");
  const ciphertext = bytesFromBase64(envelope.ciphertext, "sealed Ravioli reveal ciphertext");
  const key = await sealedRevealKey(saltHex);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(canonicalJsonText(envelope.aad, "sealed Ravioli reveal AAD")),
        tagLength: 128,
      },
      key,
      ciphertext,
    );
  } catch {
    throw new Error("sealed Ravioli reveal authentication failed; the salt or ciphertext is wrong");
  }
  let revealed;
  try { revealed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)); }
  catch { throw new Error("sealed Ravioli reveal plaintext is invalid"); }
  return revealed;
}

async function fetchBoundedJson(source, label) {
  const response = await fetch(MD.ipfsToHttp(source), { headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${label} could not be loaded (${response.status})`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SEALED_REVEAL_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`${label} exceeds the 2 MB safety limit`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${label} could not be safely streamed`);
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_SEALED_REVEAL_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} exceeds the 2 MB safety limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error(`${label} is not valid UTF-8 JSON`); }
  try { return JSON.parse(text); }
  catch { throw new Error(`${label} is not valid JSON`); }
}

const RAVIOLI_REVEAL_PACK_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    { prim: "pair", args: [{ prim: "nat" }, { prim: "bytes" }] },
  ],
};

async function revealCommitment(contentsUri, saltHex, offset) {
  if (typeof contentsUri !== "string" || !contentsUri.startsWith("ipfs://")) {
    throw new Error("Ravioli sealed reveal requires an IPFS contents URI");
  }
  const normalizedOffset = requiredNat(offset, "Ravioli reveal offset");
  const salt = String(saltHex || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(salt)) throw new Error("Ravioli reveal salt must be exactly 32 bytes");
  const packed = await new TZ.MichelCodecPacker().packData({
    data: {
      prim: "Pair",
      args: [
        { bytes: MD.utf8ToHex(contentsUri) },
        { prim: "Pair", args: [{ int: String(normalizedOffset) }, { bytes: salt }] },
      ],
    },
    type: RAVIOLI_REVEAL_PACK_TYPE,
  });
  return hexFromBytes(TZ.blake2b(bytesFromHex(packed.packed), undefined, 32));
}

function adapterPayloadByteLength(payload, label) {
  const clean = String(payload || "").replace(/^0x/, "");
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean)) throw new Error(`${label} is not valid packed bytes`);
  return clean.length / 2;
}

function assertAdapterPayloadBudget(actions) {
  let total = 0;
  for (const action of actions) {
    if (!("allocated_mint" in action) && !("generative_mint" in action)) continue;
    const payload = action.allocated_mint?.payload ?? action.generative_mint?.payload ?? "";
    const size = adapterPayloadByteLength(payload, "Ravioli adapter payload");
    if (size > MAX_ADAPTER_PAYLOAD_BYTES) throw new Error(`one Ravioli adapter payload is ${size} bytes; the limit is ${MAX_ADAPTER_PAYLOAD_BYTES}`);
    total += size;
  }
  if (total > MAX_TOTAL_ADAPTER_PAYLOAD_BYTES) {
    throw new Error(`Ravioli adapter payloads total ${total} bytes; the Tezos-safe aggregate limit is ${MAX_TOTAL_ADAPTER_PAYLOAD_BYTES}`);
  }
}

async function sha256Hex(blob) {
  return hexFromBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())));
}

function downloadJson(value, fileName) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function openKitStorageKey(kit) {
  return `pasta.ravioli.open-kit.v3:${kit.network}:${kit.contract}:${kit.tokenId}`;
}

function publishRecoveryStorageKey(kit) {
  return `pasta.ravioli.publish-recovery.v1:${kit.network}:${kit.contract}:${kit.tokenId}`;
}

const PUBLISH_RECOVERY_INDEX_KEY = "pasta.ravioli.publish-recovery-index.v1";

function readRecoveryIndex() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUBLISH_RECOVERY_INDEX_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function recoveryRecords() {
  const byDraft = new Map();
  for (const key of readRecoveryIndex()) {
    let record = null;
    try { record = JSON.parse(localStorage.getItem(key) || "null"); } catch { record = null; }
    if (!record || record.schema !== PUBLISH_RECOVERY_SCHEMA) continue;
    const identity = record.draftId || key;
    const previous = byDraft.get(identity);
    const recordTime = Date.parse(record.updatedAt || "") || 0;
    const previousTime = Date.parse(previous?.updatedAt || "") || 0;
    if (!previous || recordTime > previousTime || (recordTime === previousTime && record.status === "COMPLETE" && previous.status !== "COMPLETE")) {
      byDraft.set(identity, { ...record, _storageKey: key });
    }
  }
  return [...byDraft.values()].sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

function latestUnfinishedRecovery() {
  const account = MD.getAccount();
  return recoveryRecords().find((record) =>
    record.status !== "COMPLETE" &&
    record.network === state.network &&
    (!account || record.account === account)
  ) || null;
}

function latestScopedRecovery() {
  const account = MD.getAccount();
  return recoveryRecords().find((record) =>
    record.network === state.network &&
    (!account || record.account === account)
  ) || null;
}

function recoverySignerIntent(entry) {
  const intent = entry?.details?.intent;
  return intent && typeof intent === "object" && ["call", "originate"].includes(intent.action) ? intent : null;
}

function recoverySignerIntents(record) {
  return (Array.isArray(record?.history) ? record.history : []).filter((entry) => recoverySignerIntent(entry));
}

function recoveryOperationHash(record) {
  for (const entry of [...(Array.isArray(record?.history) ? record.history : [])].reverse()) {
    const hash = String(entry?.operationHash || "");
    if (/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(hash)) return hash;
  }
  return "";
}

function recoveryExplorerUrl(network, hash) {
  if (!hash) return "";
  return network === "mainnet" ? `https://tzkt.io/${hash}` : `https://${network}.tzkt.io/${hash}`;
}

function recoveryDetails(record) {
  const history = Array.isArray(record?.history) ? record.history : [];
  const last = history.at(-1);
  const prepared = [...history].reverse().map(recoverySignerIntent).find(Boolean);
  const errorEntry = [...history].reverse().find((entry) => entry?.details?.message);
  const originated = history
    .filter((entry) => entry?.stage?.endsWith(":ADDRESS_BOUND") && MD.isAddress(String(entry?.details?.contract || "")))
    .map((entry) => `${entry.stage.replace(/:ADDRESS_BOUND$/, "")}: ${entry.details.contract}`);
  return [
    `Workflow: ${record?.product?.workflow || "legacy / unknown"}`,
    `Last checkpoint: ${last?.stage || "unknown"}`,
    `Signer: ${record?.account || "unknown"}`,
    `Expected counter: ${prepared?.expectedCounter ?? "not recorded"}`,
    `Target: ${prepared?.target || prepared?.label || "not recorded"}`,
    `Entrypoint: ${prepared?.entrypoint || prepared?.action || "not recorded"}`,
    `Operation: ${recoveryOperationHash(record) || "not recorded"}`,
    ...(originated.length ? ["Originated contracts:", ...originated.map((line) => `  ${line}`)] : []),
    ...(errorEntry ? [`Last error: ${errorEntry.details.message}`] : []),
    ...(record?.encoding === PUBLISH_RECOVERY_ENCODING ? [] : ["Legacy journal: payload encoding is not lossless; manual review is required."]),
  ].join("\n");
}

function assertNoUnfinishedRecovery() {
  const unfinished = latestUnfinishedRecovery();
  if (!unfinished) return;
  throw new Error(`unfinished Ravioli recovery ${unfinished.draftId || "record"} must be reconciled before another write; download the recovery kit and verify its last signer intent first`);
}

function registerRecoveryKey(key) {
  const keys = [...new Set([...readRecoveryIndex(), key])];
  localStorage.setItem(PUBLISH_RECOVERY_INDEX_KEY, JSON.stringify(keys));
}

function encodeRecoveryRecord(record) {
  const encoded = JSON.stringify(record);
  if (new TextEncoder().encode(encoded).byteLength > MAX_RECOVERY_RECORD_BYTES) {
    throw new Error("Ravioli recovery journal exceeded its durable byte limit");
  }
  return encoded;
}

function beginPublishRecovery(input) {
  const draftId = randomHex(16);
  const key = `pasta.ravioli.publish-recovery-draft.v1:${input.network}:${input.account}:${draftId}`;
  const at = new Date().toISOString();
  const recovery = {
    schema: PUBLISH_RECOVERY_SCHEMA,
    encoding: PUBLISH_RECOVERY_ENCODING,
    status: "IN_PROGRESS",
    draftId,
    network: input.network,
    account: input.account,
    contract: input.contract || null,
    tokenId: input.tokenId ?? null,
    kit: null,
    product: {
      name: input.name,
      mode: input.mode,
      editions: input.editions,
      target: input.contract ? "existing_contract" : "new_collection",
      workflow: input.workflow,
      expectedTerminalStage: input.expectedTerminalStage,
    },
    history: [{ stage: "DRAFT_SAVED_BEFORE_SIDE_EFFECT", status: "IN_PROGRESS", at }],
    createdAt: at,
    updatedAt: at,
  };
  const encoded = encodeRecoveryRecord(recovery);
  localStorage.setItem(key, encoded);
  if (localStorage.getItem(key) !== encoded) throw new Error("Ravioli could not create its preflight recovery journal");
  state.currentPublishRecoveryKey = key;
  registerRecoveryKey(key);
  renderLatestPublishRecovery();
  return recovery;
}

function readCurrentPublishRecovery() {
  if (!state.currentPublishRecoveryKey) return null;
  try { return JSON.parse(localStorage.getItem(state.currentPublishRecoveryKey) || "null"); } catch { return null; }
}

function recoverySummary(record) {
  if (!record || record.schema !== PUBLISH_RECOVERY_SCHEMA) return "";
  const identity = record.contract ? `${record.contract} token ${record.tokenId ?? "pending"}` : `draft ${record.draftId || "pending"}`;
  if (record.status === "COMPLETE") {
    const stage = record.history?.at(-1)?.stage || "COMPLETE";
    return stage.includes("ABANDONED")
      ? `Recovery safely closed without a chain intent for ${identity}.`
      : `Recovery checkpoint complete for ${identity}.`;
  }
  return `Unfinished Ravioli recovery ${identity}: ${record.history?.at(-1)?.stage || "unknown stage"}. Verify any submitted operation hash before retrying.`;
}

function renderLatestPublishRecovery() {
  if (!$("publishRecoveryInfo")) return;
  const latest = latestScopedRecovery();
  const unfinished = latestUnfinishedRecovery();
  $("publishRecoveryInfo").textContent = unfinished ? recoverySummary(unfinished) : (latest ? recoverySummary(latest) : "");
  const panel = $("publishRecoveryPanel");
  if (!panel) return;
  panel.hidden = !unfinished;
  if (!unfinished) {
    state.discardRecoveryArmedKey = "";
    state.discardRecoveryArmedValue = "";
    return;
  }
  state.currentPublishRecoveryKey = unfinished._storageKey || state.currentPublishRecoveryKey;
  $("publishRecoverySummary").textContent = recoverySummary(unfinished);
  $("publishRecoveryDetails").textContent = recoveryDetails(unfinished);
  const hash = recoveryOperationHash(unfinished);
  const explorer = $("publishRecoveryExplorer");
  explorer.hidden = !hash;
  if (hash) explorer.href = recoveryExplorerUrl(unfinished.network, hash);
  const discardButton = $("btnDiscardRecovery");
  discardButton.hidden = unfinished.encoding !== PUBLISH_RECOVERY_ENCODING || recoverySignerIntents(unfinished).length !== 0;
  if (state.discardRecoveryArmedKey !== state.currentPublishRecoveryKey) {
    state.discardRecoveryArmedKey = "";
    state.discardRecoveryArmedValue = "";
    discardButton.textContent = "Discard untouched draft";
    discardButton.removeAttribute("data-confirming");
  }
}

function persistPublishRecovery(kit, stage, operation = null, status = "IN_PROGRESS", details = null) {
  const key = state.currentPublishRecoveryKey || (kit ? publishRecoveryStorageKey(kit) : "");
  if (!key) throw new Error("Ravioli recovery journal was not started before a side effect");
  let previous = null;
  try { previous = JSON.parse(localStorage.getItem(key) || "null"); } catch { previous = null; }
  if (!previous || previous.schema !== PUBLISH_RECOVERY_SCHEMA) throw new Error("Ravioli recovery journal is missing or malformed");
  if (previous.status === "COMPLETE") {
    if (status === "COMPLETE") return previous;
    throw new Error("completed Ravioli recovery records are terminal");
  }
  const history = Array.isArray(previous.history) ? previous.history.slice() : [];
  if (history.length >= 1024) throw new Error("Ravioli recovery history exceeded its fail-closed limit");
  history.push({
    stage,
    status,
    at: new Date().toISOString(),
    ...(operation?.hash ? { operationHash: operation.hash } : {}),
    ...(details ? { details } : {}),
  });
  const recovery = {
    ...previous,
    status,
    ...(kit ? { network: kit.network, contract: kit.contract, tokenId: kit.tokenId, kit } : {}),
    history,
    updatedAt: history.at(-1).at,
  };
  const encoded = encodeRecoveryRecord(recovery);
  localStorage.setItem(key, encoded);
  if (localStorage.getItem(key) !== encoded) throw new Error("Ravioli could not durably checkpoint the publish recovery record");
  if (kit) {
    const alias = publishRecoveryStorageKey(kit);
    localStorage.setItem(alias, encoded);
    registerRecoveryKey(alias);
  }
  state.currentPublishRecoveryKey = key;
  if ($("publishRecoveryInfo")) {
    $("publishRecoveryInfo").textContent = recoverySummary(recovery);
  }
  return recovery;
}

async function recoveryConfirmedIntent(record, stage) {
  const history = Array.isArray(record?.history) ? record.history : [];
  const confirmed = [...history].reverse().find((entry) => entry?.stage === `${stage}:CONFIRMED`);
  if (!confirmed || !/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(String(confirmed.operationHash || ""))) return null;
  const prepared = [...history].reverse().find((entry) => entry?.stage === `${stage}:PREPARED` && recoverySignerIntent(entry));
  if (!prepared) return null;
  const preparedHash = String(prepared.details?.intentSha256 || "");
  const confirmedHash = String(confirmed.details?.intentSha256 || "");
  if (!/^[0-9a-f]{64}$/.test(preparedHash) || confirmedHash !== preparedHash) return null;
  const intent = recoverySignerIntent(prepared);
  const actualHash = await sha256Json(boundedRecoveryCanonical(intent, `${stage} recovered signer intent`), `${stage} recovered signer intent`);
  if (actualHash !== preparedHash) return null;
  return { intent, operationHash: confirmed.operationHash };
}

function recoveryHistoryDetail(record, stage, field) {
  const entry = [...(Array.isArray(record?.history) ? record.history : [])].reverse().find((candidate) => candidate?.stage === stage);
  return entry?.details?.[field];
}

async function verifyRecoveryFinalState(record) {
  if (record?.encoding !== PUBLISH_RECOVERY_ENCODING) {
    return { complete: false, message: "This legacy journal used a lossy payload encoding and requires manual review." };
  }
  const expectedStage = String(record?.product?.expectedTerminalStage || "");
  if (!expectedStage) return { complete: false, message: "This journal has no exact terminal-stage declaration and requires manual review." };
  const confirmed = await recoveryConfirmedIntent(record, expectedStage);
  if (!confirmed) {
    const hash = recoveryOperationHash(record);
    return {
      complete: false,
      message: hash
        ? "The last operation is not durably recorded as confirmed. Inspect its hash; Ravioli will not infer application or retry it."
        : "The last signer intent has no durably confirmed operation. Ravioli will not infer that it failed or retry it.",
    };
  }
  if (record.network !== state.network) throw new Error("recovery network does not match the selected network");
  const contractAddress = requiredKt1(record.contract, "recovery router");
  const tokenId = requiredNat(record.tokenId, "recovery token id");
  let toolkit;
  try {
    toolkit = MD.getToolkit();
  } catch {
    toolkit = MD.setupToolkit(state.network);
  }
  if (!toolkit?.contract) throw new Error("connect on the recovery network before checking chain state");
  const storage = await (await toolkit.contract.at(contractAddress)).storage();
  const pack = await typedBigMapGet(storage.packs, tokenId);
  if (!pack) return { complete: false, message: "The expected pack does not exist in current router storage." };
  const workflow = record.product?.workflow;

  if (workflow === "cancel_unrevealed" && expectedStage === "CANCEL_UNREVEALED_PACK") {
    const inspected = await inspectExistingRavioliRouter(contractAddress, { requireAdministrator: false });
    const status = await requireControllerPackAgreement(inspected, storage, pack, tokenId);
    const supply = requiredNat(await typedBigMapGet(storage.total_supply, tokenId), "current Ravioli wrapper supply");
    if (
      !pack.cancelled
      || pack.finalized
      || !status?.cancelled
      || requiredNat(status.outstanding, "current Ravioli outstanding claims") !== 0
      || requiredNat(status.unclaimed, "current Ravioli unclaimed inventory") !== 0
      || requiredNat(status.escrowed, "current Ravioli proceeds escrow") !== 0
      || supply !== 0
    ) {
      return { complete: false, message: "Current router/controller state does not match exact terminal unrevealed-pack closure." };
    }
    return {
      complete: true,
      message: "The confirmed unrevealed-pack closure is terminal with zero wrappers, claims, inventory, and escrow.",
      operationHash: confirmed.operationHash,
      kit: null,
    };
  }

  if (workflow === "refund" && expectedStage === "REFUND_BLIND_CLAIM") {
    const holder = String(recoveryHistoryDetail(record, "REFUND_PREFLIGHT_VERIFIED", "holder") || "");
    const countBefore = requiredNat(
      recoveryHistoryDetail(record, "REFUND_PREFLIGHT_VERIFIED", "claimCountBefore"),
      "recovery refund claim count",
    );
    if (!MD.isAddress(holder) || countBefore < 1) {
      return { complete: false, message: "The refund recovery lacks a valid holder/claim precondition." };
    }
    const inspected = await inspectExistingRavioliRouter(contractAddress, { requireAdministrator: false });
    const currentCount = requiredNat(
      await executeContractView(inspected.controller, "get_claim_count", {
        pack_contract: contractAddress,
        pack_token_id: tokenId,
        owner: holder,
      }, "Ravioli blind controller", record.account),
      "current Ravioli claim count",
    );
    if (currentCount >= countBefore) {
      return { complete: false, message: "The confirmed refund is not reflected in the holder's current claim count." };
    }
    return {
      complete: true,
      message: "The confirmed expiry operation reduced the holder's claims and credited its refund separately.",
      operationHash: confirmed.operationHash,
      kit: null,
    };
  }

  if (workflow === "withdraw_refund" && expectedStage === "WITHDRAW_REFUND") {
    const owner = String(recoveryHistoryDetail(record, "WITHDRAW_REFUND_PREFLIGHT_VERIFIED", "owner") || "");
    const creditBefore = requiredNat(
      recoveryHistoryDetail(record, "WITHDRAW_REFUND_PREFLIGHT_VERIFIED", "creditBefore"),
      "recovery withdrawal prior credit",
    );
    const amount = requiredNat(
      recoveryHistoryDetail(record, "WITHDRAW_REFUND_PREFLIGHT_VERIFIED", "amount"),
      "recovery withdrawal amount",
    );
    if (owner !== record.account || amount < 1 || amount > creditBefore) {
      return { complete: false, message: "The refund withdrawal recovery lacks a valid owner/amount precondition." };
    }
    const inspected = await inspectExistingRavioliRouter(contractAddress, { requireAdministrator: false });
    const creditAfter = requiredNat(
      await executeContractView(inspected.controller, "get_refund_credit", owner, "Ravioli blind controller", owner),
      "current Ravioli refund credit",
    );
    if (creditAfter !== creditBefore - amount) {
      return { complete: false, message: "Current refund credit does not match this exact withdrawal; later credit activity requires manual review." };
    }
    return {
      complete: true,
      message: "The confirmed withdrawal is reflected in the holder's current refund credit.",
      operationHash: confirmed.operationHash,
      kit: null,
    };
  }

  if (workflow === "transfer" && expectedStage === "TRANSFER_WRAPPER") {
    const sender = String(recoveryHistoryDetail(record, "TRANSFER_PREFLIGHT_VERIFIED", "sender") || "");
    const recipient = String(recoveryHistoryDetail(record, "TRANSFER_PREFLIGHT_VERIFIED", "recipient") || "");
    const senderBalanceBefore = requiredNat(
      recoveryHistoryDetail(record, "TRANSFER_PREFLIGHT_VERIFIED", "senderBalanceBefore"),
      "recovery sender wrapper balance",
    );
    const recipientBalanceBefore = requiredNat(
      recoveryHistoryDetail(record, "TRANSFER_PREFLIGHT_VERIFIED", "recipientBalanceBefore"),
      "recovery recipient wrapper balance",
    );
    if (!MD.isAddress(sender) || !MD.isAddress(recipient) || sender === recipient || senderBalanceBefore < 1) {
      return { complete: false, message: "The wrapper transfer recovery lacks valid participant/balance preconditions." };
    }
    const [senderBalanceAfter, recipientBalanceAfter] = await Promise.all([
      ravioliWrapperBalance(storage, sender, tokenId),
      ravioliWrapperBalance(storage, recipient, tokenId),
    ]);
    if (senderBalanceAfter !== senderBalanceBefore - 1 || recipientBalanceAfter !== recipientBalanceBefore + 1) {
      return { complete: false, message: "Current wrapper balances do not match this exact transfer; later transfers require manual review." };
    }
    const movedClaimId = recoveryHistoryDetail(record, "TRANSFER_PREFLIGHT_VERIFIED", "movedClaimId");
    if (movedClaimId != null) {
      const inspected = await inspectExistingRavioliRouter(contractAddress, { requireAdministrator: false });
      const recipientClaim = await resolveStudioClaim(inspected, tokenId, recipient);
      if (recipientClaim.expectedClaimId !== requiredNat(movedClaimId, "recovery moved claim id")) {
        return { complete: false, message: "The recipient's current top blind claim does not match the transferred wrapper." };
      }
    }
    return {
      complete: true,
      message: "The confirmed wrapper transfer and its top blind claim are reflected in current state.",
      operationHash: confirmed.operationHash,
      kit: null,
    };
  }

  const kit = validateOpenKit(record.kit, contractAddress, tokenId, pack);

  if (workflow === "open" && expectedStage === "OPEN_PACK") {
    const serial = requiredNat(recoveryHistoryDetail(record, "OPEN_PREFLIGHT_VERIFIED", "serial"), "recovery open serial");
    const opened = bigToNum(await typedBigMapGet(storage.opened, tokenId));
    if (opened < serial + 1) return { complete: false, message: "The confirmed open is not reflected in the router's current opened counter." };
    return { complete: true, message: `Open serial ${serial} is confirmed and reflected in current router state.`, operationHash: confirmed.operationHash, kit };
  }

  if (workflow === "reveal" && expectedStage === "SET_PACK_CONTENTS") {
    const expectedContents = String(confirmed.intent?.payload?.contents_uri || "");
    const actualContents = String(optionValue(pack.contents_uri) || "");
    if (!expectedContents || actualContents !== expectedContents) {
      return { complete: false, message: "The router's immutable reveal URI does not match the confirmed reveal intent." };
    }
    return { complete: true, message: "The confirmed public reveal URI matches current immutable router state.", operationHash: confirmed.operationHash, kit };
  }

  if (workflow === "publish" && ["FINALIZE_BLIND_PACK", "MINT_WRAPPER_SUPPLY", "SET_WRAPPER_SALE"].includes(expectedStage)) {
    const maxSupply = requiredNat(pack.max_supply, "recovery pack max supply");
    const committedRecipes = requiredNat(pack.committed_recipes, "recovery committed recipe count");
    const minted = requiredNat(await typedBigMapGet(storage.minted, tokenId), "recovery minted wrapper count");
    if (!pack.finalized || pack.cancelled || committedRecipes !== maxSupply || minted !== maxSupply || maxSupply !== requiredNat(record.product.editions, "recovery edition count")) {
      return { complete: false, message: "The confirmed terminal publish operation does not match a fully committed, finalized, fully issued pack." };
    }
    if (["FINALIZE_BLIND_PACK", "SET_WRAPPER_SALE"].includes(expectedStage)) {
      const sale = await typedBigMapGet(storage.sales, tokenId);
      if (!sale || sale.seller !== record.account || sale.treasury !== record.account) {
        return { complete: false, message: "The expected wrapper sale is not present for the recovery signer." };
      }
      const remaining = requiredNat(sale.remaining, "recovery sale remaining");
      if (remaining > maxSupply) return { complete: false, message: "The current wrapper sale exceeds immutable pack supply." };
      if (expectedStage === "FINALIZE_BLIND_PACK" && remaining !== maxSupply) {
        return { complete: false, message: "The recovered blind pack no longer has its exact full-supply initial sale state; manual review is required." };
      }
    }
    return { complete: true, message: "The confirmed terminal publish operation matches a fully backed, finalized, fully issued pack.", operationHash: confirmed.operationHash, kit };
  }

  return { complete: false, message: "This recovery workflow is partial or unsupported; export it for manual review without retrying." };
}

async function checkLatestRecovery() {
  const record = latestUnfinishedRecovery();
  if (!record) return MD.notify("There is no unfinished Ravioli recovery for this network and account.", "success");
  state.currentPublishRecoveryKey = record._storageKey || state.currentPublishRecoveryKey;
  if (record.encoding === PUBLISH_RECOVERY_ENCODING && recoverySignerIntents(record).length === 0) {
    $("publishRecoverySummary").textContent = "No signer intent exists. You may discard this no-chain draft after acknowledging any orphaned pins.";
    $("btnDiscardRecovery").hidden = false;
    return;
  }
  const result = await verifyRecoveryFinalState(record);
  if (!result.complete) {
    $("publishRecoverySummary").textContent = result.message;
    return;
  }
  persistPublishRecovery(result.kit, "RECOVERY_CHAIN_STATE_VERIFIED_COMPLETE", { hash: result.operationHash }, "COMPLETE", {
    expectedTerminalStage: record.product.expectedTerminalStage,
    message: result.message,
  });
  renderLatestPublishRecovery();
  MD.notify("Ravioli verified the final confirmed operation against current chain state and closed the recovery.", "success");
}

function downloadLatestRecovery() {
  const record = latestUnfinishedRecovery() || latestScopedRecovery();
  if (!record) throw new Error("no Ravioli recovery journal exists for this network and account");
  const { _storageKey, ...privateRecord } = record;
  downloadJson(privateRecord, `ravioli-private-recovery-${record.draftId || "journal"}.json`);
}

function discardLatestNoChainRecovery() {
  const record = latestUnfinishedRecovery();
  if (!record) throw new Error("no unfinished Ravioli recovery exists");
  if (!MD.getAccount() || MD.getAccount() !== record.account) throw new Error("connect the recovery account before discarding its no-chain draft");
  if (record.encoding !== PUBLISH_RECOVERY_ENCODING) throw new Error("legacy recovery journals cannot be discarded automatically");
  if (recoverySignerIntents(record).length !== 0) throw new Error("this recovery contains a signer intent and cannot be discarded");
  const recoveryKey = record._storageKey || state.currentPublishRecoveryKey;
  const recoveryValue = localStorage.getItem(recoveryKey) || "";
  if (
    state.discardRecoveryArmedKey !== recoveryKey ||
    state.discardRecoveryArmedValue !== recoveryValue
  ) {
    state.discardRecoveryArmedKey = recoveryKey;
    state.discardRecoveryArmedValue = recoveryValue;
    $("publishRecoverySummary").textContent = "Confirm discard: any IPFS pins remain public, and a pinned reveal may have exposed recipe nonces. Click Confirm discard once more to close only this no-chain draft.";
    const discardButton = $("btnDiscardRecovery");
    discardButton.textContent = "Confirm discard of no-chain draft";
    discardButton.setAttribute("data-confirming", "true");
    return;
  }
  state.discardRecoveryArmedKey = "";
  state.discardRecoveryArmedValue = "";
  state.currentPublishRecoveryKey = recoveryKey;
  persistPublishRecovery(record.kit || null, "RECOVERY_ABANDONED_NO_CHAIN_INTENT", null, "COMPLETE", {
    acknowledgedOrphanedPinsAndRevealRisk: true,
  });
  renderLatestPublishRecovery();
  MD.notify("The no-chain recovery was safely closed. No signer intent was discarded.", "success");
}

function operationHash(operation) {
  const hash = String(operation?.opHash || operation?.hash || "");
  return /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(hash) ? hash : "";
}

async function nextSignerCounter() {
  const rpc = MD.getToolkit()?.rpc;
  const account = MD.getAccount();
  if (!rpc || !account || typeof rpc.getContract !== "function") return null;
  try {
    const contract = await rpc.getContract(account);
    const current = requiredNat(contract?.counter, "signer counter");
    return current + 1;
  } catch {
    // The full target/entrypoint/payload digest remains durable even when a
    // constrained proof bridge or RPC cannot expose the implicit counter.
    return null;
  }
}

async function sendTrackedPublishOperation(kit, stage, intent, send) {
  const preparedIntent = {
    network: state.network,
    signer: MD.getAccount(),
    expectedCounter: await nextSignerCounter(),
    ...intent,
  };
  const recordedIntent = boundedRecoveryCanonical(preparedIntent, `${stage} signer intent`);
  const intentSha256 = await sha256Json(recordedIntent, `${stage} signer intent`);
  persistPublishRecovery(kit, `${stage}:PREPARED`, null, "IN_PROGRESS", { intent: recordedIntent, intentSha256 });
  const operation = await send();
  const hash = operationHash(operation);
  if (!hash) throw new Error(`${stage} returned no valid Tezos operation hash; reconcile the prepared signer intent before retrying`);
  persistPublishRecovery(kit, `${stage}:SUBMITTED`, { hash }, "IN_PROGRESS", { intentSha256 });
  await operation.confirmation();
  persistPublishRecovery(kit, `${stage}:CONFIRMED`, { hash }, "IN_PROGRESS", { intentSha256 });
  return operation;
}

function validateOpenKit(kit, contractAddress, tokenId, pack = null) {
  if (!kit || typeof kit !== "object" || kit.schema !== OPEN_KIT_SCHEMA || !Array.isArray(kit.recipes)) {
    throw new Error("paste or import a Ravioli v3 open kit");
  }
  const hasSealedReveal = Object.prototype.hasOwnProperty.call(kit, "sealedReveal");
  requireExactKeys(kit, [
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
    ...(hasSealedReveal ? ["sealedReveal"] : []),
  ], "Ravioli open kit");
  if (typeof kit.tokenId !== "number" || requiredNat(kit.tokenId, "open kit token id") !== tokenId || kit.contract !== contractAddress) {
    throw new Error("open kit contract/token does not match the selected pack");
  }
  if (kit.network !== state.network) throw new Error("open kit network does not match the selected network");
  if (!MODE_NAMES.includes(kit.mode)) throw new Error("open kit mode is unsupported");
  if (!["commit-reveal-ui-hidden-chain-public", "public"].includes(kit.blindSecurity)) throw new Error("open kit disclosure policy is unsupported");
  if (typeof kit.warning !== "string" || !kit.warning.trim() || kit.warning.length > 512) throw new Error("open kit warning is invalid");
  if (typeof kit.manifestUri !== "string" || !kit.manifestUri.startsWith("ipfs://") || kit.manifestUri.length > 256) {
    throw new Error("open kit manifest URI is invalid");
  }
  requireExactKeys(kit.editionPolicy, [
    "requiresLimitedWrapper",
    "wrapperEditionClass",
    "earliestChildEnd",
    "wrapperSaleStart",
    "wrapperSaleEnd",
    "revealDeadline",
    "openDeadline",
  ], "open kit edition policy");
  if (typeof kit.editionPolicy.requiresLimitedWrapper !== "boolean") throw new Error("open kit edition policy flag is invalid");
  if (!["fixed-supply", "limited-edition"].includes(kit.editionPolicy.wrapperEditionClass)) {
    throw new Error("open kit wrapper edition class is invalid");
  }
  for (const field of ["earliestChildEnd", "wrapperSaleStart", "wrapperSaleEnd", "revealDeadline", "openDeadline"]) {
    const value = kit.editionPolicy[field];
    if (value != null && (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) {
      throw new Error(`open kit edition policy ${field} is invalid`);
    }
  }
  if (hasSealedReveal) {
    requireExactKeys(
      kit.sealedReveal,
      ["schema", "contentsUri", "salt", "offset", "envelopeSha256"],
      "open kit sealed reveal reference",
    );
    if (kit.sealedReveal.schema !== SEALED_REVEAL_REFERENCE_SCHEMA) throw new Error("open kit sealed reveal reference is unsupported");
    if (typeof kit.sealedReveal.contentsUri !== "string" || !kit.sealedReveal.contentsUri.startsWith("ipfs://") || kit.sealedReveal.contentsUri.length > 256) {
      throw new Error("open kit sealed reveal URI is invalid");
    }
    if (!/^[0-9a-f]{64}$/.test(String(kit.sealedReveal.salt || ""))) throw new Error("open kit reveal salt is invalid");
    if (!/^[0-9a-f]{64}$/.test(String(kit.sealedReveal.envelopeSha256 || ""))) throw new Error("open kit sealed reveal digest is invalid");
    if (requiredNat(kit.sealedReveal.offset, "open kit reveal offset") >= kit.recipes.length) {
      throw new Error("open kit reveal offset is outside the wrapper supply");
    }
  }
  if (kit.recipes.length < 1 || kit.recipes.length > 64) throw new Error("open kit recipe count is invalid");
  if (pack) {
    if (kit.recipes.length !== bigToNum(pack.max_supply)) throw new Error("open kit recipe count does not match immutable pack supply");
    if (kit.mode !== MODE_NAMES[bigToNum(pack.mode)]) throw new Error("open kit mode does not match immutable pack mode");
    const immutableManifestUri = MD.hexToUtf8(String(pack.manifest_uri || ""));
    if (kit.manifestUri !== immutableManifestUri) throw new Error("open kit manifest URI does not match immutable pack identity");
  }
  const seenNonces = new Set();
  for (let index = 0; index < kit.recipes.length; index += 1) {
    const recipe = kit.recipes[index];
    requireExactKeys(recipe, ["serial", "nonce", "actions"], `open kit recipe ${index}`);
    if (typeof recipe.serial !== "number" || requiredNat(recipe.serial, `open kit recipe ${index} serial`) !== index || typeof recipe.nonce !== "string" || !/^[0-9a-f]{64}$/.test(recipe.nonce) || !Array.isArray(recipe.actions)) {
      throw new Error(`open kit recipe ${index} is malformed`);
    }
    if (seenNonces.has(recipe.nonce)) throw new Error(`open kit recipe ${index} reuses a nonce`);
    seenNonces.add(recipe.nonce);
    if (pack && recipe.actions.length !== bigToNum(pack.item_count)) throw new Error(`open kit recipe ${index} action count does not match immutable pack`);
    for (const action of recipe.actions) {
      if (!action || typeof action !== "object") throw new Error(`open kit recipe ${index} has a malformed action`);
      if (action.kind === "escrow") {
        requireExactKeys(action, ["kind", "fa2", "tokenId", "amount"], `open kit recipe ${index} escrow action`);
        requiredKt1(action.fa2, "open kit escrow contract");
        if (typeof action.tokenId !== "number" || typeof action.amount !== "number") throw new Error("open kit escrow numeric fields are invalid");
        requiredNat(action.tokenId, "open kit escrow token id");
        if (requiredNat(action.amount, "open kit escrow amount") < 1) throw new Error("open kit escrow amount must be positive");
      } else if (action.kind === "allocated" || action.kind === "generative") {
        requireExactKeys(action, ["kind", "adapter", "resourceId", "payloadCommitment"], `open kit recipe ${index} adapter action`);
        requiredKt1(action.adapter, "open kit adapter");
        if (typeof action.resourceId !== "number") throw new Error("open kit resource id is invalid");
        requiredNat(action.resourceId, "open kit resource id");
        if (action.kind === "allocated" && !/^[0-9a-f]{64}$/.test(String(action.payloadCommitment || ""))) {
          throw new Error("allocated open-kit action requires an exact payload commitment");
        }
        if (action.kind === "generative" && action.payloadCommitment != null && !/^[0-9a-f]{64}$/.test(String(action.payloadCommitment))) {
          throw new Error("generative open-kit payload commitment is malformed");
        }
      } else throw new Error(`open kit recipe ${index} has an unknown action kind`);
    }
  }
  return kit;
}

const RAVIOLI_RESERVATION_PACK_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    {
      prim: "list",
      args: [{
        prim: "or",
        args: [
          { prim: "pair", args: [{ prim: "address" }, { prim: "pair", args: [{ prim: "option", args: [{ prim: "bytes" }] }, { prim: "nat" }] }] },
          {
            prim: "or",
            args: [
              { prim: "pair", args: [{ prim: "nat" }, { prim: "pair", args: [{ prim: "address" }, { prim: "nat" }] }] },
              { prim: "pair", args: [{ prim: "address" }, { prim: "pair", args: [{ prim: "option", args: [{ prim: "bytes" }] }, { prim: "nat" }] }] },
            ],
          },
        ],
      }],
    },
  ],
};

function commitmentOption(value) {
  return value == null ? { prim: "None" } : { prim: "Some", args: [{ bytes: String(value).replace(/^0x/, "") }] };
}

function reservationMicheline(action) {
  if (action.kind === "allocated") return {
    prim: "Left",
    args: [{ prim: "Pair", args: [{ string: action.adapter }, { prim: "Pair", args: [commitmentOption(action.payloadCommitment), { int: String(action.resourceId) }] }] }],
  };
  if (action.kind === "escrow") return {
    prim: "Right",
    args: [{ prim: "Left", args: [{ prim: "Pair", args: [{ int: String(action.amount) }, { prim: "Pair", args: [{ string: action.fa2 }, { int: String(action.tokenId) }] }] }] }],
  };
  return {
    prim: "Right",
    args: [{ prim: "Right", args: [{ prim: "Pair", args: [{ string: action.adapter }, { prim: "Pair", args: [commitmentOption(action.payloadCommitment), { int: String(action.resourceId) }] }] }] }],
  };
}

async function recipeCommitment(recipe) {
  const data = {
    prim: "Pair",
    args: [
      { bytes: nonceCommitment(recipe.nonce) },
      recipe.actions.map(reservationMicheline),
    ],
  };
  const packed = await new TZ.MichelCodecPacker().packData({ data, type: RAVIOLI_RESERVATION_PACK_TYPE });
  return hexFromBytes(TZ.blake2b(bytesFromHex(packed.packed), undefined, 32));
}

async function recipeCommitmentAt(map, tokenId, serial) {
  if (!map || typeof map.get !== "function") throw new Error("Ravioli router does not expose recipe commitments");
  for (const key of [
    { pack_token_id: tokenId, serial },
    `${tokenId}:${serial}`,
    `${tokenId},${serial}`,
  ]) {
    try {
      const value = await map.get(key);
      if (value !== undefined) return String(value).replace(/^0x/, "").toLowerCase();
    } catch { /* Taquito and the proof bridge use different composite-key projections. */ }
  }
  throw new Error(`Ravioli recipe commitment ${serial} is unavailable`);
}

async function executeContractView(contract, name, params, label, viewCaller) {
  const build = contract?.contractViews?.[name];
  if (typeof build !== "function") throw new Error(`${label} does not expose the required ${name} on-chain view`);
  const invocation = build(params);
  if (!invocation || typeof invocation.executeView !== "function") throw new Error(`${label} ${name} view is unavailable`);
  return invocation.executeView({ viewCaller: viewCaller || MD.getAccount() });
}

function normalizedOptionalBytes(value) {
  const unwrapped = optionValue(value);
  return unwrapped == null ? null : String(unwrapped).replace(/^0x/i, "").toLowerCase();
}

async function requireControllerPackAgreement(inspected, storage, pack, tokenId) {
  if (bigToNum(pack.mode) === 0) return null;
  const status = await executeContractView(inspected.controller, "get_pack_status", {
    pack_contract: inspected.address,
    pack_token_id: tokenId,
  }, "Ravioli blind controller", MD.getAccount() || inspected.address);
  if (requiredNat(status?.max_supply, "Ravioli controller supply") !== requiredNat(pack.max_supply, "Ravioli router supply")) {
    throw new Error("Ravioli router and blind controller disagree about pack supply");
  }
  for (const [label, controllerValue, routerValue] of [
    ["reveal deadline", status.reveal_deadline, pack.reveal_deadline],
    ["delivery/refund cutoff", status.open_deadline, pack.open_deadline],
  ]) {
    if (optionalTimestamp(controllerValue, `Ravioli controller ${label}`) !== optionalTimestamp(routerValue, `Ravioli router ${label}`)) {
      throw new Error(`Ravioli router and blind controller disagree about the ${label}`);
    }
  }
  for (const [label, controllerValue, routerValue] of [
    ["reveal commitment", status.reveal_commitment, pack.reveal_commitment],
    ["contents URI", status.contents_uri, pack.contents_uri],
  ]) {
    if (normalizedOptionalBytes(controllerValue) !== normalizedOptionalBytes(routerValue)) {
      throw new Error(`Ravioli router and blind controller disagree about the ${label}`);
    }
  }
  const supply = requiredNat((await typedBigMapGet(storage.total_supply, tokenId)) ?? 0, "Ravioli live wrapper supply");
  if (Boolean(status.cancelled) !== Boolean(pack.cancelled)) {
    const safeRevealedClosure = Boolean(pack.cancelled)
      && !Boolean(status.cancelled)
      && Boolean(status.revealed)
      && supply === 0
      && requiredNat(status.outstanding, "Ravioli outstanding claims") === 0
      && requiredNat(status.escrowed, "Ravioli escrowed proceeds") === 0;
    if (!safeRevealedClosure) throw new Error("Ravioli router and blind controller disagree about cancellation state");
  }
  const revealedContents = normalizedOptionalBytes(status.contents_uri);
  if (Boolean(status.revealed) !== (revealedContents != null)) {
    throw new Error("Ravioli blind controller reveal flag disagrees with its contents state");
  }
  const sale = await typedBigMapGet(storage.sales, tokenId);
  if (sale) {
    if (
      String(status.inventory_owner || "") !== String(sale.seller || "")
      || String(status.treasury || "") !== String(sale.treasury || "")
      || requiredNat(status.unit_price, "Ravioli controller unit price") !== requiredNat(sale.price, "Ravioli router unit price")
      || optionalTimestamp(status.sale_end, "Ravioli controller sale end") !== optionalTimestamp(sale.end, "Ravioli router sale end")
    ) {
      throw new Error("Ravioli router and blind controller disagree about the primary sale");
    }
  }
  return status;
}

async function resolveStudioClaim(inspected, tokenId, holderAddress) {
  if (!holderAddress || !MD.isAddress(holderAddress)) throw new Error("Ravioli claim holder must be a valid Tezos address");
  const holder = {
    pack_contract: inspected.address,
    pack_token_id: tokenId,
    owner: holderAddress,
  };
  const count = requiredNat(
    await executeContractView(inspected.controller, "get_claim_count", holder, "Ravioli blind controller", MD.getAccount() || inspected.address),
    "Ravioli holder claim count",
  );
  if (count < 1) throw new Error("selected holder has no unconsumed claim for this blind Ravioli pack");
  const claim = await executeContractView(
    inspected.controller,
    "get_last_claim",
    holder,
    "Ravioli blind controller",
    MD.getAccount() || inspected.address,
  );
  return {
    count,
    expectedClaimId: requiredNat(claim?.claim_id, "Ravioli claim id"),
    paid: requiredNat(claim?.paid, "Ravioli claim payment"),
  };
}

async function resolveStudioOpenEntitlement(inspected, storage, pack, tokenId, opener) {
  if (bigToNum(pack.mode) === 0) {
    return {
      serial: requiredNat((await typedBigMapGet(storage.opened, tokenId)) ?? 0, "Ravioli next public serial"),
      expectedClaimId: null,
    };
  }
  if (!opener || !MD.isAddress(opener)) throw new Error("connect the wrapper holder before resolving a blind claim");
  const claim = await resolveStudioClaim(inspected, tokenId, opener);
  const expectedClaimId = claim.expectedClaimId;
  const serial = requiredNat(
    await executeContractView(inspected.controller, "get_claim_serial", {
      pack_contract: inspected.address,
      pack_token_id: tokenId,
      holder: opener,
      expected_claim_id: expectedClaimId,
    }, "Ravioli blind controller", opener),
    "Ravioli claim serial",
  );
  if (serial >= requiredNat(pack.max_supply, "Ravioli pack supply")) throw new Error("Ravioli claim serial is outside the pack supply");
  return { serial, expectedClaimId };
}

async function preflightPublicReveal(address, tokenId, rawKit) {
  const inspected = await inspectExistingRavioliRouter(address);
  const storage = await inspected.contract.storage();
  if (storage.administrator && String(storage.administrator) !== MD.getAccount()) throw new Error("only the Ravioli administrator can publish its reveal");
  const pack = await typedBigMapGet(storage.packs, tokenId);
  if (!pack) throw new Error("no Ravioli v3 pack exists at that token id");
  if (!pack.finalized || pack.cancelled) throw new Error("Ravioli pack must be finalized and active before reveal");
  if (pack.blind !== true) throw new Error("only a blind Ravioli pack uses the one-time reveal action");
  await requireControllerPackAgreement(inspected, storage, pack, tokenId);
  if (optionValue(pack.contents_uri) != null) throw new Error("Ravioli contents are already permanently published");
  if (bigToNum(pack.committed_recipes) !== bigToNum(pack.max_supply)) throw new Error("Ravioli pack does not have every recipe committed");
  const kit = validateOpenKit(rawKit, address, tokenId, pack);
  if (!kit.sealedReveal) throw new Error("blind Ravioli reveal requires its private sealed-reveal reference");
  const committedReveal = String(optionValue(pack.reveal_commitment) || "").replace(/^0x/, "").toLowerCase();
  const expectedReveal = await revealCommitment(
    kit.sealedReveal.contentsUri,
    kit.sealedReveal.salt,
    kit.sealedReveal.offset,
  );
  if (!/^[0-9a-f]{64}$/.test(committedReveal) || committedReveal !== expectedReveal) {
    throw new Error("private sealed reveal does not match the immutable on-chain commitment");
  }
  for (let serial = 0; serial < kit.recipes.length; serial += 1) {
    const [expected, actual] = await Promise.all([
      recipeCommitment(kit.recipes[serial]),
      recipeCommitmentAt(storage.recipe_commitments, tokenId, serial),
    ]);
    if (expected !== actual) throw new Error(`open kit recipe ${serial} does not match the immutable on-chain commitment`);
  }
  return { kit, pack, contract: inspected.contract };
}

async function preflightOpenKit(address, tokenId, rawKit) {
  const inspected = await inspectExistingRavioliRouter(address, { requireAdministrator: false });
  const storage = await inspected.contract.storage();
  const pack = await typedBigMapGet(storage.packs, tokenId);
  if (!pack) throw new Error("no Ravioli v3 pack exists at that token id");
  if (!pack.finalized || pack.cancelled) throw new Error("Ravioli pack must be finalized and active before opening");
  await requireControllerPackAgreement(inspected, storage, pack, tokenId);
  const kit = validateOpenKit(rawKit, address, tokenId, pack);
  const entitlement = await resolveStudioOpenEntitlement(inspected, storage, pack, tokenId, MD.getAccount());
  const serial = entitlement.serial;
  const recipe = kit.recipes[serial];
  if (!recipe) throw new Error(`open kit has no recipe for next serial ${serial}`);
  const [expected, actual] = await Promise.all([
    recipeCommitment(recipe),
    recipeCommitmentAt(storage.recipe_commitments, tokenId, serial),
  ]);
  if (expected !== actual) throw new Error(`open kit recipe ${serial} does not match the immutable on-chain commitment`);
  return { kit, pack, recipe, serial, expectedClaimId: entitlement.expectedClaimId, inspected, storage, contract: inspected.contract };
}

function publicRevealDocument(kit) {
  const { sealedReveal: _privateReveal, ...publicKit } = kit;
  return {
    schema: PUBLIC_REVEAL_SCHEMA,
    network: kit.network,
    contract: kit.contract,
    tokenId: kit.tokenId,
    mode: kit.mode,
    manifestUri: kit.manifestUri,
    maxSupply: kit.recipes.length,
    itemCount: kit.recipes[0]?.actions?.length || 0,
    openKit: publicKit,
  };
}

async function sha256Bytes(bytes) {
  return hexFromBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function loadArtifactRecord(name) {
  if (!artifactLoadPromises.has(name)) {
    artifactLoadPromises.set(name, (async () => {
      const path = ARTIFACTS[name];
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`could not load ${name} contract artifact`);
      const bytes = await response.arrayBuffer();
      let code;
      try {
        code = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        throw new Error(`${name} contract artifact is not valid UTF-8 JSON`);
      }
      if (!Array.isArray(code)) throw new Error(`${name} contract artifact is invalid`);
      return {
        path,
        code,
        sha256: await sha256Bytes(bytes),
        canonicalMichelsonCodeSha256: await michelsonScriptCodeHash(
          code,
          `bundled ${name} code`,
        ),
      };
    })());
  }
  return artifactLoadPromises.get(name);
}

async function loadArtifact(name) {
  return (await loadArtifactRecord(name)).code;
}

function requiredSha256(value, label) {
  const normalized = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`${label} must be a SHA-256 digest`);
  return normalized;
}

async function requireCertifiedActiveProtocol(certificateProtocol) {
  const rpc = MD.getToolkit()?.rpc;
  if (!rpc || typeof rpc.getBlock !== "function") {
    throw new Error("Ravioli could not read the active Tezos protocol; no pin or origination was attempted");
  }
  let head;
  try {
    head = await rpc.getBlock({ block: "head" });
  } catch (error) {
    throw new Error(`Ravioli could not read the active Tezos protocol; no pin or origination was attempted (${error?.message || error})`);
  }
  const activeProtocol = String(head?.protocol || "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{20,128}$/.test(activeProtocol)) {
    throw new Error("Ravioli RPC returned an invalid active protocol identity; no pin or origination was attempted");
  }
  if (activeProtocol !== certificateProtocol) {
    throw new Error(
      `Ravioli deployment certificate targets ${certificateProtocol}, but the connected RPC is running ${activeProtocol}; no pin or origination was attempted`,
    );
  }
  return activeProtocol;
}

async function requireFreshDeploymentCertificate() {
  const response = await fetch(ARTIFACTS.deploymentCertificate, { cache: "no-store" });
  if (!response.ok) throw new Error("Ravioli deployment certificate is missing; no origination was attempted");
  let certificate;
  try {
    certificate = await response.json();
  } catch {
    throw new Error("Ravioli deployment certificate is not valid JSON; no origination was attempted");
  }
  requireExactKeys(certificate, [
    "schema",
    "compiler",
    "protocol",
    "maxOperationDataLength",
    "minimumHeadroomBytes",
    "certifiedMetadataUriMaxBytes",
    "artifacts",
  ], "Ravioli deployment certificate");
  if (certificate.schema !== DEPLOYMENT_CERTIFICATE_SCHEMA) {
    throw new Error("Ravioli deployment certificate version is unsupported; no origination was attempted");
  }
  requireExactKeys(certificate.compiler, ["name", "version"], "Ravioli deployment certificate compiler");
  if (certificate.compiler.name !== "SmartPy" || typeof certificate.compiler.version !== "string" || !certificate.compiler.version.trim()) {
    throw new Error("Ravioli deployment certificate compiler identity is invalid");
  }
  if (typeof certificate.protocol !== "string" || !certificate.protocol.trim() || certificate.protocol.length > 128) {
    throw new Error("Ravioli deployment certificate protocol is invalid");
  }
  await requireCertifiedActiveProtocol(certificate.protocol);
  const operationLimit = requiredNat(certificate.maxOperationDataLength, "Ravioli certified operation limit");
  const minimumHeadroom = requiredNat(certificate.minimumHeadroomBytes, "Ravioli certified minimum headroom");
  const maximumMetadataUriBytes = requiredNat(
    certificate.certifiedMetadataUriMaxBytes,
    "Ravioli certified metadata URI limit",
  );
  if (operationLimit !== MAX_OPERATION_DATA_LENGTH) {
    throw new Error(`Ravioli deployment certificate must target the ${MAX_OPERATION_DATA_LENGTH}-byte Tezos operation limit`);
  }
  if (minimumHeadroom < MIN_ROUTER_ORIGINATION_HEADROOM_BYTES) {
    throw new Error(`Ravioli deployment certificate leaves less than ${MIN_ROUTER_ORIGINATION_HEADROOM_BYTES} bytes of required headroom`);
  }
  if (maximumMetadataUriBytes < 8 || maximumMetadataUriBytes > 256) {
    throw new Error("Ravioli certified metadata URI limit is outside the supported envelope");
  }
  requireExactKeys(
    certificate.artifacts,
    ["router", "blindController", "gnocchiAdapter", "rotiniAdapter"],
    "Ravioli deployment certificate artifacts",
  );
  const expected = {
    router: ARTIFACTS.router,
    blindController: ARTIFACTS.blindController,
    gnocchiAdapter: ARTIFACTS.gnocchiAdapter,
    rotiniAdapter: ARTIFACTS.rotiniAdapter,
  };
  const loaded = {};
  for (const [name, expectedPath] of Object.entries(expected)) {
    const entry = certificate.artifacts[name];
    requireExactKeys(entry, [
      "path",
      "sha256",
      "sourcePath",
      "sourceSha256",
      "canonicalMichelsonCodeSha256",
      "signedOriginationBytes",
      "headroomBytes",
    ], `Ravioli ${name} deployment certificate`);
    if (entry.path !== expectedPath) throw new Error(`Ravioli ${name} deployment certificate points to the wrong artifact`);
    if (typeof entry.sourcePath !== "string" || !entry.sourcePath.trim() || entry.sourcePath.length > 512) {
      throw new Error(`Ravioli ${name} deployment certificate source path is invalid`);
    }
    requiredSha256(entry.sourceSha256, `Ravioli ${name} source identity`);
    const certifiedCodeIdentity = requiredSha256(
      entry.canonicalMichelsonCodeSha256,
      `Ravioli ${name} canonical Michelson code identity`,
    );
    const signedBytes = requiredNat(entry.signedOriginationBytes, `Ravioli ${name} certified signed size`);
    const headroomBytes = requiredNat(entry.headroomBytes, `Ravioli ${name} certified headroom`);
    if (signedBytes + headroomBytes !== operationLimit) {
      throw new Error(`Ravioli ${name} deployment certificate size arithmetic is invalid`);
    }
    if (headroomBytes < minimumHeadroom || headroomBytes < MIN_ROUTER_ORIGINATION_HEADROOM_BYTES) {
      throw new Error(`Ravioli ${name} projected signed origination headroom is below 1 KiB`);
    }
    const artifact = await loadArtifactRecord(name);
    if (
      artifact.path !== entry.path ||
      artifact.sha256 !== requiredSha256(entry.sha256, `Ravioli ${name} artifact identity`) ||
      artifact.canonicalMichelsonCodeSha256 !== certifiedCodeIdentity
    ) {
      throw new Error(`Ravioli ${name} artifact does not match its tested deployment certificate; no origination was attempted`);
    }
    loaded[name] = artifact.code;
  }
  return {
    certificate,
    maximumMetadataUriBytes,
    router: loaded.router,
    blindController: loaded.blindController,
    gnocchiAdapter: loaded.gnocchiAdapter,
    rotiniAdapter: loaded.rotiniAdapter,
  };
}

function requireCertifiedDeploymentUris(preflight, values) {
  for (const [label, value] of Object.entries(values)) {
    const byteLength = new TextEncoder().encode(String(value || "")).byteLength;
    if (byteLength < 1 || byteLength > preflight.maximumMetadataUriBytes) {
      throw new Error(
        `${label} is ${byteLength} bytes; this Ravioli release is certified only through ${preflight.maximumMetadataUriBytes} bytes. No origination was attempted.`,
      );
    }
  }
  const router = preflight.certificate.artifacts.router;
  const controller = preflight.certificate.artifacts.blindController;
  const gnocchiAdapter = preflight.certificate.artifacts.gnocchiAdapter;
  const rotiniAdapter = preflight.certificate.artifacts.rotiniAdapter;
  log(
    `deployment preflight ✓ router ≤ ${router.signedOriginationBytes} signed bytes (${router.headroomBytes} headroom); controller ≤ ${controller.signedOriginationBytes} signed bytes (${controller.headroomBytes} headroom); Gnocchi adapter ≤ ${gnocchiAdapter.signedOriginationBytes} signed bytes (${gnocchiAdapter.headroomBytes} headroom); Rotini adapter ≤ ${rotiniAdapter.signedOriginationBytes} signed bytes (${rotiniAdapter.headroomBytes} headroom); estimated one-time pair cost ≈11.3 tez—reuse this pair for later packs`,
  );
}

function metadataMap(uri) {
  const map = new TZ.MichelsonMap();
  map.set("", MD.utf8ToHex(uri));
  return map;
}

function blindControllerStorage(metadataUri) {
  const M = TZ.MichelsonMap;
  return {
    metadata: metadataMap(metadataUri),
    packs: new M(),
    claim_counts: new M(),
    claim_slots: new M(),
    consumed_serials: new M(),
    refund_credits: new M(),
  };
}

function routerStorage(admin, metadataUri, blindController) {
  const M = TZ.MichelsonMap;
  return {
    administrator: admin,
    pending_administrator: null,
    blind_controller: requiredKt1(blindController, "Ravioli blind controller"),
    metadata: metadataMap(metadataUri),
    ledger: new M(),
    operators: new M(),
    token_metadata: new M(),
    total_supply: new M(),
    packs: new M(),
    recipe_commitments: new M(),
    minted: new M(),
    opened: new M(),
    asset_allowances: new M(),
    adapter_allowances: new M(),
    sales: new M(),
    minters: new M(),
    next_token_id: 0,
  };
}

function adapterStorage(admin, metadataUri, kind) {
  const M = TZ.MichelsonMap;
  const base = {
    administrator: admin,
    pending_administrator: null,
    metadata: metadataMap(metadataUri),
    routers: new M(),
    reservations: new M(),
    next_resource_id: 0,
  };
  return kind === "Gnocchi" ? { ...base, allocations: new M() } : { ...base, resources: new M() };
}

async function originateAdapter(admin, kind, artifactName, deploymentPreflight) {
  const metadata = {
    name: `Pasta ${kind} Pack Adapter`,
    description: `Typed Ravioli helper for atomic ${kind} pack fulfillment.`,
    interfaces: ["TZIP-016"],
    pasta: { app: "ravioli", helper: `${kind.toLowerCase()}-pack-adapter`, version: 1 },
  };
  log(`pinning ${kind} adapter contract metadata…`);
  const metadataUri = await trackedPublishPinJson(
    pinProvider(),
    metadata,
    `pasta-${kind.toLowerCase()}-pack-adapter-contract.json`,
    `PIN_${kind.toUpperCase()}_ADAPTER_METADATA`,
  );
  requireCertifiedDeploymentUris(deploymentPreflight, {
    [`${kind} adapter metadata URI`]: metadataUri,
  });
  return originate(
    deploymentPreflight[artifactName],
    adapterStorage(admin, metadataUri, kind),
    `${kind} ${kind === "Gnocchi" ? "allocation" : "generative"} adapter`,
    `ORIGINATE_${kind.toUpperCase()}_ADAPTER`,
  );
}

async function originate(code, storage, label, stage = "ORIGINATE_CONTRACT") {
  log(`originating ${label} (sign in wallet)…`);
  const recordedStorage = boundedRecoveryCanonical(storage, `${label} origination storage`);
  const operation = await sendTrackedPublishOperation(null, stage, {
    action: "originate",
    label,
    codeSha256: await sha256Json(code, `${label} origination code`),
    storage: recordedStorage,
    storageSha256: await sha256Json(recordedStorage, `${label} origination storage`),
  }, () => MD.getToolkit().wallet.originate({ code, storage }).send());
  const contract = await operation.contract();
  persistPublishRecovery(null, `${stage}:ADDRESS_BOUND`, { hash: operationHash(operation) }, "IN_PROGRESS", { contract: contract.address });
  log(`${label} deployed: ${contract.address}`);
  return contract.address;
}

function addMemberRow(initial = {}) {
  const element = $("memberRowTpl").content.firstElementChild.cloneNode(true);
  const member = { el: element };
  element.querySelector(".m-name").value = initial.name || "";
  element.querySelector(".m-type").value = initial.kind || initial.type || "escrow";
  element.querySelector(".m-kt").value = initial.fa2 || initial.adapter || initial.tokenContract || "";
  element.querySelector(".m-tid").value = String(initial.tokenId ?? initial.resourceId ?? 0);
  element.querySelector(".m-qty").value = String(initial.amount ?? initial.quantity ?? 1);
  element.querySelector(".m-uri").value = initial.uri || "";
  element.querySelector(".m-mime").value = initial.mimeType || "";
  element.querySelector(".pp-member-del").addEventListener("click", () => {
    state.members = state.members.filter((candidate) => candidate !== member);
    element.remove();
  });
  $("members").appendChild(element);
  state.members.push(member);
  return member;
}

function readMemberRow(member) {
  const element = member.el;
  const kind = element.querySelector(".m-type").value;
  const address = element.querySelector(".m-kt").value.trim();
  const id = Math.max(0, parseInt(element.querySelector(".m-tid").value, 10) || 0);
  const amount = Math.max(1, parseInt(element.querySelector(".m-qty").value, 10) || 1);
  return {
    name: element.querySelector(".m-name").value.trim(),
    kind,
    ...(kind === "escrow" ? { fa2: address, tokenId: id, amount } : { adapter: address, resourceId: id, amount }),
    uri: element.querySelector(".m-uri").value.trim(),
    mimeType: element.querySelector(".m-mime").value.trim(),
  };
}

function applyDraftMembers(members) {
  state.members.forEach((member) => member.el.remove());
  state.members = [];
  (Array.isArray(members) && members.length ? members : [{}]).forEach(addMemberRow);
}

function normalizeAction(raw) {
  const kind = String(raw?.kind || raw?.type || "").trim();
  if (kind === "escrow") {
    return {
      kind,
      fa2: String(raw.fa2 || raw.tokenContract || "").trim(),
      tokenId: Math.max(0, Number(raw.tokenId ?? raw.token_id ?? 0) || 0),
      amount: Math.max(1, Number(raw.amount ?? raw.quantity ?? 1) || 1),
      name: String(raw.name || "").trim(),
      uri: String(raw.uri || "").trim(),
      mimeType: String(raw.mimeType || "").trim(),
    };
  }
  if (kind === "allocated" || kind === "generative") {
    return {
      kind,
      adapter: String(raw.adapter || "").trim(),
      resourceId: Math.max(0, Number(raw.resourceId ?? raw.resource_id ?? 0) || 0),
      amount: kind === "allocated" ? Math.max(1, Number(raw.amount ?? raw.quantity ?? 1) || 1) : 1,
      name: String(raw.name || "").trim(),
      uri: String(raw.uri || "").trim(),
      mimeType: String(raw.mimeType || "").trim(),
    };
  }
  throw new Error(`unknown recipe action kind: ${kind || "empty"}`);
}

function readRecipes(editions) {
  const advanced = $("recipeJson").value.trim();
  let recipes;
  if (advanced) {
    const parsed = JSON.parse(advanced);
    if (!Array.isArray(parsed)) throw new Error("advanced recipe matrix must be an array");
    recipes = parsed.map((recipe) => {
      if (!Array.isArray(recipe)) throw new Error("every advanced recipe must be an action array");
      return recipe.map(normalizeAction);
    });
  } else {
    const visible = state.members.map(readMemberRow).map(normalizeAction);
    recipes = Array.from({ length: editions }, () => visible.map((action) => ({ ...action })));
  }
  if (recipes.length !== editions) throw new Error(`expected ${editions} recipes, received ${recipes.length}`);
  const itemCount = recipes[0]?.length || 0;
  if (itemCount < 1 || itemCount > 8) throw new Error("each pack recipe must contain 1–8 actions");
  if (recipes.some((recipe) => recipe.length !== itemCount)) throw new Error("every pack recipe must have the same action count");
  return recipes;
}

function validateMode(mode, recipes) {
  const every = (kind) => recipes.every((recipe) => recipe.every((action) => action.kind === kind));
  if (mode === 0 && !every("escrow")) throw new Error("deterministic vault recipes may contain only escrowed existing tokens");
  if (mode === 1 && !every("escrow")) throw new Error("blind funded-pool recipes may contain only escrowed existing tokens");
  if (mode === 2 && !every("allocated")) throw new Error("allocation packs may contain only Gnocchi allocation actions");
  if (mode === 3 && !every("generative")) throw new Error("generative packs may contain only Rotini generation actions");
  if (mode === 4) {
    for (const recipe of recipes) {
      const kinds = new Set(recipe.map((action) => action.kind));
      for (const kind of ["escrow", "allocated", "generative"]) {
        if (!kinds.has(kind)) throw new Error("every hybrid recipe must include escrow, allocation, and generative actions");
      }
    }
  }
}

async function importPackage(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return MD.notify("That file is not valid JSON.", "error");
  }
  return importCheasePackage(parsed, "file");
}

function importCheasePackage(parsed, source) {
  const result = validateCheasePackage(parsed);
  if (!result.ok || !isCheasePackage(parsed)) return MD.notify(`Invalid CH-EASE package:\n${result.errors.join("\n")}`, "error");
  const items = parsed.kind === "collection" ? parsed.items : [parsed.token];
  if (parsed.kind === "collection") {
    if (parsed.title) $("bnName").value = parsed.title;
    if (parsed.symbol) $("collSymbol").value = parsed.symbol;
    if (parsed.description) $("bnDesc").value = parsed.description;
  } else {
    if (parsed.token?.name) $("bnName").value = parsed.token.name;
    if (parsed.token?.description) $("bnDesc").value = parsed.token.description;
  }
  if (parsed.relationship) {
    $("relParent").value = parsed.relationship.parent_contract || "";
    $("relFranchise").value = parsed.relationship.franchise_contract || "";
    $("relGroup").value = parsed.relationship.collection_group || "";
  }
  for (const member of [...state.members]) {
    const row = readMemberRow(member);
    if (!row.name && !row.fa2 && !row.uri) {
      state.members = state.members.filter((candidate) => candidate !== member);
      member.el.remove();
    }
  }
  for (const item of items) {
    addMemberRow({
      name: item.name,
      kind: "escrow",
      tokenContract: item.tokenContract,
      tokenId: item.tokenId,
      uri: item.artifactUri || item.previewUri,
      mimeType: item.mimeType,
    });
  }
  log(`imported ${items.length} recipe reference(s) from CH-EASE ${source || "package"}`);
  MD.notify(`Imported ${items.length} recipe reference(s) from CH-EASE. Add a KT1/token id to every delivered item.`, "success");
}

async function connect() {
  try {
    state.network = $("network").value;
    MD.setupToolkit(state.network);
    await MD.connectWallet("Ravioli");
    $("account").textContent = MD.short(MD.getAccount());
    if (!$("refundHolder").value.trim()) $("refundHolder").value = MD.getAccount();
    if (!$("refundDestination").value.trim()) $("refundDestination").value = MD.getAccount();
    renderLatestPublishRecovery();
    log(`connected ${MD.getAccount()} on ${state.network}`);
  } catch (error) {
    log(`connect failed: ${error.message || error}`, "err");
    MD.notify(`Connect failed: ${error.message || error}`, "error");
  }
}

async function nextTokenId(address) {
  const contract = await MD.getToolkit().contract.at(address);
  const storage = await contract.storage();
  return bigToNum(storage.next_token_id);
}

async function requireConfiguredAutoAdapterIdentities(recipes) {
  if (!$("autoAdapters").checked) return;
  const usesAllocated = recipes.some((recipe) =>
    recipe.some((action) => action.kind === "allocated")
  );
  const usesGenerative = recipes.some((recipe) =>
    recipe.some((action) => action.kind === "generative")
  );
  const gnocchiAdapter = $("gAdapterKt").value.trim();
  const rotiniAdapter = $("rAdapterKt").value.trim();
  if (usesAllocated && gnocchiAdapter) {
    await requireExactBundledContractCode(
      requiredKt1(gnocchiAdapter, "Gnocchi adapter"),
      "gnocchiAdapter",
      "Gnocchi adapter",
      "adapter",
    );
  }
  if (usesGenerative && rotiniAdapter) {
    await requireExactBundledContractCode(
      requiredKt1(rotiniAdapter, "Rotini adapter"),
      "rotiniAdapter",
      "Rotini adapter",
      "adapter",
    );
  }
}

async function setupAdapters(routerAddress, recipes, admin, deploymentPreflight) {
  const usesAllocated = recipes.some((recipe) => recipe.some((action) => action.kind === "allocated"));
  const usesGenerative = recipes.some((recipe) => recipe.some((action) => action.kind === "generative"));
  const auto = $("autoAdapters").checked;
  const tezos = MD.getToolkit();

  if (usesAllocated) {
    let adapter = $("gAdapterKt").value.trim();
    if (auto) {
      const target = $("gTargetKt").value.trim();
      if (!MD.isAddress(target) || !target.startsWith("KT1")) throw new Error("enter the Gnocchi KT1 used by allocated actions");
      if (!adapter) {
        adapter = await originateAdapter(
          admin,
          "Gnocchi",
          "gnocchiAdapter",
          deploymentPreflight,
        );
      } else {
        await requireExactBundledContractCode(
          adapter,
          "gnocchiAdapter",
          "Gnocchi adapter",
          "adapter",
        );
      }
      const adapterContract = await tezos.wallet.at(adapter);
      const adapterRead = await tezos.contract.at(adapter);
      const adapterStorageValue = await adapterRead.storage();
      const resourceId = bigToNum(adapterStorageValue.next_resource_id);
      const allocatedActions = recipes.flat().filter((action) => action.kind === "allocated");
      const amounts = new Set(allocatedActions.map((action) => action.amount));
      if (amounts.size !== 1) throw new Error("automatic Gnocchi adapter setup requires the same amount per opening in every allocation recipe");
      const targetContract = await tezos.wallet.at(target);
      log("authorizing allocation adapter on Gnocchi (sign in wallet)…");
      let operation = await sendTrackedPublishOperation(null, "AUTHORIZE_GNOCCHI_ADAPTER", {
        action: "call", target, entrypoint: "add_minter", payload: adapter,
      }, () => targetContract.methodsObject.add_minter(adapter).send());
      const allocationPayload = {
        target,
        token_id: Math.max(0, parseInt($("gTokenId").value, 10) || 0),
        amount_per_open: allocatedActions[0].amount,
        active: true,
      };
      operation = await sendTrackedPublishOperation(null, "CREATE_GNOCCHI_ALLOCATION", {
        action: "call", target: adapter, entrypoint: "create_allocation", payload: allocationPayload,
      }, () => adapterContract.methodsObject.create_allocation(allocationPayload).send());
      operation = await sendTrackedPublishOperation(null, "AUTHORIZE_GNOCCHI_ROUTER", {
        action: "call", target: adapter, entrypoint: "add_router", payload: routerAddress,
      }, () => adapterContract.methodsObject.add_router(routerAddress).send());
      recipes.flat().filter((action) => action.kind === "allocated").forEach((action) => {
        action.adapter = adapter;
        action.resourceId = resourceId;
      });
      $("gAdapterKt").value = adapter;
    } else {
      recipes.flat().filter((action) => action.kind === "allocated" && !action.adapter).forEach((action) => { action.adapter = adapter; });
    }
  }

  if (usesGenerative) {
    let adapter = $("rAdapterKt").value.trim();
    if (auto) {
      const target = $("rTargetKt").value.trim();
      if (!MD.isAddress(target) || !target.startsWith("KT1")) throw new Error("enter the Rotini KT1 used by generative actions");
      if (!adapter) {
        adapter = await originateAdapter(
          admin,
          "Rotini",
          "rotiniAdapter",
          deploymentPreflight,
        );
      } else {
        await requireExactBundledContractCode(
          adapter,
          "rotiniAdapter",
          "Rotini adapter",
          "adapter",
        );
      }
      const adapterRead = await tezos.contract.at(adapter);
      const adapterStorageValue = await adapterRead.storage();
      const resourceId = bigToNum(adapterStorageValue.next_resource_id);
      const targetContract = await tezos.wallet.at(target);
      const adapterContract = await tezos.wallet.at(adapter);
      log("authorizing generative adapter on Rotini (sign in wallet)…");
      let operation = await sendTrackedPublishOperation(null, "AUTHORIZE_ROTINI_ADAPTER", {
        action: "call", target, entrypoint: "add_pack_minter", payload: adapter,
      }, () => targetContract.methodsObject.add_pack_minter(adapter).send());
      const resourcePayload = {
        target,
        project_id: Math.max(0, parseInt($("rProjectId").value, 10) || 0),
        active: true,
      };
      operation = await sendTrackedPublishOperation(null, "CREATE_ROTINI_RESOURCE", {
        action: "call", target: adapter, entrypoint: "create_resource", payload: resourcePayload,
      }, () => adapterContract.methodsObject.create_resource(resourcePayload).send());
      operation = await sendTrackedPublishOperation(null, "AUTHORIZE_ROTINI_ROUTER", {
        action: "call", target: adapter, entrypoint: "add_router", payload: routerAddress,
      }, () => adapterContract.methodsObject.add_router(routerAddress).send());
      recipes.flat().filter((action) => action.kind === "generative").forEach((action) => {
        action.adapter = adapter;
        action.resourceId = resourceId;
      });
      $("rAdapterKt").value = adapter;
    } else {
      recipes.flat().filter((action) => action.kind === "generative" && !action.adapter).forEach((action) => { action.adapter = adapter; });
    }
  }

  for (const action of recipes.flat()) {
    const address = action.kind === "escrow" ? action.fa2 : action.adapter;
    if (!MD.isAddress(address) || !address.startsWith("KT1")) throw new Error(`${action.kind} action needs a valid KT1 contract`);
  }
}

async function approveEscrow(routerAddress, recipes, owner) {
  const byContract = new Map();
  for (const action of recipes.flat()) {
    if (action.kind !== "escrow") continue;
    const list = byContract.get(action.fa2) || new Set();
    list.add(action.tokenId);
    byContract.set(action.fa2, list);
  }
  let authorizationOrdinal = 0;
  for (const [fa2, tokenIds] of byContract) {
    authorizationOrdinal += 1;
    const contract = await MD.getToolkit().wallet.at(fa2);
    const updates = [...tokenIds].map((tokenId) => ({ add_operator: { owner, operator: routerAddress, token_id: tokenId } }));
    log(`approving Ravioli escrow on ${MD.short(fa2)} (sign in wallet)…`);
    await sendTrackedPublishOperation(null, `AUTHORIZE_ESCROW_${authorizationOrdinal}`, {
      action: "call", target: fa2, entrypoint: "update_operators", payload: updates,
    }, () => contract.methodsObject.update_operators(updates).send());
  }
}

async function preflightEscrowInventory(recipes, owner) {
  const requiredByAsset = new Map();
  for (const action of recipes.flat()) {
    if (action.kind !== "escrow") continue;
    const fa2 = requiredKt1(action.fa2, "escrow inventory contract");
    const tokenId = requiredNat(action.tokenId, "escrow inventory token id");
    const amount = requiredNat(action.amount, "escrow inventory amount");
    const key = `${fa2}:${tokenId}`;
    const current = requiredByAsset.get(key);
    requiredByAsset.set(key, {
      fa2,
      tokenId,
      required: (current?.required || 0) + amount,
    });
  }
  const checks = [];
  for (const requirement of requiredByAsset.values()) {
    const contract = await MD.getToolkit().contract.at(requirement.fa2);
    const available = requiredNat(
      await executeContractView(
        contract,
        "get_balance",
        { owner, token_id: requirement.tokenId },
        `Escrow FA2 ${MD.short(requirement.fa2)}`,
        owner,
      ),
      `Escrow FA2 ${requirement.fa2} token ${requirement.tokenId} balance`,
    );
    if (available < requirement.required) {
      throw new Error(
        `Escrow inventory is short for ${MD.short(requirement.fa2)} token ${requirement.tokenId}: `
        + `${requirement.required} required across every recipe, ${available} available`,
      );
    }
    checks.push({ ...requirement, available });
  }
  return checks;
}

function reservationFor(action) {
  if (action.kind === "escrow") return { escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } };
  const value = {
    adapter: action.adapter,
    resource_id: action.resourceId,
    // Allocated recipes have one exact, empty adapter payload. Generative
    // output does not exist yet, so null deliberately commits the separate
    // generated-at-open policy rather than pretending an artifact was fixed.
    payload_commitment: action.kind === "allocated" ? payloadCommitment("") : null,
  };
  return action.kind === "allocated" ? { allocated_mint: value } : { generative_mint: value };
}

function kitAction(action) {
  if (action.kind === "escrow") return { kind: "escrow", fa2: action.fa2, tokenId: action.tokenId, amount: action.amount };
  return {
    kind: action.kind,
    adapter: action.adapter,
    resourceId: action.resourceId,
    payloadCommitment: action.kind === "allocated" ? payloadCommitment("") : null,
  };
}

async function publish() {
  $("btnPublish").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    state.currentPublishRecoveryKey = "";
    const admin = MD.getAccount();
    const provider = pinProvider();
    const name = $("bnName").value.trim();
    if (!name) throw new Error("the pack needs a name");
    const mode = Math.max(0, Math.min(4, parseInt($("bnMode").value, 10) || 0));
    const blind = mode > 0;
    const editions = Math.max(1, Math.min(64, parseInt($("bnEditions").value, 10) || 1));
    const saleCount = Math.max(1, parseInt($("bnSaleCount").value, 10) || 1);
    const recipes = readRecipes(editions);
    validateMode(mode, recipes);
    const existingRouter = targetMode() === "existing_contract"
      ? await inspectExistingRavioliRouter($("existingKt").value)
      : null;
    const freshDeployment = await requireFreshDeploymentCertificate();
    await requireConfiguredAutoAdapterIdentities(recipes);
    const wrapperSaleStart = optionalDateTime("bnSaleStart", "Ravioli sale start");
    const wrapperSaleEnd = optionalDateTime("bnSaleEnd", "Ravioli sale end");
    const revealDeadline = blind ? optionalDateTime("bnRevealDeadline", "Ravioli reveal deadline") : null;
    const openDeadline = blind ? optionalDateTime("bnOpenDeadline", "Ravioli delivery / refund cutoff") : null;
    const editionConstraint = await resolveChildEditionPolicies(recipes, {
      wrapperSaleEnabled: $("bnForSale").checked,
      wrapperSaleStart,
      wrapperSaleEnd,
    });
    const productWindow = validateProductWindow({
      mode,
      editions,
      saleCount,
      saleEnabled: $("bnForSale").checked,
      saleStart: wrapperSaleStart,
      saleEnd: wrapperSaleEnd,
      revealDeadline,
      openDeadline,
      earliestChildEnd: editionConstraint.earliestChildEnd,
    });
    const escrowInventory = await preflightEscrowInventory(recipes, admin);
    if (escrowInventory.length) {
      log(`verified cumulative funded-pool inventory for ${escrowInventory.length} escrow asset${escrowInventory.length === 1 ? "" : "s"} before pins or writes`);
    }
    $("bnEditionPolicy").textContent = blind
      ? editionConstraint.requiresLimitedWrapper
        ? `Limited Edition wrapper · sale ends ${new Date(wrapperSaleEnd).toLocaleString()} · reveal by ${new Date(revealDeadline).toLocaleString()} (no later than child expiry ${new Date(editionConstraint.earliestChildEnd).toLocaleString()}) · reserved-child delivery/refund cutoff ${new Date(openDeadline).toLocaleString()}`
        : `Limited Edition wrapper · full supply ${editions} · sale ends ${new Date(wrapperSaleEnd).toLocaleString()} · reveal by ${new Date(revealDeadline).toLocaleString()} · delivery/refund cutoff ${new Date(openDeadline).toLocaleString()}`
      : `${productWindow.wrapperEditionClass === "limited-edition" ? "Limited Edition" : "Fixed-supply"} deterministic vault · ${editions} wrapper${editions === 1 ? "" : "s"}`;
    const relationship = readRelationship();
    beginPublishRecovery({
      network: state.network,
      account: admin,
      name,
      mode: MODE_NAMES[mode],
      editions,
      contract: existingRouter?.address || null,
      tokenId: existingRouter?.tokenId ?? null,
      workflow: "publish",
      expectedTerminalStage: blind
        ? "FINALIZE_BLIND_PACK"
        : ($("bnForSale").checked ? "SET_WRAPPER_SALE" : "MINT_WRAPPER_SUPPLY"),
    });
    recoveryStarted = true;

    let wrapperArtifactUri;
    let wrapperMimeType;
    const wrapperFile = $("bnArtifact").files?.[0];
    if (wrapperFile) {
      log("pinning wrapper artwork…");
      wrapperArtifactUri = await trackedPublishPinBlob(provider, wrapperFile, wrapperFile.name, "PIN_WRAPPER_ARTIFACT");
      wrapperMimeType = wrapperFile.type;
    }

    let routerAddress;
    let blindControllerAddress;
    let tokenId;
    if (!existingRouter) {
      const controllerMetadata = {
        name: "Pasta Ravioli Blind Pack Controller",
        description: "Typed Ravioli v3 claim, reveal, proceeds-escrow, delivery-cutoff, and refund controller.",
        interfaces: ["TZIP-016"],
        pasta: { app: "ravioli", helper: "blind-pack-controller", version: 3 },
      };
      log("pinning blind-controller contract metadata…");
      const controllerMetadataUri = await trackedPublishPinJson(
        provider,
        controllerMetadata,
        "pasta-ravioli-blind-controller-contract.json",
        "PIN_BLIND_CONTROLLER_METADATA",
      );

      let coverUri;
      const cover = $("collCover").files?.[0];
      if (cover) coverUri = await trackedPublishPinBlob(provider, cover, cover.name, "PIN_COLLECTION_COVER");
      const collectionMetadata = buildCollectionMetadata({
        name: $("collName").value.trim() || "Ravioli Atomic Packs",
        symbol: $("collSymbol").value.trim() || "RAV",
        imageUri: coverUri,
        relationship,
        interfaces: ["TZIP-012", "TZIP-016"],
        extra: {
          ravioli: {
            version: 3,
            fulfillment: "atomic-router-and-blind-controller",
            controllerBinding: "immutable-router-storage",
            transferExpiry: "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed",
          },
        },
      });
      const collectionUri = await trackedPublishPinJson(provider, collectionMetadata, "collection.json", "PIN_COLLECTION_METADATA");
      requireCertifiedDeploymentUris(freshDeployment, {
        "Blind-controller metadata URI": controllerMetadataUri,
        "Router collection metadata URI": collectionUri,
      });
      blindControllerAddress = await originate(
        freshDeployment.blindController,
        blindControllerStorage(controllerMetadataUri),
        "Ravioli blind pack controller",
        "ORIGINATE_RAVIOLI_BLIND_CONTROLLER",
      );
      routerAddress = await originate(
        freshDeployment.router,
        routerStorage(admin, collectionUri, blindControllerAddress),
        "Ravioli pack router",
        "ORIGINATE_RAVIOLI_ROUTER",
      );
      tokenId = 0;
      MD.recordColanderContract(routerAddress, "ravioli");
      MD.recordColanderContract(blindControllerAddress, "ravioli");
      MD.logEvent("ravioli.collection_deployed", "Ravioli deployed a reusable atomic pack router/controller pair", {
        contract: routerAddress,
        blind_controller: blindControllerAddress,
        network: state.network,
      });
    } else {
      routerAddress = existingRouter.address;
      blindControllerAddress = existingRouter.controllerAddress;
      tokenId = existingRouter.tokenId;
    }

    await setupAdapters(routerAddress, recipes, admin, freshDeployment);
    await approveEscrow(routerAddress, recipes, admin);

    // Adapter/resource addresses are part of the enforceable recipe, but blind
    // products must never pin them in plaintext before reveal. Their public
    // definition exposes only aggregate policy/counts; exact recipe identities
    // live in the authenticated ciphertext and chain-visible reservations.
    const publicMembers = recipes[0].map((action) => ({
      name: action.name,
      uri: action.uri,
      mimeType: action.mimeType,
      tokenContract: action.kind === "escrow" ? action.fa2 : action.adapter,
      tokenId: action.kind === "escrow" ? action.tokenId : action.resourceId,
      quantity: action.kind === "escrow" ? action.amount : 1,
    }));
    const baseManifest = buildBundleManifest({
      name,
      description: $("bnDesc").value.trim(),
      members: blind ? [] : publicMembers,
      mystery: blind,
      relationship,
    });
    const manifest = {
      ...baseManifest,
      schemaVersion: PACK_MANIFEST_SCHEMA,
      mode: MODE_NAMES[mode],
      maxSupply: editions,
      itemCount: recipes[0].length,
      funding: "fully-reserved-before-wrapper-issuance",
      fulfillment: "atomic-router-controller-and-typed-adapters",
      blindSecurity: blind ? "commit-reveal-ui-hidden-chain-public" : "public-recipe",
      assignmentPolicy: blind ? "precommitted-salted-cyclic-rotation" : "public-sequential",
      recipes: blind ? undefined : recipes.map((recipe) => recipe.map(kitAction)),
      editionPolicy: {
        requiresLimitedWrapper: editionConstraint.requiresLimitedWrapper,
        wrapperEditionClass: productWindow.wrapperEditionClass,
        earliestChildEnd: editionConstraint.earliestChildEnd,
        wrapperSaleStart,
        wrapperSaleEnd,
        revealDeadline,
        openDeadline,
        transferExpiry: blind ? "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed" : null,
        afterOpenDeadline: blind ? "refund-only; expiry credits the holder, who withdraws separately" : null,
        reservedChildPolicy: editionConstraint.requiresLimitedWrapper
          ? "Gnocchi capacity was reserved before public child expiry and remains deliverable without reopening public issuance"
          : null,
        childPolicySummary: {
          referencedResources: editionConstraint.childPolicies.length,
          limitedEditionResources: editionConstraint.childPolicies.filter((policy) => policy.maxSupply != null && policy.end != null).length,
          requiredCapacity: editionConstraint.childPolicies.reduce((total, policy) => total + requiredNat(policy.requiredCapacity || 0, "child policy capacity"), 0),
        },
      },
      generativeAuthenticity: recipes.flat().some((action) => action.kind === "generative")
        ? "The Rotini generator plus immutable pack/serial/action/project seed is canonical. PNG/GIF/ZIP output is a reproducible self-rendered cache and is not pixel-verified by the Tezos contract."
        : null,
    };
    log("pinning pack manifest…");
    const manifestUri = await trackedPublishPinJson(provider, manifest, "ravioli-pack-manifest.json", "PIN_PACK_MANIFEST");
    const publicKit = {
      schema: OPEN_KIT_SCHEMA,
      network: state.network,
      contract: routerAddress,
      tokenId,
      mode: MODE_NAMES[mode],
      manifestUri,
      blindSecurity: blind ? "commit-reveal-ui-hidden-chain-public" : "public",
      warning: "Exact recipes and nonces stay encrypted, while the salted cyclic serial rotation stays sealed/private until reveal. Tezos funding and reservation operations remain public.",
      editionPolicy: {
        requiresLimitedWrapper: editionConstraint.requiresLimitedWrapper,
        wrapperEditionClass: productWindow.wrapperEditionClass,
        earliestChildEnd: editionConstraint.earliestChildEnd,
        wrapperSaleStart,
        wrapperSaleEnd,
        revealDeadline,
        openDeadline,
      },
      recipes: recipes.map((recipe, serial) => ({ serial, nonce: randomHex(), actions: recipe.map(kitAction) })),
    };

    let kit = publicKit;
    let initialContentsUri = null;
    let revealCommitmentValue = null;
    let sealedContentsUri = null;
    if (blind) {
      const revealSalt = randomHex();
      const revealOffset = randomNatBelow(editions);
      const publicReveal = publicRevealDocument(publicKit);
      persistPublishRecovery(null, "SEALED_REVEAL_PREIMAGE_SAVED_BEFORE_PIN", null, "IN_PROGRESS", {
        salt: revealSalt,
        offset: revealOffset,
        publicReveal,
      });
      const sealedEnvelope = await encryptPublicReveal(publicReveal, revealSalt);
      const envelopeSha256 = await sha256Json(sealedEnvelope, "sealed Ravioli reveal envelope");
      log("pinning authenticated encrypted reveal (plaintext nonces remain private)…");
      sealedContentsUri = await trackedPublishPinJson(
        provider,
        sealedEnvelope,
        `ravioli-sealed-reveal-${tokenId}.json`,
        "PIN_SEALED_REVEAL",
      );
      revealCommitmentValue = await revealCommitment(sealedContentsUri, revealSalt, revealOffset);
      kit = {
        ...publicKit,
        sealedReveal: {
          schema: SEALED_REVEAL_REFERENCE_SCHEMA,
          contentsUri: sealedContentsUri,
          salt: revealSalt,
          offset: revealOffset,
          envelopeSha256,
        },
      };
      $("revealUri").value = sealedContentsUri;
    } else {
      log("pinning public open-kit reveal for the deterministic pack…");
      initialContentsUri = await trackedPublishPinJson(
        provider,
        publicRevealDocument(publicKit),
        `ravioli-public-reveal-${tokenId}.json`,
        "PIN_DETERMINISTIC_PUBLIC_REVEAL",
      );
      $("revealUri").value = initialContentsUri;
      persistPublishRecovery(null, "PUBLIC_REVEAL_PINNED", null, "IN_PROGRESS", { uri: initialContentsUri });
    }

    const childPolicySummary = {
      referencedResources: editionConstraint.childPolicies.length,
      limitedEditionResources: editionConstraint.childPolicies.filter((policy) => policy.maxSupply != null && policy.end != null).length,
      requiredCapacity: editionConstraint.childPolicies.reduce(
        (total, policy) => total + requiredNat(policy.requiredCapacity || 0, "child policy capacity"),
        0,
      ),
    };
    const tags = $("bnTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
    const tokenMetadata = buildTokenMetadata({
      name,
      description: $("bnDesc").value.trim() || undefined,
      symbol: $("collSymbol").value.trim() || "RAV",
      artifactUri: wrapperArtifactUri,
      mimeType: wrapperMimeType,
      creators: [admin],
      minter: admin,
      tags,
      relationship,
      extra: {
        ravioli: {
          version: 3,
          mode: MODE_NAMES[mode],
          itemCount: recipes[0].length,
          maxSupply: editions,
          manifestUri,
          sealedContentsUri: blind ? sealedContentsUri : undefined,
          revealCommitment: blind ? revealCommitmentValue : undefined,
          fulfillment: "atomic-router-controller",
          blindSecurity: blind ? "authenticated-ciphertext-until-reveal" : "public",
          assignmentPolicy: blind ? "precommitted-salted-cyclic-rotation" : "public-sequential",
          wrapperEditionClass: productWindow.wrapperEditionClass,
          transferExpiry: blind ? "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed" : null,
          postDeadlineAction: blind ? "refund-only; credit-holder-then-pull-withdraw" : null,
          generativeOutputAuthority: recipes.flat().some((action) => action.kind === "generative")
            ? "generator-and-immutable-seed; rendered artifact is a reproducible self-rendered cache"
            : null,
          editionPolicy: {
            requiresLimitedWrapper: editionConstraint.requiresLimitedWrapper,
            wrapperEditionClass: productWindow.wrapperEditionClass,
            earliestChildEnd: editionConstraint.earliestChildEnd,
            wrapperSaleStart,
            wrapperSaleEnd,
            revealDeadline,
            openDeadline,
            childPolicySummary,
          },
        },
      },
    });
    const tokenUri = await trackedPublishPinJson(provider, tokenMetadata, "token.json", "PIN_TOKEN_METADATA");

    // Every plaintext recipe nonce and blind reveal preimage now exists in a
    // durable private record before an irreversible commitment. Pre-sale
    // public metadata contains aggregate policy/counts plus the authenticated
    // ciphertext reference, never plaintext child identities or nonces.
    const encodedKit = JSON.stringify(kit);
    localStorage.setItem(openKitStorageKey(kit), encodedKit);
    if (localStorage.getItem(openKitStorageKey(kit)) !== encodedKit) {
      throw new Error("Ravioli could not durably save the open kit before commitment");
    }
    $("opKt").value = routerAddress;
    $("opTokenId").value = String(tokenId);
    $("openKit").value = JSON.stringify(kit, null, 2);
    persistPublishRecovery(kit, "OPEN_KIT_SAVED_BEFORE_COMMIT");
    downloadJson(kit, `ravioli-open-kit-${tokenId}.json`);

    const router = await MD.getToolkit().wallet.at(routerAddress);
    const info = new TZ.MichelsonMap();
    info.set("", MD.utf8ToHex(tokenUri));
    info.set("name", MD.utf8ToHex(name));
    info.set("symbol", MD.utf8ToHex($("collSymbol").value.trim() || "RAV"));
    info.set("decimals", MD.utf8ToHex("0"));
    info.set("pasta:packMode", MD.utf8ToHex(MODE_NAMES[mode]));
    info.set("pasta:fulfillment", MD.utf8ToHex("atomic"));
    info.set("pasta:editionClass", MD.utf8ToHex(productWindow.wrapperEditionClass));
    if (blind) info.set("pasta:transferExpiry", MD.utf8ToHex("reveal/open deadline; refund-only afterward"));

    log("registering bounded pack config (sign in wallet)…");
    const createPackPayload = {
      expected_token_id: tokenId,
      token_info: info,
      config: {
        mode,
        blind,
        item_count: recipes[0].length,
        max_supply: editions,
        committed_recipes: 0,
        finalized: false,
        cancelled: false,
        contents_uri: initialContentsUri ? MD.utf8ToHex(initialContentsUri) : null,
        manifest_uri: MD.utf8ToHex(manifestUri),
        child_expiry: editionConstraint.childExpiry,
        wrapper_sale_end: editionConstraint.requiresLimitedWrapper ? wrapperSaleEnd : null,
        reveal_deadline: blind ? revealDeadline : null,
        open_deadline: blind ? openDeadline : null,
        reveal_commitment: revealCommitmentValue,
      },
    };
    let operation = await sendTrackedPublishOperation(kit, "CREATE_PACK", {
      action: "call", target: routerAddress, entrypoint: "create_pack", payload: createPackPayload,
    }, () => router.methodsObject.create_pack(createPackPayload).send());

    for (let serial = 0; serial < recipes.length; serial += 1) {
      const recipe = recipes[serial];
      const nonce = kit.recipes[serial].nonce;
      log(`funding recipe ${serial + 1}/${recipes.length} (sign in wallet)…`);
      const commitPayload = {
        token_id: tokenId,
        nonce_commitment: nonceCommitment(nonce),
        reservations: recipe.map(reservationFor),
      };
      operation = await sendTrackedPublishOperation(kit, `COMMIT_RECIPE_${serial}`, {
        action: "call", target: routerAddress, entrypoint: "commit_recipe", payload: commitPayload,
      }, () => router.methodsObject.commit_recipe(commitPayload).send());
    }

    const price = Math.round(Math.max(0, Number($("bnPrice").value) || 0) * 1_000_000);
    if (blind) {
      log("atomically finalizing, issuing, and listing the complete finite blind-wrapper supply (sign in wallet)…");
      const finalizeBlindPayload = {
        token_id: tokenId,
        sale: {
          active: true,
          seller: admin,
          treasury: admin,
          price,
          remaining: editions,
          start: wrapperSaleStart,
          end: wrapperSaleEnd,
        },
      };
      operation = await sendTrackedPublishOperation(kit, "FINALIZE_BLIND_PACK", {
        action: "call", target: routerAddress, entrypoint: "finalize_blind_pack", payload: finalizeBlindPayload,
      }, () => router.methodsObject.finalize_blind_pack(finalizeBlindPayload).send());
      log("Limited Edition blind wrapper, full-supply primary sale, and controller deadlines activated atomically ✓");
    } else {
      log("finalizing pack after all backing is reserved (sign in wallet)…");
      operation = await sendTrackedPublishOperation(kit, "FINALIZE_PACK", {
        action: "call", target: routerAddress, entrypoint: "finalize_pack", payload: tokenId,
      }, () => router.methodsObject.finalize_pack(tokenId).send());
      log(`minting ${editions} backed wrapper edition(s) (sign in wallet)…`);
      const mintPayload = { to_: admin, token_id: tokenId, amount: editions };
      operation = await sendTrackedPublishOperation(kit, "MINT_WRAPPER_SUPPLY", {
        action: "call", target: routerAddress, entrypoint: "mint", payload: mintPayload,
      }, () => router.methodsObject.mint(mintPayload).send());
    }

    if ($("bnForSale").checked && !blind) {
      const salePayload = {
        token_id: tokenId,
        sale: { active: true, seller: admin, treasury: admin, price, remaining: saleCount, start: wrapperSaleStart, end: wrapperSaleEnd },
      };
      operation = await sendTrackedPublishOperation(kit, "SET_WRAPPER_SALE", {
        action: "call", target: routerAddress, entrypoint: "set_sale", payload: salePayload,
      }, () => router.methodsObject.set_sale(salePayload).send());
      log("direct wrapper sale opened ✓");
    }

    persistPublishRecovery(kit, "PACK_READY", null, "COMPLETE");
    try {
      MD.recordColanderContract(routerAddress, "ravioli");
      MD.logEvent("ravioli.bundle_published", "Ravioli published a fully backed atomic pack", { contract: routerAddress, network: state.network, tokenId, mode: MODE_NAMES[mode] });
      MD.logEvent("ravioli.pack_published", "Ravioli finalized every recipe before wrapper issuance", { contract: routerAddress, network: state.network, tokenId, mode: MODE_NAMES[mode], editions });
    } catch (bookkeepingError) {
      log(`pack is complete on Tezos; local Colander/event bookkeeping needs attention: ${bookkeepingError.message || bookkeepingError}`, "err");
    }
    log(`pack ${tokenId} is fully reserved and ready — open kit was saved before commitment`);
    MD.notify("Atomic pack deployed. The recovery/open kit was saved before commitment; keep it private until reveal.", "success");
  } catch (error) {
    if (recoveryStarted) {
      try { persistPublishRecovery(null, "PUBLISH_FAILED", null, "FAILED", { message: String(error?.message || error) }); } catch { /* preserve the original failure */ }
    }
    log(`publish failed: ${error.message || JSON.stringify(error)}`, "err");
    MD.notify(`Publish failed: ${error.message || error}`, "error");
  } finally {
    $("btnPublish").disabled = false;
  }
}

async function loadBundle() {
  try {
    const address = $("opKt").value.trim();
    if (!MD.isAddress(address)) throw new Error("enter the Ravioli KT1");
    const tokenId = Math.max(0, parseInt($("opTokenId").value, 10) || 0);
    const inspected = await inspectExistingRavioliRouter(address, { requireAdministrator: false });
    const storage = await inspected.contract.storage();
    const config = await typedBigMapGet(storage.packs, tokenId);
    if (!config) throw new Error("no Ravioli v3 pack at that token id");
    const controllerStatus = await requireControllerPackAgreement(inspected, storage, config, tokenId);
    const supply = bigToNum(await typedBigMapGet(storage.total_supply, tokenId));
    const opened = bigToNum(await typedBigMapGet(storage.opened, tokenId));
    const mode = MODE_NAMES[bigToNum(config.mode)] || `mode_${config.mode}`;
    const deadlines = controllerStatus
      ? ` · sale ends ${new Date(optionalTimestamp(controllerStatus.sale_end, "Ravioli sale end")).toLocaleString()} · reveal by ${new Date(optionalTimestamp(controllerStatus.reveal_deadline, "Ravioli reveal deadline")).toLocaleString()} · open/refund cutoff ${new Date(optionalTimestamp(controllerStatus.open_deadline, "Ravioli open deadline")).toLocaleString()}`
      : "";
    $("opInfo").textContent = `${mode} · ${bigToNum(config.item_count)} item(s) per open · live wrapper supply ${supply} · opened ${opened}/${bigToNum(config.max_supply)} · ${config.finalized ? "fully reserved" : "not finalized"}${deadlines}`;
    if (controllerStatus && MD.getAccount()) {
      const credit = requiredNat(
        await executeContractView(inspected.controller, "get_refund_credit", MD.getAccount(), "Ravioli blind controller", MD.getAccount()),
        "Ravioli refund credit",
      );
      $("refundInfo").textContent = credit > 0
        ? `Connected holder has ${(credit / 1_000_000).toFixed(6)} tez in pull-based refund credit.`
        : "Connected holder has no refundable credit yet.";
      if (!$("refundHolder").value.trim()) $("refundHolder").value = MD.getAccount();
      if (!$("refundDestination").value.trim() && /^tz[1-4]/.test(MD.getAccount())) $("refundDestination").value = MD.getAccount();
    } else {
      $("refundInfo").textContent = controllerStatus ? "Connect the credited holder to inspect or withdraw refund credit." : "";
    }
    const stored = localStorage.getItem(`pasta.ravioli.open-kit.v3:${state.network}:${address}:${tokenId}`);
    if (stored && !$("openKit").value.trim()) $("openKit").value = JSON.stringify(JSON.parse(stored), null, 2);
    const recovery = recoveryRecords().find((record) =>
      record.network === state.network &&
      record.contract === address &&
      typeof record.tokenId === "number" &&
      Number.isSafeInteger(record.tokenId) &&
      record.tokenId === tokenId
    ) || null;
    if (recovery?.schema === PUBLISH_RECOVERY_SCHEMA) {
      $("publishRecoveryInfo").textContent = recovery.status === "COMPLETE"
        ? "The local recovery journal records this pack as complete."
        : `Unfinished local recovery journal: ${recovery.history?.at(-1)?.stage || "unknown stage"}. Export it and verify the last operation; Ravioli will not retry it automatically.`;
      renderLatestPublishRecovery();
    }
  } catch (error) {
    $("opInfo").textContent = "";
    renderLatestPublishRecovery();
    MD.notify(`Could not load pack: ${error.message || error}`, "error");
  }
}

async function creditExpiredRefund() {
  $("btnCreditRefund").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    const address = requiredKt1($("opKt").value, "Ravioli router");
    const tokenId = requiredNat($("opTokenId").value, "Ravioli pack token id");
    const holder = String($("refundHolder").value || MD.getAccount()).trim();
    if (!MD.isAddress(holder)) throw new Error("current wrapper holder must be a valid Tezos address");
    const inspected = await inspectExistingRavioliRouter(address, { requireAdministrator: false });
    const storage = await inspected.contract.storage();
    const pack = await typedBigMapGet(storage.packs, tokenId);
    if (!pack || bigToNum(pack.mode) === 0) throw new Error("selected token is not a blind Ravioli pack");
    await requireControllerPackAgreement(inspected, storage, pack, tokenId);
    const claim = await resolveStudioClaim(inspected, tokenId, holder);
    const quotePayload = {
      pack_contract: address,
      pack_token_id: tokenId,
      holder,
      amount: 1,
      expected_claim_id: claim.expectedClaimId,
    };
    const [quotedRefund, creditBefore] = await Promise.all([
      executeContractView(inspected.controller, "quote_refund", quotePayload, "Ravioli blind controller", MD.getAccount()),
      executeContractView(inspected.controller, "get_refund_credit", holder, "Ravioli blind controller", MD.getAccount()),
    ]);
    const refund = requiredNat(quotedRefund, "Ravioli refund quote");
    const priorCredit = requiredNat(creditBefore, "Ravioli prior refund credit");
    state.currentPublishRecoveryKey = "";
    beginPublishRecovery({
      network: state.network,
      account: MD.getAccount(),
      name: `Credit Ravioli refund for ${holder}`,
      mode: MODE_NAMES[bigToNum(pack.mode)] || "blind",
      editions: 1,
      contract: address,
      tokenId,
      workflow: "refund",
      expectedTerminalStage: "REFUND_BLIND_CLAIM",
    });
    recoveryStarted = true;
    persistPublishRecovery(null, "REFUND_PREFLIGHT_VERIFIED", null, "IN_PROGRESS", {
      holder,
      claimCountBefore: claim.count,
      expectedClaimId: claim.expectedClaimId,
      refund,
      creditBefore: priorCredit,
    });
    const payload = {
      token_id: tokenId,
      holder,
      amount: 1,
      expected_claim_id: claim.expectedClaimId,
    };
    const router = await MD.getToolkit().wallet.at(address);
    const operation = await sendTrackedPublishOperation(null, "REFUND_BLIND_CLAIM", {
      action: "call",
      target: address,
      entrypoint: "refund_blind_claims",
      payload,
    }, () => router.methodsObject.refund_blind_claims(payload).send());
    persistPublishRecovery(null, "REFUND_CREDITED", operation, "COMPLETE", {
      holder,
      refund,
      expectedCredit: priorCredit + refund,
    });
    MD.logEvent("ravioli.refund_credited", "Ravioli credited an expired wrapper claim refund to its current holder", {
      contract: address,
      network: state.network,
      tokenId,
      holder,
      amount: refund,
    });
    $("refundInfo").textContent = `${(refund / 1_000_000).toFixed(6)} tez was credited to ${holder}. The holder must withdraw it separately.`;
    MD.notify("Expired claim burned and its refund credited to the current holder.", "success");
    await loadBundle();
  } catch (error) {
    if (recoveryStarted) {
      try { persistPublishRecovery(null, "REFUND_FAILED", null, "FAILED", { message: String(error?.message || error) }); } catch { /* preserve original */ }
    }
    log(`refund credit failed: ${error.message || error}`, "err");
    MD.notify(`Refund credit failed: ${error.message || error}`, "error");
  } finally {
    $("btnCreditRefund").disabled = false;
  }
}

async function cancelUnrevealedPack() {
  $("btnCancelUnrevealed").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect a wallet before closing the unrevealed pack");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    const address = requiredKt1($("opKt").value, "Ravioli router");
    const tokenId = requiredNat($("opTokenId").value, "Ravioli pack token id");
    const inspected = await inspectExistingRavioliRouter(address, { requireAdministrator: false });
    const storage = await inspected.contract.storage();
    const pack = await typedBigMapGet(storage.packs, tokenId);
    if (!pack || bigToNum(pack.mode) === 0) throw new Error("selected token is not a blind Ravioli pack");
    if (pack.cancelled) throw new Error("selected Ravioli pack is already closed");
    const status = await requireControllerPackAgreement(inspected, storage, pack, tokenId);
    if (status.revealed || optionValue(status.contents_uri) != null) throw new Error("revealed packs cannot use unrevealed-pack closure");
    const revealDeadline = optionalTimestamp(status.reveal_deadline, "Ravioli reveal deadline");
    const chainTimestampMs = await currentChainTimestampMs(
      "Ravioli unrevealed-pack closure chain timestamp",
    );
    if (chainTimestampMs < Date.parse(revealDeadline)) throw new Error("unrevealed-pack closure is unavailable before the reveal deadline");
    const outstanding = requiredNat(status.outstanding, "Ravioli outstanding claims");
    const unclaimed = requiredNat(status.unclaimed, "Ravioli unclaimed inventory");
    const escrowed = requiredNat(status.escrowed, "Ravioli proceeds escrow");
    if (outstanding !== 0 || escrowed !== 0) {
      throw new Error("refund every purchased claim before closing this unrevealed pack");
    }
    state.currentPublishRecoveryKey = "";
    beginPublishRecovery({
      network: state.network,
      account: MD.getAccount(),
      name: `Close unrevealed Ravioli pack ${tokenId}`,
      mode: MODE_NAMES[bigToNum(pack.mode)] || "blind",
      editions: requiredNat(pack.max_supply, "Ravioli pack supply"),
      contract: address,
      tokenId,
      workflow: "cancel_unrevealed",
      expectedTerminalStage: "CANCEL_UNREVEALED_PACK",
    });
    recoveryStarted = true;
    persistPublishRecovery(null, "CANCEL_UNREVEALED_PREFLIGHT_VERIFIED", null, "IN_PROGRESS", {
      outstanding,
      unclaimed,
      escrowed,
      revealDeadline,
      chainTimestamp: new Date(chainTimestampMs).toISOString(),
    });
    const router = await MD.getToolkit().wallet.at(address);
    const operation = await sendTrackedPublishOperation(null, "CANCEL_UNREVEALED_PACK", {
      action: "call",
      target: address,
      entrypoint: "cancel_unrevealed_pack",
      payload: tokenId,
    }, () => router.methodsObject.cancel_unrevealed_pack(tokenId).send());
    const refreshedStorage = await inspected.contract.storage();
    const refreshedPack = await typedBigMapGet(refreshedStorage.packs, tokenId);
    const refreshedStatus = await requireControllerPackAgreement(
      inspected,
      refreshedStorage,
      refreshedPack,
      tokenId,
    );
    const refreshedSupply = requiredNat(
      await typedBigMapGet(refreshedStorage.total_supply, tokenId),
      "Ravioli closed wrapper supply",
    );
    if (
      !refreshedPack?.cancelled
      || refreshedPack.finalized
      || !refreshedStatus?.cancelled
      || requiredNat(refreshedStatus.outstanding, "Ravioli closed outstanding claims") !== 0
      || requiredNat(refreshedStatus.unclaimed, "Ravioli closed unclaimed inventory") !== 0
      || requiredNat(refreshedStatus.escrowed, "Ravioli closed proceeds escrow") !== 0
      || refreshedSupply !== 0
    ) {
      throw new Error("confirmed unrevealed-pack closure does not match terminal router/controller state");
    }
    persistPublishRecovery(null, "CANCEL_UNREVEALED_POSTCONDITION_VERIFIED", operation, "COMPLETE", {
      outstanding: 0,
      unclaimed: 0,
      escrowed: 0,
      supply: 0,
    });
    MD.logEvent("ravioli.unrevealed_pack_cancelled", "Ravioli closed a fully refunded unrevealed pack", {
      contract: address,
      network: state.network,
      tokenId,
    });
    $("closureInfo").textContent = "Unrevealed pack closed with zero wrappers, claims, inventory, and escrow. Existing holder withdrawal credits remain available.";
    MD.notify("Unrevealed Ravioli pack closed after complete refund settlement.", "success");
    await loadBundle();
  } catch (error) {
    if (recoveryStarted) {
      try { persistPublishRecovery(null, "CANCEL_UNREVEALED_FAILED", null, "FAILED", { message: String(error?.message || error) }); } catch { /* preserve original */ }
    }
    log(`unrevealed-pack closure failed: ${error.message || error}`, "err");
    MD.notify(`Unrevealed-pack closure failed: ${error.message || error}`, "error");
  } finally {
    $("btnCancelUnrevealed").disabled = false;
  }
}

async function recoverAdapterCapacity() {
  $("btnRecoverAdapter").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect the pack administrator first");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    const address = requiredKt1($("opKt").value, "Ravioli router");
    const tokenId = requiredNat($("opTokenId").value, "Ravioli pack token id");
    const adapter = requiredKt1($("recoverAdapter").value, "Ravioli adapter");
    const kind = requiredNat($("recoverAdapterKind").value, "Ravioli adapter kind");
    const resourceId = requiredNat($("recoverResourceId").value, "Ravioli adapter resource id");
    const capacity = requiredNat($("recoverCapacity").value, "Ravioli recovery capacity");
    if (![1, 2].includes(kind)) throw new Error("adapter kind must be Gnocchi (1) or Rotini (2)");
    if (capacity < 1) throw new Error("recovery capacity must be at least one");

    const inspected = await inspectExistingRavioliRouter(address);
    const storage = await inspected.contract.storage();
    const pack = await typedBigMapGet(storage.packs, tokenId);
    if (!pack?.cancelled) {
      throw new Error("adapter capacity can only be recovered from a cancelled pack");
    }
    await requireExactBundledContractCode(
      adapter,
      kind === 1 ? "gnocchiAdapter" : "rotiniAdapter",
      kind === 1 ? "Pasta Gnocchi adapter" : "Pasta Rotini adapter",
      kind === 1 ? "Gnocchi adapter" : "Rotini adapter",
    );
    const adapterContract = await MD.getToolkit().contract.at(adapter);
    requireContractEntrypoints(adapterContract, ["release"], "Ravioli child adapter");
    const adapterStorage = await adapterContract.storage();
    if (!adapterStorage?.reservations || typeof adapterStorage.reservations.get !== "function") {
      throw new Error("Ravioli child adapter does not expose reservation state");
    }
    const allowanceKey = {
      pack_token_id: tokenId,
      adapter,
      kind,
      resource_id: resourceId,
    };
    const reservationKey = {
      pack_contract: address,
      pack_token_id: tokenId,
      resource_id: resourceId,
    };
    const allowanceBefore = requiredNat(
      (await storage.adapter_allowances.get(allowanceKey)) ?? 0,
      "Ravioli adapter allowance",
    );
    const reservationBefore = requiredNat(
      (await adapterStorage.reservations.get(reservationKey)) ?? 0,
      "Ravioli adapter reservation",
    );
    if (allowanceBefore < capacity || reservationBefore < capacity) {
      throw new Error("requested recovery exceeds the router allowance or adapter reservation");
    }

    let targetReservation = null;
    if (kind === 1) {
      const allocation = await typedBigMapGet(adapterStorage.allocations, resourceId);
      if (!allocation) throw new Error("Gnocchi adapter allocation does not exist");
      const targetAddress = requiredKt1(allocation.target, "Gnocchi allocation target");
      const target = await MD.getToolkit().contract.at(targetAddress);
      const targetStorage = await target.storage();
      const targetTokenId = requiredNat(allocation.token_id, "Gnocchi allocation token id");
      const amountPerOpen = requiredNat(allocation.amount_per_open, "Gnocchi allocation amount");
      const before = requiredNat(
        (await typedBigMapGet(targetStorage.total_reserved, targetTokenId)) ?? 0,
        "Gnocchi reserved supply",
      );
      targetReservation = {
        target,
        targetTokenId,
        expectedAfter: before - amountPerOpen * capacity,
      };
      if (targetReservation.expectedAfter < 0) {
        throw new Error("Gnocchi target reservation is lower than the requested release");
      }
    }

    state.currentPublishRecoveryKey = "";
    beginPublishRecovery({
      network: state.network,
      account: MD.getAccount(),
      name: `Recover Ravioli adapter capacity for pack ${tokenId}`,
      mode: "adapter-recovery",
      editions: capacity,
      contract: address,
      tokenId,
      workflow: "recover_adapter",
      expectedTerminalStage: "RECOVER_ADAPTER",
    });
    recoveryStarted = true;
    persistPublishRecovery(null, "RECOVER_ADAPTER_PREFLIGHT_VERIFIED", null, "IN_PROGRESS", {
      adapter,
      kind,
      resourceId,
      capacity,
      allowanceBefore,
      reservationBefore,
    });
    const payload = {
      token_id: tokenId,
      adapter,
      kind,
      resource_id: resourceId,
      capacity,
    };
    const router = await MD.getToolkit().wallet.at(address);
    const operation = await sendTrackedPublishOperation(null, "RECOVER_ADAPTER", {
      action: "call",
      target: address,
      entrypoint: "recover_adapter",
      payload,
    }, () => router.methodsObject.recover_adapter(payload).send());

    const [refreshedRouterStorage, refreshedAdapterStorage] = await Promise.all([
      inspected.contract.storage(),
      adapterContract.storage(),
    ]);
    const allowanceAfter = requiredNat(
      (await refreshedRouterStorage.adapter_allowances.get(allowanceKey)) ?? 0,
      "recovered Ravioli adapter allowance",
    );
    const reservationAfter = requiredNat(
      (await refreshedAdapterStorage.reservations.get(reservationKey)) ?? 0,
      "recovered Ravioli adapter reservation",
    );
    if (
      allowanceAfter !== allowanceBefore - capacity
      || reservationAfter !== reservationBefore - capacity
    ) {
      throw new Error("confirmed recovery did not decrement router and adapter capacity exactly");
    }
    if (targetReservation) {
      const targetStorage = await targetReservation.target.storage();
      const targetAfter = requiredNat(
        (await typedBigMapGet(
          targetStorage.total_reserved,
          targetReservation.targetTokenId,
        )) ?? 0,
        "recovered Gnocchi reserved supply",
      );
      if (targetAfter !== targetReservation.expectedAfter) {
        throw new Error("confirmed recovery did not release exact Gnocchi target capacity");
      }
    }
    persistPublishRecovery(null, "RECOVER_ADAPTER_POSTCONDITION_VERIFIED", operation, "COMPLETE", {
      adapter,
      kind,
      resourceId,
      capacity,
      allowanceAfter,
      reservationAfter,
      targetReservationAfter: targetReservation?.expectedAfter ?? null,
    });
    MD.logEvent(
      "ravioli.adapter_capacity_recovered",
      "Ravioli released unused child capacity after pack cancellation",
      {
        contract: address,
        network: state.network,
        tokenId,
        adapter,
        kind,
        resourceId,
        capacity,
        allowanceAfter,
        reservationAfter,
        targetReservationAfter: targetReservation?.expectedAfter ?? null,
      },
    );
    $("recoverAdapterInfo").textContent =
      `Released ${capacity} unit${capacity === 1 ? "" : "s"}; router allowance and adapter reservation now ${allowanceAfter}/${reservationAfter}.`;
    MD.notify("Unused Ravioli child capacity released through the official adapter.", "success");
    await loadBundle();
  } catch (error) {
    if (recoveryStarted) {
      try {
        persistPublishRecovery(null, "RECOVER_ADAPTER_FAILED", null, "FAILED", {
          message: String(error?.message || error),
        });
      } catch {
        // Preserve the original recovery error.
      }
    }
    log(`adapter recovery failed: ${error.message || error}`, "err");
    MD.notify(`Adapter recovery failed: ${error.message || error}`, "error");
  } finally {
    $("btnRecoverAdapter").disabled = false;
  }
}

async function ravioliWrapperBalance(storage, owner, tokenId) {
  if (!storage?.ledger || typeof storage.ledger.get !== "function") throw new Error("Ravioli router does not expose its FA2 ledger");
  return requiredNat(
    (await storage.ledger.get({ owner, token_id: tokenId })) ?? 0,
    "Ravioli wrapper balance",
  );
}

async function transferWrapperClaim() {
  $("btnTransferWrapper").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect the wrapper holder first");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    const address = requiredKt1($("opKt").value, "Ravioli router");
    const tokenId = requiredNat($("opTokenId").value, "Ravioli pack token id");
    const sender = MD.getAccount();
    const recipient = String($("transferRecipient").value || "").trim();
    if (!MD.isAddress(recipient) || recipient === sender) throw new Error("enter a different valid Tezos recipient");
    const inspected = await inspectExistingRavioliRouter(address, { requireAdministrator: false });
    const storage = await inspected.contract.storage();
    const pack = await typedBigMapGet(storage.packs, tokenId);
    if (!pack || !pack.finalized || pack.cancelled) throw new Error("selected Ravioli pack is not transferable");
    const controllerStatus = await requireControllerPackAgreement(inspected, storage, pack, tokenId);
    const senderBalanceBefore = await ravioliWrapperBalance(storage, sender, tokenId);
    const recipientBalanceBefore = await ravioliWrapperBalance(storage, recipient, tokenId);
    if (senderBalanceBefore < 1) throw new Error("connected holder does not own this Ravioli wrapper");
    let senderClaimBefore = null;
    let recipientClaimsBefore = 0;
    if (controllerStatus) {
      senderClaimBefore = await resolveStudioClaim(inspected, tokenId, sender);
      recipientClaimsBefore = requiredNat(
        await executeContractView(inspected.controller, "get_claim_count", {
          pack_contract: address,
          pack_token_id: tokenId,
          owner: recipient,
        }, "Ravioli blind controller", sender),
        "Ravioli recipient claim count",
      );
    }
    state.currentPublishRecoveryKey = "";
    beginPublishRecovery({
      network: state.network,
      account: sender,
      name: `Transfer Ravioli wrapper to ${recipient}`,
      mode: MODE_NAMES[bigToNum(pack.mode)] || "pack",
      editions: 1,
      contract: address,
      tokenId,
      workflow: "transfer",
      expectedTerminalStage: "TRANSFER_WRAPPER",
    });
    recoveryStarted = true;
    persistPublishRecovery(null, "TRANSFER_PREFLIGHT_VERIFIED", null, "IN_PROGRESS", {
      sender,
      recipient,
      senderBalanceBefore,
      recipientBalanceBefore,
      senderClaimCountBefore: senderClaimBefore?.count ?? null,
      recipientClaimCountBefore: controllerStatus ? recipientClaimsBefore : null,
      movedClaimId: senderClaimBefore?.expectedClaimId ?? null,
    });
    const payload = [{
      from_: sender,
      txs: [{ to_: recipient, token_id: tokenId, amount: 1 }],
    }];
    const router = await MD.getToolkit().wallet.at(address);
    const operation = await sendTrackedPublishOperation(null, "TRANSFER_WRAPPER", {
      action: "call",
      target: address,
      entrypoint: "transfer",
      payload,
    }, () => router.methodsObject.transfer(payload).send());
    const refreshedStorage = await inspected.contract.storage();
    const [senderBalanceAfter, recipientBalanceAfter] = await Promise.all([
      ravioliWrapperBalance(refreshedStorage, sender, tokenId),
      ravioliWrapperBalance(refreshedStorage, recipient, tokenId),
    ]);
    if (senderBalanceAfter !== senderBalanceBefore - 1 || recipientBalanceAfter !== recipientBalanceBefore + 1) {
      throw new Error("confirmed wrapper transfer is not reflected in current FA2 balances");
    }
    if (controllerStatus) {
      const recipientClaim = await resolveStudioClaim(inspected, tokenId, recipient);
      if (
        recipientClaim.count !== recipientClaimsBefore + 1
        || recipientClaim.expectedClaimId !== senderClaimBefore.expectedClaimId
      ) {
        throw new Error("confirmed wrapper transfer did not preserve its exact top LIFO blind claim");
      }
    }
    persistPublishRecovery(null, "TRANSFER_POSTCONDITION_VERIFIED", operation, "COMPLETE", {
      sender,
      recipient,
      senderBalanceAfter,
      recipientBalanceAfter,
      movedClaimId: senderClaimBefore?.expectedClaimId ?? null,
    });
    MD.logEvent("ravioli.wrapper_transferred", "Ravioli transferred one unopened wrapper with its claim state", {
      contract: address,
      network: state.network,
      tokenId,
      sender,
      recipient,
      claimId: senderClaimBefore?.expectedClaimId ?? null,
    });
    $("transferInfo").textContent = controllerStatus
      ? `One wrapper and blind claim ${senderClaimBefore.expectedClaimId} moved together to ${recipient}.`
      : `One deterministic wrapper moved to ${recipient}.`;
    MD.notify("Ravioli wrapper transfer confirmed with its exact claim state.", "success");
    await loadBundle();
  } catch (error) {
    if (recoveryStarted) {
      try { persistPublishRecovery(null, "TRANSFER_FAILED", null, "FAILED", { message: String(error?.message || error) }); } catch { /* preserve original */ }
    }
    log(`wrapper transfer failed: ${error.message || error}`, "err");
    MD.notify(`Wrapper transfer failed: ${error.message || error}`, "error");
  } finally {
    $("btnTransferWrapper").disabled = false;
  }
}

async function withdrawRefundCredit() {
  $("btnWithdrawRefund").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect the credited holder wallet first");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    const address = requiredKt1($("opKt").value, "Ravioli router");
    const tokenId = requiredNat($("opTokenId").value, "Ravioli pack token id");
    const destination = String($("refundDestination").value || MD.getAccount()).trim();
    if (!MD.isAddress(destination)) {
      throw new Error("refund destination must be a valid Tezos address");
    }
    const inspected = await inspectExistingRavioliRouter(address, { requireAdministrator: false });
    const credit = requiredNat(
      await executeContractView(inspected.controller, "get_refund_credit", MD.getAccount(), "Ravioli blind controller", MD.getAccount()),
      "Ravioli refund credit",
    );
    if (credit < 1) throw new Error("connected holder has no Ravioli refund credit");
    state.currentPublishRecoveryKey = "";
    beginPublishRecovery({
      network: state.network,
      account: MD.getAccount(),
      name: `Withdraw Ravioli refund to ${destination}`,
      mode: "refund-credit",
      editions: 1,
      contract: address,
      tokenId,
      workflow: "withdraw_refund",
      expectedTerminalStage: "WITHDRAW_REFUND",
    });
    recoveryStarted = true;
    persistPublishRecovery(null, "WITHDRAW_REFUND_PREFLIGHT_VERIFIED", null, "IN_PROGRESS", {
      owner: MD.getAccount(),
      destination,
      creditBefore: credit,
      amount: credit,
    });
    const payload = { destination, amount: credit };
    const controller = await MD.getToolkit().wallet.at(inspected.controllerAddress);
    const operation = await sendTrackedPublishOperation(null, "WITHDRAW_REFUND", {
      action: "call",
      target: inspected.controllerAddress,
      entrypoint: "withdraw_refund",
      payload,
    }, () => controller.methodsObject.withdraw_refund(payload).send());
    persistPublishRecovery(null, "REFUND_WITHDRAWN", operation, "COMPLETE", {
      owner: MD.getAccount(),
      destination,
      amount: credit,
      creditAfter: 0,
    });
    MD.logEvent("ravioli.refund_withdrawn", "Ravioli holder withdrew pull-based refund credit", {
      contract: address,
      network: state.network,
      tokenId,
      owner: MD.getAccount(),
      destination,
      amount: credit,
    });
    $("refundInfo").textContent = `${(credit / 1_000_000).toFixed(6)} tez refund credit was withdrawn to ${destination}.`;
    MD.notify("Refund credit withdrawn. A rejected destination would have preserved the credit.", "success");
    await loadBundle();
  } catch (error) {
    if (recoveryStarted) {
      try { persistPublishRecovery(null, "WITHDRAW_REFUND_FAILED", null, "FAILED", { message: String(error?.message || error) }); } catch { /* preserve original */ }
    }
    log(`refund withdrawal failed: ${error.message || error}`, "err");
    MD.notify(`Refund withdrawal failed: ${error.message || error}`, "error");
  } finally {
    $("btnWithdrawRefund").disabled = false;
  }
}

function nestedPair(values) {
  let value = { prim: "Pair", args: [values.at(-2), values.at(-1)] };
  for (let index = values.length - 3; index >= 0; index -= 1) value = { prim: "Pair", args: [values[index], value] };
  return value;
}

function nestedBytesType(length) {
  let value = { prim: "pair", args: [{ prim: "bytes" }, { prim: "bytes" }] };
  for (let index = length - 3; index >= 0; index -= 1) value = { prim: "pair", args: [{ prim: "bytes" }, value] };
  return value;
}

function loadRuntimeScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pasta-runtime="${src}"]`);
    if (existing?.dataset.loaded === "true") return resolve();
    const script = existing || document.createElement("script");
    script.dataset.pastaRuntime = src;
    script.src = src;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error(`could not load ${src}`));
    if (!existing) document.head.appendChild(script);
  });
}

async function ensureStudioRotiniRuntime() {
  if (!window.RotiniArtifacts) await loadRuntimeScript("js/rotini-artifact.js");
  if (!window.PastaRotiniMint) await loadRuntimeScript("js/rotini-mint.js");
}

function requiredBytes32(value, label) {
  const clean = String(value || "").replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error(`${label} must be exactly 32 bytes`);
  return clean;
}

async function buildGenerativePayload(input) {
  const { provider, routerAddress, tokenId, serial, actionIndex, action, opener } = input;
  await ensureStudioRotiniRuntime();
  const toolkit = MD.getToolkit();
  const adapter = await toolkit.contract.at(action.adapter);
  const adapterStorageValue = await adapter.storage();
  const resource = await typedBigMapGet(adapterStorageValue.resources, action.resourceId);
  if (!resource) throw new Error(`Rotini resource ${action.resourceId} is missing`);
  const reservationKey = {
    pack_contract: routerAddress,
    pack_token_id: tokenId,
    resource_id: action.resourceId,
  };
  const reserved = requiredNat(
    await executeContractView(adapter, "get_reserved", reservationKey, "Rotini pack adapter", opener),
    "Rotini reserved pack capacity",
  );
  if (reserved < 1) throw new Error(`Rotini resource ${action.resourceId} has no reserved pack capacity remaining`);
  const renderContext = await executeContractView(adapter, "get_render_context", {
    pack_contract: routerAddress,
    pack_token_id: tokenId,
    open_serial: serial,
    action_index: actionIndex,
    resource_id: action.resourceId,
  }, "Rotini pack adapter", opener);
  const target = requiredKt1(renderContext?.target, "Rotini render target");
  const projectId = requiredNat(renderContext?.project_id, "Rotini render project id");
  if (String(resource.target || "") !== target || requiredNat(resource.project_id, "Rotini resource project id") !== projectId) {
    throw new Error("Rotini render context does not match its selected adapter resource");
  }
  const seed = requiredBytes32(renderContext?.seed, "Rotini immutable pack seed");
  const targetStorage = await (await toolkit.contract.at(target)).storage();
  const project = await typedBigMapGet(targetStorage.projects, projectId);
  if (!project) throw new Error(`Rotini project ${projectId} is missing`);
  const provenance = {
    schema: "pasta-ravioli-rotini-render@1",
    packContract: routerAddress,
    packTokenId: tokenId,
    openSerial: serial,
    actionIndex,
    adapter: action.adapter,
    resourceId: action.resourceId,
    target,
    projectId,
    recipient: opener,
    seed,
    canonicalAuthority: "generator-and-immutable-seed",
    artifactRole: "reproducible-self-rendered-cache-not-on-chain-pixel-verification",
  };
  const rendered = await window.PastaRotiniMint.renderProject({
    project,
    seed,
    tokenId: `ravioli:${tokenId}:${serial}:${actionIndex}`,
    projectId,
    iteration: serial,
    artifactName: `${MODE_NAMES[bigToNum(project.mode)] || "Ravioli"} · generated child ${actionIndex + 1}`,
    provenance,
  }, (message) => log(message));
  const output = window.RotiniArtifacts.OUTPUTS[rendered.outputMode];
  if (!output) throw new Error(`Rotini project ${projectId} produced an unsupported output mode`);
  const runtimeDigest = await window.RotiniArtifacts.sha256(rendered.artifactBlob);
  const independentDigest = await sha256Hex(rendered.artifactBlob);
  if (runtimeDigest.hex !== independentDigest) throw new Error("Rotini rendered-cache hash verification disagreed");
  const artifactUri = await trackedPublishPinBlob(
    provider,
    rendered.artifactBlob,
    `ravioli-generated-${tokenId}-${serial}-${actionIndex}.${output.extension}`,
    `OPEN_GENERATIVE_${actionIndex}_ARTIFACT`,
  );
  const displayUri = rendered.outputMode === "zip"
    ? await trackedPublishPinBlob(
      provider,
      rendered.coverBlob,
      `ravioli-generated-${tokenId}-${serial}-${actionIndex}-cover.png`,
      `OPEN_GENERATIVE_${actionIndex}_DISPLAY`,
    )
    : artifactUri;
  const creator = String(rendered.manifest.creator || project.treasury || "");
  const metadata = window.PastaRotiniMint.tokenMetadata({
    name: `${rendered.manifest.name || "Ravioli generated token"} · pack ${tokenId} / ${serial + 1}.${actionIndex + 1}`,
    description: `${rendered.manifest.description || ""}\n\nThe Rotini generator and immutable seed are canonical. This artifact is a reproducible self-rendered cache; the Tezos contract does not pixel-verify it.`.trim(),
    symbol: MD.hexToUtf8(String(project.symbol || "")),
    artifactUri,
    displayUri,
    thumbnailUri: displayUri,
    mimeType: output.mimeType,
    fileSize: rendered.artifactBlob.size,
    minter: opener,
    creator,
    traits: rendered.traits,
    seed,
    projectId,
    iteration: undefined,
    generatorUri: rendered.generatorUri,
    digest: independentDigest,
  });
  metadata.mintingTool = "Pasta Protocol Ravioli + Rotini 3";
  metadata["pasta:packContract"] = routerAddress;
  metadata["pasta:packTokenId"] = tokenId;
  metadata["pasta:openSerial"] = serial;
  metadata["pasta:actionIndex"] = actionIndex;
  metadata["pasta:adapter"] = action.adapter;
  metadata["pasta:resourceId"] = action.resourceId;
  metadata["pasta:target"] = target;
  metadata.ravioli = { generatedAtOpen: true, ...provenance };
  const metadataUri = await trackedPublishPinJson(
    provider,
    metadata,
    `ravioli-generated-token-${tokenId}-${serial}-${actionIndex}.json`,
    `OPEN_GENERATIVE_${actionIndex}_METADATA`,
  );
  const ordered = [
    independentDigest,
    MD.utf8ToHex(artifactUri),
    MD.utf8ToHex(displayUri),
    MD.utf8ToHex(metadataUri),
    MD.utf8ToHex(output.mimeType),
    MD.utf8ToHex(displayUri),
  ].map((bytes) => ({ bytes }));
  const result = await new TZ.MichelCodecPacker().packData({
    data: nestedPair(ordered),
    type: nestedBytesType(ordered.length),
  });
  return { payload: result.packed, metadataUri, artifactUri, displayUri, mimeType: output.mimeType, provenance };
}

async function openPack() {
  $("btnRedeem").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    const address = $("opKt").value.trim();
    const tokenId = Math.max(0, parseInt($("opTokenId").value, 10) || 0);
    const opener = MD.getAccount();
    const preflight = await preflightOpenKit(address, tokenId, JSON.parse($("openKit").value.trim()));
    const { kit, serial, recipe, expectedClaimId } = preflight;
    state.currentPublishRecoveryKey = "";
    beginPublishRecovery({
      network: state.network,
      account: MD.getAccount(),
      name: `Open ${address} token ${tokenId} serial ${serial}`,
      mode: kit.mode,
      editions: 1,
      contract: address,
      tokenId,
      workflow: "open",
      expectedTerminalStage: "OPEN_PACK",
    });
    recoveryStarted = true;
    persistPublishRecovery(kit, "OPEN_PREFLIGHT_VERIFIED", null, "IN_PROGRESS", { serial, expectedClaimId });
    const provider = pinProvider();
    const actions = [];
    for (let actionIndex = 0; actionIndex < recipe.actions.length; actionIndex += 1) {
      const action = recipe.actions[actionIndex];
      if (action.kind === "escrow") {
        actions.push({ escrow: { fa2: action.fa2, token_id: action.tokenId, amount: action.amount } });
        continue;
      }
      if (action.kind === "allocated") {
        actions.push({
          allocated_mint: {
            adapter: action.adapter,
            resource_id: action.resourceId,
            payload: "",
            payload_commitment: action.payloadCommitment || payloadCommitment(""),
          },
        });
        continue;
      }
      if (action.kind === "generative") {
        const generated = await buildGenerativePayload({
          provider,
          routerAddress: address,
          tokenId,
          serial,
          actionIndex,
          action,
          opener,
        });
        actions.push({
          generative_mint: {
            adapter: action.adapter,
            resource_id: action.resourceId,
            payload: generated.payload,
            payload_commitment: action.payloadCommitment || null,
          },
        });
        continue;
      }
      throw new Error(`unknown open action ${action.kind}`);
    }
    assertAdapterPayloadBudget(actions);
    const currentEntitlement = await resolveStudioOpenEntitlement(
      preflight.inspected,
      await preflight.inspected.contract.storage(),
      preflight.pack,
      tokenId,
      opener,
    );
    if (MD.getAccount() !== opener) throw new Error("connected Ravioli opener changed while its generative cache was rendering; nothing was submitted");
    if (currentEntitlement.serial !== serial || currentEntitlement.expectedClaimId !== expectedClaimId) {
      throw new Error("Ravioli wrapper entitlement changed while its generative cache was rendering; nothing was submitted");
    }
    log(`opening serial ${serial} with ${actions.length} atomic child action(s) (sign in wallet)…`);
    const contract = await MD.getToolkit().wallet.at(address);
    const openPayload = { token_id: tokenId, expected_claim_id: expectedClaimId, nonce: recipe.nonce, actions };
    const operation = await sendTrackedPublishOperation(kit, "OPEN_PACK", {
      action: "call", target: address, entrypoint: "open_pack", payload: openPayload,
    }, () => contract.methodsObject.open_pack(openPayload).send());
    persistPublishRecovery(kit, "OPEN_COMPLETE", null, "COMPLETE", { serial });
    log(`opened ✓ ${operation.opHash || operation.hash}`);
    try {
      MD.logEvent("ravioli.redeemed", "Ravioli opened and burned one wrapper", { contract: address, network: state.network, tokenId, serial });
      MD.logEvent("ravioli.pack_opened", "Ravioli atomically fulfilled a pack recipe", { contract: address, network: state.network, tokenId, serial, actions: actions.length });
    } catch (bookkeepingError) {
      log(`open is complete on Tezos; local event bookkeeping needs attention: ${bookkeepingError.message || bookkeepingError}`, "err");
    }
    MD.notify("Pack opened. Every enclosed transfer/mint applied and the wrapper burned in the same operation.", "success");
    try { await loadBundle(); } catch (refreshError) { log(`open confirmed; refresh failed: ${refreshError.message || refreshError}`, "err"); }
  } catch (error) {
    if (recoveryStarted) {
      try { persistPublishRecovery(null, "OPEN_FAILED", null, "FAILED", { message: String(error?.message || error) }); } catch { /* preserve original */ }
    }
    log(`open failed: ${error.message || JSON.stringify(error)}`, "err");
    MD.notify(`Open failed: ${error.message || error}`, "error");
  } finally {
    $("btnRedeem").disabled = false;
  }
}

async function reveal() {
  $("btnReveal").disabled = true;
  let recoveryStarted = false;
  try {
    if (!MD.getAccount()) throw new Error("connect your wallet first");
    await MD.assertOperationSafety();
    assertNoUnfinishedRecovery();
    const address = $("opKt").value.trim();
    const tokenId = Math.max(0, parseInt($("opTokenId").value, 10) || 0);
    const preflight = await preflightPublicReveal(address, tokenId, JSON.parse($("openKit").value.trim()));
    const kit = preflight.kit;
    state.currentPublishRecoveryKey = "";
    beginPublishRecovery({
      network: state.network,
      account: MD.getAccount(),
      name: `Public reveal for ${address} token ${tokenId}`,
      mode: kit.mode,
      editions: kit.recipes.length,
      contract: address,
      tokenId,
      workflow: "reveal",
      expectedTerminalStage: "SET_PACK_CONTENTS",
    });
    recoveryStarted = true;
    persistPublishRecovery(kit, "REVEAL_PREFLIGHT_VERIFIED");
    const uri = kit.sealedReveal.contentsUri;
    log("verifying and decrypting the precommitted authenticated reveal ciphertext…");
    const envelope = await fetchBoundedJson(uri, "sealed Ravioli reveal");
    const envelopeSha256 = await sha256Json(envelope, "sealed Ravioli reveal envelope");
    if (envelopeSha256 !== kit.sealedReveal.envelopeSha256) {
      throw new Error("sealed Ravioli reveal envelope does not match the private recovery digest");
    }
    const { sealedReveal: _privateReveal, ...publicKit } = kit;
    const decrypted = await decryptPublicReveal(envelope, kit.sealedReveal.salt, publicKit);
    if (
      canonicalJsonText(decrypted, "decrypted Ravioli reveal")
      !== canonicalJsonText(publicRevealDocument(publicKit), "private Ravioli open kit reveal")
    ) {
      throw new Error("decrypted Ravioli reveal does not match the private open kit");
    }
    $("revealUri").value = uri;
    const contract = await MD.getToolkit().wallet.at(address);
    const revealPayload = {
      token_id: tokenId,
      contents_uri: MD.utf8ToHex(uri),
      salt: kit.sealedReveal.salt,
      offset: kit.sealedReveal.offset,
    };
    await sendTrackedPublishOperation(kit, "SET_PACK_CONTENTS", {
      action: "call", target: address, entrypoint: "set_pack_contents", payload: revealPayload,
    }, () => contract.methodsObject.set_pack_contents(revealPayload).send());
    persistPublishRecovery(kit, "PUBLIC_REVEAL_COMPLETE", null, "COMPLETE", { uri });
    try {
      MD.logEvent("ravioli.contents_revealed", "Ravioli published its public open-kit reveal", { contract: address, network: state.network, tokenId, uri });
    } catch (bookkeepingError) {
      log(`public reveal is complete on Tezos; local event bookkeeping needs attention: ${bookkeepingError.message || bookkeepingError}`, "err");
    }
    MD.notify("Reveal key published. Portable holder pages can now authenticate and decrypt the precommitted open kit without wtfOS or manual import.", "success");
    try { await loadBundle(); } catch (refreshError) { log(`public reveal confirmed; refresh failed: ${refreshError.message || refreshError}`, "err"); }
  } catch (error) {
    if (recoveryStarted) {
      try { persistPublishRecovery(null, "PUBLIC_REVEAL_FAILED", null, "FAILED", { message: String(error?.message || error) }); } catch { /* preserve original */ }
    }
    MD.notify(`Reveal failed: ${error.message || error}`, "error");
  } finally {
    $("btnReveal").disabled = false;
  }
}

function updateModeNote() {
  const mode = parseInt($("bnMode").value, 10) || 0;
  const blind = mode > 0;
  $("bnMystery").checked = blind;
  $("bnForSale").disabled = blind;
  if (blind) $("bnForSale").checked = true;
  $("bnSaleCount").disabled = blind;
  if (blind) $("bnSaleCount").value = String(Math.max(1, Math.min(64, parseInt($("bnEditions").value, 10) || 1)));
  for (const id of ["bnRevealDeadline", "bnOpenDeadline"]) {
    $(id).disabled = !blind;
    if (!blind) $(id).value = "";
  }
  $("bnMysteryNote").textContent = blind
    ? "Limited Edition blind pack: the complete finite wrapper supply is listed in one finite primary sale, then revealed before its separate delivery/refund cutoff. Reservation operations remain inspectable on Tezos."
    : "Deterministic vault: public fixed-supply recipes are delivered atomically and do not use a blind controller deadline.";
}

function wire() {
  MD.updatePinProviderRows();
  void MD.loadPlatformCapabilities();
  renderLatestPublishRecovery();
  $("network").addEventListener("change", () => { state.network = $("network").value; renderLatestPublishRecovery(); });
  $("btnConnect").addEventListener("click", connect);
  $("btnAddMember").addEventListener("click", () => addMemberRow());
  $("btnPublish").addEventListener("click", publish);
  $("btnLoadBundle").addEventListener("click", loadBundle);
  $("btnDownloadOpenKit").addEventListener("click", () => {
    try {
      const address = $("opKt").value.trim();
      const tokenId = Math.max(0, parseInt($("opTokenId").value, 10) || 0);
      const kit = validateOpenKit(JSON.parse($("openKit").value.trim()), address, tokenId);
      downloadJson(kit, `ravioli-open-kit-${tokenId}.json`);
      $("publishRecoveryInfo").textContent = "Recovery/open kit download started.";
    } catch (error) {
      MD.notify(`Could not download recovery kit: ${error.message || error}`, "error");
    }
  });
  $("btnDownloadRecovery").addEventListener("click", () => {
    try {
      downloadLatestRecovery();
      $("publishRecoverySummary").textContent = "Private recovery journal download started. Keep it private because it may contain unrevealed nonces.";
    } catch (error) {
      MD.notify(`Could not download recovery journal: ${error.message || error}`, "error");
    }
  });
  $("btnCheckRecovery").addEventListener("click", async () => {
    $("btnCheckRecovery").disabled = true;
    try {
      await checkLatestRecovery();
    } catch (error) {
      $("publishRecoverySummary").textContent = `Recovery check failed closed: ${error.message || error}`;
      MD.notify(`Could not reconcile recovery: ${error.message || error}`, "error");
    } finally {
      $("btnCheckRecovery").disabled = false;
    }
  });
  $("btnDiscardRecovery").addEventListener("click", () => {
    try {
      discardLatestNoChainRecovery();
    } catch (error) {
      MD.notify(`Could not close recovery: ${error.message || error}`, "error");
    }
  });
  $("btnRedeem").addEventListener("click", openPack);
  $("btnReveal").addEventListener("click", reveal);
  $("btnTransferWrapper").addEventListener("click", transferWrapperClaim);
  $("btnCreditRefund").addEventListener("click", creditExpiredRefund);
  $("btnWithdrawRefund").addEventListener("click", withdrawRefundCredit);
  $("btnCancelUnrevealed").addEventListener("click", cancelUnrevealedPack);
  $("btnRecoverAdapter").addEventListener("click", recoverAdapterCapacity);
  $("bnMode").addEventListener("change", updateModeNote);
  $("bnEditions").addEventListener("input", updateModeNote);
  $("pinProvider").addEventListener("change", MD.updatePinProviderRows);
  $("importPkg").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) void importPackage(file);
    event.target.value = "";
  });
  $("openKitFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) $("openKit").value = JSON.stringify(JSON.parse(await file.text()), null, 2);
    event.target.value = "";
  });
  document.querySelectorAll('input[name="target"]').forEach((radio) => radio.addEventListener("change", () => {
    $("newCollectionFields").hidden = targetMode() !== "new_collection";
    $("existingContractFields").hidden = targetMode() !== "existing_contract";
  }));
  $("btnLoadContract").addEventListener("click", async () => {
    try {
      const router = await inspectExistingRavioliRouter($("existingKt").value);
      $("existingInfo").textContent = `Ravioli LE-safe router · next token id ${router.tokenId}`;
    } catch (error) {
      $("existingInfo").textContent = `Not a compatible router: ${error.message || error}`;
    }
  });

  addMemberRow();
  updateModeNote();
  const handoff = MD.consumeCheaseHandoff("ravioli");
  if (handoff) importCheasePackage(handoff, "handoff");
  const routeHandoff = MD.readRouteHandoff();
  if (routeHandoff?.contract) $("opKt").value = routeHandoff.contract;
  if (routeHandoff?.projectTitle) $("bnName").value = routeHandoff.projectTitle;

  window.PastaStudioDraft.start({
    app: "ravioli",
    summary: () => $("bnName").value.trim() || "Ravioli atomic pack draft",
    collect: () => ({ members: state.members.map(readMemberRow) }),
    apply: (extra) => applyDraftMembers(extra.members),
    afterApply: () => { state.network = $("network").value; updateModeNote(); },
  });
  window.PastaStudioContracts.start({
    app: "ravioli",
    label: "Ravioli",
    contractInputs: ["existingKt", "opKt"],
    title: () => $("bnName").value.trim(),
    onResume: () => {
      document.querySelector('input[name="target"][value="existing_contract"]').checked = true;
      document.querySelector('input[name="target"]:checked')?.dispatchEvent(new Event("change"));
    },
  });
}

wire();
