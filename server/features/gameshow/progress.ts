import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "../../db";
import { challenges, challengeSubmissions, gameshowRoundPlans, rounds, seasonContestants, seasons, users, userWallets, walletEvents, walletSyncCursors } from "@shared/schema";
import type { GameshowProgressCounts, GameshowProgressSnapshot, GameshowTokenEvidence } from "@shared/gameshow";
import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import { walletEventProvenance } from "../../lib/wallet-event-provenance";
import { GameshowError } from "./policy";

function safePreview(uri: string | null) {
  if (!uri) return null;
  try { const url = new URL(normalizeIpfsUri(uri)); return url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}

/** A host-only, database-backed projection. Observations are evidence, never an invented points model. */
export function createGameshowProgress(database: typeof db) {
  return async function progress(seasonId: number): Promise<GameshowProgressSnapshot> {
    return database.transaction(async tx => {
      const [season] = await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, seasonId));
      if (!season) throw new GameshowError(404, "Season not found");
      const now = new Date();
      const roundRows = await tx.select().from(rounds).where(eq(rounds.seasonId, seasonId)).orderBy(asc(rounds.number), asc(rounds.id));
      const roundIds = roundRows.map(row => row.id);
      const taskRows = roundIds.length ? await tx.select({ id: challenges.id, roundId: challenges.roundId }).from(challenges).where(inArray(challenges.roundId, roundIds)) : [];
      const taskIds = taskRows.map(task => task.id);
      const entries = taskIds.length ? await tx.select({ id: challengeSubmissions.id, challengeId: challengeSubmissions.challengeId,
        userId: challengeSubmissions.userId, grade: challengeSubmissions.grade, submittedAt: challengeSubmissions.submittedAt,
      }).from(challengeSubmissions).where(inArray(challengeSubmissions.challengeId, taskIds)) : [];
      const plans = roundIds.length ? await tx.select().from(gameshowRoundPlans).where(inArray(gameshowRoundPlans.roundId, roundIds)) : [];
      const roster = await tx.select({ id: seasonContestants.id, userId: seasonContestants.userId, username: users.username,
        displayName: users.displayName, status: seasonContestants.status,
      }).from(seasonContestants).innerJoin(users, eq(users.id, seasonContestants.userId)).where(eq(seasonContestants.seasonId, seasonId)).orderBy(asc(users.username));
      const userIds = roster.map(person => person.userId);
      const walletRows = userIds.length ? await tx.select({ userId: userWallets.userId, address: userWallets.walletAddress,
        isPrimary: userWallets.isPrimary, linkedAt: userWallets.linkedAt, lastSyncedAt: walletSyncCursors.lastSyncedAt,
        syncStatus: walletSyncCursors.lastSyncStatus, error: walletSyncCursors.lastSyncError, backfilled: walletSyncCursors.backfilled,
      }).from(userWallets).leftJoin(walletSyncCursors, eq(walletSyncCursors.walletAddress, userWallets.walletAddress)).where(inArray(userWallets.userId, userIds)) : [];
      const watches = plans.flatMap(plan => plan.configuration.tasks.flatMap(task => {
        const round = roundRows.find(row => row.id === plan.roundId);
        if (!task.tokenMonitor || !round || !taskIds.includes(task.challengeId)) return [];
        return [{ roundId: round.id, challengeId: task.challengeId, monitor: task.tokenMonitor,
          start: round.status === "upcoming" ? null : round.startDate, end: round.status === "active" ? now : round.endDate ?? now }];
      }));
      const windows = watches.filter(watch => watch.start !== null);
      const addresses = walletRows.map(wallet => wallet.address);
      // Query only declared token watches within their actual host-open/host-close windows.
      const eventRows = addresses.length && windows.length ? await tx.select().from(walletEvents).where(and(
        inArray(walletEvents.walletAddress, addresses),
        inArray(walletEvents.eventType, ["token_mint", "token_burn", "token_transfer_in", "token_transfer_out"]),
        or(...windows.map(watch => and(eq(walletEvents.tokenContract, watch.monitor.contract),
          watch.monitor.tokenId === null ? undefined : eq(walletEvents.tokenId, watch.monitor.tokenId),
          gte(walletEvents.timestamp, watch.start!), lte(walletEvents.timestamp, watch.end)))),
      )).orderBy(desc(walletEvents.timestamp), desc(walletEvents.id)) : [];
      const tokenEvidence: GameshowTokenEvidence[] = eventRows.flatMap(event => {
        const wallet = walletRows.find(row => row.address === event.walletAddress)!;
        const matched = windows.filter(watch => watch.monitor.contract === event.tokenContract
          && (watch.monitor.tokenId === null || watch.monitor.tokenId === event.tokenId)
          && event.timestamp >= watch.start! && event.timestamp <= watch.end);
        const provenance = walletEventProvenance(event.raw);
        return [...new Set(matched.map(watch => watch.roundId))].map(roundId => ({
          id: event.id, roundId, challengeIds: matched.filter(watch => watch.roundId === roundId).map(watch => watch.challengeId),
          userId: wallet.userId, walletAddress: event.walletAddress, tokenContract: event.tokenContract!, tokenId: event.tokenId,
          type: event.eventType as GameshowTokenEvidence["type"], amount: event.tokenAmount, timestamp: event.timestamp.toISOString(),
          opHash: event.opHash, name: event.tokenName, thumbnailUri: safePreview(event.tokenThumbnail), ...provenance,
          explorerUrl: provenance.network === "mainnet" && event.opHash ? `https://tzkt.io/${encodeURIComponent(event.opHash)}` : null,
          tokenUrl: provenance.network === "mainnet" && event.tokenId !== null ? `https://objkt.com/tokens/${encodeURIComponent(event.tokenContract!)}/${encodeURIComponent(event.tokenId)}` : null,
        }));
      });
      const emptyCounts = (): GameshowProgressCounts => ({ taskCount: 0, submissionCount: 0, pendingCount: 0, passCount: 0, failCount: 0, bonusCount: 0 });
      return { seasonId, generatedAt: now.toISOString(),
        rounds: roundRows.map(round => ({ id: round.id, number: round.number, name: round.name, status: round.status,
          taskCount: taskRows.filter(task => task.roundId === round.id).length, tokenMonitoring: watches.some(watch => watch.roundId === round.id) })),
        rows: roster.map(person => {
          const ownedWallets = walletRows.filter(wallet => wallet.userId === person.userId);
          const progressRounds = roundRows.map(round => {
            const tasks = taskRows.filter(task => task.roundId === round.id).map(task => {
              const entry = entries.find(candidate => candidate.userId === person.userId && candidate.challengeId === task.id);
              return { challengeId: task.id, submissionId: entry?.id ?? null, grade: entry?.grade ?? "not_submitted" as const, submittedAt: entry?.submittedAt.toISOString() ?? null };
            });
            const configured = watches.some(watch => watch.roundId === round.id);
            const events = tokenEvidence.filter(event => event.userId === person.userId && event.roundId === round.id);
            const available = round.startDate !== null && ownedWallets.some(wallet => wallet.lastSyncedAt && wallet.lastSyncedAt >= round.startDate!);
            const coverageIncomplete = ownedWallets.some(wallet => !wallet.backfilled || wallet.syncStatus !== "ok" || !wallet.lastSyncedAt
              || (round.startDate !== null && wallet.lastSyncedAt < round.startDate)
              || (round.status !== "active" && round.endDate !== null && wallet.lastSyncedAt < round.endDate));
            const status = !configured ? "not_configured" : round.status === "upcoming" || !round.startDate ? "not_started"
              : !available ? "unavailable" : coverageIncomplete || events.some(event => event.network === "unverified") ? "incomplete" : "indexed";
            return { roundId: round.id, tasks, taskCount: tasks.length, submissionCount: tasks.filter(task => task.submissionId !== null).length,
              pendingCount: tasks.filter(task => task.grade === "pending").length, passCount: tasks.filter(task => task.grade === "pass").length,
              failCount: tasks.filter(task => task.grade === "fail").length, bonusCount: tasks.filter(task => task.grade === "bonus").length,
              tokenActivity: { status, observedCount: configured && round.status !== "upcoming" && available ? events.length : null,
                verifiedCount: configured && round.status !== "upcoming" && available ? events.filter(event => event.network === "mainnet").length : null },
            } satisfies GameshowProgressSnapshot["rows"][number]["rounds"][number];
          });
          const totals = progressRounds.reduce((sum, round) => {
            for (const key of Object.keys(sum) as Array<keyof GameshowProgressCounts>) sum[key] += round[key];
            return sum;
          }, emptyCounts());
          return { ...person, totals, rounds: progressRounds, wallets: ownedWallets.map(wallet => ({
            address: wallet.address, isPrimary: wallet.isPrimary, linkedAt: wallet.linkedAt.toISOString(), syncStatus: wallet.syncStatus,
            lastSyncedAt: wallet.lastSyncedAt?.toISOString() ?? null, backfilled: wallet.backfilled ?? false, error: wallet.error,
            identityNetwork: "mainnet" as const, eventNetwork: "per-event" as const,
          })) };
        }),
        tokenEvidence, source: { kind: "persisted-wallet-index", automaticGrading: false, refreshPath: "/api/cockpit/sync/:wallet" },
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  };
}
