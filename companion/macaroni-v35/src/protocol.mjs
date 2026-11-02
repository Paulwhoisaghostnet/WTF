import { createHash } from "node:crypto";
import { packDataBytes } from "@taquito/michel-codec";
import { b58DecodeAddress, b58DecodeAndCheckPrefix, PrefixV2 } from "@taquito/utils";

export const HASH_CHAIN_DOMAIN = Buffer.from("macaroni-v35/hash-chain/v1", "utf8");
export const ALLOCATION_DOMAIN = Buffer.from("macaroni-v35/allocation/v1", "utf8");
export const METADATA_DOMAIN = Buffer.from("macaroni-v35/metadata/v1", "utf8");
export const RECOVERY_VERSION = "macaroni-v35-reverse-hash-chain.v1";

export function orderedMichelsonCodeSections(code) {
  if (!Array.isArray(code)) return null;
  // The Tezos protocol permits these top-level sections in any order; RPCs
  // and indexers may return a different order from the authored artifact.
  const key = (section) => `${section?.prim || ""}:${section?.prim === "view" ? section?.args?.[0]?.string || "" : ""}`;
  return [...code].sort((left, right) => key(left).localeCompare(key(right)));
}

export function normalizedHex(value, bytes = null) {
  const hex = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? Buffer.from(value).toString("hex")
    : String(value || "").replace(/^0x/i, "");
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("Expected even-length hexadecimal bytes");
  if (bytes != null && hex.length !== bytes * 2) throw new Error(`Expected exactly ${bytes} bytes`);
  return hex.toLowerCase();
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashEntropyLink(preimage) {
  return sha256Hex(Buffer.concat([HASH_CHAIN_DOMAIN, Buffer.from(normalizedHex(preimage, 32), "hex")]));
}

export function regenerateEntropyChain({ seed, length }) {
  const seedBytes = Buffer.from(seed);
  if (seedBytes.byteLength !== 32) throw new Error("Entropy seed must contain exactly 32 bytes");
  if (!Number.isSafeInteger(length) || length < 1) throw new Error("Entropy chain length must be a positive integer");
  const forward = [seedBytes];
  for (let index = 0; index < length; index += 1) {
    forward.push(Buffer.from(hashEntropyLink(forward.at(-1)), "hex"));
  }
  return {
    publicHead: forward[length].toString("hex"),
    preimages: forward.slice(0, length).reverse().map((value) => value.toString("hex")),
    chainLength: length,
    recoveryVersion: RECOVERY_VERSION,
  };
}

function pair(values) {
  if (values.length < 2) throw new Error("A Michelson pair requires two or more values");
  return values.length === 2
    ? { prim: "Pair", args: values }
    : { prim: "Pair", args: [values[0], pair(values.slice(1))] };
}

function pairType(primitives) {
  return pair(primitives.map((prim) => ({ prim })));
}

function chainIdHex(chainId) {
  if (/^[0-9a-f]{16}$/i.test(chainId)) return chainId.toLowerCase();
  return Buffer.from(b58DecodeAndCheckPrefix(chainId, [PrefixV2.ChainID])[0]).toString("hex");
}

export function packAllocation(input) {
  const data = pair([
    { bytes: ALLOCATION_DOMAIN.toString("hex") },
    { bytes: chainIdHex(input.chainId) },
    { bytes: b58DecodeAddress(input.contractAddress) },
    { bytes: b58DecodeAddress(input.creator) },
    { int: String(input.claimId) },
    { bytes: b58DecodeAddress(input.buyer) },
    { bytes: b58DecodeAddress(input.recipient) },
    { int: String(input.unit) },
    { int: String(input.purchaseLevel) },
    { bytes: normalizedHex(input.entropyPreimage, 32) },
  ]);
  const type = pairType(["bytes", "chain_id", "address", "address", "nat", "address", "address", "nat", "nat", "bytes"]);
  return packDataBytes(data, type).bytes;
}

export function allocationDigest(input) {
  return sha256Hex(Buffer.from(packAllocation(input), "hex"));
}

export function packMetadataCommitment(input) {
  const metadataUriBytes = Buffer.isBuffer(input.metadataUri) || input.metadataUri instanceof Uint8Array
    ? Buffer.from(input.metadataUri)
    : Buffer.from(String(input.metadataUri), "utf8");
  const data = pair([
    { bytes: METADATA_DOMAIN.toString("hex") },
    { int: String(input.tokenId) },
    { bytes: metadataUriBytes.toString("hex") },
    { bytes: normalizedHex(input.metadataNonce, 32) },
  ]);
  return packDataBytes(data, pairType(["bytes", "nat", "bytes", "bytes"])).bytes;
}

export function metadataCommitment(input) {
  return sha256Hex(Buffer.from(packMetadataCommitment(input), "hex"));
}

export function simulateSwapPop({ slots, allocationDigest: digest }) {
  if (!Array.isArray(slots) || slots.length === 0) throw new Error("Cannot allocate from an empty slot pool");
  const remainingSlots = [...slots];
  const draw = Number(BigInt(`0x${normalizedHex(digest, 32)}`) % BigInt(remainingSlots.length));
  const last = remainingSlots.length - 1;
  const tokenId = remainingSlots[draw];
  if (draw !== last) remainingSlots[draw] = remainingSlots[last];
  remainingSlots.pop();
  return { draw, last, tokenId, remainingSlots };
}

export function expandPhysicalSlots(tokens) {
  const ordered = [...tokens].sort((left, right) => left.token_id - right.token_id);
  const slots = [];
  ordered.forEach((token, expectedTokenId) => {
    if (token.token_id !== expectedTokenId) throw new Error("Token ids must be sequential from zero");
    if (!Number.isSafeInteger(token.quantity) || token.quantity < 1) throw new Error("Every token quantity must be positive");
    for (let index = 0; index < token.quantity; index += 1) slots.push(token.token_id);
  });
  return slots;
}

export function verifyCrossLanguageFixture(template) {
  const fixture = template?.crossLanguageFixture;
  if (!fixture?.inputs || !fixture?.allocation || !fixture?.metadata || !fixture?.chainStep) {
    throw new Error("V3.5 contract template is missing the compiled cross-language hash fixture");
  }
  const input = fixture.inputs;
  const allocationInput = {
    chainId: input.chainIdHex,
    contractAddress: input.contractAddress,
    creator: input.creator,
    claimId: Number(input.claimId),
    buyer: input.buyer,
    recipient: input.recipient,
    unit: Number(input.unit),
    purchaseLevel: Number(input.purchaseLevel),
    entropyPreimage: input.entropyPreimageHex,
  };
  const allocationPacked = packAllocation(allocationInput);
  const allocationHash = allocationDigest(allocationInput);
  const metadataInput = {
    tokenId: Number(input.tokenId),
    metadataUri: input.metadataUriUtf8,
    metadataNonce: input.metadataNonceHex,
  };
  const metadataPacked = packMetadataCommitment(metadataInput);
  const metadataHash = metadataCommitment(metadataInput);
  const chainHash = hashEntropyLink(input.entropyPreimageHex);
  const swap = simulateSwapPop({ slots: input.initialSlotPool.map(Number), allocationDigest: allocationHash });
  const failures = [];
  if (allocationPacked !== fixture.allocation.packedBytesHex) failures.push("allocation PACK bytes");
  if (allocationHash !== fixture.allocation.sha256Hex) failures.push("allocation SHA-256");
  if (metadataPacked !== fixture.metadata.packedBytesHex) failures.push("metadata PACK bytes");
  if (metadataHash !== fixture.metadata.sha256Hex) failures.push("metadata SHA-256");
  if (chainHash !== fixture.chainStep.sha256Hex) failures.push("hash-chain link");
  if (String(swap.draw) !== fixture.swapPop.draw || String(swap.tokenId) !== fixture.swapPop.selectedTokenId) failures.push("swap-and-pop selection");
  if (failures.length > 0) throw new Error(`Compiled SmartPy fixture mismatch: ${failures.join(", ")}`);
  return { ok: true, allocationHash, metadataHash, chainHash };
}

export function asSafeNat(value, label) {
  const normalized = typeof value?.toNumber === "function" ? value.toNumber() : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) throw new Error(`${label} is not a safe natural number`);
  return normalized;
}

export function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error("Invalid contract timestamp");
  return parsed;
}
