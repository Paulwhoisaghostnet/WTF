import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import type { DiscordLinkSnapshot } from "./discord-link";

export type DiscordOwnerTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class DiscordIdentityAlreadyLinkedError extends Error {
  constructor() {
    super("Discord account is already linked to another WTF user");
    this.name = "DiscordIdentityAlreadyLinkedError";
  }
}

export class DiscordLinkChangedError extends Error {
  constructor() {
    super("Discord link changed while authorization was in progress");
    this.name = "DiscordLinkChangedError";
  }
}

/** The database update must match the link that existed when OAuth started. */
export function discordLinkSnapshotCondition(userId: number, snapshot: DiscordLinkSnapshot) {
  return and(
    eq(users.id, userId),
    snapshot.discordId === null
      ? isNull(users.discordId)
      : eq(users.discordId, snapshot.discordId),
    snapshot.discordHandle === null
      ? isNull(users.discordHandle)
      : eq(users.discordHandle, snapshot.discordHandle),
    eq(users.discordVerified, snapshot.discordVerified)
  );
}

/** Both Profile OAuth and bot proof must call this inside their write transaction. */
export async function assertDiscordIdentityAvailable(
  tx: DiscordOwnerTransaction,
  discordUserId: string,
  userId: number
): Promise<void> {
  // Locking the provider ID covers the absent-row race that SELECT FOR UPDATE
  // cannot prevent. Hash collisions only serialize unrelated claims.
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtext(${"wtf:discord-identity"}),
      hashtext(${discordUserId})
    )
  `);
  const [otherOwner] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.discordId, discordUserId), ne(users.id, userId)))
    .limit(1);
  if (otherOwner) throw new DiscordIdentityAlreadyLinkedError();
}
