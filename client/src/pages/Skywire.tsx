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
  feed: Array<any>;
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

function postText(item: any): string {
  return item?.post?.record?.text || item?.record?.text || item?.text || "";
}

function postAuthor(item: any): string {
  return item?.post?.author?.handle || item?.author?.handle || "unknown";
}

function postUri(item: any): string {
  return item?.post?.uri || item?.uri || "";
}

function postCid(item: any): string {
  return item?.post?.cid || item?.cid || "";
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function shortAddress(value: string | null | undefined): string {
  if (!value) return "none linked";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function FeedActions({ item, enabled }: { item: any; enabled: boolean }) {
  const uri = postUri(item);
  const cid = postCid(item);
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
    mutationFn: () => api.post("/api/skywire/reply", { uri, cid, text: replyText }),
    onSuccess: () => {
      setReplyText("");
      invalidateFeeds();
    },
  });
  if (!uri || !cid) return null;
  return (
    <Stack>
      <Row>
        <Button size="sm" disabled={!enabled || like.isPending} onClick={() => like.mutate()}>
          Like
        </Button>
        <Button size="sm" disabled={!enabled || repost.isPending} onClick={() => repost.mutate()}>
          Repost
        </Button>
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

function FeedPanel({ feedType, canAct }: { feedType: string; canAct: boolean }) {
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
        <FeedItem key={postUri(item) || index}>
          <strong>@{postAuthor(item)}</strong>
          <span>{postText(item) || "(no text)"}</span>
          <Mono>{postUri(item)}</Mono>
          <FeedActions item={item} enabled={canAct} />
        </FeedItem>
      ))}
    </FeedList>
  );
}

