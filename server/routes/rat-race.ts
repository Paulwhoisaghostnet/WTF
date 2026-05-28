import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import { ingestSystemEvent } from "../challenges/events/ingest";
import {
  RAT_RACE_DEFAULT_FILTER_VALUES,
  RAT_RACE_FILTER_LIMITS,
  loadRatRaceHotTokenFeed,
} from "../features/rat-race/hot-tokens";

const router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(RAT_RACE_FILTER_LIMITS.limit.min).max(RAT_RACE_FILTER_LIMITS.limit.max).default(RAT_RACE_DEFAULT_FILTER_VALUES.limit),
  windowHours: z.coerce
    .number()
    .int()
    .min(RAT_RACE_FILTER_LIMITS.windowHours.min)
    .max(RAT_RACE_FILTER_LIMITS.windowHours.max)
    .default(RAT_RACE_DEFAULT_FILTER_VALUES.windowHours),
  mintedWithinDays: z.coerce
    .number()
    .int()
    .min(RAT_RACE_FILTER_LIMITS.mintedWithinDays.min)
    .max(RAT_RACE_FILTER_LIMITS.mintedWithinDays.max)
    .default(RAT_RACE_DEFAULT_FILTER_VALUES.mintedWithinDays),
  minSoldPercent: z.coerce
    .number()
    .min(RAT_RACE_FILTER_LIMITS.minSoldPercent.min)
    .max(RAT_RACE_FILTER_LIMITS.minSoldPercent.max)
    .default(RAT_RACE_DEFAULT_FILTER_VALUES.minSoldPercent),
  minRecentSales: z.coerce
    .number()
    .int()
    .min(RAT_RACE_FILTER_LIMITS.minRecentSales.min)
    .max(RAT_RACE_FILTER_LIMITS.minRecentSales.max)
    .default(RAT_RACE_DEFAULT_FILTER_VALUES.minRecentSales),
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
  if (!["rat_race.viewed", "rat_race.scan_requested", "rat_race.card.opened", "rat_race.purchase_intent.created"].includes(eventType)) {
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
