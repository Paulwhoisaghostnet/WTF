import { getPlatformXOAuth2Status, xOAuth2Request } from "./x-oauth2";
import {
  getTimelineStreamBearer,
  loadStreamRuleHandlesFromDb,
  requestTimelineStreamReconnect,
  syncStreamRulesToX,
} from "./timeline-stream";
import { getDesignatedGroupchatIds } from "./x-dm-sync";
import { logSystemEvent } from "./system-log";

type XConnectedUser = {
  id: number;
  twitterId?: string | null;
  twitterHandle?: string | null;
};

function eventMetadata(user: XConnectedUser, extra: Record<string, unknown> = {}) {
  return {
    userId: user.id,
    twitterId: user.twitterId || null,
    twitterHandle: user.twitterHandle || null,
    ...extra,
  };
}

async function syncConnectedUserIntoTimelineRules(user: XConnectedUser): Promise<void> {
  const bearer = await getTimelineStreamBearer();
  if (!bearer) {
    logSystemEvent({
      source: "w-x-onboarding",
      eventType: "timeline_rule_sync_skipped",
      severity: "warn",
      message: "Skipped post-connect stream rule sync; no X stream bearer is configured",
      userId: user.id,
      metadata: eventMetadata(user),
    });
    return;
  }
  const handles = await loadStreamRuleHandlesFromDb();
  if (handles.length === 0) return;
  const result = await syncStreamRulesToX(bearer, handles);
  requestTimelineStreamReconnect();
  logSystemEvent({
    source: "w-x-onboarding",
    eventType: "timeline_rule_sync_after_connect",
    severity: "info",
    message: "Synced W timeline filtered-stream rules after X OAuth connect",
    userId: user.id,
    metadata: eventMetadata(user, {
      handles: handles.length,
      deleted: result.deleted,
      added: result.added,
    }),
  });
}

async function resolvePlatformMe(accessToken: string): Promise<{ id: string; username?: string } | null> {
  const payload = await xOAuth2Request({
    method: "GET",
    path: "/users/me?user.fields=username",
    accessToken,
  });
  const id = String(payload?.data?.id || "").trim();
  if (!id) return null;
  return { id, username: payload?.data?.username ? String(payload.data.username) : undefined };
}

async function followConnectedUser(user: XConnectedUser, accessToken: string): Promise<void> {
  const targetUserId = String(user.twitterId || "").trim();
  if (!targetUserId) return;
  const platformMe = await resolvePlatformMe(accessToken);
  if (!platformMe?.id || platformMe.id === targetUserId) return;
  await xOAuth2Request({
    method: "POST",
    path: `/users/${encodeURIComponent(platformMe.id)}/following`,
    accessToken,
    body: { target_user_id: targetUserId },
  });
  logSystemEvent({
    source: "w-x-onboarding",
    eventType: "platform_followed_connected_user",
    severity: "info",
    message: "@wtf_gameshow followed a newly connected WTF X account",
    userId: user.id,
    metadata: eventMetadata(user, { platformTwitterId: platformMe.id, platformHandle: platformMe.username || null }),
  });
}

async function addConnectedUserToGroupchat(user: XConnectedUser, accessToken: string): Promise<void> {
  const targetUserId = String(user.twitterId || "").trim();
  if (!targetUserId) return;
  const conversationIds = await getDesignatedGroupchatIds();
  for (const conversationId of conversationIds) {
    await xOAuth2Request({
      method: "POST",
      path: `/chat/conversations/${encodeURIComponent(conversationId)}/members`,
      accessToken,
      body: { participant_user_ids: [targetUserId] },
    });
    logSystemEvent({
      source: "w-x-onboarding",
      eventType: "connected_user_added_to_groupchat",
      severity: "info",
      message: "Added a newly connected WTF X account to the configured Gameshow groupchat",
      userId: user.id,
      metadata: eventMetadata(user, { conversationId }),
    });
  }
}

export async function runXConnectOnboarding(user: XConnectedUser): Promise<void> {
  if (!user.twitterId || !user.twitterHandle) return;
  await syncConnectedUserIntoTimelineRules(user).catch((err) => {
    logSystemEvent({
      source: "w-x-onboarding",
      eventType: "timeline_rule_sync_after_connect_failed",
      severity: "warn",
      message: String(err?.message || err),
      userId: user.id,
      metadata: eventMetadata(user),
    });
  });

  const platform = await getPlatformXOAuth2Status();
  if (!platform.token) {
    logSystemEvent({
      source: "w-x-onboarding",
      eventType: "platform_social_onboarding_skipped",
      severity: "warn",
      message: "Skipped platform follow/groupchat onboarding; no platform X OAuth token is available",
      userId: user.id,
      metadata: eventMetadata(user, { reason: platform.reason || "missing_platform_token" }),
    });
    return;
  }

  await followConnectedUser(user, platform.token).catch((err) => {
    logSystemEvent({
      source: "w-x-onboarding",
      eventType: "platform_follow_connected_user_failed",
      severity: "warn",
      message: String(err?.message || err),
      userId: user.id,
      statusCode: Number(err?.status || 0) || null,
      metadata: eventMetadata(user, { payload: err?.payload || null }),
    });
  });

  await addConnectedUserToGroupchat(user, platform.token).catch((err) => {
    logSystemEvent({
      source: "w-x-onboarding",
      eventType: "connected_user_groupchat_add_failed",
      severity: "warn",
      message: String(err?.message || err),
      userId: user.id,
      statusCode: Number(err?.status || 0) || null,
      metadata: eventMetadata(user, { payload: err?.payload || null }),
    });
  });
}

export function runXConnectOnboardingSoon(user: XConnectedUser): void {
  setTimeout(() => {
    runXConnectOnboarding(user).catch((err) =>
      console.warn("[w-x-onboarding] unexpected failure:", err)
    );
  }, 0).unref?.();
}
