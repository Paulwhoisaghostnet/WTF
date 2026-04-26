import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { wtfSubdomainGrants } from "@shared/schema";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  grantWtfSubdomainToUser,
  listWtfSubdomainGrants,
} from "../lib/wtf-subdomain-grants";

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

    const now = new Date();
    const [updated] = await db
      .update(wtfSubdomainGrants)
      .set({
        status: parsed.data.status,
        opHash: parsed.data.opHash ?? undefined,
        notes: parsed.data.notes ?? undefined,
        updatedAt: now,
        provisionedAt: parsed.data.status === "provisioned" ? now : undefined,
        revokedAt: parsed.data.status === "revoked" ? now : undefined,
      })
      .where(eq(wtfSubdomainGrants.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Grant not found" });
    res.json(updated);
  }
);

export default router;
