import { createHash, createVerify, verify as cryptoVerify } from "crypto";

const CHALLENGE_PREFIX = "WTF Gameshow Login\n\nNonce: ";

const TZ1_PREFIX = Buffer.from([6, 161, 159]);
const EDPK_PREFIX = Buffer.from([13, 15, 37, 217]);
const EDSIG_PREFIX = Buffer.from([9, 245, 205, 134, 18]);

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

function blake2b(data: Buffer, outlen: number): Buffer {
  const blakejs = require("blakejs");
  return Buffer.from(blakejs.blake2b(data, undefined, outlen));
}

function publicKeyToAddress(publicKey: string): string {
  const bs58check = require("bs58check");
  const rawKey = b58decode(publicKey, EDPK_PREFIX);
  const hash = blake2b(rawKey, 20);
  return bs58check.encode(Buffer.concat([TZ1_PREFIX, hash]));
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
  try {
    const derivedAddress = publicKeyToAddress(publicKey);
    return derivedAddress === walletAddress;
  } catch {
    return false;
  }
}