function AccountPanel({ me }: { me: AtprotoMe }) {
  const handleClaims = me.handleClaims ?? [];
  const [handle, setHandle] = useState("");
  const [registrationHandle, setRegistrationHandle] = useState("");
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [registrationInvite, setRegistrationInvite] = useState("");
  const [registrationPhone, setRegistrationPhone] = useState("");
  const [registrationPhoneCode, setRegistrationPhoneCode] = useState("");
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
  const registrationPds = registrationOptions.data?.defaultPds;
  const phoneVerificationMode = registrationOptions.data?.phoneVerificationMode;
  const externalSignupUrl = registrationOptions.data?.externalSignupUrl || "https://bsky.app";
  const externalPhoneFlow = phoneVerificationMode === "external";
  const register = useMutation({
    mutationFn: () =>
      api.post("/api/atproto/register", {
        pdsUrl: registrationPds,
        handle: registrationHandle,
        email: registrationEmail,
        password: registrationPassword,
        inviteCode: registrationInvite || undefined,
        verificationPhone: externalPhoneFlow ? undefined : registrationPhone || undefined,
        verificationCode: externalPhoneFlow ? undefined : registrationPhoneCode || undefined,
      }),
    onSuccess: () => {
      setRegistrationPassword("");
      setRegistrationInvite("");
      setRegistrationPhone("");
      setRegistrationPhoneCode("");
      qc.invalidateQueries({ queryKey: ["skywire", "me"] });
    },
  });
  const phoneVerification = useMutation({
    mutationFn: () =>
      api.post("/api/atproto/register/phone-verification", {
        pdsUrl: registrationPds,
        phoneNumber: registrationPhone,
      }),
  });
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
                    const suffix = registrationOptions.data?.handleSuffix || "bsky.social";
                    const connectHandle = handle.trim().includes(".") ? handle.trim() : `${handle.trim()}.${suffix}`;
                    const url = `/api/atproto/oauth/start?handle=${encodeURIComponent(connectHandle)}&returnTo=/skywire&popup=1`;
                    const popup = window.open("about:blank", "skywire-atproto-oauth", "width=520,height=760");
                    if (popup) {
                      popup.opener = null;
                      popup.location.href = url;
                    } else {
                      window.location.href = url.replace("&popup=1", "");
                    }
                  }}
                >
                  Connect Bluesky / AT Protocol
                </Button>
                <GroupBox label="Register New AT Identity">
                  <Stack>
                    <span>PDS: {registrationPds || "loading"}</span>
                    {registrationOptions.isLoading ? <Hourglass size={24} /> : null}
                    {registrationOptions.isError ? <span>{(registrationOptions.error as Error).message}</span> : null}
                    {!registrationOptions.data ? null : externalPhoneFlow ? (
                      <>
                        <span>Create the Bluesky account in the official flow, then return here and connect the new handle.</span>
                        <Row>
                          <Button
                            onClick={() => {
                              window.open(externalSignupUrl, "_blank", "noopener,noreferrer");
                            }}
                          >
                            Open PDS Signup
                          </Button>
                        </Row>
                      </>
                    ) : (
                      <>
                        <span>
                          Handle: @
                          {registrationHandle.trim()
                            ? registrationHandle.includes(".")
                              ? registrationHandle.trim()
                              : `${registrationHandle.trim()}.${registrationOptions.data?.handleSuffix || "bsky.social"}`
                            : `name.${registrationOptions.data?.handleSuffix || "bsky.social"}`}
                        </span>
                        <TextField
                          value={registrationHandle}
                          onChange={(e: any) => setRegistrationHandle(e.target.value)}
                          placeholder="wtfgameshow or wtfgameshow.bsky.social"
                          name="skywire-registration-handle"
                          autoComplete="off"
                          fullWidth
                        />
                        <TextField
                          value={registrationEmail}
                          onChange={(e: any) => setRegistrationEmail(e.target.value)}
                          placeholder="email"
                          type="email"
                          name="skywire-registration-email"
                          autoComplete="email"
                          fullWidth
                        />
                        <TextField
                          value={registrationPassword}
                          onChange={(e: any) => setRegistrationPassword(e.target.value)}
                          placeholder="password"
                          type="password"
                          name="skywire-registration-password"
                          autoComplete="new-password"
                          fullWidth
                        />
                        <TextField
                          value={registrationInvite}
                          onChange={(e: any) => setRegistrationInvite(e.target.value)}
                          placeholder={registrationOptions.data?.inviteCodeRequired ? "invite code required" : "invite code optional"}
                          name="skywire-registration-invite-code"
                          autoComplete="off"
                          fullWidth
                        />
                        <Row>
                          <TextField
                            value={registrationPhone}
                            onChange={(e: any) => setRegistrationPhone(e.target.value)}
                            placeholder="+15551234567"
                            type="tel"
                            name="skywire-registration-phone"
                            autoComplete="tel"
                            style={{ minWidth: 180, flex: 1 }}
                          />
                          <Button
                            disabled={!registrationPhone.trim() || phoneVerification.isPending}
                            onClick={() => phoneVerification.mutate()}
                          >
                            Send Phone Code
                          </Button>
                        </Row>
                        <TextField
                          value={registrationPhoneCode}
                          onChange={(e: any) => setRegistrationPhoneCode(e.target.value)}
                          placeholder="phone verification code"
                          name="skywire-registration-phone-code"
                          autoComplete="one-time-code"
                          fullWidth
                        />
                        <Button
                          disabled={
                            !registrationHandle.trim() ||
                            !looksLikeEmail(registrationEmail) ||
                            registrationPassword.length < 8 ||
                            Boolean(registrationPhone.trim()) !== Boolean(registrationPhoneCode.trim()) ||
                            register.isPending
                          }
                          onClick={() => register.mutate()}
                        >
                          Register AT Identity
                        </Button>
                        {phoneVerification.isSuccess ? <span>Phone code sent by the selected PDS.</span> : null}
                        {phoneVerification.isError ? <span>{(phoneVerification.error as Error).message}</span> : null}
                        {register.isError ? <span>{(register.error as Error).message}</span> : null}
                      </>
                    )}
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

