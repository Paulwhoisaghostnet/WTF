export type WAccount = {
  userId: number;
  username: string;
  displayName: string | null;
  twitterHandle: string;
  profileUrl: string;
};

export type WMedia = {
  type: string;
  url: string | null;
  previewUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export type WLink = {
  url: string;
  expandedUrl: string | null;
  displayUrl: string | null;
  preview: {
    finalUrl: string;
    canonicalUrl: string;
    domain: string;
    siteName: string | null;
    title: string;
    description: string | null;
    imageUrl: string | null;
    isObjkt: boolean;
  } | null;
};

export type WPost = {
  id: string;
  text: string;
  displayText: string;
  createdAt: string;
  url: string;
  media: WMedia[];
  links: WLink[];
  author: {
    userId: number;
    username: string;
    displayName: string | null;
    twitterHandle: string;
    name: string | null;
    avatarUrl: string | null;
    tezosIdentities?: Array<{
      twitterHandle: string;
      tezosAddress: string;
      alias: string | null;
      tzDomain: string | null;
      source: string;
      confidence: string;
    }>;
  };
  metrics: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
};

export type WPostMediaAttachment = {
  id: string;
  name: string;
};

export type WTimelineResponse = {
  source: "x-api-v2" | "links-only" | "db-cache";
  refreshedAt: string;
  canReplyInline: boolean;
  accounts: WAccount[];
  timeline: WPost[];
  diagnostics?: {
    message?: string;
    skippedAccounts?: number;
    cachedAt?: string;
    fromCache?: boolean;
    rateLimitedUntil?: number | null;
  };
};

export type WCapabilityResponse = {
  oauth2Configured: boolean;
  platformAccountConfigured: boolean;
  platformAccountSource?:
    | "env-encrypted"
    | "env-raw"
    | "user-record"
    | "none";
  platformAccountReason?:
    | "no_handle_configured"
    | "no_user_with_handle"
    | "user_no_oauth2_token"
    | "user_missing_dm_read_scope"
    | "user_token_refresh_failed";
  platformAccountHandle?: string;
  groupchatConfigured: boolean;
  groupchatIds?: string[];
  connected: boolean;
  canUseAdminControls: boolean;
  scopes: string[];
  defaultAccountHandle: string;
  tiers: Array<{
    key: string;
    label: string;
    description: string;
    scopes: string[];
    enables: string[];
  }>;
  capabilities: Array<{
    key: string;
    label: string;
    scopes: string[];
    available: boolean;
    enabled: boolean;
    note?: string;
  }>;
};

export type WFollowsSummaryResponse = {
  profile: {
    id: string;
    username: string | null;
    name: string | null;
    profileImageUrl: string | null;
    followersCount: number;
    followingCount: number;
    tweetCount: number;
    listedCount: number;
  };
};

export type WFollowUser = {
  id: string;
  username: string | null;
  name: string | null;
  profileImageUrl: string | null;
  followersCount: number;
  followingCount: number;
};

export type WFollowsListResponse = {
  type: "followers" | "following";
  users: WFollowUser[];
  resultCount: number;
  nextToken: string | null;
  previousToken: string | null;
  planGated: boolean;
};

export type WDmMedia = {
  type: string;
  url: string | null;
  previewUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export type WGroupchatMessage = {
  id: string;
  text: string;
  createdAt: string | null;
  media?: WDmMedia[];
  sender: {
    id: string | null;
    username: string | null;
    name: string | null;
    profileImageUrl: string | null;
  };
};

export type WGroupchatResponse = {
  configured: boolean;
  conversationId?: string | null;
  conversation?: WAdminDmConversation | null;
  readonly: boolean;
  canWrite: boolean;
  defaultAccountHandle?: string;
  messages: WGroupchatMessage[];
  chats?: Array<{
    configured: boolean;
    conversationId: string | null;
    conversation: WAdminDmConversation | null;
    messages: WGroupchatMessage[];
    rateLimitedUntil?: number | null;
    cachedAt?: number;
    diagnostics?: {
      message?: string;
      rateLimited?: boolean;
    } | null;
  }>;
  rateLimitedUntil?: number | null;
  cachedAt?: number;
  diagnostics?: {
    message?: string;
    rateLimited?: boolean;
  } | null;
};

export type WAdminDmConversation = {
  id: string;
  type: string | null;
  name: string | null;
  createdAt: string | null;
  participantCount: number;
  participants: Array<{
    id: string;
    username: string | null;
    name: string | null;
    profileImageUrl: string | null;
  }>;
};

export type WAdminDmConversationsResponse = {
  currentConversationId: string | null;
  currentConversationIds?: string[];
  conversations: WAdminDmConversation[];
  directConversations?: WAdminDmConversation[];
  totalDiscovered?: number;
  diagnostics?: string;
  discoveryError?: string;
};

export type WAdminStreamRulesResponse = {
  handles: string[];
  handleSources?: {
    eligibleCount: number;
    fileCount: number;
    settingsCount: number;
    skippedEligibleHandles: number;
    filePath: string;
    fileMissing: boolean;
    fileError: string | null;
  };
  managedRulesOnX: Array<{ id: string; value: string; tag?: string }>;
  xRulesError?: string | null;
};

export type WAdminStreamRulesPutResponse = {
  ok: boolean;
  handles: string[];
  skippedHandles?: number;
  handleSources?: WAdminStreamRulesResponse["handleSources"];
  deletedRules: number;
  addedRules: number;
};

export type WAdminStreamStatusResponse = {
  bearerConfigured: boolean;
  enabled: boolean;
  connected: boolean;
  reconnecting: boolean;
  postsReceived: number;
  backoffMs: number;
  lastError: string | null;
  startedAt?: number | null;
  lastEventAt?: number | null;
  lastConnectAt?: number | null;
  lastRuleSyncAt?: number | null;
  lastRuleSyncReason?: string | null;
  lastRuleHandleCount?: number;
  startedAtIso?: string | null;
  lastEventAtIso?: string | null;
  lastConnectAtIso?: string | null;
  lastRuleSyncAtIso?: string | null;
};

export type WUserDmConversation = {
  id: string;
  type: string | null;
  name: string | null;
  createdAt: string | null;
  participantCount: number;
  peers: Array<{
    userId: number | null;
    username: string | null;
    displayName: string | null;
    twitterId: string;
    twitterHandle: string | null;
    xUsername?: string | null;
    xName?: string | null;
    isWtfUser?: boolean;
  }>;
};

export type WUserDmsResponse = {
  conversations: WUserDmConversation[];
  filtered: boolean;
  policy: string;
  rateLimitedUntil?: number | null;
  cachedAt?: number;
  diagnostics?: { message?: string; rateLimited?: boolean } | null;
};

export type WUserDmMessagesResponse = {
  conversation: WUserDmConversation | null;
  messages: Array<
    WGroupchatMessage & {
      sender: WGroupchatMessage["sender"] & {
        wtfUserId?: number | null;
        wtfUsername?: string | null;
        wtfDisplayName?: string | null;
      };
    }
  >;
  rateLimitedUntil?: number | null;
  cachedAt?: number;
  diagnostics?: { message?: string; rateLimited?: boolean } | null;
};

export type WSpace = {
  id: string;
  title: string | null;
  state: string | null;
  scheduledStart: string | null;
  participantCount: number;
  createdAt: string | null;
  url: string;
};

export type WSpacesResponse = {
  spaces: WSpace[];
  creatorHandle?: string;
  creatorId?: string;
  diagnostics?: string;
  spacesError?: string;
};

export type WView = "timeline" | "messages" | "spaces" | "settings";

export type TwitterOAuth2Diagnostics = {
  clientIdConfigured: boolean;
  clientIdLast4: string | null;
  clientSecretConfigured: boolean;
  clientKind?: "confidential" | "public" | "unknown";
  redirectUri: string;
  configuredRedirectOverride: string | null;
  publicSiteUrl: string | null;
  profileScopes: string[];
  tiers: Record<string, string[]>;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  apiPlan?: {
    notice: string;
    consoleUrl: string;
    legacyPortalUrl?: string;
    pricingUrl: string;
    scopesUrl: string;
    permissionsNote: string;
    fixOrder?: string[];
  };
};

export type TwitterOAuth2SelfTest = {
  ok: boolean;
  configured: boolean;
  status?: number;
  probeUrl?: string;
  body?: unknown;
  bodyRaw?: string;
  interpretation?: string;
  message?: string;
  error?: string;
};

export type CachedPreview = {
  finalUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  domain: string;
  siteName: string | null;
  isObjkt?: boolean;
};
