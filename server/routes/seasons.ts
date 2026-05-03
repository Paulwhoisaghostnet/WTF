import { Router } from "express";
import { db } from "../db";
import { gameshowEvents, seasons, rounds } from "@shared/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { z } from "zod";
import { syncRoundEvent } from "../lib/calendar-sync";

const router = Router();

const seasonStatuses = ["upcoming", "active", "completed"] as const;
const roundStatuses = ["upcoming", "active", "grading", "completed"] as const;

const optionalDateSchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid timestamp",
      });
      return z.NEVER;
    }
    return parsed;
  });

type SeasonMediaAssets = Record<string, unknown>;
type JsonArray = unknown[];

const optionalSeasonIdSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.union([z.coerce.number().int().min(1), z.null()]).optional()
);

const seasonMediaAssetsSchema = z
  .unknown()
  .optional()
  .transform((value, ctx): SeasonMediaAssets | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return {};
    if (typeof value !== "object" || Array.isArray(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mediaAssets must be an object",
      });
      return z.NEVER;
    }

    const json = JSON.stringify(value);
    if (json.length > 50_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mediaAssets is too large",
      });
      return z.NEVER;
    }

    return value as SeasonMediaAssets;
  });

const optionalJsonArraySchema = z
  .unknown()
  .optional()
  .transform((value, ctx): JsonArray | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return [];
    if (!Array.isArray(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected an array",
      });
      return z.NEVER;
    }
    const json = JSON.stringify(value);
    if (json.length > 50_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Array payload is too large",
      });
      return z.NEVER;
    }
    return value;
  });

/** Zod 4: `.partial()` cannot run on schemas that already use `.superRefine()` / `.refine()` on the object. */
function refineSeasonDateOrder(
  value: { startDate?: Date | null; endDate?: Date | null },
  ctx: z.RefinementCtx
) {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startDate must be before endDate",
    });
  }
}

const seasonFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    number: z.coerce.number().int().min(1).max(100_000),
    status: z.enum(seasonStatuses).optional(),
    description: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    mediaAssets: seasonMediaAssetsSchema,
  })
  .strict();

const seasonCreateSchema = seasonFieldsSchema.superRefine(refineSeasonDateOrder);

const seasonUpdateSchema = seasonFieldsSchema
  .partial()
  .strict()
  .superRefine(refineSeasonDateOrder);

const roundFieldsSchema = z
  .object({
    seasonId: optionalSeasonIdSchema,
    number: z.coerce.number().int().min(1).max(100_000),
    name: z.string().trim().min(1).max(200),
    description: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    status: z.enum(roundStatuses).optional(),
    rewardXp: z.coerce.number().int().min(0).max(1_000_000).optional(),
    rewardEscrowSlug: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    startingContestants: z.coerce.number().int().min(0).max(100_000).optional(),
    eliminatedAtEnd: z.coerce.number().int().min(0).max(100_000).optional(),
    requiredPlatforms: optionalJsonArraySchema,
    rules: z
      .string()
      .trim()
      .max(20_000)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    prizes: optionalJsonArraySchema,
    previousWinners: optionalJsonArraySchema,
    leaderboard: optionalJsonArraySchema,
    eliminatedContestants: optionalJsonArraySchema,
  })
  .strict();

const roundCreateSchema = roundFieldsSchema.superRefine(refineSeasonDateOrder);

const roundUpdateSchema = roundFieldsSchema
  .partial()
  .strict()
  .superRefine(refineSeasonDateOrder);

router.get("/api/seasons", async (_req, res) => {
  try {
    const allSeasons = await db
      .select()
      .from(seasons)
      .orderBy(desc(seasons.number));
    res.json(allSeasons);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch seasons" });
  }
});

router.get("/api/seasons/:id", async (req, res) => {
  try {
    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.id, parseInt(req.params.id as string)));
    if (!season) return res.status(404).json({ error: "Season not found" });

    const seasonRounds = await db
      .select()
      .from(rounds)
      .where(eq(rounds.seasonId, season.id))
      .orderBy(rounds.number);

    res.json({ ...season, rounds: seasonRounds });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch season" });
  }
});

router.post(
  "/api/seasons",
  requirePermission("manage_seasons"),
  async (req, res) => {
    try {
      const user = req.user as any;
      const parsed = seasonCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid season payload" });
      }
      const [season] = await db
        .insert(seasons)
        .values({
          name: parsed.data.name,
          number: parsed.data.number,
          status: parsed.data.status ?? "upcoming",
          description: parsed.data.description ?? null,
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
          mediaAssets: parsed.data.mediaAssets ?? {},
          createdBy: user.id,
        })
        .returning();
      res.status(201).json(season);
    } catch (err) {
      res.status(500).json({ error: "Failed to create season" });
    }
  }
);

