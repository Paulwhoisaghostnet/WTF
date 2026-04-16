import { createHash, createVerify, verify as cryptoVerify } from "crypto";

const CHALLENGE_PREFIX = "WTF Gameshow Login\n\nNonce: ";

const TZ1_PREFIX = Buffer.from([6, 161, 159]);
const TZ2_PREFIX = Buffer.from([6, 161, 161]);
const TZ3_PREFIX = Buffer.from([6, 161, 164]);

const EDPK_PREFIX = Buffer.from([13, 15, 37, 217]);
const SPPK_PREFIX = Buffer.from([3, 254, 226, 86]);
const P2PK_PREFIX = Buffer.from([3, 178, 139, 127]);

const EDSIG_PREFIX = Buffer.from([9, 245, 205, 134, 18]);

const KEY_TYPES: Array<{
  pkPrefix: Buffer;
  addrPrefix: Buffer;
  pkTag: string;
}> = [
  { pkPrefix: EDPK_PREFIX, addrPrefix: TZ1_PREFIX, pkTag: "edpk" },
  { pkPrefix: SPPK_PREFIX, addrPrefix: TZ2_PREFIX, pkTag: "sppk" },
  { pkPrefix: P2PK_PREFIX, addrPrefix: TZ3_PREFIX, pkTag: "p2pk" },
];

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

export function verifyWalletSignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const rawKey = b58decode(publicKey, EDPK_PREFIX);
    const rawSig = b58decode(signature, EDSIG_PREFIX);

    const msgBytes = Buffer.from(message, "utf8");
    const msgHash = blake2b(msgBytes, 32);

    const nodeKey = cryptoVerify(
      "ed25519",
      msgHash,
      { key: Buffer.concat([Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]), rawKey]), format: "der", type: "spki" },
      rawSig,
    );

    return nodeKey;
  } catch {
    return false;
  }
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
