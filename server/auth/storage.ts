import { eq, and, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { users, userWallets, walletAuthNonces } from "@shared/schema";
import { isSystemUserRole, type UserRole } from "@shared/types";
import { randomBytes } from "crypto";
import { ensureUserRole, listUserRoles, setUserRoles } from "../lib/user-roles";
import type { WalletProofAction } from "./wallet-verify";

async function withRoleSet<T extends { id: number; role: UserRole } | null>(
  user: T
): Promise<(T & { roles: UserRole[] }) | null> {
  if (!user) return null;
  const roles = await listUserRoles(user.id, user.role);
  return { ...user, role: roles[0] ?? user.role, roles };
}

export async function getUserById(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return withRoleSet(user ?? null);
}

export async function getUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));
  return withRoleSet(user ?? null);
}

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  return withRoleSet(user ?? null);
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
  const { role, ...insertData } = data;
  const legacyRole = isSystemUserRole(role) ? role : "witness";
  const [user] = await db.insert(users).values({ ...insertData, role: legacyRole }).returning();
  if (user) await ensureUserRole(user.id, role || user.role);
  return withRoleSet(user);
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

  if (existing.length > 0) return withRoleSet(existing[0]);

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
      if (updated) await ensureUserRole(updated.id, updated.role);
      return withRoleSet(updated);
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
  return setUserRoles(userId, [role]);
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
  return withRoleSet(updated ?? null);
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
  return withRoleSet(updated ?? null);
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
  return withRoleSet(updated ?? null);
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
  return withRoleSet(updated ?? null);
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
  return withRoleSet(updated ?? null);
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
  return withRoleSet(row?.user ?? null);
}

export function createWalletAuthNonce(walletAddress: string): Promise<string>;
export function createWalletAuthNonce(
  walletAddress: string,
  context: { origin: string; action: WalletProofAction }
): Promise<{ nonce: string; expiresAt: Date }>;
export async function createWalletAuthNonce(
  walletAddress: string,
  context?: { origin: string; action: WalletProofAction }
): Promise<string | { nonce: string; expiresAt: Date }> {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  await db.insert(walletAuthNonces).values({
    walletAddress,
    nonce,
    origin: context?.origin ?? "https://wtfos.app",
    action: context?.action ?? "login",
    expiresAt,
  });

  return context ? { nonce, expiresAt } : nonce;
}

export function consumeWalletAuthNonce(
  walletAddress: string,
  nonce: string
): Promise<boolean>;
export function consumeWalletAuthNonce(
  walletAddress: string,
  nonce: string,
  context: { origin: string; action: WalletProofAction }
): Promise<{ expiresAt: Date } | null>;
export async function consumeWalletAuthNonce(
  walletAddress: string,
  nonce: string,
  context?: { origin: string; action: WalletProofAction }
): Promise<boolean | { expiresAt: Date } | null> {
  const conditions = [
    eq(walletAuthNonces.walletAddress, walletAddress),
    eq(walletAuthNonces.nonce, nonce),
    eq(walletAuthNonces.consumed, false),
    gt(walletAuthNonces.expiresAt, new Date()),
  ];
  if (context) {
    conditions.push(
      eq(walletAuthNonces.origin, context.origin),
      eq(walletAuthNonces.action, context.action)
    );
  }
  const claimed = await db
    .update(walletAuthNonces)
    .set({ consumed: true })
    .where(
      and(...conditions)
    )
    .returning({ expiresAt: walletAuthNonces.expiresAt });

  return context ? claimed[0] ?? null : claimed.length === 1;
}

export async function cleanupExpiredNonces() {
  await db
    .delete(walletAuthNonces)
    .where(lt(walletAuthNonces.expiresAt, new Date()));
}
