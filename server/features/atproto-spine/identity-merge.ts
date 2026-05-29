/**
 * Pure spine identity merge (S4.5). No DB. Collapses the three identity sources (canonical
 * atprotoAccounts, WTF-provisioned wtfosAtprotoIdentities, verified handle claim) into one
 * resolved identity. The DB lookup lives in ./identity-resolve.ts.
 */

export interface SpineIdentityParts {
  userId: number;
  canonicalDid?: string | null;
  canonicalHandle?: string | null;
  wtfDid?: string | null;
  wtfHandle?: string | null;
  wtfPdsUrl?: string | null;
  identityId?: number | null;
  handleClaim?: string | null;
}

export interface SpineIdentity {
  userId: number;
  canonicalDid: string | null;
  /** The DID records are published into (WTF repo if provisioned, else canonical). */
  repoDid: string | null;
  handle: string | null;
  pdsUrl: string | null;
  identityId: number | null;
  hasRepo: boolean;
}

export function mergeSpineIdentity(parts: SpineIdentityParts): SpineIdentity {
  const repoDid = parts.wtfDid || parts.canonicalDid || null;
  const handle = parts.wtfHandle || parts.handleClaim || parts.canonicalHandle || null;
  return {
    userId: parts.userId,
    canonicalDid: parts.canonicalDid ?? null,
    repoDid,
    handle,
    pdsUrl: parts.wtfPdsUrl ?? null,
    identityId: parts.identityId ?? null,
    hasRepo: Boolean(parts.wtfDid),
  };
}
