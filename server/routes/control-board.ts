import { Router, type Request } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { db } from "../db";
import { WTF_FA2_CONTRACT, WTF_FA2_TOKEN_ID } from "../lib/constants";
import {
  scaffoldTestGameshow,
  getTestGameshowStatus,
} from "../lib/test-gameshow-scaffold";
import {
  scaffoldSeason3,
  getSeason3Status,
} from "../lib/season3-scaffold";
import {
  operatorActions,
  roundEliminationRules,
  rounds,
  seasonContestants,
  seasons,
  users,
} from "@shared/schema";
import { z } from "zod";

const router = Router();

const ruleKinds = [
  "bottom_n_by_wtf",
  "top_n_survive",
  "did_not_hold_token",
  "submission_rank",
  "team_rank",
  "manual",
] as const;

const ruleSchema = z.object({
  kind: z.enum(ruleKinds),
  paramsJson: z.record(z.string(), z.unknown()).default({}),
});

const eliminateSchema = z.object({
  confirmationUsername: z.string().trim().min(1),
  roundId: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
  overrideReason: z.string().trim().max(500).optional(),
});

type RuleKind = (typeof ruleKinds)[number];

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim() ?? null;
  }
  const ip = req.socket.remoteAddress ?? null;
  return ip ? String(ip).slice(0, 64) : null;
}

function actorUserId(req: Request): number | null {
  const actor = (req as Request & { user?: { id?: number } }).user;
  return typeof actor?.id === "number" ? actor.id : null;
}

