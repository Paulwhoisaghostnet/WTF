import { ATPROTO_BASE_SCOPE } from "@shared/atproto-permissions";
import { normalizeAtHandle } from "./identity";

export const AT_PROTO_PROFILE_SCOPE = ATPROTO_BASE_SCOPE;

export function isIdentityOnlyAtprotoGrant(scope: string): boolean {
  const grants = new Set(scope.trim().split(/\s+/).filter(Boolean));
  return grants.size === 1 && grants.has(AT_PROTO_PROFILE_SCOPE);
}

export function atprotoProofProfileData(input: {
  requestedActor: string;
  verifiedDid: string;
  publicProfile: {
    did?: string;
    handle?: string;
    displayName?: string | null;
    avatar?: string | null;
    description?: string | null;
  } | null;
}): {
  handle: string;
  displayName: string | null;
  avatar: string | null;
  description: string | null;
} {
  if (input.publicProfile?.did && input.publicProfile.did !== input.verifiedDid) {
    throw new Error("Public AT profile DID does not match the OAuth identity");
  }
  return {
    handle: input.publicProfile?.handle || input.requestedActor || input.verifiedDid,
    displayName: input.publicProfile?.displayName ?? null,
    avatar: input.publicProfile?.avatar ?? null,
    description: input.publicProfile?.description ?? null,
  };
}

export function profileProofIdentityError(input: {
  requestedActor: string;
  requestedDid: string | null;
  verifiedDid: string;
  verifiedHandle: string;
  linkedOwnerUserId: number | null;
  userId: number;
}): "atproto_account_mismatch" | "atproto_already_linked" | null {
  const requestedActor = input.requestedActor.trim();
  const requestedDid = input.requestedDid || (requestedActor.startsWith("did:") ? requestedActor : null);
  const actorMatches = requestedDid
    ? requestedDid === input.verifiedDid
    : normalizeAtHandle(requestedActor) === normalizeAtHandle(input.verifiedHandle);
  if (!actorMatches) return "atproto_account_mismatch";
  if (input.linkedOwnerUserId !== null && input.linkedOwnerUserId !== input.userId) {
    return "atproto_already_linked";
  }
  return null;
}

export function shouldPreserveAtprotoGrantOnProfileProof(
  linkedDid: string | null | undefined,
  verifiedDid: string,
  hasStoredSession: boolean,
): boolean {
  return Boolean(linkedDid && linkedDid === verifiedDid && hasStoredSession);
}
