import {
  createDecipheriv,
  createHash,
} from "node:crypto";

import { packDataBytes } from "@taquito/michel-codec";
import {
  validateContractAddress,
  ValidationResult,
} from "@taquito/utils";
import { blake2b } from "blakejs";

const HASH_RE = /^[0-9a-f]{64}$/;
const HEX_RE = /^(?:[0-9a-f]{2})*$/;
const IPFS_URI_RE = /^ipfs:\/\/(b[a-z2-7]{20,120})$/;
const MAX_JSON_BYTES = 2_000_000;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 50_000;

const OPEN_KIT_SCHEMA = "pasta-ravioli-open-kit@3";
const PUBLIC_REVEAL_SCHEMA = "pasta-ravioli-public-reveal@1";
const SEALED_REVEAL_SCHEMA = "pasta-ravioli-sealed-reveal@1";
const SEALED_REVEAL_REFERENCE_SCHEMA = "pasta-ravioli-sealed-reveal-reference@1";
const SEALED_REVEAL_CIPHER = "AES-256-GCM";
const SEALED_REVEAL_KDF =
  "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)";
const MODE = "blind_funded_pool";
const MODE_INDEX = 1;
const TOKEN_ID = 1;
const MAX_PACK_SUPPLY = 64;
const MAX_RECIPE_ACTIONS = 8;

const RAVIOLI_REVEAL_PACK_TYPE = {
  prim: "pair",
  args: [
    { prim: "bytes" },
    {
      prim: "pair",
      args: [{ prim: "nat" }, { prim: "bytes" }],
    },
  ],
};

type JsonPrimitive = null | boolean | number | string;
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

export const RAVIOLI_MODE1_PRE_OP10_PROOF_SCHEMA =
  "pastaprotocol-ravioli-mode1-pre-op10-private-proof@1";

export type RavioliPinnedJsonMaterial = Readonly<{
  value: unknown;
  bytes: Uint8Array;
  proof: Readonly<{
    cid: string;
    uri: string;
    fileName: string;
    mimeType: string;
    byteLength: number;
    sha256: string;
    publicGatewayVerified: true;
  }>;
}>;

export type RavioliMode1PreOp10ProofInput = Readonly<{
  expected: Readonly<{
    network: "shadownet";
    contract: string;
    tokenId: 1;
  }>;
  openKit: unknown;
  manifest: RavioliPinnedJsonMaterial;
  envelope: RavioliPinnedJsonMaterial;
  tokenMetadata: RavioliPinnedJsonMaterial;
  operationTen: unknown;
}>;

export type RavioliMode1PreOp10Proof = Readonly<{
  schema: typeof RAVIOLI_MODE1_PRE_OP10_PROOF_SCHEMA;
  network: "shadownet";
  contract: string;
  tokenId: 1;
  mode: typeof MODE;
  maxSupply: number;
  itemCount: number;
  nonceCount: number;
  manifestUri: string;
  envelopeUri: string;
  tokenMetadataUri: string;
  openKitSha256: string;
  publicRevealSha256: string;
  manifestSha256: string;
  envelopeSha256: string;
  tokenMetadataSha256: string;
  revealCommitment: string;
}>;

function fail(message: string): never {
  throw new Error(`Ravioli mode-1 private proof: ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exact(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) fail(`${label} drift`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain object`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(`${label} contains symbol keys`);
  }
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${label}.${key} is not an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail(`${label} fields drift`);
  }
}

function requiredNat(value: unknown, label: string): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requiredHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_RE.test(value)) {
    fail(`${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function requiredIpfsUri(value: unknown, label: string): string {
  if (typeof value !== "string" || !IPFS_URI_RE.test(value)) {
    fail(`${label} must be a CIDv1 IPFS URI`);
  }
  return value;
}

function requiredKt1(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !value.startsWith("KT1")
    || validateContractAddress(value) !== ValidationResult.VALID
  ) {
    fail(`${label} must be a valid KT1 address`);
  }
  return value;
}

function canonicalJson(
  value: unknown,
  label: string,
  context = {
    ancestors: new Set<object>(),
    nodes: 0,
  },
  depth = 0,
): JsonValue {
  context.nodes += 1;
  if (context.nodes > MAX_JSON_NODES) fail(`${label} exceeds the JSON node limit`);
  if (depth > MAX_JSON_DEPTH) fail(`${label} exceeds the JSON depth limit`);
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`);
    return value;
  }
  if (!value || typeof value !== "object") {
    fail(`${label} contains a non-JSON value`);
  }
  if (context.ancestors.has(value)) fail(`${label} contains a cycle`);
  context.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        canonicalJson(entry, `${label}[${index}]`, context, depth + 1));
    }
    const source = record(value, label);
    const output: JsonRecord = {};
    for (const key of Object.keys(source).sort()) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        fail(`${label} contains a prohibited key`);
      }
      output[key] = canonicalJson(
        source[key],
        `${label}.${key}`,
        context,
        depth + 1,
      );
    }
    return output;
  } finally {
    context.ancestors.delete(value);
  }
}

