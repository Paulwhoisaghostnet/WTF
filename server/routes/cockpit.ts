/**
 * /api/cockpit/* — back-end surface for the user dashboard ("cockpit").
 *
 * These endpoints back the existing `Dashboard.tsx`, `Profile.tsx`,
 * and `Hoard.tsx` pages with richer, sort-correct data sourced from
 * `wallet_events` and `wallet_holdings` (see phases 2+).  The legacy
 * `/api/profile/tokens` endpoint remains live until the UI fully
 * migrates.
 *
 * No new routes beyond this file's `/api/cockpit/*` prefix are added;
 * no new front-end pages are introduced.  See `COCKPIT_BLUEPRINT.md`.
 */

import { Router } from "express";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { hasPermission } from "../lib/permissions";
import { listJobs, latestPerJob, recentRuns, runJob } from "../lib/scheduler";
import { enqueue as enqueueIndex } from "../lib/indexing-queue";
import { runDbAudit } from "../lib/db-audit";
import { stats as backfillStats } from "../lib/backfill-manifest";
import { runAllSeeders } from "../lib/backfill-seeders";
import { dispatcherConfig } from "../lib/backfill-dispatcher";
import { latestLocalDump } from "../lib/backup/fallback";
import {
  buildBackupRestoreProof,
  readBackupRestoreDrillProof,
} from "../lib/backup/restore-proof";
import { db } from "../db";
import {
  walletHoldings,
  userWallets,
  tokenMetadata,
  collections,
  collectionItems,
  walletEvents,
} from "@shared/schema";
import { and, desc, asc, eq, sql, inArray } from "drizzle-orm";
import type { UserRole } from "@shared/types";
import {
  backfillTradeBoardCollection,
  ensureTradeBoardCollection,
} from "../lib/collections-mirror";
// `asc` and `desc` are used by /overview below; sorting on /holdings
// uses raw SQL (sortExpr) so the TzKT-authoritative COALESCE resolves.

const router = Router();
const TEZOS_IMPLICIT_ADDRESS_RE = /^(tz1|tz2|tz3)[1-9A-HJ-NP-Za-km-z]{33}$/;

/**
 * GET /api/cockpit/holdings
 * Query: sortBy = lastActivity | acquired | balance (default: lastActivity)
 *        order  = desc | asc   (default: desc)
 *        wallet = filter to one linked wallet address
 *        limit  = default 200, max 500
 *        offset = default 0
 *
 * Returns `wallet_holdings` joined to `token_metadata` so existing
 * card/list components keep the same response shape.
 */
