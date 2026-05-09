import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import type { ConsoleAuthUser } from "../features/console/types";
import {
  CASINO_GAME_REGISTRY,
  createCasinoMembershipIntent,
  getCasinoAccessStatus,
  getCasinoAppPassEconomy,
  getCasinoMembershipConfig,
  verifyCasinoMembershipPurchaseByHash,
} from "../features/casino/access";
import {
  createWtfButtonQuote,
  getWtfButtonSnapshot,
  submitWtfButtonPress,
} from "../features/casino/games/wtf-button/service";
import {
  delayRugPullButton,
  getRugPullSnapshot,
  joinRugPullRound,
  joinRugPullWitness,
  pressRugPullButton,
  voteRugPullWitness,
  type RugPullVote,
} from "../features/casino/games/rug-pull/service";
import {
  getRacewaySnapshot,
  injectRacewayEffect,
  placeRacewayBet,
} from "../features/casino/games/guinea-pig-raceway/service";
import type {
  WtfButtonId,
  WtfButtonPriceProtectionMode,
} from "../features/casino/games/wtf-button/rules";
import type { RacewayEffectKey } from "../features/casino/games/guinea-pig-raceway/rules";

const router = Router();

const intentPayload = z.object({
  walletAddress: z.string().trim().max(40).optional().nullable(),
});

const verifyPayload = z.object({
  opHash: z.string().trim().min(30).max(80),
});

const wtfButtonIdSchema = z.enum(["red", "green", "blue"]);
const wtfButtonQuotePayload = z.object({
  buttonId: wtfButtonIdSchema,
  priceProtectionMode: z.enum(["strict", "flexible"]).default("strict"),
  toleranceMutez: z.union([z.string(), z.number(), z.bigint()]).optional().default("0"),
});
const wtfButtonPressPayload = z.object({
  quote: z.object({
    id: z.string().optional(),
    buttonId: wtfButtonIdSchema,
    roundId: z.string(),
    sender: z.string(),
    quotedCostMutez: z.union([z.string(), z.number(), z.bigint()]),
    maxAcceptedCostMutez: z.union([z.string(), z.number(), z.bigint()]),
    priceProtectionMode: z.enum(["strict", "flexible"]),
    toleranceMutez: z.union([z.string(), z.number(), z.bigint()]).optional(),
    quoteTimestampMs: z.number(),
  }),
});
const rugPullVotePayload = z.object({
  vote: z.enum(["mercy", "cruelty", "silence"]),
});
const racewayBetPayload = z.object({
  racerId: z.string().trim().min(1).max(80),
  stakeMicrowtf: z.union([z.string(), z.number(), z.bigint()]).optional().default("5000000"),
});
const racewayEffectPayload = z.object({
  racerId: z.string().trim().min(1).max(80),
  effectKey: z.enum([
    "snack_toss",
    "squeaky_distraction",
    "tunnel_rumor",
    "fan_chant",
    "confetti_pop",
  ]),
});

function authUser(req: Request): ConsoleAuthUser {
  const user = req.user as any;
  return {
    id: Number(user.id),
    username: String(user.username || `user-${user.id}`),
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl || user.pfpImageUrl || null,
    role: user.role ?? null,
  };
}

function sendCasinoError(res: Response, err: unknown, fallback: string) {
  const enriched = err as (Error & { statusCode?: number }) | null;
  const message = err instanceof Error ? err.message : fallback;
  const status =
    enriched?.statusCode ||
    (/required|payment/i.test(message)
      ? 402
      : /not configured/i.test(message)
        ? 503
        : /invalid|expired|unavailable|mismatch/i.test(message)
          ? 400
          : 500);
  if (status >= 500) console.error("[casino] route failed:", err);
  res.status(status).json({ error: message || fallback });
}

function parseMutezBigInt(value: unknown): bigint {
  const raw = String(value ?? "0").trim();
  if (!/^[0-9]+$/.test(raw)) return 0n;
  return BigInt(raw);
}

async function requireCasinoEntry(req: Request, res: Response) {
  const access = await getCasinoAccessStatus(authUser(req));
  if (!access.canEnter) {
    res.status(402).json({
      ok: false,
      error: "WTF Casino app pass and active membership card required.",
      access,
    });
    return null;
  }
  return access;
}

router.get("/api/casino/status", isAuthenticated, async (req, res) => {
  try {
    res.json(await getCasinoAccessStatus(authUser(req)));
  } catch (err) {
    sendCasinoError(res, err, "Failed to fetch WTF Casino status");
  }
});

router.get("/api/casino/games", isAuthenticated, async (req, res) => {
  try {
    const access = await getCasinoAccessStatus(authUser(req));
    res.json({
      games: CASINO_GAME_REGISTRY,
      canEnter: access.canEnter,
      wageringEnabled: access.wageringEnabled,
      access,
    });
  } catch (err) {
    sendCasinoError(res, err, "Failed to fetch WTF Casino games");
  }
});

