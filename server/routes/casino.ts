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

const router = Router();

const intentPayload = z.object({
  walletAddress: z.string().trim().max(40).optional().nullable(),
});

const verifyPayload = z.object({
  opHash: z.string().trim().min(30).max(80),
});

function authUser(req: Request): ConsoleAuthUser {
  const user = req.user as any;
  return {
    id: Number(user.id),
    username: String(user.username || `user-${user.id}`),
    displayName: user.displayName ?? null,
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

export default router;
