import { verify as cryptoVerify } from "crypto";

const CHALLENGE_PREFIX = "WTF Gameshow Login\n\nNonce: ";

const MICHELINE_WATERMARK = Buffer.from([0x05]);

const TZ1_PREFIX = Buffer.from([6, 161, 159]);
const TZ2_PREFIX = Buffer.from([6, 161, 161]);
const TZ3_PREFIX = Buffer.from([6, 161, 164]);

const EDPK_PREFIX = Buffer.from([13, 15, 37, 217]);
const SPPK_PREFIX = Buffer.from([3, 254, 226, 86]);
const P2PK_PREFIX = Buffer.from([3, 178, 139, 127]);

const EDSIG_PREFIX = Buffer.from([9, 245, 205, 134, 18]);
const SPSIG_PREFIX = Buffer.from([13, 115, 101, 19, 63]);
const P2SIG_PREFIX = Buffer.from([54, 240, 44, 52]);
const SIG_PREFIX = Buffer.from([4, 130, 43]);

const KEY_TYPES: Array<{
  pkPrefix: Buffer;
  addrPrefix: Buffer;
  sigPrefix: Buffer;
  pkTag: string;
  curve: string;
}> = [
  { pkPrefix: EDPK_PREFIX, addrPrefix: TZ1_PREFIX, sigPrefix: EDSIG_PREFIX, pkTag: "edpk", curve: "ed25519" },
  { pkPrefix: SPPK_PREFIX, addrPrefix: TZ2_PREFIX, sigPrefix: SPSIG_PREFIX, pkTag: "sppk", curve: "secp256k1" },
  { pkPrefix: P2PK_PREFIX, addrPrefix: TZ3_PREFIX, sigPrefix: P2SIG_PREFIX, pkTag: "p2pk", curve: "p256" },
];

const ED25519_DER_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

export function buildChallengeMessage(nonce: string): string {
  return `${CHALLENGE_PREFIX}${nonce}`;
}

function b58decode(encoded: string, expectedPrefix: Buffer): Buffer {
  const bs58check = require("bs58check");
  const decoded = bs58check.decode(encoded);
  if (!decoded.subarray(0, expectedPrefix.length).equals(expectedPrefix)) {
    throw new Error(`Invalid prefix for ${encoded}`);
  }
  return decoded.subarray(expectedPrefix.length);
}

function b58decodeAny(encoded: string): { raw: Buffer; type: typeof KEY_TYPES[number] } | null {
  const bs58check = require("bs58check");
  let decoded: Buffer;
  try {
    decoded = bs58check.decode(encoded);
  } catch {
    return null;
  }
  for (const kt of KEY_TYPES) {
    if (decoded.length > kt.pkPrefix.length && decoded.subarray(0, kt.pkPrefix.length).equals(kt.pkPrefix)) {
      return { raw: decoded.subarray(kt.pkPrefix.length), type: kt };
    }
  }
  return null;
}

function decodeSigAny(signature: string): Buffer | null {
  const bs58check = require("bs58check");
  let decoded: Buffer;
  try {
    decoded = bs58check.decode(signature);
  } catch {
    return null;
  }
  for (const kt of KEY_TYPES) {
    if (decoded.length > kt.sigPrefix.length && decoded.subarray(0, kt.sigPrefix.length).equals(kt.sigPrefix)) {
      return decoded.subarray(kt.sigPrefix.length);
    }
  }
  if (decoded.length > SIG_PREFIX.length && decoded.subarray(0, SIG_PREFIX.length).equals(SIG_PREFIX)) {
    return decoded.subarray(SIG_PREFIX.length);
  }
  return null;
}

function blake2b(data: Buffer, outlen: number): Buffer {
  const blakejs = require("blakejs");
  return Buffer.from(blakejs.blake2b(data, undefined, outlen));
}

export function publicKeyToAddress(publicKey: string): string | null {
  const bs58check = require("bs58check");
  const parsed = b58decodeAny(publicKey);
  if (!parsed) return null;
  const hash = blake2b(parsed.raw, 20);
  return bs58check.encode(Buffer.concat([parsed.type.addrPrefix, hash]));
}

/**
 * Build the micheline-packed bytes for a UTF-8 string (without watermark).
 * Result: 01 <4-byte-hex-len> <hex-encoded-utf8>
 */
function packMichelineStringBody(message: string): Buffer {
  const msgBytes = Buffer.from(message, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBytes.length, 0);
  return Buffer.concat([Buffer.from([0x01]), lenBuf, msgBytes]);
}

function ed25519Verify(rawKey: Buffer, hash: Buffer, rawSig: Buffer): boolean {
  try {
    return cryptoVerify(
      "ed25519",
      hash,
      { key: Buffer.concat([ED25519_DER_PREFIX, rawKey]), format: "der", type: "spki" },
      rawSig,
    );
  } catch {
    return false;
  }
}

export function verifyWalletSignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  if (!publicKey || !signature) {
    console.warn("[auth] verifyWalletSignature: missing publicKey or signature");
    return false;
  }

  const parsedKey = b58decodeAny(publicKey);
  if (!parsedKey) {
    console.warn("[auth] verifyWalletSignature: could not decode publicKey:", publicKey.slice(0, 10));
    return false;
  }

  const rawSig = decodeSigAny(signature);
  if (!rawSig) {
    console.warn("[auth] verifyWalletSignature: could not decode signature:", signature.slice(0, 10));
    return false;
  }

  const michelineBody = packMichelineStringBody(message);

  // Wallets prepend 0x05 watermark when signingType is "micheline",
  // so the signed bytes = blake2b(0x05 || michelineBody, 32).
  const watermarked = Buffer.concat([MICHELINE_WATERMARK, michelineBody]);
  const hashWatermarked = blake2b(watermarked, 32);

  // Fallback: some wallets/SDKs may skip the watermark if payload already included 0x05.
  // In that case the signed bytes = blake2b(0x05 || michelineBody, 32) same as above
  // OR = blake2b(michelineBody, 32).
  const hashNoWatermark = blake2b(michelineBody, 32);

  // Legacy fallback: the client's packMichelineString used hex.length instead of byte length.
  // Reconstruct that format to handle signatures created with the old packing.
  const msgBytes = Buffer.from(message, "utf8");
  const hex = msgBytes.toString("hex");
  const legacyPackedHex = "0501" + hex.length.toString(16).padStart(8, "0") + hex;
  const legacyPacked = Buffer.from(legacyPackedHex, "hex");
  const hashLegacy = blake2b(legacyPacked, 32);
  const hashLegacyWatermarked = blake2b(Buffer.concat([MICHELINE_WATERMARK, legacyPacked]), 32);

  if (parsedKey.type.curve === "ed25519") {
    const candidates = [hashWatermarked, hashNoWatermark, hashLegacy, hashLegacyWatermarked];
    for (const hash of candidates) {
      if (ed25519Verify(parsedKey.raw, hash, rawSig)) return true;
    }
    console.warn("[auth] verifyWalletSignature: none of", candidates.length, "ed25519 hash strategies passed");
    return false;
  }

  console.warn("[auth] verifyWalletSignature: unsupported curve", parsedKey.type.curve);
  return false;
}

export function verifyPublicKeyOwnership(
  walletAddress: string,
  publicKey: string
): boolean {
  if (!publicKey) return false;
  try {
    const derivedAddress = publicKeyToAddress(publicKey);
    if (!derivedAddress) return false;
    return derivedAddress === walletAddress;
  } catch {
    return false;
  }
}
