/**
 * Per-user Studio Drive routes.
 *
 * Lets each Studio member connect their own Google Drive account so
 * projects they create are backed by their personal storage instead of
 * the platform pool.  Mirrors the admin flow in `studio-admin.ts` but
 * keyed by the authenticated user and gated by `create_studio_projects`
 * (the permission granted at Contestant role and above).
 *
 * Flow:
 *   1. Client POSTs /api/studio/drive/start → authorize URL + state
 *   2. User signs into their Google account, consents to Drive scope
 *   3. Google redirects to /api/studio/drive/callback with ?code&state
 *   4. Handler exchanges code, seals refresh token, upserts row
 *   5. /status reports connection / quota health, /disconnect revokes
 */

import { Router } from "express";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { studioProjects } from "@shared/schema";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  buildUserConnectUrl,
  completeUserConnect,
  disconnectUserDrive,
  getUserDriveStatus,
  hasDedicatedUserRedirect,
  isUserDriveConfigured,
  refreshUserQuota,
} from "../lib/studio/user-drive";
import { isStudioCryptoConfigured } from "../lib/studio/crypto";

interface StudioUserSession {
  driveState?: { token: string; expiresAt: number };
}

declare module "express-session" {
  interface SessionData {
    studioUser?: StudioUserSession;
  }
}

const router = Router();

/* ── GET /api/studio/drive/status ───────────────────────── */

router.get(
  "/api/studio/drive/status",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const status = await getUserDriveStatus(user.id);

      // Also surface how many projects the user currently owns that
      // depend on this Drive — useful for the disconnect warning on
      // the client ("5 projects will lose their files until you
      // reconnect").
      let projectCount = 0;
      if (status.connected) {
        const [row] = await db
          .select({ count: studioProjects.id })
          .from(studioProjects)
          .where(
            and(
              eq(studioProjects.ownerUserId, user.id),
              eq(studioProjects.storageBackend, "google_drive")
            )
          );
        projectCount = row ? 1 : 0;

        const projects = await db
          .select({ id: studioProjects.id })
          .from(studioProjects)
          .where(
            and(
              eq(studioProjects.ownerUserId, user.id),
              eq(studioProjects.storageBackend, "google_drive")
            )
          );
        projectCount = projects.length;
      }

      res.json({
        ok: true,
        envConfigured: isUserDriveConfigured(),
        cryptoConfigured: isStudioCryptoConfigured(),
        canConnect: isUserDriveConfigured(),
        ...status,
        dependentProjectCount: projectCount,
      });
    } catch (err) {
      console.error("[studio-drive] status error:", err);
      res.status(500).json({ error: "Failed to load Drive status" });
    }
  }
);

/* ── POST /api/studio/drive/start ───────────────────────── */

router.post(
  "/api/studio/drive/start",
  isAuthenticated,
  requirePermission("create_studio_projects"),
  async (req, res) => {
    try {
      if (!isUserDriveConfigured()) {
        return res.status(400).json({
          error:
            "Google OAuth isn't configured on this deployment yet. Ask an admin to set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / STUDIO_CRYPTO_KEY.",
        });
      }
      if (!hasDedicatedUserRedirect()) {
        // Not fatal — the flow still works off the platform redirect
        // URI — but we log a warning so operators notice the mixed
        // routing in prod.  The redirect URL below still resolves
        // through whichever handler is wired up to that path.
        console.warn(
          "[studio-drive] No GOOGLE_OAUTH_USER_REDIRECT_URI set — falling back to the platform redirect URI for user OAuth."
        );
      }

      const token = randomBytes(24).toString("base64url");
      const session = (req.session as unknown as {
        studioUser?: StudioUserSession;
      }) ?? {};
      session.studioUser = {
        driveState: { token, expiresAt: Date.now() + 10 * 60 * 1000 },
      };
      (req.session as unknown as { studioUser?: StudioUserSession }).studioUser =
        session.studioUser;

      const loginHint =
        typeof req.body?.loginHint === "string" && req.body.loginHint.trim()
          ? String(req.body.loginHint).trim()
          : undefined;
      const authorizeUrl = buildUserConnectUrl(token, loginHint);
      res.json({ ok: true, authorizeUrl });
    } catch (err) {
      console.error("[studio-drive] drive/start error:", err);
      res.status(500).json({ error: "Failed to start OAuth flow" });
    }
  }
);

/* ── GET /api/studio/drive/callback ─────────────────────── */

router.get(
  "/api/studio/drive/callback",
  isAuthenticated,
  requirePermission("create_studio_projects"),
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
        studioUser?: StudioUserSession;
      })?.studioUser?.driveState;
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
      const row = await completeUserConnect({
        userId: user.id,
        code,
      });
      const session = req.session as unknown as {
        studioUser?: StudioUserSession;
      };
      if (session.studioUser) {
        delete session.studioUser.driveState;
      }

      res.send(
        renderHtml(
          `Your Google Drive is connected as <code>${escapeHtml(
            row.accountEmail ?? "(email unknown)"
          )}</code>.<br><br>You can close this tab and return to Studio — new projects you create will default to your Drive.`,
          false
        )
      );
    } catch (err) {
      console.error("[studio-drive] drive/callback error:", err);
      res
        .status(500)
        .send(renderHtml(`OAuth exchange failed: ${(err as Error).message}`, true));
    }
  }
);

/* ── POST /api/studio/drive/disconnect ──────────────────── */

router.post(
  "/api/studio/drive/disconnect",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      await disconnectUserDrive(user.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[studio-drive] drive/disconnect error:", err);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  }
);

/* ── POST /api/studio/drive/refresh-quota ───────────────── */

router.post(
  "/api/studio/drive/refresh-quota",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const quota = await refreshUserQuota(user.id);
      if (!quota) {
        return res.status(400).json({ error: "Drive not connected" });
      }
      res.json({ ok: true, quota });
    } catch (err) {
      console.error("[studio-drive] drive/refresh-quota error:", err);
      res.status(500).json({ error: "Failed to refresh quota" });
    }
  }
);

/* ── Helpers ────────────────────────────────────────────── */

function renderHtml(body: string, isError: boolean): string {
  const colour = isError ? "#c03027" : "#0b5c12";
  return (
    `<!doctype html><html><head><meta charset="utf-8" />` +
    `<title>WTF Studio Drive</title>` +
    `<style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f2f2f2;padding:40px;}
    .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #ddd;padding:24px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.08);}
    h1{color:${colour};font-size:20px;margin-top:0;}
    code{background:#eee;padding:1px 6px;border-radius:3px;}
    </style></head><body><div class="card">` +
    `<h1>${isError ? "Drive connection failed" : "Drive connected"}</h1>` +
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
