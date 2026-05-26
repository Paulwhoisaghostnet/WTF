import { AtpAgent, type AtpSessionData } from "@atproto/api";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { decryptOAuthSecret, encryptOAuthSecret } from "../../auth/oauth-crypto";
import {
  atprotoAccounts,
  challengeSystemEvents,
  wtfosAtprotoIdentities,
  wtfosAtprotoOutbox,
} from "@shared/schema";

export const WTFOS_ACTIVITY_EVENT_COLLECTION = "app.wtfos.activity.event";
export const PRIMARY_WTFOS_OUTBOX_TARGET = "primary_wtfos_repo";
export const USER_WTFOS_OUTBOX_TARGET = "user_wtfos_repo";

type WtfosIdentity = typeof wtfosAtprotoIdentities.$inferSelect;
type WtfosOutboxRow = typeof wtfosAtprotoOutbox.$inferSelect;
type ChallengeSystemEvent = typeof challengeSystemEvents.$inferSelect;
type WtfosOutboxTarget =
  | typeof PRIMARY_WTFOS_OUTBOX_TARGET
  | typeof USER_WTFOS_OUTBOX_TARGET;

export type WtfosActivitySubject = {
  chain?: "tezos" | "etherlink";
  walletAddress?: string;
  uri?: string;
  cid?: string;
  [key: string]: unknown;
};

export function buildWtfosActivityEventRecord(input: {
  eventType: string;
  eventId?: string;
  systemEventId?: number;
  canonicalDid?: string | null;
  actorDid: string;
  source: string;
  sourceModule?: string | null;
  userId?: number | null;
  walletAddress?: string | null;
  subject?: WtfosActivitySubject;
  rawRef?: { type?: string | null; id?: string | null };
  metadata?: Record<string, unknown> | null;
  sourceRecordUri?: string;
  occurredAt?: Date;
  createdAt?: Date;
}) {
  return {
    $type: WTFOS_ACTIVITY_EVENT_COLLECTION,
    schemaVersion: 1,
    eventId: input.eventId ?? null,
    systemEventId: input.systemEventId ?? null,
    eventType: input.eventType,
    canonicalDid: input.canonicalDid ?? null,
    actorDid: input.actorDid,
    source: input.source,
    sourceModule: input.sourceModule ?? null,
    userId: input.userId ?? null,
    walletAddress: input.walletAddress ?? null,
    rawRef: input.rawRef ?? null,
    subject: input.subject ?? {},
    metadata: input.metadata ?? {},
    sourceRecordUri: input.sourceRecordUri ?? null,
    occurredAt: (input.occurredAt ?? input.createdAt ?? new Date()).toISOString(),
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  };
}

function serviceUrlForIdentity(identity: Pick<WtfosIdentity, "wtfPdsUrl">): string {
  return (
    process.env.WTFOS_PDS_INTERNAL_URL ||
    identity.wtfPdsUrl ||
    process.env.WTFOS_PDS_PUBLIC_URL ||
    process.env.ATPROTO_WTFOS_PDS_URL ||
    "https://pds.wtfgameshow.app"
  ).replace(/\/$/, "");
}

function missingRelation(err: unknown): boolean {
  return (err as any)?.code === "42P01" || String((err as any)?.message || err).includes("does not exist");
}

