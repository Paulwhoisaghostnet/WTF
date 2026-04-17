const CHALLENGE_PREFIX = "WTF Gameshow Login\n\nNonce: ";

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

  // The client constructs the payload as:
  //   "0501" + hexCharCount.toString(16).padStart(8, "0") + msgHex
  // and sends it with signingType: "micheline"
  const hexCharCount = msgHex.length;
  const clientPayload = "0501" + hexCharCount.toString(16).padStart(8, "0") + msgHex;

  // Correct micheline packing uses byte length, not hex-char length
  const byteLen = msgBytes.length;
  const correctPayload = "0501" + byteLen.toString(16).padStart(8, "0") + msgHex;

  // Without the 05 watermark prefix (just the micheline string body)
  const clientBody = "01" + hexCharCount.toString(16).padStart(8, "0") + msgHex;
  const correctBody = "01" + byteLen.toString(16).padStart(8, "0") + msgHex;

  const michelineWm = new Uint8Array([0x05]);

  // All possible combinations of message hex and watermark presence.
  // taquito's verifySignature(hexMessage, pk, sig, watermark?) internally does:
  //   blake2b(watermark + hexDecode(hexMessage), 32) then verifies.
  const attempts: Array<{ label: string; hex: string; wm?: Uint8Array }> = [
    { label: "clientPayload (no wm)", hex: clientPayload },
    { label: "clientPayload + 05 wm", hex: clientPayload, wm: michelineWm },
    { label: "correctPayload (no wm)", hex: correctPayload },
    { label: "correctPayload + 05 wm", hex: correctPayload, wm: michelineWm },
    { label: "clientBody + 05 wm", hex: clientBody, wm: michelineWm },
    { label: "correctBody + 05 wm", hex: correctBody, wm: michelineWm },
    { label: "raw msgHex (no wm)", hex: msgHex },
    { label: "raw msgHex + 05 wm", hex: msgHex, wm: michelineWm },
  ];

  for (const attempt of attempts) {
    try {
      const ok = taquitoVerify(attempt.hex, publicKey, signature, attempt.wm);
      if (ok) {
        console.log("[auth] signature verified with strategy:", attempt.label);
        return true;
      }
    } catch {}
  }

  console.warn("[auth] verifyWalletSignature: all", attempts.length, "strategies failed for pk:", publicKey.slice(0, 12));
  console.warn("[auth] debug: message length:", message.length, "hex:", msgHex.slice(0, 40), "...");
  console.warn("[auth] debug: clientPayload[0:20]:", clientPayload.slice(0, 20));
  console.warn("[auth] debug: sig:", signature.slice(0, 15), "...");
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
