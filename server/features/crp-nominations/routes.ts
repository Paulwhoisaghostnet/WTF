import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../../auth/passport";
import { createInMemoryRateLimit } from "../../lib/in-memory-rate-limit";
import { CRP_CATEGORIES } from "@shared/crp-categories";
import { isTezosAddress } from "@shared/tezos-identity";
import { resolveSpineIdentity } from "../atproto-spine/identity-resolve";
import { resolveNomineeIdentity } from "./identity-resolver";
import {
  getCrpNominationByUri,
  crpRepoStatus,
  listCrpNominationsForUser,
  publishCrpNomination,
} from "./publish";
import { countAnonymousNominationCredits } from "./reward-credits";
import { buildCrpShareIntents } from "./share-intents";
import { emitCrpNominationEvent } from "./events";

const router = Router();

const readLimiter = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => `crp-read:${(req.user as any)?.id ?? req.ip}`,
  message: { error: "Too many CRP nomination lookups, please try again later" },
});

const writeLimiter = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => `crp-write:${(req.user as any)?.id ?? req.ip}`,
  message: { error: "Too many CRP nomination submissions, please try again later" },
});

const resolveSchema = z.object({
  query: z.string().trim().min(1).max(320),
});

const submitSchema = z.object({
  anonymous: z.boolean().optional(),
  nominee: z.object({
    tezosAddress: z.string().trim(),
    tezosDomain: z.string().trim().max(120).optional().nullable(),
    displayName: z.string().trim().max(320).optional().nullable(),
    xHandle: z.string().trim().max(64).optional().nullable(),
    bskyHandle: z.string().trim().max(320).optional().nullable(),
    identitySources: z.array(z.string().trim().max(64)).max(32).optional(),
  }),
  categoryId: z.string().trim().min(1).max(64),
  justification: z
    .object({
      summary: z.string().trim().max(2000).optional().nullable(),
      links: z.array(z.string().trim().max(2048)).max(12).optional(),
    })
    .optional(),
});

router.get("/api/crp-nominations/categories", (_req, res) => {
  res.json({ categories: CRP_CATEGORIES });
});

router.get("/api/crp-nominations/status", (_req, res) => {
  res.json(crpRepoStatus());
});

router.post("/api/crp-nominations/viewed", isAuthenticated, readLimiter, (req, res) => {
  const userId = (req.user as any).id as number;
  emitCrpNominationEvent({
    eventType: "crp.nomination.viewed",
    userId,
    metadata: { path: "/crp-nominate" },
  });
  res.json({ ok: true });
});

router.post("/api/crp-nominations/resolve", isAuthenticated, readLimiter, async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
  const userId = (req.user as any).id as number;
  try {
    const resolution = await resolveNomineeIdentity(parsed.data.query);
    emitCrpNominationEvent({
      eventType: "crp.nomination.resolve",
      userId,
      metadata: { kind: resolution.kind, bundleCount: resolution.bundles.length },
    });
    res.json(resolution);
  } catch (err) {
    console.error("[crp-nominations] resolve failed:", err);
    res.status(500).json({ error: "resolve_failed" });
  }
});

router.get("/api/crp-nominations/mine", isAuthenticated, readLimiter, async (req, res) => {
  const userId = (req.user as any).id as number;
  const limit = Number(req.query.limit ?? 50);
  const [nominations, anonymousNominationCredits] = await Promise.all([
    listCrpNominationsForUser(userId, limit),
    countAnonymousNominationCredits(userId),
  ]);
  res.json({ nominations, anonymousNominationCredits });
});

router.get("/api/crp-nominations/credits", isAuthenticated, readLimiter, async (req, res) => {
  const userId = (req.user as any).id as number;
  const count = await countAnonymousNominationCredits(userId);
  res.json({ anonymousNominationCredits: count });
});

router.post("/api/crp-nominations/submit", isAuthenticated, writeLimiter, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_submission", details: parsed.error.issues });
  if (!isTezosAddress(parsed.data.nominee.tezosAddress)) {
    return res.status(400).json({ error: "invalid_tezos_address" });
  }
  if (!CRP_CATEGORIES.some((category) => category.id === parsed.data.categoryId)) {
    return res.status(400).json({ error: "invalid_category" });
  }

  const userId = (req.user as any).id as number;
  const identity = await resolveSpineIdentity(userId);
  try {
    const published = await publishCrpNomination({
      nominatorUserId: userId,
      nominatorDid: identity?.repoDid || identity?.canonicalDid || `wtfos:user:${userId}`,
      nominatorHandle: identity?.handle ?? null,
      nominee: parsed.data.nominee,
      categoryId: parsed.data.categoryId,
      justification: parsed.data.justification,
      anonymous: parsed.data.anonymous === true,
    });
    res.status(201).json({
      ...published,
      share: buildCrpShareIntents(published.nomination, published.bskyPostUrl),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "invalid_crp_category") {
      return res.status(400).json({ error: "invalid_category" });
    }
    if (message === "crp_nominations_repo_not_configured") {
      return res.status(503).json({ error: "crp_repo_not_configured" });
    }
    console.error("[crp-nominations] submit failed:", err);
    res.status(500).json({ error: "submit_failed" });
  }
});

router.get("/api/crp-nominations/share", isAuthenticated, readLimiter, async (req, res) => {
  const uri = String(req.query.uri || "").trim();
  const platform = String(req.query.platform || "x").trim().toLowerCase();
  if (!uri) return res.status(400).json({ error: "uri_required" });
  if (platform !== "x" && platform !== "bsky") {
    return res.status(400).json({ error: "invalid_platform" });
  }
  const userId = (req.user as any).id as number;
  const row = await getCrpNominationByUri(uri, userId);
  if (!row) return res.status(404).json({ error: "nomination_not_found" });
  const intents = buildCrpShareIntents(row.value, row.bskyPostUrl);
  emitCrpNominationEvent({
    eventType: platform === "x" ? "crp.nomination.share_x" : "crp.nomination.share_bsky",
    userId,
    rawRefId: row.value.nominationId,
    metadata: { uri, platform, bskyPostUrl: row.bskyPostUrl ?? null },
  });
  res.json(intents[platform]);
});

export default router;
