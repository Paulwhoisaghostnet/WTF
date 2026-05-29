import { getSpineConfig } from "./config";
import { isRegistrableHandleLabel, handleForLabel } from "./records";

/**
 * Pure handle-registration policy (S2.3). No DB/network: availability takes an injectable
 * resolver so it is unit-testable. The DB-backed register lives in ./handle-register.ts.
 *
 * wtfOS handles look like `alice.wtfos.me`. They resolve via the HTTP well-known method
 * already served at GET /.well-known/atproto-did (server/routes/atproto.ts), so the
 * register only needs to mint a verified wtf_hosted_subdomain claim — no DNS changes per
 * handle thanks to the *.wtfos.me wildcard.
 */

export type HandleUnavailableReason =
  | "label_reserved_or_invalid"
  | "handle_taken"
  | null;

export interface HandleAvailability {
  available: boolean;
  label: string;
  handle: string;
  reason: HandleUnavailableReason;
  existingDid?: string | null;
}

/** Normalize a requested label and produce the full handle (no validation). */
export function toWtfosHandle(label: string, networkDomain = getSpineConfig().networkDomain): string {
  return handleForLabel(label, networkDomain);
}

/**
 * Check whether a label can be registered. `resolveDid` should resolve the full handle to a
 * DID (e.g. via PdsAdminClient.resolveHandle) and return null when unresolved/available.
 */
export async function checkHandleAvailability(input: {
  label: string;
  resolveDid: (handle: string) => Promise<string | null>;
  networkDomain?: string;
}): Promise<HandleAvailability> {
  const label = (input.label || "").trim().toLowerCase();
  const networkDomain = input.networkDomain ?? getSpineConfig().networkDomain;
  const handle = toWtfosHandle(label, networkDomain);

  if (!isRegistrableHandleLabel(label)) {
    return { available: false, label, handle, reason: "label_reserved_or_invalid" };
  }
  const existingDid = await input.resolveDid(handle);
  if (existingDid) {
    return { available: false, label, handle, reason: "handle_taken", existingDid };
  }
  return { available: true, label, handle, reason: null };
}
