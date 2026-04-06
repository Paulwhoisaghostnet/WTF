import { Router } from "express";
import { db } from "../db";
import { seasons, rounds } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";

const router = Router();

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
      const [season] = await db
        .insert(seasons)
        .values({ ...req.body, createdBy: user.id })
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
      const [updated] = await db
        .update(seasons)
        .set(req.body)
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
      const [round] = await db.insert(rounds).values(req.body).returning();
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
      const [updated] = await db
        .update(rounds)
        .set(req.body)
        .where(eq(rounds.id, parseInt(req.params.id as string)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Round not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update round" });
    }
  }
);

export default router;
