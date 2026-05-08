import { Router } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import {
  challengeAutomationActionLogs,
  challengeAutomationAuditLogs,
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
  challengeAutomationProgress,
  challengeSystemEvents,
  users,
} from "@shared/schema";
import { rewardActionRegistry } from "../registries/actions";
import { triggerRegistry } from "../registries/triggers";
import { renderChallengeRuleSummary } from "../services/rule-summary";
import { ensureExampleAutomationChallenges } from "../services/example-challenges";

const router = Router();

const STATUSES = new Set(["draft", "active", "paused", "completed", "archived"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item))
      )
    : [];
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  return date;
}

function parseInteger(value: unknown, fallback: number | null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function challengePayload(body: unknown, createdBy?: number | null) {
  const record = asRecord(body);
  const title = String(record.title || "").trim();
  if (!title) throw new Error("Challenge title is required");

  const status = String(record.status || "draft");
  if (!STATUSES.has(status)) throw new Error("Invalid challenge status");

  const conditionTree = asRecord(record.conditionTree);
  const rewardActions = asArray(record.rewardActions);
  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim()
      : renderChallengeRuleSummary({ conditionTree, rewardActions: rewardActions as any });

  return {
    title,
    description:
      typeof record.description === "string" ? record.description.trim() : null,
    status: status as any,
    createdBy: createdBy ?? null,
    startTime: parseDate(record.startTime),
    endTime: parseDate(record.endTime),
    eligibilityRules: asRecord(record.eligibilityRules),
    conditionTree,
    rewardActions,
    repeatability: asRecord(record.repeatability),
    perUserCompletionLimit: Math.max(
      1,
      parseInteger(record.perUserCompletionLimit, 1) ?? 1
    ),
    globalCompletionLimit: parseInteger(record.globalCompletionLimit, null),
    summary,
    metadata: asRecord(record.metadata),
    updatedAt: new Date(),
  };
}

async function completionCountFor(challengeId: number) {
  const [row] = await db
    .select({ value: count() })
    .from(challengeAutomationCompletions)
    .where(eq(challengeAutomationCompletions.challengeId, challengeId));
  return Number(row?.value ?? 0);
}

async function progressCountFor(challengeId: number) {
  const [row] = await db
    .select({ value: count() })
    .from(challengeAutomationProgress)
    .where(eq(challengeAutomationProgress.challengeId, challengeId));
  return Number(row?.value ?? 0);
}

router.get(
  "/api/admin/challenge-automation/registry",
  requirePermission("manage_challenges", "manage_rewards"),
  async (_req, res) => {
    res.json({
      triggers: triggerRegistry,
      rewardActions: rewardActionRegistry,
      predicates: [
        "tezos.owns_any_token_from_contract",
        "tezos.owns_specific_token_id",
        "tezos.owns_minimum_quantity",
        "tezos.owns_one_of_contracts",
        "tezos.owns_one_of_token_ids",
        "tezos.owns_all_token_ids",
        "user.has_role",
        "user.is_contestant",
        "reward.not_already_claimed",
      ],
    });
  }
);

router.get(
  "/api/admin/challenge-automation/challenges",
  requirePermission("manage_challenges", "manage_rewards"),
  async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(challengeAutomationDefinitions)
        .orderBy(desc(challengeAutomationDefinitions.updatedAt));
      const enriched = [];
      for (const row of rows) {
        enriched.push({
          ...row,
          completionCount: await completionCountFor(row.id),
          progressCount: await progressCountFor(row.id),
        });
      }
      res.json({ challenges: enriched });
    } catch (err) {
      console.error("[challenge-automation] list failed:", err);
      res.status(500).json({ error: "Failed to fetch challenge automation definitions" });
    }
  }
);

router.post(
  "/api/admin/challenge-automation/challenges",
  requirePermission("manage_challenges"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const payload = challengePayload(req.body, user?.id ?? null);
      const [created] = await db
        .insert(challengeAutomationDefinitions)
        .values(payload)
        .returning();
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create challenge" });
    }
  }
);