function primaryWtfosRepoConfig() {
  const did = (
    process.env.WTFOS_PRIMARY_ATPROTO_DID ||
    process.env.WTFOS_PRIMARY_DID ||
    ""
  ).trim();
  const handle = (
    process.env.WTFOS_PRIMARY_ATPROTO_HANDLE ||
    process.env.WTFOS_PRIMARY_HANDLE ||
    did
  ).trim();
  const pdsUrl = (
    process.env.WTFOS_PRIMARY_PDS_URL ||
    process.env.WTFOS_PDS_INTERNAL_URL ||
    process.env.WTFOS_PDS_PUBLIC_URL ||
    process.env.ATPROTO_WTFOS_PDS_URL ||
    "https://pds.wtfgameshow.app"
  ).replace(/\/$/, "");
  const identifier = (
    process.env.WTFOS_PRIMARY_PDS_IDENTIFIER ||
    handle ||
    did
  ).trim();
  const password = process.env.WTFOS_PRIMARY_PDS_PASSWORD?.trim() || "";
  const accessJwt = process.env.WTFOS_PRIMARY_PDS_ACCESS_JWT?.trim() || "";
  const refreshJwt = process.env.WTFOS_PRIMARY_PDS_REFRESH_JWT?.trim() || "";
  return {
    did,
    handle,
    pdsUrl,
    identifier,
    password,
    accessJwt,
    refreshJwt,
    configured: Boolean(did && (password || (accessJwt && refreshJwt))),
  };
}

export function isWtfosEventExportable(eventType: string): boolean {
  if (!eventType) return false;
  if (eventType.startsWith("wtfos.atproto_outbox.")) return false;
  if (eventType.startsWith("system.")) return false;
  if (eventType === "app.interaction.tracked") return true;
  return true;
}

export async function activeWtfosIdentityForUser(input: {
  userId: number;
  canonicalDid?: string | null;
}): Promise<WtfosIdentity | null> {
  const base = and(
    eq(wtfosAtprotoIdentities.userId, input.userId),
    eq(wtfosAtprotoIdentities.status, "active")
  );
  const condition = input.canonicalDid
    ? and(base, eq(wtfosAtprotoIdentities.canonicalDid, input.canonicalDid))
    : base;
  try {
    const [identity] = await db
      .select()
      .from(wtfosAtprotoIdentities)
      .where(condition)
      .orderBy(asc(wtfosAtprotoIdentities.id))
      .limit(1);
    return identity ?? null;
  } catch (err) {
    if (missingRelation(err)) return null;
    throw err;
  }
}