router.put(
  "/api/seasons/:id",
  requirePermission("manage_seasons"),
  async (req, res) => {
    try {
      const parsed = seasonUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid season payload" });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.number !== undefined) updates.number = parsed.data.number;
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.description !== undefined) {
        updates.description = parsed.data.description;
      }
      if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate;
      if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate;
      if (parsed.data.mediaAssets !== undefined) {
        updates.mediaAssets = parsed.data.mediaAssets;
      }

      const [updated] = await db
        .update(seasons)
        .set(updates)
        .where(eq(seasons.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Season not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update season" });
    }
  }
);

router.delete(
  "/api/seasons/:id",
  requirePermission("manage_seasons"),
  async (req, res) => {
    try {
      await db.delete(seasons).where(eq(seasons.id, parseInt(req.params.id as string)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete season" });
    }
  }
);

// ─── Rounds ──────────────────────────────────────────────

router.get("/api/rounds", async (req, res) => {
  try {
    const rawSeasonId = req.query.seasonId as string | undefined;
    const unassigned =
      req.query.unassigned === "1" ||
      req.query.unassigned === "true" ||
      rawSeasonId === "null";
    const parsedSeasonId = rawSeasonId && rawSeasonId !== "null"
      ? parseInt(rawSeasonId)
      : undefined;
    if (parsedSeasonId !== undefined && Number.isNaN(parsedSeasonId)) {
      return res.status(400).json({ error: "Invalid seasonId" });
    }
    const query = db.select().from(rounds);
    const allRounds = unassigned
      ? await query.where(isNull(rounds.seasonId)).orderBy(desc(rounds.createdAt))
      : parsedSeasonId
        ? await query
            .where(eq(rounds.seasonId, parsedSeasonId))
            .orderBy(rounds.number)
        : await query.orderBy(desc(rounds.createdAt));
    res.json(allRounds);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rounds" });
  }
});

router.get("/api/rounds/:id", async (req, res) => {
  try {
    const roundId = parseInt(req.params.id as string);
    const [round] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, roundId));
    if (!round) return res.status(404).json({ error: "Round not found" });
    const [calendarEvent] = await db
      .select()
      .from(gameshowEvents)
      .where(and(eq(gameshowEvents.sourceKind, "round"), eq(gameshowEvents.sourceId, roundId)));
    res.json({ ...round, calendarEvent: calendarEvent ?? null });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch round" });
  }
});

router.post(
  "/api/rounds",
  requirePermission("manage_seasons"),
  async (req, res) => {
    try {
      const parsed = roundCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid round payload" });
      }

      const [round] = await db
        .insert(rounds)
        .values({
          seasonId: parsed.data.seasonId ?? null,
          number: parsed.data.number,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "upcoming",
          rewardXp: parsed.data.rewardXp ?? 0,
          rewardEscrowSlug: parsed.data.rewardEscrowSlug ?? null,
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
          startingContestants: parsed.data.startingContestants ?? 0,
          eliminatedAtEnd: parsed.data.eliminatedAtEnd ?? 0,
          requiredPlatforms: parsed.data.requiredPlatforms ?? [],
          rules: parsed.data.rules ?? null,
          prizes: parsed.data.prizes ?? [],
          previousWinners: parsed.data.previousWinners ?? [],
          leaderboard: parsed.data.leaderboard ?? [],
          eliminatedContestants: parsed.data.eliminatedContestants ?? [],
        })
        .returning();
      await syncRoundEvent(round.id);
      res.status(201).json(round);
    } catch (err) {
      res.status(500).json({ error: "Failed to create round" });
    }
  }
);

router.put(
  "/api/rounds/:id",
  requirePermission("manage_seasons"),
  async (req, res) => {
    try {
      const parsed = roundUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid round payload" });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.seasonId !== undefined) updates.seasonId = parsed.data.seasonId;
      if (parsed.data.number !== undefined) updates.number = parsed.data.number;
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.description !== undefined) {
        updates.description = parsed.data.description;
      }
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.rewardXp !== undefined) updates.rewardXp = parsed.data.rewardXp;
      if (parsed.data.rewardEscrowSlug !== undefined) {
        updates.rewardEscrowSlug = parsed.data.rewardEscrowSlug;
      }
      if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate;
      if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate;
      if (parsed.data.startingContestants !== undefined) {
        updates.startingContestants = parsed.data.startingContestants;
      }
      if (parsed.data.eliminatedAtEnd !== undefined) {
        updates.eliminatedAtEnd = parsed.data.eliminatedAtEnd;
      }
      if (parsed.data.requiredPlatforms !== undefined) {
        updates.requiredPlatforms = parsed.data.requiredPlatforms;
      }
      if (parsed.data.rules !== undefined) updates.rules = parsed.data.rules;
      if (parsed.data.prizes !== undefined) updates.prizes = parsed.data.prizes;
      if (parsed.data.previousWinners !== undefined) {
        updates.previousWinners = parsed.data.previousWinners;
      }
      if (parsed.data.leaderboard !== undefined) updates.leaderboard = parsed.data.leaderboard;
      if (parsed.data.eliminatedContestants !== undefined) {
        updates.eliminatedContestants = parsed.data.eliminatedContestants;
      }

      const [updated] = await db
        .update(rounds)
        .set(updates)
        .where(eq(rounds.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Round not found" });
      await syncRoundEvent(updated.id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update round" });
    }
  }
);

router.delete(
  "/api/rounds/:id",
  requirePermission("manage_seasons"),
  async (req, res) => {
    try {
      await db.delete(rounds).where(eq(rounds.id, parseInt(req.params.id as string)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete round" });
    }
  }
);

export default router;