function canonicalJsonBytes(value: unknown, label: string): Buffer {
  const bytes = Buffer.from(
    JSON.stringify(canonicalJson(value, label)),
    "utf8",
  );
  if (bytes.byteLength > MAX_JSON_BYTES) {
    fail(`${label} exceeds the JSON byte limit`);
  }
  return bytes;
}

function canonicalEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  const actualBytes = canonicalJsonBytes(actual, `${label} actual`);
  const expectedBytes = canonicalJsonBytes(expected, `${label} expected`);
  if (!actualBytes.equals(expectedBytes)) fail(`${label} drift`);
}

function parsePinnedMaterial(
  material: RavioliPinnedJsonMaterial,
  expectedFileName: string,
): {
  value: Record<string, unknown>;
  bytes: Buffer;
  uri: string;
  sha256: string;
} {
  const label = `pinned ${expectedFileName}`;
  if (!(material.bytes instanceof Uint8Array)) {
    fail(`${label} bytes are missing`);
  }
  const bytes = Buffer.from(material.bytes);
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_JSON_BYTES) {
    fail(`${label} byte length is invalid`);
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    fail(`${label} is not valid JSON`);
  }
  const canonical = canonicalJsonBytes(parsed, label);
  if (!bytes.equals(canonical)) fail(`${label} bytes are not canonical`);
  canonicalEqual(material.value, parsed, `${label} value`);

  const proof = material.proof;
  exact(proof.fileName, expectedFileName, `${label} filename`);
  exact(proof.mimeType, "application/json", `${label} MIME type`);
  exact(proof.byteLength, bytes.byteLength, `${label} proof byte length`);
  const digest = sha256(bytes);
  exact(requiredHash(proof.sha256, `${label} proof hash`), digest, `${label} proof hash`);
  const uri = requiredIpfsUri(proof.uri, `${label} proof URI`);
  const cid = IPFS_URI_RE.exec(uri)?.[1];
  exact(proof.cid, cid, `${label} proof CID`);
  exact(proof.publicGatewayVerified, true, `${label} public verification`);
  return {
    value: record(parsed, label),
    bytes,
    uri,
    sha256: digest,
  };
}

function requiredDateOrNull(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
  ) {
    fail(`${label} must be null or an RFC 3339 timestamp`);
  }
  return value;
}

function validateEditionPolicy(
  value: unknown,
): Record<string, unknown> {
  const policy = record(value, "open-kit edition policy");
  exactKeys(policy, [
    "requiresLimitedWrapper",
    "wrapperEditionClass",
    "earliestChildEnd",
    "wrapperSaleStart",
    "wrapperSaleEnd",
    "revealDeadline",
    "openDeadline",
  ], "open-kit edition policy");
  exact(policy.requiresLimitedWrapper, false, "open-kit child LE requirement");
  exact(policy.wrapperEditionClass, "limited-edition", "open-kit wrapper edition class");
  exact(policy.earliestChildEnd, null, "open-kit earliest child end");
  exact(policy.wrapperSaleStart, null, "open-kit wrapper sale start");
  const saleEnd = requiredDateOrNull(
    policy.wrapperSaleEnd,
    "open-kit wrapper sale end",
  );
  const revealDeadline = requiredDateOrNull(
    policy.revealDeadline,
    "open-kit reveal deadline",
  );
  const openDeadline = requiredDateOrNull(
    policy.openDeadline,
    "open-kit open deadline",
  );
  if (!saleEnd || !revealDeadline || !openDeadline) {
    fail("mode-1 deadlines must all be finite");
  }
  if (!(
    Date.parse(saleEnd) < Date.parse(revealDeadline)
    && Date.parse(revealDeadline) < Date.parse(openDeadline)
  )) {
    fail("mode-1 deadline order is invalid");
  }
  return policy;
}