router.post("/api/casino/membership-intents", isAuthenticated, async (req, res) => {
  try {
    const parsed = intentPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid membership intent" });
    }
    res.status(201).json({
      ok: true,
      intent: await createCasinoMembershipIntent({
        userId: authUser(req).id,
        walletAddress: parsed.data.walletAddress,
      }),
      config: getCasinoMembershipConfig(),
      appPass: getCasinoAppPassEconomy(),
    });
  } catch (err) {
    sendCasinoError(res, err, "Failed to create WTF Casino membership intent");
  }
});

router.post("/api/casino/membership-verify", isAuthenticated, async (req, res) => {
  try {
    const parsed = verifyPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid operation hash" });
    }
    const result = await verifyCasinoMembershipPurchaseByHash(
      parsed.data.opHash,
      authUser(req).id
    );
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.reason || "mismatch" });
    }
    res.json({ ...result, access: await getCasinoAccessStatus(authUser(req)) });
  } catch (err) {
    sendCasinoError(res, err, "Failed to verify WTF Casino membership");
  }
});

router.post("/api/casino/entry", isAuthenticated, async (req, res) => {
  try {
    const access = await getCasinoAccessStatus(authUser(req));
    if (!access.canEnter) {
      return res.status(402).json({
        ok: false,
        error: "WTF Casino app pass and active membership card required.",
        access,
      });
    }
    res.json({
      ok: true,
      access,
      lobby: {
        games: CASINO_GAME_REGISTRY,
        wageringEnabled: false,
      },
    });
  } catch (err) {
    sendCasinoError(res, err, "Failed to enter WTF Casino");
  }
});

router.get("/api/casino/wtf-button/state", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    res.json(getWtfButtonSnapshot(authUser(req)));
  } catch (err) {
    sendCasinoError(res, err, "Failed to fetch WTF Button state");
  }
});

router.post("/api/casino/wtf-button/quote", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const parsed = wtfButtonQuotePayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid WTF Button quote request" });
    }
    const quote = createWtfButtonQuote({
      rawUser: authUser(req),
      buttonId: parsed.data.buttonId as WtfButtonId,
      priceProtectionMode: parsed.data.priceProtectionMode as WtfButtonPriceProtectionMode,
      toleranceMutez: parseMutezBigInt(parsed.data.toleranceMutez),
    });
    res.json({ ok: true, quote });
  } catch (err) {
    sendCasinoError(res, err, "Failed to quote WTF Button press");
  }
});

router.post("/api/casino/wtf-button/press", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const parsed = wtfButtonPressPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid WTF Button press request" });
    }
    const result = submitWtfButtonPress({
      rawUser: authUser(req),
      quotePayload: parsed.data.quote,
    });
    if (!result.ok) {
      const status = result.code === "INSUFFICIENT_BALANCE" ? 402 : 409;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to press WTF Button");
  }
});

router.get("/api/casino/rug-pull/state", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    res.json(getRugPullSnapshot(authUser(req)));
  } catch (err) {
    sendCasinoError(res, err, "Failed to fetch Rug Pull state");
  }
});

router.post("/api/casino/rug-pull/join", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const result = joinRugPullRound(authUser(req));
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to join Rug Pull round");
  }
});

router.post("/api/casino/rug-pull/delay", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const result = delayRugPullButton(authUser(req));
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to delay Rug Pull button");
  }
});

router.post("/api/casino/rug-pull/press", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const result = pressRugPullButton(authUser(req));
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to press Rug Pull button");
  }
});

router.post("/api/casino/rug-pull/witness", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const result = joinRugPullWitness(authUser(req));
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to join Rug Pull witnesses");
  }
});

router.post("/api/casino/rug-pull/vote", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const parsed = rugPullVotePayload.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid Rug Pull vote" });
    const result = voteRugPullWitness(authUser(req), parsed.data.vote as RugPullVote);
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to vote in Rug Pull");
  }
});

router.get("/api/casino/guinea-pig-raceway/state", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    res.json(getRacewaySnapshot(authUser(req)));
  } catch (err) {
    sendCasinoError(res, err, "Failed to fetch Guinea Pig Raceway state");
  }
});

router.post("/api/casino/guinea-pig-raceway/bet", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const parsed = racewayBetPayload.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid Raceway bet" });
    const result = placeRacewayBet(
      authUser(req),
      parsed.data.racerId,
      parseMutezBigInt(parsed.data.stakeMicrowtf)
    );
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to place Raceway bet");
  }
});

router.post("/api/casino/guinea-pig-raceway/effect", isAuthenticated, async (req, res) => {
  try {
    const access = await requireCasinoEntry(req, res);
    if (!access) return;
    const parsed = racewayEffectPayload.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid Raceway effect" });
    const result = injectRacewayEffect(
      authUser(req),
      parsed.data.racerId,
      parsed.data.effectKey as RacewayEffectKey
    );
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    sendCasinoError(res, err, "Failed to inject Raceway effect");
  }
});

export default router;
