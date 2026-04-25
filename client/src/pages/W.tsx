import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, GroupBox, Hourglass } from "react95";
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
  groupchatConfigured: boolean;
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
  readonly: boolean;
  canWrite: boolean;
  defaultAccountHandle?: string;
  messages: WGroupchatMessage[];
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
  conversations: WAdminDmConversation[];
};

const Shell = styled.div<{ $night: boolean }>`
  background: ${({ $night }) =>
    $night
      ? "repeating-linear-gradient(0deg, #111722 0px, #111722 16px, #0c1118 16px, #0c1118 32px)"
      : "repeating-linear-gradient(0deg, #f7f9fb 0px, #f7f9fb 16px, #edf1f5 16px, #edf1f5 32px)"};
  border: 1px solid ${({ $night }) => ($night ? "#2c3e50" : "#a6adb5")};
  color: ${({ $night }) => ($night ? "#e7edf7" : "#10161e")};
  padding: 10px;
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
  background: ${({ $night }) => ($night ? "#131f2f" : "#ffffff")};
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
  const [selectedOAuthTier, setSelectedOAuthTier] = useState("messages");
  const [groupchatDraft, setGroupchatDraft] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [postStatus, setPostStatus] = useState("");
  const [platformDmTarget, setPlatformDmTarget] = useState<number | null>(null);
  const [platformDmDraft, setPlatformDmDraft] = useState("");
  const [platformDmStatus, setPlatformDmStatus] = useState("");
  const [selectedGroupchatId, setSelectedGroupchatId] = useState("");
  const [nightMode, setNightMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("w:night-mode") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("w:night-mode", nightMode ? "1" : "0");
  }, [nightMode]);

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
  const canUseWAdminControls = Boolean(
    user?.role === "admin" ||
      (capabilities?.canUseAdminControls &&
        hasPermission("access_admin_panel") &&
        hasPermission("manage_roles"))
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
    isFetching: adminDmConversationsFetching,
    refetch: refetchAdminDmConversations,
  } = useQuery({
    queryKey: ["w", "admin", "dm-conversations"],
    queryFn: () =>
      api.get<WAdminDmConversationsResponse>("/api/w/admin/dm-conversations?limit=100"),
    enabled: Boolean(canUseWAdminControls && capabilities?.platformAccountConfigured),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (adminDmConversations?.currentConversationId) {
      setSelectedGroupchatId(adminDmConversations.currentConversationId);
    }
  }, [adminDmConversations?.currentConversationId]);

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
    mutationFn: (text: string) => api.post("/api/w/groupchat/messages", { text }),
    onSuccess: () => {
      setGroupchatDraft("");
      refetchGroupchat();
    },
  });

  const postMutation = useMutation({
    mutationFn: (text: string) => api.post<{ ok: boolean; url: string | null }>("/api/w/post", { text }),
    onSuccess: (result) => {
      setPostDraft("");
      setPostStatus(result.url ? `Post created: ${result.url}` : "Post created.");
      refetch();
    },
    onError: (err) => {
      setPostStatus(err instanceof Error ? err.message : "Post failed");
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
    mutationFn: (conversationId: string) =>
      api.put<{ ok: boolean; conversationId: string }>("/api/w/admin/groupchat", {
        conversationId,
      }),
    onSuccess: (result) => {
      setSelectedGroupchatId(result.conversationId);
      setPlatformDmStatus("Gameshow groupchat selection saved.");
      refetchGroupchat();
      refetchAdminDmConversations();
    },
    onError: (err) => {
      setPlatformDmStatus(err instanceof Error ? err.message : "Failed to save groupchat");
    },
  });

  if (isLoading) {
    return (
      <AppWindow title="W">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  const posts = data?.timeline || [];
  const accounts = data?.accounts || [];
  const viewerCanReply = Boolean(data?.canReplyInline && user?.twitterVerified);
  const oauthConnectUrl = `/api/auth/twitter-oauth2?tier=${encodeURIComponent(selectedOAuthTier)}`;
  const selectedTier = capabilities?.tiers.find((tier) => tier.key === selectedOAuthTier);
  const canPostInW = Boolean(
    capabilities?.capabilities.find((capability) => capability.key === "new_post")?.enabled
  );
  const currentGroupchatId =
    selectedGroupchatId || adminDmConversations?.currentConversationId || "";

  return (
    <AppWindow title="W">
      <Shell $night={nightMode}>
        <HeaderBar>
          <HeaderLeft>
            <WBadge $night={nightMode}>W</WBadge>
              <TitleWrap>
                <Title>WTF is an algo</Title>
                <Subtitle $night={nightMode}>
                  Like X, but with the bloat stripped out.
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
              onClick={() => postMutation.mutate(postDraft.trim())}
            >
              {postMutation.isPending ? "Posting..." : "Post in W"}
            </Button>
          </Row>
          <Small $night={nightMode}>{postDraft.length}/280</Small>
          {postStatus && <p style={{ fontSize: 11, marginBottom: 0 }}>{postStatus}</p>}
        </GroupBox>

        <GroupBox label="Gameshow Groupchat" style={{ marginBottom: 10 }}>
          {!capabilities?.platformAccountConfigured ? (
            <Small $night={nightMode}>
              The read mirror needs the WTF Gameshow account OAuth2 token on the server.
            </Small>
          ) : (
            <>
              <Row style={{ marginBottom: 6 }}>
                <Small $night={nightMode}>
                  {groupchat?.readonly
                    ? "Read-only. Connect the Full W participation tier to send."
                    : "Connected for participation."}
                  {groupchat?.diagnostics?.message ? ` ${groupchat.diagnostics.message}` : ""}
                </Small>
                <Button size="sm" disabled={groupchatFetching} onClick={() => refetchGroupchat()}>
                  {groupchatFetching ? "Refreshing..." : "Refresh Chat"}
                </Button>
              </Row>
              <ChatList $night={nightMode}>
                {(groupchat?.messages || []).map((message) => (
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
                {(groupchat?.messages.length || 0) === 0 && (
                  <Small $night={nightMode}>No groupchat messages loaded yet.</Small>
                )}
              </ChatList>
              <Row>
                <textarea
                  rows={2}
                  value={groupchatDraft}
                  onChange={(e) => setGroupchatDraft(e.target.value.slice(0, 1000))}
                  disabled={!groupchat?.canWrite || groupchatMutation.isPending}
                  placeholder={groupchat?.canWrite ? "Send to the X groupchat..." : "Read-only groupchat"}
                  style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
                />
                <Button
                  size="sm"
                  disabled={!groupchat?.canWrite || !groupchatDraft.trim() || groupchatMutation.isPending}
                  onClick={() => groupchatMutation.mutate(groupchatDraft.trim())}
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

        {canUseWAdminControls && (
          <GroupBox label="Admin Direct Message" style={{ marginBottom: 10 }}>
            <GroupBox label="Gameshow Groupchat Picker" style={{ marginBottom: 8 }}>
              <Row>
                <select
                  value={currentGroupchatId}
                  onChange={(e) => setSelectedGroupchatId(e.target.value)}
                  style={{ minWidth: 260, flex: 1 }}
                  disabled={adminDmConversationsFetching || saveGroupchatMutation.isPending}
                >
                  <option value="">Select X DM conversation...</option>
                  {(adminDmConversations?.conversations || []).map((conversation) => {
                    const participantLabel =
                      conversation.participants
                        .map((participant) => participant.username ? `@${participant.username}` : participant.id)
                        .slice(0, 5)
                        .join(", ") || `${conversation.participantCount} participants`;
                    const label = conversation.name || participantLabel || conversation.id;
                    return (
                      <option key={conversation.id} value={conversation.id}>
                        {conversation.id === adminDmConversations?.currentConversationId ? "* " : ""}
                        {label} · {conversation.participantCount} users
                      </option>
                    );
                  })}
                </select>
                <Button
                  size="sm"
                  disabled={!selectedGroupchatId || saveGroupchatMutation.isPending}
                  onClick={() => saveGroupchatMutation.mutate(selectedGroupchatId)}
                >
                  {saveGroupchatMutation.isPending ? "Saving..." : "Use as Groupchat"}
                </Button>
                <Button
                  size="sm"
                  disabled={adminDmConversationsFetching}
                  onClick={() => refetchAdminDmConversations()}
                >
                  {adminDmConversationsFetching ? "Loading..." : "Refresh List"}
                </Button>
              </Row>
              <Small $night={nightMode}>
                Current: <strong>{adminDmConversations?.currentConversationId || "not selected"}</strong>
              </Small>
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
                            disabled={engageMutation.isPending}
                            onClick={() => engageMutation.mutate({ action: "like", postId: post.id })}
                          >
                            Like in W
                          </Button>
                          <Button
                            size="sm"
                            disabled={engageMutation.isPending}
                            onClick={() => engageMutation.mutate({ action: "repost", postId: post.id })}
                          >
                            Repost in W
                          </Button>
                          <Button
                            size="sm"
                            disabled={engageMutation.isPending}
                            onClick={() =>
                              setQuoteOpenFor((current) =>
                                current === post.id ? null : post.id
                              )
                            }
                          >
                            Quote in W
                          </Button>
                        </>
                      )}
                      {viewerCanReply && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              setReplyOpenFor((current) => (current === post.id ? null : post.id))
                            }
                          >
                            Reply in W
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              window.open(replyIntentUrl(post.id), "_blank", "noopener,noreferrer")
                            }
                          >
                            Reply on X
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
                        style={{ width: "100%", fontFamily: "inherit", fontSize: 12 }}
                        placeholder="Add your quote text (max 280)"
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
      </Shell>
    </AppWindow>
  );
}
