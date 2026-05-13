import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import {
  X_CAPABILITIES,
  X_OAUTH2_TIERS,
  getPlatformXOAuth2Status,
  getUserXOAuth2AccessToken,
  userHasXScopes,
  xOAuth2Request,
} from "../../lib/x-oauth2";
import {
  canUseWAdminControls,
  getWGroupchatConversationIds,
} from "./message-routes";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import type { SystemEventType } from "../../challenges/events/types";

type WSocialRoutesDeps = {
  normalizeHandle?: (handle: string) => string | null;
};

type XUser = {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
};

type XFollowListKind = "followers" | "following";

function emitWSocialEvent(input: {
  eventType: SystemEventType;
  userId: number;
  rawRefType: string;
  rawRefId?: string | number | null;
  metadata?: Record<string, unknown>;
}): void {
  void ingestSystemEvent({
    eventType: input.eventType,
    userId: input.userId,
    source: "w",
    sourceModule: "w-social",
    rawRefType: input.rawRefType,
    rawRefId: input.rawRefId ?? null,
    metadata: input.metadata || null,
  }).catch((err) => console.warn("[w] failed to emit social event", err));
}

function defaultNormalizeHandle(handle: string): string | null {
  const cleaned = handle.trim().replace(/^@+/, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return null;
  return cleaned;
}

function isDigits(value: string | null | undefined): boolean {
  return /^\d+$/.test(String(value || "").trim());
}

function xApiErrorMessage(err: any, fallback: string): string {
  const msg = String(err?.message || "").trim();
  return msg || fallback;
}

function xOAuthErrorStatus(err: any): number {
  return Number(err?.status || 0) || 500;
}

function xOAuthErrorMessage(err: any, fallback: string): string {
  return String(err?.message || err?.payload?.detail || err?.payload?.title || fallback);
}

function followerLookupFailurePayload(err: any) {
  const status = xOAuthErrorStatus(err);
  const planGated = status === 402 || status === 403;
  return {
    error: planGated
      ? "X follower/following list lookup is plan-gated. Counts still work, but full follower/following lists require X Enterprise access."
      : xOAuthErrorMessage(err, "Failed to load X follower data"),
    planGated,
    upstreamStatus: status,
  };
}

async function fetchViewerXProfile(accessToken: string): Promise<XUser> {
  const query = new URLSearchParams({
    "user.fields": "name,username,profile_image_url,public_metrics",
  });
  const payload = await xOAuth2Request({
    method: "GET",
    path: `/users/me?${query.toString()}`,
    accessToken,
  });
  return payload?.data || {};
}

async function fetchXUserByUsername(accessToken: string, username: string): Promise<XUser | null> {
  const query = new URLSearchParams({
    "user.fields": "name,username,profile_image_url,public_metrics",
  });
  const payload = await xOAuth2Request({
    method: "GET",
    path: `/users/by/username/${encodeURIComponent(username)}?${query.toString()}`,
    accessToken,
  });
  return payload?.data || null;
}

async function fetchXFollowList(params: {
  accessToken: string;
  userId: string;
  kind: XFollowListKind;
  limit: number;
  paginationToken?: string;
}) {
  const query = new URLSearchParams({
    max_results: String(Math.max(1, Math.min(params.limit, 1000))),
    "user.fields": "name,username,profile_image_url,public_metrics",
  });
  if (params.paginationToken) query.set("pagination_token", params.paginationToken);
  return xOAuth2Request({
    method: "GET",
    path: `/users/${encodeURIComponent(params.userId)}/${params.kind}?${query.toString()}`,
    accessToken: params.accessToken,
  });
}

export function registerWSocialRoutes(router: Router, deps: WSocialRoutesDeps = {}): void {
  const normalizeHandle = deps.normalizeHandle || defaultNormalizeHandle;

  router.get("/api/w/follows/summary", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.read", "users.read"]);
      if (!accessToken) {
        return res.status(403).json({
          error: "Connect X with read access to show your X profile, follower count, and following count in W.",
        });
      }
      const profile = await fetchViewerXProfile(accessToken);
      return res.json({
        profile: {
          id: profile.id || String(user?.twitterId || ""),
          username: profile.username || user?.twitterHandle || null,
          name: profile.name || null,
          profileImageUrl: profile.profile_image_url || null,
          followersCount: Number(profile.public_metrics?.followers_count || 0),
          followingCount: Number(profile.public_metrics?.following_count || 0),
          tweetCount: Number(profile.public_metrics?.tweet_count || 0),
          listedCount: Number(profile.public_metrics?.listed_count || 0),
        },
      });
    } catch (err: any) {
      console.error("[w] follow summary failed:", err);
      return res.status(xOAuthErrorStatus(err)).json({
        error: xOAuthErrorMessage(err, "Failed to load X profile summary"),
      });
    }
  });

  router.get("/api/w/follows", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const viewerTwitterId = String(user?.twitterId || "").trim();
      const kind = String(req.query.type || "followers") === "following" ? "following" : "followers";
      if (!isDigits(viewerTwitterId)) {
        return res.status(403).json({ error: "Connect X before loading follower data." });
      }
      const accessToken = await getUserXOAuth2AccessToken(user, ["tweet.read", "users.read"]);
      if (!accessToken) {
        return res.status(403).json({
          error: "Reconnect X with read access before loading follower data.",
        });
      }
      const payload = await fetchXFollowList({
        accessToken,
        userId: viewerTwitterId,
        kind,
        limit: Math.max(1, Math.min(Number(req.query.limit || 100), 1000)),
        paginationToken: String(req.query.paginationToken || "").trim() || undefined,
      });
      return res.json({
        type: kind,
        users: Array.isArray(payload?.data)
          ? payload.data.map((row: XUser) => ({
              id: row.id,
              username: row.username || null,
              name: row.name || null,
              profileImageUrl: row.profile_image_url || null,
              followersCount: Number(row.public_metrics?.followers_count || 0),
              followingCount: Number(row.public_metrics?.following_count || 0),
            }))
          : [],
        resultCount: Number(payload?.meta?.result_count || 0),
        nextToken: payload?.meta?.next_token || null,
        previousToken: payload?.meta?.previous_token || null,
        planGated: false,
      });
    } catch (err: any) {
      console.error("[w] follow list failed:", err);
      return res.status(xOAuthErrorStatus(err)).json(followerLookupFailurePayload(err));
    }
  });

  router.post("/api/w/follows", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const sourceUserId = String(user?.twitterId || "").trim();
      const action = String(req.body?.action || "follow") === "unfollow" ? "unfollow" : "follow";
      const rawTarget = String(req.body?.target || req.body?.targetUserId || "").trim();
      if (!isDigits(sourceUserId)) {
        return res.status(403).json({ error: "Connect X before managing follows from W." });
      }
      if (!rawTarget) return res.status(400).json({ error: "Enter an X username or user id." });

      const accessToken = await getUserXOAuth2AccessToken(user, ["users.read", "follows.write"]);
      if (!accessToken) {
        return res.status(403).json({
          error: "Reconnect X with Timeline actions to grant follows.write before following or unfollowing from W.",
        });
      }

      let target: XUser | null = null;
      if (isDigits(rawTarget)) {
        target = { id: rawTarget };
      } else {
        const username = normalizeHandle(rawTarget);
        if (!username) return res.status(400).json({ error: "Enter a valid X username or numeric user id." });
        target = await fetchXUserByUsername(accessToken, username);
      }
      const targetUserId = String(target?.id || "").trim();
      if (!isDigits(targetUserId)) return res.status(404).json({ error: "X user not found." });
      if (targetUserId === sourceUserId) return res.status(400).json({ error: "You cannot follow yourself." });

      if (action === "follow") {
        await xOAuth2Request({
          method: "POST",
          path: `/users/${encodeURIComponent(sourceUserId)}/following`,
          accessToken,
          body: { target_user_id: targetUserId },
        });
      } else {
        await xOAuth2Request({
          method: "DELETE",
          path: `/users/${encodeURIComponent(sourceUserId)}/following/${encodeURIComponent(targetUserId)}`,
          accessToken,
        });
      }

      if (action === "follow") {
        emitWSocialEvent({
          eventType: "w.follow.created",
          userId: user.id,
          rawRefType: "x_user",
          rawRefId: targetUserId,
          metadata: {
            sourceUserId,
            targetUsername: target?.username || null,
            targetName: target?.name || null,
          },
        });
      }
      return res.json({
        ok: true,
        action,
        target: {
          id: targetUserId,
          username: target?.username || null,
          name: target?.name || null,
          profileImageUrl: target?.profile_image_url || null,
        },
      });
    } catch (err: any) {
      console.error("[w] follow action failed:", err);
      return res.status(xOAuthErrorStatus(err)).json({
        error: xOAuthErrorMessage(err, "Failed to update X follow relationship"),
        upstreamStatus: xOAuthErrorStatus(err),
      });
    }
  });

  router.get("/api/w/spaces", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const platformStatus = await getPlatformXOAuth2Status();
      const accessToken =
        platformStatus.token ||
        (await getUserXOAuth2AccessToken(user, ["tweet.read", "users.read"]));
      if (!accessToken) {
        return res.status(403).json({ error: "Connect X to browse Spaces from W." });
      }
      const creatorHandle = String(req.query.creator || process.env.W_X_DEFAULT_ACCOUNT_HANDLE || "wtf_gameshow").trim();
      const lookupQuery = new URLSearchParams({
        "user.fields": "name,username,profile_image_url",
        "space.fields": "title,state,scheduled_start,participant_count,host_ids,created_at,lang",
        expansions: "host_ids",
      });
      const usernamePayload = await xOAuth2Request({
        method: "GET",
        path: `/users/by/username/${encodeURIComponent(creatorHandle)}?user.fields=id`,
        accessToken,
      });
      const creatorId = String(usernamePayload?.data?.id || "").trim();
      if (!isDigits(creatorId)) {
        emitWSocialEvent({
          eventType: "w.spaces.viewed",
          userId: user.id,
          rawRefType: "x_spaces_creator",
          rawRefId: creatorHandle,
          metadata: {
            creatorHandle,
            resultCount: 0,
            resolved: false,
          },
        });
        return res.json({ spaces: [], diagnostics: `Could not resolve @${creatorHandle} to an X user id.` });
      }
      let spacesError: string | null = null;
      const spacesPayload = await xOAuth2Request({
        method: "GET",
        path: `/spaces/by/creator_ids?user_ids=${encodeURIComponent(creatorId)}&${lookupQuery.toString()}`,
        accessToken,
      }).catch((err: any) => {
        spacesError = xApiErrorMessage(err, "X Spaces lookup failed");
        console.warn("[w] spaces by creator failed:", err?.status, spacesError);
        return { data: [] };
      });
      const spaces = Array.isArray(spacesPayload?.data)
        ? spacesPayload.data.map((space: any) => ({
            id: String(space.id || ""),
            title: space.title || null,
            state: space.state || null,
            scheduledStart: space.scheduled_start || null,
            participantCount: Number(space.participant_count || 0),
            createdAt: space.created_at || null,
            url: `https://x.com/i/spaces/${space.id}`,
          }))
        : [];
      emitWSocialEvent({
        eventType: "w.spaces.viewed",
        userId: user.id,
        rawRefType: "x_spaces_creator",
        rawRefId: creatorId,
        metadata: {
          creatorHandle,
          resultCount: spaces.length,
          spacesError,
        },
      });
      return res.json({ spaces, creatorHandle, creatorId, ...(spacesError ? { spacesError } : {}) });
    } catch (err: any) {
      console.error("[w] spaces lookup failed:", err);
      return res.status(xOAuthErrorStatus(err)).json({
        error: xOAuthErrorMessage(err, "Failed to load X Spaces"),
        spaces: [],
      });
    }
  });

  router.get("/api/w/capabilities", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const scopes = String(user?.twitterOauth2Scopes || "")
        .split(/[,\s]+/)
        .filter(Boolean);
      const platformStatus = await getPlatformXOAuth2Status();
      const groupchatIds = await getWGroupchatConversationIds();
      const capabilities = X_CAPABILITIES.map((capability) => ({
        ...capability,
        enabled:
          capability.scopes.length === 0
            ? Boolean(capability.available)
            : capability.key === "spaces"
              ? userHasXScopes(user, [...capability.scopes]) || Boolean(platformStatus.token)
              : capability.key === "direct_messages"
                ? userHasXScopes(user, ["dm.read"])
                : userHasXScopes(user, [...capability.scopes]),
      }));
      emitWSocialEvent({
        eventType: "w.capabilities.viewed",
        userId: user.id,
        rawRefType: "w_capabilities",
        metadata: {
          connected: Boolean(user?.twitterOauth2AccessToken),
          platformReadAvailable: Boolean(platformStatus.token),
          groupchatConfigured: groupchatIds.length > 0,
          enabledCount: capabilities.filter((capability) => capability.enabled).length,
        },
      });

      res.json({
        oauth2Configured: Boolean(process.env.TWITTER_CLIENT_ID?.trim()),
        platformAccountConfigured: Boolean(platformStatus.token),
        platformAccountSource: platformStatus.source,
        platformAccountReason: platformStatus.reason,
        platformAccountHandle: platformStatus.handle,
        groupchatConfigured: groupchatIds.length > 0,
        groupchatIds,
        connected: Boolean(user?.twitterOauth2AccessToken),
        canUseAdminControls: await canUseWAdminControls(user),
        scopes,
        tiers: X_OAUTH2_TIERS,
        platformReadAvailable: Boolean(platformStatus.token),
        capabilities,
        defaultAccountHandle: process.env.W_X_DEFAULT_ACCOUNT_HANDLE || "wtf_gameshow",
      });
    } catch (err) {
      console.error("[w] capability fetch failed:", err);
      res.status(500).json({ error: "Failed to load W capabilities" });
    }
  });
}
