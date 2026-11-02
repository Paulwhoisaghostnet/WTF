import { and, eq, ne, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";

export type DiscordOwnerTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class DiscordIdentityAlreadyLinkedError extends Error {
  constructor() {
    super("Discord account is already linked to another WTF user");
    this.name = "DiscordIdentityAlreadyLinkedError";
  }
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
