import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import { ingestSystemEvent } from "../challenges/events/ingest";
import { loadRatRaceHotTokenFeed } from "../features/rat-race/hot-tokens";

const router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(24),
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
  mintedWithinDays: z.coerce.number().int().min(1).max(365).default(14),
  minSoldPercent: z.coerce.number().min(1).max(99).default(50),
  minRecentSales: z.coerce.number().int().min(1).max(25).default(2),
});

router.get("/api/rat-race/hot-tokens", isAuthenticated, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Rat Race filter", details: parsed.error.flatten() });
  }
  try {
    const filter = parsed.data;
    const feed = await loadRatRaceHotTokenFeed(filter);
    res.json({
      ...filter,
      generatedAt: new Date().toISOString(),
      diagnostics: feed.diagnostics,
      items: feed.items,
    });
  } catch (err) {
    console.error("[rat-race] hot token feed failed:", err);
    res.status(500).json({ error: "Failed to load Rat Race hot tokens" });
  }
});

router.post("/api/rat-race/events", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const eventType = String(req.body?.eventType || "");
  if (!["rat_race.viewed", "rat_race.card.opened", "rat_race.purchase_intent.created"].includes(eventType)) {
    return res.status(400).json({ error: "Unsupported Rat Race event" });
  }
  await ingestSystemEvent({
    eventType,
    userId: user.id,
    source: "rat-race",
    sourceModule: "rat-race",
    rawRefType: "tezos_token",
    rawRefId: String(req.body?.tokenRef || "rat-race"),
    metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
  });
  res.json({ ok: true });
});

export default router;
