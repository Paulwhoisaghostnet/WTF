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
    return res.status(410).json({
      error: "W no longer fetches follower/profile summaries. The live product is the WTF timeline and read-only Gameshow chat.",
    });
  });

  router.get("/api/w/follows", isAuthenticated, async (req, res) => {
    return res.status(410).json({
      error: "W follower/following lookup is disabled. Registered WTF handles enter the timeline through filtered stream rules.",
      type: String(req.query.type || "followers") === "following" ? "following" : "followers",
      users: [],
      resultCount: 0,
      nextToken: null,
      previousToken: null,
      planGated: false,
    });
  });

  router.post("/api/w/follows", isAuthenticated, async (req, res) => {
    return res.status(410).json({
      error: "W follow/unfollow actions are disabled. Admin stream-rule manifest handles are the only manual timeline inclusion path.",
    });
  });

  router.get("/api/w/spaces", isAuthenticated, async (req, res) => {
    return res.status(410).json({
      spaces: [],
      diagnostics: "W Spaces lookup is disabled. W is limited to timeline plus read-only Gameshow chat.",
    });
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
            : capability.key === "direct_messages"
              ? Boolean(platformStatus.token)
              : false,
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
