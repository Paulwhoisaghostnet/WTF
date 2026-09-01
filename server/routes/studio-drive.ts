/**
 * Per-user Studio Drive routes.
 *
 * Lets each authenticated member connect their own Google Drive account
 * for new Studio projects and My Media upload backups. Mirrors the admin
 * flow in `studio-admin.ts`, but keys the connection to the member.
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
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { studioProjects, userMediaLibrary } from "@shared/schema";
import { isAuthenticated } from "../auth/passport";
import {
  buildUserConnectUrl,
  completeUserConnect,
  disconnectUserDrive,
  getUserDriveStatus,
  hasDedicatedUserRedirect,
  isUserDriveConfigured,
  refreshUserAppUsage,
} from "../lib/studio/user-drive";
import { isStudioCryptoConfigured } from "../lib/studio/crypto";
import { GoogleDriveApiError } from "../lib/studio/drivers/google-drive-client";

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
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const status = await getUserDriveStatus(user.id);

      // Also surface how many projects the user currently owns that
      // depend on this Drive — useful for the disconnect warning on
      // the client ("5 projects will lose their files until you
      // reconnect").
      let projectCount = 0;
      let backedUpMediaCount = 0;
      if (status.connected) {
        const [projects, mediaBackups] = await Promise.all([
          db
            .select({ id: studioProjects.id })
            .from(studioProjects)
            .where(
              and(
                eq(studioProjects.ownerUserId, user.id),
                eq(studioProjects.storageBackend, "google_drive")
              )
            ),
          db
            .select({ id: userMediaLibrary.id })
            .from(userMediaLibrary)
            .where(
              and(
                eq(userMediaLibrary.ownerUserId, user.id),
                sql`${userMediaLibrary.metadata}->'cloudBackup'->>'provider' = 'google_drive'`,
                sql`${userMediaLibrary.metadata}->'cloudBackup'->>'status' = 'ready'`
              )
            ),
        ]);
        projectCount = projects.length;
        backedUpMediaCount = mediaBackups.length;
      }

      res.json({
        ok: true,
        envConfigured: isUserDriveConfigured(),
        cryptoConfigured: isStudioCryptoConfigured(),
        canConnect: isUserDriveConfigured(),
        ...status,
        dependentProjectCount: projectCount,
        backedUpMediaCount,
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
          )}</code>.<br><br>You can close this tab and return to wtfOS. New Studio projects can use your Drive, and new My Media uploads will receive an account-owned backup.`,
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
// Path kept as `/refresh-quota` for URL stability; the payload is
// `appUsage` (wtfOS's footprint in the user's Drive) — the full Drive
// quota isn't reachable under the `drive.file` scope and we
// deliberately don't ask for a broader one.

router.post(
  "/api/studio/drive/refresh-quota",
  isAuthenticated,
  async (req, res) => {
    const user = req.user as { id: number };
    try {
      const appUsage = await refreshUserAppUsage(user.id);
      if (!appUsage) {
        // No row at all — user hasn't connected their personal Drive.
        return res.status(404).json({
          error: "No Google Drive is connected to your account.",
          code: "not_connected",
        });
      }
      res.json({ ok: true, appUsage });
    } catch (err) {
      // Surface the REAL cause — an earlier handler swallowed every
      // error with `.catch(() => null)` and returned the misleading
      // "Drive not connected" 400, so operators had no idea when a
      // refresh token got revoked or the API briefly 5xx'd.
      console.error(
        "[studio-drive] drive/refresh-quota error (user=%s):",
        user?.id,
        err
      );

      if (err instanceof GoogleDriveApiError) {
        // Google signals a dead refresh token via HTTP 400 with body
        // `{"error":"invalid_grant", ...}` at the token endpoint, or
        // via 401 at the Drive endpoint.  Both mean: re-consent.
        const body = (err.body || "").toString();
        const isInvalidGrant =
          /invalid_grant/i.test(body) || /invalid_grant/i.test(err.code ?? "");
        if (err.status === 401 || isInvalidGrant) {
          return res.status(401).json({
            error:
              "Your Google Drive authorization has expired or was revoked. " +
              "Disconnect and reconnect your Drive to continue.",
            code: "reauth_required",
          });
        }
        if (err.status === 403) {
          return res.status(403).json({
            error:
              "Google Drive rejected the request (insufficient scope or " +
              "permission). Try disconnecting and reconnecting your Drive.",
            code: "drive_forbidden",
          });
        }
        return res.status(502).json({
          error: `Google Drive returned an error (HTTP ${err.status}).`,
          code: "drive_api_error",
        });
      }

      res.status(500).json({
        error: "Failed to refresh usage. Check server logs for details.",
        code: "internal",
      });
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
