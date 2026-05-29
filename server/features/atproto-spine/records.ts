import { mapToRecord, type AtprotoRecordWrite } from "@wtfos/atproto-spine";
import { validateLexiconRecord, type LexiconId } from "@shared/atproto";
import { getSpineConfig, RESERVED_HANDLES } from "./config";

/**
 * Pure record helpers for the kernel spine (no DB / network imports), so they are cheaply
 * unit-testable. The DB-bound publish/read facade lives in ./service.ts.
 */

/** Validate against the lexicon registry then map to a publishable write (deterministic rkey + size guard). */
export function buildSpineWrite(
  type: LexiconId,
  record: Record<string, unknown>,
  rkeyParts?: Array<string | number | null | undefined>,
): AtprotoRecordWrite {
  const validated = validateLexiconRecord<Record<string, unknown>>(type, { $type: type, ...record });
  const rkey =
    rkeyParts && rkeyParts.length > 0
      ? rkeyParts.map((p) => (p === null || p === undefined ? "" : String(p))).join("-")
      : "self";
  const { maxRecordBytes } = getSpineConfig();
  return mapToRecord(type, rkey, validated, { maxRecordBytes });
}

const RESERVED_SET = new Set(RESERVED_HANDLES.map((h) => h.toLowerCase()));

/** A handle label is registrable only if it is a valid DNS label and not reserved. */
export function isRegistrableHandleLabel(label: string): boolean {
  const value = (label || "").trim().toLowerCase();
  if (value.length < 3 || value.length > 30) return false;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) return false;
  if (RESERVED_SET.has(value)) return false;
  return true;
}

/** Build a full handle from a label, e.g. "alice" -> "alice.wtfos.me". */
export function handleForLabel(label: string, networkDomain = getSpineConfig().networkDomain): string {
  return `${label.trim().toLowerCase()}.${networkDomain}`;
}
