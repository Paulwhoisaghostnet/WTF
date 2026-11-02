import { and, eq, isNull } from "drizzle-orm";
import { users } from "@shared/schema";

export type XProofLinkSnapshot = {
  twitterId: string | null;
  twitterHandle: string | null;
  twitterVerified: boolean;
};

/** A callback may write only if the link is still the one it saw at start. */
export function xProofUnchangedLinkWhere(userId: number, snapshot: XProofLinkSnapshot) {
  return and(
    eq(users.id, userId),
    snapshot.twitterId === null
      ? isNull(users.twitterId)
      : eq(users.twitterId, snapshot.twitterId),
    snapshot.twitterHandle === null
      ? isNull(users.twitterHandle)
      : eq(users.twitterHandle, snapshot.twitterHandle),
    eq(users.twitterVerified, snapshot.twitterVerified)
  );
}