function intParam(value: unknown): number | null {
  if (Array.isArray(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function limitParam(value: unknown, fallback = 200): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

async function logOperatorAction(
  req: Request,
  params: {
    actionKind: string;
    targetKind: string;
    targetId?: number | null;
    payloadJson?: Record<string, unknown>;
  }
) {
  await db.insert(operatorActions).values({
    actorUserId: actorUserId(req),
    actionKind: params.actionKind,
    targetKind: params.targetKind,
    targetId: params.targetId ?? null,
    payloadJson: params.payloadJson ?? {},
    ip: clientIp(req),
  });
}

async function loadContestantById(contestantId: number) {
  const rows = await db
    .select({
      id: seasonContestants.id,
      seasonId: seasonContestants.seasonId,
      userId: seasonContestants.userId,
      username: users.username,
      displayName: users.displayName,
      status: seasonContestants.status,
      rankAtLock: seasonContestants.rankAtLock,
      eliminatedAt: seasonContestants.eliminatedAt,
      eliminatedRoundId: seasonContestants.eliminatedRoundId,
      eliminationReason: seasonContestants.eliminationReason,
      notes: seasonContestants.notes,
    })
    .from(seasonContestants)
    .leftJoin(users, eq(seasonContestants.userId, users.id))
    .where(eq(seasonContestants.id, contestantId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadRound(roundId: number) {
  const rows = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  return rows[0] ?? null;
}

async function selectRuleTargets(
  round: typeof rounds.$inferSelect,
  kind: RuleKind,
  params: Record<string, unknown>
): Promise<{ targetUserIds: number[]; reason: string }> {
  const n = Math.max(0, Math.trunc(Number(params.n ?? params.count ?? 0)));
  if (kind === "manual" || kind === "team_rank") {
    return {
      targetUserIds: [],
      reason:
        kind === "team_rank"
          ? "Team-rank rules require manual target selection until team scoring is linked."
          : "Manual rule selected; no automatic targets drafted.",
    };
  }

  if (kind === "bottom_n_by_wtf" || kind === "top_n_survive") {
    const rows = await db.execute(sql`
      SELECT
        sc.user_id,
        COALESCE(SUM(NULLIF(wh.balance, '')::numeric), 0) AS wtf_balance
      FROM season_contestants sc
      LEFT JOIN wallet_holdings wh
        ON wh.user_id = sc.user_id
       AND wh.token_contract = ${WTF_FA2_CONTRACT}
       AND wh.token_id = ${WTF_FA2_TOKEN_ID}
      WHERE sc.season_id = ${round.seasonId}
        AND sc.status = 'active'
      GROUP BY sc.user_id, sc.rank_at_lock
      ORDER BY
        COALESCE(SUM(NULLIF(wh.balance, '')::numeric), 0) ${kind === "bottom_n_by_wtf" ? sql`ASC` : sql`DESC`},
        sc.rank_at_lock ASC NULLS LAST,
        sc.user_id ASC
    `);
    const ordered = ((rows as any).rows ?? []).map((r: any) => Number(r.user_id));
    const targetUserIds =
      kind === "bottom_n_by_wtf"
        ? ordered.slice(0, n)
        : ordered.slice(n);
    return {
      targetUserIds,
      reason:
        kind === "bottom_n_by_wtf"
          ? `Bottom ${n} by current WTF balance.`
          : `Top ${n} survive by current WTF balance; remaining active contestants drafted.`,
    };
  }

  if (kind === "did_not_hold_token") {
    const tokenContract = String(params.tokenContract ?? WTF_FA2_CONTRACT);
    const tokenId = String(params.tokenId ?? WTF_FA2_TOKEN_ID);
    const minBalance = String(params.minBalance ?? "1");
    const rows = await db.execute(sql`
      SELECT
        sc.user_id,
        COALESCE(SUM(NULLIF(wh.balance, '')::numeric), 0) AS token_balance
      FROM season_contestants sc
      LEFT JOIN wallet_holdings wh
        ON wh.user_id = sc.user_id
       AND wh.token_contract = ${tokenContract}
       AND wh.token_id = ${tokenId}
      WHERE sc.season_id = ${round.seasonId}
        AND sc.status = 'active'
      GROUP BY sc.user_id
      HAVING COALESCE(SUM(NULLIF(wh.balance, '')::numeric), 0) < ${minBalance}::numeric
      ORDER BY sc.user_id ASC
    `);
    return {
      targetUserIds: ((rows as any).rows ?? []).map((r: any) => Number(r.user_id)),
      reason: `Did not hold ${minBalance} of ${tokenContract}#${tokenId}.`,
    };
  }

  const rows = await db.execute(sql`
    WITH round_challenges AS (
      SELECT id FROM challenges WHERE round_id = ${round.id}
    ),
    contestant_scores AS (
      SELECT
        sc.user_id,
        MAX(
          CASE cs.grade
            WHEN 'bonus' THEN 4
            WHEN 'pass' THEN 3
            WHEN 'pending' THEN 2
            WHEN 'fail' THEN 1
            ELSE 0
          END
        ) AS grade_score,
        MIN(cs.submitted_at) AS first_submission_at
      FROM season_contestants sc
      LEFT JOIN challenge_submissions cs
        ON cs.user_id = sc.user_id
       AND cs.challenge_id IN (SELECT id FROM round_challenges)
      WHERE sc.season_id = ${round.seasonId}
        AND sc.status = 'active'
      GROUP BY sc.user_id
    )
    SELECT user_id
    FROM contestant_scores
    ORDER BY COALESCE(grade_score, 0) ASC, first_submission_at DESC NULLS FIRST, user_id ASC
    LIMIT ${n}
  `);
  return {
    targetUserIds: ((rows as any).rows ?? []).map((r: any) => Number(r.user_id)),
    reason: `Bottom ${n} by round submission grade.`,
  };
}

/**
 * GET /api/control-board/feed
 *
 * Returns the audit feed plus draft/final elimination rows used by the
 * Control Board. Optional `seasonId` scopes both lists to one season.
 */
router.get(
  "/api/control-board/feed",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const limit = limitParam(req.query.limit);
      const seasonId = req.query.seasonId
        ? intParam(String(req.query.seasonId))
        : null;

      const feedRows = await db.execute(sql`
        SELECT
          oa.id,
          oa.actor_user_id AS "actorUserId",
          actor.username AS "actorUsername",
          oa.action_kind AS "actionKind",
          oa.target_kind AS "targetKind",
          oa.target_id AS "targetId",
          oa.payload_json AS "payloadJson",
          oa.created_at AS "createdAt"
        FROM operator_actions oa
        LEFT JOIN users actor ON actor.id = oa.actor_user_id
        WHERE ${seasonId === null ? sql`TRUE` : sql`
          (
            (oa.target_kind = 'season' AND oa.target_id = ${seasonId})
            OR oa.payload_json->>'seasonId' = ${String(seasonId)}
            OR (
              oa.target_kind = 'round'
              AND oa.target_id IN (SELECT id FROM rounds WHERE season_id = ${seasonId})
            )
            OR (
              oa.target_kind = 'contestant'
              AND oa.target_id IN (
                SELECT id FROM season_contestants WHERE season_id = ${seasonId}
              )
            )
          )
        `}
        ORDER BY oa.created_at DESC, oa.id DESC
        LIMIT ${limit}
      `);

      const draftRows = await db.execute(sql`
        SELECT
          re.id,
          re.round_id AS "roundId",
          re.user_id AS "userId",
          u.username,
          re.was_drafted_by_rule AS "wasDraftedByRule",
          re.draft_rule_kind AS "draftRuleKind",
          re.reason,
          re.decided_at AS "decidedAt",
          re.decided_by AS "decidedBy"
        FROM round_eliminations re
        JOIN rounds r ON r.id = re.round_id
        LEFT JOIN users u ON u.id = re.user_id
        WHERE ${seasonId === null ? sql`TRUE` : sql`r.season_id = ${seasonId}`}
        ORDER BY re.created_at DESC, re.id DESC
        LIMIT ${limit}
      `);

      res.json({
        feed: (feedRows as any).rows ?? [],
        drafts: (draftRows as any).rows ?? [],
      });
    } catch (err) {
      console.error("[control-board] feed failed:", err);
      res.status(500).json({ error: "Failed to fetch control board feed" });
    }
  }
);

router.get(
  "/api/seasons/:id/contestants",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const seasonId = intParam(req.params.id);
      if (!seasonId) return res.status(400).json({ error: "Invalid season id" });
      const rows = await db
        .select({
          id: seasonContestants.id,
          userId: seasonContestants.userId,
          username: users.username,
          displayName: users.displayName,
          status: seasonContestants.status,
          rankAtLock: seasonContestants.rankAtLock,
          eliminatedAt: seasonContestants.eliminatedAt,
          eliminatedRoundId: seasonContestants.eliminatedRoundId,
          eliminationReason: seasonContestants.eliminationReason,
          notes: seasonContestants.notes,
        })
        .from(seasonContestants)
        .leftJoin(users, eq(seasonContestants.userId, users.id))
        .where(eq(seasonContestants.seasonId, seasonId))
        .orderBy(
          asc(seasonContestants.status),
          asc(seasonContestants.rankAtLock),
          asc(users.username)
        );
      res.json(rows);
    } catch (err) {
      console.error("[control-board] contestants failed:", err);
      res.status(500).json({ error: "Failed to fetch contestants" });
    }
  }
);

router.put(
  "/api/rounds/:id/elimination-rule",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const roundId = intParam(req.params.id);
      if (!roundId) return res.status(400).json({ error: "Invalid round id" });
      const round = await loadRound(roundId);
      if (!round) return res.status(404).json({ error: "Round not found" });
      const parsed = ruleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid elimination rule" });
      }

      const [rule] = await db
        .insert(roundEliminationRules)
        .values({
          roundId,
          kind: parsed.data.kind,
          paramsJson: parsed.data.paramsJson,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: roundEliminationRules.roundId,
          set: {
            kind: parsed.data.kind,
            paramsJson: parsed.data.paramsJson,
            updatedAt: new Date(),
          },
        })
        .returning();

      await logOperatorAction(req, {
        actionKind: "round_elimination_rule_saved",
        targetKind: "round",
        targetId: roundId,
        payloadJson: {
          seasonId: round.seasonId,
          kind: parsed.data.kind,
          paramsJson: parsed.data.paramsJson,
        },
      });

      res.json(rule);
    } catch (err) {
      console.error("[control-board] save elimination rule failed:", err);
      res.status(500).json({ error: "Failed to save elimination rule" });
    }
  }
);

