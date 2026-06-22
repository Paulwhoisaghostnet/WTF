import { Router } from "express";
import { requirePermission } from "../auth/passport";
import { db } from "../db";
import { desktopAppSettings } from "@shared/schema";
import {
  createInstallKeyMaterial,
  getDesktopAppRegistrations,
  isDesktopAppKey,
  type DesktopAppDocStatus,
} from "../lib/desktop-apps";

const router = Router();

router.get("/api/apps/desktop", async (_req, res) => {
  try {
    const { apps, list } = await getDesktopAppRegistrations();
    res.json({ apps, list });
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
      const { apps, list } = await getDesktopAppRegistrations();
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
      const docStatus = req.body?.docStatus as DesktopAppDocStatus | undefined;
      const docsUpdatedAtInput = req.body?.docsUpdatedAt;
      const issueInstallKey = Boolean(req.body?.issueInstallKey);
      const revokeInstallKey = Boolean(req.body?.revokeInstallKey);
      const user = req.user as any;

      if (!isDesktopAppKey(appKey)) {
        return res.status(400).json({ error: "Invalid desktop app key" });
      }
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      if (
        docStatus !== undefined &&
        !["pending", "registered", "stale", "revoked"].includes(docStatus)
      ) {
        return res.status(400).json({ error: "docStatus must be pending, registered, stale, or revoked" });
      }

      const now = new Date();
      const normalizedDocsUpdatedAt =
        typeof docsUpdatedAtInput === "string" && docsUpdatedAtInput.trim()
          ? new Date(docsUpdatedAtInput)
          : issueInstallKey || enabled
            ? now
            : null;
      if (normalizedDocsUpdatedAt && Number.isNaN(normalizedDocsUpdatedAt.getTime())) {
        return res.status(400).json({ error: "docsUpdatedAt must be an ISO date string" });
      }
      const resolvedDocStatus: DesktopAppDocStatus =
        docStatus ?? (enabled ? "registered" : "pending");
      const docsExpiresAt =
        normalizedDocsUpdatedAt && resolvedDocStatus === "registered"
          ? new Date(normalizedDocsUpdatedAt.getTime() + 24 * 60 * 60 * 1000)
          : null;
      const installKeyMaterial = issueInstallKey ? createInstallKeyMaterial(appKey) : null;

      await db
        .insert(desktopAppSettings)
        .values({
          appKey,
          enabled,
          docStatus: issueInstallKey ? "registered" : resolvedDocStatus,
          docRegistryVersion: "1",
          docsUpdatedAt: normalizedDocsUpdatedAt,
          docsExpiresAt,
          installKeyHash: installKeyMaterial?.hash ?? null,
          installKeyPrefix: installKeyMaterial?.prefix ?? null,
          installKeyIssuedAt: installKeyMaterial ? now : null,
          installKeyExpiresAt: installKeyMaterial ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
          installKeyRevokedAt: revokeInstallKey ? now : null,
          registeredBy: user.id,
          registeredAt: now,
          updatedBy: user.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: desktopAppSettings.appKey,
          set: {
            enabled,
            docStatus: issueInstallKey ? "registered" : resolvedDocStatus,
            docRegistryVersion: "1",
            docsUpdatedAt: normalizedDocsUpdatedAt,
            docsExpiresAt,
            installKeyHash: installKeyMaterial?.hash ?? undefined,
            installKeyPrefix: installKeyMaterial?.prefix ?? undefined,
            installKeyIssuedAt: installKeyMaterial ? now : undefined,
            installKeyExpiresAt: installKeyMaterial ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : undefined,
            installKeyRevokedAt: revokeInstallKey ? now : undefined,
            registeredBy: user.id,
            registeredAt: now,
            updatedBy: user.id,
            updatedAt: now,
          },
        });

      const { apps, list } = await getDesktopAppRegistrations();
      res.json({
        ok: true,
        apps,
        list,
        installKey: installKeyMaterial?.key ?? null,
      });
    } catch (err) {
      console.error("[desktop-apps] failed to update app config:", err);
      res.status(500).json({ error: "Failed to update desktop app config" });
    }
  }
);

export default router;
