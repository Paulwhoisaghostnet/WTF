import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { mastodonAccounts, mastodonPreferences } from "@shared/schema";
import {
  encryptToken,
  decryptToken,
  validateInstanceUrl,
} from "../features/mastodon/mastodon-auth";
import { verifyCredentials } from "../features/mastodon/mastodon-client";
import { getTimelineForUser } from "../features/mastodon/mastodon-timeline";
import { logSystemEvent } from "../lib/system-log";

const router = Router();

const linkSchema = z.object({
  instanceUrl: z.string().trim().min(1),
  accessToken: z.string().trim().min(1),
});

const prefsSchema = z.object({
  showInFeed: z.boolean().optional(),
  autoCrosspost: z.boolean().optional(),
});

function userId(req: any): number {
  return Number(req.user?.id);
}

router.get("/api/mastodon/account", isAuthenticated, async (req, res) => {
  try {
    const [account] = await db
      .select({
        id: mastodonAccounts.id,
        instanceUrl: mastodonAccounts.instanceUrl,
        handle: mastodonAccounts.handle,
        displayName: mastodonAccounts.displayName,
        linkedAt: mastodonAccounts.linkedAt,
      })
      .from(mastodonAccounts)
      .where(eq(mastodonAccounts.userId, userId(req)))
      .limit(1);
    res.json(account ?? null);
  } catch (err) {
    console.error("[mastodon] account fetch failed", err);
    res.status(500).json({ error: "Failed to fetch Mastodon account" });
  }
});

router.post("/api/mastodon/link", isAuthenticated, async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
  }

  try {
    const instanceUrl = validateInstanceUrl(parsed.data.instanceUrl);
    const creds = await verifyCredentials(instanceUrl, parsed.data.accessToken);

    const enc = encryptToken(parsed.data.accessToken);
    const existing = await db
      .select({ id: mastodonAccounts.id })
      .from(mastodonAccounts)
      .where(eq(mastodonAccounts.userId, userId(req)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(mastodonAccounts)
        .set({
          instanceUrl,
          accountId: creds.id,
          handle: `${creds.username}@${new URL(instanceUrl).hostname}`,
          displayName: creds.display_name,
          accessTokenEnc: enc,
          linkedAt: new Date(),
        })
        .where(eq(mastodonAccounts.userId, userId(req)));
    } else {
      await db.insert(mastodonAccounts).values({
        userId: userId(req),
        instanceUrl,
        accountId: creds.id,
        handle: `${creds.username}@${new URL(instanceUrl).hostname}`,
        displayName: creds.display_name,
        accessTokenEnc: enc,
      });
    }

    const handle = `${creds.username}@${new URL(instanceUrl).hostname}`;

    logSystemEvent({
      source: "server",
      eventType: "mastodon.link",
      severity: "info",
      userId: userId(req),
      method: req.method,
      path: req.path,
      metadata: { handle, instanceUrl },
    });

    res.json({ ok: true, handle });
  } catch (err) {
    console.error("[mastodon] link failed", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Link failed" });
  }
});

router.delete("/api/mastodon/link", isAuthenticated, async (req, res) => {
  try {
    await db
      .delete(mastodonAccounts)
      .where(eq(mastodonAccounts.userId, userId(req)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[mastodon] unlink failed", err);
    res.status(500).json({ error: "Unlink failed" });
  }
});

router.get("/api/mastodon/timeline", isAuthenticated, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(40, Number(req.query.limit) || 20));
    const result = await getTimelineForUser(userId(req), limit);

    if (result.toots && result.toots.length > 0) {
      logSystemEvent({
        source: "server",
        eventType: "mastodon.timeline",
        severity: "info",
        userId: userId(req),
        method: req.method,
        path: req.path,
        metadata: { tootCount: result.toots.length, fromCache: result.fromCache },
      });
    }

    res.json(result);
  } catch (err) {
    console.error("[mastodon] timeline failed", err);
    res.status(500).json({ error: "Failed to load timeline" });
  }
});

router.get("/api/mastodon/preferences", isAuthenticated, async (req, res) => {
  try {
    const [prefs] = await db
      .select()
      .from(mastodonPreferences)
      .where(eq(mastodonPreferences.userId, userId(req)))
      .limit(1);
    res.json(prefs ?? { showInFeed: true, autoCrosspost: false });
  } catch (err) {
    res.status(500).json({ error: "Failed to load preferences" });
  }
});

router.put("/api/mastodon/preferences", isAuthenticated, async (req, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid preferences" });

  try {
    const uid = userId(req);
    const existing = await db
      .select({ userId: mastodonPreferences.userId })
      .from(mastodonPreferences)
      .where(eq(mastodonPreferences.userId, uid))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(mastodonPreferences)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(mastodonPreferences.userId, uid));
    } else {
      await db.insert(mastodonPreferences).values({ userId: uid, ...parsed.data });
    }

    const [prefs] = await db
      .select()
      .from(mastodonPreferences)
      .where(eq(mastodonPreferences.userId, uid))
      .limit(1);

    res.json(prefs);
  } catch (err) {
    console.error("[mastodon] prefs update failed", err);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

export default router;
