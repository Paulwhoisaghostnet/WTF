import { Router } from "express";
import { z } from "zod";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { tlsAllowHandler } from "../features/wtf-sites/host-router";
import { WTF_USER_SITE_MAX_PAGE_HTML_BYTES } from "@shared/wtf-user-sites";
import {
  claimUserSite,
  deleteUserSitePage,
  getUserSiteState,
  listAdminUserSites,
  publishUserSite,
  restoreUserSite,
  rollbackUserSite,
  saveUserSitePage,
  suspendUserSite,
  updateUserSiteAssets,
  WtfUserSiteError,
} from "../features/wtf-sites/service";
import { getPinRegistrySummaryForUser } from "../features/ipfs-pinning/service";

const router = Router();

const pageSchema = z.object({
  slug: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(200),
  html: z.string().max(WTF_USER_SITE_MAX_PAGE_HTML_BYTES),
});

const assetsSchema = z.object({
  mediaIds: z.array(z.coerce.number().int().positive()).max(200).default([]),
});

const rollbackSchema = z.object({
  versionId: z.coerce.number().int().positive(),
});

const suspendSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

function handleSiteError(res: any, err: unknown) {
  if (err instanceof WtfUserSiteError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error("[wtf-sites] route error:", err);
  return res.status(500).json({ error: "Failed to process wtfOS user site request" });
}

router.get("/internal/tls/allow", async (req, res) => {
  await tlsAllowHandler(req, res);
});

router.get("/api/wtf-sites/my", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const state = await getUserSiteState(user.id);
    res.json({ ...state, pinRegistry: await getPinRegistrySummaryForUser(user.id) });
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.post("/api/wtf-sites/claim", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    res.status(201).json(await claimUserSite(user.id));
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.put("/api/wtf-sites/pages/:slug", isAuthenticated, async (req, res) => {
  const slug = String(req.params.slug || "");
  const parsed = pageSchema.safeParse({ ...req.body, slug });
  if (!parsed.success) return res.status(400).json({ error: "Invalid page payload" });
  try {
    const user = req.user as { id: number };
    res.json(
      await saveUserSitePage({
        userId: user.id,
        slug: parsed.data.slug ?? slug,
        title: parsed.data.title,
        html: parsed.data.html,
      })
    );
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.post("/api/wtf-sites/pages", isAuthenticated, async (req, res) => {
  const parsed = pageSchema.extend({ slug: z.string().trim().min(1).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid page payload" });
  try {
    const user = req.user as { id: number };
    res.status(201).json(
      await saveUserSitePage({
        userId: user.id,
        slug: parsed.data.slug,
        title: parsed.data.title,
        html: parsed.data.html,
      })
    );
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.delete("/api/wtf-sites/pages/:slug", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    res.json(await deleteUserSitePage(user.id, String(req.params.slug || "")));
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.put("/api/wtf-sites/assets", isAuthenticated, async (req, res) => {
  const parsed = assetsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid asset payload" });
  try {
    const user = req.user as { id: number };
    res.json(await updateUserSiteAssets(user.id, parsed.data.mediaIds));
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.post("/api/wtf-sites/publish", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    res.json(await publishUserSite(user.id));
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.post("/api/wtf-sites/rollback", isAuthenticated, async (req, res) => {
  const parsed = rollbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid rollback payload" });
  try {
    const user = req.user as { id: number };
    res.json(await rollbackUserSite(user.id, parsed.data.versionId));
  } catch (err) {
    handleSiteError(res, err);
  }
});

router.get(
  "/api/admin/wtf-sites",
  requirePermission("manage_users", "manage_roles"),
  async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      res.json(await listAdminUserSites(limit));
    } catch (err) {
      handleSiteError(res, err);
    }
  }
);

router.patch(
  "/api/admin/wtf-sites/:id/suspend",
  requirePermission("manage_users", "manage_roles"),
  async (req, res) => {
    const parsed = suspendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid suspension payload" });
    try {
      const actor = req.user as { id?: number } | undefined;
      const siteId = Number(req.params.id);
      if (!Number.isInteger(siteId) || siteId <= 0) {
        return res.status(400).json({ error: "Invalid site id" });
      }
      res.json(await suspendUserSite(siteId, actor?.id ?? null, parsed.data.reason));
    } catch (err) {
      handleSiteError(res, err);
    }
  }
);

router.patch(
  "/api/admin/wtf-sites/:id/restore",
  requirePermission("manage_users", "manage_roles"),
  async (req, res) => {
    try {
      const actor = req.user as { id?: number } | undefined;
      const siteId = Number(req.params.id);
      if (!Number.isInteger(siteId) || siteId <= 0) {
        return res.status(400).json({ error: "Invalid site id" });
      }
      res.json(await restoreUserSite(siteId, actor?.id ?? null));
    } catch (err) {
      handleSiteError(res, err);
    }
  }
);

export default router;
