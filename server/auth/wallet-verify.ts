import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve(process.cwd(), "package.json"));

import { WTFOS_WALLET_LOGIN_CHALLENGE_PREFIX } from "@shared/platform-branding";

const CHALLENGE_PREFIX = WTFOS_WALLET_LOGIN_CHALLENGE_PREFIX;

export function buildChallengeMessage(nonce: string): string {
  return `${CHALLENGE_PREFIX}${nonce}`;
}

// bs58check v4 is ESM — require() yields { default: { encode, decode } }
function getB58() {
  const mod = require("bs58check");
  const lib = mod.default ?? mod;
  return lib as { encode: (data: Uint8Array) => string; decode: (str: string) => Uint8Array };
}

function blake2b(data: Buffer, outlen: number): Buffer {
  const mod = require("blakejs");
  const fn = mod.blake2b ?? mod.default?.blake2b;
  return Buffer.from(fn(data, undefined, outlen));
}

const TZ_PREFIXES: Array<{ pkPrefix: Buffer; addrPrefix: Buffer; tag: string }> = [
  { pkPrefix: Buffer.from([13, 15, 37, 217]), addrPrefix: Buffer.from([6, 161, 159]), tag: "edpk" },
  { pkPrefix: Buffer.from([3, 254, 226, 86]), addrPrefix: Buffer.from([6, 161, 161]), tag: "sppk" },
  { pkPrefix: Buffer.from([3, 178, 139, 127]), addrPrefix: Buffer.from([6, 161, 164]), tag: "p2pk" },
];

export function publicKeyToAddress(publicKey: string): string | null {
  if (!publicKey) return null;
  try {
    const b58 = getB58();
    const decoded = Buffer.from(b58.decode(publicKey));
    for (const tz of TZ_PREFIXES) {
      if (decoded.length > tz.pkPrefix.length) {
        let match = true;
        for (let i = 0; i < tz.pkPrefix.length; i++) {
          if (decoded[i] !== tz.pkPrefix[i]) { match = false; break; }
        }
        if (match) {
          const raw = decoded.subarray(tz.pkPrefix.length);
          const hash = blake2b(raw, 20);
          return b58.encode(Buffer.concat([tz.addrPrefix, hash]));
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Use taquito's battle-tested verifySignature to check the wallet signature.
 * Tries multiple message constructions to handle different wallet behaviors.
 */
export function verifyWalletSignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  if (!publicKey || !signature) {
    console.warn("[auth] verifyWalletSignature: missing publicKey or signature");
    return false;
  }

  let taquitoVerify: (msg: string, pk: string, sig: string, wm?: Uint8Array) => boolean;
  try {
    const utils = require("@taquito/utils");
    taquitoVerify = utils.verifySignature;
    if (typeof taquitoVerify !== "function") {
      console.error("[auth] verifySignature not found in @taquito/utils");
      return false;
    }
  } catch (e) {
    console.error("[auth] could not load @taquito/utils:", e);
    return false;
  }

  const msgBytes = Buffer.from(message, "utf8");
  const msgHex = msgBytes.toString("hex");

  // Canonical Michelson PACK of a utf-8 string:
  //   05 01 <4-byte BE byte-length> <utf-8 bytes>
  // taquito's verifySignature(hexBody, pk, sig, watermark) internally
  // computes blake2b(watermark + hexDecode(hexBody)) and checks the
  // signature against the resulting digest.  The watermark for signed
  // payloads is 0x05, so we pass the 01-prefixed string body and let
  // taquito apply the watermark.
  const byteLen = msgBytes.length;
  const canonicalBody =
    "01" + byteLen.toString(16).padStart(8, "0") + msgHex;

  // Legacy clients packed the length as `msgHex.length` (i.e. twice the
  // real byte length).  Wallets signed that malformed blob verbatim, so
  // existing signatures still need to round-trip.  We keep a single
  // legacy strategy — anything else was dead weight and widened the
  // attack surface (M-5).  Flip LEGACY_ENABLED off in a follow-up.
  const LEGACY_ENABLED = true;
  const hexCharCount = msgHex.length;
  const legacyBody =
    "01" + hexCharCount.toString(16).padStart(8, "0") + msgHex;

  const michelineWm = new Uint8Array([0x05]);
  const attempts: Array<{ label: string; hex: string; wm?: Uint8Array }> = [
    { label: "canonical string body + 05 wm", hex: canonicalBody, wm: michelineWm },
  ];
  if (LEGACY_ENABLED) {
    attempts.push({
      label: "legacy hex-char-count body + 05 wm",
      hex: legacyBody,
      wm: michelineWm,
    });
  }

  for (const attempt of attempts) {
    try {
      const ok = taquitoVerify(attempt.hex, publicKey, signature, attempt.wm);
      if (ok) {
        if (attempt.label.startsWith("legacy")) {
          console.warn(
            "[auth] signature verified with legacy strategy; upgrade the client payload"
          );
        }
        return true;
      }
    } catch {}
  }

  console.warn(
    "[auth] verifyWalletSignature: all",
    attempts.length,
    "strategies failed for pk:",
    publicKey.slice(0, 12)
  );
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
