/**
 * Studio-scoped AES-256-GCM helper for OAuth refresh tokens and any other
 * secrets stored alongside a project / platform storage account row.
 *
 * Output format matches the two-column layout on
 * `studio_storage_accounts` and `studio_platform_storage`:
 *
 *   credential_nonce  = base64url(iv)                (12 bytes)
 *   credential_cipher = base64url(ciphertext || tag) (N + 16 bytes)
 *
 * The single key is derived via SHA-256 from `STUDIO_CRYPTO_KEY`. Local
 * development may use `SESSION_SECRET` to keep dev loops moving, but
 * production requires the dedicated Studio key so session rotation and
 * credential encryption remain separate blast-radius domains.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface SealedSecret {
  cipher: string;
  nonce: string;
}

let warnedFallback = false;

function getKey(): Buffer {
  const dedicated = process.env.STUDIO_CRYPTO_KEY?.trim();
  if (dedicated) {
    return createHash("sha256").update(dedicated).digest();
  }
  const fallback = process.env.SESSION_SECRET?.trim();
  if (fallback && process.env.NODE_ENV !== "production") {
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn(
        "[studio-crypto] STUDIO_CRYPTO_KEY is not set; using SESSION_SECRET " +
          "for local development only. Set a dedicated key before production."
      );
    }
    return createHash("sha256").update(fallback).digest();
  }
  throw new Error("Cannot seal Studio secret: STUDIO_CRYPTO_KEY is not set");
}

/** True when the effective Studio credential encryption key is available. */
export function isStudioCryptoConfigured(): boolean {
  if ((process.env.STUDIO_CRYPTO_KEY ?? "").trim()) return true;
  return (
    process.env.NODE_ENV !== "production" &&
    Boolean((process.env.SESSION_SECRET ?? "").trim())
  );
}

/**
 * Encrypt a secret and return the two-column envelope.  Throws if no
 * crypto key is available.
 */
export function sealSecret(plaintext: string): SealedSecret {
  const value = String(plaintext ?? "");
  if (!value) {
    throw new Error("Cannot seal empty secret");
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: Buffer.concat([encrypted, tag]).toString("base64url"),
    nonce: iv.toString("base64url"),
  };
}

/** Decrypt a sealed envelope.  Throws on tag mismatch or malformed input. */
export function openSecret(sealed: SealedSecret): string {
  if (!sealed || !sealed.cipher || !sealed.nonce) {
    throw new Error("Malformed sealed secret");
  }
  const iv = Buffer.from(sealed.nonce, "base64url");
  const combined = Buffer.from(sealed.cipher, "base64url");
  if (combined.length <= AUTH_TAG_BYTES) {
    throw new Error("Sealed ciphertext too short");
  }
  const tag = combined.subarray(combined.length - AUTH_TAG_BYTES);
  const encrypted = combined.subarray(0, combined.length - AUTH_TAG_BYTES);
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}
