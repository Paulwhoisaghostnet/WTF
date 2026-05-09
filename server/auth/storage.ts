import { eq, and, lt } from "drizzle-orm";
import { db } from "../db";
import { users, userWallets, walletAuthNonces } from "@shared/schema";
import type { UserRole } from "@shared/types";
import { randomBytes } from "crypto";

export async function getUserById(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  return user ?? null;
}

export async function createUser(data: {
  username: string;
  email?: string;
  passwordHash?: string;
  displayName?: string;
  role?: UserRole;
  googleId?: string;
  githubId?: string;
  twitterId?: string;
  discordId?: string;
}) {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

export async function findOrCreateSocialUser(
  provider: "google" | "github" | "twitter" | "discord",
  providerId: string,
  email?: string,
  displayName?: string
) {
  const idField =
    provider === "google"
      ? "googleId"
      : provider === "github"
        ? "githubId"
        : provider === "twitter"
          ? "twitterId"
          : "discordId";
  const dbField =
    provider === "google"
      ? users.googleId
      : provider === "github"
        ? users.githubId
        : provider === "twitter"
          ? users.twitterId
          : users.discordId;

  const existing = await db
    .select()
    .from(users)
    .where(eq(dbField, providerId));

  if (existing.length > 0) return existing[0];

  if (email) {
    const byEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (byEmail.length > 0) {
      const [updated] = await db
        .update(users)
        .set({ [idField]: providerId })
        .where(eq(users.id, byEmail[0].id))
        .returning();
      return updated;
    }
  }

  const username = `${provider}_${providerId.slice(0, 8)}`;
  return createUser({
    username,
    email: email || undefined,
    displayName: displayName || username,
    [idField]: providerId,
    role: "witness",
  });
}

export async function updateUserRole(
  userId: number,
  role: UserRole
) {
  const [updated] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function updateUserPassword(
  userId: number,
  passwordHash: string
) {
  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function markUserWelcomedToWtfOs(userId: number) {
  const [updated] = await db
    .update(users)
    .set({
      welcomedToWtfOs: true,
      welcomedToWtfOsAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function markUserGmWelcomeForUtcDay(
  userId: number,
  utcDay: string
) {
  const [updated] = await db
    .update(users)
    .set({
      gmWelcomeUtcDay: utcDay,
      gmWelcomeLastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

/**
 * Set or refresh the temp password for a user.
 * Pass `expiresAt: null` and `tempPasswordHash: null` to clear it.
 */
export async function updateUserTempPassword(
  userId: number,
  tempPasswordHash: string | null,
  tempPasswordExpiresAt: Date | null
) {
  const [updated] = await db
    .update(users)
    .set({ tempPasswordHash, tempPasswordExpiresAt, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function clearUserTempPassword(userId: number) {
  return updateUserTempPassword(userId, null, null);
}

export async function linkSocialAccount(
  userId: number,
  provider: "twitter" | "discord",
  providerId: string,
  handle: string,
  oauth?: {
    token?: string;
    tokenSecret?: string;
  }
) {
  const sets: Record<string, any> = { updatedAt: new Date() };

  if (provider === "twitter") {
    sets.twitterId = providerId;
    sets.twitterHandle = handle;
    sets.twitterVerified = true;
    if (oauth?.token) {
      sets.twitterOauthToken = oauth.token;
    }
    if (oauth?.tokenSecret) {
      sets.twitterOauthTokenSecret = oauth.tokenSecret;
    }
  } else {
    sets.discordId = providerId;
    sets.discordHandle = handle;
    sets.discordVerified = true;
  }

  const [updated] = await db
    .update(users)
    .set(sets)
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

// ─── Wallet Auth ──────────────────────────────────────────

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getUserByWalletAddress(walletAddress: string) {
  const [row] = await db
    .select({ user: users })
    .from(userWallets)
    .innerJoin(users, eq(users.id, userWallets.userId))
    .where(eq(userWallets.walletAddress, walletAddress))
    .limit(1);
  return row?.user ?? null;
}

export async function createWalletAuthNonce(walletAddress: string): Promise<string> {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  await db.insert(walletAuthNonces).values({
    walletAddress,
    nonce,
    expiresAt,
  });

  return nonce;
}

export async function consumeWalletAuthNonce(
  walletAddress: string,
  nonce: string
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(walletAuthNonces)
    .where(
      and(
        eq(walletAuthNonces.walletAddress, walletAddress),
        eq(walletAuthNonces.nonce, nonce),
        eq(walletAuthNonces.consumed, false)
      )
    )
    .limit(1);

  if (!row) return false;
  if (row.expiresAt < new Date()) return false;

  await db
    .update(walletAuthNonces)
    .set({ consumed: true })
    .where(eq(walletAuthNonces.id, row.id));

  return true;
}

export async function cleanupExpiredNonces() {
  await db
    .delete(walletAuthNonces)
    .where(lt(walletAuthNonces.expiresAt, new Date()));
}
