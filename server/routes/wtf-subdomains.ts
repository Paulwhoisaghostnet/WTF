import { Router } from "express";
import { z } from "zod";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { getDomainChatConfig } from "../features/wtf-subdomains/chat";
import {
  grantWtfSubdomainToUser,
  listWtfSubdomainGrants,
  updateWtfSubdomainGrantStatus,
} from "../features/wtf-subdomains/grants";
import {
  getRegistrarStatus,
  prepareRegistrarRegistration,
} from "../features/wtf-subdomains/registrar";
import { prepareCommitPlan } from "../features/wtf-subdomains/commit";
import { getWalletRegistrarStatus } from "../features/wtf-subdomains/status";

const router = Router();

const grantSchema = z.object({
  label: z.string().trim().optional(),
  walletAddress: z.string().trim().optional().nullable(),
  sourceType: z.string().trim().max(40).optional(),
  sourceId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const statusSchema = z.object({
  status: z.enum(["reserved", "pending", "provisioned", "revoked"]),
  opHash: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const registrarPrepareSchema = z.object({
  label: z.string().trim().min(1).max(120),
  targetAddress: z.string().trim().min(1).max(80),
});

router.get("/api/wtf-subdomains/my", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    res.json(await listWtfSubdomainGrants(user.id));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wtf.tez grants" });
  }
});

router.get(
  "/api/admin/wtf-subdomains",
  requirePermission("manage_users", "manage_rewards", "manage_side_quests", "manage_challenges"),
  async (req, res) => {
    try {
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      res.json(await listWtfSubdomainGrants(userId));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch wtf.tez grants" });
    }
  }
);

router.get(
  "/api/wtf-subdomains/registrar/config",
  isAuthenticated,
  async (_req, res) => {
    try {
      res.json(await getRegistrarStatus());
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch registrar config" });
    }
  }
);

router.post(
  "/api/wtf-subdomains/registrar/prepare",
  isAuthenticated,
  async (req, res) => {
    const parsed = registrarPrepareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid registrar payload" });
    }
    const result = prepareRegistrarRegistration(parsed.data);
    if (!result.ok) {
      return res
        .status(result.status)
        .json({ error: result.error, missingEnv: result.missingEnv });
    }
    return res.json(result.body);
  }
);

router.post(
  "/api/wtf-subdomains/registrar/commit",
  isAuthenticated,
  async (req, res) => {
    const parsed = registrarPrepareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid commit payload" });
    }
    const user = req.user as { id?: number };
    const result = prepareCommitPlan(parsed.data);
    if (!result.ok) {
      return res
        .status(result.status)
        .json({ error: result.error, missingEnv: result.missingEnv });
    }
    return res.json({ ...result.body, userId: user?.id ?? null });
  }
);

router.get(
  "/api/wtf-subdomains/registrar/status/:address",
  isAuthenticated,
  async (req, res) => {
    const address = String(req.params.address || "").trim();
    if (!/^(tz[1-3]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }
    try {
      res.json(await getWalletRegistrarStatus(address));
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to fetch status",
      });
    }
  }
);

router.get("/api/wtf-subdomains/hack-tez/config", isAuthenticated, (_req, res) => {
  res.json({
    registrationUrl:
      process.env.HACK_TEZ_REGISTRATION_URL?.trim() || "https://hacktez.com",
    attribution: {
      creatorUsername: "skllzrmy",
      creatorProfilePath: "/user/skllzrmy",
      productName: "hack.tez",
      orgName: "FAFOlab",
    },
  });
});

router.get("/api/wtf-subdomains/chat/config", isAuthenticated, (_req, res) => {
  res.json(getDomainChatConfig());
});

router.post(
  "/api/admin/users/:id/wtf-subdomains",
  requirePermission("manage_users", "manage_rewards", "manage_side_quests", "manage_challenges"),
  async (req, res) => {
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid subdomain grant payload" });

    const actor = req.user as any;
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const result = await grantWtfSubdomainToUser({
      userId: targetUserId,
      label: parsed.data.label,
      walletAddress: parsed.data.walletAddress,
      sourceType: parsed.data.sourceType ?? "admin",
      sourceId: parsed.data.sourceId,
      grantedBy: actor?.id ?? null,
      notes: parsed.data.notes,
    });

    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.status(result.created ? 201 : 200).json(result.grant);
  }
);

router.patch(
  "/api/admin/wtf-subdomains/:id/status",
  requirePermission("manage_users", "manage_rewards", "manage_side_quests", "manage_challenges"),
  async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid status payload" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid grant id" });
    }

    const updated = await updateWtfSubdomainGrantStatus(id, parsed.data);

    if (!updated) return res.status(404).json({ error: "Grant not found" });
    res.json(updated);
  }
);

export default router;
