import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { PdsAdminClient } from "@wtfos/atproto-spine";
import { atprotoHandleClaims } from "@shared/schema";
import { db } from "../../db";
import { getSpineConfig, isSpineEnabled } from "./config";
import { checkHandleAvailability, toWtfosHandle, type HandleAvailability } from "./handle-policy";

/**
 * DB-backed handle register (S2.3). Mints/upserts a verified `wtf_hosted_subdomain` claim
 * for `<label>.wtfos.me` so the existing GET /.well-known/atproto-did route resolves it
 * with no route change. Flag-gated by ATPROTO_SPINE_ENABLED: when off, availability checks
 * still work but registration is refused so nothing becomes resolvable.
 */

export const HANDLE_REGISTER_DISABLED = "atproto_spine_disabled";

function randomProofToken(): string {
  return randomBytes(24).toString("hex");
}

/** Resolve a handle to a DID via the users PDS (used as the availability oracle). */
export async function resolveHandleViaPds(
  handle: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const config = getSpineConfig();
  const pdsUrl = config.users?.url ?? config.master.url;
  const admin = new PdsAdminClient(pdsUrl, config.users?.adminPassword, fetchImpl);
  const result = await admin.resolveHandle(handle).catch(() => null);
  return result?.did ?? null;
}

/** Check availability against an existing verified claim first, then the PDS resolver. */
export async function isHandleAvailable(label: string): Promise<HandleAvailability> {
  return checkHandleAvailability({
    label,
    resolveDid: async (handle) => {
      try {
        const [claim] = await db
          .select({ did: atprotoHandleClaims.did })
          .from(atprotoHandleClaims)
          .where(
            and(
              eq(atprotoHandleClaims.desiredHandle, handle),
              eq(atprotoHandleClaims.verificationStatus, "verified"),
            ),
          )
          .limit(1);
        if (claim?.did) return claim.did;
      } catch (err) {
        if ((err as { code?: string })?.code !== "42P01") throw err;
      }
      return resolveHandleViaPds(handle).catch(() => null);
    },
  });
}

export interface RegisterHandleInput {
  userId: number;
  did: string;
  label: string;
  atprotoAccountId?: number | null;
}

/** Register/claim a wtfos.me handle for a DID. Returns the persisted claim row. */
export async function registerWtfosHandle(input: RegisterHandleInput) {
  if (!isSpineEnabled()) {
    throw new Error(HANDLE_REGISTER_DISABLED);
  }
  const availability = await isHandleAvailable(input.label);
  if (!availability.available && availability.existingDid !== input.did) {
    throw new Error(availability.reason ?? "handle_unavailable");
  }
  const handle = toWtfosHandle(input.label);
  const now = new Date();
  const [row] = await db
    .insert(atprotoHandleClaims)
    .values({
      userId: input.userId,
      atprotoAccountId: input.atprotoAccountId ?? null,
      did: input.did,
      desiredHandle: handle,
      verificationMethod: "wtf_hosted_subdomain",
      verificationStatus: "verified",
      proofToken: randomProofToken(),
      verifiedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [atprotoHandleClaims.userId, atprotoHandleClaims.desiredHandle],
      set: {
        did: input.did,
        atprotoAccountId: input.atprotoAccountId ?? null,
        verificationMethod: "wtf_hosted_subdomain",
        verificationStatus: "verified",
        verifiedAt: now,
        failureReason: null,
        updatedAt: now,
      },
    })
    .returning();
  return { handle, claim: row };
}

/** Kernel-side resolution mirror of the well-known route (host -> DID). */
export async function resolveWtfosHandleDid(host: string): Promise<string | null> {
  const normalized = host.trim().toLowerCase();
  try {
    const [claim] = await db
      .select({ did: atprotoHandleClaims.did })
      .from(atprotoHandleClaims)
      .where(
        and(
          eq(atprotoHandleClaims.desiredHandle, normalized),
          eq(atprotoHandleClaims.verificationStatus, "verified"),
          eq(atprotoHandleClaims.verificationMethod, "wtf_hosted_subdomain"),
        ),
      )
      .limit(1);
    return claim?.did ?? null;
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return null;
    throw err;
  }
}
