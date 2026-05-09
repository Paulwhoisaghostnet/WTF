import { Router, type Response } from "express";
import { z } from "zod";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  adminClubDuesSummary,
  clubDuesCustomizationSchema,
  compileClubDuesContract,
  createClubDuesContract,
  createClubDuesPaymentIntent,
  createPaymentIntentSchema,
  deployClubDuesWithManagerWallet,
  getClubDuesContractBySlug,
  getMyClubDuesMemberships,
  listClubDuesContracts,
  serializeClubDuesContract,
  sweepClubDuesArrears,
  verifyClubDuesPaymentByHash,
} from "../features/club-dues/service";

const router = Router();

const verifyPayload = z.object({
  opHash: z.string().trim().min(30).max(80),
});

const deployPayload = z
  .object({
    confirmMainnet: z.boolean().optional(),
  })
  .strict();

const sweepPayload = z
  .object({
    chainMark: z.boolean().optional(),
  })
  .strict();

function userId(req: any): number {
  return Number(req.user?.id);
}

function sendClubDuesError(res: Response, err: unknown, fallback: string) {
  const statusFromError = (err as Error & { status?: number; statusCode?: number })?.status ??
    (err as Error & { status?: number; statusCode?: number })?.statusCode;
  const message = err instanceof Error ? err.message : fallback;
  const status =
    statusFromError ||
    (/not authenticated/i.test(message)
      ? 401
      : /permission|disabled|mainnet/i.test(message)
        ? 403
        : /not found/i.test(message)
          ? 404
          : /not configured|signer|kiln/i.test(message)
            ? 503
            : /invalid|mismatch|expired|required|not live/i.test(message)
              ? 400
              : 500);
  if (status >= 500) console.error("[club-dues] route failed:", err);
  res.status(status).json({ error: message || fallback });
}

router.get("/api/club-dues/contracts", async (_req, res) => {
  try {
    res.json({ contracts: await listClubDuesContracts() });
  } catch (err) {
    sendClubDuesError(res, err, "Failed to list club dues contracts");
  }
});

router.get("/api/club-dues/contracts/:slug", async (req, res) => {
  try {
    const contract = await getClubDuesContractBySlug(req.params.slug, false);
    if (!contract) return res.status(404).json({ error: "not_found" });
    res.json({ contract: serializeClubDuesContract(contract) });
  } catch (err) {
    sendClubDuesError(res, err, "Failed to load club dues contract");
  }
});

router.post("/api/club-dues/templates/compile", async (req, res) => {
  try {
    const parsed = clubDuesCustomizationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "bad_body", details: parsed.error.flatten() });
    }
    res.json(await compileClubDuesContract(parsed.data));
  } catch (err) {
    sendClubDuesError(res, err, "Failed to compile club dues contract");
  }
});

router.get("/api/club-dues/my", isAuthenticated, async (req, res) => {
  try {
    res.json({ memberships: await getMyClubDuesMemberships(userId(req)) });
  } catch (err) {
    sendClubDuesError(res, err, "Failed to load club dues memberships");
  }
});

router.post(
  "/api/club-dues/contracts/:slug/payment-intents",
  isAuthenticated,
  async (req, res) => {
    try {
      const parsed = createPaymentIntentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "bad_body", details: parsed.error.flatten() });
      }
      res.status(201).json({
        ok: true,
        intent: await createClubDuesPaymentIntent({
          slug: String(req.params.slug),
          userId: userId(req),
          walletAddress: parsed.data.walletAddress,
          months: parsed.data.months,
          tierId: parsed.data.tierId,
          action: parsed.data.action,
        }),
      });
    } catch (err) {
      sendClubDuesError(res, err, "Failed to create club dues payment intent");
    }
  }
);

router.post("/api/club-dues/payment-verify", isAuthenticated, async (req, res) => {
  try {
    const parsed = verifyPayload.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid operation hash" });
    const result = await verifyClubDuesPaymentByHash(parsed.data.opHash, userId(req));
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    sendClubDuesError(res, err, "Failed to verify club dues payment");
  }
});

router.get(
  "/api/admin/club-dues",
  requirePermission("manage_gameshow"),
  async (_req, res) => {
    try {
      res.json(await adminClubDuesSummary());
    } catch (err) {
      sendClubDuesError(res, err, "Failed to load club dues admin summary");
    }
  }
);

router.post(
  "/api/admin/club-dues/contracts",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const parsed = clubDuesCustomizationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "bad_body", details: parsed.error.flatten() });
      }
      res.status(201).json({
        ok: true,
        contract: await createClubDuesContract(parsed.data, userId(req)),
      });
    } catch (err) {
      sendClubDuesError(res, err, "Failed to save club dues contract");
    }
  }
);

router.post(
  "/api/admin/club-dues/contracts/:id/deploy",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "bad_id" });
      }
      const parsed = deployPayload.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "bad_body", details: parsed.error.flatten() });
      }
      res.json({
        ok: true,
        ...(await deployClubDuesWithManagerWallet({
          contractId: id,
          actorUserId: userId(req),
          confirmMainnet: parsed.data.confirmMainnet,
        })),
      });
    } catch (err) {
      sendClubDuesError(res, err, "Failed to deploy club dues contract");
    }
  }
);

router.post(
  "/api/admin/club-dues/arrears/sweep",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const parsed = sweepPayload.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "bad_body", details: parsed.error.flatten() });
      }
      res.json({
        ok: true,
        ...(await sweepClubDuesArrears({
          chainMark: parsed.data.chainMark,
          actorUserId: userId(req),
        })),
      });
    } catch (err) {
      sendClubDuesError(res, err, "Failed to sweep club dues arrears");
    }
  }
);

export default router;
