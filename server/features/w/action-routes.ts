import { randomUUID } from "crypto";
import type { Router } from "express";
import multer from "multer";
import { isAuthenticated } from "../../auth/passport";
import {
  getUserXOAuth2AccessToken,
  xOAuth2Request,
} from "../../lib/x-oauth2";
import {
  recordWMediaUploadOwnership,
  requireOwnedWMediaIds,
} from "./media-ownership";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import type { SystemEventType } from "../../challenges/events/types";

const DEFAULT_X_API_BASE = (process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");
const X_POST_MAX_LENGTH = 280;
const W_MEDIA_MAX_BYTES = 15 * 1024 * 1024;
const W_TIMELINE_ACTION_MIN_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.W_TIMELINE_ACTION_MIN_INTERVAL_MS || 5000)
);
const actionRateLimits = new Map<string, number>();
const wMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: W_MEDIA_MAX_BYTES, files: 1 },
});

type WActionRouteGroup = "all" | "compose" | "engagement";

type WActionRoutesDeps = {
  group?: WActionRouteGroup;
  xApiBaseUrl?: string;
  normalizeHandle?: (handle: string) => string | null;
};

class WActionRouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WActionRouteError";
    this.status = status;
  }
}

function emitWActionEvent(input: {
  eventType: SystemEventType;
  userId: number;
  rawRefType: string;
  rawRefId: string | number;
  metadata?: Record<string, unknown>;
}): void {
  void ingestSystemEvent({
    eventId: `${input.eventType}:${input.userId}:${input.rawRefId}`,
    eventType: input.eventType,
    userId: input.userId,
    source: "w",
    sourceModule: "w",
    rawRefType: input.rawRefType,
    rawRefId: input.rawRefId,
    metadata: input.metadata || null,
  }).catch((err) => console.warn("[w] failed to emit action event", err));
}

function isDigits(value: string | null | undefined): boolean {
  return /^\d+$/.test(String(value || "").trim());
}

function normalizePostId(raw: unknown): string {
  const postId = String(raw || "").trim();
  if (!isDigits(postId)) {
    throw new WActionRouteError(400, "Invalid postId");
  }
  return postId;
}

