import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
  Button,
  GroupBox,
  Hourglass,
  Tab,
  TabBody,
  Tabs,
  TextField,
} from "react95";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

type SkywireTab =
  | "account"
  | "home"
  | "actor"
  | "discover"
  | "wtf"
  | "tezos"
  | "mentions"
  | "signals"
  | "challenges"
  | "composer"
  | "debug";

interface AtprotoMe {
  enabled: boolean;
  account: null | {
    id: number;
    did: string;
    handle: string;
    pdsUrl: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    description: string | null;
    hasEncryptedTokens: boolean;
    hasDpopKey: boolean;
    lastSyncedAt: string | null;
    session?: {
      status: "none" | "oauth_ready" | "credential_ready" | "reconnect_required";
      reconnectRequired: boolean;
      reason: string | null;
    };
  };
  handleClaims: Array<{
    id: number;
    desiredHandle: string;
    tezosAlias: string | null;
    verificationMethod: string;
    verificationStatus: string;
    failureReason: string | null;
  }>;
  tezosAlias: string | null;
  walletAddress: string | null;
  tezosIdentity: {
    primaryWalletAddress: string | null;
    preferredTezosDomain: string | null;
    preferredSource: "selected" | "reverse" | "owned" | "none";
    ownedTezosDomains: string[];
    wallets: Array<{
      id: number;
      walletAddress: string;
      isPrimary: boolean;
      selectedTezosDomain: string | null;
      reverseTezosDomain: string | null;
      ownedTezosDomains: string[];
      preferredTezosDomain: string | null;
      preferredSource: "selected" | "reverse" | "owned" | "none";
    }>;
  };
  oauth: { clientIdUrl: string; redirectUri: string; scope: string };
}

interface FeedResponse {
  feedType: string;
  source?: string;
  q?: string;
  actor?: string;
  cursor: string | null;
  feed: SkywireFeedItem[];
}

interface SkywireActor {
  did: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
  description: string | null;
}

interface SkywirePost {
  uri: string;
  cid: string;
  sourceUrl: string | null;
  author: SkywireActor | null;
  text: string;
  createdAt: string | null;
  indexedAt: string | null;
  replyRoot: { uri: string; cid: string } | null;
  replyParent: { uri: string; cid: string } | null;
  counts: {
    reply: number;
    repost: number;
    like: number;
    quote: number;
  };
  viewer: {
    like: string | null;
    repost: string | null;
    threadMuted: boolean;
    embeddingDisabled: boolean;
  };
  embed: {
    images: Array<{ thumb: string | null; fullsize: string | null; alt: string }>;
    external: { uri: string; title: string; description: string | null; thumb: string | null } | null;
  };
}

interface SkywireFeedItem {
  post: SkywirePost;
  reason: null | {
    type: string;
    by: SkywireActor | null;
    indexedAt: string | null;
  };
}

interface ActorSearchResponse {
  actors: Array<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    description?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    wtfUserId?: number;
    wtfUsername?: string;
    suggestedByHandles?: string[];
    suggestionScore?: number;
  }>;
  cursor: string | null;
}

interface SignalsResponse {
  collection: string;
  records: Array<{
    uri: string;
    cid: string;
    value: {
      text?: string;
      signalType?: string;
      tags?: string[];
      relatedUri?: string | null;
      createdAt?: string;
    };
  }>;
}

const Shell = styled.div`
  min-height: 100%;
  padding: 12px;
  background: #c0c0c0;
  display: grid;
  gap: 10px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
  gap: 10px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Mono = styled.code`
  font-family: "MS Sans Serif", monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
`;

const FeedList = styled.div`
  display: grid;
  gap: 8px;
  max-height: 440px;
  overflow: auto;
`;

const FeedItem = styled.article`
  background: #fff;
  border: 1px solid #808080;
  padding: 8px;
  display: grid;
  gap: 5px;
`;

const PostHeader = styled.div`
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
`;

const Avatar = styled.img`
  width: 42px;
  height: 42px;
  object-fit: cover;
  border: 1px solid #808080;
  background: #c0c0c0;
`;

const AvatarFallback = styled.div`
  width: 42px;
  height: 42px;
  border: 1px solid #808080;
  background: #c0c0c0;
`;

const ActorButton = styled.button`
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0;
  margin: 0;
  text-align: left;
  display: block;
  cursor: pointer;

  &:hover strong,
  &:hover div {
    text-decoration: underline;
  }
`;

const PostText = styled.p`
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const MetaRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
`;

const ImageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
`;

const FeedImage = styled.img`
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  border: 1px solid #808080;
  background: #c0c0c0;
`;

const ExternalCard = styled.a`
  display: grid;
  gap: 4px;
  padding: 6px;
  border: 1px solid #808080;
  background: #f2f2f2;
  color: inherit;
  text-decoration: none;
`;

const TextArea = styled.textarea`
  min-height: 120px;
  resize: vertical;
  font: inherit;
  padding: 8px;
  border: 2px inset #fff;
`;

