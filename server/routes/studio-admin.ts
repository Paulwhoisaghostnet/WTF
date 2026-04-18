/**
 * Admin routes for the platform Google Drive connection.
 *
 * Only users with the `manage_studio` permission can use these.  The flow:
 *
 *   1. Admin visits the admin panel and clicks "Connect platform Drive".
 *   2. Client POSTs to `/api/studio/admin/drive/start` to obtain a
 *      signed state token and the Google authorize URL.
 *   3. Admin signs in as `wtfgameshowemail@gmail.com`, consents to the
 *      requested scopes, and Google redirects back to `GET /callback`
 *      with `?code=...&state=...`.
 *   4. This route exchanges the code, seals the refresh token, and
 *      upserts `studio_platform_storage`.
 *   5. Admin can later GET `/status` to see connection health / quota
 *      and POST `/disconnect` to revoke the refresh token.
 */

import { Router } from "express";
import { randomBytes } from "crypto";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  buildConnectUrl,
  completePlatformConnect,
  disconnectPlatformDrive,
  getPlatformDriveStatus,
  isGoogleOAuthConfigured,
  isPlatformDriveConfigured,
  refreshPlatformQuota,
  setPlatformRootFolder,
} from "../lib/studio/platform-drive";
import { isStudioCryptoConfigured } from "../lib/studio/crypto";

interface StudioAdminSession {
  driveState?: { token: string; expiresAt: number };
}

declare module "express-session" {
  interface SessionData {
    studioAdmin?: StudioAdminSession;
  }
}

const router = Router();

/* ── GET /api/studio/admin/drive/status ─────────────────── */

router.get(
  "/api/studio/admin/drive/status",
  isAuthenticated,
  requirePermission("manage_studio"),
  async (_req, res) => {
    try {
      const status = await getPlatformDriveStatus();
      res.json({
        ok: true,
        envConfigured: isGoogleOAuthConfigured(),
        cryptoConfigured: isStudioCryptoConfigured(),
        canConnect: isPlatformDriveConfigured(),
        ...status,
      });
    } catch (err) {
      console.error("[studio-admin] status error:", err);
      res.status(500).json({ error: "Failed to load platform Drive status" });
    }
  }
);

/* ── POST /api/studio/admin/drive/start ─────────────────── */

router.post(
  "/api/studio/admin/drive/start",
  isAuthenticated,
  requirePermission("manage_studio"),
  async (req, res) => {
    try {
      if (!isPlatformDriveConfigured()) {
        return res.status(400).json({
          error:
            "Google OAuth environment is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, and STUDIO_CRYPTO_KEY.",
        });
      }
      const token = randomBytes(24).toString("base64url");
      const session = (req.session as unknown as {
        studioAdmin?: StudioAdminSession;
      }) ?? {};
      session.studioAdmin = {
        driveState: { token, expiresAt: Date.now() + 10 * 60 * 1000 },
      };
      (req.session as unknown as { studioAdmin?: StudioAdminSession }).studioAdmin =
        session.studioAdmin;
      const loginHint =
        typeof req.body?.loginHint === "string" && req.body.loginHint.trim()
          ? String(req.body.loginHint).trim()
          : undefined;
      const authorizeUrl = buildConnectUrl(token, loginHint);
      res.json({ ok: true, authorizeUrl });
    } catch (err) {
      console.error("[studio-admin] drive/start error:", err);
      res.status(500).json({ error: "Failed to start OAuth flow" });
    }
  }
);

/* ── GET /api/studio/admin/drive/callback ───────────────── */

router.get(
  "/api/studio/admin/drive/callback",
  isAuthenticated,
  requirePermission("manage_studio"),
  async (req, res) => {
    try {
      const code = String(req.query.code ?? "").trim();
      const state = String(req.query.state ?? "").trim();
      if (!code || !state) {
        return res
          .status(400)
          .send(renderHtml("Missing OAuth parameters.", true));
      }

      const pending = (req.session as unknown as {
        studioAdmin?: StudioAdminSession;
      })?.studioAdmin?.driveState;
      if (
        !pending ||
        pending.token !== state ||
        pending.expiresAt < Date.now()
      ) {
        return res
          .status(400)
          .send(renderHtml("State token mismatch or expired.", true));
      }

      const user = req.user as { id: number };
      const row = await completePlatformConnect({
        code,
        connectedByUserId: user.id,
      });
      // Clear the pending state so it cannot be replayed.
      const session = req.session as unknown as {
        studioAdmin?: StudioAdminSession;
      };
      if (session.studioAdmin) {
        delete session.studioAdmin.driveState;
      }

      res.send(
        renderHtml(
          `Platform Drive connected as <code>${escapeHtml(
            row.accountEmail ?? "(email unknown)"
          )}</code>.<br><br>You can close this tab and return to the Admin panel.`,
          false
        )
      );
    } catch (err) {
      console.error("[studio-admin] drive/callback error:", err);
      res
        .status(500)
        .send(renderHtml(`OAuth exchange failed: ${(err as Error).message}`, true));
    }
  }
);

/* ── POST /api/studio/admin/drive/disconnect ────────────── */

router.post(
  "/api/studio/admin/drive/disconnect",
  isAuthenticated,
  requirePermission("manage_studio"),
  async (_req, res) => {
    try {
      await disconnectPlatformDrive();
      res.json({ ok: true });
    } catch (err) {
      console.error("[studio-admin] drive/disconnect error:", err);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  }
);

/* ── POST /api/studio/admin/drive/refresh-quota ─────────── */

router.post(
  "/api/studio/admin/drive/refresh-quota",
  isAuthenticated,
  requirePermission("manage_studio"),
  async (_req, res) => {
    try {
      const quota = await refreshPlatformQuota();
      if (!quota) {
        return res.status(400).json({ error: "Drive not connected" });
      }
      res.json({ ok: true, quota });
    } catch (err) {
      console.error("[studio-admin] drive/refresh-quota error:", err);
      res.status(500).json({ error: "Failed to refresh quota" });
    }
  }
);

/* ── POST /api/studio/admin/drive/root-folder ───────────── */

router.post(
  "/api/studio/admin/drive/root-folder",
  isAuthenticated,
  requirePermission("manage_studio"),
  async (req, res) => {
    try {
      const raw = req.body?.rootFolderId;
      const rootFolderId =
        typeof raw === "string" && raw.trim() ? raw.trim() : null;
      await setPlatformRootFolder(rootFolderId);
      res.json({ ok: true, rootFolderId });
    } catch (err) {
      console.error("[studio-admin] drive/root-folder error:", err);
      res.status(500).json({ error: "Failed to update root folder" });
    }
  }
);

/* ── Helpers ────────────────────────────────────────────── */

function renderHtml(body: string, isError: boolean): string {
  const colour = isError ? "#c03027" : "#0b5c12";
  return (
    `<!doctype html><html><head><meta charset="utf-8" />` +
    `<title>WTF Studio Drive Setup</title>` +
    `<style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f2f2f2;padding:40px;}
    .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #ddd;padding:24px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.08);}
    h1{color:${colour};font-size:20px;margin-top:0;}
    code{background:#eee;padding:1px 6px;border-radius:3px;}
    </style></head><body><div class="card">` +
    `<h1>${isError ? "Drive connection failed" : "Drive connection ready"}</h1>` +
    `<p>${body}</p></div></body></html>`
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default router;