function validateOpenKit(
  value: unknown,
  expected: RavioliMode1PreOp10ProofInput["expected"],
): {
  kit: Record<string, unknown>;
  publicKit: Record<string, unknown>;
  sealedReveal: Record<string, unknown>;
  editionPolicy: Record<string, unknown>;
  maxSupply: number;
  itemCount: number;
} {
  const kit = record(value, "open kit");
  exactKeys(kit, [
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
    "sealedReveal",
  ], "open kit");
  exact(kit.schema, OPEN_KIT_SCHEMA, "open-kit schema");
  exact(kit.network, expected.network, "open-kit network");
  exact(kit.contract, expected.contract, "open-kit contract");
  exact(kit.tokenId, expected.tokenId, "open-kit token id");
  exact(kit.mode, MODE, "open-kit mode");
  requiredIpfsUri(kit.manifestUri, "open-kit manifest URI");
  exact(
    kit.blindSecurity,
    "commit-reveal-ui-hidden-chain-public",
    "open-kit blind security",
  );
  if (
    typeof kit.warning !== "string"
    || kit.warning.trim().length === 0
    || kit.warning.length > 512
  ) {
    fail("open-kit warning is invalid");
  }
  const editionPolicy = validateEditionPolicy(kit.editionPolicy);

  if (
    !Array.isArray(kit.recipes)
    || kit.recipes.length < 1
    || kit.recipes.length > MAX_PACK_SUPPLY
  ) {
    fail(`open kit must contain between 1 and ${MAX_PACK_SUPPLY} recipes`);
  }
  const firstRecipe = record(kit.recipes[0], "open-kit recipe 0");
  if (
    !Array.isArray(firstRecipe.actions)
    || firstRecipe.actions.length < 1
    || firstRecipe.actions.length > MAX_RECIPE_ACTIONS
  ) {
    fail(`open kit recipes must contain between 1 and ${MAX_RECIPE_ACTIONS} actions`);
  }
  const maxSupply = kit.recipes.length;
  const itemCount = firstRecipe.actions.length;
  const nonces = new Set<string>();
  for (let index = 0; index < kit.recipes.length; index += 1) {
    const recipe = record(kit.recipes[index], `open-kit recipe ${index}`);
    exactKeys(
      recipe,
      ["serial", "nonce", "actions"],
      `open-kit recipe ${index}`,
    );
    exact(recipe.serial, index, `open-kit recipe ${index} serial`);
    const nonce = requiredHash(
      recipe.nonce,
      `open-kit recipe ${index} nonce`,
    );
    if (nonces.has(nonce)) fail(`open-kit recipe ${index} reuses a nonce`);
    nonces.add(nonce);
    if (!Array.isArray(recipe.actions) || recipe.actions.length !== itemCount) {
      fail(`open-kit recipe ${index} action count drift`);
    }
    for (let actionIndex = 0; actionIndex < recipe.actions.length; actionIndex += 1) {
      const actionLabel = `open-kit recipe ${index} action ${actionIndex}`;
      const action = record(recipe.actions[actionIndex], actionLabel);
      exactKeys(action, ["kind", "fa2", "tokenId", "amount"], actionLabel);
      exact(action.kind, "escrow", `${actionLabel} kind`);
      requiredKt1(action.fa2, `${actionLabel} escrow FA2`);
      requiredNat(action.tokenId, `${actionLabel} escrow token`);
      if (requiredNat(action.amount, `${actionLabel} escrow amount`) < 1) {
        fail(`${actionLabel} escrow amount must be positive`);
      }
    }
  }

  const sealedReveal = record(kit.sealedReveal, "open-kit sealed reveal");
  exactKeys(sealedReveal, [
    "schema",
    "contentsUri",
    "salt",
    "offset",
    "envelopeSha256",
  ], "open-kit sealed reveal");
  exact(
    sealedReveal.schema,
    SEALED_REVEAL_REFERENCE_SCHEMA,
    "open-kit sealed reveal schema",
  );
  requiredIpfsUri(
    sealedReveal.contentsUri,
    "open-kit sealed reveal URI",
  );
  requiredHash(sealedReveal.salt, "open-kit reveal salt");
  const offset = requiredNat(
    sealedReveal.offset,
    "open-kit reveal offset",
  );
  if (offset >= maxSupply) fail("open-kit reveal offset is outside supply");
  requiredHash(
    sealedReveal.envelopeSha256,
    "open-kit envelope hash",
  );

  const { sealedReveal: _sealedReveal, ...publicKit } = kit;
  return { kit, publicKit, sealedReveal, editionPolicy, maxSupply, itemCount };
}