router.get(
  "/api/admin/challenge-automation/challenges/:id",
  requirePermission("manage_challenges", "manage_rewards"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [challenge] = await db
        .select()
        .from(challengeAutomationDefinitions)
        .where(eq(challengeAutomationDefinitions.id, id))
        .limit(1);
      if (!challenge) return res.status(404).json({ error: "Challenge not found" });

      const completions = await db
        .select()
        .from(challengeAutomationCompletions)
        .where(eq(challengeAutomationCompletions.challengeId, id))
        .orderBy(desc(challengeAutomationCompletions.completedAt))
        .limit(100);
      const actionLogs = await db
        .select()
        .from(challengeAutomationActionLogs)
        .where(eq(challengeAutomationActionLogs.challengeId, id))
        .orderBy(desc(challengeAutomationActionLogs.updatedAt))
        .limit(100);

      res.json({ challenge, completions, actionLogs });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch challenge" });
    }
  }
);

router.patch(
  "/api/admin/challenge-automation/challenges/:id",
  requirePermission("manage_challenges"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const payload = challengePayload(req.body);
      const [updated] = await db
        .update(challengeAutomationDefinitions)
        .set(payload)
        .where(eq(challengeAutomationDefinitions.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Challenge not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update challenge" });
    }
  }
);

router.post(
  "/api/admin/challenge-automation/challenges/:id/status",
  requirePermission("manage_challenges"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body?.status || "");
      if (!STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid challenge status" });
      }
      const [updated] = await db
        .update(challengeAutomationDefinitions)
        .set({ status: status as any, updatedAt: new Date() })
        .where(eq(challengeAutomationDefinitions.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Challenge not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update challenge status" });
    }
  }
);

router.get(
  "/api/admin/challenge-automation/challenges/:id/progress",
  requirePermission("manage_challenges", "manage_rewards"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const rows = await db
        .select({
          id: challengeAutomationProgress.id,
          challengeId: challengeAutomationProgress.challengeId,
          userId: challengeAutomationProgress.userId,
          username: users.username,
          displayName: users.displayName,
          walletAddress: challengeAutomationProgress.walletAddress,
          state: challengeAutomationProgress.state,
          countedEvents: challengeAutomationProgress.countedEvents,
          satisfiedConditionIds: challengeAutomationProgress.satisfiedConditionIds,
          completedAt: challengeAutomationProgress.completedAt,
          rewardStatus: challengeAutomationProgress.rewardStatus,
          updatedAt: challengeAutomationProgress.updatedAt,
        })
        .from(challengeAutomationProgress)
        .leftJoin(users, eq(users.id, challengeAutomationProgress.userId))
        .where(eq(challengeAutomationProgress.challengeId, id))
        .orderBy(desc(challengeAutomationProgress.updatedAt))
        .limit(250);
      res.json({ progress: rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch challenge progress" });
    }
  }
);

router.get(
  "/api/admin/challenge-automation/events",
  requirePermission("manage_challenges", "manage_rewards"),
  async (req, res) => {
    try {
      const eventType = typeof req.query.eventType === "string" ? req.query.eventType : "";
      const userId = req.query.userId ? Number(req.query.userId) : null;
      const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100)));
      const filters = [];
      if (eventType) filters.push(eq(challengeSystemEvents.eventType, eventType));
      if (userId && Number.isInteger(userId)) filters.push(eq(challengeSystemEvents.userId, userId));
      const rows = await db
        .select()
        .from(challengeSystemEvents)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(challengeSystemEvents.occurredAt))
        .limit(limit);
      res.json({ events: rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch system events" });
    }
  }
);

router.get(
  "/api/admin/challenge-automation/audit",
  requirePermission("manage_challenges", "manage_rewards"),
  async (req, res) => {
    try {
      const challengeId = req.query.challengeId ? Number(req.query.challengeId) : null;
      const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 150)));
      const rows = await db
        .select()
        .from(challengeAutomationAuditLogs)
        .where(
          challengeId && Number.isInteger(challengeId)
            ? eq(challengeAutomationAuditLogs.challengeId, challengeId)
            : undefined
        )
        .orderBy(desc(challengeAutomationAuditLogs.createdAt))
        .limit(limit);
      res.json({ audit: rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch challenge audit logs" });
    }
  }
);

router.post(
  "/api/admin/challenge-automation/seed-examples",
  requirePermission("manage_challenges"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const result = await ensureExampleAutomationChallenges(user?.id ?? null);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: "Failed to seed example challenges" });
    }
  }
);

export default router;