router.post(
  "/api/rounds/:id/run-rule",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const roundId = intParam(req.params.id);
      if (!roundId) return res.status(400).json({ error: "Invalid round id" });
      const round = await loadRound(roundId);
      if (!round) return res.status(404).json({ error: "Round not found" });

      const [rule] = await db
        .select()
        .from(roundEliminationRules)
        .where(eq(roundEliminationRules.roundId, roundId))
        .limit(1);
      if (!rule) {
        return res.status(400).json({ error: "No elimination rule saved for round" });
      }

      const params =
        typeof rule.paramsJson === "object" && rule.paramsJson
          ? (rule.paramsJson as Record<string, unknown>)
          : {};
      const selected = await selectRuleTargets(round, rule.kind, params);
      const targetUserIds = Array.from(new Set(selected.targetUserIds)).filter(
        Number.isInteger
      );
      const targetUserSql = sql.join(
        targetUserIds.map((id) => sql`${id}`),
        sql`, `
      );

      if (targetUserIds.length > 0) {
        await db.execute(sql`
          DELETE FROM round_eliminations
          WHERE round_id = ${roundId}
            AND decided_at IS NULL
            AND was_drafted_by_rule = TRUE
            AND user_id NOT IN (${targetUserSql})
        `);
        await db.execute(sql`
          INSERT INTO round_eliminations (
            round_id,
            user_id,
            reason,
            was_drafted_by_rule,
            draft_rule_kind,
            updated_at
          )
          SELECT
            ${roundId},
            target_user_id,
            ${selected.reason},
            TRUE,
            ${rule.kind}::round_elimination_rule_kind,
            NOW()
          FROM unnest(ARRAY[${targetUserSql}]::int[]) AS target_user_id
          ON CONFLICT (round_id, user_id) DO UPDATE SET
            reason = EXCLUDED.reason,
            was_drafted_by_rule = TRUE,
            draft_rule_kind = EXCLUDED.draft_rule_kind,
            updated_at = NOW()
          WHERE round_eliminations.decided_at IS NULL
        `);
      } else {
        await db.execute(sql`
          DELETE FROM round_eliminations
          WHERE round_id = ${roundId}
            AND decided_at IS NULL
            AND was_drafted_by_rule = TRUE
        `);
      }

      await logOperatorAction(req, {
        actionKind: "round_rule_ran",
        targetKind: "round",
        targetId: roundId,
        payloadJson: {
          seasonId: round.seasonId,
          ruleKind: rule.kind,
          paramsJson: params,
          targetUserIds,
          reason: selected.reason,
        },
      });

      res.json({ drafted: targetUserIds.length, targetUserIds });
    } catch (err) {
      console.error("[control-board] run rule failed:", err);
      res.status(500).json({ error: "Failed to run elimination rule" });
    }
  }
);