function DiscoverPanel({ me }: { me: AtprotoMe }) {
  const [query, setQuery] = useState("wtfgameshow");
  const [submitted, setSubmitted] = useState("wtfgameshow");
  const [selectedActor, setSelectedActor] = useState("");
  const actorSearch = useQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", submitted],
    enabled: Boolean(submitted.trim()),
    queryFn: () => api.get(`/api/skywire/actors/search?q=${encodeURIComponent(submitted.trim())}`),
  });
  const actorFeed = useQuery<FeedResponse>({
    queryKey: ["skywire", "actor-feed", selectedActor],
    enabled: Boolean(selectedActor),
    queryFn: () => api.get(`/api/skywire/actor/${encodeURIComponent(selectedActor)}/feed`),
  });
  const follow = useMutation({
    mutationFn: (did: string) => api.post("/api/skywire/follow", { did }),
  });

  return (
    <Grid>
      <GroupBox label="Actor Discovery">
        <Stack>
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
            {(actorSearch.data?.actors ?? []).map((actor) => (
              <FeedItem key={actor.did}>
                <Row>
                  {actor.avatar ? <img src={actor.avatar} width={40} height={40} alt="" /> : null}
                  <div>
                    <strong>{actor.displayName || actor.handle}</strong>
                    <div>@{actor.handle}</div>
                  </div>
                </Row>
                {actor.description ? <span>{actor.description}</span> : null}
                <Mono>{actor.did}</Mono>
                <Row>
                  <Button size="sm" onClick={() => setSelectedActor(actor.did)}>
                    View Feed
                  </Button>
                  <Button size="sm" disabled={!me.account || follow.isPending} onClick={() => follow.mutate(actor.did)}>
                    Follow
                  </Button>
                </Row>
              </FeedItem>
            ))}
          </FeedList>
        </Stack>
      </GroupBox>
      <GroupBox label="Author Feed">
        <FeedList>
          {!selectedActor ? <p>Select an actor to inspect their AT feed.</p> : null}
          {actorFeed.isLoading ? <Hourglass size={24} /> : null}
          {actorFeed.isError ? <span>{(actorFeed.error as Error).message}</span> : null}
          {(actorFeed.data?.feed ?? []).map((item, index) => (
            <FeedItem key={postUri(item) || index}>
              <strong>@{postAuthor(item)}</strong>
              <span>{postText(item) || "(no text)"}</span>
              <Mono>{postUri(item)}</Mono>
              <FeedActions item={item} enabled={Boolean(me.account)} />
            </FeedItem>
          ))}
        </FeedList>
      </GroupBox>
    </Grid>
  );
}

function SignalsPanel({ me }: { me: AtprotoMe }) {
  const [text, setText] = useState("");
  const [signalType, setSignalType] = useState("status");
  const [tags, setTags] = useState("");
  const [relatedUri, setRelatedUri] = useState("");
  const qc = useQueryClient();
  const signals = useQuery<SignalsResponse>({
    queryKey: ["skywire", "signals"],
    enabled: Boolean(me.account),
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
  const [tab, setTab] = useState<SkywireTab>("account");
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
      setTab("account");
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
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "skywire:atproto-linked") return;
      let handle = "";
      try {
        handle = JSON.parse(event.newValue || "{}")?.handle || "";
      } catch {
        handle = "";
      }
      setTab("account");
      setNotice(handle ? `Bluesky identity connected: @${handle}` : "Bluesky identity connected.");
      qc.invalidateQueries({ queryKey: ["skywire", "me"] });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [qc]);

  const me = meQuery.data;

  return (
    <AppWindow title="Skywire">
      <Shell>
        {notice ? <p>{notice}</p> : null}
        <Tabs value={tab} onChange={(value: any) => setTab(value)}>
          <Tab value="account">Account</Tab>
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
              {tab === "discover" ? <DiscoverPanel me={me} /> : null}
              {tab === "wtf" ? <FeedPanel feedType="wtf" canAct={Boolean(me.account)} /> : null}
              {tab === "tezos" ? <FeedPanel feedType="tezos" canAct={Boolean(me.account)} /> : null}
              {tab === "mentions" ? (me.account ? <NotificationsPanel /> : <p>Connect an AT account to load notifications.</p>) : null}
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