function validateManifest(
  value: Record<string, unknown>,
  kit: Record<string, unknown>,
  editionPolicy: Record<string, unknown>,
  uri: string,
  maxSupply: number,
  itemCount: number,
): void {
  exact(value.schemaVersion, "wtfos.pasta.pack-manifest.v2", "manifest schema");
  exact(value.mode, MODE, "manifest mode");
  exact(value.maxSupply, maxSupply, "manifest supply");
  exact(value.itemCount, itemCount, "manifest item count");
  exact(value.mystery, true, "manifest mystery policy");
  exact(
    value.assignmentPolicy,
    "precommitted-salted-cyclic-rotation",
    "manifest assignment policy",
  );
  exact(
    value.blindSecurity,
    "commit-reveal-ui-hidden-chain-public",
    "manifest blind security",
  );
  if (!Array.isArray(value.members) || value.members.length !== 0) {
    fail("manifest must not publish private members");
  }
  exact(kit.manifestUri, uri, "open-kit manifest URI");
  const manifestEdition = record(
    value.editionPolicy,
    "manifest edition policy",
  );
  for (const key of [
    "requiresLimitedWrapper",
    "wrapperEditionClass",
    "earliestChildEnd",
    "wrapperSaleStart",
    "wrapperSaleEnd",
    "revealDeadline",
    "openDeadline",
  ]) {
    exact(
      manifestEdition[key],
      editionPolicy[key],
      `manifest edition policy ${key}`,
    );
  }
}

function canonicalBase64(value: unknown, label: string): Buffer {
  if (
    typeof value !== "string"
    || value.length === 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    fail(`${label} must be canonical base64`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    fail(`${label} must be canonical base64`);
  }
  return bytes;
}

function decryptPublicReveal(
  envelope: Record<string, unknown>,
  saltHex: string,
): unknown {
  const iv = canonicalBase64(envelope.iv, "envelope IV");
  exact(iv.byteLength, 12, "envelope IV length");
  const authenticatedCiphertext = canonicalBase64(
    envelope.ciphertext,
    "envelope ciphertext",
  );
  if (authenticatedCiphertext.byteLength <= 16) {
    fail("envelope ciphertext is too short");
  }
  const ciphertext = authenticatedCiphertext.subarray(
    0,
    authenticatedCiphertext.byteLength - 16,
  );
  const tag = authenticatedCiphertext.subarray(
    authenticatedCiphertext.byteLength - 16,
  );
  const salt = Buffer.from(saltHex, "hex");
  exact(salt.byteLength, 32, "reveal salt length");
  const key = createHash("sha256")
    .update(Buffer.from(`${SEALED_REVEAL_SCHEMA}\0`, "utf8"))
    .update(salt)
    .digest();
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      iv,
      { authTagLength: 16 },
    );
    decipher.setAAD(Buffer.from(JSON.stringify(envelope.aad), "utf8"));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  } catch {
    fail("sealed reveal authentication failed");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    fail("sealed reveal plaintext is not UTF-8");
  }
  try {
    return JSON.parse(text);
  } catch {
    fail("sealed reveal plaintext is not JSON");
  }
}

