import { Router } from "express";
import { requirePermission } from "../auth/passport";
import { db } from "../db";
import { desktopAppSettings } from "@shared/schema";
import { DESKTOP_APPS } from "@shared/types";
import {
  getDesktopAppConfig,
  isDesktopAppKey,
} from "../lib/desktop-apps";

const router = Router();

router.get("/api/apps/desktop", async (_req, res) => {
  try {
    const apps = await getDesktopAppConfig();
    res.json({ apps });
  } catch (err) {
    console.error("[desktop-apps] failed to fetch app config:", err);
    res.status(500).json({ error: "Failed to fetch desktop app config" });
  }
});

router.get(
  "/api/admin/apps/desktop",
  requirePermission("manage_desktop_apps"),
  async (_req, res) => {
    try {
      const apps = await getDesktopAppConfig();
      const list = DESKTOP_APPS.map((key) => ({ key, enabled: apps[key] }));
      res.json({ apps, list });
    } catch (err) {
      console.error("[desktop-apps] failed to fetch admin app config:", err);
      res.status(500).json({ error: "Failed to fetch desktop app config" });
    }
  }
);

router.put(
  "/api/admin/apps/desktop/:appKey",
  requirePermission("manage_desktop_apps"),
  async (req, res) => {
    try {
      const appKey = String(req.params.appKey || "").trim();
      const enabled = req.body?.enabled;
      const user = req.user as any;

      if (!isDesktopAppKey(appKey)) {
        return res.status(400).json({ error: "Invalid desktop app key" });
      }
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      await db
        .insert(desktopAppSettings)
        .values({
          appKey,
          enabled,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: desktopAppSettings.appKey,
          set: {
            enabled,
            updatedBy: user.id,
            updatedAt: new Date(),
          },
        });

      const apps = await getDesktopAppConfig();
      res.json({ ok: true, apps });
    } catch (err) {
      console.error("[desktop-apps] failed to update app config:", err);
      res.status(500).json({ error: "Failed to update desktop app config" });
    }
  }
);

export default router;
