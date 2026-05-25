export const SKYWIRE_PERMISSION_TIER_KEYS = [
  "be-safe",
  "be-social",
  "be-heard",
  "be-bold",
] as const;

export type SkywirePermissionTier = (typeof SKYWIRE_PERMISSION_TIER_KEYS)[number];

export type SkywirePermissionCapability =
  | "identity"
  | "publicRead"
  | "homeTimeline"
  | "notifications"
  | "socialActions"
  | "compose"
  | "profileWrite"
  | "signals"
  | "chat";

export type SkywirePermissionTierOption = {
  key: SkywirePermissionTier;
  title: string;
  shortLabel: string;
  summary: string;
  description: string;
  grants: string[];
  warnings: string[];
  capabilities: SkywirePermissionCapability[];
};

export const SKYWIRE_DEFAULT_PERMISSION_TIER: SkywirePermissionTier = "be-social";

export const ATPROTO_BASE_SCOPE = "atproto";
export const ATPROTO_TRANSITION_GENERIC_SCOPE = "transition:generic";
export const ATPROTO_CHAT_SCOPE = "transition:chat.bsky";

const BSKY_APPVIEW_AUD = "did:web:api.bsky.app#bsky_appview";

function bskyRpcScope(nsid: string): string {
  return `rpc:${nsid}?aud=${BSKY_APPVIEW_AUD}`;
}

export const SKYWIRE_READ_SCOPES = [
  ATPROTO_BASE_SCOPE,
  bskyRpcScope("app.bsky.actor.getProfile"),
  bskyRpcScope("app.bsky.actor.searchActors"),
  bskyRpcScope("app.bsky.feed.getAuthorFeed"),
  bskyRpcScope("app.bsky.feed.getTimeline"),
  bskyRpcScope("app.bsky.feed.getPostThread"),
  bskyRpcScope("app.bsky.feed.getPosts"),
  bskyRpcScope("app.bsky.feed.searchPosts"),
  bskyRpcScope("app.bsky.graph.getFollows"),
  bskyRpcScope("app.bsky.notification.listNotifications"),
] as const;

export const SKYWIRE_SOCIAL_ACTION_SCOPES = [
  "repo:app.bsky.feed.like",
  "repo:app.bsky.feed.repost",
  "repo:app.bsky.graph.follow",
] as const;

export const SKYWIRE_CREATOR_SCOPES = [
  "repo:app.bsky.feed.post",
  "repo:app.bsky.actor.profile",
  "repo:app.wtfgameshow.skywire.signal",
  "blob:image/*",
] as const;

export const SKYWIRE_PERMISSION_TIER_OPTIONS: SkywirePermissionTierOption[] = [
  {
    key: "be-safe",
    title: "Be Safe",
    shortLabel: "Read only",
    summary: "Connect identity and read Bluesky/Skywire content without posting or changing anything.",
    description:
      "Skywire can identify your AT Protocol account, show public profiles, search actors, read public author feeds, and request read-only Bluesky AppView data such as your timeline and notifications. Skywire will not ask to like, repost, follow, post, edit your profile, upload media, or write WTF-native AT records.",
    grants: [
      "Connect your AT identity to your WTF account.",
      "Read public Bluesky profiles, posts, actor feeds, search results, and follows.",
      "Request read-only timeline and notification data when Bluesky grants those read scopes.",
    ],
    warnings: [
      "Some personalized Bluesky reads may be unavailable if the upstream PDS/AppView has not enabled granular read scopes for that endpoint.",
    ],
    capabilities: ["identity", "publicRead", "homeTimeline", "notifications"],
  },
  {
    key: "be-social",
    title: "Be Social",
    shortLabel: "Read and react",
    summary: "Use Skywire as a social reader with likes, reposts, and follows enabled.",
    description:
      "Skywire gets the Be Safe read permissions plus the ability to create the Bluesky records used for likes, reposts, and follows. This tier is for normal timeline use where you want to participate without giving Skywire permission to publish posts or edit profile records.",
    grants: [
      "Everything in Be Safe.",
      "Like and unlike Bluesky posts.",
      "Repost and remove reposts.",
      "Follow and unfollow actors.",
    ],
    warnings: [
      "Skywire can create or delete social-action records in your AT repo for likes, reposts, and follows.",
    ],
    capabilities: ["identity", "publicRead", "homeTimeline", "notifications", "socialActions"],
  },
  {
    key: "be-heard",
    title: "Be Heard",
    shortLabel: "Create posts",
    summary: "Post, reply, update your Skywire profile, and publish WTF-native Skywire Signals.",
    description:
      "Skywire gets the Be Social permissions plus the AT repo permissions needed to publish Bluesky posts and replies, update your Bluesky profile record, upload images for posts, and write WTF-native Skywire Signal records for portable quest, drop, proof, and broadcast state beyond Bluesky itself.",
    grants: [
      "Everything in Be Social.",
      "Create Bluesky posts and replies from Skywire.",
      "Update the profile record Skywire shows for your AT identity.",
      "Upload image blobs for future media posting.",
      "Publish WTF-native Skywire Signal records into your AT repo.",
    ],
    warnings: [
      "Skywire can write post/profile/signal records into your AT repo. Use this only if you want Skywire to create content for you.",
    ],
    capabilities: [
      "identity",
      "publicRead",
      "homeTimeline",
      "notifications",
      "socialActions",
      "compose",
      "profileWrite",
      "signals",
    ],
  },
  {
    key: "be-bold",
    title: "Be Bold",
    shortLabel: "Full Skywire",
    summary: "Use the broad AT Protocol compatibility scope for the most complete Skywire experience.",
    description:
      "Skywire requests the broad AT Protocol compatibility scope currently used by full Bluesky-style clients. This gives Skywire the best chance of working across timeline, viewer state, social actions, posts, profile updates, preferences, and WTF-native AT records while the granular permission ecosystem matures.",
    grants: [
      "Full Skywire client compatibility through the broad AT Protocol scope.",
      "Read, write, and manage the Bluesky/Skywire records the app needs for normal client behavior.",
      "Use current Skywire features that may not yet have reliable granular scope support.",
    ],
    warnings: [
      "This is intentionally broad and should feel similar to trusting Skywire as a full AT Protocol client.",
      "It does not include DM/chat access unless you enable the separate DM add-on.",
    ],
    capabilities: [
      "identity",
      "publicRead",
      "homeTimeline",
      "notifications",
      "socialActions",
      "compose",
      "profileWrite",
      "signals",
    ],
  },
];

