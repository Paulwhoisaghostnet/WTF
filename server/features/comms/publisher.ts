import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  communicationItems,
  communicationReadStates,
  communicationSources,
  communicationThreads,
} from "@shared/schema";
import type {
  CommunicationCard,
  CommunicationItemKind,
  CommunicationSourceKind,
} from "@shared/comms";
import {
  COMMS_SOURCE_DEFINITIONS,
  sourceDefinitionByKey,
  type CommsSourceDefinition,
} from "./source-registry";

export type PublishCommunicationItemInput = {
  sourceKey: string;
  externalRef: string;
  itemKind: CommunicationItemKind;
  title: string;
  summary?: string | null;
  body?: string | null;
  authorLabel?: string | null;
  targetUserId?: number | null;
  actorIdentityId?: number | null;
  thread?: {
    externalThreadRef: string;
    title: string;
    routePath?: string | null;
    originUrl?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  routePath?: string | null;
  originUrl?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export async function ensureCommunicationSource(def: CommsSourceDefinition) {
  const [source] = await db
    .insert(communicationSources)
    .values({
      key: def.key,
      label: def.label,
      sourceKind: def.sourceKind,
      adapterKey: def.adapterKey,
      enabled: def.enabled,
      readOnly: def.readOnly,
      routeBase: def.routeBase,
      metadata: def.metadata ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: communicationSources.key,
      set: {
        label: def.label,
        sourceKind: def.sourceKind,
        adapterKey: def.adapterKey,
        enabled: def.enabled,
        readOnly: def.readOnly,
        routeBase: def.routeBase,
        metadata: def.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();
  return source;
}

export async function ensureDefaultCommunicationSources() {
  const rows = [];
  for (const def of COMMS_SOURCE_DEFINITIONS) {
    rows.push(await ensureCommunicationSource(def));
  }
  return rows;
}

export async function publishCommunicationItem(input: PublishCommunicationItemInput) {
  const def = sourceDefinitionByKey(input.sourceKey);
  if (!def) throw new Error(`Unknown communication source: ${input.sourceKey}`);
  const source = await ensureCommunicationSource(def);
  const now = new Date();

  let threadId: number | null = null;
  if (input.thread) {
    const [thread] = await db
      .insert(communicationThreads)
      .values({
        sourceId: source.id,
        externalThreadRef: input.thread.externalThreadRef,
        title: input.thread.title,
        routePath: input.thread.routePath ?? null,
        originUrl: input.thread.originUrl ?? null,
        lastItemAt: input.occurredAt ?? now,
        metadata: input.thread.metadata ?? {},
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          communicationThreads.sourceId,
          communicationThreads.externalThreadRef,
        ],
        set: {
          title: input.thread.title,
          routePath: input.thread.routePath ?? null,
          originUrl: input.thread.originUrl ?? null,
          lastItemAt: input.occurredAt ?? now,
          metadata: input.thread.metadata ?? {},
          updatedAt: now,
        },
      })
      .returning();
    threadId = thread?.id ?? null;
  }

  const [item] = await db
    .insert(communicationItems)
    .values({
      sourceId: source.id,
      threadId,
      targetUserId: input.targetUserId ?? null,
      actorIdentityId: input.actorIdentityId ?? null,
      externalRef: input.externalRef,
      itemKind: input.itemKind,
      title: input.title.slice(0, 260),
      summary: input.summary ?? null,
      body: input.body ?? null,
      authorLabel: input.authorLabel ?? null,
      routePath: input.routePath ?? input.thread?.routePath ?? def.routeBase,
      originUrl: input.originUrl ?? input.thread?.originUrl ?? null,
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [communicationItems.sourceId, communicationItems.externalRef],
      set: {
        threadId,
        targetUserId: input.targetUserId ?? null,
        actorIdentityId: input.actorIdentityId ?? null,
        itemKind: input.itemKind,
        title: input.title.slice(0, 260),
        summary: input.summary ?? null,
        body: input.body ?? null,
        authorLabel: input.authorLabel ?? null,
        routePath: input.routePath ?? input.thread?.routePath ?? def.routeBase,
        originUrl: input.originUrl ?? input.thread?.originUrl ?? null,
        metadata: input.metadata ?? {},
        occurredAt: input.occurredAt ?? now,
        updatedAt: now,
      },
    })
    .returning();

  return item;
}

export async function markCommunicationItemRead(input: {
  itemId: number;
  userId: number;
}) {
  const [row] = await db
    .insert(communicationReadStates)
    .values({
      itemId: input.itemId,
      userId: input.userId,
      readAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [communicationReadStates.itemId, communicationReadStates.userId],
      set: { readAt: new Date() },
    })
    .returning();
  return row;
}

export async function listCommunicationCards(input: {
  userId: number;
  sourceKey?: string | null;
  itemKind?: CommunicationItemKind | null;
  unreadOnly?: boolean;
  cursor?: number | null;
  limit?: number;
}): Promise<CommunicationCard[]> {
  await ensureDefaultCommunicationSources();
  const limit = Math.max(1, Math.min(input.limit ?? 80, 120));
  const filters = [
    sql`(${communicationItems.targetUserId} IS NULL OR ${communicationItems.targetUserId} = ${input.userId})`,
  ];
  if (input.cursor && Number.isInteger(input.cursor)) {
    filters.push(lt(communicationItems.id, input.cursor));
  }
  if (input.itemKind) filters.push(eq(communicationItems.itemKind, input.itemKind));
  if (input.sourceKey) filters.push(eq(communicationSources.key, input.sourceKey));

  const rows = await db
    .select({
      id: communicationItems.id,
      sourceKey: communicationSources.key,
      sourceLabel: communicationSources.label,
      sourceKind: communicationSources.sourceKind,
      itemKind: communicationItems.itemKind,
      title: communicationItems.title,
      summary: communicationItems.summary,
      body: communicationItems.body,
      authorLabel: communicationItems.authorLabel,
      routePath: communicationItems.routePath,
      originUrl: communicationItems.originUrl,
      occurredAt: communicationItems.occurredAt,
      metadata: communicationItems.metadata,
      readAt: communicationReadStates.readAt,
    })
    .from(communicationItems)
    .innerJoin(
      communicationSources,
      eq(communicationItems.sourceId, communicationSources.id)
    )
    .leftJoin(
      communicationReadStates,
      and(
        eq(communicationReadStates.itemId, communicationItems.id),
        eq(communicationReadStates.userId, input.userId)
      )
    )
    .where(and(...filters))
    .orderBy(desc(communicationItems.occurredAt), desc(communicationItems.id))
    .limit(limit);

  return rows
    .filter((row) => !input.unreadOnly || !row.readAt)
    .map((row) => ({
      id: row.id,
      sourceKey: row.sourceKey,
      sourceLabel: row.sourceLabel,
      sourceKind: row.sourceKind as CommunicationSourceKind,
      itemKind: row.itemKind as CommunicationItemKind,
      title: row.title,
      summary: row.summary,
      body: row.body,
      authorLabel: row.authorLabel,
      routePath: row.routePath,
      originUrl: row.originUrl,
      occurredAt: row.occurredAt,
      read: Boolean(row.readAt),
      metadata: row.metadata ?? {},
    }));
}

export async function publishCommunicationItemBestEffort(
  input: PublishCommunicationItemInput
): Promise<void> {
  try {
    await publishCommunicationItem(input);
  } catch (err) {
    console.warn("[comms] failed to publish item", {
      sourceKey: input.sourceKey,
      externalRef: input.externalRef,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
