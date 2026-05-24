/**
 * Social Automation — admin API routes
 *
 * All endpoints require admin role.  No tweets are posted automatically;
 * these routes expose the review / approval workflow.
 *
 * POST /api/social-automation/promoter/enable    — start/stop marketplace promoter
 * GET  /api/social-automation/promoter/status    — current promoter state + queue
 * GET  /api/social-automation/promoter/tweets    — list queued promo tweets
 * POST /api/social-automation/promoter/tweets/:idx/approve
 * POST /api/social-automation/promoter/tweets/:idx/dismiss
 * POST /api/social-automation/promoter/tweets/:idx/mark-posted
 *
 * POST /api/social-automation/weekly/generate    — generate this week's thread draft
 * GET  /api/social-automation/weekly             — list all thread drafts
 * POST /api/social-automation/weekly/:id/approve
 * POST /api/social-automation/weekly/:id/mark-posted
 *
 * GET  /api/social-automation/opt-in/:userId     — get user opt-in preference
 * PUT  /api/social-automation/opt-in/:userId     — toggle user opt-in
 */

import { Router } from "express";
import {
  getPromoterState,
  listPendingTweets,
  approveTweet,
  dismissTweet,
  markPosted as markTweetPosted,
  setPromoterEnabled,
} from "./marketplace-promoter";
import {
  generateWeeklyThread,
  listWeeklyThreadDrafts,
  approveWeeklyThread,
  markWeeklyThreadPosted,
} from "./weekly-thread";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../../auth/passport";
import { logSystemEvent } from "../../lib/system-log";

const router = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────

function requireAdmin(req: any, res: any, next: any) {
  const user = req.user ?? req.session?.user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function auditMutation(req: any, description: string) {
  logSystemEvent({
    source: "admin",
    eventType: "admin_mutation",
    severity: "info",
    message: description,
    userId: req.user?.id ?? null,
    method: req.method,
    path: req.path,
    metadata: { phaseRule: "P6.CA2/08", domain: "social-automation" },
  });
}

// ─── Marketplace Promoter ─────────────────────────────────────────────────────

router.post("/api/social-automation/promoter/enable", isAuthenticated, requireAdmin, (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  setPromoterEnabled(enabled !== false);
  auditMutation(req, `POST /api/social-automation/promoter/enable -> 200`);

  logSystemEvent({
    source: "server",
    eventType: "social.auto_promote",
    severity: "info",
    userId: (req as any).user?.id ?? null,
    method: req.method,
    path: req.path,
    metadata: { enabled: enabled !== false },
  });

  res.json({ ok: true, state: getPromoterState() });
});

router.get("/api/social-automation/promoter/status", isAuthenticated, requireAdmin, (_req, res) => {
  res.json(getPromoterState());
});

router.get("/api/social-automation/promoter/tweets", isAuthenticated, requireAdmin, (_req, res) => {
  res.json(listPendingTweets());
});

router.post("/api/social-automation/promoter/tweets/:idx/approve", isAuthenticated, requireAdmin, (req, res) => {
  const idx = parseInt(String(req.params.idx));
  const tweet = approveTweet(idx);
  if (!tweet) return res.status(404).json({ error: "Tweet not found" });
  auditMutation(req, `POST /api/social-automation/promoter/tweets/${idx}/approve -> 200`);
  res.json(tweet);
});

router.post("/api/social-automation/promoter/tweets/:idx/dismiss", isAuthenticated, requireAdmin, (req, res) => {
  const idx = parseInt(String(req.params.idx));
  const ok = dismissTweet(idx);
  auditMutation(req, `POST /api/social-automation/promoter/tweets/${idx}/dismiss -> 200`);
  res.json({ ok });
});

router.post("/api/social-automation/promoter/tweets/:idx/mark-posted", isAuthenticated, requireAdmin, (req, res) => {
  const idx = parseInt(String(req.params.idx));
  const ok = markTweetPosted(idx);
  auditMutation(req, `POST /api/social-automation/promoter/tweets/${idx}/mark-posted -> 200`);
  res.json({ ok });
});

// ─── Weekly Thread ────────────────────────────────────────────────────────────

router.post("/api/social-automation/weekly/generate", isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const draft = await generateWeeklyThread();
    auditMutation(req, `POST /api/social-automation/weekly/generate -> 200`);

    logSystemEvent({
      source: "server",
      eventType: "social.weekly_thread",
      severity: "info",
      userId: (req as any).user?.id ?? null,
      method: req.method,
      path: req.path,
      metadata: { draftId: draft?.id ?? null },
    });

    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/api/social-automation/weekly", isAuthenticated, requireAdmin, (_req, res) => {
  res.json(listWeeklyThreadDrafts());
});

router.post("/api/social-automation/weekly/:id/approve", isAuthenticated, requireAdmin, (req, res) => {
  const draftId = String(req.params.id);
  const draft = approveWeeklyThread(draftId);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  auditMutation(req, `POST /api/social-automation/weekly/${draftId}/approve -> 200`);
  res.json(draft);
});

router.post("/api/social-automation/weekly/:id/mark-posted", isAuthenticated, requireAdmin, (req, res) => {
  const threadId = String(req.params.id);
  const ok = markWeeklyThreadPosted(threadId);
  auditMutation(req, `POST /api/social-automation/weekly/${threadId}/mark-posted -> 200`);
  res.json({ ok });
});

// ─── User opt-in preferences ──────────────────────────────────────────────────

router.get("/api/social-automation/opt-in/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (!userId) return res.status(400).json({ error: "Invalid userId" });
  try {
    const rows = await db.execute(sql`
      SELECT allow_sale_promotions
      FROM user_notification_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `);
    const row = ((rows as any).rows ?? [])[0];
    res.json({
      userId,
      allowSalePromotions: row?.allow_sale_promotions ?? true,
    });
  } catch {
    res.json({ userId, allowSalePromotions: true });
  }
});

router.put("/api/social-automation/opt-in/:userId", async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  const sessionUser = (req as any).user ?? (req as any).session?.user;
  if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });

  // Users can update their own opt-in; admins can update anyone's
  if (sessionUser.id !== userId && sessionUser.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { allowSalePromotions } = req.body as { allowSalePromotions?: boolean };
  const allowed = allowSalePromotions !== false;

  try {
    await db.execute(sql`
      INSERT INTO user_notification_preferences (user_id, allow_sale_promotions, updated_at)
      VALUES (${userId}, ${allowed}, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET allow_sale_promotions = EXCLUDED.allow_sale_promotions,
            updated_at = NOW()
    `);
    res.json({ userId, allowSalePromotions: allowed });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
