import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, TextField } from "react95";
import { Copy, ExternalLink, LogIn, Power, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { skywirePermissionTierLabel, type SkywirePermissionTier } from "@shared/atproto-permissions";
import {
  ActionGrid,
  ButtonLabel,
  ContentPane,
  ContextBar,
  DialogCard,
  DialogOverlay,
  FeedItem,
  FeedList,
  Grid,
  MainLayout,
  NativeSelect,
  NavButton,
  QuoteCard,
  MutedText,
  RoomBadge,
  RoomCard,
  RoomDirectory,
  Sidebar,
  ShareLink,
  Stack,
  TextArea,
  WideGrid,
} from "./wtf-live-styles";
import {
  accountHasCapability,
  canUseAtprotoSession,
  type WtfLiveAtprotoAccount,
} from "./wtf-live-capabilities";
import {
  buildWtfLiveSearch,
  parseWtfLiveSearchParams,
  WTF_LIVE_NAV_ITEMS,
  WTF_LIVE_PENDING_QUOTE_KEY,
  wtfLiveContextTitle,
  type WtfLiveTab,
} from "./wtf-live-nav";

const SKYWIRE_SETTINGS_PATH = "/skywire?tab=account";

type AtprotoMe = {
  enabled: boolean;
  account: WtfLiveAtprotoAccount & {
    did?: string;
    handle?: string;
    displayName?: string | null;
    oauthPermissionTier?: string;
  };
  rollout?: {
    wtfLiveEligible?: boolean;
    wtfLiveEnabled?: boolean;
    atprotoEnabled?: boolean;
  };
};

type WtfLiveRoom = {
  id: string;
  title: string;
  kind: string;
  description?: string;
  source?: "system" | "user";
  ownerUserId?: number | null;
  isPublic?: boolean;
};
type WtfLiveStage = WtfLiveRoom & { liveUrl?: string | null };

type WtfLiveStatus = {
  rolloutMode?: string;
  eligible?: boolean;
  wtfLiveEligible?: boolean;
  wtfLiveEnabled?: boolean;
  atprotoEnabled?: boolean;
  skywireSettingsPath?: string;
  publishesThrough?: string;
  collection?: {
    rooms?: string;
    stages?: string;
  };
};

type WtfLivePendingQuote = {
  uri: string;
  cid?: string | null;
  sourceUrl?: string | null;
  text?: string | null;
  author?: { handle?: string; did?: string; displayName?: string | null } | null;
  createdAt?: string | null;
};

type RoomMessage = {
  uri: string;
  text: string;
  createdAt: string | null;
  author?: { handle?: string; displayName?: string | null };
  quotedPost?: WtfLivePendingQuote | null;
};

type StageBroadcast = RoomMessage & {
  mode?: string;
  liveUrl?: string | null;
  broadcaster?: { handle?: string; displayName?: string | null };
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function quotePayload(quote: WtfLivePendingQuote | null) {
  if (!quote?.uri) return undefined;
  return {
    uri: quote.uri,
    cid: quote.cid || undefined,
    sourceUrl: quote.sourceUrl || undefined,
    text: quote.text || undefined,
    authorHandle: quote.author?.handle || undefined,
    authorDid: quote.author?.did || undefined,
    createdAt: quote.createdAt || undefined,
  };
}

function syncLiveUrl(tab: WtfLiveTab, room: string | null, stage: string | null) {
  const search = buildWtfLiveSearch({ tab, room, stage });
  window.history.replaceState({}, "", `/live${search}`);
}

function publicRoomPath(roomId: string): string {
  return `/live/r/${encodeURIComponent(roomId)}`;
}

function publicRoomUrl(roomId: string): string {
  if (typeof window === "undefined") return publicRoomPath(roomId);
  return `${window.location.origin}${publicRoomPath(roomId)}`;
}

function CreateDialog({
  title,
  fields,
  onClose,
  onSubmit,
  busy,
}: {
  title: string;
  fields: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <DialogOverlay role="presentation" onClick={onClose}>
      <DialogCard role="dialog" onClick={(event) => event.stopPropagation()}>
        <strong>{title}</strong>
        {fields}
        <Stack style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={busy} onClick={onSubmit}>
            {busy ? "Saving…" : "Create"}
          </Button>
        </Stack>
      </DialogCard>
    </DialogOverlay>
  );
}

export function WtfLiveApp() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const initial = useMemo(() => parseWtfLiveSearchParams(window.location.search), []);
  const [tab, setTab] = useState<WtfLiveTab>(initial.tab);
  const [roomId, setRoomId] = useState(initial.room || "wtf-live");
  const [stageId, setStageId] = useState(initial.stage || "wtf-stage");
  const [pendingQuote, setPendingQuote] = useState<WtfLivePendingQuote | null>(null);
  const [stageDialog, setStageDialog] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createLiveUrl, setCreateLiveUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const meQuery = useQuery<AtprotoMe>({ queryKey: ["wtf-live", "me"], queryFn: () => api.get("/api/atproto/me") });
  const statusQuery = useQuery<WtfLiveStatus>({
    queryKey: ["wtf-live", "status"],
    queryFn: () => api.get("/api/wtf-live/status"),
  });
  const roomsQuery = useQuery<{ rooms: WtfLiveRoom[]; collection: string }>({
    queryKey: ["wtf-live", "rooms"],
    queryFn: () => api.get("/api/wtf-live/rooms"),
  });
  const ownedRoomsQuery = useQuery<{ rooms: WtfLiveRoom[]; collection: string }>({
    queryKey: ["wtf-live", "rooms", "mine"],
    queryFn: () => api.get("/api/wtf-live/rooms/mine"),
  });
  const stagesQuery = useQuery<{ stages: WtfLiveStage[]; collection: string; mode?: string }>({
    queryKey: ["wtf-live", "stages"],
    queryFn: () => api.get("/api/wtf-live/stages"),
  });
  const messagesQuery = useQuery<{ messages: RoomMessage[] }>({
    queryKey: ["wtf-live", "rooms", roomId, "messages"],
    enabled: tab === "rooms",
    queryFn: () => api.get(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/messages`),
  });
  const broadcastsQuery = useQuery<{ broadcasts: StageBroadcast[] }>({
    queryKey: ["wtf-live", "stages", stageId, "broadcasts"],
    enabled: tab === "stages",
    queryFn: () => api.get(`/api/wtf-live/stages/${encodeURIComponent(stageId)}/broadcasts`),
  });

  const [roomText, setRoomText] = useState("");
  const [stageText, setStageText] = useState("");
  const [stageMode, setStageMode] = useState<"text" | "voice" | "video" | "link">("text");
  const [stageLiveUrl, setStageLiveUrl] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WTF_LIVE_PENDING_QUOTE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WtfLivePendingQuote;
      if (parsed?.uri) setPendingQuote(parsed);
      sessionStorage.removeItem(WTF_LIVE_PENDING_QUOTE_KEY);
    } catch {
      sessionStorage.removeItem(WTF_LIVE_PENDING_QUOTE_KEY);
    }
  }, []);

  useEffect(() => {
    syncLiveUrl(tab, tab === "rooms" ? roomId : null, tab === "stages" ? stageId : null);
  }, [tab, roomId, stageId]);

  const me = meQuery.data;
  const account = me?.account ?? null;
  const sessionOk = canUseAtprotoSession(account);
  const canRooms = Boolean(account && accountHasCapability(account, "rooms"));
  const canStages = Boolean(account && accountHasCapability(account, "stages"));

  const publicRoomOptions = (roomsQuery.data?.rooms ?? []).filter((r) => r.kind === "room" && r.isPublic !== false);
  const ownedRoomOptions = ownedRoomsQuery.data?.rooms ?? [];
  const roomOptions = useMemo(() => {
    const byId = new Map<string, WtfLiveRoom>();
    publicRoomOptions.forEach((room) => byId.set(room.id, room));
    ownedRoomOptions.forEach((room) => byId.set(room.id, room));
    return Array.from(byId.values());
  }, [ownedRoomOptions, publicRoomOptions]);
  const stageOptions = stagesQuery.data?.stages ?? [];
  const selectedRoom = roomOptions.find((r) => r.id === roomId) ?? null;
  const selectedStage = stageOptions.find((s) => s.id === stageId) ?? null;

  useEffect(() => {
    if (roomOptions.length && !roomOptions.some((r) => r.id === roomId)) setRoomId(roomOptions[0].id);
  }, [roomId, roomOptions]);
  useEffect(() => {
    if (stageOptions.length && !stageOptions.some((s) => s.id === stageId)) setStageId(stageOptions[0].id);
  }, [stageId, stageOptions]);

  const createRoom = useMutation({
    mutationFn: () =>
      api.post<{ room?: WtfLiveRoom }>("/api/wtf-live/rooms", { title: createTitle.trim(), description: createDescription.trim() }),
    onSuccess: (data: { room?: WtfLiveRoom }) => {
      setCreateTitle("");
      setCreateDescription("");
      if (data?.room?.id) {
        setRoomId(data.room.id);
        setTab("rooms");
        setCopyStatus(`Public URL ready: ${publicRoomUrl(data.room.id)}`);
      }
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "mine"] });
    },
  });
  const createStage = useMutation({
    mutationFn: () =>
      api.post<{ stage?: WtfLiveStage }>("/api/wtf-live/stages", {
        title: createTitle.trim(),
        description: createDescription.trim(),
        liveUrl: createLiveUrl.trim() || null,
      }),
    onSuccess: (data: { stage?: WtfLiveStage }) => {
      setStageDialog(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateLiveUrl("");
      if (data?.stage?.id) {
        setStageId(data.stage.id);
        setTab("stages");
      }
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages"] });
    },
  });
  const updateRoomVisibility = useMutation({
    mutationFn: ({ room, isPublic }: { room: WtfLiveRoom; isPublic: boolean }) =>
      api.patch<{ room?: WtfLiveRoom }>(`/api/wtf-live/rooms/${encodeURIComponent(room.id)}`, { isPublic }),
    onSuccess: (data: { room?: WtfLiveRoom }, variables) => {
      const room = data?.room ?? variables.room;
      setCopyStatus(`${room.title} is ${variables.isPublic ? "open" : "closed"} to guests.`);
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "mine"] });
    },
  });
  const deleteRoom = useMutation({
    mutationFn: (room: WtfLiveRoom) => api.delete<{ ok: true; roomId: string }>(`/api/wtf-live/rooms/${encodeURIComponent(room.id)}`),
    onSuccess: (_data: { ok: true; roomId: string }, room: WtfLiveRoom) => {
      if (roomId === room.id) setRoomId("wtf-live");
      setCopyStatus(`${room.title} deleted.`);
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "mine"] });
    },
  });
  const sendRoom = useMutation({
    mutationFn: () =>
      api.post(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/messages`, {
        text: roomText.trim(),
        quotedPost: quotePayload(pendingQuote),
      }),
    onSuccess: () => {
      setRoomText("");
      setPendingQuote(null);
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", roomId, "messages"] });
    },
  });
  const sendStage = useMutation({
    mutationFn: () =>
      api.post(`/api/wtf-live/stages/${encodeURIComponent(stageId)}/broadcasts`, {
        text: stageText.trim(),
        mode: stageMode,
        liveUrl: stageLiveUrl.trim() || undefined,
        quotedPost: quotePayload(pendingQuote),
      }),
    onSuccess: () => {
      setStageText("");
      setStageLiveUrl("");
      setPendingQuote(null);
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages", stageId, "broadcasts"] });
    },
  });

  const contextTitle = wtfLiveContextTitle(tab, selectedRoom?.title, selectedStage?.title);

  async function copyPublicRoom(room: WtfLiveRoom) {
    await navigator.clipboard?.writeText(publicRoomUrl(room.id));
    setCopyStatus(`Copied ${room.title} room URL.`);
  }

  function openPublicRoom(room: WtfLiveRoom) {
    window.open(publicRoomPath(room.id), "_blank", "noopener,noreferrer");
  }

  function joinPublicRoom(room: WtfLiveRoom) {
    window.open(publicRoomPath(room.id), "_blank", "noopener,noreferrer");
    setCopyStatus(`Opened ${room.title} in a new browser tab.`);
  }

  function openHostRoom(room: WtfLiveRoom) {
    setRoomId(room.id);
    setTab("rooms");
  }

  function toggleRoomOpen(room: WtfLiveRoom) {
    updateRoomVisibility.mutate({ room, isPublic: room.isPublic === false });
  }

  function confirmDeleteRoom(room: WtfLiveRoom) {
    if (!window.confirm(`Delete ${room.title}? The guest URL will stop working.`)) return;
    deleteRoom.mutate(room);
  }

  function canManageRoom(room: WtfLiveRoom) {
    return room.source === "user" && ownedRoomOptions.some((ownedRoom) => ownedRoom.id === room.id);
  }

  function renderRoomCard(room: WtfLiveRoom, owned: boolean) {
    const closed = room.isPublic === false;
    const manageable = canManageRoom(room);
    return (
      <RoomCard
        key={`${owned ? "owned" : "public"}-${room.id}`}
        data-wtf-live-room-card={room.id}
        data-wtf-live-room-surface={owned ? "owned" : "public"}
        data-wtf-live-owned-room={manageable ? "true" : undefined}
      >
        <RoomBadge $closed={closed}>
          {closed ? "Closed" : manageable || owned ? "Owned" : room.source === "system" ? "Official" : "Open"}
        </RoomBadge>
        <strong>{room.title}</strong>
        {room.description ? <MutedText>{room.description}</MutedText> : null}
        {closed ? <MutedText>Closed to guests until the owner reopens it.</MutedText> : null}
        <ShareLink>{publicRoomUrl(room.id)}</ShareLink>
        {manageable ? <MutedText data-wtf-live-owner-controls="true">Owner controls</MutedText> : null}
        <ActionGrid data-wtf-live-room-actions={room.id}>
          <Button primary size="sm" disabled={closed} onClick={() => joinPublicRoom(room)} data-wtf-live-room-join={room.id}>
            <ButtonLabel><LogIn size={14} aria-hidden /> Join in New Tab</ButtonLabel>
          </Button>
          <Button size="sm" onClick={() => copyPublicRoom(room)}>
            <ButtonLabel><Copy size={14} aria-hidden /> Copy URL</ButtonLabel>
          </Button>
          <Button size="sm" disabled={closed} onClick={() => openPublicRoom(room)}>
            <ButtonLabel><ExternalLink size={14} aria-hidden /> Guest View</ButtonLabel>
          </Button>
          <Button size="sm" onClick={() => openHostRoom(room)}>
            Host View
          </Button>
          {manageable ? (
            <Button
              size="sm"
              data-wtf-live-room-close={room.id}
              disabled={updateRoomVisibility.isPending}
              onClick={() => toggleRoomOpen(room)}
            >
              <ButtonLabel><Power size={14} aria-hidden /> {closed ? "Reopen" : "Close"}</ButtonLabel>
            </Button>
          ) : null}
          {manageable ? (
            <Button
              size="sm"
              data-wtf-live-room-delete={room.id}
              disabled={deleteRoom.isPending}
              onClick={() => confirmDeleteRoom(room)}
            >
              <ButtonLabel><Trash2 size={14} aria-hidden /> Delete</ButtonLabel>
            </Button>
          ) : null}
        </ActionGrid>
      </RoomCard>
    );
  }

  const selectedRoomManageable = selectedRoom ? canManageRoom(selectedRoom) : false;

  return (
    <MainLayout>
      <Sidebar aria-label="WTF LIVE navigation">
        {WTF_LIVE_NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            type="button"
            $active={tab === item.id}
            title={item.hint}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden>{item.icon}</span>
            <div>
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </div>
          </NavButton>
        ))}
      </Sidebar>

      <ContentPane>
        <ContextBar>
          <strong>{contextTitle}</strong>
          {account?.handle ? <span>@{account.handle}</span> : <span>Skywire not linked</span>}
        </ContextBar>

        {tab === "overview" ? (
          <WideGrid>
            <GroupBox label="Create a public room">
              <Stack>
                <TextField
                  value={createTitle}
                  placeholder="Room title"
                  fullWidth
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreateTitle(e.target.value)}
                />
                <TextArea
                  value={createDescription}
                  placeholder="Short room description"
                  onChange={(e) => setCreateDescription(e.target.value)}
                />
                <Button
                  primary
                  disabled={!createTitle.trim() || createRoom.isPending}
                  onClick={() => createRoom.mutate()}
                >
                  {createRoom.isPending ? "Creating..." : "Create Room"}
                </Button>
                {createRoom.isError ? <span>{(createRoom.error as Error).message}</span> : null}
                {copyStatus ? <MutedText aria-live="polite">{copyStatus}</MutedText> : null}
              </Stack>
            </GroupBox>

            <GroupBox label="Owned rooms">
              <RoomDirectory>
                {ownedRoomsQuery.isLoading ? <Hourglass size={24} /> : null}
                {ownedRoomOptions.length ? (
                  ownedRoomOptions.map((room) => renderRoomCard(room, true))
                ) : (
                  <MutedText>No owned rooms yet.</MutedText>
                )}
              </RoomDirectory>
            </GroupBox>

            <GroupBox label="Open public rooms">
              <RoomDirectory>
                {roomsQuery.isLoading ? <Hourglass size={24} /> : null}
                {publicRoomOptions.length ? (
                  publicRoomOptions.map((room) => renderRoomCard(room, false))
                ) : (
                  <MutedText>No public rooms are open.</MutedText>
                )}
              </RoomDirectory>
            </GroupBox>

            <GroupBox label="Identity">
              <Stack>
                {meQuery.isLoading || statusQuery.isLoading ? <Hourglass size={24} /> : null}
                <FeedItem>
                  <strong>Host</strong>
                  <span>{user?.username || "signed in"}</span>
                </FeedItem>
                <FeedItem>
                  <strong>Skywire account</strong>
                  <span>
                    {account
                      ? `${account.displayName || account.handle || account.did} · tier ${skywirePermissionTierLabel((account.oauthPermissionTier as SkywirePermissionTier) || "be-safe")}`
                      : "Not connected"}
                  </span>
                </FeedItem>
                <FeedItem>
                  <strong>Room publishing</strong>
                  <span>{canRooms ? "Enabled" : "Needs Be Heard or Be Bold"}</span>
                </FeedItem>
                <Button onClick={() => setTab("skywire")}>Skywire Link</Button>
              </Stack>
            </GroupBox>
          </WideGrid>
        ) : null}

        {tab === "skywire" ? (
          <GroupBox label="Skywire permissions">
            <Stack>
              <p>
                Room messages need <strong>Be Heard</strong> or <strong>Be Bold</strong> (`rooms` capability). Stage
                broadcasts need the `stages` capability. WTF LIVE reads your granted scopes from Skywire — it does not
                re-run OAuth here.
              </p>
              <FeedItem>
                <strong>Rooms</strong>
                <span>{canRooms ? "Granted" : "Upgrade Skywire permissions"}</span>
              </FeedItem>
              <FeedItem>
                <strong>Stages</strong>
                <span>{canStages ? "Granted" : "Upgrade Skywire permissions"}</span>
              </FeedItem>
              <Button onClick={() => { window.location.href = SKYWIRE_SETTINGS_PATH; }}>
                Open Skywire Settings
              </Button>
            </Stack>
          </GroupBox>
        ) : null}

        {tab === "rooms" ? (
          <Grid>
            <GroupBox label="Rooms">
              <Stack>
                {roomsQuery.isLoading ? <Hourglass size={24} /> : null}
                <NativeSelect value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  {roomOptions.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.title}{room.isPublic === false ? " (closed)" : ""}
                    </option>
                  ))}
                </NativeSelect>
                {selectedRoom ? (
                  <RoomCard
                    data-wtf-live-room-card={selectedRoom.id}
                    data-wtf-live-room-surface="selected"
                    data-wtf-live-owned-room={selectedRoomManageable ? "true" : undefined}
                  >
                    <RoomBadge $closed={selectedRoom.isPublic === false}>
                      {selectedRoom.isPublic === false ? "Closed" : selectedRoomManageable ? "Owned" : selectedRoom.source === "system" ? "Official" : "Open"}
                    </RoomBadge>
                    <strong>{selectedRoom.title}</strong>
                    {selectedRoom.description ? <MutedText>{selectedRoom.description}</MutedText> : null}
                    {selectedRoom.isPublic === false ? <MutedText>Closed to guests until you reopen it.</MutedText> : null}
                    <ShareLink>{publicRoomUrl(selectedRoom.id)}</ShareLink>
                    {selectedRoomManageable ? <MutedText data-wtf-live-owner-controls="true">Owner controls</MutedText> : null}
                    <ActionGrid data-wtf-live-room-actions={selectedRoom.id}>
                      <Button primary size="sm" disabled={selectedRoom.isPublic === false} onClick={() => joinPublicRoom(selectedRoom)} data-wtf-live-room-join={selectedRoom.id}>
                        <ButtonLabel><LogIn size={14} aria-hidden /> Join in New Tab</ButtonLabel>
                      </Button>
                      <Button size="sm" onClick={() => copyPublicRoom(selectedRoom)}>
                        <ButtonLabel><Copy size={14} aria-hidden /> Copy URL</ButtonLabel>
                      </Button>
                      <Button size="sm" disabled={selectedRoom.isPublic === false} onClick={() => openPublicRoom(selectedRoom)}>
                        <ButtonLabel><ExternalLink size={14} aria-hidden /> Guest View</ButtonLabel>
                      </Button>
                      {selectedRoomManageable ? (
                        <Button
                          size="sm"
                          data-wtf-live-room-close={selectedRoom.id}
                          disabled={updateRoomVisibility.isPending}
                          onClick={() => toggleRoomOpen(selectedRoom)}
                        >
                          <ButtonLabel><Power size={14} aria-hidden /> {selectedRoom.isPublic === false ? "Reopen" : "Close"}</ButtonLabel>
                        </Button>
                      ) : null}
                      {selectedRoomManageable ? (
                        <Button
                          size="sm"
                          data-wtf-live-room-delete={selectedRoom.id}
                          disabled={deleteRoom.isPending}
                          onClick={() => confirmDeleteRoom(selectedRoom)}
                        >
                          <ButtonLabel><Trash2 size={14} aria-hidden /> Delete</ButtonLabel>
                        </Button>
                      ) : null}
                    </ActionGrid>
                  </RoomCard>
                ) : null}
                <FeedList>
                  {[...(messagesQuery.data?.messages ?? [])].reverse().map((msg) => (
                    <FeedItem key={msg.uri}>
                      <strong>{msg.author?.displayName || msg.author?.handle || "unknown"}</strong>
                      {formatDate(msg.createdAt) ? <span>{formatDate(msg.createdAt)}</span> : null}
                      <div>{msg.text}</div>
                      {msg.quotedPost?.uri ? <QuoteCard>Quote · {msg.quotedPost.text || msg.quotedPost.uri}</QuoteCard> : null}
                    </FeedItem>
                  ))}
                </FeedList>
              </Stack>
            </GroupBox>
            <GroupBox label="Send message">
              <Stack>
                {pendingQuote ? (
                  <QuoteCard>
                    Quote loaded
                    <div>{pendingQuote.text || pendingQuote.uri}</div>
                    <Button size="sm" onClick={() => setPendingQuote(null)}>
                      Remove quote
                    </Button>
                  </QuoteCard>
                ) : null}
                <TextArea value={roomText} maxLength={600} placeholder="Public room message" onChange={(e) => setRoomText(e.target.value)} />
                <Button disabled={!sessionOk || !canRooms || !roomText.trim() || sendRoom.isPending} onClick={() => sendRoom.mutate()}>
                  Send Room Message
                </Button>
                {!account ? <span>Connect Bluesky in Skywire first.</span> : null}
                {account && !sessionOk ? <span>Reconnect Bluesky from Skywire Settings.</span> : null}
                {account && sessionOk && !canRooms ? <span>Need Be Heard or Be Bold for rooms.</span> : null}
                {sendRoom.isError ? <span>{(sendRoom.error as Error).message}</span> : null}
              </Stack>
            </GroupBox>
          </Grid>
        ) : null}

        {tab === "stages" ? (
          <Grid>
            <GroupBox label="Stages">
              <Stack>
                <Button onClick={() => setStageDialog(true)}>Create Stage</Button>
                {stagesQuery.isLoading ? <Hourglass size={24} /> : null}
                <NativeSelect value={stageId} onChange={(e) => setStageId(e.target.value)}>
                  {stageOptions.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.title}
                    </option>
                  ))}
                </NativeSelect>
                <FeedList>
                  {[...(broadcastsQuery.data?.broadcasts ?? [])].reverse().map((b) => (
                    <FeedItem key={b.uri}>
                      <strong>{b.broadcaster?.displayName || b.broadcaster?.handle || "unknown"}</strong>
                      <span>{b.mode}</span>
                      {formatDate(b.createdAt) ? <span>{formatDate(b.createdAt)}</span> : null}
                      <div>{b.text}</div>
                      {b.liveUrl ? (
                        <Button size="sm" onClick={() => window.open(b.liveUrl || "", "_blank", "noopener,noreferrer")}>
                          Open live URL
                        </Button>
                      ) : null}
                    </FeedItem>
                  ))}
                </FeedList>
              </Stack>
            </GroupBox>
            <GroupBox label="Broadcast">
              <Stack>
                {pendingQuote ? (
                  <QuoteCard>
                    Quote loaded
                    <div>{pendingQuote.text || pendingQuote.uri}</div>
                    <Button size="sm" onClick={() => setPendingQuote(null)}>
                      Remove quote
                    </Button>
                  </QuoteCard>
                ) : null}
                <NativeSelect value={stageMode} onChange={(e) => setStageMode(e.target.value as typeof stageMode)}>
                  <option value="text">Text</option>
                  <option value="voice">Voice</option>
                  <option value="video">Video</option>
                  <option value="link">Link</option>
                </NativeSelect>
                <TextArea value={stageText} maxLength={600} placeholder="Stage broadcast" onChange={(e) => setStageText(e.target.value)} />
                <TextField value={stageLiveUrl} placeholder="Optional live/replay URL" fullWidth onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStageLiveUrl(e.target.value)} />
                <Button disabled={!sessionOk || !canStages || !stageText.trim() || sendStage.isPending} onClick={() => sendStage.mutate()}>
                  Send Broadcast
                </Button>
                {!account ? <span>Connect Bluesky in Skywire first.</span> : null}
                {account && !sessionOk ? <span>Reconnect Bluesky from Skywire Settings.</span> : null}
                {account && sessionOk && !canStages ? <span>Need Be Heard or Be Bold for stages.</span> : null}
                {sendStage.isError ? <span>{(sendStage.error as Error).message}</span> : null}
              </Stack>
            </GroupBox>
          </Grid>
        ) : null}
      </ContentPane>

      {stageDialog ? (
        <CreateDialog
          title="Create Stage"
          busy={createStage.isPending}
          onClose={() => setStageDialog(false)}
          onSubmit={() => createStage.mutate()}
          fields={
            <Stack>
              <TextField value={createTitle} placeholder="Stage title" fullWidth onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreateTitle(e.target.value)} />
              <TextArea value={createDescription} placeholder="Description (optional)" onChange={(e) => setCreateDescription(e.target.value)} />
              <TextField value={createLiveUrl} placeholder="Optional live URL" fullWidth onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreateLiveUrl(e.target.value)} />
              {createStage.isError ? <span>{(createStage.error as Error).message}</span> : null}
            </Stack>
          }
        />
      ) : null}
    </MainLayout>
  );
}