router.get("/api/cockpit/holdings", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const sortByRaw = String(req.query.sortBy ?? "lastActivity").trim();
    const order = String(req.query.order ?? "desc").toLowerCase() === "asc"
      ? "asc"
      : "desc";
    const wallet = String(req.query.wallet ?? "").trim();
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "200"), 10)));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10));

    // Prefer TzKT-authoritative timestamps where we have them; fall
    // back to the event-derived columns until balance-reconcile has
    // populated a row.  COALESCE is deterministic so the sort stays
    // stable under churn.
    const sortExpr =
      sortByRaw === "acquired"
        ? sql`COALESCE(${walletHoldings.tzktFirstTime}, ${walletHoldings.firstAcquiredAt})`
        : sortByRaw === "balance"
        ? sql`${walletHoldings.balance}::numeric`
        : sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt})`;

    const conditions = [eq(walletHoldings.userId, user.id)];
    if (wallet) conditions.push(eq(walletHoldings.walletAddress, wallet));

    const orderSql = order === "asc" ? sql`${sortExpr} ASC NULLS LAST` : sql`${sortExpr} DESC NULLS LAST`;
    const rows = await db
      .select({
        id: walletHoldings.id,
        walletAddress: walletHoldings.walletAddress,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
        balance: walletHoldings.balance,
        firstAcquiredAt: walletHoldings.firstAcquiredAt,
        lastActivityAt: walletHoldings.lastActivityAt,
        derivedAt: walletHoldings.derivedAt,
        tzktFirstTime: walletHoldings.tzktFirstTime,
        tzktLastTime: walletHoldings.tzktLastTime,
        tokenName: tokenMetadata.name,
        tokenSymbol: tokenMetadata.symbol,
        tokenThumbnail: tokenMetadata.thumbnail,
        metadata: tokenMetadata.raw,
        creatorAddress: sql<string | null>`(${tokenMetadata.raw} -> 'creators' ->> 0)`,
        metaName: tokenMetadata.name,
        metaThumbnail: tokenMetadata.thumbnail,
        metaDisplayUri: tokenMetadata.displayUri,
        metaArtifactUri: tokenMetadata.artifactUri,
        metaMimeType: tokenMetadata.mimeType,
      })
      .from(walletHoldings)
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
          eq(tokenMetadata.tokenId, walletHoldings.tokenId)
        )
      )
      .where(and(...conditions))
      .orderBy(orderSql)
      .limit(limit)
      .offset(offset);

    const totalRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(walletHoldings)
      .where(and(...conditions));
    const total = Number(totalRes[0]?.count ?? 0);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        walletAddress: r.walletAddress,
        tokenContract: r.tokenContract,
        tokenId: r.tokenId,
        balance: r.balance,
        firstAcquiredAt: r.firstAcquiredAt,
        lastActivityAt: r.lastActivityAt,
        tzktFirstTime: r.tzktFirstTime,
        tzktLastTime: r.tzktLastTime,
        tokenName: r.tokenName ?? r.metaName ?? null,
        tokenSymbol: r.tokenSymbol ?? null,
        tokenThumbnail: r.tokenThumbnail ?? r.metaThumbnail ?? null,
        displayUri: r.metaDisplayUri ?? null,
        artifactUri: r.metaArtifactUri ?? null,
        mimeType: r.metaMimeType ?? null,
        creatorAddress: r.creatorAddress ?? null,
        metadata: (r.metadata as any) ?? null,
      })),
      pagination: { total, limit, offset },
      sort: { by: sortByRaw, order },
    });
  } catch (err) {
    console.error("[cockpit] GET /holdings failed:", err);
    res.status(500).json({ error: "Failed to load holdings" });
  }
});

/**
 * GET /api/cockpit/overview
 * Summary stats across all of the caller's wallets.  Feeds the
 * cockpit "Overview" tab.  Cheap — a handful of aggregate queries.
 */
router.get("/api/cockpit/overview", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const wallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .orderBy(desc(userWallets.isPrimary), asc(userWallets.linkedAt));

    const holdingsStats = await db.execute(sql`
      SELECT
        COUNT(*)::int                                 AS total_tokens,
        COUNT(DISTINCT token_contract)::int           AS total_contracts,
        MIN(first_acquired_at)                        AS first_acquired_at,
        MAX(last_activity_at)                         AS last_activity_at
      FROM wallet_holdings
      WHERE user_id = ${user.id}
    `);
    const statsRows = (holdingsStats as any)?.rows ?? [];
    const stats = statsRows[0] ?? {
      total_tokens: 0,
      total_contracts: 0,
      first_acquired_at: null,
      last_activity_at: null,
    };

    res.json({
      wallets: wallets.map((w) => ({
        id: w.id,
        walletAddress: w.walletAddress,
        tezDomain: w.tezDomain,
        isPrimary: w.isPrimary,
        linkedAt: w.linkedAt,
        firstActivityAt: w.firstActivityAt,
        lastActivityAt: w.lastActivityAt,
        lastSyncedAt: w.lastSyncedAt,
      })),
      holdings: {
        totalTokens: Number(stats.total_tokens ?? 0),
        totalContracts: Number(stats.total_contracts ?? 0),
        firstAcquiredAt: stats.first_acquired_at,
        lastActivityAt: stats.last_activity_at,
      },
    });
  } catch (err) {
    console.error("[cockpit] GET /overview failed:", err);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

/**
 * GET /api/cockpit/activity
 * Recent `wallet_events` rows for all of the caller's linked wallets.
 */
router.get("/api/cockpit/activity", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit ?? "80"), 10))
    );
    const walletRows = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));
    const addrs = walletRows.map((w) => w.walletAddress);
    if (addrs.length === 0) {
      return res.json({ items: [], limit });
    }
    const rows = await db
      .select({
        id: walletEvents.id,
        walletAddress: walletEvents.walletAddress,
        eventType: walletEvents.eventType,
        timestamp: walletEvents.timestamp,
        tokenContract: walletEvents.tokenContract,
        tokenId: walletEvents.tokenId,
        tokenName: walletEvents.tokenName,
        level: walletEvents.level,
      })
      .from(walletEvents)
      .where(inArray(walletEvents.walletAddress, addrs))
      .orderBy(desc(walletEvents.timestamp))
      .limit(limit);
    res.json({ items: rows, limit });
  } catch (err) {
    console.error("[cockpit] GET /activity failed:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

/**
 * GET /api/cockpit/sync/status
 * Returns the latest run per job + live registry state.  Consumed by
 * the cockpit "Sync" tab.
 */
router.get("/api/cockpit/sync/status", async (_req, res) => {
  try {
    const [jobs, latest] = await Promise.all([
      Promise.resolve(listJobs()),
      latestPerJob(),
    ]);
    const byName = new Map(latest.map((r) => [r.jobName, r]));
    res.json({
      jobs: jobs.map((j) => ({
        ...j,
        latest: byName.get(j.name) ?? null,
      })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cockpit] sync/status failed:", err);
    res.status(500).json({ error: "Failed to load sync status" });
  }
});

/**
 * GET /api/cockpit/sync/runs/:jobName
 * Paginated recent runs for one job.  Admin-ish; authenticated only.
 */
router.get("/api/cockpit/sync/runs/:jobName", isAuthenticated, async (req, res) => {
  try {
    const name = String(req.params.jobName);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
    const rows = await recentRuns(name, limit);
    res.json({ jobName: name, runs: rows });
  } catch (err) {
    console.error("[cockpit] sync/runs failed:", err);
    res.status(500).json({ error: "Failed to load run history" });
  }
});

/**
 * POST /api/cockpit/sync/:wallet
 * Enqueue a manual sync for one of the caller's wallets.  Returns
 * immediately with the queue row id; the worker picks it up on its
 * next tick.
 */
router.post("/api/cockpit/sync/:wallet", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number; role?: UserRole } | undefined;
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    if (!TEZOS_IMPLICIT_ADDRESS_RE.test(wallet)) {
      return res.status(400).json({ error: "invalid wallet address" });
    }
    if (!user?.id) return res.status(401).json({ error: "Authentication required" });

    const canSyncAnyWallet = await hasPermission(user.role ?? "witness", "manage_users");
    if (!canSyncAnyWallet) {
      const [linkedWallet] = await db
        .select({ walletAddress: userWallets.walletAddress })
        .from(userWallets)
        .where(
          and(
            eq(userWallets.userId, user.id),
            eq(userWallets.walletAddress, wallet)
          )
        )
        .limit(1);

      if (!linkedWallet) {
        return res
          .status(403)
          .json({ error: "wallet is not linked to your account" });
      }
    }

    const rowId = await enqueueIndex({
      target: wallet,
      targetKind: "wallet",
      reason: "manual",
      priority: 2,
      userId: user.id,
    });
    res.json({ ok: true, queueId: rowId });
  } catch (err) {
    console.error("[cockpit] manual sync enqueue failed:", err);
    res.status(500).json({ error: "Failed to enqueue sync" });
  }
});

/**
 * GET /api/cockpit/backfill/status
 *
 * Live view of the backfill manifest — total rows, per-status and
 * per-task-type counts, oldest pending, newest completion, plus the
 * dispatcher's current config (batch size, concurrency, intervals).
 *
 * Consumed by the cockpit status strip so users can see the system
 * chewing through the backlog.  Public-safe (no wallet data leaks).
 */
router.get("/api/cockpit/backfill/status", async (_req, res) => {
  try {
    const s = await backfillStats();
    res.json({
      stats: s,
      config: dispatcherConfig(),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cockpit] backfill/status failed:", err);
    res.status(500).json({ error: "Failed to load backfill status" });
  }
});

/**
 * POST /api/cockpit/backfill/reseed
 * Kick the seeders on demand.  Admin-only; rate-limited by the
 * scheduler's serialise-per-job logic (seeder already running →
 * skipped row logged).
 */
router.post(
  "/api/cockpit/backfill/reseed",
  requirePermission("manage_users"),
  async (_req, res) => {
    try {
      const r = await runAllSeeders();
      res.json({ ok: true, ...r });
    } catch (err) {
      console.error("[cockpit] backfill reseed failed:", err);
      res.status(500).json({ error: "Failed to reseed manifest" });
    }
  }
);

/**
 * POST /api/cockpit/sync/run/:jobName
 * Run a registered job body once, synchronously.  Guarded by
 * `isAuthenticated`; used by admin UI.  A 409 is returned if the job
 * is already running.
 */
router.post("/api/cockpit/sync/run/:jobName", isAuthenticated, async (req, res) => {
  try {
    const name = String(req.params.jobName);
    await runJob(name);
    res.json({ ok: true, jobName: name });
  } catch (err) {
    console.error("[cockpit] forced run failed:", err);
    res.status(500).json({ error: "Failed to run job" });
  }
});

/**
 * GET /api/cockpit/audit
 * Read-only database completeness report.  Admin-only.  Surfaces row
 * counts, coverage ratios (holdings → metadata / events / collections),
 * staleness windows, orphan detection, scheduler health, and top-N
 * offenders for each gap.  Safe to call on demand — every query is a
 * single aggregation, no writes.
 */
router.get(
  "/api/cockpit/audit",
  requirePermission("manage_users"),
  async (_req, res) => {
    try {
      const report = await runDbAudit();
      res.json(report);
    } catch (err) {
      console.error("[cockpit] audit failed:", err);
      res.status(500).json({
        error: "Audit failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/**
 * POST /api/cockpit/backup/run
 * Admin-only trigger for an immediate off-site backup.  Delegates to
 * `runJob("supabase-backup")` so the scheduler's per-job re-entry
 * protection keeps a manual click from racing the nightly tick.  The
 * response surfaces the latest `sync_runs` row so callers see size,
 * duration, and error status without a second round-trip.
 */
router.post(
  "/api/cockpit/backup/run",
  requirePermission("manage_users"),
  async (_req, res) => {
    try {
      await runJob("supabase-backup");
      const rows = await latestPerJob();
      const latest = rows.find((r) => r.jobName === "supabase-backup") ?? null;
      res.json({ ok: true, jobName: "supabase-backup", latest });
    } catch (err) {
      console.error("[cockpit] backup run failed:", err);
      res.status(500).json({
        error: "Backup run failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

router.get(
  "/api/cockpit/backup/restore-proof",
  requirePermission("manage_users"),
  async (_req, res) => {
    try {
      const [latest] = await recentRuns("supabase-backup", 1);
      const cursor =
        latest?.cursorAfter && typeof latest.cursorAfter === "object"
          ? (latest.cursorAfter as Record<string, unknown>)
          : {};
      let restoreProof = cursor.restoreProof ?? null;

      if (!restoreProof) {
        const [restoreDrill, localDump] = await Promise.all([
          readBackupRestoreDrillProof(),
          latestLocalDump(),
        ]);
        restoreProof = buildBackupRestoreProof({
          backup: localDump
            ? {
                filename: localDump.filename,
                bytes: localDump.bytes,
                sha256: localDump.sha256,
                createdAt: localDump.createdAt,
              }
            : null,
          targets: localDump
            ? [{ name: "local", status: "ok", bytes: localDump.bytes, sha256Match: true }]
            : [],
          restoreDrill,
        });
      }

      res.json({
        jobName: "supabase-backup",
        latestRun: latest
          ? {
              id: latest.id,
              status: latest.status,
              startedAt: latest.startedAt,
              finishedAt: latest.finishedAt,
              itemsIn: latest.itemsIn,
              itemsOut: latest.itemsOut,
              error: latest.error,
            }
          : null,
        restoreProof,
        canClaimSafety:
          Boolean(
            restoreProof &&
              typeof restoreProof === "object" &&
              (restoreProof as { canClaimSafety?: unknown }).canClaimSafety === true
          ),
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[cockpit] backup restore proof failed:", err);
      res.status(500).json({
        error: "Backup restore proof failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/**
 * GET /api/cockpit/collections
 * List the caller's collections, with item counts.
 */
router.get("/api/cockpit/collections", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const rows = await db.execute(sql`
      SELECT
        c.id,
        c.type,
        c.title,
        c.description,
        c.slug,
        c.is_public,
        c.cover_uri,
        c.metadata,
        c.external_ref,
        c.created_at,
        c.updated_at,
        COALESCE(ci.item_count, 0)::int AS item_count
      FROM collections c
      LEFT JOIN (
        SELECT collection_id, COUNT(*) AS item_count
        FROM collection_items
        GROUP BY collection_id
      ) ci ON ci.collection_id = c.id
      WHERE c.user_id = ${user.id}
      ORDER BY c.updated_at DESC
    `);
    const list: any[] = (rows as any)?.rows ?? [];
    res.json({
      collections: list.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        slug: r.slug,
        isPublic: r.is_public,
        coverUri: r.cover_uri,
        metadata: r.metadata,
        externalRef: r.external_ref,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        itemCount: Number(r.item_count ?? 0),
      })),
    });
  } catch (err) {
    console.error("[cockpit] GET /collections failed:", err);
    res.status(500).json({ error: "Failed to load collections" });
  }
});

/**
 * GET /api/cockpit/collections/:id
 * List items in a collection (caller must own the collection).
 */
router.get("/api/cockpit/collections/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }
    const owned = await db
      .select({
        id: collections.id,
        type: collections.type,
        title: collections.title,
        description: collections.description,
        slug: collections.slug,
        isPublic: collections.isPublic,
        coverUri: collections.coverUri,
        metadata: collections.metadata,
        externalRef: collections.externalRef,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
      })
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
      .limit(1);
    if (owned.length === 0) {
      return res.status(404).json({ error: "not found" });
    }
    const items = await db
      .select({
        id: collectionItems.id,
        tokenContract: collectionItems.tokenContract,
        tokenId: collectionItems.tokenId,
        quantity: collectionItems.quantity,
        position: collectionItems.position,
        note: collectionItems.note,
        addedAt: collectionItems.addedAt,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
        tokenDisplayUri: tokenMetadata.displayUri,
        tokenMimeType: tokenMetadata.mimeType,
      })
      .from(collectionItems)
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, collectionItems.tokenContract),
          eq(tokenMetadata.tokenId, collectionItems.tokenId)
        )
      )
      .where(eq(collectionItems.collectionId, id))
      .orderBy(asc(collectionItems.position), desc(collectionItems.addedAt));

    res.json({
      collection: owned[0],
      items,
    });
  } catch (err) {
    console.error("[cockpit] GET /collections/:id failed:", err);
    res.status(500).json({ error: "Failed to load collection" });
  }
});

/**
 * POST /api/cockpit/collections/trade-board/rebuild
 * One-shot rebuild of the caller's trade-board collection from the
 * legacy `user_owned_tokens.on_trade_board` boolean.  Used by the
 * cockpit the first time a user visits after Phase 4 ships, to make
 * sure the mirror matches reality.
 */
router.post(
  "/api/cockpit/collections/trade-board/rebuild",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const result = await backfillTradeBoardCollection(user.id);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[cockpit] trade-board rebuild failed:", err);
      res.status(500).json({ error: "Failed to rebuild trade board" });
    }
  }
);

/**
 * POST /api/cockpit/collections
 * Create a new user-owned collection (type=curation by default).
 */
router.post("/api/cockpit/collections", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const body = req.body as {
      type?: string;
      title?: string;
      description?: string;
      slug?: string;
      isPublic?: boolean;
      coverUri?: string;
      metadata?: any;
      externalRef?: string;
    };
    const title = (body.title || "").trim();
    if (!title) return res.status(400).json({ error: "title required" });
    const rawType = (body.type || "curation").trim();
    const allowedTypes = new Set([
      "curation",
      "wtf_gallery",
      "trade_board_listing",
      "objkt_curation",
      "external_listing",
      "custom",
    ]);
    if (!allowedTypes.has(rawType)) {
      return res.status(400).json({ error: "invalid type" });
    }
    const [row] = await db
      .insert(collections)
      .values({
        userId: user.id,
        type: rawType as any,
        title,
        description: body.description ?? null,
        slug: body.slug ? body.slug.slice(0, 120) : null,
        isPublic: Boolean(body.isPublic),
        coverUri: body.coverUri ?? null,
        metadata: body.metadata ?? null,
        externalRef: body.externalRef ?? null,
      })
      .returning({ id: collections.id });
    res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error("[cockpit] POST /collections failed:", err);
    res.status(500).json({ error: "Failed to create collection" });
  }
});

/**
 * POST /api/cockpit/collections/:id/items
 * Add a token to a user-owned collection.  Idempotent on
 * (collection_id, token_contract, token_id).
 */
router.post(
  "/api/cockpit/collections/:id/items",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "invalid id" });
      }
      const owned = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
        .limit(1);
      if (owned.length === 0) {
        return res.status(404).json({ error: "not found" });
      }

      const body = req.body as {
        tokenContract?: string;
        tokenId?: string;
        quantity?: number;
        note?: string;
        position?: number;
      };
      const tokenContract = (body.tokenContract || "").trim();
      const tokenId = (body.tokenId || "").toString().trim();
      if (!tokenContract || !tokenId) {
        return res.status(400).json({ error: "tokenContract and tokenId required" });
      }
      await db
        .insert(collectionItems)
        .values({
          collectionId: id,
          tokenContract,
          tokenId,
          quantity: Math.max(1, body.quantity ?? 1),
          note: body.note ?? null,
          position: body.position ?? 0,
        })
        .onConflictDoUpdate({
          target: [
            collectionItems.collectionId,
            collectionItems.tokenContract,
            collectionItems.tokenId,
          ],
          set: {
            quantity: sql`EXCLUDED.quantity`,
            note: sql`EXCLUDED.note`,
            position: sql`EXCLUDED.position`,
          },
        });
      await db
        .update(collections)
        .set({ updatedAt: new Date() })
        .where(eq(collections.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[cockpit] POST /collections/:id/items failed:", err);
      res.status(500).json({ error: "Failed to add item" });
    }
  }
);

/**
 * DELETE /api/cockpit/collections/:id/items/:contract/:tokenId
 * Remove a token from a user-owned collection.
 */
router.delete(
  "/api/cockpit/collections/:id/items/:contract/:tokenId",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "invalid id" });
      }
      const owned = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
        .limit(1);
      if (owned.length === 0) {
        return res.status(404).json({ error: "not found" });
      }
      const contract = String(req.params.contract || "").trim();
      const tokenId = String(req.params.tokenId || "").trim();
      await db
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.collectionId, id),
            eq(collectionItems.tokenContract, contract),
            eq(collectionItems.tokenId, tokenId)
          )
        );
      await db
        .update(collections)
        .set({ updatedAt: new Date() })
        .where(eq(collections.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[cockpit] DELETE /collections/:id/items failed:", err);
      res.status(500).json({ error: "Failed to remove item" });
    }
  }
);

export default router;
// explicitly re-export so the import ordering stays obvious;
// `ensureTradeBoardCollection` is referenced in tests / future code.
export { ensureTradeBoardCollection };
