import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, Checkbox, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type WAccount = {
  userId: number;
  username: string;
  displayName: string | null;
  twitterHandle: string;
  profileUrl: string;
};

type WMedia = {
  type: string;
  url: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
};

type WLink = {
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

type WPost = {
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
  };
  metrics: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
};

type WTimelineResponse = {
  source: "x-api-v2" | "links-only";
  refreshedAt: string;
  canReplyInline: boolean;
  accounts: WAccount[];
  timeline: WPost[];
  diagnostics?: {
    message?: string;
    skippedAccounts?: number;
  };
};

type WCapabilityResponse = {
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

type WFollowsSummaryResponse = {
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

type WFollowUser = {
  id: string;
  username: string | null;
  name: string | null;
  profileImageUrl: string | null;
  followersCount: number;
  followingCount: number;
};

type WFollowsListResponse = {
  type: "followers" | "following";
  users: WFollowUser[];
  resultCount: number;
  nextToken: string | null;
  previousToken: string | null;
  planGated: boolean;
};

type WGroupchatMessage = {
  id: string;
  text: string;
  createdAt: string | null;
  sender: {
    id: string | null;
    username: string | null;
    name: string | null;
    profileImageUrl: string | null;
  };
};

type WGroupchatResponse = {
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
    diagnostics?: {
      message?: string;
    } | null;
  }>;
  diagnostics?: {
    message?: string;
  } | null;
};

type WAdminDmConversation = {
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

type WAdminDmConversationsResponse = {
  currentConversationId: string | null;
  currentConversationIds?: string[];
  conversations: WAdminDmConversation[];
  diagnostics?: string;
};

type WUserDmConversation = {
  id: string;
  type: string | null;
  name: string | null;
  createdAt: string | null;
  participantCount: number;
  peers: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    twitterId: string;
    twitterHandle: string | null;
  }>;
};

type WUserDmsResponse = {
  conversations: WUserDmConversation[];
  filtered: boolean;
  policy: string;
};

type WUserDmMessagesResponse = {
  conversation: WUserDmConversation;
  messages: Array<
    WGroupchatMessage & {
      sender: WGroupchatMessage["sender"] & {
        wtfUserId?: number | null;
        wtfUsername?: string | null;
        wtfDisplayName?: string | null;
      };
    }
  >;
};

type WSpace = {
  id: string;
  title: string | null;
  state: string | null;
  scheduledStart: string | null;
  participantCount: number;
  createdAt: string | null;
  url: string;
};

type WSpacesResponse = {
  spaces: WSpace[];
  creatorHandle?: string;
  creatorId?: string;
  diagnostics?: string;
};

type WView = "timeline" | "messages" | "spaces" | "settings";

type TwitterOAuth2Diagnostics = {
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

type TwitterOAuth2SelfTest = {
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

const Shell = styled.div<{ $night: boolean }>`
  background: ${({ $night }) =>
    $night
      ? "repeating-linear-gradient(0deg, #000000 0px, #000000 16px, #000000 16px, #000000 32px)"
      : "repeating-linear-gradient(0deg, #f7f9fb 0px, #f7f9fb 16px, #edf1f5 16px, #edf1f5 32px)"};
  border: 1px solid ${({ $night }) => ($night ? "#2c3e50" : "#a6adb5")};
  color: ${({ $night }) => ($night ? "#e7edf7" : "#10161e")};
  padding: 10px;

  textarea,
  select,
  input {
    background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
    color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
    border: 1px solid ${({ $night }) => ($night ? "#4c6788" : "#9cabbb")};
  }

  textarea::placeholder,
  input::placeholder {
    color: ${({ $night }) => ($night ? "#8ea2bd" : "#647486")};
  }

  option {
    background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
    color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
  }

  a {
    color: ${({ $night }) => ($night ? "#9ec5ff" : "#0b4da6")};
  }
`;

const HeaderBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const WBadge = styled.div<{ $night: boolean }>`
  width: 24px;
  height: 24px;
  border: 1px solid ${({ $night }) => ($night ? "#c7d3e5" : "#111")};
  background: ${({ $night }) => ($night ? "#141b26" : "#111")};
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  line-height: 22px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  box-shadow: inset 0 0 0 1px ${({ $night }) => ($night ? "#2d3c50" : "#444")};
`;

const TitleWrap = styled.div`
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.2px;
`;

const Subtitle = styled.div<{ $night: boolean }>`
  font-size: 11px;
  margin-top: 2px;
  color: ${({ $night }) => ($night ? "#aebfd8" : "#3f4b57")};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const ViewNav = styled.div<{ $night: boolean }>`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin: 8px 0 10px;
  padding: 6px;
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#101a28" : "#eef3f8")};
`;

const MainSurface = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#0d1726" : "#ffffff")};
  padding: 8px;
  min-height: 360px;
`;

const PaneGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr;
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const ConversationList = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#101a28" : "#f4f7fa")};
  padding: 6px;
`;

const ConversationButton = styled.button<{ $night: boolean; $active?: boolean }>`
  width: 100%;
  text-align: left;
  margin-bottom: 5px;
  padding: 6px;
  border: 1px solid
    ${({ $night, $active }) => ($active ? ($night ? "#9ec5ff" : "#0b4da6") : $night ? "#324863" : "#9ca6b1")};
  background: ${({ $night, $active }) =>
    $active ? ($night ? "#193657" : "#dcecff") : $night ? "#182334" : "#fff"};
  color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
`;

const Small = styled.span<{ $night?: boolean }>`
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#b8c5da" : "#3c4956")};
`;

const AccountGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 6px;
`;

const AccountChip = styled.a<{ $night: boolean }>`
  display: inline-block;
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#182334" : "#f4f7fa")};
  padding: 5px 6px;
  font-size: 12px;
  color: ${({ $night }) => ($night ? "#9ec5ff" : "#0b4da6")};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const PostCard = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#2f425b" : "#aab5bf")};
  background: ${({ $night }) => ($night ? "#16181c" : "#ffffff")};
  margin-bottom: 10px;
  padding: 9px;
  box-shadow: ${({ $night }) =>
    $night ? "inset 0 0 0 1px #213146" : "inset 0 0 0 1px #e7eef5"};
`;

const PostHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Avatar = styled.div<{ $night: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid ${({ $night }) => ($night ? "#4b6787" : "#9cb0c4")};
  background: ${({ $night }) => ($night ? "#223650" : "#dce8f4")};
  color: ${({ $night }) => ($night ? "#d5e9ff" : "#16395f")};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
`;

const PostText = styled.p<{ $night: boolean }>`
  margin: 8px 0;
  white-space: pre-wrap;
  line-height: 1.4;
  font-size: 13px;
  color: ${({ $night }) => ($night ? "#e5edf8" : "#131a22")};
`;

const Stats = styled.div<{ $night: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#a5bad7" : "#425364")};
`;

const LinksRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 8px;
`;

const LinkChip = styled.a<{ $night: boolean }>`
  display: inline-block;
  max-width: 100%;
  border: 1px solid ${({ $night }) => ($night ? "#385074" : "#9ba8b6")};
  background: ${({ $night }) => ($night ? "#19263a" : "#f4f7fb")};
  color: ${({ $night }) => ($night ? "#a6cbff" : "#0b4ca3")};
  text-decoration: none;
  padding: 3px 6px;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    text-decoration: underline;
  }
`;

const LinkPreviewList = styled.div`
  display: grid;
  gap: 6px;
  margin: 6px 0 8px;
`;

const LinkPreviewCard = styled.a<{ $night: boolean; $objkt?: boolean }>`
  display: grid;
  grid-template-columns: 104px 1fr;
  gap: 8px;
  align-items: stretch;
  border: 1px solid
    ${({ $night, $objkt }) =>
      $objkt ? ($night ? "#a46f2e" : "#b37a34") : $night ? "#425c7d" : "#9eb0c1"};
  background: ${({ $night, $objkt }) =>
    $objkt
      ? $night
        ? "linear-gradient(180deg, #2d2220 0%, #201816 100%)"
        : "linear-gradient(180deg, #fff2dc 0%, #f4e3c6 100%)"
      : $night
        ? "#17253a"
        : "#f7fbff"};
  color: inherit;
  text-decoration: none;
  overflow: hidden;

  &:hover {
    filter: brightness(1.03);
  }
`;

const LinkPreviewImageWrap = styled.div<{ $night: boolean }>`
  min-height: 82px;
  max-height: 96px;
  background: ${({ $night }) => ($night ? "#0f1a2a" : "#e8eff6")};
  border-right: 1px solid ${({ $night }) => ($night ? "#3d5572" : "#b7c5d3")};
  overflow: hidden;
`;

const LinkPreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const LinkPreviewBody = styled.div`
  min-width: 0;
  padding: 6px 8px 6px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
`;

const LinkPreviewTitle = styled.div`
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const LinkPreviewDescription = styled.div<{ $night: boolean }>`
  font-size: 11px;
  line-height: 1.3;
  color: ${({ $night }) => ($night ? "#b8c9e0" : "#4b5b6b")};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ObjktBadge = styled.span<{ $night: boolean }>`
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  border: 1px solid ${({ $night }) => ($night ? "#c8995c" : "#9a6828")};
  background: ${({ $night }) => ($night ? "#3d2b1a" : "#f3ddb8")};
  color: ${({ $night }) => ($night ? "#ffdcae" : "#6f420a")};
  padding: 1px 4px;
`;

const MediaGrid = styled.div<{ $count: number }>`
  display: grid;
  gap: 6px;
  margin: 6px 0 8px;
  grid-template-columns: ${({ $count }) =>
    $count > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"};
`;

const MediaTile = styled.a<{ $night: boolean }>`
  display: block;
  position: relative;
  border: 1px solid ${({ $night }) => ($night ? "#476489" : "#9fb2c6")};
  background: ${({ $night }) => ($night ? "#0d1623" : "#edf3f9")};
  min-height: 120px;
  overflow: hidden;
  text-decoration: none;
`;

const MediaImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  max-height: 320px;
  object-fit: cover;
`;

const MediaBadge = styled.span<{ $night: boolean }>`
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  padding: 2px 5px;
  border: 1px solid ${({ $night }) => ($night ? "#7f9bc0" : "#6f8fb0")};
  background: ${({ $night }) => ($night ? "#183357" : "#dde9f5")};
  color: ${({ $night }) => ($night ? "#dcecff" : "#153a61")};
`;

const ReplyArea = styled.div`
  margin-top: 8px;
`;

const CapabilityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px;
`;

const CapabilityCard = styled.div<{ $night: boolean; $enabled?: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night, $enabled }) =>
    $enabled ? ($night ? "#17321f" : "#e8f8e8") : $night ? "#182334" : "#f4f7fa"};
  padding: 6px;
  font-size: 11px;
`;

const ChatList = styled.div<{ $night: boolean }>`
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
  padding: 8px;
  margin-bottom: 8px;
`;

const ChatMessage = styled.div`
  margin-bottom: 8px;
`;

function replyIntentUrl(postId: string): string {
  const q = new URLSearchParams({ in_reply_to: postId });
  return `https://x.com/intent/tweet?${q.toString()}`;
}

function isMediaLink(link: WLink): boolean {
  const value = `${link.expandedUrl || ""} ${link.displayUrl || ""} ${link.url || ""}`.toLowerCase();
  return (
    value.includes("pic.x.com/") ||
    value.includes("pic.twitter.com/") ||
    value.includes("/photo/") ||
    value.includes("/video/")
  );
}

function displayLinkText(link: WLink): string {
  return (link.displayUrl || link.expandedUrl || link.url || "").trim();
}

function linkHref(link: WLink): string {
  return link.preview?.canonicalUrl || link.expandedUrl || link.url;
}

function renderAvatarContent(post: WPost) {
  if (post.author.avatarUrl) {
    return (
      <img
        src={post.author.avatarUrl}
        alt={`${post.author.twitterHandle} avatar`}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  return post.author.twitterHandle.slice(0, 1).toUpperCase();
}

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0)
  );
}

export function W() {
  const { user, hasPermission } = useAuth();
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [quoteOpenFor, setQuoteOpenFor] = useState<string | null>(null);
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [replySuccess, setReplySuccess] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [actionSuccess, setActionSuccess] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<WView>("timeline");
  const [selectedOAuthTier, setSelectedOAuthTier] = useState("read");
  const [groupchatDraft, setGroupchatDraft] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [postMedia, setPostMedia] = useState<Array<{ id: string; name: string }>>([]);
  const [postStatus, setPostStatus] = useState("");
  const [platformDmTarget, setPlatformDmTarget] = useState<number | null>(null);
  const [platformDmDraft, setPlatformDmDraft] = useState("");
  const [platformDmStatus, setPlatformDmStatus] = useState("");
  const [selectedGroupchatId, setSelectedGroupchatId] = useState("");
  const [selectedAdminGroupchatIds, setSelectedAdminGroupchatIds] = useState<string[]>([]);
  const [manualGroupchatIds, setManualGroupchatIds] = useState("");
  const [selectedDmConversationId, setSelectedDmConversationId] = useState("");
  const [userDmDraft, setUserDmDraft] = useState("");
  const [directDmTarget, setDirectDmTarget] = useState<number | null>(null);
  const [directDmDraft, setDirectDmDraft] = useState("");
  const [userDmStatus, setUserDmStatus] = useState("");
  const [followTarget, setFollowTarget] = useState("");
  const [followStatus, setFollowStatus] = useState("");
  const [followListType, setFollowListType] = useState<"followers" | "following">("followers");
  const [followListRequested, setFollowListRequested] = useState(false);
  const [nightMode, setNightMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("w:night-mode");
    const nightDefaultApplied = window.localStorage.getItem("w:night-mode-default-v2") === "1";
    return !nightDefaultApplied || saved === null ? true : saved === "1";
  });
  const [oauthFlash, setOauthFlash] = useState<{
    kind: "ok" | "err";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("w:night-mode-default-v2", "1");
    window.localStorage.setItem("w:night-mode", nightMode ? "1" : "0");
  }, [nightMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const verified = params.get("verified");
    const err = params.get("error");
    if (!verified && !err) return;

    if (verified === "twitter_oauth2") {
      setOauthFlash({ kind: "ok", message: "X account connected to W." });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_session") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed: sign-in session was lost between start and callback. Disable cookie/SW blockers and try again.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_state") {
      setOauthFlash({
        kind: "err",
        message: "Twitter verification failed: OAuth state mismatch. Start the connect flow again in this tab.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_expired") {
      setOauthFlash({
        kind: "err",
        message: "Twitter verification timed out. Authorise within 10 minutes and try again.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_token") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed at token exchange. Check that the X Developer Portal callback URL exactly matches https://<site>/api/auth/twitter-oauth2/callback and that TWITTER_CLIENT_ID/TWITTER_CLIENT_SECRET belong to that app.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_scope_missing") {
      const missing = params.get("missing") || "required W scopes";
      setOauthFlash({
        kind: "err",
        message:
          `X issued a token but did not grant: ${missing}. ` +
          "For Full W participation, open console.x.com → your app → User authentication settings and set App permissions to 'Read and write and Direct message', save, regenerate the OAuth2 Client ID/Secret if needed, then reconnect from W Settings.",
      });
      setActiveView("settings");
    } else if (err && err.startsWith("twitter_oauth2_me")) {
      const bucket = err.slice("twitter_oauth2_me".length).replace(/^_/, "");
      let hint = "Check server [auth] logs for the raw response body.";
      if (bucket === "401")
        hint =
          "X returned 401: token rejected. users.read was likely not among " +
          "the granted scopes — re-check the scopes checklist in the X " +
          "Developer Console.";
      else if (bucket === "402")
        hint =
          "X returned 402: Pay-Per-Use credits required. Activate the app " +
          "on the new plan in the Developer Console (Feb 6 2026 launch) " +
          "and confirm the $10 voucher / payment method.";
      else if (bucket === "403")
        hint =
          "X returned 403. The new Console is at console.x.com and " +
          "'Projects & Apps' is gone — apps are a flat list now. Usual " +
          "cause: User authentication settings were edited after the " +
          "Client ID/Secret were issued, so they're stale. Fix: open " +
          "console.x.com → your app → User authentication settings → " +
          "Save, then Keys and tokens → Regenerate OAuth 2.0 Client " +
          "ID + Secret, update server env, redeploy. Run the admin " +
          "self-test below to confirm v2 access before retrying.";
      else if (bucket === "429") hint = "X returned 429: rate limited, retry in a minute.";
      else if (bucket === "5xx") hint = "X returned 5xx: upstream X issue, retry later.";
      setOauthFlash({
        kind: "err",
        message: `Token OK but /users/me failed${bucket ? ` (HTTP ${bucket})` : ""}. ${hint}`,
      });
      setActiveView("settings");
    } else if (err && err.startsWith("twitter_oauth2_x_")) {
      const xCode = err.slice("twitter_oauth2_x_".length);
      setOauthFlash({
        kind: "err",
        message:
          `Twitter rejected the authorisation (${xCode || "unknown"}). ` +
          "Since X's Feb 6 2026 Pay-Per-Use launch, apps that were on the " +
          "legacy Free/Basic tier must be opted-in through the new " +
          "Developer Console and must have the requested scopes + callback " +
          "URL whitelisted before /i/oauth2/authorize will succeed. See " +
          "the Pay-Per-Use notice below.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2" || err === "twitter_oauth2_not_configured") {
      setOauthFlash({
        kind: "err",
        message: "Twitter verification failed. See server [auth] twitter oauth2 log entries for details.",
      });
      setActiveView("settings");
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["w", "timeline"],
    queryFn: () => api.get<WTimelineResponse>("/api/w/timeline"),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const { data: capabilities } = useQuery({
    queryKey: ["w", "capabilities"],
    queryFn: () => api.get<WCapabilityResponse>("/api/w/capabilities"),
    staleTime: 60_000,
  });

  const {
    data: followsSummary,
    refetch: refetchFollowsSummary,
  } = useQuery({
    queryKey: ["w", "follows", "summary"],
    queryFn: () => api.get<WFollowsSummaryResponse>("/api/w/follows/summary"),
    enabled: Boolean(capabilities?.connected),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const {
    data: followsList,
    error: followsListError,
    isFetching: followsListFetching,
    refetch: refetchFollowsList,
  } = useQuery({
    queryKey: ["w", "follows", followListType],
    queryFn: () => api.get<WFollowsListResponse>(`/api/w/follows?type=${followListType}&limit=100`),
    enabled: activeView === "settings" && followListRequested,
    retry: false,
    staleTime: 60_000,
  });

  const canUseWAdminControls = Boolean(
    user?.role === "admin" ||
      (capabilities?.canUseAdminControls &&
        hasPermission("access_admin_panel") &&
        hasPermission("manage_roles"))
  );
  const canUseWDirectMessages = Boolean(
    capabilities?.capabilities.find((capability) => capability.key === "direct_messages")?.enabled
  );

  const {
    data: groupchat,
    isFetching: groupchatFetching,
    refetch: refetchGroupchat,
  } = useQuery({
    queryKey: ["w", "groupchat"],
    queryFn: () => api.get<WGroupchatResponse>("/api/w/groupchat"),
    enabled: !!capabilities?.platformAccountConfigured,
    staleTime: 15_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  const {
    data: adminDmConversations,
    error: adminDmConversationsError,
    isFetching: adminDmConversationsFetching,
    refetch: refetchAdminDmConversations,
  } = useQuery({
    queryKey: ["w", "admin", "dm-conversations"],
    queryFn: () =>
      api.get<WAdminDmConversationsResponse>("/api/w/admin/dm-conversations?limit=100"),
    enabled: Boolean(
      canUseWAdminControls &&
        capabilities?.platformAccountConfigured &&
        capabilities?.connected
    ),
    retry: false,
    staleTime: 60_000,
  });

  const {
    data: oauthDiagnostics,
    isFetching: oauthDiagnosticsFetching,
    error: oauthDiagnosticsError,
    refetch: refetchOauthDiagnostics,
  } = useQuery<TwitterOAuth2Diagnostics>({
    queryKey: ["auth", "twitter-oauth2", "diagnostics"],
    queryFn: () =>
      api.get<TwitterOAuth2Diagnostics>("/api/auth/twitter-oauth2/diagnostics"),
    enabled: activeView === "settings" && canUseWAdminControls,
    retry: false,
    staleTime: 30_000,
  });

  const selfTestMutation = useMutation({
    mutationFn: () =>
      api.get<TwitterOAuth2SelfTest>("/api/auth/twitter-oauth2/diagnostics/self-test"),
  });

  const {
    data: dmDiagnostics,
    isFetching: dmDiagnosticsFetching,
    refetch: refetchDmDiagnostics,
  } = useQuery({
    queryKey: ["w", "dm-diagnostics"],
    queryFn: () => api.get<any>("/api/w/dm-diagnostics"),
    enabled: activeView === "settings" && canUseWAdminControls,
    retry: false,
    staleTime: 30_000,
  });

  const {
    data: userDms,
    error: userDmsError,
    isFetching: userDmsFetching,
    refetch: refetchUserDms,
  } = useQuery({
    queryKey: ["w", "user-dms"],
    queryFn: () => api.get<WUserDmsResponse>("/api/w/user-dms?limit=100"),
    enabled: activeView === "messages" && canUseWDirectMessages,
    retry: false,
    staleTime: 30_000,
  });

  const {
    data: userDmMessages,
    error: userDmMessagesError,
    isFetching: userDmMessagesFetching,
    refetch: refetchUserDmMessages,
  } = useQuery({
    queryKey: ["w", "user-dms", selectedDmConversationId],
    queryFn: () =>
      api.get<WUserDmMessagesResponse>(
        `/api/w/user-dms/${encodeURIComponent(selectedDmConversationId)}/messages?limit=100`
      ),
    enabled: activeView === "messages" && Boolean(selectedDmConversationId),
    retry: false,
    staleTime: 15_000,
    refetchInterval: activeView === "messages" && selectedDmConversationId ? 20_000 : false,
  });

  const {
    data: spacesData,
    isFetching: spacesFetching,
    refetch: refetchSpaces,
  } = useQuery({
    queryKey: ["w", "spaces"],
    queryFn: () => api.get<WSpacesResponse>("/api/w/spaces"),
    enabled: activeView === "spaces" && Boolean(capabilities?.connected),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    const currentIds = adminDmConversations?.currentConversationIds?.length
      ? adminDmConversations.currentConversationIds
      : adminDmConversations?.currentConversationId
        ? [adminDmConversations.currentConversationId]
        : [];
    if (currentIds.length > 0) {
      setSelectedAdminGroupchatIds(currentIds);
    }
  }, [adminDmConversations?.currentConversationId, adminDmConversations?.currentConversationIds]);

  useEffect(() => {
    const conversations = userDms?.conversations || [];
    if (!selectedDmConversationId && conversations[0]?.id) {
      setSelectedDmConversationId(conversations[0].id);
    }
    if (
      selectedDmConversationId &&
      conversations.length > 0 &&
      !conversations.some((conversation) => conversation.id === selectedDmConversationId)
    ) {
      setSelectedDmConversationId(conversations[0].id);
    }
  }, [selectedDmConversationId, userDms?.conversations]);

  useEffect(() => {
    const chats = groupchat?.chats || [];
    const firstVisible = chats.find((chat) => chat.configured && chat.conversationId)?.conversationId || "";
    if (!selectedGroupchatId && firstVisible) {
      setSelectedGroupchatId(firstVisible);
    }
    if (
      selectedGroupchatId &&
      chats.length > 0 &&
      !chats.some((chat) => chat.conversationId === selectedGroupchatId)
    ) {
      setSelectedGroupchatId(firstVisible);
    }
  }, [groupchat?.chats, selectedGroupchatId]);

  const replyMutation = useMutation({
    mutationFn: ({ postId, text }: { postId: string; text: string }) =>
      api.post<{ ok: boolean; id: string; url: string }>("/api/w/reply", {
        postId,
        text,
      }),
    onSuccess: (result, vars) => {
      setReplyErrors((prev) => ({ ...prev, [vars.postId]: "" }));
      setReplySuccess((prev) => ({ ...prev, [vars.postId]: result.url }));
      setReplyDrafts((prev) => ({ ...prev, [vars.postId]: "" }));
      setReplyOpenFor(null);
    },
    onError: (err, vars) => {
      const message = err instanceof Error ? err.message : "Reply failed";
      setReplyErrors((prev) => ({ ...prev, [vars.postId]: message }));
      setReplySuccess((prev) => ({ ...prev, [vars.postId]: "" }));
    },
  });

  const engageMutation = useMutation({
    mutationFn: async (vars: {
      action: "like" | "repost" | "quote";
      postId: string;
      text?: string;
    }) => {
      if (vars.action === "like") {
        return api.post<{ ok: boolean; postId: string }>("/api/w/like", {
          postId: vars.postId,
        });
      }
      if (vars.action === "repost") {
        return api.post<{ ok: boolean; postId: string }>("/api/w/repost", {
          postId: vars.postId,
        });
      }
      return api.post<{ ok: boolean; id: string; url: string }>("/api/w/quote", {
        postId: vars.postId,
        text: vars.text || "",
      });
    },
    onSuccess: (result, vars) => {
      setActionErrors((prev) => ({ ...prev, [vars.postId]: "" }));
      if (vars.action === "quote" && "url" in result && typeof result.url === "string") {
        setActionSuccess((prev) => ({ ...prev, [vars.postId]: `Quote posted: ${result.url}` }));
        setQuoteOpenFor(null);
        setQuoteDrafts((prev) => ({ ...prev, [vars.postId]: "" }));
      } else if (vars.action === "like") {
        setActionSuccess((prev) => ({ ...prev, [vars.postId]: "Post liked on X." }));
      } else {
        setActionSuccess((prev) => ({ ...prev, [vars.postId]: "Post reposted on X." }));
      }
      refetch();
    },
    onError: (err, vars) => {
      const message = err instanceof Error ? err.message : "Action failed";
      setActionErrors((prev) => ({ ...prev, [vars.postId]: message }));
      setActionSuccess((prev) => ({ ...prev, [vars.postId]: "" }));
    },
  });

  const groupchatMutation = useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      api.post("/api/w/groupchat/messages", { conversationId, text }),
    onSuccess: () => {
      setGroupchatDraft("");
      refetchGroupchat();
    },
  });

  const postMutation = useMutation({
    mutationFn: (payload: { text: string; mediaIds: string[] }) =>
      api.post<{ ok: boolean; url: string | null }>("/api/w/post", payload),
    onSuccess: (result) => {
      setPostDraft("");
      setPostMedia([]);
      setPostStatus(result.url ? `Post created: ${result.url}` : "Post created.");
      refetch();
    },
    onError: (err) => {
      setPostStatus(err instanceof Error ? err.message : "Post failed");
    },
  });

  const mediaUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("media", file);
      const res = await fetch("/api/w/media", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Media upload failed");
      }
      return (await res.json()) as { media: { id: string } };
    },
    onSuccess: (result, file) => {
      setPostMedia((current) => [...current, { id: result.media.id, name: file.name }].slice(0, 4));
      setPostStatus(`Attached ${file.name}`);
    },
    onError: (err) => {
      setPostStatus(err instanceof Error ? err.message : "Media upload failed");
    },
  });

  const platformDmMutation = useMutation({
    mutationFn: ({ targetUserId, text }: { targetUserId: number; text: string }) =>
      api.post("/api/w/direct-messages", { targetUserId, text }),
    onSuccess: () => {
      setPlatformDmDraft("");
      setPlatformDmStatus("Direct message sent from the WTF Gameshow X account.");
    },
    onError: (err) => {
      setPlatformDmStatus(err instanceof Error ? err.message : "Direct message failed");
    },
  });

  const saveGroupchatMutation = useMutation({
    mutationFn: (conversationIds: string[]) =>
      api.put<{ ok: boolean; conversationId: string | null; conversationIds: string[] }>("/api/w/admin/groupchat", {
        conversationIds,
      }),
    onSuccess: (result) => {
      setSelectedAdminGroupchatIds(result.conversationIds || []);
      setSelectedGroupchatId(result.conversationId || "");
      setPlatformDmStatus("W groupchat selections saved.");
      refetchGroupchat();
      refetchAdminDmConversations();
    },
    onError: (err) => {
      setPlatformDmStatus(err instanceof Error ? err.message : "Failed to save groupchat");
    },
  });

  const userDmMutation = useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      api.post(`/api/w/user-dms/${encodeURIComponent(conversationId)}/messages`, { text }),
    onSuccess: () => {
      setUserDmDraft("");
      setUserDmStatus("Message sent.");
      refetchUserDmMessages();
    },
    onError: (err) => {
      setUserDmStatus(err instanceof Error ? err.message : "Direct message failed");
    },
  });

  const directUserDmMutation = useMutation({
    mutationFn: ({ targetUserId, text }: { targetUserId: number; text: string }) =>
      api.post("/api/w/user-dms/direct", { targetUserId, text }),
    onSuccess: () => {
      setDirectDmDraft("");
      setUserDmStatus("Direct message sent.");
      refetchUserDms();
    },
    onError: (err) => {
      setUserDmStatus(err instanceof Error ? err.message : "Direct message failed");
    },
  });

  const followMutation = useMutation({
    mutationFn: ({ action, target }: { action: "follow" | "unfollow"; target: string }) =>
      api.post<{ ok: boolean; action: "follow" | "unfollow"; target: { username: string | null; id: string } }>(
        "/api/w/follows",
        { action, target }
      ),
    onSuccess: (result) => {
      const label = result.target.username ? `@${result.target.username}` : result.target.id;
      setFollowStatus(result.action === "follow" ? `Now following ${label}.` : `Unfollowed ${label}.`);
      setFollowTarget("");
      refetchFollowsSummary();
      if (followListRequested) refetchFollowsList();
    },
    onError: (err) => {
      setFollowStatus(err instanceof Error ? err.message : "Follow action failed");
    },
  });

  const posts = data?.timeline || [];
  const accounts = data?.accounts || [];
  const viewerCanReply = Boolean(data?.canReplyInline && user?.twitterVerified);
  const oauthConnectUrl = `/api/auth/twitter-oauth2?tier=${encodeURIComponent(selectedOAuthTier)}&returnTo=w`;
  const selectedTier = capabilities?.tiers.find((tier) => tier.key === selectedOAuthTier);
  const canPostInW = Boolean(
    capabilities?.capabilities.find((capability) => capability.key === "new_post")?.enabled
  );
  const canManageFollows = Boolean(
    capabilities?.capabilities.find((capability) => capability.key === "follows")?.enabled
  );
  const xProfile = followsSummary?.profile || null;
  const followsListErrorMessage = followsListError instanceof Error ? followsListError.message : "";
  const visibleGroupchats = groupchat?.chats?.length
    ? groupchat.chats
    : groupchat
      ? [
          {
            configured: groupchat.configured,
            conversationId: groupchat.conversationId || null,
            conversation: groupchat.conversation || null,
            messages: groupchat.messages || [],
            diagnostics: groupchat.diagnostics || null,
          },
        ]
      : [];
  const activeGroupchat =
    visibleGroupchats.find((chat) => chat.conversationId === selectedGroupchatId) ||
    visibleGroupchats.find((chat) => chat.configured) ||
    visibleGroupchats[0] ||
    null;
  const currentGroupchatIds = selectedAdminGroupchatIds.length
    ? selectedAdminGroupchatIds
    : adminDmConversations?.currentConversationIds?.length
      ? adminDmConversations.currentConversationIds
      : adminDmConversations?.currentConversationId
        ? [adminDmConversations.currentConversationId]
        : [];
  useEffect(() => {
    if (manualGroupchatIds || currentGroupchatIds.length > 0) return;
    setManualGroupchatIds("g1934373363226407162");
  }, [currentGroupchatIds.length, manualGroupchatIds]);

  if (isLoading) {
    return (
      <AppWindow title="W">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  const userDmConversations = userDms?.conversations || [];
  const selectedDmConversation =
    userDmConversations.find((conversation) => conversation.id === selectedDmConversationId) ||
    userDmMessages?.conversation ||
    null;
  const userDmMessageList = userDmMessages?.messages || [];
  const userDmsErrorMessage = userDmsError instanceof Error ? userDmsError.message : "";
  const adminDmConversationsErrorMessage =
    adminDmConversationsError instanceof Error ? adminDmConversationsError.message : "";
  const userDmMessagesErrorMessage =
    userDmMessagesError instanceof Error ? userDmMessagesError.message : "";
  const navItems: Array<{ key: WView; label: string; count?: number }> = [
    { key: "timeline", label: "Home", count: posts.length },
    {
      key: "messages",
      label: "Messages",
      count: visibleGroupchats.reduce((total, chat) => total + (chat.messages?.length || 0), 0) + userDmConversations.length,
    },
    { key: "spaces", label: "Spaces" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <AppWindow title="W">
      <Shell $night={nightMode}>
        <HeaderBar>
          <HeaderLeft>
            {xProfile?.profileImageUrl ? (
              <Avatar $night={nightMode} title={`@${xProfile.username || "x"} on X`} style={{ width: 32, height: 32 }}>
                <img
                  src={xProfile.profileImageUrl}
                  alt={`${xProfile.username || "X"} avatar`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Avatar>
            ) : (
              <WBadge $night={nightMode}>W</WBadge>
            )}
              <TitleWrap>
                <Title>WTF is an algo</Title>
                <Subtitle $night={nightMode}>
                  {xProfile?.username ? `@${xProfile.username}` : "Like X, but with the bloat stripped out."}
                  {xProfile ? (
                    <>
                      {" · "}
                      {formatCount(xProfile.followersCount)} followers
                      {" · "}
                      {formatCount(xProfile.followingCount)} following
                    </>
                  ) : null}
                </Subtitle>
              </TitleWrap>
          </HeaderLeft>
          <Button size="sm" onClick={() => setNightMode((v) => !v)}>
            {nightMode ? "Day mode" : "Night mode"}
          </Button>
        </HeaderBar>

        <Row style={{ marginBottom: 10 }}>
          <Small $night={nightMode}>
            Source: <strong>{data?.source || "unknown"}</strong>
            {" · "}
            Accounts: <strong>{accounts.length}</strong>
            {" · "}
            Posts: <strong>{posts.length}</strong>
            {" · "}
            Updated:{" "}
            <strong>
              {data?.refreshedAt ? new Date(data.refreshedAt).toLocaleTimeString() : "n/a"}
            </strong>
          </Small>
          <Button size="sm" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </Row>

        {data?.diagnostics?.message && (
          <p style={{ fontSize: 11, color: nightMode ? "#f5bc7b" : "#7a2f00", marginBottom: 10 }}>
            {data.diagnostics.message}
          </p>
        )}

        <ViewNav $night={nightMode}>
          {navItems.map((item) => (
            <Button
              key={item.key}
              size="sm"
              active={activeView === item.key}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
              {typeof item.count === "number" ? ` (${item.count})` : ""}
            </Button>
          ))}
        </ViewNav>

        <MainSurface $night={nightMode}>
        {oauthFlash && (
          <div
            role="status"
            style={{
              padding: 8,
              marginBottom: 8,
              fontSize: 11,
              background: oauthFlash.kind === "ok" ? "#0f3a1d" : "#3a1212",
              color: oauthFlash.kind === "ok" ? "#cdeccb" : "#ffd5d5",
              border: `1px solid ${oauthFlash.kind === "ok" ? "#2f9a4b" : "#a03737"}`,
            }}
          >
            {oauthFlash.message}
            <Button
              size="sm"
              onClick={() => setOauthFlash(null)}
              style={{ marginLeft: 8 }}
            >
              Dismiss
            </Button>
          </div>
        )}
        {activeView === "settings" && (
          <>
        <GroupBox label="X Connection" style={{ marginBottom: 10 }}>
          <Row style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Small $night={nightMode}>
                Default account:{" "}
                <strong>@{capabilities?.defaultAccountHandle || "wtfgameshow"}</strong>
                {" · "}
                OAuth2: <strong>{capabilities?.connected ? "connected" : "not connected"}</strong>
                {" · "}
                Platform DM bridge:{" "}
                <strong>{capabilities?.platformAccountConfigured ? "configured" : "missing token"}</strong>
              </Small>
              {selectedTier && (
                <p style={{ fontSize: 11, margin: "6px 0 0" }}>
                  {selectedTier.description} Enables: {selectedTier.enables.join(", ")}.
                </p>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(capabilities?.tiers || []).map((tier) => (
                <Button
                  key={tier.key}
                  size="sm"
                  active={selectedOAuthTier === tier.key}
                  onClick={() => setSelectedOAuthTier(tier.key)}
                >
                  {tier.label}
                </Button>
              ))}
              <Button
                size="sm"
                disabled={!capabilities?.oauth2Configured}
                onClick={() => {
                  window.location.href = oauthConnectUrl;
                }}
              >
                Connect OAuth2
              </Button>
            </div>
          </Row>
          <CapabilityGrid style={{ marginTop: 8 }}>
            {(capabilities?.capabilities || []).map((capability) => (
              <CapabilityCard
                key={capability.key}
                $night={nightMode}
                $enabled={capability.enabled}
                title={capability.note || capability.scopes.join(", ")}
              >
                <strong>{capability.enabled ? "Enabled" : capability.available ? "Optional" : "Unavailable"}</strong>
                {" · "}
                {capability.label}
                {capability.note ? <div style={{ marginTop: 3 }}>{capability.note}</div> : null}
              </CapabilityCard>
            ))}
          </CapabilityGrid>
        </GroupBox>

        <GroupBox label="Followers" style={{ marginBottom: 10 }}>
          <Row style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Small $night={nightMode}>
                {xProfile ? (
                  <>
                    @{xProfile.username || "connected"} has{" "}
                    <strong>{formatCount(xProfile.followersCount)}</strong> followers and follows{" "}
                    <strong>{formatCount(xProfile.followingCount)}</strong> accounts.
                  </>
                ) : (
                  "Connect X read access to show your avatar and follower counts in the W header."
                )}
              </Small>
              <p style={{ fontSize: 11, margin: "6px 0 0" }}>
                Full follower/following lists are requested only from Settings and may require X Enterprise.
                Follow/unfollow uses user-context OAuth with <code>follows.write</code>.
              </p>
            </div>
            <Button size="sm" disabled={!capabilities?.connected} onClick={() => refetchFollowsSummary()}>
              Refresh Counts
            </Button>
          </Row>
          <Row style={{ marginTop: 8 }}>
            <input
              value={followTarget}
              onChange={(e) => setFollowTarget(e.target.value)}
              placeholder="X username or user id"
              style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
            />
            <Button
              size="sm"
              disabled={!canManageFollows || !followTarget.trim() || followMutation.isPending}
              onClick={() => followMutation.mutate({ action: "follow", target: followTarget.trim() })}
            >
              Follow
            </Button>
            <Button
              size="sm"
              disabled={!canManageFollows || !followTarget.trim() || followMutation.isPending}
              onClick={() => followMutation.mutate({ action: "unfollow", target: followTarget.trim() })}
            >
              Unfollow
            </Button>
          </Row>
          {!canManageFollows && (
            <Small $night={nightMode}>Reconnect with Timeline actions to enable follow/unfollow.</Small>
          )}
          {followStatus && (
            <p style={{ fontSize: 11, color: nightMode ? "#d7e5f7" : "#273747", margin: "6px 0 0" }}>
              {followStatus}
            </p>
          )}
          <Row style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button
                size="sm"
                active={followListType === "followers"}
                onClick={() => {
                  setFollowListType("followers");
                  setFollowListRequested(true);
                }}
              >
                Load Followers
              </Button>
              <Button
                size="sm"
                active={followListType === "following"}
                onClick={() => {
                  setFollowListType("following");
                  setFollowListRequested(true);
                }}
              >
                Load Following
              </Button>
            </div>
            {followListRequested && (
              <Button size="sm" disabled={followsListFetching} onClick={() => refetchFollowsList()}>
                {followsListFetching ? "Loading..." : "Refresh List"}
              </Button>
            )}
          </Row>
          {followsListErrorMessage && (
            <p style={{ fontSize: 11, color: nightMode ? "#ffb7b7" : "#8a1f1f", margin: "6px 0 0" }}>
              {followsListErrorMessage}
            </p>
          )}
          {followListRequested && !followsListErrorMessage && (
            <div style={{ marginTop: 8 }}>
              <Small $night={nightMode}>
                Showing {followsList?.users.length || 0} {followListType}.
                {followsList?.nextToken ? " More results are available from X pagination." : ""}
              </Small>
              <AccountGrid style={{ marginTop: 6 }}>
                {(followsList?.users || []).map((followUser) => (
                  <AccountChip
                    key={followUser.id}
                    $night={nightMode}
                    href={`https://x.com/${followUser.username || followUser.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {followUser.name || followUser.username || followUser.id}
                    {followUser.username ? ` @${followUser.username}` : ""}
                    <br />
                    {formatCount(followUser.followersCount)} followers
                  </AccountChip>
                ))}
              </AccountGrid>
            </div>
          )}
        </GroupBox>

          </>
        )}

        {activeView === "timeline" && (
          <>
        <GroupBox label="New Post" style={{ marginBottom: 10 }}>
          <Row>
            <textarea
              rows={2}
              maxLength={280}
              value={postDraft}
              onChange={(e) => setPostDraft(e.target.value.slice(0, 280))}
              disabled={!canPostInW || postMutation.isPending}
              placeholder={canPostInW ? "Post to X from your connected account..." : "Connect Timeline actions to post"}
              style={{ flex: 1, minWidth: 240, fontFamily: "inherit", fontSize: 12 }}
            />
            <Button
              size="sm"
              disabled={!canPostInW || !postDraft.trim() || postMutation.isPending}
              onClick={() =>
                postMutation.mutate({
                  text: postDraft.trim(),
                  mediaIds: postMedia.map((media) => media.id),
                })
              }
            >
              {postMutation.isPending ? "Posting..." : "Post in W"}
            </Button>
          </Row>
          <Row style={{ marginTop: 6 }}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/*"
              disabled={!canPostInW || mediaUploadMutation.isPending || postMedia.length >= 4}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                if (file.size > 15 * 1024 * 1024) {
                  setPostStatus("Media must be 15MB or less.");
                  return;
                }
                mediaUploadMutation.mutate(file);
              }}
              style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
            />
            <Small $night={nightMode}>
              {mediaUploadMutation.isPending
                ? "Uploading media..."
                : postMedia.length
                  ? `Attached: ${postMedia.map((media) => media.name).join(", ")}`
                  : "Images, GIFs, and short videos up to 15MB."}
            </Small>
          </Row>
          <Small $night={nightMode}>{postDraft.length}/280</Small>
          {postStatus && <p style={{ fontSize: 11, marginBottom: 0 }}>{postStatus}</p>}
        </GroupBox>

          </>
        )}

        {activeView === "messages" && (
        <GroupBox label="Gameshow Chats" style={{ marginBottom: 10 }}>
          {!capabilities?.platformAccountConfigured ? (
            <Small $night={nightMode}>
              {(() => {
                const handle =
                  capabilities?.platformAccountHandle ||
                  capabilities?.defaultAccountHandle ||
                  "wtfgameshow";
                switch (capabilities?.platformAccountReason) {
                  case "no_handle_configured":
                    return "Set W_X_DEFAULT_ACCOUNT_HANDLE on the server, or have the gameshow admin connect X (messages tier) on a user with that handle.";
                  case "no_user_with_handle":
                    return `No WTF user has @${handle} linked. Log in as the gameshow admin, open Settings → Connect X, pick "Full W participation (messages)", and authorize as @${handle}.`;
                  case "user_no_oauth2_token":
                    return `@${handle} is on the WTF account but has no OAuth2 token. Open Settings → Connect X (messages tier).`;
                  case "user_missing_dm_read_scope":
                    return `@${handle} is connected but the granted scopes don't include dm.read. Open Settings, switch the tier picker to "Full W participation (messages)" and reconnect — that grants dm.read + dm.write.`;
                  case "user_token_refresh_failed":
                    return `@${handle}'s OAuth2 token expired and the refresh failed. Open Settings → Connect X (messages tier) again.`;
                  default:
                    return "The read mirror needs the WTF Gameshow account OAuth2 token. Either set W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN on the server, or connect the gameshow X account through W (messages tier).";
                }
              })()}
            </Small>
          ) : (
            <>
              <Row style={{ marginBottom: 6 }}>
                <Small $night={nightMode}>
                  {groupchat?.readonly
                    ? "Read-only. Connect the Full W participation tier to send."
                    : "Connected for participation."}
                  {activeGroupchat?.diagnostics?.message ? ` ${activeGroupchat.diagnostics.message}` : ""}
                </Small>
                <Button size="sm" disabled={groupchatFetching} onClick={() => refetchGroupchat()}>
                  {groupchatFetching ? "Refreshing..." : "Refresh Chat"}
                </Button>
              </Row>
              {visibleGroupchats.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {visibleGroupchats.map((chat) => {
                    const label =
                      chat.conversation?.name ||
                      chat.conversation?.participants
                        ?.map((participant) => participant.username ? `@${participant.username}` : participant.id)
                        .slice(0, 3)
                        .join(", ") ||
                      chat.conversationId ||
                      "W chat";
                    return (
                      <Button
                        key={chat.conversationId || label}
                        size="sm"
                        active={activeGroupchat?.conversationId === chat.conversationId}
                        onClick={() => chat.conversationId && setSelectedGroupchatId(chat.conversationId)}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              )}
              <ChatList $night={nightMode}>
                {(activeGroupchat?.messages || []).map((message) => (
                  <ChatMessage key={message.id}>
                    <Small $night={nightMode}>
                      <strong>
                        {message.sender.name || message.sender.username || message.sender.id || "X user"}
                      </strong>
                      {message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString()}` : ""}
                    </Small>
                    <PostText $night={nightMode} style={{ margin: "2px 0 0" }}>
                      {message.text}
                    </PostText>
                  </ChatMessage>
                ))}
                {(activeGroupchat?.messages.length || 0) === 0 && (
                  <Small $night={nightMode}>No chat messages loaded yet.</Small>
                )}
              </ChatList>
              <Row>
                <textarea
                  rows={2}
                  value={groupchatDraft}
                  onChange={(e) => setGroupchatDraft(e.target.value.slice(0, 1000))}
                  disabled={!groupchat?.canWrite || !activeGroupchat?.conversationId || groupchatMutation.isPending}
                  placeholder={groupchat?.canWrite ? "Send to this X groupchat..." : "Read-only groupchat"}
                  style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
                />
                <Button
                  size="sm"
                  disabled={
                    !groupchat?.canWrite ||
                    !activeGroupchat?.conversationId ||
                    !groupchatDraft.trim() ||
                    groupchatMutation.isPending
                  }
                  onClick={() =>
                    activeGroupchat?.conversationId &&
                    groupchatMutation.mutate({
                      conversationId: activeGroupchat.conversationId,
                      text: groupchatDraft.trim(),
                    })
                  }
                >
                  {groupchatMutation.isPending ? "Sending..." : "Send"}
                </Button>
              </Row>
              {groupchatMutation.error && (
                <p style={{ fontSize: 11, color: nightMode ? "#ff9f9f" : "#900" }}>
                  {groupchatMutation.error instanceof Error
                    ? groupchatMutation.error.message
                    : "Groupchat send failed"}
                </p>
              )}
            </>
          )}
        </GroupBox>
        )}

        {activeView === "messages" && (
          <GroupBox label="W Direct Messages">
            {!canUseWDirectMessages ? (
              <div>
                <Small $night={nightMode}>
                  {capabilities?.connected
                    ? "Reconnect X OAuth2 with the Full W participation tier to use private W-to-W DMs."
                    : "Connect X OAuth2 with the Full W participation tier to use private W-to-W DMs."}
                </Small>
                <div style={{ marginTop: 8 }}>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedOAuthTier("messages");
                      setActiveView("settings");
                    }}
                  >
                    Open Full Permissions
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Row style={{ marginBottom: 8 }}>
                  <Small $night={nightMode}>
                    Only conversations where every participant is a connected WTF user are shown.
                    {userDmsErrorMessage ? ` ${userDmsErrorMessage}` : ""}
                  </Small>
                  <Button size="sm" disabled={userDmsFetching} onClick={() => refetchUserDms()}>
                    {userDmsFetching ? "Loading..." : "Refresh DMs"}
                  </Button>
                </Row>
                <PaneGrid>
                  <ConversationList $night={nightMode}>
                    {userDmConversations.map((conversation) => {
                      const label =
                        conversation.name ||
                        conversation.peers
                          .map((peer) => peer.displayName || peer.username || peer.twitterHandle)
                          .filter(Boolean)
                          .join(", ") ||
                        "W conversation";
                      return (
                        <ConversationButton
                          key={conversation.id}
                          type="button"
                          $night={nightMode}
                          $active={selectedDmConversationId === conversation.id}
                          onClick={() => setSelectedDmConversationId(conversation.id)}
                        >
                          <strong>{label}</strong>
                          <br />
                          <Small $night={nightMode}>{conversation.participantCount} participants</Small>
                        </ConversationButton>
                      );
                    })}
                    {userDmConversations.length === 0 && (
                      <Small $night={nightMode}>No W-only DM conversations found yet.</Small>
                    )}
                  </ConversationList>

                  <div>
                    <ChatList $night={nightMode} style={{ maxHeight: 360 }}>
                      {userDmMessagesFetching && (
                        <Small $night={nightMode}>Loading messages...</Small>
                      )}
                      {userDmMessagesErrorMessage && (
                        <p style={{ fontSize: 11, color: nightMode ? "#ff9f9f" : "#900" }}>
                          {userDmMessagesErrorMessage}
                        </p>
                      )}
                      {userDmMessageList.map((message) => (
                        <ChatMessage key={message.id}>
                          <Small $night={nightMode}>
                            <strong>
                              {message.sender.wtfDisplayName ||
                                message.sender.wtfUsername ||
                                message.sender.name ||
                                message.sender.username ||
                                "W user"}
                            </strong>
                            {message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString()}` : ""}
                          </Small>
                          <PostText $night={nightMode} style={{ margin: "2px 0 0" }}>
                            {message.text}
                          </PostText>
                        </ChatMessage>
                      ))}
                      {!userDmMessagesFetching && userDmMessageList.length === 0 && (
                        <Small $night={nightMode}>
                          {selectedDmConversation ? "No messages loaded yet." : "Choose a conversation."}
                        </Small>
                      )}
                    </ChatList>

                    <Row>
                      <textarea
                        rows={2}
                        value={userDmDraft}
                        onChange={(e) => setUserDmDraft(e.target.value.slice(0, 1000))}
                        disabled={!selectedDmConversationId || userDmMutation.isPending}
                        placeholder={
                          selectedDmConversationId ? "Send a private W DM..." : "Choose a W conversation"
                        }
                        style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
                      />
                      <Button
                        size="sm"
                        disabled={
                          !selectedDmConversationId ||
                          !userDmDraft.trim() ||
                          userDmMutation.isPending
                        }
                        onClick={() =>
                          userDmMutation.mutate({
                            conversationId: selectedDmConversationId,
                            text: userDmDraft.trim(),
                          })
                        }
                      >
                        {userDmMutation.isPending ? "Sending..." : "Send"}
                      </Button>
                    </Row>

                    <GroupBox label="New W DM" style={{ marginTop: 10 }}>
                      <Row>
                        <select
                          value={directDmTarget ?? ""}
                          onChange={(e) =>
                            setDirectDmTarget(e.target.value ? Number(e.target.value) : null)
                          }
                          style={{ minWidth: 220 }}
                        >
                          <option value="">Select connected W user...</option>
                          {accounts
                            .filter((account) => account.userId !== user?.id)
                            .map((account) => (
                              <option key={account.userId} value={account.userId}>
                                {(account.displayName || account.username) + " "}@{account.twitterHandle}
                              </option>
                            ))}
                        </select>
                        <textarea
                          rows={2}
                          value={directDmDraft}
                          onChange={(e) => setDirectDmDraft(e.target.value.slice(0, 1000))}
                          placeholder="Start a W-only X DM..."
                          style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
                        />
                        <Button
                          size="sm"
                          disabled={
                            !directDmTarget ||
                            !directDmDraft.trim() ||
                            directUserDmMutation.isPending
                          }
                          onClick={() =>
                            directDmTarget &&
                            directUserDmMutation.mutate({
                              targetUserId: directDmTarget,
                              text: directDmDraft.trim(),
                            })
                          }
                        >
                          {directUserDmMutation.isPending ? "Sending..." : "Start"}
                        </Button>
                      </Row>
                    </GroupBox>

                    {userDmStatus && (
                      <p style={{ fontSize: 11, marginBottom: 0 }}>{userDmStatus}</p>
                    )}
                  </div>
                </PaneGrid>
              </>
            )}
          </GroupBox>
        )}

        {activeView === "spaces" && (
          <>
            <GroupBox label="X Spaces" style={{ marginBottom: 10 }}>
              <Row style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Small $night={nightMode}>
                    Browse and join X Spaces from WTF accounts. Joining opens the X Space player.
                  </Small>
                </div>
                <Button size="sm" disabled={spacesFetching} onClick={() => refetchSpaces()}>
                  {spacesFetching ? "Loading..." : "Refresh"}
                </Button>
              </Row>
              {!capabilities?.connected && (
                <p style={{ fontSize: 11, color: nightMode ? "#ffb7b7" : "#8a1f1f", margin: "8px 0 0" }}>
                  Connect X in Settings to browse Spaces.
                </p>
              )}
              {(spacesData?.spaces || []).length === 0 && capabilities?.connected && !spacesFetching && (
                <p style={{ fontSize: 11, color: nightMode ? "#b8c5da" : "#3c4956", margin: "8px 0 0" }}>
                  No live or scheduled Spaces found for @{spacesData?.creatorHandle || "wtfgameshow"}.
                </p>
              )}
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {(spacesData?.spaces || []).map((space) => (
                  <PostCard key={space.id} $night={nightMode}>
                    <PostHead>
                      <div>
                        <strong>{space.title || "Untitled Space"}</strong>
                        <br />
                        <Small $night={nightMode}>
                          {space.state === "live" ? "LIVE" : space.state === "scheduled" ? "Scheduled" : space.state || "Unknown"}
                          {space.scheduledStart ? ` · ${new Date(space.scheduledStart).toLocaleString()}` : ""}
                          {space.participantCount > 0 ? ` · ${space.participantCount} listeners` : ""}
                        </Small>
                      </div>
                    </PostHead>
                    <Row style={{ marginTop: 8 }}>
                      <Button
                        size="sm"
                        onClick={() => window.open(space.url, "_blank", "noopener,noreferrer")}
                      >
                        {space.state === "live" ? "Join Space" : "View on X"}
                      </Button>
                    </Row>
                  </PostCard>
                ))}
              </div>
            </GroupBox>
          </>
        )}

        {activeView === "settings" && canUseWAdminControls && (
          <GroupBox label="W Admin Settings" style={{ marginBottom: 10 }}>
            <GroupBox label="X OAuth2 Diagnostics" style={{ marginBottom: 8 }}>
              <Row style={{ alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <Small $night={nightMode}>
                    Compare these values to the X Developer Portal app settings. The
                    callback URL must match byte-for-byte; the Client ID must belong to
                    the same app; the requested scopes must be enabled on the app.
                  </Small>
                </div>
                <Button
                  size="sm"
                  disabled={oauthDiagnosticsFetching}
                  onClick={() => refetchOauthDiagnostics()}
                >
                  {oauthDiagnosticsFetching ? "Checking..." : "Refresh"}
                </Button>
              </Row>
              {oauthDiagnosticsError ? (
                <Small $night={nightMode}>
                  {oauthDiagnosticsError instanceof Error
                    ? oauthDiagnosticsError.message
                    : "Diagnostics unavailable."}
                </Small>
              ) : oauthDiagnostics ? (
                <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
                  <div>
                    <strong>Redirect URI (register on X):</strong>{" "}
                    <code>{oauthDiagnostics.redirectUri}</code>
                    {oauthDiagnostics.configuredRedirectOverride ? (
                      <span> (from TWITTER_OAUTH2_REDIRECT_URI override)</span>
                    ) : (
                      <span> (derived from PUBLIC_SITE_URL)</span>
                    )}
                  </div>
                  <div>
                    <strong>Public site URL:</strong>{" "}
                    <code>{oauthDiagnostics.publicSiteUrl || "(unset — fix this)"}</code>
                  </div>
                  <div>
                    <strong>TWITTER_CLIENT_ID:</strong>{" "}
                    {oauthDiagnostics.clientIdConfigured ? (
                      <code>…{oauthDiagnostics.clientIdLast4 || "????"}</code>
                    ) : (
                      <span>not configured</span>
                    )}
                    {" · "}
                    <strong>TWITTER_CLIENT_SECRET:</strong>{" "}
                    {oauthDiagnostics.clientSecretConfigured ? "configured" : "not configured"}
                  </div>
                  {oauthDiagnostics.clientKind ? (
                    <div>
                      <strong>Client kind:</strong>{" "}
                      <code>{oauthDiagnostics.clientKind}</code>
                      {oauthDiagnostics.clientKind === "confidential" && !oauthDiagnostics.clientSecretConfigured
                        ? " (confidential clients require TWITTER_CLIENT_SECRET)"
                        : ""}
                      {oauthDiagnostics.clientKind === "public" && oauthDiagnostics.clientSecretConfigured
                        ? " (public / native clients must NOT send client_secret)"
                        : ""}
                    </div>
                  ) : null}
                  <div>
                    <strong>Profile link scopes:</strong>{" "}
                    <code>{oauthDiagnostics.profileScopes.join(" ")}</code>
                  </div>
                  {Object.entries(oauthDiagnostics.tiers).map(([tier, scopes]) => (
                    <div key={tier}>
                      <strong>W tier "{tier}" scopes:</strong>{" "}
                      <code>{scopes.join(" ")}</code>
                    </div>
                  ))}
                  <div>
                    <strong>Authorize endpoint:</strong>{" "}
                    <code>{oauthDiagnostics.authorizeEndpoint}</code>
                  </div>
                  <div>
                    <strong>Token endpoint:</strong>{" "}
                    <code>{oauthDiagnostics.tokenEndpoint}</code>
                  </div>
                  {oauthDiagnostics.apiPlan ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 8,
                        border: "1px solid #c0c0c0",
                        background: nightMode ? "#2a2a2a" : "#fffbea",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        X API Pay-Per-Use notice (Feb 6, 2026)
                      </div>
                      <div style={{ marginBottom: 4 }}>{oauthDiagnostics.apiPlan.notice}</div>
                      <div style={{ marginBottom: 4 }}>{oauthDiagnostics.apiPlan.permissionsNote}</div>
                      {oauthDiagnostics.apiPlan.fixOrder && oauthDiagnostics.apiPlan.fixOrder.length > 0 ? (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            403 recovery checklist
                          </div>
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {oauthDiagnostics.apiPlan.fixOrder.map((step, idx) => (
                              <li key={idx} style={{ marginBottom: 3 }}>
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a
                          href={oauthDiagnostics.apiPlan.consoleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open new X Console (Pay-Per-Use)
                        </a>
                        {oauthDiagnostics.apiPlan.legacyPortalUrl ? (
                          <a
                            href={oauthDiagnostics.apiPlan.legacyPortalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Legacy portal (pre-2026 apps)
                          </a>
                        ) : null}
                        <a
                          href={oauthDiagnostics.apiPlan.pricingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Pay-Per-Use pricing
                        </a>
                        <a
                          href={oauthDiagnostics.apiPlan.scopesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          OAuth 2.0 scopes reference
                        </a>
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 8,
                          borderTop: `1px dashed ${nightMode ? "#4c6788" : "#c0c0c0"}`,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          Live v2 self-test (app-only Bearer)
                        </div>
                        <Small $night={nightMode} style={{ display: "block", marginBottom: 6 }}>
                          Calls /2/users/by/username/X with the server's
                          X_BEARER_TOKEN / TWITTER_BEARER_TOKEN. 200 here
                          proves the app has v2 access — if /users/me still
                          returns 403 during login, the OAuth 2.0 Client
                          ID/Secret are stale (regenerate them) or the
                          linked X account is locked/suspended.
                        </Small>
                        <Button
                          size="sm"
                          disabled={selfTestMutation.isPending}
                          onClick={() => selfTestMutation.mutate()}
                        >
                          {selfTestMutation.isPending ? "Running…" : "Run self-test"}
                        </Button>
                        {selfTestMutation.data ? (
                          <div style={{ marginTop: 8, fontSize: 11 }}>
                            <div>
                              <strong>Configured:</strong>{" "}
                              {selfTestMutation.data.configured ? "yes" : "no"}
                            </div>
                            {typeof selfTestMutation.data.status === "number" ? (
                              <div>
                                <strong>Status:</strong>{" "}
                                <code>{selfTestMutation.data.status}</code>{" "}
                                {selfTestMutation.data.ok ? "OK" : "FAIL"}
                              </div>
                            ) : null}
                            {selfTestMutation.data.probeUrl ? (
                              <div>
                                <strong>Probe:</strong>{" "}
                                <code>{selfTestMutation.data.probeUrl}</code>
                              </div>
                            ) : null}
                            {selfTestMutation.data.interpretation ? (
                              <div style={{ marginTop: 4 }}>
                                {selfTestMutation.data.interpretation}
                              </div>
                            ) : null}
                            {selfTestMutation.data.message ? (
                              <div style={{ marginTop: 4 }}>
                                {selfTestMutation.data.message}
                              </div>
                            ) : null}
                            {selfTestMutation.data.bodyRaw ? (
                              <pre
                                style={{
                                  marginTop: 4,
                                  padding: 6,
                                  background: nightMode ? "#0d1726" : "#f3f3f3",
                                  border: "1px solid #c0c0c0",
                                  overflowX: "auto",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  fontSize: 10,
                                }}
                              >
                                {selfTestMutation.data.bodyRaw}
                              </pre>
                            ) : null}
                          </div>
                        ) : null}
                        {selfTestMutation.error ? (
                          <div style={{ marginTop: 6, color: "#b94a48" }}>
                            {selfTestMutation.error instanceof Error
                              ? selfTestMutation.error.message
                              : "Self-test failed"}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Small $night={nightMode}>
                  {oauthDiagnosticsFetching ? "Loading…" : "No diagnostics yet."}
                </Small>
              )}
            </GroupBox>

            {/* DM Diagnostics - shows exact platform status, token test, DM endpoint test */}
            <GroupBox label="DM Diagnostics" style={{ marginBottom: 8 }}>
              <Row style={{ alignItems: "center", marginBottom: 8 }}>
                <Small $night={nightMode} style={{ flex: 1 }}>
                  Tests platform token, DM endpoint, and groupchat access. Click to run.
                </Small>
                <Button
                  size="sm"
                  disabled={dmDiagnosticsFetching}
                  onClick={() => refetchDmDiagnostics()}
                >
                  {dmDiagnosticsFetching ? "Running..." : "Run DM Diagnostics"}
                </Button>
              </Row>

              {dmDiagnosticsFetching && <Small $night={nightMode}>Testing X API access...</Small>}

              {dmDiagnostics?.error ? (
                <div style={{ color: "#ff6b6b", fontSize: 12, padding: 8, background: nightMode ? "#3a2525" : "#ffe6e6", borderRadius: 4 }}>
                  {dmDiagnostics.error}
                  {dmDiagnostics.details && <div style={{ marginTop: 4, opacity: 0.8 }}>{dmDiagnostics.details}</div>}
                </div>
              ) : dmDiagnostics ? (
                <>
                  <Small $night={nightMode} style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
                    Platform: {dmDiagnostics.platform?.source || "unknown"} • Handle: @{dmDiagnostics.platform?.handle || "unknown"}
                    {dmDiagnostics.platform?.reason && ` • Reason: ${dmDiagnostics.platform.reason}`}
                  </Small>

                  {dmDiagnostics.tests?.platformToken && (
                    <div style={{ marginBottom: 8, fontSize: 11, padding: 6, background: nightMode ? "#1f2a1f" : "#e6ffe6", borderRadius: 4 }}>
                      <strong>Platform Token Test:</strong>{" "}
                      {dmDiagnostics.tests.platformToken.ok
                        ? `✅ @${dmDiagnostics.tests.platformToken.username || "connected"}`
                        : `❌ ${dmDiagnostics.tests.platformToken.error || dmDiagnostics.tests.platformToken.status}`}
                    </div>
                  )}

                  {dmDiagnostics.tests?.dmEndpoint && (
                    <div style={{ marginBottom: 8, fontSize: 11, padding: 6, background: nightMode ? "#2a1f1f" : "#ffe6e6", borderRadius: 4 }}>
                      <strong>DM Endpoint Test (/dm_events):</strong>{" "}
                      {dmDiagnostics.tests.dmEndpoint.ok
                        ? `✅ ${dmDiagnostics.tests.dmEndpoint.eventCount} events received`
                        : `❌ ${dmDiagnostics.tests.dmEndpoint.message || dmDiagnostics.tests.dmEndpoint.error?.error || dmDiagnostics.tests.dmEndpoint.status || "Failed"}`}
                    </div>
                  )}

                  {Object.keys(dmDiagnostics.tests || {}).some((k) => k.startsWith("groupchat_")) && (
                    <div style={{ marginTop: 8 }}>
                      <strong>Groupchat Tests:</strong>
                      <pre style={{ fontSize: 10, background: nightMode ? "#1a1f2e" : "#f5f5f5", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 140, marginTop: 4 }}>
                        {JSON.stringify(
                          Object.fromEntries(
                            Object.entries(dmDiagnostics.tests || {}).filter(([k]) => k.startsWith("groupchat_"))
                          ),
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}

                  {dmDiagnostics.env && (
                    <Small $night={nightMode} style={{ marginTop: 8, display: "block", opacity: 0.8, fontSize: 11 }}>
                      Env: {dmDiagnostics.env.hasEncryptedToken ? "✅ encrypted token" : "❌ no encrypted token"} •{" "}
                      {dmDiagnostics.env.hasDefaultHandle ? "✅ default handle" : "❌ no handle"} •{" "}
                      {dmDiagnostics.groupchatIds?.length > 0 ? `${dmDiagnostics.groupchatIds.length} configured chats` : "no chats configured"}
                    </Small>
                  )}
                </>
              ) : (
                <Small $night={nightMode}>Click "Run DM Diagnostics" above to test X DM connectivity.</Small>
              )}
            </GroupBox>

            <GroupBox label="Visible Gameshow Chats" style={{ marginBottom: 8 }}>
              {!capabilities?.connected ? (
                <Small $night={nightMode}>
                  Admins must connect X OAuth2 in W settings before selecting visible chats.
                </Small>
              ) : (
                <>
                  <Row style={{ marginBottom: 6 }}>
                    <Small $night={nightMode}>
                      Select one or more group DMs visible to the WTF Gameshow account.
                      {adminDmConversations?.diagnostics ? ` ${adminDmConversations.diagnostics}` : ""}
                      {adminDmConversationsErrorMessage ? ` ${adminDmConversationsErrorMessage}` : ""}
                    </Small>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        size="sm"
                        disabled={saveGroupchatMutation.isPending || currentGroupchatIds.length === 0}
                        onClick={() => saveGroupchatMutation.mutate(currentGroupchatIds)}
                      >
                        {saveGroupchatMutation.isPending ? "Saving..." : "Save Chats"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={adminDmConversationsFetching}
                        onClick={() => refetchAdminDmConversations()}
                      >
                        {adminDmConversationsFetching ? "Loading..." : "Refresh List"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={dmDiagnosticsFetching}
                        onClick={() => refetchDmDiagnostics()}
                      >
                        {dmDiagnosticsFetching ? "Testing..." : "Run DM Diagnostics"}
                      </Button>
                    </div>
                  </Row>
                  <div style={{ display: "grid", gap: 5, marginBottom: 6 }}>
                    <Row>
                      <input
                        value={manualGroupchatIds}
                        onChange={(e) => setManualGroupchatIds(e.target.value)}
                        placeholder="Optional: paste group DM conversation IDs, comma separated"
                        style={{ flex: 1, minWidth: 260, fontFamily: "inherit", fontSize: 12 }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const ids = Array.from(
                            new Set(
                              manualGroupchatIds
                                .split(/[,\s]+/)
                                .map((id) => id.trim())
                                .filter(Boolean)
                            )
                          );
                          setSelectedAdminGroupchatIds(ids);
                        }}
                      >
                        Use IDs
                      </Button>
                    </Row>
                    {(adminDmConversations?.conversations || []).map((conversation) => {
                      const participantLabel =
                        conversation.participants
                          .map((participant) => participant.username ? `@${participant.username}` : participant.id)
                          .slice(0, 5)
                          .join(", ") || `${conversation.participantCount} participants`;
                      const label = conversation.name || participantLabel || conversation.id;
                      const checked = currentGroupchatIds.includes(conversation.id);
                      return (
                        <Checkbox
                          key={conversation.id}
                          label={`${checked ? "* " : ""}${label} · ${conversation.participantCount} users`}
                          checked={checked}
                          onChange={() => {
                            setSelectedAdminGroupchatIds((current) =>
                              current.includes(conversation.id)
                                ? current.filter((id) => id !== conversation.id)
                                : [...current, conversation.id]
                            );
                          }}
                        />
                      );
                    })}
                    {(adminDmConversations?.conversations.length || 0) === 0 && (
                      <Small $night={nightMode}>No group DM conversations loaded yet.</Small>
                    )}
                  </div>
                  <Small $night={nightMode}>
                    Current: <strong>{currentGroupchatIds.join(", ") || "not selected"}</strong>
                  </Small>
                </>
              )}
            </GroupBox>
            <Row>
              <select
                value={platformDmTarget ?? ""}
                onChange={(e) =>
                  setPlatformDmTarget(e.target.value ? Number(e.target.value) : null)
                }
                style={{ minWidth: 220 }}
              >
                <option value="">Select contestant account...</option>
                {accounts.map((account) => (
                  <option key={account.userId} value={account.userId}>
                    {(account.displayName || account.username) + " "}@{account.twitterHandle}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                value={platformDmDraft}
                onChange={(e) => setPlatformDmDraft(e.target.value.slice(0, 1000))}
                placeholder="DM text from the WTF Gameshow X account..."
                style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
              />
              <Button
                size="sm"
                disabled={!platformDmTarget || !platformDmDraft.trim() || platformDmMutation.isPending}
                onClick={() =>
                  platformDmTarget &&
                  platformDmMutation.mutate({
                    targetUserId: platformDmTarget,
                    text: platformDmDraft.trim(),
                  })
                }
              >
                {platformDmMutation.isPending ? "Sending..." : "Send DM"}
              </Button>
            </Row>
            {platformDmStatus && (
              <p style={{ fontSize: 11, marginBottom: 0 }}>{platformDmStatus}</p>
            )}
          </GroupBox>
        )}

        {activeView === "settings" && (
        <GroupBox label="Connected Accounts" style={{ marginBottom: 10 }}>
          <AccountGrid>
            {accounts.map((account) => (
              <AccountChip
                $night={nightMode}
                key={`${account.userId}-${account.twitterHandle}`}
                href={account.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open @${account.twitterHandle} on X`}
              >
                {(account.displayName || account.username) + " "}@{account.twitterHandle}
              </AccountChip>
            ))}
            {accounts.length === 0 && (
              <Small $night={nightMode}>No verified connected X accounts available yet.</Small>
            )}
          </AccountGrid>
        </GroupBox>
        )}

        {activeView === "timeline" && (
        <GroupBox label="Timeline">
          {posts.length === 0 ? (
            <Small $night={nightMode}>No posts to show right now. Try Refresh in a minute.</Small>
          ) : (
            posts.map((post) => {
              const nonMediaLinks = (post.links || []).filter((link) => !isMediaLink(link));
              const previewLinks = nonMediaLinks.filter((link) => Boolean(link.preview));
              const plainLinks = nonMediaLinks.filter((link) => !link.preview);

              return (
                <PostCard $night={nightMode} key={post.id}>
                  <PostHead>
                    <Avatar $night={nightMode}>{renderAvatarContent(post)}</Avatar>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>
                        {post.author.displayName || post.author.username} @{post.author.twitterHandle}
                      </div>
                      <Small $night={nightMode}>{new Date(post.createdAt).toLocaleString()}</Small>
                    </div>
                  </PostHead>

                  <PostText $night={nightMode}>{post.displayText || post.text}</PostText>

                  {Array.isArray(post.media) && post.media.length > 0 && (
                    <MediaGrid $count={post.media.length}>
                      {post.media.map((media, idx) => {
                        const mediaHref = media.url || post.url;
                        const imageSrc = media.url || media.previewUrl;
                        const typeLabel =
                          media.type === "animated_gif"
                            ? "GIF"
                            : media.type === "video"
                              ? "VIDEO"
                              : "";
                        return (
                          <MediaTile
                            $night={nightMode}
                            key={`${post.id}-${idx}`}
                            href={mediaHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={media.altText || `Open media on X (${media.type})`}
                          >
                            {imageSrc ? (
                              <MediaImage
                                src={imageSrc}
                                alt={media.altText || `${media.type} from @${post.author.twitterHandle}`}
                              />
                            ) : (
                              <div
                                style={{
                                  minHeight: 120,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11,
                                  color: nightMode ? "#b5c7df" : "#34495f",
                                }}
                              >
                                Open media on X
                              </div>
                            )}
                            {typeLabel && <MediaBadge $night={nightMode}>{typeLabel}</MediaBadge>}
                          </MediaTile>
                        );
                      })}
                    </MediaGrid>
                  )}

                  {previewLinks.length > 0 && (
                    <LinkPreviewList>
                      {previewLinks.map((link, idx) => {
                        const preview = link.preview!;
                        const href = linkHref(link);
                        const siteLabel = preview.siteName || preview.domain || displayLinkText(link);
                        return (
                          <LinkPreviewCard
                            $night={nightMode}
                            $objkt={preview.isObjkt}
                            key={`${post.id}-preview-${idx}`}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={href}
                          >
                            <LinkPreviewImageWrap $night={nightMode}>
                              {preview.imageUrl ? (
                                <LinkPreviewImage src={preview.imageUrl} alt={preview.title} />
                              ) : (
                                <div
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 10,
                                    color: nightMode ? "#aac0db" : "#4a5e73",
                                  }}
                                >
                                  {siteLabel}
                                </div>
                              )}
                            </LinkPreviewImageWrap>
                            <LinkPreviewBody>
                              {preview.isObjkt && <ObjktBadge $night={nightMode}>OBJKT</ObjktBadge>}
                              <LinkPreviewTitle>{preview.title}</LinkPreviewTitle>
                              {preview.description && (
                                <LinkPreviewDescription $night={nightMode}>
                                  {preview.description}
                                </LinkPreviewDescription>
                              )}
                              <Small $night={nightMode}>{siteLabel}</Small>
                            </LinkPreviewBody>
                          </LinkPreviewCard>
                        );
                      })}
                    </LinkPreviewList>
                  )}

                  {plainLinks.length > 0 && (
                    <LinksRow>
                      {plainLinks.map((link, idx) => {
                        const href = linkHref(link);
                        const label = displayLinkText(link);
                        return (
                          <LinkChip
                            $night={nightMode}
                            key={`${post.id}-link-${idx}`}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={href}
                          >
                            {label}
                          </LinkChip>
                        );
                      })}
                    </LinksRow>
                  )}

                  <Row>
                    <Stats $night={nightMode}>
                      <span>♥ {post.metrics.likes}</span>
                      <span>↩ {post.metrics.replies}</span>
                      <span>↻ {post.metrics.reposts}</span>
                      <span>❞ {post.metrics.quotes}</span>
                    </Stats>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button size="sm" onClick={() => window.open(post.url, "_blank", "noopener,noreferrer")}>
                        Open on X
                      </Button>
                      {viewerCanReply && (
                        <>
                          <Button
                            size="sm"
                            title="Like"
                            disabled={engageMutation.isPending}
                            onClick={() => engageMutation.mutate({ action: "like", postId: post.id })}
                          >
                            ♥
                          </Button>
                          <Button
                            size="sm"
                            title="Repost"
                            disabled={engageMutation.isPending}
                            onClick={() => engageMutation.mutate({ action: "repost", postId: post.id })}
                          >
                            ↻
                          </Button>
                          <Button
                            size="sm"
                            title="Quote"
                            disabled={engageMutation.isPending}
                            onClick={() =>
                              setQuoteOpenFor((current) =>
                                current === post.id ? null : post.id
                              )
                            }
                          >
                            ❞
                          </Button>
                        </>
                      )}
                      {viewerCanReply && (
                        <>
                          <Button
                            size="sm"
                            title="Comment"
                            onClick={() =>
                              setReplyOpenFor((current) => (current === post.id ? null : post.id))
                            }
                          >
                            💬
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              window.open(replyIntentUrl(post.id), "_blank", "noopener,noreferrer")
                            }
                          >
                            ↗
                          </Button>
                        </>
                      )}
                    </div>
                  </Row>

                  {replyOpenFor === post.id && (
                    <ReplyArea>
                      <textarea
                        rows={3}
                        value={replyDrafts[post.id] || ""}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({
                            ...prev,
                            [post.id]: e.target.value.slice(0, 280),
                          }))
                        }
                        style={{
                          width: "100%",
                          minHeight: 64,
                          resize: "vertical",
                          fontFamily: "MS Sans Serif, Segoe UI, Tahoma, sans-serif",
                          fontSize: 12,
                          background: nightMode ? "#0d1726" : "#fff",
                          color: nightMode ? "#e8f0fb" : "#111",
                          border: `1px solid ${nightMode ? "#4c6788" : "#9cabbb"}`,
                        }}
                        placeholder="Write your reply..."
                      />
                      <Row style={{ marginTop: 6 }}>
                        <Small $night={nightMode}>{(replyDrafts[post.id] || "").length}/280</Small>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button
                            size="sm"
                            onClick={() => setReplyOpenFor(null)}
                            disabled={replyMutation.isPending}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={replyMutation.isPending || !(replyDrafts[post.id] || "").trim()}
                            onClick={() =>
                              replyMutation.mutate({
                                postId: post.id,
                                text: (replyDrafts[post.id] || "").trim(),
                              })
                            }
                          >
                            {replyMutation.isPending ? "Sending..." : "Send Reply"}
                          </Button>
                        </div>
                      </Row>
                    </ReplyArea>
                  )}

                  {quoteOpenFor === post.id && (
                    <ReplyArea>
                      <textarea
                        rows={2}
                        maxLength={280}
                        value={quoteDrafts[post.id] || ""}
                        onChange={(e) =>
                          setQuoteDrafts((prev) => ({
                            ...prev,
                            [post.id]: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          minHeight: 64,
                          resize: "vertical",
                          fontFamily: "MS Sans Serif, Segoe UI, Tahoma, sans-serif",
                          fontSize: 12,
                          background: nightMode ? "#0d1726" : "#fff",
                          color: nightMode ? "#e8f0fb" : "#111",
                          border: `1px solid ${nightMode ? "#4c6788" : "#9cabbb"}`,
                        }}
                        placeholder="Add quote text. @mentions and #hashtags work like X."
                      />
                      <Row style={{ marginTop: 8, justifyContent: "space-between" }}>
                        <Small $night={nightMode}>
                          {(quoteDrafts[post.id] || "").length}/280
                        </Small>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button
                            size="sm"
                            disabled={engageMutation.isPending}
                            onClick={() => {
                              const trimmed = (quoteDrafts[post.id] || "").trim();
                              if (!trimmed) {
                                setActionErrors((prev) => ({
                                  ...prev,
                                  [post.id]: "Quote text is required",
                                }));
                                return;
                              }
                              engageMutation.mutate({
                                action: "quote",
                                postId: post.id,
                                text: trimmed.slice(0, 280),
                              });
                            }}
                          >
                            Post Quote
                          </Button>
                          <Button size="sm" onClick={() => setQuoteOpenFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      </Row>
                    </ReplyArea>
                  )}

                  {replyErrors[post.id] && (
                    <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#ff9f9f" : "#900", fontSize: 11 }}>
                      {replyErrors[post.id]}
                    </p>
                  )}
                  {actionErrors[post.id] && (
                    <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#ff9f9f" : "#900", fontSize: 11 }}>
                      {actionErrors[post.id]}
                    </p>
                  )}
                  {replySuccess[post.id] && (
                    <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#8ee9a7" : "#116611", fontSize: 11 }}>
                      Reply posted.{" "}
                      <a href={replySuccess[post.id]} target="_blank" rel="noopener noreferrer">
                        Open on X
                      </a>
                    </p>
                  )}
                  {actionSuccess[post.id] && (
                    <p style={{ marginTop: 6, marginBottom: 0, color: nightMode ? "#8ee9a7" : "#116611", fontSize: 11 }}>
                      {actionSuccess[post.id].startsWith("Quote posted: ") ? (
                        <>
                          Quote posted.{" "}
                          <a
                            href={actionSuccess[post.id].replace("Quote posted: ", "")}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open on X
                          </a>
                        </>
                      ) : (
                        actionSuccess[post.id]
                      )}
                    </p>
                  )}
                </PostCard>
              );
            })
          )}
        </GroupBox>
        )}
        </MainSurface>
      </Shell>
    </AppWindow>
  );
}
