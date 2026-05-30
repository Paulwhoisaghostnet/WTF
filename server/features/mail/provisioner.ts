import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  atprotoAccounts,
  mailMailboxes,
  userWallets,
  users,
  wtfosAtprotoIdentities,
} from "@shared/schema";
import { getRegistrationRow } from "../app-registry/registry-service";
import { verifyAppKey } from "../app-registry/key-service";
import { isAppRegistryEnabled } from "../app-registry/config";
import { getMailConfig } from "./config";
import { normalizeMailLocalPart, validateMailLocalPart } from "./address";
import { evaluateBotMailGate, evaluateUserMailGate } from "./gates";
import { getRemoteMailboxConfig, provisionRemoteMailbox } from "./remote-mailbox";

function botLocalPart(appId: string, requested?: string): string {
  if (requested) {
    const v = validateMailLocalPart(normalizeMailLocalPart(requested));
    if (!v.ok) throw new Error(v.error);
    return `bot-${v.localPart}`.slice(0, 63);
  }
  const slug = appId.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  const suffix = randomBytes(4).toString("hex");
  return `bot-${slug}-${suffix}`.slice(0, 63);
}

async function wtfosIdentityForUser(userId: number) {
  const [row] = await db
    .select()
    .from(wtfosAtprotoIdentities)
    .where(eq(wtfosAtprotoIdentities.userId, userId))
    .orderBy(desc(wtfosAtprotoIdentities.updatedAt))
    .limit(1);
  return row ?? null;
}

async function atprotoAccountForUser(userId: number) {
  const [row] = await db
    .select({ did: atprotoAccounts.did, handle: atprotoAccounts.handle })
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  return row ?? null;
}

async function tezosWalletCount(userId: number): Promise<number> {
  const rows = await db
    .select({ id: userWallets.id })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  return rows.length;
}

export async function evaluateUserMailProvisioning(userId: number) {
  const [user] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("user_not_found");

  const [existing] = await db
    .select()
    .from(mailMailboxes)
    .where(and(eq(mailMailboxes.userId, userId), eq(mailMailboxes.ownerKind, "user")))
    .orderBy(desc(mailMailboxes.createdAt))
    .limit(1);

  const gate = evaluateUserMailGate({
    tezosWalletCount: await tezosWalletCount(userId),
    atprotoAccount: await atprotoAccountForUser(userId),
    wtfosIdentity: await wtfosIdentityForUser(userId),
    username: user.username,
  });

  return { user, existing, gate, config: getMailConfig() };
}

/** Claim or refresh a user compartment mailbox after gate checks pass. */
export async function provisionUserMailbox(userId: number) {
  const { existing, gate, config } = await evaluateUserMailProvisioning(userId);
  if (!gate.ok) {
    return { ok: false as const, gate };
  }
  if (existing?.status === "active") {
    return {
      ok: true as const,
      mailbox: existing,
      gate,
      provisioned: false,
      credentials: null,
    };
  }

  const remoteConfig = getRemoteMailboxConfig();
  if (!remoteConfig) throw new Error("mail_provision_not_configured");

  const remote = await provisionRemoteMailbox(gate.localPart, remoteConfig);
  const now = new Date();
  const metadata = {
    identitySource: gate.identitySource,
    did: gate.did,
    handle: gate.handle,
    remoteProvisioned: true,
  };

  if (existing) {
    const [updated] = await db
      .update(mailMailboxes)
      .set({
        localPart: gate.localPart,
        domain: config.domain,
        address: remote.address,
        status: "active",
        provisionedAt: now,
        metadata: { ...(existing.metadata || {}), ...metadata },
        updatedAt: now,
      })
      .where(eq(mailMailboxes.id, existing.id))
      .returning();
    return {
      ok: true as const,
      mailbox: updated,
      gate,
      provisioned: true,
      credentials: remote,
    };
  }

  const [mailbox] = await db
    .insert(mailMailboxes)
    .values({
      ownerKind: "user",
      userId,
      appId: null,
      localPart: gate.localPart,
      domain: config.domain,
      address: remote.address,
      status: "active",
      provisionedAt: now,
      metadata,
    })
    .returning();

  return {
    ok: true as const,
    mailbox,
    gate,
    provisioned: true,
    credentials: remote,
  };
}

/** Provision a bot mailbox when app key + email-integrated manifest pass. */
export async function provisionBotMailbox(input: {
  appKeySecret: string;
  localPart?: string;
  botLabel?: string;
}) {
  const verified = await verifyAppKey(input.appKeySecret);
  const registration = verified.appId ? await getRegistrationRow(verified.appId) : null;
  const gate = evaluateBotMailGate({
    appRegistryEnabled: isAppRegistryEnabled(),
    verifyReason: verified.reason === "ok" ? "ok" : verified.reason,
    appId: verified.appId,
    registration: registration
      ? {
          enabled: registration.enabled,
          lifecycleState: registration.lifecycleState,
          manifest: registration.manifest as Record<string, unknown> | null,
        }
      : null,
  });
  if (!gate.ok) {
    return { ok: false as const, gate };
  }

  const config = getMailConfig();
  const local = botLocalPart(gate.appId, input.localPart);
  const remoteConfig = getRemoteMailboxConfig();
  if (!remoteConfig) throw new Error("mail_provision_not_configured");

  const remote = await provisionRemoteMailbox(local, remoteConfig);
  const now = new Date();

  const [mailbox] = await db
    .insert(mailMailboxes)
    .values({
      ownerKind: "bot",
      userId: null,
      appId: gate.appId,
      localPart: local,
      domain: config.domain,
      address: remote.address,
      status: "active",
      provisionedAt: now,
      metadata: {
        botLabel: input.botLabel ?? null,
        appId: gate.appId,
        remoteProvisioned: true,
      },
    })
    .returning();

  return {
    ok: true as const,
    mailbox,
    gate,
    credentials: remote,
  };
}