router.post(
  "/api/contestants/:id/eliminate",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const contestantId = intParam(req.params.id);
      if (!contestantId) {
        return res.status(400).json({ error: "Invalid contestant id" });
      }
      const parsed = eliminateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid elimination payload" });
      }
      const contestant = await loadContestantById(contestantId);
      if (!contestant) {
        return res.status(404).json({ error: "Contestant not found" });
      }
      if (
        parsed.data.confirmationUsername.toLowerCase() !==
        String(contestant.username ?? "").toLowerCase()
      ) {
        return res.status(400).json({ error: "Confirmation username does not match" });
      }

      let eliminationId: number | null = null;
      if (parsed.data.roundId) {
        const round = await loadRound(parsed.data.roundId);
        if (!round || round.seasonId !== contestant.seasonId) {
          return res.status(400).json({ error: "Round does not belong to contestant season" });
        }
        const row = await db.execute(sql`
          INSERT INTO round_eliminations (
            round_id,
            user_id,
            decided_by,
            decided_at,
            reason,
            override_reason,
            updated_at
          )
          VALUES (
            ${parsed.data.roundId},
            ${contestant.userId},
            ${actorUserId(req)},
            NOW(),
            ${parsed.data.reason ?? null},
            ${parsed.data.overrideReason ?? null},
            NOW()
          )
          ON CONFLICT (round_id, user_id) DO UPDATE SET
            decided_by = EXCLUDED.decided_by,
            decided_at = EXCLUDED.decided_at,
            reason = COALESCE(EXCLUDED.reason, round_eliminations.reason),
            override_reason = COALESCE(EXCLUDED.override_reason, round_eliminations.override_reason),
            updated_at = NOW()
          RETURNING id
        `);
        eliminationId = Number(((row as any).rows ?? [])[0]?.id ?? null) || null;
      }

      await db
        .update(seasonContestants)
        .set({
          status: "eliminated",
          eliminatedAt: new Date(),
          eliminatedRoundId: parsed.data.roundId ?? null,
          eliminationReason: parsed.data.reason ?? "Operator confirmed elimination",
          updatedAt: new Date(),
        })
        .where(eq(seasonContestants.id, contestantId));

      await logOperatorAction(req, {
        actionKind: "contestant_eliminated",
        targetKind: "contestant",
        targetId: contestantId,
        payloadJson: {
          seasonId: contestant.seasonId,
          roundId: parsed.data.roundId ?? null,
          userId: contestant.userId,
          username: contestant.username,
          reason: parsed.data.reason ?? null,
          overrideReason: parsed.data.overrideReason ?? null,
        },
      });

      res.json({ ok: true, contestantId, eliminationId });
    } catch (err) {
      console.error("[control-board] eliminate contestant failed:", err);
      res.status(500).json({ error: "Failed to eliminate contestant" });
    }
  }
);