export async function enqueueWtfosActivityEvent(input: {
  userId: number;
  canonicalDid?: string | null;
  eventType: string;
  source: string;
  sourceModule?: string | null;
  walletAddress?: string | null;
  subject?: WtfosActivitySubject;
  sourceRefType?: string;
  sourceRefId?: string;
  sourceRecordUri?: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}) {
  const now = input.createdAt ?? new Date();
  const identity = await activeWtfosIdentityForUser({
    userId: input.userId,
    canonicalDid: input.canonicalDid,
  });
  const canPublish = Boolean(identity?.wtfDid);
  const record = buildWtfosActivityEventRecord({
    eventType: input.eventType,
    canonicalDid: input.canonicalDid,
    actorDid: identity?.wtfDid ?? "did:plc:wtfos-pending",
    source: input.source,
    sourceModule: input.sourceModule,
    userId: input.userId,
    walletAddress: input.walletAddress ?? input.subject?.walletAddress,
    subject: input.subject,
    sourceRecordUri: input.sourceRecordUri,
    metadata: input.metadata,
    createdAt: now,
  });

  try {
    const [row] = await db
      .insert(wtfosAtprotoOutbox)
      .values({
        userId: input.userId,
        wtfosIdentityId: identity?.id ?? null,
        targetType: USER_WTFOS_OUTBOX_TARGET,
        targetDid: identity?.wtfDid ?? null,
        targetHandle: identity?.wtfHandle ?? null,
        targetPdsUrl: identity?.wtfPdsUrl ?? null,
        collection: WTFOS_ACTIVITY_EVENT_COLLECTION,
        record,
        sourceEventType: input.eventType,
        sourceRefType: input.sourceRefType ?? null,
        sourceRefId: input.sourceRefId ?? null,
        status: canPublish ? "queued" : "skipped",
        lastError: canPublish ? null : "wtfos_identity_not_active",
        scheduledAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  } catch (err) {
    if (missingRelation(err)) return null;
    throw err;
  }
}

async function enqueueWtfosActivityEventTarget(input: {
  userId: number;
  targetType: WtfosOutboxTarget;
  targetDid: string | null;
  targetHandle?: string | null;
  targetPdsUrl?: string | null;
  wtfosIdentityId?: number | null;
  canonicalDid?: string | null;
  eventType: string;
  eventId?: string | null;
  systemEventId?: number | null;
  source: string;
  sourceModule?: string | null;
  walletAddress?: string | null;
  subject?: WtfosActivitySubject;
  rawRef?: { type?: string | null; id?: string | null };
  metadata?: Record<string, unknown> | null;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  sourceRecordUri?: string | null;
  occurredAt?: Date;
  createdAt?: Date;
  missingReason?: string | null;
}) {
  const now = input.createdAt ?? new Date();
  const canPublish = Boolean(input.targetDid) && !input.missingReason;
  const record = buildWtfosActivityEventRecord({
    eventType: input.eventType,
    eventId: input.eventId ?? undefined,
    systemEventId: input.systemEventId ?? undefined,
    canonicalDid: input.canonicalDid,
    actorDid: input.targetDid ?? "did:plc:wtfos-pending",
    source: input.source,
    sourceModule: input.sourceModule,
    userId: input.userId,
    walletAddress: input.walletAddress,
    subject: input.subject,
    rawRef: input.rawRef,
    metadata: input.metadata,
    sourceRecordUri: input.sourceRecordUri ?? undefined,
    occurredAt: input.occurredAt,
    createdAt: now,
  });

  const [row] = await db
    .insert(wtfosAtprotoOutbox)
    .values({
      userId: input.userId,
      wtfosIdentityId: input.wtfosIdentityId ?? null,
      targetType: input.targetType,
      targetDid: input.targetDid,
      targetHandle: input.targetHandle ?? null,
      targetPdsUrl: input.targetPdsUrl ?? null,
      collection: WTFOS_ACTIVITY_EVENT_COLLECTION,
      record,
      sourceEventType: input.eventType,
      sourceRefType: input.sourceRefType ?? null,
      sourceRefId: input.sourceRefId ?? null,
      status: canPublish ? "queued" : "skipped",
      lastError: canPublish ? null : input.missingReason ?? "target_not_configured",
      scheduledAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function updateIdentitySession(identityId: number, session: AtpSessionData) {
  await db
    .update(wtfosAtprotoIdentities)
    .set({
      encryptedAccessToken: encryptOAuthSecret(session.accessJwt),
      encryptedRefreshToken: encryptOAuthSecret(session.refreshJwt),
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wtfosAtprotoIdentities.id, identityId));
}

function systemEventSubject(event: ChallengeSystemEvent): WtfosActivitySubject {
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  return {
    eventId: event.eventId,
    systemEventId: event.id,
    eventType: event.eventType,
    walletAddress: event.walletAddress ?? undefined,
    rawRefType: event.rawRefType ?? undefined,
    rawRefId: event.rawRefId ?? undefined,
    chain: event.eventType.startsWith("blockchain.tezos.") ? "tezos" : undefined,
    sourceModule: event.sourceModule ?? undefined,
    opHash: typeof metadata.opHash === "string" ? metadata.opHash : undefined,
    level: typeof metadata.level === "number" ? metadata.level : undefined,
    tokenContract: typeof metadata.tokenContract === "string" ? metadata.tokenContract : undefined,
    tokenId: typeof metadata.tokenId === "string" ? metadata.tokenId : undefined,
  };
}

export async function enqueueWtfosSystemEventExports(event: ChallengeSystemEvent) {
  if (!event.userId || !isWtfosEventExportable(event.eventType)) return [];
  try {
    const [account] = await db
      .select()
      .from(atprotoAccounts)
      .where(and(eq(atprotoAccounts.userId, event.userId), isNull(atprotoAccounts.disconnectedAt)))
      .limit(1);
    const identity = await activeWtfosIdentityForUser({
      userId: event.userId,
      canonicalDid: account?.did,
    });
    const primary = primaryWtfosRepoConfig();
    const subject = systemEventSubject(event);
    const common = {
      userId: event.userId,
      canonicalDid: account?.did ?? null,
      eventType: event.eventType,
      eventId: event.eventId,
      systemEventId: event.id,
      source: event.source,
      sourceModule: event.sourceModule,
      walletAddress: event.walletAddress,
      subject,
      rawRef: { type: event.rawRefType, id: event.rawRefId },
      metadata: event.metadata,
      sourceRefType: "challenge_system_event",
      sourceRefId: event.eventId,
      occurredAt: event.occurredAt,
      createdAt: event.createdAt,
    };

    const rows = [];
    rows.push(
      await enqueueWtfosActivityEventTarget({
        ...common,
        targetType: PRIMARY_WTFOS_OUTBOX_TARGET,
        targetDid: primary.did || null,
        targetHandle: primary.handle || null,
        targetPdsUrl: primary.pdsUrl,
        missingReason: primary.did ? null : "primary_wtfos_repo_not_configured",
      })
    );
    rows.push(
      await enqueueWtfosActivityEventTarget({
        ...common,
        targetType: USER_WTFOS_OUTBOX_TARGET,
        targetDid: identity?.wtfDid ?? null,
        targetHandle: identity?.wtfHandle ?? null,
        targetPdsUrl: identity?.wtfPdsUrl ?? null,
        wtfosIdentityId: identity?.id ?? null,
        missingReason: identity?.wtfDid ? null : "user_wtfos_identity_not_active",
      })
    );
    return rows;
  } catch (err) {
    if (missingRelation(err)) return [];
    throw err;
  }
}

async function agentForWtfosIdentity(identity: WtfosIdentity) {
  if (!identity.wtfDid || !identity.encryptedAccessToken || !identity.encryptedRefreshToken) {
    throw new Error("wtfos_identity_session_incomplete");
  }
  const agent = new AtpAgent({
    service: serviceUrlForIdentity(identity),
    async persistSession(_event, session) {
      if (!session) return;
      await updateIdentitySession(identity.id, session);
    },
  });
  await agent.resumeSession({
    did: identity.wtfDid,
    handle: identity.wtfHandle || identity.wtfDid,
    accessJwt: decryptOAuthSecret(identity.encryptedAccessToken),
    refreshJwt: decryptOAuthSecret(identity.encryptedRefreshToken),
    active: true,
  });
  return agent;
}

async function agentForPrimaryWtfosRepo(row: Pick<WtfosOutboxRow, "targetDid" | "targetHandle" | "targetPdsUrl">) {
  const config = primaryWtfosRepoConfig();
  const targetDid = row.targetDid || config.did;
  if (!targetDid) throw new Error("primary_wtfos_repo_not_configured");
  const agent = new AtpAgent({ service: (row.targetPdsUrl || config.pdsUrl).replace(/\/$/, "") });
  if (config.accessJwt && config.refreshJwt) {
    await agent.resumeSession({
      did: targetDid,
      handle: row.targetHandle || config.handle || targetDid,
      accessJwt: config.accessJwt,
      refreshJwt: config.refreshJwt,
      active: true,
    });
    return agent;
  }
  if (!config.password || !config.identifier) {
    throw new Error("primary_wtfos_repo_credentials_missing");
  }
  const session = await agent.login({
    identifier: config.identifier,
    password: config.password,
  });
  if (session.data.did !== targetDid) {
    throw new Error("primary_wtfos_repo_did_mismatch");
  }
  return agent;
}

export async function publishWtfosOutboxItem(row: WtfosOutboxRow) {
  const now = new Date();
  if (row.status !== "queued") return row;
  if (!row.targetDid) {
    const [updated] = await db
      .update(wtfosAtprotoOutbox)
      .set({ status: "skipped", lastError: "wtfos_target_did_missing", updatedAt: now })
      .where(eq(wtfosAtprotoOutbox.id, row.id))
      .returning();
    return updated;
  }

  try {
    let agent: AtpAgent;
    if (row.targetType === USER_WTFOS_OUTBOX_TARGET) {
      if (!row.wtfosIdentityId) {
        throw new Error("wtfos_identity_missing");
      }
      const [identity] = await db
        .select()
        .from(wtfosAtprotoIdentities)
        .where(eq(wtfosAtprotoIdentities.id, row.wtfosIdentityId))
        .limit(1);
      if (!identity || identity.status !== "active" || identity.wtfDid !== row.targetDid) {
        throw new Error("wtfos_identity_not_active");
      }
      agent = await agentForWtfosIdentity(identity);
    } else {
      agent = await agentForPrimaryWtfosRepo(row);
    }
    const created = await agent.com.atproto.repo.createRecord(
      {
        repo: row.targetDid,
        collection: row.collection,
        rkey: row.rkey ?? undefined,
        record: row.record,
        validate: false,
      },
      { encoding: "application/json" }
    );
    const [updated] = await db
      .update(wtfosAtprotoOutbox)
      .set({
        status: "published",
        attempts: row.attempts + 1,
        recordUri: created.data.uri,
        recordCid: created.data.cid,
        lastError: null,
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(wtfosAtprotoOutbox.id, row.id))
      .returning();
    return updated;
  } catch (err) {
    const [updated] = await db
      .update(wtfosAtprotoOutbox)
      .set({
        status: "failed",
        attempts: row.attempts + 1,
        lastError: err instanceof Error ? err.message : String(err),
        updatedAt: now,
      })
      .where(eq(wtfosAtprotoOutbox.id, row.id))
      .returning();
    return updated;
  }
}

export async function publishQueuedWtfosOutbox(input: { userId?: number; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const condition = input.userId
    ? and(eq(wtfosAtprotoOutbox.status, "queued"), eq(wtfosAtprotoOutbox.userId, input.userId))
    : eq(wtfosAtprotoOutbox.status, "queued");
  const rows = await db
    .select()
    .from(wtfosAtprotoOutbox)
    .where(condition)
    .orderBy(asc(wtfosAtprotoOutbox.scheduledAt), asc(wtfosAtprotoOutbox.id))
    .limit(limit);
  const results = [];
  for (const row of rows) {
    results.push(await publishWtfosOutboxItem(row));
  }
  return results;
}

export async function wtfosOutboxStatusForUser(userId: number) {
  const [account] = await db
    .select()
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .limit(1);
  const identity = await activeWtfosIdentityForUser({ userId, canonicalDid: account?.did });
  const rows = await db
    .select()
    .from(wtfosAtprotoOutbox)
    .where(eq(wtfosAtprotoOutbox.userId, userId))
    .orderBy(asc(wtfosAtprotoOutbox.id))
    .limit(25);
  return {
    canonicalDid: account?.did ?? null,
    wtfDid: identity?.wtfDid ?? null,
    active: Boolean(identity?.wtfDid),
    primary: {
      did: primaryWtfosRepoConfig().did || null,
      configured: primaryWtfosRepoConfig().configured,
    },
    collection: WTFOS_ACTIVITY_EVENT_COLLECTION,
    pending: rows.filter((row) => row.status === "queued").length,
    published: rows.filter((row) => row.status === "published").length,
    failed: rows.filter((row) => row.status === "failed").length,
    skipped: rows.filter((row) => row.status === "skipped").length,
    targets: {
      primary: rows.filter((row) => row.targetType === PRIMARY_WTFOS_OUTBOX_TARGET).length,
      user: rows.filter((row) => row.targetType === USER_WTFOS_OUTBOX_TARGET).length,
    },
    recent: rows,
  };
}