function validateEnvelope(
  value: Record<string, unknown>,
  expected: RavioliMode1PreOp10ProofInput["expected"],
  manifestUri: string,
  envelopeUri: string,
  envelopeSha256: string,
  sealedReveal: Record<string, unknown>,
  expectedPublicReveal: Record<string, unknown>,
): string {
  exactKeys(value, [
    "schema",
    "cipher",
    "keyDerivation",
    "iv",
    "aad",
    "ciphertext",
  ], "sealed envelope");
  exact(value.schema, SEALED_REVEAL_SCHEMA, "envelope schema");
  exact(value.cipher, SEALED_REVEAL_CIPHER, "envelope cipher");
  exact(value.keyDerivation, SEALED_REVEAL_KDF, "envelope KDF");
  const aad = record(value.aad, "envelope AAD");
  exactKeys(
    aad,
    ["schema", "network", "contract", "tokenId", "manifestUri"],
    "envelope AAD",
  );
  canonicalEqual(aad, {
    schema: SEALED_REVEAL_SCHEMA,
    network: expected.network,
    contract: expected.contract,
    tokenId: expected.tokenId,
    manifestUri,
  }, "envelope AAD");
  exact(
    sealedReveal.contentsUri,
    envelopeUri,
    "open-kit envelope URI",
  );
  exact(
    sealedReveal.envelopeSha256,
    envelopeSha256,
    "open-kit envelope hash",
  );
  const salt = requiredHash(
    sealedReveal.salt,
    "open-kit reveal salt",
  );
  const decrypted = decryptPublicReveal(value, salt);
  const decryptedRecord = record(decrypted, "decrypted public reveal");
  exactKeys(decryptedRecord, [
    "schema",
    "network",
    "contract",
    "tokenId",
    "mode",
    "manifestUri",
    "maxSupply",
    "itemCount",
    "openKit",
  ], "decrypted public reveal");
  canonicalEqual(
    decryptedRecord,
    expectedPublicReveal,
    "decrypted public reveal",
  );
  return sha256(
    canonicalJsonBytes(decryptedRecord, "decrypted public reveal"),
  );
}

function validateTokenMetadata(
  value: Record<string, unknown>,
  manifestUri: string,
  envelopeUri: string,
  maxSupply: number,
  itemCount: number,
): {
  revealCommitment: string;
  name: string;
  symbol: string;
} {
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    fail("token metadata name is invalid");
  }
  if (typeof value.symbol !== "string" || value.symbol.trim().length === 0) {
    fail("token metadata symbol is invalid");
  }
  exact(value.decimals, 0, "token metadata decimals");
  const ravioli = record(value.ravioli, "token Ravioli policy");
  exact(ravioli.version, 3, "token Ravioli version");
  exact(ravioli.mode, MODE, "token mode");
  exact(ravioli.maxSupply, maxSupply, "token supply");
  exact(ravioli.itemCount, itemCount, "token item count");
  exact(ravioli.manifestUri, manifestUri, "token manifest URI");
  exact(
    ravioli.sealedContentsUri,
    envelopeUri,
    "token sealed envelope URI",
  );
  exact(
    ravioli.blindSecurity,
    "authenticated-ciphertext-until-reveal",
    "token blind security",
  );
  return {
    revealCommitment: requiredHash(
      ravioli.revealCommitment,
      "token reveal commitment",
    ),
    name: value.name,
    symbol: value.symbol,
  };
}

function hexUtf8(value: unknown, label: string): string {
  if (typeof value !== "string" || !HEX_RE.test(value)) {
    fail(`${label} must be lowercase packed UTF-8 hex`);
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(value, "hex"),
    );
  } catch {
    fail(`${label} is not UTF-8`);
  }
  return decoded;
}

function tokenInfoEntries(value: unknown): Map<string, unknown> {
  let entries: unknown;
  if (
    value
    && typeof value === "object"
    && typeof (value as { entries?: unknown }).entries === "function"
  ) {
    try {
      entries = Array.from(
        (value as { entries(): Iterable<readonly [unknown, unknown]> }).entries(),
      );
    } catch {
      fail("operation token_info entries could not be read");
    }
  } else {
    const source = record(value, "operation token_info");
    if (Array.isArray(source.$map)) {
      entries = source.$map;
    } else if (
      source.__pastaRecoveryType === "MichelsonMap"
      && Array.isArray(source.entries)
    ) {
      entries = source.entries;
    } else {
      entries = Object.entries(source);
    }
  }
  if (!Array.isArray(entries)) fail("operation token_info is not a map");
  const output = new Map<string, unknown>();
  for (const entry of entries) {
    if (
      !Array.isArray(entry)
      || entry.length !== 2
      || typeof entry[0] !== "string"
      || output.has(entry[0])
    ) {
      fail("operation token_info contains an invalid entry");
    }
    output.set(entry[0], entry[1]);
  }
  return output;
}