router.post(
  "/api/contestants/:id/promote-from-reserve",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const contestantId = intParam(req.params.id);
      if (!contestantId) {
        return res.status(400).json({ error: "Invalid contestant id" });
      }
      const contestant = await loadContestantById(contestantId);
      if (!contestant) {
        return res.status(404).json({ error: "Contestant not found" });
      }

      const [updated] = await db
        .update(seasonContestants)
        .set({
          status: "active",
          eliminatedAt: null,
          eliminatedRoundId: null,
          eliminationReason: null,
          updatedAt: new Date(),
        })
        .where(eq(seasonContestants.id, contestantId))
        .returning();

      await logOperatorAction(req, {
        actionKind: "contestant_promoted_from_reserve",
        targetKind: "contestant",
        targetId: contestantId,
        payloadJson: {
          seasonId: contestant.seasonId,
          userId: contestant.userId,
          username: contestant.username,
        },
      });

      res.json({ ...updated, username: contestant.username, displayName: contestant.displayName });
    } catch (err) {
      console.error("[control-board] promote contestant failed:", err);
      res.status(500).json({ error: "Failed to promote contestant" });
    }
  }
);

router.post(
  "/api/rounds/:id/advance",
  isAuthenticated,
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const roundId = intParam(req.params.id);
      if (!roundId) return res.status(400).json({ error: "Invalid round id" });
      const round = await loadRound(roundId);
      if (!round) return res.status(404).json({ error: "Round not found" });

      const pending = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM round_eliminations
        WHERE round_id = ${roundId}
          AND decided_at IS NULL
      `);
      const pendingCount = Number(((pending as any).rows ?? [])[0]?.count ?? 0);
      if (pendingCount > 0) {
        return res.status(409).json({
          error: "Resolve draft eliminations before advancing the round",
        });
      }

      const [updated] = await db
        .update(rounds)
        .set({ status: "completed" })
        .where(eq(rounds.id, roundId))
        .returning();

      const [nextRound] = await db
        .select()
        .from(rounds)
        .where(
          and(
            eq(rounds.seasonId, round.seasonId),
            sql`${rounds.number} > ${round.number}`
          )
        )
        .orderBy(asc(rounds.number))
        .limit(1);

      if (nextRound) {
        await db
          .update(rounds)
          .set({ status: "active" })
          .where(eq(rounds.id, nextRound.id));
      } else {
        await db
          .update(seasons)
          .set({ status: "completed" })
          .where(eq(seasons.id, round.seasonId));
      }

      await logOperatorAction(req, {
        actionKind: "round_advanced",
        targetKind: "round",
        targetId: roundId,
        payloadJson: {
          seasonId: round.seasonId,
          nextRoundId: nextRound?.id ?? null,
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("[control-board] advance round failed:", err);
      res.status(500).json({ error: "Failed to advance round" });
    }
  }
);

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
