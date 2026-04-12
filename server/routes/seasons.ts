import { Router } from "express";
import { db } from "../db";
import { seasons, rounds } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";
import { z } from "zod";

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

const seasonCreateSchema = z
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
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before endDate",
      });
    }
  });

const seasonUpdateSchema = seasonCreateSchema.partial().strict();

const roundCreateSchema = z
  .object({
    seasonId: z.coerce.number().int().min(1),
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
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before endDate",
      });
    }
  });

const roundUpdateSchema = roundCreateSchema.partial().strict();

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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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
  requireRole("admin", "host", "cohost"),
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
    const seasonId = req.query.seasonId
      ? parseInt(req.query.seasonId as string)
      : undefined;
    const query = db.select().from(rounds);
    const allRounds = seasonId
      ? await query.where(eq(rounds.seasonId, seasonId)).orderBy(rounds.number)
      : await query.orderBy(desc(rounds.createdAt));
    res.json(allRounds);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rounds" });
  }
});

router.get("/api/rounds/:id", async (req, res) => {
  try {
    const [round] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, parseInt(req.params.id as string)));
    if (!round) return res.status(404).json({ error: "Round not found" });
    res.json(round);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch round" });
  }
});

router.post(
  "/api/rounds",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const parsed = roundCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid round payload" });
      }

      const [round] = await db
        .insert(rounds)
        .values({
          seasonId: parsed.data.seasonId,
          number: parsed.data.number,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "upcoming",
          rewardXp: parsed.data.rewardXp ?? 0,
          rewardEscrowSlug: parsed.data.rewardEscrowSlug ?? null,
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
        })
        .returning();
      res.status(201).json(round);
    } catch (err) {
      res.status(500).json({ error: "Failed to create round" });
    }
  }
);

router.put(
  "/api/rounds/:id",
  requireRole("admin", "host", "cohost"),
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

      const [updated] = await db
        .update(rounds)
        .set(updates)
        .where(eq(rounds.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Round not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update round" });
    }
  }
);

router.delete(
  "/api/rounds/:id",
  requireRole("admin", "host", "cohost"),
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
