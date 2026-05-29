import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { atprotoAccounts, atprotoHandleClaims, wtfosAtprotoIdentities } from "@shared/schema";
import { db } from "../../db";
import { mergeSpineIdentity, type SpineIdentity } from "./identity-merge";

/**
 * Unified spine identity resolver (S4.5). Collapses the three pre-existing identity sources
 * into ONE view the spine uses everywhere:
 *  - atprotoAccounts        : the user's canonical (BYO/OAuth) AT identity.
 *  - wtfosAtprotoIdentities : the WTF-provisioned tracking/hosted repo (the publish target).
 *  - atprotoHandleClaims    : the verified wtfos.me handle.
 *
 * The merge is pure + unit-tested (./identity-merge.ts); this is the thin DB wrapper.
 */

export { mergeSpineIdentity } from "./identity-merge";
export type { SpineIdentity, SpineIdentityParts } from "./identity-merge";

function missingRelation(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

/** Resolve the unified spine identity for a user, or null when nothing is linked. */
export async function resolveSpineIdentity(userId: number): Promise<SpineIdentity | null> {
  try {
    const [account] = await db
      .select()
      .from(atprotoAccounts)
      .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
      .limit(1);

    const [identity] = await db
      .select()
      .from(wtfosAtprotoIdentities)
      .where(
        and(
          eq(wtfosAtprotoIdentities.userId, userId),
          eq(wtfosAtprotoIdentities.status, "active"),
        ),
      )
      .orderBy(asc(wtfosAtprotoIdentities.id))
      .limit(1);

    const [claim] = await db
      .select({ handle: atprotoHandleClaims.desiredHandle })
      .from(atprotoHandleClaims)
      .where(
        and(
          eq(atprotoHandleClaims.userId, userId),
          eq(atprotoHandleClaims.verificationStatus, "verified"),
        ),
      )
      .orderBy(desc(atprotoHandleClaims.verifiedAt))
      .limit(1);

    if (!account && !identity) return null;
    return mergeSpineIdentity({
      userId,
      canonicalDid: account?.did ?? null,
      canonicalHandle: account?.handle ?? null,
      wtfDid: identity?.wtfDid ?? null,
      wtfHandle: identity?.wtfHandle ?? null,
      wtfPdsUrl: identity?.wtfPdsUrl ?? null,
      identityId: identity?.id ?? null,
      handleClaim: claim?.handle ?? null,
    });
  } catch (err) {
    if (missingRelation(err)) return null;
    throw err;
  }
}
