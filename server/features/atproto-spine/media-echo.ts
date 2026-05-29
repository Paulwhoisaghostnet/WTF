import type { MediaEcho } from "@shared/atproto";
import { getObjectStorageConfig } from "../../lib/storage/object-storage";
import { getSpineConfig } from "./config";

/**
 * Media echo + gateway helpers (S2.6). Per doctrine, media BYTES stay in S3; repos carry a
 * lightweight `app.wtfos.media.echo` reference (cid + storage coordinates). The relay-proxy
 * media gateway (media.wtfos.me) serves the bytes from S3 on demand. These helpers are pure
 * (storage config is injectable) so they unit-test without S3.
 */

export interface MediaStorageRef {
  provider: string;
  bucket: string;
  key: string;
  endpoint?: string;
  region?: string;
}

export interface BuildMediaEchoInput {
  cid: string;
  mimeType: string;
  key: string;
  size?: number;
  width?: number;
  height?: number;
  alt?: string;
  license?: string;
  attribution?: string;
  blobRef?: unknown;
  createdAt?: string;
  /** Override the storage coordinates (defaults to the configured S3 bucket). */
  storage?: MediaStorageRef;
}

/** Resolve the default S3 storage coordinates for a key from object-storage env config. */
export function defaultMediaStorage(key: string): MediaStorageRef {
  const config = getObjectStorageConfig();
  const bucket = config?.bucket;
  // Fail loudly rather than silently embedding a wrong bucket: a media echo is a public,
  // content-addressed pointer, and an incorrect bucket produces a permanently dangling ref.
  if (!bucket) {
    throw new Error(
      "defaultMediaStorage: no object-storage bucket is configured; refusing to build a media echo with an unknown bucket (configure S3 object storage or pass an explicit storage ref)",
    );
  }
  return {
    provider: "s3",
    bucket,
    key,
    endpoint: config?.endpoint,
    region: config?.region,
  };
}

/** Build a validated-shape media.echo record body (no $type; injected at publish). */
export function buildMediaEchoRecord(
  input: BuildMediaEchoInput,
  env: NodeJS.ProcessEnv = process.env,
): Omit<MediaEcho, "$type"> {
  // Media echoes are PUBLIC records served by the public gateway. Enforce the public-media key
  // policy here so private/out-of-prefix media can never be echoed onto the AT network. When
  // WTFOS_MEDIA_KEY_PREFIX is set (required in production), only keys under it are echoable.
  if (!isAllowedMediaKey(input.key, env)) {
    throw new Error(
      `buildMediaEchoRecord: key "${input.key}" is not an allowed public media key (path traversal, scheme, or public-prefix violation)`,
    );
  }
  const storage = input.storage ?? defaultMediaStorage(input.key);
  return {
    schemaVersion: 1,
    cid: input.cid,
    mimeType: input.mimeType,
    size: input.size,
    width: input.width,
    height: input.height,
    alt: input.alt,
    license: input.license,
    attribution: input.attribution,
    blobRef: input.blobRef,
    storage,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** Public base URL of the media gateway, e.g. https://media.wtfos.me. */
export function mediaGatewayBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WTFOS_MEDIA_GATEWAY_URL) return env.WTFOS_MEDIA_GATEWAY_URL.replace(/\/$/, "");
  const { networkDomain } = getSpineConfig(env);
  return `https://media.${networkDomain}`;
}

/** Stable public URL for a media blob by cid (served by the gateway). */
export function mediaGatewayUrlForCid(cid: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${mediaGatewayBaseUrl(env)}/blob/${encodeURIComponent(cid)}`;
}

/**
 * Guard for gateway object keys: must be a non-empty relative key with no traversal,
 * scheme, or leading slash. Optionally enforce a configured key prefix.
 */
export function isAllowedMediaKey(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (key || "").trim();
  if (!value || value.length > 1024) return false;
  if (value.startsWith("/") || value.includes("://")) return false;
  if (value.split("/").some((seg) => seg === "." || seg === "..")) return false;
  const prefix = env.WTFOS_MEDIA_KEY_PREFIX;
  if (prefix && !value.startsWith(prefix)) return false;
  return true;
}
