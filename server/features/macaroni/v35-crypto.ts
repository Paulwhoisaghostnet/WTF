import { createHash } from "node:crypto";
import { packDataBytes } from "@taquito/michel-codec";
import { b58DecodeAddress, b58DecodeAndCheckPrefix, PrefixV2 } from "@taquito/utils";

export const MACARONI_V35_HASH_CHAIN_DOMAIN = Buffer.from("macaroni-v35/hash-chain/v1", "utf8");
export const MACARONI_V35_ALLOCATION_DOMAIN = Buffer.from("macaroni-v35/allocation/v1", "utf8");
export const MACARONI_V35_METADATA_DOMAIN = Buffer.from("macaroni-v35/metadata/v1", "utf8");

type MichelsonNode = { prim?: string; args?: MichelsonNode[]; string?: string; int?: string; bytes?: string };

function pair(values: MichelsonNode[]): MichelsonNode {
  if (values.length < 2) throw new Error("A Michelson pair requires at least two values");
  return values.length === 2
    ? { prim: "Pair", args: values }
    : { prim: "Pair", args: [values[0], pair(values.slice(1))] };
}

function pairType(primitives: string[]): MichelsonNode {
  return pair(primitives.map((prim) => ({ prim })));
}

function normalizedBytes(value: string | Uint8Array): string {
  const hex = typeof value === "string"
    ? value.replace(/^0x/i, "")
    : Buffer.from(value).toString("hex");
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("Expected even-length hexadecimal bytes");
  return hex.toLowerCase();
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashMacaroniV35EntropyLink(preimage: string | Uint8Array): string {
  return sha256Hex(Buffer.concat([
    MACARONI_V35_HASH_CHAIN_DOMAIN,
    Buffer.from(normalizedBytes(preimage), "hex"),
  ]));
}

export type MacaroniV35AllocationInput = {
  buyer: string;
  chainId: string;
  claimId: number;
  contractAddress: string;
  creator: string;
  entropyPreimage: string;
  purchaseLevel: number;
  recipient: string;
  unit: number;
};

export function packMacaroniV35Allocation(input: MacaroniV35AllocationInput): string {
  const chainIdHex = /^[0-9a-f]{16}$/i.test(input.chainId)
    ? input.chainId.toLowerCase()
    : Buffer.from(b58DecodeAndCheckPrefix(input.chainId, [PrefixV2.ChainID])[0]).toString("hex");
  const values: MichelsonNode[] = [
    { bytes: MACARONI_V35_ALLOCATION_DOMAIN.toString("hex") },
    { bytes: chainIdHex },
    { bytes: b58DecodeAddress(input.contractAddress) },
    { bytes: b58DecodeAddress(input.creator) },
    { int: String(input.claimId) },
    { bytes: b58DecodeAddress(input.buyer) },
    { bytes: b58DecodeAddress(input.recipient) },
    { int: String(input.unit) },
    { int: String(input.purchaseLevel) },
    { bytes: normalizedBytes(input.entropyPreimage) },
  ];
  const type = pairType([
    "bytes", "chain_id", "address", "address", "nat",
    "address", "address", "nat", "nat", "bytes",
  ]);
  return packDataBytes(pair(values) as never, type as never).bytes;
}

export function macaroniV35AllocationDigest(input: MacaroniV35AllocationInput): string {
  return sha256Hex(Buffer.from(packMacaroniV35Allocation(input), "hex"));
}

export type MacaroniV35MetadataCommitmentInput = {
  metadataNonce: string;
  metadataUri: string | Uint8Array;
  tokenId: number;
};

export function packMacaroniV35MetadataCommitment(input: MacaroniV35MetadataCommitmentInput): string {
  const uriBytes = typeof input.metadataUri === "string"
    ? Buffer.from(input.metadataUri, "utf8").toString("hex")
    : Buffer.from(input.metadataUri).toString("hex");
  const values: MichelsonNode[] = [
    { bytes: MACARONI_V35_METADATA_DOMAIN.toString("hex") },
    { int: String(input.tokenId) },
    { bytes: uriBytes },
    { bytes: normalizedBytes(input.metadataNonce) },
  ];
  const type = pairType(["bytes", "nat", "bytes", "bytes"]);
  return packDataBytes(pair(values) as never, type as never).bytes;
}

export function macaroniV35MetadataCommitment(input: MacaroniV35MetadataCommitmentInput): string {
  return sha256Hex(Buffer.from(packMacaroniV35MetadataCommitment(input), "hex"));
}

export function simulateMacaroniV35SwapPop(input: {
  slots: readonly number[];
  allocationDigest: string;
}) {
  if (input.slots.length < 1) throw new Error("Cannot allocate from an empty slot set");
  const slots = [...input.slots];
  const draw = macaroniV35DrawIndex(input.allocationDigest, slots.length);
  const last = slots.length - 1;
  const tokenId = slots[draw];
  if (draw !== last) slots[draw] = slots[last];
  slots.pop();
  return { draw, tokenId, remainingSlots: slots };
}

export function macaroniV35DrawIndex(allocationDigest: string, remainingSlots: number) {
  if (!Number.isSafeInteger(remainingSlots) || remainingSlots < 1) {
    throw new Error("Remaining slot count must be a positive integer");
  }
  return Number(BigInt(`0x${normalizedBytes(allocationDigest)}`) % BigInt(remainingSlots));
}
