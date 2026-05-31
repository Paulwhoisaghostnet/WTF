import type { Router } from "express";
import { isAuthenticated } from "../../../auth/passport";
import { hasPermission } from "../../../lib/permissions";
import { canUseWAdminControls } from "../admin-access";
import {
  listDigestHandles,
  normalizeDigestHandle,
  removeDigestHandle,
  replaceDigestHandles,
  upsertDigestHandle,
} from "./handles";
import { buildDigestTimelinePayload } from "./timeline";
import { isDigestScraperConfigured } from "./scraper-env";

async function canUseGlobalAdmin(user: any): Promise<boolean> {
  if (!user?.role) return false;
  return hasPermission(user.role, "access_admin_panel");
}

const DIGEST_DISABLED = {
  error: "W is read-only Tezos digest mode. Native X actions and DMs are disabled.",
  mode: "digest",
};

export function registerWDigestRoutes(router: Router): void {
  router.get("/api/w/capabilities", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    return res.json({
      mode: "digest",
      canReadTimeline: true,
      canReplyInline: false,
      canPost: false,
      canLike: false,
      canRepost: false,
      canQuote: false,
      canDm: false,
      canUseAdminControls: await canUseWAdminControls(user),
      groupchatIds: [],
      twitterVerified: false,
      twitterOAuth2Connected: false,
    });
  });

  const disabledPaths = [
    "/api/w/groupchat",
    "/api/w/groupchats",
    "/api/w/user-dms",
    "/api/w/direct-messages",
    "/api/w/post",
    "/api/w/reply",
    "/api/w/like",
    "/api/w/repost",
    "/api/w/quote",
    "/api/w/media",
  ];
  for (const path of disabledPaths) {
    router.all(path, isAuthenticated, (_req, res) => res.status(410).json(DIGEST_DISABLED));
  }
  router.use("/api/w/user-dms", isAuthenticated, (_req, res) =>
    res.status(410).json(DIGEST_DISABLED)
  );
  router.all("/api/w/admin/stream-rules", isAuthenticated, (_req, res) =>
    res.status(410).json(DIGEST_DISABLED)
  );
  router.all("/api/w/admin/groupchat", isAuthenticated, (_req, res) =>
    res.status(410).json(DIGEST_DISABLED)
  );

  router.get("/api/w/timeline", isAuthenticated, async (_req, res) => {
    try {
      const payload = await buildDigestTimelinePayload();
      return res.json(payload);
    } catch (err: any) {
      console.error("[w-digest] timeline failed:", err);
      return res.status(500).json({ error: "Failed to load W digest timeline" });
    }
  });

  router.get("/api/w/admin/digest-handles", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!(await canUseWAdminControls(user))) {
        return res.status(403).json({ error: "W admin required" });
      }
      const handles = await listDigestHandles();
      return res.json({
        handles,
        scraperConfigured: isDigestScraperConfigured(),
      });
    } catch (err: any) {
      console.error("[w-digest] admin list failed:", err);
      return res.status(500).json({ error: "Failed to load digest handles" });
    }
  });

  router.put("/api/w/admin/digest-handles", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!(await canUseWAdminControls(user))) {
        return res.status(403).json({ error: "W admin required" });
      }

      if (Array.isArray(req.body?.handles)) {
        const handles = await replaceDigestHandles(
          req.body.handles.map((h: unknown) => String(h || ""))
        );
        return res.json({ handles, scraperConfigured: isDigestScraperConfigured() });
      }

      const handle = normalizeDigestHandle(String(req.body?.handle || ""));
      if (!handle) return res.status(400).json({ error: "Valid handle required" });

      const row = await upsertDigestHandle({
        handle,
        enabled: req.body?.enabled !== false,
        notes: typeof req.body?.notes === "string" ? req.body.notes : null,
      });
      return res.json({ handle: row, scraperConfigured: isDigestScraperConfigured() });
    } catch (err: any) {
      const message = String(err?.message || err);
      if (message === "at_least_one_handle_required") {
        return res.status(400).json({ error: "At least one handle is required" });
      }
      console.error("[w-digest] admin put failed:", err);
      return res.status(500).json({ error: "Failed to update digest handles" });
    }
  });

  router.delete("/api/w/admin/digest-handles/:handle", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!(await canUseWAdminControls(user))) {
        return res.status(403).json({ error: "W admin required" });
      }
      await removeDigestHandle(String(req.params.handle || ""));
      const handles = await listDigestHandles();
      return res.json({ handles, scraperConfigured: isDigestScraperConfigured() });
    } catch (err: any) {
      console.error("[w-digest] admin delete failed:", err);
      return res.status(500).json({ error: "Failed to remove digest handle" });
    }
  });

}

export function registerAdminWDigestRoutes(router: Router): void {
  router.get("/api/admin/w-digest-handles", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!(await canUseGlobalAdmin(user))) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const handles = await listDigestHandles();
      return res.json({
        handles,
        scraperConfigured: isDigestScraperConfigured(),
      });
    } catch (err: any) {
      console.error("[w-digest] global admin list failed:", err);
      return res.status(500).json({ error: "Failed to load digest handles" });
    }
  });

  router.put("/api/admin/w-digest-handles", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!(await canUseGlobalAdmin(user))) {
        return res.status(403).json({ error: "Admin access required" });
      }
      if (!Array.isArray(req.body?.handles)) {
        return res.status(400).json({ error: "handles array required" });
      }
      const handles = await replaceDigestHandles(
        req.body.handles.map((h: unknown) => String(h || ""))
      );
      return res.json({ handles, scraperConfigured: isDigestScraperConfigured() });
    } catch (err: any) {
      const message = String(err?.message || err);
      if (message === "at_least_one_handle_required") {
        return res.status(400).json({ error: "At least one handle is required" });
      }
      console.error("[w-digest] global admin put failed:", err);
      return res.status(500).json({ error: "Failed to update digest handles" });
    }
  });
}