function validateOperationTen(
  value: unknown,
  expected: RavioliMode1PreOp10ProofInput["expected"],
  manifestUri: string,
  tokenMetadataUri: string,
  editionPolicy: Record<string, unknown>,
  token: { name: string; symbol: string },
  revealCommitment: string,
  maxSupply: number,
  itemCount: number,
): void {
  const descriptor = record(value, "operation 10 descriptor");
  exactKeys(
    descriptor,
    ["kind", "call", "sendOptions"],
    "operation 10 descriptor",
  );
  exact(descriptor.kind, "call", "operation 10 descriptor kind");
  canonicalEqual(descriptor.sendOptions, {}, "operation 10 send options");
  const call = record(descriptor.call, "operation 10 call");
  exactKeys(
    call,
    ["contractAddress", "entrypoint", "payload"],
    "operation 10 call",
  );
  exact(call.contractAddress, expected.contract, "operation 10 target");
  exact(call.entrypoint, "create_pack", "operation 10 entrypoint");
  const payload = record(call.payload, "operation 10 payload");
  exactKeys(
    payload,
    ["expected_token_id", "token_info", "config"],
    "operation 10 payload",
  );
  exact(payload.expected_token_id, expected.tokenId, "operation 10 token id");
  const config = record(payload.config, "operation 10 config");
  exactKeys(config, [
    "mode",
    "blind",
    "item_count",
    "max_supply",
    "committed_recipes",
    "finalized",
    "cancelled",
    "contents_uri",
    "manifest_uri",
    "child_expiry",
    "wrapper_sale_end",
    "reveal_deadline",
    "open_deadline",
    "reveal_commitment",
  ], "operation 10 config");
  exact(config.mode, MODE_INDEX, "operation 10 mode");
  exact(config.blind, true, "operation 10 blind policy");
  exact(config.item_count, itemCount, "operation 10 item count");
  exact(config.max_supply, maxSupply, "operation 10 supply");
  exact(config.committed_recipes, 0, "operation 10 committed recipes");
  exact(config.finalized, false, "operation 10 finalized flag");
  exact(config.cancelled, false, "operation 10 cancelled flag");
  exact(config.contents_uri, null, "operation 10 contents URI");
  exact(
    hexUtf8(config.manifest_uri, "operation 10 manifest URI"),
    manifestUri,
    "operation 10 manifest URI",
  );
  exact(config.child_expiry, null, "operation 10 child expiry");
  exact(config.wrapper_sale_end, null, "operation 10 inherited LE end");
  exact(
    config.reveal_deadline,
    editionPolicy.revealDeadline,
    "operation 10 reveal deadline",
  );
  exact(
    config.open_deadline,
    editionPolicy.openDeadline,
    "operation 10 open deadline",
  );
  exact(
    config.reveal_commitment,
    revealCommitment,
    "operation 10 reveal commitment",
  );

  const tokenInfo = tokenInfoEntries(payload.token_info);
  const requiredKeys = [
    "",
    "decimals",
    "name",
    "pasta:editionClass",
    "pasta:fulfillment",
    "pasta:packMode",
    "pasta:transferExpiry",
    "symbol",
  ];
  if (
    JSON.stringify([...tokenInfo.keys()].sort())
    !== JSON.stringify([...requiredKeys].sort())
  ) {
    fail("operation token_info fields drift");
  }
  exact(
    hexUtf8(tokenInfo.get(""), "operation token metadata URI"),
    tokenMetadataUri,
    "operation token metadata URI",
  );
  exact(
    hexUtf8(tokenInfo.get("decimals"), "operation token decimals"),
    "0",
    "operation token decimals",
  );
  exact(
    hexUtf8(tokenInfo.get("name"), "operation token name"),
    token.name,
    "operation token name",
  );
  exact(
    hexUtf8(tokenInfo.get("symbol"), "operation token symbol"),
    token.symbol,
    "operation token symbol",
  );
  exact(
    hexUtf8(
      tokenInfo.get("pasta:editionClass"),
      "operation token edition class",
    ),
    "limited-edition",
    "operation token edition class",
  );
  exact(
    hexUtf8(tokenInfo.get("pasta:fulfillment"), "operation token fulfillment"),
    "atomic",
    "operation token fulfillment",
  );
  exact(
    hexUtf8(tokenInfo.get("pasta:packMode"), "operation token pack mode"),
    MODE,
    "operation token pack mode",
  );
  exact(
    hexUtf8(
      tokenInfo.get("pasta:transferExpiry"),
      "operation token transfer expiry",
    ),
    "reveal/open deadline; refund-only afterward",
    "operation token transfer expiry",
  );
}

