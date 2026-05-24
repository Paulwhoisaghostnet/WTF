import { and, eq, isNull } from "drizzle-orm";
import { atprotoAccounts } from "@shared/schema";
import { db } from "../../db";
import { register, type JobResult } from "../../lib/scheduler";
import { getAtprotoAgentForDid } from "./oauth";
import { emitAtprotoSystemEvent, skywireEventId } from "./events";

export const SKYWIRE_SYNC_JOB_NAME = "skywire-atproto-sync";
const SKYWIRE_SYNC_INTERVAL_MS = 10 * 60 * 1000;

export async function runSkywireAtprotoSync(): Promise<JobResult> {
  if (process.env.ATPROTO_ENABLED !== "true") {
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { enabled: false } };
  }

  const accounts = await db
    .select()
    .from(atprotoAccounts)
    .where(isNull(atprotoAccounts.disconnectedAt));
  let updated = 0;
  let notifications = 0;

  for (const account of accounts) {
    try {
      const agent = await getAtprotoAgentForDid(account.did);
      const profile = await agent.getProfile({ actor: account.did });
      await db
        .update(atprotoAccounts)
        .set({
          handle: profile.data.handle ?? account.handle,
          displayName: profile.data.displayName ?? null,
          avatarUrl: profile.data.avatar ?? null,
          description: profile.data.description ?? null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(atprotoAccounts.id, account.id), isNull(atprotoAccounts.disconnectedAt)));
      updated += 1;

      const list = await agent.listNotifications({ limit: 20 });
      for (const item of list.data.notifications ?? []) {
        if (!item.uri || !item.cid) continue;
        await emitAtprotoSystemEvent({
          eventId: skywireEventId("atproto.notification.received", `${item.reason}:${item.uri}:${item.cid}`),
          eventType: "atproto.notification.received",
          userId: account.userId,
          did: item.author?.did ?? account.did,
          handle: item.author?.handle ?? null,
          uri: item.uri,
          cid: item.cid,
          rawRefType: "atproto_notification",
          rawRefId: item.uri,
          raw: item as unknown as Record<string, unknown>,
          metadata: { reason: item.reason, accountDid: account.did },
        });
        notifications += 1;
      }
    } catch (err) {
      console.warn(`[skywire] sync failed for ${account.did}:`, err);
    }
  }

  return {
    itemsIn: accounts.length,
    itemsOut: updated + notifications,
    cursorAfter: { updated, notifications },
  };
}

export function registerSkywireAtprotoSync(): void {
  register({
    name: SKYWIRE_SYNC_JOB_NAME,
    fn: runSkywireAtprotoSync,
    intervalMs: SKYWIRE_SYNC_INTERVAL_MS,
    initialDelayMs: 3 * 60 * 1000,
    skipInitialRun: true,
    scope: "atproto",
  });
}