export const SKYWIRE_CHAT_PERMISSION_DESCRIPTION =
  "Enable Bluesky DM/chat access as a separate add-on. AT Protocol currently exposes Bluesky chat through a transitional chat scope, so Skywire treats it as explicit extra consent instead of bundling it into any tier.";

export const SKYWIRE_CHAT_PERMISSION_WARNING =
  "DM access is not needed for timeline, posting, likes, reposts, follows, profile updates, or Skywire Signals. Enable it only when you want Skywire DM features.";

export function normalizeSkywirePermissionTier(value: unknown): SkywirePermissionTier {
  const raw = String(value || "").trim().toLowerCase();
  return SKYWIRE_PERMISSION_TIER_KEYS.includes(raw as SkywirePermissionTier)
    ? (raw as SkywirePermissionTier)
    : SKYWIRE_DEFAULT_PERMISSION_TIER;
}

export function parseScopeSet(scopes: string | null | undefined): Set<string> {
  return new Set(
    String(scopes || "")
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

export function buildSkywireAtprotoScopes(
  tierInput: unknown,
  chatEnabledInput: unknown = false
): string[] {
  const tier = normalizeSkywirePermissionTier(tierInput);
  const chatEnabled =
    chatEnabledInput === true ||
    chatEnabledInput === "true" ||
    chatEnabledInput === "1" ||
    chatEnabledInput === 1;
  const scopes =
    tier === "be-bold"
      ? [ATPROTO_BASE_SCOPE, ATPROTO_TRANSITION_GENERIC_SCOPE]
      : [
          ...SKYWIRE_READ_SCOPES,
          ...(tier === "be-social" || tier === "be-heard" ? SKYWIRE_SOCIAL_ACTION_SCOPES : []),
          ...(tier === "be-heard" ? SKYWIRE_CREATOR_SCOPES : []),
        ];

  if (chatEnabled) {
    scopes.push(ATPROTO_TRANSITION_GENERIC_SCOPE, ATPROTO_CHAT_SCOPE);
  }

  return Array.from(new Set(scopes));
}

export function buildSkywireAtprotoScope(
  tierInput: unknown,
  chatEnabledInput: unknown = false
): string {
  return buildSkywireAtprotoScopes(tierInput, chatEnabledInput).join(" ");
}

export function buildSkywireAtprotoMaxScope(): string {
  return Array.from(
    new Set([
      ...SKYWIRE_READ_SCOPES,
      ...SKYWIRE_SOCIAL_ACTION_SCOPES,
      ...SKYWIRE_CREATOR_SCOPES,
      ATPROTO_TRANSITION_GENERIC_SCOPE,
      ATPROTO_CHAT_SCOPE,
    ])
  ).join(" ");
}

export function hasAtprotoScope(scopes: string | null | undefined, scope: string): boolean {
  return parseScopeSet(scopes).has(scope);
}

export function grantedSkywireCapabilities(scopes: string | null | undefined): Set<SkywirePermissionCapability> {
  const granted = parseScopeSet(scopes);
  const hasGeneric = granted.has(ATPROTO_TRANSITION_GENERIC_SCOPE);
  const hasAll = (required: readonly string[]) => required.every((scope) => granted.has(scope));
  const capabilities = new Set<SkywirePermissionCapability>(["identity"]);

  if (hasGeneric || hasAll(SKYWIRE_READ_SCOPES)) {
    capabilities.add("publicRead");
    capabilities.add("homeTimeline");
    capabilities.add("notifications");
  }
  if (hasGeneric || hasAll(SKYWIRE_SOCIAL_ACTION_SCOPES)) {
    capabilities.add("socialActions");
  }
  if (hasGeneric || granted.has("repo:app.bsky.feed.post")) {
    capabilities.add("compose");
  }
  if (hasGeneric || granted.has("repo:app.bsky.actor.profile")) {
    capabilities.add("profileWrite");
  }
  if (hasGeneric || granted.has("repo:app.wtfgameshow.skywire.signal")) {
    capabilities.add("signals");
  }
  if (granted.has(ATPROTO_CHAT_SCOPE)) {
    capabilities.add("chat");
  }

  return capabilities;
}

export function inferSkywirePermissionTier(scopes: string | null | undefined): SkywirePermissionTier {
  const granted = parseScopeSet(scopes);
  if (granted.has(ATPROTO_TRANSITION_GENERIC_SCOPE)) return "be-bold";
  const capabilities = grantedSkywireCapabilities(scopes);
  if (capabilities.has("compose") || capabilities.has("profileWrite") || capabilities.has("signals")) {
    return "be-heard";
  }
  if (capabilities.has("socialActions")) return "be-social";
  return "be-safe";
}

export function skywirePermissionTierLabel(tierInput: unknown): string {
  const tier = normalizeSkywirePermissionTier(tierInput);
  return SKYWIRE_PERMISSION_TIER_OPTIONS.find((option) => option.key === tier)?.title || "Be Social";
}