function defaultNormalizeHandle(handle: string): string | null {
  const cleaned = handle.trim().replace(/^@+/, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned;
}

function actionErrorStatus(err: any): number {
  if (err instanceof WActionRouteError) return err.status;
  const status = Number(err?.status || 0);
  if (status >= 400 && status < 600) return status;
  return 500;
}

function actionErrorMessage(err: any, fallback: string): string {
  if (err instanceof WActionRouteError) return err.message;
  const msg = String(err?.message || "").trim();
  return msg || fallback;
}

function assertTimelineActionRateLimit(userId: number, action: string): void {
  const now = Date.now();
  if (actionRateLimits.size > 5000) {
    for (const [key, nextAllowedAt] of actionRateLimits.entries()) {
      if (nextAllowedAt <= now) actionRateLimits.delete(key);
    }
    if (actionRateLimits.size > 5000) actionRateLimits.clear();
  }
  const key = `${userId}:${action}`;
  const nextAllowedAt = actionRateLimits.get(key) || 0;
  if (nextAllowedAt > now) {
    throw new WActionRouteError(
      429,
      `Timeline action rate limit. Try again in ${Math.ceil((nextAllowedAt - now) / 1000)}s.`
    );
  }
  actionRateLimits.set(key, now + W_TIMELINE_ACTION_MIN_INTERVAL_MS);
}

function parseXApiMessage(payload: any, fallback: string): string {
  const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  return (
    firstError?.message ||
    firstError?.detail ||
    payload?.detail ||
    payload?.title ||
    payload?.error ||
    fallback
  );
}

async function uploadXMedia(
  xApiBaseUrl: string,
  accessToken: string,
  file: Express.Multer.File
) {
  const mime = String(file.mimetype || "").toLowerCase();
  const category = mime.includes("gif")
    ? "tweet_gif"
    : mime.startsWith("video/")
      ? "tweet_video"
      : "tweet_image";
  const form = new FormData();
  const mediaBytes = new Uint8Array(file.buffer);
  form.set("media", new Blob([mediaBytes], { type: file.mimetype }), file.originalname || "w-media");
  form.set("media_category", category);
  const requestId = randomUUID();
  const response = await fetch(`${xApiBaseUrl}/media/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Request-Id": requestId,
    },
    body: form,
  });
  const text = await response.text().catch(() => "");
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new WActionRouteError(
      response.status,
      `X media upload ${response.status}: ${parseXApiMessage(payload, response.statusText)}`
    );
  }
  const mediaId = String(payload?.data?.id || payload?.media_id_string || payload?.media_id || "").trim();
  if (!mediaId) throw new WActionRouteError(502, "X media upload did not return a media id");
  return {
    id: mediaId,
    category,
    expiresAfterSecs: payload?.data?.expires_after_secs || payload?.expires_after_secs || null,
  };
}

export function registerWActionRoutes(router: Router, deps: WActionRoutesDeps = {}): void {
  const group = deps.group || "all";
  const xApiBaseUrl = (deps.xApiBaseUrl || DEFAULT_X_API_BASE).replace(/\/$/, "");
  const normalizeHandle = deps.normalizeHandle || defaultNormalizeHandle;

  if (group === "all" || group === "compose") {
    router.post("/api/w/post", isAuthenticated, async (req, res) => {
      try {
        const text = String(req.body?.text || "").trim();
        const mediaIds = Array.isArray(req.body?.mediaIds)
          ? req.body.mediaIds.map((id: unknown) => String(id || "").trim()).filter(isDigits).slice(0, 4)
          : [];
        if (!text) return res.status(400).json({ error: "Post text is required" });
        if (text.length > X_POST_MAX_LENGTH) {
          return res.status(400).json({ error: `Post must be ${X_POST_MAX_LENGTH} characters or less` });
        }

        const ownedMediaIds = await requireOwnedWMediaIds((req.user as any).id, mediaIds);
        const accessToken = await getUserXOAuth2AccessToken(req.user as any, ["tweet.write"]);
        if (!accessToken) {
          return res.status(403).json({
            error: "Reconnect X with the Timeline actions tier to create posts in W.",
          });
        }

        const result = await xOAuth2Request({
          method: "POST",
          path: "/tweets",
          accessToken,
          body: {
            text,
            ...(ownedMediaIds.length > 0 ? { media: { media_ids: ownedMediaIds } } : {}),
          },
        });
        const tweetId = String(result?.data?.id || "").trim();
        const authorHandle = normalizeHandle((req.user as any)?.twitterHandle || "") || "i";
        if (tweetId) {
          emitWActionEvent({
            eventType: "w.post.created",
            userId: (req.user as any).id,
            rawRefType: "x_tweet",
            rawRefId: tweetId,
            metadata: {
              mediaCount: ownedMediaIds.length,
              textLength: text.length,
            },
          });
        }
        res.status(201).json({
          ok: true,
          id: tweetId || null,
          url: tweetId ? `https://x.com/${authorHandle}/status/${tweetId}` : null,
          result,
        });
      } catch (err: any) {
        console.error("[w] post create failed:", err);
        res.status(err?.status || 500).json({ error: err?.message || "Failed to create post" });
      }
    });

    router.post("/api/w/media", isAuthenticated, (req, res) => {
      wMediaUpload.single("media")(req, res, async (uploadErr: unknown) => {
        try {
          if (uploadErr) {
            return res.status(400).json({ error: uploadErr instanceof Error ? uploadErr.message : "Media upload failed" });
          }
          const file = req.file;
          if (!file) return res.status(400).json({ error: "No media file uploaded" });
          const mime = String(file.mimetype || "").toLowerCase();
          const allowed =
            mime.startsWith("image/jpeg") ||
            mime.startsWith("image/png") ||
            mime.startsWith("image/webp") ||
            mime.startsWith("image/gif") ||
            mime.startsWith("video/");
          if (!allowed) {
            return res.status(400).json({ error: "W supports JPG, PNG, WEBP, GIF, and video uploads for X posts." });
          }
          if (file.size > W_MEDIA_MAX_BYTES) {
            return res.status(400).json({ error: "Media must be 15MB or less." });
          }
          const accessToken = await getUserXOAuth2AccessToken(req.user as any, ["tweet.write"]);
          if (!accessToken) {
            return res.status(403).json({ error: "Reconnect X with the Timeline actions tier to upload media." });
          }
          const media = await uploadXMedia(xApiBaseUrl, accessToken, file);
          await recordWMediaUploadOwnership({
            ownerUserId: (req.user as any).id,
            xMediaId: media.id,
            mediaCategory: media.category,
            expiresAfterSecs: media.expiresAfterSecs,
          });
          emitWActionEvent({
            eventType: "w.media.uploaded",
            userId: (req.user as any).id,
            rawRefType: "x_media",
            rawRefId: media.id,
            metadata: {
              mediaCategory: media.category,
              expiresAfterSecs: media.expiresAfterSecs,
              mimeType: file.mimetype,
              size: file.size,
            },
          });
          return res.status(201).json({ ok: true, media });
        } catch (err: any) {
          console.error("[w] media upload failed:", err);
          return res.status(err?.status || 500).json({ error: err?.message || "Failed to upload media to X" });
        }
      });
    });
  }

  if (group === "all" || group === "engagement") {
    router.post("/api/w/reply", isAuthenticated, async (req, res) => {
      try {
        const user = req.user as any;
        assertTimelineActionRateLimit(user.id, "reply");
        const postId = String(req.body?.postId || "").trim();
        const text = String(req.body?.text || "").trim();

        if (!postId || !/^\d+$/.test(postId)) {
          return res.status(400).json({ error: "Invalid postId" });
        }
        if (!text) {
          return res.status(400).json({ error: "Reply text is required" });
        }
        if (text.length > X_POST_MAX_LENGTH) {
          return res.status(400).json({ error: `Reply must be ${X_POST_MAX_LENGTH} characters or less` });
        }
        const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.write"]);
        if (!accessToken) {
          return res.status(403).json({ error: "Reconnect X with Timeline actions to reply from W." });
        }

        const result = await xOAuth2Request({
          method: "POST",
          path: "/tweets",
          accessToken,
          body: {
            text,
            reply: { in_reply_to_tweet_id: postId },
          },
        });

        const tweetId = String(result?.data?.id || "").trim();
        if (!tweetId) {
          return res.status(502).json({ error: "X API did not return the created reply id" });
        }

        const authorHandle = normalizeHandle(user?.twitterHandle || "") || "i";
        emitWActionEvent({
          eventType: "w.reply.created",
          userId: user.id,
          rawRefType: "x_tweet",
          rawRefId: tweetId,
          metadata: {
            postId,
            textLength: text.length,
          },
        });
        return res.json({
          ok: true,
          id: tweetId,
          url: `https://x.com/${authorHandle}/status/${tweetId}`,
        });
      } catch (err: any) {
        console.error("[w] reply failed:", err);
        return res.status(actionErrorStatus(err)).json({ error: actionErrorMessage(err, "Failed to publish reply") });
      }
    });

    router.post("/api/w/like", isAuthenticated, async (req, res) => {
      try {
        const user = req.user as any;
        assertTimelineActionRateLimit(user.id, "like");
        const postId = normalizePostId(req.body?.postId);
        const actorId = String(user?.twitterId || "").trim();
        if (!isDigits(actorId)) return res.status(403).json({ error: "Connect X before liking from W" });
        const accessToken = await getUserXOAuth2AccessToken(user, ["like.write"]);
        if (!accessToken) {
          return res.status(403).json({ error: "Reconnect X with Timeline actions to like from W." });
        }

        await xOAuth2Request({
          method: "POST",
          path: `/users/${encodeURIComponent(actorId)}/likes`,
          accessToken,
          body: {
            tweet_id: postId,
          },
        });

        emitWActionEvent({
          eventType: "w.like.created",
          userId: user.id,
          rawRefType: "x_tweet",
          rawRefId: postId,
          metadata: {
            actorId,
          },
        });
        return res.json({ ok: true, postId });
      } catch (err) {
        console.error("[w] like failed:", err);
        return res.status(actionErrorStatus(err)).json({ error: actionErrorMessage(err, "Failed to like post") });
      }
    });

    router.post("/api/w/repost", isAuthenticated, async (req, res) => {
      try {
        const user = req.user as any;
        assertTimelineActionRateLimit(user.id, "repost");
        const postId = normalizePostId(req.body?.postId);
        const actorId = String(user?.twitterId || "").trim();
        if (!isDigits(actorId)) return res.status(403).json({ error: "Connect X before reposting from W" });
        const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.write"]);
        if (!accessToken) {
          return res.status(403).json({ error: "Reconnect X with Timeline actions to repost from W." });
        }

        await xOAuth2Request({
          method: "POST",
          path: `/users/${encodeURIComponent(actorId)}/retweets`,
          accessToken,
          body: {
            tweet_id: postId,
          },
        });

        emitWActionEvent({
          eventType: "w.repost.created",
          userId: user.id,
          rawRefType: "x_tweet",
          rawRefId: postId,
          metadata: {
            actorId,
          },
        });
        return res.json({ ok: true, postId });
      } catch (err) {
        console.error("[w] repost failed:", err);
        return res.status(actionErrorStatus(err)).json({ error: actionErrorMessage(err, "Failed to repost") });
      }
    });

    router.post("/api/w/quote", isAuthenticated, async (req, res) => {
      try {
        const user = req.user as any;
        assertTimelineActionRateLimit(user.id, "quote");
        const postId = normalizePostId(req.body?.postId);
        const text = String(req.body?.text || "").trim();
        if (!text) {
          return res.status(400).json({ error: "Quote text is required" });
        }
        if (text.length > X_POST_MAX_LENGTH) {
          return res
            .status(400)
            .json({ error: `Quote must be ${X_POST_MAX_LENGTH} characters or less` });
        }

        const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.write"]);
        if (!accessToken) {
          return res.status(403).json({ error: "Reconnect X with Timeline actions to quote from W." });
        }
        const result = (await xOAuth2Request({
          method: "POST",
          path: "/tweets",
          accessToken,
          body: {
            text,
            quote_tweet_id: postId,
          },
        })) as { data?: { id?: string } };

        const tweetId = String(result?.data?.id || "").trim();
        if (!tweetId) {
          return res.status(502).json({ error: "X API did not return the created quote id" });
        }

        const authorHandle = normalizeHandle(user?.twitterHandle || "") || "i";
        emitWActionEvent({
          eventType: "w.quote.created",
          userId: user.id,
          rawRefType: "x_tweet",
          rawRefId: tweetId,
          metadata: {
            postId,
            textLength: text.length,
          },
        });
        return res.json({
          ok: true,
          id: tweetId,
          url: `https://x.com/${authorHandle}/status/${tweetId}`,
        });
      } catch (err) {
        console.error("[w] quote failed:", err);
        return res.status(actionErrorStatus(err)).json({ error: actionErrorMessage(err, "Failed to quote post") });
      }
    });
  }
}
