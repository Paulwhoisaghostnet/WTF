import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const hexKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (hexKey && hexKey.length === 64) {
    cachedKey = Buffer.from(hexKey, "hex");
    return cachedKey;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY (64-char hex) must be set in production for token encryption",
    );
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY (64-char hex) or SESSION_SECRET must be set for token encryption",
    );
  }

  console.warn(
    "[token-encryption] TOKEN_ENCRYPTION_KEY not set; deriving key from SESSION_SECRET via PBKDF2. " +
      "Set TOKEN_ENCRYPTION_KEY for production use.",
  );
  cachedKey = pbkdf2Sync(sessionSecret, "wtf-token-encryption-salt", 100_000, 32, "sha256");
  return cachedKey;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(enc: string): string {
  if (!enc.includes(":")) {
    console.warn(
      "[token-encryption] Legacy base64 token detected. Re-link to upgrade to AES-256-GCM encryption.",
    );
    try {
      return Buffer.from(enc, "base64").toString("utf-8");
    } catch {
      return enc;
    }
  }

  const parts = enc.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
