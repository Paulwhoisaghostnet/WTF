import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { hashMacaroniV35EntropyLink } from "./v35-crypto";

export const MACARONI_V35_ENTROPY_VERSION = "macaroni-v35-reverse-hash-chain.v1";

export function regenerateMacaroniV35EntropyChain(input: {
  seed: Uint8Array;
  length: number;
}) {
  if (!(input.seed instanceof Uint8Array) || input.seed.byteLength !== 32) {
    throw new Error("Macaroni entropy seed must contain exactly 32 bytes");
  }
  if (!Number.isSafeInteger(input.length) || input.length < 1) {
    throw new Error("Macaroni entropy chain length must be a positive integer");
  }
  const forward: Buffer[] = [Buffer.from(input.seed)];
  for (let index = 0; index < input.length; index += 1) {
    forward.push(Buffer.from(hashMacaroniV35EntropyLink(forward[forward.length - 1]), "hex"));
  }
  return {
    head: forward[input.length].toString("hex"),
    // Claim zero consumes the preimage of the public head.  FIFO order is
    // fixed; buyers/finalizers do not choose a preimage or a metadata row.
    preimages: forward.slice(0, input.length).reverse().map((value) => value.toString("hex")),
  };
}

export function generateMacaroniV35EntropyChain(input: {
  physicalSupply: number;
  random?: (size: number) => Buffer;
}) {
  if (!Number.isSafeInteger(input.physicalSupply) || input.physicalSupply < 1) {
    throw new Error("Physical supply must be fixed before generating entropy");
  }
  const seed = (input.random ?? randomBytes)(32);
  if (seed.byteLength !== 32) throw new Error("CSPRNG did not return a 32-byte seed");
  const chain = regenerateMacaroniV35EntropyChain({ seed, length: input.physicalSupply });
  return { seed, ...chain, length: input.physicalSupply, version: MACARONI_V35_ENTROPY_VERSION };
}

function encryptionKey(material: string): Buffer {
  if (material.trim().length < 32) throw new Error("Macaroni V3.5 encryption key material must be at least 32 characters");
  return createHash("sha256").update(material).digest();
}

export type MacaroniV35VersionedKeyring = {
  activeVersion: string;
  keys: ReadonlyMap<string, string>;
};

export function parseMacaroniV35VersionedKeyring(input: {
  serialized: string;
  activeVersion: string;
  label: string;
}): MacaroniV35VersionedKeyring {
  let decoded: unknown;
  try {
    decoded = JSON.parse(input.serialized);
  } catch {
    throw new Error(`${input.label} keyring must be valid JSON`);
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error(`${input.label} keyring must be a version-to-key object`);
  }
  const entries = Object.entries(decoded as Record<string, unknown>);
  const keys = new Map<string, string>();
  for (const [version, material] of entries) {
    if (!version.trim() || typeof material !== "string" || material.trim().length < 32) {
      throw new Error(`${input.label} keyring contains an invalid version or key material`);
    }
    keys.set(version, material);
  }
  if (!input.activeVersion || !keys.has(input.activeVersion)) {
    throw new Error(`${input.label} active key version is absent from its keyring`);
  }
  return { activeVersion: input.activeVersion, keys };
}

export function encryptedMacaroniV35EntropyKeyVersion(encrypted: string) {
  const [version, keyVersion] = encrypted.split(".");
  if (version !== "v1" || !keyVersion) throw new Error("Invalid encrypted entropy payload");
  return keyVersion;
}

export function decryptMacaroniV35EntropyWithKeyring(input: {
  encrypted: string;
  keyring: MacaroniV35VersionedKeyring;
  expectedHead: string;
  expectedLength: number;
}) {
  const keyVersion = encryptedMacaroniV35EntropyKeyVersion(input.encrypted);
  const keyMaterial = input.keyring.keys.get(keyVersion);
  if (!keyMaterial) throw new Error(`Entropy key version ${keyVersion} is unavailable`);
  return decryptMacaroniV35EntropySeed({
    encrypted: input.encrypted,
    keyMaterial,
    expectedHead: input.expectedHead,
    expectedLength: input.expectedLength,
  });
}

export function encryptMacaroniV35EntropySeed(input: {
  seed: Uint8Array;
  head: string;
  length: number;
  keyMaterial: string;
  keyVersion: string;
}) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(input.keyMaterial), iv);
  const plaintext = Buffer.from(JSON.stringify({
    version: MACARONI_V35_ENTROPY_VERSION,
    seed: Buffer.from(input.seed).toString("base64url"),
    head: input.head,
    length: input.length,
  }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [
    "v1",
    input.keyVersion,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function decryptMacaroniV35EntropySeed(input: {
  encrypted: string;
  keyMaterial: string;
  expectedHead: string;
  expectedLength: number;
}) {
  const [version, keyVersion, iv, ciphertext, tag, extra] = input.encrypted.split(".");
  if (version !== "v1" || !keyVersion || !iv || !ciphertext || !tag || extra) {
    throw new Error("Invalid encrypted entropy payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(input.keyMaterial), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const decoded = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8")) as { version: string; seed: string; head: string; length: number };
  const seed = Buffer.from(decoded.seed, "base64url");
  const regenerated = regenerateMacaroniV35EntropyChain({ seed, length: decoded.length });
  if (decoded.version !== MACARONI_V35_ENTROPY_VERSION
    || decoded.head !== input.expectedHead
    || decoded.length !== input.expectedLength
    || regenerated.head !== input.expectedHead) {
    throw new Error("Encrypted entropy recovery does not match the committed public head and length");
  }
  return { seed, keyVersion, ...regenerated };
}
