import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const TOKEN_VERSION = "v1";

function getKeyMaterial(): string {
  const dedicated = process.env.TWITTER_TOKEN_ENCRYPTION_KEY?.trim();
  if (dedicated) return dedicated;

  const fallback = process.env.SESSION_SECRET?.trim();
  if (fallback && process.env.NODE_ENV !== "production") {
    console.warn(
      "[oauth-crypto] TWITTER_TOKEN_ENCRYPTION_KEY is not set; " +
        "using SESSION_SECRET for local development only. Set a dedicated " +
        "key before running production."
    );
    return fallback;
  }

  return "";
}

function getKey(): Buffer {
  const keyMaterial = getKeyMaterial();
  if (!keyMaterial) {
    throw new Error(
      "Missing TWITTER_TOKEN_ENCRYPTION_KEY for Twitter OAuth token encryption"
    );
  }
  return createHash("sha256").update(keyMaterial).digest();
}

export function encryptOAuthSecret(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) {
    throw new Error("Cannot encrypt empty OAuth secret");
  }

  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptOAuthSecret(payload: string): string {
  const parts = String(payload || "").split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    throw new Error("Invalid encrypted OAuth payload format");
  }

  const iv = Buffer.from(parts[1], "base64url");
  const encrypted = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const key = getKey();

  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
