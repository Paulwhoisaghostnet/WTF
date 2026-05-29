import type { AtprotoRecordWrite } from "./types";

export const DEFAULT_MAX_RECORD_BYTES = 900_000;

export interface RecordMapOptions {
  /** Max serialized bytes before {@link shrink} runs. Defaults to {@link DEFAULT_MAX_RECORD_BYTES}. */
  maxRecordBytes?: number;
  /** Top-level keys stripped before publish (e.g. raw/internal fields). */
  stripKeys?: string[];
  /** Custom oversized-record reducer; defaults to {@link defaultShrink}. */
  shrink?: (record: Record<string, unknown>, byteSize: number) => Record<string, unknown>;
}

/**
 * Map an arbitrary record object into a publishable {@link AtprotoRecordWrite}.
 * Generalized from TZAT's publisher/record-mapper.ts with all Tezos specifics removed:
 * the collection is the record `$type`, the caller supplies the rkey, and oversized
 * records are reduced via a pluggable {@link RecordMapOptions.shrink}.
 */
export function mapToRecord(
  type: string,
  rkey: string,
  record: Record<string, unknown>,
  options: RecordMapOptions = {},
): AtprotoRecordWrite {
  return {
    collection: type,
    rkey: normalizeRkey(rkey),
    record: prepareRecord({ $type: type, ...record }, options),
  };
}

/** Build a deterministic, rkey-safe string from ordered parts (idempotent re-publish). */
export function deterministicRkey(parts: Array<string | number | null | undefined>): string {
  return normalizeRkey(parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("-"));
}

/** AT Protocol rkeys must be url-safe-ish and bounded; mirror TZAT's clamp. */
export function normalizeRkey(rkey: string): string {
  const cleaned = rkey.replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 512);
  return cleaned.length > 0 ? cleaned : "self";
}

/** Deep clone, strip configured keys, then shrink if oversized. */
export function prepareRecord(record: Record<string, unknown>, options: RecordMapOptions = {}): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  for (const key of options.stripKeys ?? []) {
    delete clone[key];
  }
  const byteSize = Buffer.byteLength(JSON.stringify(clone), "utf8");
  const max = options.maxRecordBytes ?? DEFAULT_MAX_RECORD_BYTES;
  if (byteSize <= max) {
    return clone;
  }
  return (options.shrink ?? defaultShrink)(clone, byteSize);
}

/**
 * Default oversized reducer: replace a `payload` field with a truncation marker if present,
 * otherwise attach a top-level truncation marker. The canonical copy always remains in
 * Postgres/S3; the published record keeps only traceable envelope fields.
 */
export function defaultShrink(record: Record<string, unknown>, byteSize: number): Record<string, unknown> {
  const marker = {
    truncated: true,
    originalByteSize: byteSize,
    reason: "atproto-record-size-limit",
    note: "Canonical copy remains in Postgres/S3; the published record keeps only envelope fields.",
  };
  if ("payload" in record) {
    return { ...record, payload: marker };
  }
  return { ...record, _wtfosTruncation: marker };
}
