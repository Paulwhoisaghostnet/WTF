import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { AtprotoClient } from "@wtfos/atproto-spine";
import { getSpineConfig, isSpineEnabled } from "./config";

/**
 * Private encrypted PDS path (S2.7) for DMs and private rooms.
 *
 * Doctrine: this data is NEVER public. It lives in the private, NON-FEDERATED PDS
 * (private.wtfos.me) and is encrypted at rest with AES-256-GCM before it ever leaves the
 * kernel, so even a PDS compromise yields only ciphertext. The relay never crawls this PDS.
 *
 * Records are opaque envelopes (no readable lexicon), written with validate:false. Crypto
 * functions accept an explicit key so they are unit-testable without env configuration.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ENVELOPE_VERSION = "pv1";

export const PRIVATE_DISABLED = "atproto_spine_disabled";
export const PRIVATE_MESSAGE_COLLECTION = "app.wtfos.private.message";
export const PRIVATE_ROOM_COLLECTION = "app.wtfos.private.room";

function getKeyMaterial(env: NodeJS.ProcessEnv): string {
  const dedicated = env.WTFOS_PRIVATE_PDS_ENC_KEY?.trim();
  if (dedicated) return dedicated;
  const fallback = env.SESSION_SECRET?.trim();
  if (fallback && env.NODE_ENV !== "production") return fallback;
  throw new Error("Missing WTFOS_PRIVATE_PDS_ENC_KEY for private record encryption");
}

/** Derive a 32-byte key from key material (or an explicit per-room key). */
export function derivePrivateKey(material: string): Buffer {
  return createHash("sha256").update(material).digest();
}

/** Encrypt plaintext into an authenticated envelope string `pv1.iv.ct.tag`. */
export function encryptPrivatePayload(
  plaintext: string,
  keyMaterial?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = String(plaintext ?? "");
  const key = derivePrivateKey(keyMaterial ?? getKeyMaterial(env));
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

/** Decrypt an envelope produced by {@link encryptPrivatePayload}. Throws on tamper. */
export function decryptPrivatePayload(
  payload: string,
  keyMaterial?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const parts = String(payload || "").split(".");
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error("Invalid private envelope format");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const encrypted = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const key = derivePrivateKey(keyMaterial ?? getKeyMaterial(env));
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export interface PrivateEnvelopeInput {
  collection?: string;
  /** Plaintext JSON-serializable payload. */
  payload: unknown;
  roomRef?: string;
  keyMaterial?: string;
  createdAt?: string;
}

/** Build an opaque encrypted record body. Contains NO plaintext fields. */
export function buildPrivateEnvelopeRecord(input: PrivateEnvelopeInput): Record<string, unknown> {
  const collection = input.collection ?? PRIVATE_MESSAGE_COLLECTION;
  const plaintext = typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload ?? null);
  return {
    $type: collection,
    schemaVersion: 1,
    alg: ALGO,
    enc: encryptPrivatePayload(plaintext, input.keyMaterial),
    roomRef: input.roomRef,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** Decrypt an envelope record body back into its payload object. */
export function readPrivateEnvelopeRecord<T = unknown>(record: Record<string, unknown>, keyMaterial?: string): T {
  const enc = record.enc;
  if (typeof enc !== "string") throw new Error("private record missing enc envelope");
  const plaintext = decryptPrivatePayload(enc, keyMaterial);
  try {
    return JSON.parse(plaintext) as T;
  } catch {
    return plaintext as unknown as T;
  }
}

/**
 * Write an encrypted record to the private PDS (non-federated). Flag-gated. The private PDS
 * credentials come from spine config; reuses @wtfos/atproto-spine's AtprotoClient.
 */
export async function publishPrivateRecord(input: {
  repoDid: string;
  rkey: string;
  collection?: string;
  payload: unknown;
  roomRef?: string;
  keyMaterial?: string;
  identifier?: string;
  password?: string;
}) {
  if (!isSpineEnabled()) throw new Error(PRIVATE_DISABLED);
  const config = getSpineConfig();
  const service = config.privatePds?.url;
  if (!service) throw new Error("private_pds_unconfigured");
  const client = new AtprotoClient({
    service,
    identifier: input.identifier ?? config.privatePds?.identifier ?? "",
    password: input.password ?? config.privatePds?.password ?? "",
    repoDid: input.repoDid,
  });
  const record = buildPrivateEnvelopeRecord({
    collection: input.collection,
    payload: input.payload,
    roomRef: input.roomRef,
    keyMaterial: input.keyMaterial,
  });
  return client.createRecord({
    collection: record.$type as string,
    rkey: input.rkey,
    record,
  });
}
