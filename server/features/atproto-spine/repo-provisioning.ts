import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { PdsAdminClient } from "@wtfos/atproto-spine";
import { wtfosAtprotoIdentities } from "@shared/schema";
import { db } from "../../db";
import { encryptOAuthSecret } from "../../auth/oauth-crypto";
import { getSpineConfig, isSpineEnabled } from "./config";
import {
  planProvision,
  repoAccountIdentity,
  type RepoMode,
} from "./provisioning-policy";
import { registerWtfosHandle } from "./handle-register";

/**
 * DB + PDS repo provisioning (S2.4). Flag-gated by ATPROTO_SPINE_ENABLED. Idempotent:
 * re-running returns the existing active identity instead of minting duplicates.
 */

export const PROVISIONING_DISABLED = "atproto_spine_disabled";

type Identity = typeof wtfosAtprotoIdentities.$inferSelect;

function missingRelation(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}

function generateRepoPassword(): string {
  return randomBytes(18).toString("base64url");
}

/** Ensure an identity row exists for (user, canonicalDid). Status starts at "offered". */
export async function ensureIdentityRow(input: {
  userId: number;
  canonicalDid: string;
  canonicalHandle?: string | null;
  atprotoAccountId?: number | null;
}): Promise<Identity | null> {
  const now = new Date();
  try {
    const [row] = await db
      .insert(wtfosAtprotoIdentities)
      .values({
        userId: input.userId,
        atprotoAccountId: input.atprotoAccountId ?? null,
        canonicalDid: input.canonicalDid,
        canonicalHandle: input.canonicalHandle ?? null,
        status: "offered",
        requestedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [wtfosAtprotoIdentities.userId, wtfosAtprotoIdentities.canonicalDid],
        set: {
          canonicalHandle: input.canonicalHandle ?? null,
          atprotoAccountId: input.atprotoAccountId ?? null,
          updatedAt: now,
        },
      })
      .returning();
    return row ?? null;
  } catch (err) {
    if (missingRelation(err)) return null;
    throw err;
  }
}

async function findIdentity(userId: number, canonicalDid: string): Promise<Identity | null> {
  try {
    const [row] = await db
      .select()
      .from(wtfosAtprotoIdentities)
      .where(
        and(
          eq(wtfosAtprotoIdentities.userId, userId),
          eq(wtfosAtprotoIdentities.canonicalDid, canonicalDid),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (missingRelation(err)) return null;
    throw err;
  }
}

export interface ProvisionRepoInput {
  userId: number;
  canonicalDid: string;
  canonicalHandle?: string | null;
  mode: Exclude<RepoMode, "byo">;
  /** Desired handle label; defaults to u-<userId>. */
  label?: string;
  atprotoAccountId?: number | null;
  fetchImpl?: typeof fetch;
}

/** Mint a tracking/hosted repo (did:plc) on the users PDS and mark the identity active. */
export async function provisionRepo(input: ProvisionRepoInput) {
  if (!isSpineEnabled()) throw new Error(PROVISIONING_DISABLED);
  await ensureIdentityRow({
    userId: input.userId,
    canonicalDid: input.canonicalDid,
    canonicalHandle: input.canonicalHandle,
    atprotoAccountId: input.atprotoAccountId,
  });
  const existing = await findIdentity(input.userId, input.canonicalDid);
  if (existing?.status === "active" && existing.wtfDid) {
    return { identity: existing, created: false };
  }

  const config = getSpineConfig();
  const plan = planProvision(input.mode);
  const { label, handle, email } = repoAccountIdentity(input.userId, input.label);
  const password = generateRepoPassword();
  const admin = new PdsAdminClient(
    plan.pdsUrl ?? config.master.url,
    config.users?.adminPassword ?? config.master.adminPassword,
    input.fetchImpl ?? fetch,
  );

  const now = new Date();
  try {
    const account = await admin.createAccount({
      handle,
      email,
      password,
      inviteCode: process.env.WTFOS_USERS_PDS_INVITE_CODE || undefined,
    });
    const [row] = await db
      .update(wtfosAtprotoIdentities)
      .set({
        wtfDid: account.did,
        wtfHandle: account.handle,
        wtfPdsUrl: plan.pdsUrl ?? config.master.url,
        status: "active",
        encryptedRepoPassword: plan.wtfHoldsKeys ? encryptOAuthSecret(password) : null,
        encryptedAccessToken: account.accessJwt ? encryptOAuthSecret(account.accessJwt) : null,
        encryptedRefreshToken: account.refreshJwt ? encryptOAuthSecret(account.refreshJwt) : null,
        provisionedAt: now,
        provisionError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(wtfosAtprotoIdentities.userId, input.userId),
          eq(wtfosAtprotoIdentities.canonicalDid, input.canonicalDid),
        ),
      )
      .returning();

    await registerWtfosHandle({
      userId: input.userId,
      did: account.did,
      label,
      atprotoAccountId: input.atprotoAccountId,
    }).catch(() => undefined);

    return { identity: row ?? null, created: true, did: account.did };
  } catch (err) {
    await db
      .update(wtfosAtprotoIdentities)
      .set({
        status: "failed",
        provisionError: err instanceof Error ? err.message : String(err),
        updatedAt: now,
      })
      .where(
        and(
          eq(wtfosAtprotoIdentities.userId, input.userId),
          eq(wtfosAtprotoIdentities.canonicalDid, input.canonicalDid),
        ),
      )
      .catch(() => undefined);
    throw err;
  }
}

export interface LinkByoInput {
  userId: number;
  canonicalDid: string;
  externalDid: string;
  externalHandle?: string | null;
  externalPdsUrl?: string | null;
  atprotoAccountId?: number | null;
}

/** Link a user-owned external DID (BYO). WTF never holds keys; no mint occurs. */
export async function linkByoIdentity(input: LinkByoInput) {
  if (!isSpineEnabled()) throw new Error(PROVISIONING_DISABLED);
  await ensureIdentityRow({
    userId: input.userId,
    canonicalDid: input.canonicalDid,
    atprotoAccountId: input.atprotoAccountId,
  });
  const now = new Date();
  const [row] = await db
    .update(wtfosAtprotoIdentities)
    .set({
      wtfDid: input.externalDid,
      wtfHandle: input.externalHandle ?? null,
      wtfPdsUrl: input.externalPdsUrl ?? null,
      status: "active",
      encryptedRepoPassword: null,
      provisionedAt: now,
      provisionError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(wtfosAtprotoIdentities.userId, input.userId),
        eq(wtfosAtprotoIdentities.canonicalDid, input.canonicalDid),
      ),
    )
    .returning();
  return { identity: row ?? null, linked: true };
}