const NativeSelect = styled.select`
  font: inherit;
  min-height: 28px;
  border: 2px inset #fff;
  background: #fff;
`;

function shortAddress(value: string | null | undefined): string {
  if (!value) return "none linked";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatCount(value: number | null | undefined): string {
  const count = Number(value || 0);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function rootForReply(post: SkywirePost): { uri: string; cid: string } {
  return post.replyRoot?.uri && post.replyRoot?.cid ? post.replyRoot : { uri: post.uri, cid: post.cid };
}

function actorFromRecord(actor: ActorSearchResponse["actors"][number]): SkywireActor {
  return {
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName || null,
    avatar: actor.avatar || null,
    description: actor.description || null,
  };
}

function FeedActions({ post, enabled }: { post: SkywirePost; enabled: boolean }) {
  const uri = post.uri;
  const cid = post.cid;
  const [replyText, setReplyText] = useState("");
  const qc = useQueryClient();
  const invalidateFeeds = () => qc.invalidateQueries({ queryKey: ["skywire"] });
  const like = useMutation({
    mutationFn: () => api.post("/api/skywire/like", { uri, cid }),
    onSuccess: invalidateFeeds,
  });
  const repost = useMutation({
    mutationFn: () => api.post("/api/skywire/repost", { uri, cid }),
    onSuccess: invalidateFeeds,
  });
  const reply = useMutation({
    mutationFn: () => {
      const root = rootForReply(post);
      return api.post("/api/skywire/reply", {
        uri,
        cid,
        rootUri: root.uri,
        rootCid: root.cid,
        text: replyText,
      });
    },
    onSuccess: () => {
      setReplyText("");
      invalidateFeeds();
    },
  });
  if (!uri || !cid) return null;
  return (
    <Stack>
      <Row>
        <Button size="sm" disabled={!enabled || Boolean(post.viewer.like) || like.isPending} onClick={() => like.mutate()}>
          {post.viewer.like ? "Liked" : "Like"}
        </Button>
        <Button size="sm" disabled={!enabled || Boolean(post.viewer.repost) || repost.isPending} onClick={() => repost.mutate()}>
          {post.viewer.repost ? "Reposted" : "Repost"}
        </Button>
        {post.sourceUrl ? (
          <Button size="sm" onClick={() => window.open(post.sourceUrl || "", "_blank", "noopener,noreferrer")}>
            Open
          </Button>
        ) : null}
      </Row>
      <Row>
        <TextField
          value={replyText}
          onChange={(e: any) => setReplyText(e.target.value)}
          placeholder="reply"
          disabled={!enabled}
          style={{ minWidth: 180, flex: 1 }}
        />
        <Button size="sm" disabled={!enabled || !replyText.trim() || reply.isPending} onClick={() => reply.mutate()}>
          Reply
        </Button>
      </Row>
      {like.isError || repost.isError || reply.isError ? <span>Skywire action failed.</span> : null}
    </Stack>
  );
}

function FeedCard({
  item,
  canAct,
  onActorSelect,
}: {
  item: SkywireFeedItem;
  canAct: boolean;
  onActorSelect?: (actor: SkywireActor) => void;
}) {
  const { post, reason } = item;
  const author = post.author;
  const authorDetails = (
    <div>
      <strong>{author?.displayName || author?.handle || "unknown"}</strong>
      <div>@{author?.handle || "unknown"}</div>
      {formatDate(post.createdAt || post.indexedAt) ? <span>{formatDate(post.createdAt || post.indexedAt)}</span> : null}
    </div>
  );
  return (
    <FeedItem>
      {reason?.by ? <span>Reposted by @{reason.by.handle}</span> : null}
      <PostHeader>
        {author?.avatar ? (
          <ActorButton
            type="button"
            disabled={!author || !onActorSelect}
            onClick={() => author && onActorSelect?.(author)}
            title={author?.handle ? `View @${author.handle}` : "View actor"}
          >
            <Avatar src={author.avatar} alt="" />
          </ActorButton>
        ) : (
          <AvatarFallback />
        )}
        {author && onActorSelect ? (
          <ActorButton type="button" onClick={() => onActorSelect(author)} title={`View @${author.handle}`}>
            {authorDetails}
          </ActorButton>
        ) : (
          authorDetails
        )}
      </PostHeader>
      {post.replyParent ? <span>Replying in thread</span> : null}
      <PostText>{post.text || "(no text)"}</PostText>
      {post.embed.images.length ? (
        <ImageGrid>
          {post.embed.images.map((image, index) => (
            <FeedImage key={`${image.thumb || image.fullsize || index}`} src={image.thumb || image.fullsize || ""} alt={image.alt} />
          ))}
        </ImageGrid>
      ) : null}
      {post.embed.external ? (
        <ExternalCard href={post.embed.external.uri} target="_blank" rel="noopener noreferrer">
          <strong>{post.embed.external.title}</strong>
          {post.embed.external.description ? <span>{post.embed.external.description}</span> : null}
          <Mono>{post.embed.external.uri}</Mono>
        </ExternalCard>
      ) : null}
      <MetaRow>
        <span>{formatCount(post.counts.reply)} replies</span>
        <span>{formatCount(post.counts.repost)} reposts</span>
        <span>{formatCount(post.counts.like)} likes</span>
        {post.counts.quote ? <span>{formatCount(post.counts.quote)} quotes</span> : null}
      </MetaRow>
      <FeedActions post={post} enabled={canAct} />
    </FeedItem>
  );
}

function FeedPanel({
  feedType,
  canAct,
  queryText,
  onActorSelect,
}: {
  feedType: "home" | "discover" | "wtf" | "tezos" | "search";
  canAct: boolean;
  queryText?: string;
  onActorSelect?: (actor: SkywireActor) => void;
}) {
  const query = useInfiniteQuery<FeedResponse>({
    queryKey: ["skywire", "feed", feedType, queryText || ""],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ feedType });
      if (queryText?.trim()) params.set("q", queryText.trim());
      if (pageParam) params.set("cursor", String(pageParam));
      return api.get(`/api/skywire/feed?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  const feed = query.data?.pages.flatMap((page) => page.feed) ?? [];
  return (
    <Stack>
      <FeedList>
        {feed.length === 0 ? <p>No posts found.</p> : null}
        {feed.map((item, index) => (
          <FeedCard item={item} canAct={canAct} onActorSelect={onActorSelect} key={item.post.uri || index} />
        ))}
      </FeedList>
      {query.hasNextPage ? (
        <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? "Loading..." : "Load More"}
        </Button>
      ) : null}
    </Stack>
  );
}

function ActorFeedPanel({
  actor,
  canAct,
  onActorSelect,
}: {
  actor: SkywireActor | null;
  canAct: boolean;
  onActorSelect?: (actor: SkywireActor) => void;
}) {
  const actorId = actor?.did || actor?.handle || "";
  const query = useInfiniteQuery<FeedResponse>({
    queryKey: ["skywire", "actor-feed", actorId],
    enabled: Boolean(actorId),
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", String(pageParam));
      return api.get(`/api/skywire/actor/${encodeURIComponent(actorId)}/feed?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
  if (!actorId) return <p>Select an actor to inspect their AT feed.</p>;
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  const feed = query.data?.pages.flatMap((page) => page.feed) ?? [];
  return (
    <Stack>
      <GroupBox label="Author">
        <Row>
          {actor?.avatar ? <img src={actor.avatar} width={40} height={40} alt="" /> : null}
          <div>
            <strong>{actor?.displayName || actor?.handle || actorId}</strong>
            <div>@{actor?.handle || actorId}</div>
          </div>
        </Row>
        {actor?.description ? <p>{actor.description}</p> : null}
        <Mono>{actorId}</Mono>
      </GroupBox>
      <FeedList>
        {feed.length === 0 ? <p>No posts found for this actor.</p> : null}
        {feed.map((item, index) => (
          <FeedCard item={item} canAct={canAct} onActorSelect={onActorSelect} key={item.post.uri || index} />
        ))}
      </FeedList>
      {query.hasNextPage ? (
        <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? "Loading..." : "Load More"}
        </Button>
      ) : null}
    </Stack>
  );
}

function AccountPanel({ me }: { me: AtprotoMe }) {
  const handleClaims = me.handleClaims ?? [];
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState(me.account?.displayName || "");
  const [description, setDescription] = useState(me.account?.description || "");
  const [desiredHandle, setDesiredHandle] = useState("");
  const [tezosAlias, setTezosAlias] = useState(me.tezosAlias || "");
  const qc = useQueryClient();
  useEffect(() => {
    setDisplayName(me.account?.displayName || "");
    setDescription(me.account?.description || "");
  }, [me.account?.displayName, me.account?.description]);
  useEffect(() => {
    setTezosAlias(me.tezosIdentity?.preferredTezosDomain || me.tezosAlias || "");
  }, [me.tezosAlias, me.tezosIdentity?.preferredTezosDomain]);
  const registrationOptions = useQuery<{
    enabled: boolean;
    allowedPds: string[];
    defaultPds: string;
    handleSuffix: string | null;
    inviteCodeRequired: boolean;
    phoneVerificationMode: "skywire" | "external";
    externalSignupUrl: string | null;
  }>({
    queryKey: ["skywire", "registration-options"],
    queryFn: () => api.get("/api/atproto/registration/options"),
  });
  const externalSignupUrl = registrationOptions.data?.externalSignupUrl || "https://bsky.app";
  const startOAuthConnect = (rawHandle: string) => {
    const suffix = registrationOptions.data?.handleSuffix || "bsky.social";
    const trimmed = rawHandle.trim();
    if (!trimmed) return;
    const connectHandle = trimmed.includes(".") ? trimmed : `${trimmed}.${suffix}`;
    const url = `/api/atproto/oauth/start?handle=${encodeURIComponent(connectHandle)}&returnTo=/skywire&popup=1`;
    const popup = window.open("about:blank", "skywire-atproto-oauth", "width=520,height=760");
    if (popup) {
      popup.opener = null;
      popup.location.href = url;
    } else {
      window.location.href = url.replace("&popup=1", "");
    }
  };
  const updateProfile = useMutation({
    mutationFn: () => api.post("/api/skywire/profile", { displayName, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skywire", "me"] }),
  });
  const claim = useMutation({
    mutationFn: () =>
      api.post("/api/atproto/handle/claim", {
        desiredHandle,
        tezosAlias: tezosAlias || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skywire", "me"] }),
  });

  return (
    <Grid>
      <Stack>
        <GroupBox label="AT Protocol Account">
          <Stack>
            {me.account ? (
              <>
                <Row>
                  {me.account.avatarUrl ? (
                    <img src={me.account.avatarUrl} width={48} height={48} alt="" />
                  ) : null}
                  <div>
                    <strong>{me.account.displayName || me.account.handle}</strong>
                    <div>@{me.account.handle}</div>
                  </div>
                </Row>
                <Mono>{me.account.did}</Mono>
                <span>PDS: {me.account.pdsUrl || "reported by OAuth issuer"}</span>
                {me.account.session?.reconnectRequired ? (
                  <GroupBox label="Session">
                    <Stack>
                      <span>Skywire needs a fresh AT Protocol session for this account.</span>
                      {me.account.session.reason ? <span>Reason: {me.account.session.reason}</span> : null}
                      <Button onClick={() => startOAuthConnect(me.account?.handle || "")}>
                        Reconnect Bluesky
                      </Button>
                    </Stack>
                  </GroupBox>
                ) : (
                  <span>Session: connected</span>
                )}
              </>
            ) : (
              <>
                <TextField
                  value={handle}
                  onChange={(e: any) => setHandle(e.target.value)}
                  placeholder="your-handle.bsky.social"
                  fullWidth
                />
                <Button
                  disabled={!handle.trim()}
                  onClick={() => startOAuthConnect(handle)}
                >
                  Connect Bluesky / AT Protocol
                </Button>
                <GroupBox label="Create New AT Identity">
                  <Stack>
                    <span>
                      Create the Bluesky account in the official flow, then return here and connect the new handle.
                    </span>
                    {registrationOptions.isLoading ? <Hourglass size={24} /> : null}
                    {registrationOptions.isError ? <span>{(registrationOptions.error as Error).message}</span> : null}
                    <Row>
                      <Button
                        onClick={() => {
                          window.open(externalSignupUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        Open Bluesky Signup
                      </Button>
                    </Row>
                  </Stack>
                </GroupBox>
              </>
            )}
          </Stack>
        </GroupBox>
        {me.account ? (
          <GroupBox label="Skywire Profile">
            <Stack>
              <TextField
                value={displayName}
                onChange={(e: any) => setDisplayName(e.target.value)}
                placeholder="display name"
                fullWidth
              />
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="profile description"
                maxLength={256}
              />
              <Button disabled={updateProfile.isPending} onClick={() => updateProfile.mutate()}>
                Update Profile
              </Button>
              {updateProfile.isError ? <span>{(updateProfile.error as Error).message}</span> : null}
              {updateProfile.isSuccess ? <span>Profile pushed to your AT repo.</span> : null}
            </Stack>
          </GroupBox>
        ) : null}
        <GroupBox label="Identity Bridge">
          <Stack>
            <span>AT handle: {me.account?.handle || "not connected"}</span>
            <span>
              Preferred Tezos identity: {me.tezosIdentity?.preferredTezosDomain || "none detected"}
              {me.tezosIdentity?.preferredSource !== "none" ? ` (${me.tezosIdentity.preferredSource})` : ""}
            </span>
            <span>Primary wallet: {shortAddress(me.tezosIdentity?.primaryWalletAddress || me.walletAddress)}</span>
            {me.tezosIdentity?.ownedTezosDomains?.length ? (
              <span>Detected .tez domains: {me.tezosIdentity.ownedTezosDomains.join(", ")}</span>
            ) : null}
            <TextField
              value={desiredHandle}
              onChange={(e: any) => setDesiredHandle(e.target.value)}
              placeholder="name.skywire.wtfgameshow.app or name.tez"
              fullWidth
            />
            <TextField
              value={tezosAlias}
              onChange={(e: any) => setTezosAlias(e.target.value)}
              placeholder="optional .tez alias"
              fullWidth
            />
            {me.tezosIdentity?.preferredTezosDomain ? (
              <Button
                disabled={!me.account}
                onClick={() => {
                  const preferred = me.tezosIdentity.preferredTezosDomain || "";
                  setDesiredHandle(preferred);
                  setTezosAlias(preferred);
                }}
              >
                Use Preferred .tez
              </Button>
            ) : null}
            <Button disabled={!me.account || !desiredHandle.trim() || claim.isPending} onClick={() => claim.mutate()}>
              Claim / Record Bridge
            </Button>
            {claim.isError ? <span>{(claim.error as Error).message}</span> : null}
          </Stack>
        </GroupBox>
      </Stack>
      <GroupBox label="Claims">
        <Stack>
          {handleClaims.length === 0 ? <p>No handle claims yet.</p> : null}
          {handleClaims.map((claim) => (
            <FeedItem key={claim.id}>
              <strong>{claim.desiredHandle}</strong>
              <span>{claim.verificationStatus} via {claim.verificationMethod}</span>
              {claim.tezosAlias ? <span>Tezos alias: {claim.tezosAlias}</span> : null}
              {claim.failureReason ? <span>{claim.failureReason}</span> : null}
            </FeedItem>
          ))}
        </Stack>
      </GroupBox>
    </Grid>
  );
}

function ComposerPanel({ me }: { me: AtprotoMe }) {
  const canUseAtprotoSession = Boolean(me.account && !me.account.session?.reconnectRequired);
  const [text, setText] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [postedUri, setPostedUri] = useState("");
  const post = useMutation({
    mutationFn: () =>
      api.post<{ uri: string; cid: string; sourceUrl: string | null }>("/api/skywire/post", {
        text,
        challengeId: challengeId ? Number(challengeId) : undefined,
      }),
    onSuccess: (data) => setPostedUri(data.uri),
  });
  const remaining = 300 - Array.from(text).length;
  const intentUrl = useMemo(() => `/api/skywire/share-intent?text=${encodeURIComponent(text)}`, [text]);

  return (
    <GroupBox label="Composer">
      <Stack>
        <TextArea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
        <Row>
          <span>{remaining} characters</span>
          <TextField
            value={challengeId}
            onChange={(e: any) => setChallengeId(e.target.value)}
            placeholder="challenge id"
            style={{ width: 150 }}
          />
          <Button
            disabled={!canUseAtprotoSession || remaining < 0 || text.trim().length === 0 || post.isPending}
            onClick={() => post.mutate()}
          >
            Post
          </Button>
          <Button
            disabled={!text.trim()}
            onClick={async () => {
              const { url } = await api.get<{ url: string }>(intentUrl);
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            Share on Bluesky
          </Button>
        </Row>
        {!me.account ? <span>Connect an AT account to post from inside WTF.</span> : null}
        {me.account && !canUseAtprotoSession ? <span>Reconnect Bluesky from the Account tab to post from inside WTF.</span> : null}
        {post.isError ? <span>{(post.error as Error).message}</span> : null}
        {postedUri ? <Mono>{postedUri}</Mono> : null}
      </Stack>
    </GroupBox>
  );
}

function ChallengesPanel() {
  const [postUrlOrUri, setPostUrlOrUri] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const claim = useMutation({
    mutationFn: () =>
      api.post("/api/skywire/post/claim", {
        postUrlOrUri,
        challengeId: challengeId ? Number(challengeId) : undefined,
      }),
  });
  return (
    <GroupBox label="Challenge Claims">
      <Stack>
        <TextField
          value={postUrlOrUri}
          onChange={(e: any) => setPostUrlOrUri(e.target.value)}
          placeholder="https://bsky.app/profile/.../post/... or at://..."
          fullWidth
        />
        <TextField
          value={challengeId}
          onChange={(e: any) => setChallengeId(e.target.value)}
          placeholder="optional challenge id"
          fullWidth
        />
        <Button disabled={!postUrlOrUri.trim() || claim.isPending} onClick={() => claim.mutate()}>
          Claim Existing Post
        </Button>
        {claim.isError ? <span>{(claim.error as Error).message}</span> : null}
        {claim.isSuccess ? <span>Claim submitted to WTF challenge automation.</span> : null}
      </Stack>
    </GroupBox>
  );
}

function NotificationsPanel() {
  const query = useQuery<{
    notifications: Array<{
      uri: string;
      reason: string;
      indexedAt: string | null;
      author: SkywireActor | null;
      post: SkywirePost;
    }>;
  }>({
    queryKey: ["skywire", "notifications"],
    queryFn: () => api.get("/api/skywire/notifications"),
  });
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  return (
    <FeedList>
      {(query.data?.notifications || []).map((item: any, index: number) => (
        <FeedItem key={item.uri || index}>
          <strong>{item.reason}</strong>
          <span>@{item.author?.handle || "unknown"} {formatDate(item.indexedAt)}</span>
          <PostText>{item.post.text || "(no text)"}</PostText>
          <MetaRow>
            <span>{formatCount(item.post.counts.reply)} replies</span>
            <span>{formatCount(item.post.counts.repost)} reposts</span>
            <span>{formatCount(item.post.counts.like)} likes</span>
          </MetaRow>
          {item.post.sourceUrl ? (
            <Button size="sm" onClick={() => window.open(item.post.sourceUrl || "", "_blank", "noopener,noreferrer")}>
              Open
            </Button>
          ) : null}
        </FeedItem>
      ))}
    </FeedList>
  );
}

function DiscoverPanel({
  me,
  onActorOpen,
}: {
  me: AtprotoMe;
  onActorOpen: (actor: SkywireActor) => void;
}) {
  const canUseAtprotoSession = Boolean(me.account && !me.account.session?.reconnectRequired);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const recommendedActors = useQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", "recommended"],
    queryFn: () => api.get("/api/skywire/actors/recommended"),
  });
  const suggestedActors = useQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", "suggestions"],
    enabled: Boolean(me.account),
    queryFn: () => api.get("/api/skywire/actors/suggestions"),
  });
  const followedActors = useInfiniteQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", "follows"],
    enabled: Boolean(me.account),
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "30" });
      if (pageParam) params.set("cursor", String(pageParam));
      return api.get(`/api/skywire/actors/follows?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
  const actorSearch = useQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", submitted],
    enabled: Boolean(submitted.trim()),
    queryFn: () => api.get(`/api/skywire/actors/search?q=${encodeURIComponent(submitted.trim())}`),
  });
  const follow = useMutation({
    mutationFn: (did: string) => api.post("/api/skywire/follow", { did }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skywire", "actors"] });
    },
  });
  const following = followedActors.data?.pages.flatMap((page) => page.actors) ?? [];
  const followedDidSet = new Set(following.map((actor) => actor.did));
  const renderActor = (actor: ActorSearchResponse["actors"][number], context: "following" | "suggested" | "recommended" | "search") => {
    const isSelf = Boolean(me.account?.did && actor.did === me.account.did);
    const alreadyFollowing = context === "following" || followedDidSet.has(actor.did);
    return (
      <FeedItem key={actor.did}>
        <Row>
          {actor.avatar ? <img src={actor.avatar} width={40} height={40} alt="" /> : null}
          <div>
            <strong>{actor.displayName || actor.handle}</strong>
            <div>@{actor.handle}</div>
            {actor.wtfUsername ? <span>WTF: {actor.wtfUsername}</span> : null}
            {actor.suggestedByHandles?.length ? (
              <span>Followed by {actor.suggestedByHandles.map((handle) => `@${handle}`).join(", ")}</span>
            ) : null}
          </div>
        </Row>
        {actor.description ? <span>{actor.description}</span> : null}
        <Mono>{actor.did}</Mono>
        <Row>
          <Button size="sm" onClick={() => onActorOpen(actorFromRecord(actor))}>
            View Feed
          </Button>
          <Button
            size="sm"
            disabled={!canUseAtprotoSession || isSelf || alreadyFollowing || follow.isPending}
            onClick={() => follow.mutate(actor.did)}
          >
            {isSelf ? "You" : alreadyFollowing ? "Following" : "Follow"}
          </Button>
        </Row>
      </FeedItem>
    );
  };

  return (
    <Grid>
      <GroupBox label="Actor Discovery">
        <Stack>
          <GroupBox label="Following on Bluesky">
            <Stack>
              {!me.account ? <p>Connect Bluesky to inspect the actors you follow.</p> : null}
              {followedActors.isLoading ? <Hourglass size={24} /> : null}
              {followedActors.isError ? <span>{(followedActors.error as Error).message}</span> : null}
              <FeedList>
                {following.length === 0 && me.account && !followedActors.isLoading ? (
                  <p>No follows returned for this account yet.</p>
                ) : null}
                {following.map((actor) => renderActor(actor, "following"))}
              </FeedList>
              {followedActors.hasNextPage ? (
                <Button disabled={followedActors.isFetchingNextPage} onClick={() => followedActors.fetchNextPage()}>
                  {followedActors.isFetchingNextPage ? "Loading..." : "Load More Follows"}
                </Button>
              ) : null}
            </Stack>
          </GroupBox>
          <GroupBox label="Suggested by Skywire">
            <Stack>
              {!me.account ? <p>Connect Bluesky to compare your follows with other Skywire users.</p> : null}
              {suggestedActors.isLoading ? <Hourglass size={24} /> : null}
              {suggestedActors.isError ? <span>{(suggestedActors.error as Error).message}</span> : null}
              <FeedList>
                {(suggestedActors.data?.actors ?? []).length === 0 && me.account && !suggestedActors.isLoading ? (
                  <p>No peer follow suggestions yet.</p>
                ) : null}
                {(suggestedActors.data?.actors ?? []).map((actor) => renderActor(actor, "suggested"))}
              </FeedList>
            </Stack>
          </GroupBox>
        </Stack>
      </GroupBox>
      <GroupBox label="Search & Skywire Users">
        <Stack>
          <GroupBox label="Skywire Users">
            <Stack>
              {recommendedActors.isLoading ? <Hourglass size={24} /> : null}
              {recommendedActors.isError ? <span>{(recommendedActors.error as Error).message}</span> : null}
              <FeedList>
                {(recommendedActors.data?.actors ?? []).length === 0 && !recommendedActors.isLoading ? (
                  <p>No other Skywire users have connected Bluesky yet.</p>
                ) : null}
                {(recommendedActors.data?.actors ?? []).map((actor) => renderActor(actor, "recommended"))}
              </FeedList>
            </Stack>
          </GroupBox>
          <Row>
            <TextField
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="search AT Protocol actors"
              style={{ minWidth: 220, flex: 1 }}
            />
            <Button disabled={!query.trim()} onClick={() => setSubmitted(query)}>
              Search
            </Button>
          </Row>
          {actorSearch.isLoading ? <Hourglass size={24} /> : null}
          {actorSearch.isError ? <span>{(actorSearch.error as Error).message}</span> : null}
          <FeedList>
            {(actorSearch.data?.actors ?? []).map((actor) => renderActor(actor, "search"))}
          </FeedList>
        </Stack>
      </GroupBox>
    </Grid>
  );
}

function SignalsPanel({ me }: { me: AtprotoMe }) {
  const canUseAtprotoSession = Boolean(me.account && !me.account.session?.reconnectRequired);
  const [text, setText] = useState("");
  const [signalType, setSignalType] = useState("status");
  const [tags, setTags] = useState("");
  const [relatedUri, setRelatedUri] = useState("");
  const qc = useQueryClient();
  const signals = useQuery<SignalsResponse>({
    queryKey: ["skywire", "signals"],
    enabled: canUseAtprotoSession,
    queryFn: () => api.get("/api/skywire/signals"),
  });
  const publish = useMutation({
    mutationFn: () =>
      api.post("/api/skywire/signals", {
        text,
        signalType,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        relatedUri: relatedUri || undefined,
      }),
    onSuccess: () => {
      setText("");
      setRelatedUri("");
      qc.invalidateQueries({ queryKey: ["skywire", "signals"] });
    },
  });
  if (!me.account) return <p>Connect or register an AT account to publish WTF-native Skywire Signals.</p>;
  if (!canUseAtprotoSession) return <p>Reconnect Bluesky from the Account tab to publish and inspect Skywire Signals.</p>;
  return (
    <Grid>
      <GroupBox label="Publish Skywire Signal">
        <Stack>
          <NativeSelect value={signalType} onChange={(event) => setSignalType(event.target.value)}>
            <option value="status">Status</option>
            <option value="quest">Quest</option>
            <option value="drop">Drop</option>
            <option value="proof">Proof</option>
            <option value="broadcast">Broadcast</option>
          </NativeSelect>
          <TextArea value={text} onChange={(event) => setText(event.target.value)} maxLength={300} />
          <TextField
            value={tags}
            onChange={(e: any) => setTags(e.target.value)}
            placeholder="tags, comma separated"
            fullWidth
          />
          <TextField
            value={relatedUri}
            onChange={(e: any) => setRelatedUri(e.target.value)}
            placeholder="optional related at:// uri"
            fullWidth
          />
          <Button disabled={!text.trim() || publish.isPending} onClick={() => publish.mutate()}>
            Publish Signal
          </Button>
          {publish.isError ? <span>{(publish.error as Error).message}</span> : null}
        </Stack>
      </GroupBox>
      <GroupBox label="Your AT Repo Signals">
        <Stack>
          <Mono>{signals.data?.collection || "app.wtfgameshow.skywire.signal"}</Mono>
          {signals.isLoading ? <Hourglass size={24} /> : null}
          {signals.isError ? <span>{(signals.error as Error).message}</span> : null}
          <FeedList>
            {(signals.data?.records ?? []).map((record) => (
              <FeedItem key={record.uri}>
                <strong>{record.value.signalType || "signal"}</strong>
                <span>{record.value.text || "(no text)"}</span>
                {record.value.tags?.length ? <span>{record.value.tags.join(", ")}</span> : null}
                <Mono>{record.uri}</Mono>
              </FeedItem>
            ))}
          </FeedList>
        </Stack>
      </GroupBox>
    </Grid>
  );
}

export function Skywire() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SkywireTab>("home");
  const [selectedActor, setSelectedActor] = useState<SkywireActor | null>(null);
  const [didChooseInitialTab, setDidChooseInitialTab] = useState(false);
  const [notice, setNotice] = useState("");
  const meQuery = useQuery<AtprotoMe>({
    queryKey: ["skywire", "me"],
    queryFn: () => api.get("/api/atproto/me"),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifiedHandle = params.get("handle");
    const isPopup = params.get("popup") === "1";
    if (params.get("verified") === "atproto") {
      setTab("home");
      setNotice(verifiedHandle ? `Bluesky identity connected: @${verifiedHandle}` : "Bluesky identity connected.");
      qc.invalidateQueries({ queryKey: ["skywire", "me"] });
      try {
        window.localStorage.setItem(
          "skywire:atproto-linked",
          JSON.stringify({ handle: verifiedHandle, at: Date.now() })
        );
      } catch {
        // Storage sync is best-effort for popup completion.
      }
      if (isPopup) {
        window.close();
      }
    }
    const error = params.get("error");
    if (error === "atproto_handle") setNotice("Enter a Bluesky handle like name.bsky.social, or just the username.");
    if (error === "atproto_oauth_start") setNotice("Bluesky connection could not start. Check the handle and try again.");
    if (error === "atproto_oauth") setNotice("Bluesky connection did not complete. Try connecting again.");
    if (error === "atproto_session") setNotice("Sign in to WTF OS before connecting Bluesky.");
    if (error === "atproto_state") setNotice("Bluesky connection state expired. Try connecting again.");
    if (params.has("verified") || params.has("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qc]);

  useEffect(() => {
    const me = meQuery.data;
    if (!me || didChooseInitialTab) return;
    setTab(me.account ? "home" : "account");
    setDidChooseInitialTab(true);
  }, [didChooseInitialTab, meQuery.data]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "skywire:atproto-linked" && event.key !== "skywire:atproto-error") return;
      let payload: { handle?: string; error?: string } = {};
      try {
        payload = JSON.parse(event.newValue || "{}") || {};
      } catch {
        payload = {};
      }
      if (event.key === "skywire:atproto-error") {
        setTab("account");
        setNotice(
          payload.error === "atproto_handle"
            ? "Enter a Bluesky handle like name.bsky.social, or just the username."
            : "Bluesky connection did not complete. Try connecting again."
        );
        return;
      }
      const handle = payload.handle || "";
      setTab("home");
      setNotice(handle ? `Bluesky identity connected: @${handle}` : "Bluesky identity connected.");
      qc.invalidateQueries({ queryKey: ["skywire", "me"] });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [qc]);

  const me = meQuery.data;
  const canUseAtprotoSession = Boolean(me?.account && !me.account.session?.reconnectRequired);
  const openActorFeed = (actor: SkywireActor) => {
    if (!actor.did && !actor.handle) return;
    setSelectedActor(actor);
    setTab("actor");
  };

  return (
    <AppWindow title="Skywire">
      <Shell>
        {notice ? <p>{notice}</p> : null}
        <Tabs value={tab} onChange={(value: any) => setTab(value)}>
          <Tab value="account">Account</Tab>
          <Tab value="home">Home</Tab>
          <Tab value="actor">Actor Feed</Tab>
          <Tab value="discover">Discover</Tab>
          <Tab value="wtf">WTF Feed</Tab>
          <Tab value="tezos">Tezos Feed</Tab>
          <Tab value="mentions">Mentions</Tab>
          <Tab value="signals">Signals</Tab>
          <Tab value="challenges">Challenges</Tab>
          <Tab value="composer">Composer</Tab>
          {isAdmin ? <Tab value="debug">Debug</Tab> : null}
        </Tabs>
        <TabBody>
          {meQuery.isLoading ? <Hourglass size={32} /> : null}
          {meQuery.isError ? <p>{(meQuery.error as Error).message}</p> : null}
          {me ? (
            <>
              {tab === "account" ? <AccountPanel me={me} /> : null}
              {tab === "home" ? (
                me.account ? (
                  canUseAtprotoSession ? (
                    <FeedPanel feedType="home" canAct={canUseAtprotoSession} onActorSelect={openActorFeed} />
                  ) : (
                    <p>Reconnect Bluesky from the Account tab to load your home timeline.</p>
                  )
                ) : (
                  <p>Connect an AT account to load your Bluesky home timeline.</p>
                )
              ) : null}
              {tab === "actor" ? (
                <ActorFeedPanel actor={selectedActor} canAct={canUseAtprotoSession} onActorSelect={openActorFeed} />
              ) : null}
              {tab === "discover" ? <DiscoverPanel me={me} onActorOpen={openActorFeed} /> : null}
              {tab === "wtf" ? <FeedPanel feedType="wtf" canAct={canUseAtprotoSession} onActorSelect={openActorFeed} /> : null}
              {tab === "tezos" ? <FeedPanel feedType="tezos" canAct={canUseAtprotoSession} onActorSelect={openActorFeed} /> : null}
              {tab === "mentions" ? (
                me.account ? (
                  canUseAtprotoSession ? (
                    <NotificationsPanel />
                  ) : (
                    <p>Reconnect Bluesky from the Account tab to load notifications.</p>
                  )
                ) : (
                  <p>Connect an AT account to load notifications.</p>
                )
              ) : null}
              {tab === "signals" ? <SignalsPanel me={me} /> : null}
              {tab === "challenges" ? <ChallengesPanel /> : null}
              {tab === "composer" ? <ComposerPanel me={me} /> : null}
              {tab === "debug" && isAdmin ? (
                <GroupBox label="Debug">
                  <Stack>
                    <span>Client ID: <Mono>{me.oauth.clientIdUrl}</Mono></span>
                    <span>Redirect: <Mono>{me.oauth.redirectUri}</Mono></span>
                    <span>Token storage: {me.account?.hasEncryptedTokens ? "encrypted" : "not connected"}</span>
                    <span>DPoP key: {me.account?.hasDpopKey ? "stored encrypted" : "not stored"}</span>
                    <span>Last sync: {me.account?.lastSyncedAt || "never"}</span>
                  </Stack>
                </GroupBox>
              ) : null}
            </>
          ) : null}
        </TabBody>
      </Shell>
    </AppWindow>
  );
}