export function computeRavioliRevealCommitment(
  contentsUri: string,
  saltHex: string,
  offset: number,
): string {
  requiredIpfsUri(contentsUri, "reveal commitment contents URI");
  const salt = requiredHash(saltHex, "reveal commitment salt");
  const normalizedOffset = requiredNat(offset, "reveal commitment offset");
  const packed = packDataBytes(
    {
      prim: "Pair",
      args: [
        { bytes: Buffer.from(contentsUri, "utf8").toString("hex") },
        {
          prim: "Pair",
          args: [
            { int: String(normalizedOffset) },
            { bytes: salt },
          ],
        },
      ],
    } as any,
    RAVIOLI_REVEAL_PACK_TYPE as any,
  ).bytes;
  return Buffer.from(
    blake2b(Buffer.from(packed, "hex"), undefined, 32),
  ).toString("hex");
}

export function verifyRavioliMode1PreOp10PrivateProof(
  input: RavioliMode1PreOp10ProofInput,
): RavioliMode1PreOp10Proof {
  exact(input.expected.network, "shadownet", "expected network");
  const contract = requiredKt1(input.expected.contract, "expected contract");
  exact(input.expected.tokenId, TOKEN_ID, "expected token id");

  const manifest = parsePinnedMaterial(
    input.manifest,
    "ravioli-pack-manifest.json",
  );
  const envelope = parsePinnedMaterial(
    input.envelope,
    "ravioli-sealed-reveal-1.json",
  );
  const tokenMetadata = parsePinnedMaterial(
    input.tokenMetadata,
    "token.json",
  );
  if (
    new Set([manifest.uri, envelope.uri, tokenMetadata.uri]).size !== 3
  ) {
    fail("fresh manifest, envelope, and token URIs must be distinct");
  }

  const {
    kit,
    publicKit,
    sealedReveal,
    editionPolicy,
    maxSupply,
    itemCount,
  } = validateOpenKit(input.openKit, input.expected);
  validateManifest(
    manifest.value,
    kit,
    editionPolicy,
    manifest.uri,
    maxSupply,
    itemCount,
  );

  const expectedPublicReveal = {
    schema: PUBLIC_REVEAL_SCHEMA,
    network: input.expected.network,
    contract,
    tokenId: TOKEN_ID,
    mode: MODE,
    manifestUri: manifest.uri,
    maxSupply,
    itemCount,
    openKit: publicKit,
  };
  const publicRevealSha256 = validateEnvelope(
    envelope.value,
    input.expected,
    manifest.uri,
    envelope.uri,
    envelope.sha256,
    sealedReveal,
    expectedPublicReveal,
  );

  const token = validateTokenMetadata(
    tokenMetadata.value,
    manifest.uri,
    envelope.uri,
    maxSupply,
    itemCount,
  );
  const revealCommitment = computeRavioliRevealCommitment(
    envelope.uri,
    requiredHash(sealedReveal.salt, "open-kit reveal salt"),
    requiredNat(sealedReveal.offset, "open-kit reveal offset"),
  );
  exact(
    token.revealCommitment,
    revealCommitment,
    "token reveal commitment",
  );
  validateOperationTen(
    input.operationTen,
    input.expected,
    manifest.uri,
    tokenMetadata.uri,
    editionPolicy,
    token,
    revealCommitment,
    maxSupply,
    itemCount,
  );

  return Object.freeze({
    schema: RAVIOLI_MODE1_PRE_OP10_PROOF_SCHEMA,
    network: "shadownet",
    contract,
    tokenId: TOKEN_ID,
    mode: MODE,
    maxSupply,
    itemCount,
    nonceCount: maxSupply,
    manifestUri: manifest.uri,
    envelopeUri: envelope.uri,
    tokenMetadataUri: tokenMetadata.uri,
    openKitSha256: sha256(
      canonicalJsonBytes(kit, "open kit"),
    ),
    publicRevealSha256,
    manifestSha256: manifest.sha256,
    envelopeSha256: envelope.sha256,
    tokenMetadataSha256: tokenMetadata.sha256,
    revealCommitment,
  });
}
