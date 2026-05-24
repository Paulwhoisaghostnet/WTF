import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  communicationIdentities,
  communicationSources,
  users,
  userWallets,
} from "@shared/schema";

export function normalizeIdentityKey(value: string): string {
  return value.trim().toLowerCase();
}

export async function resolveOrCreateCommunicationIdentity(input: {
  sourceKey: string;
  identityKey: string;
  displayName?: string | null;
  handle?: string | null;
  profileUrl?: string | null;
  userId?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const sourceKey = normalizeIdentityKey(input.sourceKey);
  const identityKey = normalizeIdentityKey(input.identityKey);
  if (!sourceKey || !identityKey) return null;

  const [source] = await db
    .select({ id: communicationSources.id })
    .from(communicationSources)
    .where(eq(communicationSources.key, sourceKey))
    .limit(1);
  if (!source) return null;

  const [identity] = await db
    .insert(communicationIdentities)
    .values({
      sourceId: source.id,
      identityKey,
      displayName: input.displayName ?? null,
      handle: input.handle ?? null,
      profileUrl: input.profileUrl ?? null,
      userId: input.userId ?? null,
      metadata: input.metadata ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [communicationIdentities.sourceId, communicationIdentities.identityKey],
      set: {
        displayName: input.displayName ?? null,
        handle: input.handle ?? null,
        profileUrl: input.profileUrl ?? null,
        userId: input.userId ?? null,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();

  return identity ?? null;
}

export async function findUserIdForEmailAddress(address: string): Promise<number | null> {
  const email = normalizeIdentityKey(address);
  if (!email) return null;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user?.id ?? null;
}

export async function findUserIdForWallet(address: string): Promise<number | null> {
  const wallet = address.trim();
  if (!wallet) return null;
  const [row] = await db
    .select({ userId: userWallets.userId })
    .from(userWallets)
    .where(eq(userWallets.walletAddress, wallet))
    .limit(1);
  return row?.userId ?? null;
}

export async function findCommunicationIdentity(input: {
  sourceKey: string;
  identityKey: string;
}) {
  const sourceKey = normalizeIdentityKey(input.sourceKey);
  const identityKey = normalizeIdentityKey(input.identityKey);
  const [row] = await db
    .select({
      id: communicationIdentities.id,
      userId: communicationIdentities.userId,
      displayName: communicationIdentities.displayName,
      handle: communicationIdentities.handle,
    })
    .from(communicationIdentities)
    .innerJoin(
      communicationSources,
      eq(communicationIdentities.sourceId, communicationSources.id)
    )
    .where(
      and(
        eq(communicationSources.key, sourceKey),
        eq(communicationIdentities.identityKey, identityKey)
      )
    )
    .limit(1);
  return row ?? null;
}
