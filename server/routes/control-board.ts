/**
 * Phase 11 — Control Board test-gameshow endpoints.
 *
 * These are the single surface the operator hits to spin up the full
 * 5-contestant / 3-round dummy season that exercises every Phase 8/9/10
 * code path before Season 3 cohort lock. All operations are idempotent, so
 * re-running the seed after a partial failure is safe.
 *
 * The rest of the Control Board (cohort lock, run-rule, advance-round, etc.)
 * lives in Phases 2–4 and will bolt onto this file when those land.
 */

import { Router, type Request } from "express";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  scaffoldTestGameshow,
  getTestGameshowStatus,
} from "../lib/test-gameshow-scaffold";
import {
  scaffoldSeason3,
  getSeason3Status,
} from "../lib/season3-scaffold";

const router = Router();

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim() ?? null;
  }
  const ip = req.socket.remoteAddress ?? null;
  return ip ? String(ip).slice(0, 64) : null;
}

/**
 * GET /api/control-board/test-gameshow/status
 *
 * Returns null if the dummy season has never been scaffolded; otherwise
 * returns the same shape as the seed response with zero notes.
 */
router.get(
  "/api/control-board/test-gameshow/status",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (_req, res) => {
    try {
      const state = await getTestGameshowStatus();
      res.json({ ok: true, state });
    } catch (err) {
      console.error("[control-board] test-gameshow status failed:", err);
      res
        .status(500)
        .json({ ok: false, error: (err as Error)?.message ?? "unknown" });
    }
  }
);

/**
 * POST /api/control-board/test-gameshow/seed
 *
 * Idempotent. Creates the "Test Gameshow S0" season, five tester accounts,
 * three rounds, three challenges, the WITWIB-style persistent side quest,
 * and a draft pre-test buyback window on ghostnet. Writes one
 * operator_actions row capturing the resulting ids.
 */
router.post(
  "/api/control-board/test-gameshow/seed",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const actor = (req as Request & { user?: { id?: number } }).user;
      const actorUserId = typeof actor?.id === "number" ? actor.id : null;
      const state = await scaffoldTestGameshow({
        actorUserId,
        actorIp: clientIp(req),
      });
      res.status(201).json({ ok: true, state });
    } catch (err) {
      console.error("[control-board] test-gameshow seed failed:", err);
      res
        .status(500)
        .json({ ok: false, error: (err as Error)?.message ?? "unknown" });
    }
  }
);

/**
 * GET /api/control-board/season3/status
 *
 * Returns null when Season 3 has never been scaffolded; otherwise returns
 * the canonical Season 3 state (season row, 10 rounds with elimination
 * rules, sidequest stream, Sticker Design Challenge template, calendar
 * events). Used by the Control Board Season 3 tab.
 */
router.get(
  "/api/control-board/season3/status",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (_req, res) => {
    try {
      const state = await getSeason3Status();
      res.json({ ok: true, state });
    } catch (err) {
      console.error("[control-board] season3 status failed:", err);
      res
        .status(500)
        .json({ ok: false, error: (err as Error)?.message ?? "unknown" });
    }
  }
);

/**
 * POST /api/control-board/season3/scaffold
 *
 * Idempotent. Creates (or tops up) the Season 3 shell: season row with
 * ante_wtf_required, ten upcoming rounds, one default
 * round_elimination_rules row per round, a persistent sidequest stream,
 * the Tezos Sticker Design Challenge template, and three seed calendar
 * events (kickoff, mid-season stage, finale) so the iCal + Discord
 * mirrors come online immediately.
 */
router.post(
  "/api/control-board/season3/scaffold",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const actor = (req as Request & { user?: { id?: number } }).user;
      const actorUserId = typeof actor?.id === "number" ? actor.id : null;
      const state = await scaffoldSeason3({
        actorUserId,
        actorIp: clientIp(req),
      });
      res.status(201).json({ ok: true, state });
    } catch (err) {
      console.error("[control-board] season3 scaffold failed:", err);
      res
        .status(500)
        .json({ ok: false, error: (err as Error)?.message ?? "unknown" });
    }
  }
);

export default router;
