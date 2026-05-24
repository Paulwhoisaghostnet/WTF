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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

type SkywireTab =
  | "account"
  | "wtf"
  | "tezos"
  | "mentions"
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
  oauth: { clientIdUrl: string; redirectUri: string; scope: string };
}

interface FeedResponse {
  feedType: string;
  feed: Array<any>;
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

const TextArea = styled.textarea`
  min-height: 120px;
  resize: vertical;
  font: inherit;
  padding: 8px;
  border: 2px inset #fff;
`;

function postText(item: any): string {
  return item?.post?.record?.text || item?.record?.text || item?.text || "";
}

function postAuthor(item: any): string {
  return item?.post?.author?.handle || item?.author?.handle || "unknown";
}

function FeedPanel({ feedType }: { feedType: string }) {
  const query = useQuery<FeedResponse>({
    queryKey: ["skywire", "feed", feedType],
    queryFn: () => api.get(`/api/skywire/feed?feedType=${encodeURIComponent(feedType)}`),
  });
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  const feed = query.data?.feed ?? [];
  return (
    <FeedList>
      {feed.length === 0 ? <p>No posts found.</p> : null}
      {feed.map((item, index) => (
        <FeedItem key={item?.post?.uri || item?.uri || index}>
          <strong>@{postAuthor(item)}</strong>
          <span>{postText(item) || "(no text)"}</span>
          <Mono>{item?.post?.uri || item?.uri || ""}</Mono>
        </FeedItem>
      ))}
    </FeedList>
  );
}

function AccountPanel({ me }: { me: AtprotoMe }) {
  const [handle, setHandle] = useState("");
  const [desiredHandle, setDesiredHandle] = useState("");
  const [tezosAlias, setTezosAlias] = useState(me.tezosAlias || "");
  const qc = useQueryClient();
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
                  onClick={() => {
                    window.location.href = `/api/atproto/oauth/start?handle=${encodeURIComponent(handle.trim())}&returnTo=/skywire`;
                  }}
                >
                  Connect Bluesky / AT Protocol
                </Button>
              </>
            )}
          </Stack>
        </GroupBox>
        <GroupBox label="Identity Bridge">
          <Stack>
            <span>AT-compliant handle: {me.account?.handle || "not connected"}</span>
            <span>Tezos alias: {me.tezosAlias || "none linked"}</span>
            <span>Wallet: {me.walletAddress || "none linked"}</span>
            <TextField
              value={desiredHandle}
              onChange={(e: any) => setDesiredHandle(e.target.value)}
              placeholder="name.skywire.wtfgameshow.app"
              fullWidth
            />
            <TextField
              value={tezosAlias}
              onChange={(e: any) => setTezosAlias(e.target.value)}
              placeholder="optional .tez alias"
              fullWidth
            />
            <Button disabled={!me.account || !desiredHandle.trim() || claim.isPending} onClick={() => claim.mutate()}>
              Claim Handle
            </Button>
            {claim.isError ? <span>{(claim.error as Error).message}</span> : null}
          </Stack>
        </GroupBox>
      </Stack>
      <GroupBox label="Claims">
        <Stack>
          {me.handleClaims.length === 0 ? <p>No handle claims yet.</p> : null}
          {me.handleClaims.map((claim) => (
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
            disabled={!me.account || remaining < 0 || text.trim().length === 0 || post.isPending}
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
  const query = useQuery<any>({
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
          <span>@{item.author?.handle || "unknown"}</span>
          <Mono>{item.uri}</Mono>
        </FeedItem>
      ))}
    </FeedList>
  );
}

export function Skywire() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<SkywireTab>("account");
  const meQuery = useQuery<AtprotoMe>({
    queryKey: ["skywire", "me"],
    queryFn: () => api.get("/api/atproto/me"),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "atproto") setTab("account");
    if (params.has("verified") || params.has("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const me = meQuery.data;

  return (
    <AppWindow title="Skywire">
      <Shell>
        <Tabs value={tab} onChange={(value: any) => setTab(value)}>
          <Tab value="account">Account</Tab>
          <Tab value="wtf">WTF Feed</Tab>
          <Tab value="tezos">Tezos Feed</Tab>
          <Tab value="mentions">Mentions</Tab>
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
              {tab === "wtf" ? <FeedPanel feedType="wtf" /> : null}
              {tab === "tezos" ? <FeedPanel feedType="tezos" /> : null}
              {tab === "mentions" ? (me.account ? <NotificationsPanel /> : <p>Connect an AT account to load notifications.</p>) : null}
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
