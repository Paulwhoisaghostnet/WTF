import { eq, or } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import type { UserRole } from "@shared/types";

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
