import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, TextField } from "react95";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Keyboard, Lock, LogIn, Music2, Play, Power, Radio, Trash2, Upload, Users } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { presentationRouteHref, usePresentationShell } from "../../lib/presentation-shell";
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
  InlineActions,
  MainLayout,
  NativeSelect,
  NavButton,
  QuoteCard,
  MutedText,
  RoomActivitySummary,
  RoomBadge,
  RoomCard,
  RoomDirectory,
  RoomMetaRow,
  RoomPresenceBadge,
  SettingsField,
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
import {
  findWtfLiveSoundboardShortcutConflict,
  normalizeWtfLiveSoundboardShortcut,
  normalizeWtfLiveSoundboardSettings,
  playWtfLiveSoundboardClip,
  readWtfLiveSoundboardFile,
  readWtfLiveSoundboardSettings,
  shortcutFromWtfLiveKeyboardEvent,
  WTF_LIVE_SOUNDBOARD_ACCEPT,
  WTF_LIVE_SOUNDBOARD_DEFAULT_COOLDOWN_MS,
  WTF_LIVE_SOUNDBOARD_DEFAULT_VOLUME,
  WTF_LIVE_SOUNDBOARD_MAX_CLIPS,
  writeWtfLiveSoundboardSettings,
  type WtfLiveSoundboardClip,
  type WtfLiveSoundboardSettings,
} from "./soundboard";

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
  accessMode?: "public" | "private";
  isPublic?: boolean;
  presence?: WtfLiveRoomPresence;
};

type SoundboardSettingsResponse = WtfLiveSoundboardSettings & {
  storage?: string;
};
type WtfLiveStage = WtfLiveRoom & { liveUrl?: string | null };
type WtfLiveRoomsResponse = { rooms?: WtfLiveRoom[]; [key: string]: unknown };
type WtfLiveStagesResponse = { stages?: WtfLiveStage[]; [key: string]: unknown };

type WtfLiveRoomAccessMember = {
  userId: number;
  username: string;
  displayName?: string | null;
};

type WtfLiveRoomPresence = {
  active?: boolean;
  participantCount?: number;
  audioOpenCount?: number;
  videoShareCount?: number;
  cameraShareCount?: number;
  screenShareCount?: number;
};

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

function parseAccessUsernames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((username) => username.replace(/^@/, "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

function normalizeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function roomPresence(room: WtfLiveRoom): Required<WtfLiveRoomPresence> {
  const participantCount = normalizeCount(room.presence?.participantCount);
  return {
    active: Boolean(room.presence?.active || participantCount > 0),
    participantCount,
    audioOpenCount: normalizeCount(room.presence?.audioOpenCount),
    videoShareCount: normalizeCount(room.presence?.videoShareCount),
    cameraShareCount: normalizeCount(room.presence?.cameraShareCount),
    screenShareCount: normalizeCount(room.presence?.screenShareCount),
  };
}

function userCountLabel(count: number): string {
  return count === 1 ? "1 user" : `${count} users`;
}

function shareCountLabel(presence: Required<WtfLiveRoomPresence>): string {
  if (presence.screenShareCount && presence.cameraShareCount) {
    return `${presence.screenShareCount} screen / ${presence.cameraShareCount} cam`;
  }
  if (presence.screenShareCount) return `${presence.screenShareCount} screen`;
  if (presence.cameraShareCount) return `${presence.cameraShareCount} cam`;
  if (presence.audioOpenCount) return `${presence.audioOpenCount} mic`;
  return "No shares";
}

function mergeRoomResponse(current: WtfLiveRoomsResponse | undefined, room: WtfLiveRoom): WtfLiveRoomsResponse {
  const rooms = current?.rooms ?? [];
  return {
    ...(current ?? {}),
    rooms: [...rooms.filter((candidate) => candidate.id !== room.id), room],
  };
}

function removeRoomResponse(current: WtfLiveRoomsResponse | undefined, roomId: string): WtfLiveRoomsResponse {
  return {
    ...(current ?? {}),
    rooms: (current?.rooms ?? []).filter((candidate) => candidate.id !== roomId),
  };
}

function mergeStageResponse(current: WtfLiveStagesResponse | undefined, stage: WtfLiveStage): WtfLiveStagesResponse {
  const stages = current?.stages ?? [];
  return {
    ...(current ?? {}),
    stages: [...stages.filter((candidate) => candidate.id !== stage.id), stage],
  };
}

function removeStageResponse(current: WtfLiveStagesResponse | undefined, stageId: string): WtfLiveStagesResponse {
  return {
    ...(current ?? {}),
    stages: (current?.stages ?? []).filter((candidate) => candidate.id !== stageId),
  };
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
  const presentation = usePresentationShell();
  return (
    <DialogOverlay
      role="presentation"
      data-wtf-live-dialog="true"
      data-wtf-live-presentation-host={presentation.host}
      onClick={onClose}
    >
      <DialogCard
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
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
  const [createRoomAccessMode, setCreateRoomAccessMode] = useState<"public" | "private">("public");
  const [createAccessList, setCreateAccessList] = useState("");
  const [selectedAccessList, setSelectedAccessList] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const meQuery = useQuery<AtprotoMe>({ queryKey: ["wtf-live", "me"], queryFn: () => api.get("/api/atproto/me") });
  const statusQuery = useQuery<WtfLiveStatus>({
    queryKey: ["wtf-live", "status"],
    queryFn: () => api.get("/api/wtf-live/status"),
  });
  const roomsQuery = useQuery<{ rooms: WtfLiveRoom[]; collection: string }>({
    queryKey: ["wtf-live", "rooms"],
    queryFn: () => api.get("/api/wtf-live/rooms"),
    refetchInterval: 5_000,
  });
  const ownedRoomsQuery = useQuery<{ rooms: WtfLiveRoom[]; collection: string }>({
    queryKey: ["wtf-live", "rooms", "mine"],
    queryFn: () => api.get("/api/wtf-live/rooms/mine"),
    refetchInterval: 5_000,
  });
  const privateRoomsQuery = useQuery<{ rooms: WtfLiveRoom[]; collection: string }>({
    queryKey: ["wtf-live", "rooms", "private"],
    queryFn: () => api.get("/api/wtf-live/rooms/private"),
    refetchInterval: 5_000,
  });
  const stagesQuery = useQuery<{ stages: WtfLiveStage[]; collection: string; mode?: string }>({
    queryKey: ["wtf-live", "stages"],
    queryFn: () => api.get("/api/wtf-live/stages"),
  });
  const ownedStagesQuery = useQuery<{ stages: WtfLiveStage[]; collection: string }>({
    queryKey: ["wtf-live", "stages", "mine"],
    queryFn: () => api.get("/api/wtf-live/stages/mine"),
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
  const soundboardQuery = useQuery<SoundboardSettingsResponse>({
    queryKey: ["wtf-live", "soundboard", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => api.get<SoundboardSettingsResponse>("/api/wtf-live/soundboard"),
    retry: false,
    staleTime: 15_000,
  });

  const [roomText, setRoomText] = useState("");
  const [stageText, setStageText] = useState("");
  const [stageMode, setStageMode] = useState<"text" | "voice" | "video" | "link">("text");
  const [stageLiveUrl, setStageLiveUrl] = useState("");
  const [soundboardSettings, setSoundboardSettings] = useState<WtfLiveSoundboardSettings>(() =>
    readWtfLiveSoundboardSettings(user?.id),
  );
  const [soundboardLabel, setSoundboardLabel] = useState("");
  const [soundboardCategory, setSoundboardCategory] = useState("General");
  const [soundboardShortcut, setSoundboardShortcut] = useState("");
  const [soundboardVolume, setSoundboardVolume] = useState(WTF_LIVE_SOUNDBOARD_DEFAULT_VOLUME);
  const [soundboardCooldownMs, setSoundboardCooldownMs] = useState(WTF_LIVE_SOUNDBOARD_DEFAULT_COOLDOWN_MS);
  const [soundboardCapturing, setSoundboardCapturing] = useState(false);
  const [soundboardStatus, setSoundboardStatus] = useState("");

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

  useEffect(() => {
    setSoundboardSettings(readWtfLiveSoundboardSettings(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !soundboardQuery.data) return;
    const normalized = normalizeWtfLiveSoundboardSettings(soundboardQuery.data);
    setSoundboardSettings(normalized);
    writeWtfLiveSoundboardSettings(user.id, normalized);
  }, [soundboardQuery.data, user?.id]);

  useEffect(() => {
    if (!soundboardCapturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSoundboardCapturing(false);
        setSoundboardStatus("Shortcut capture cancelled.");
        return;
      }
      const shortcut = shortcutFromWtfLiveKeyboardEvent(event);
      if (!shortcut) {
        setSoundboardStatus("Use Ctrl, Alt, or Meta with a key.");
        return;
      }
      event.preventDefault();
      setSoundboardShortcut(shortcut);
      setSoundboardCapturing(false);
      setSoundboardStatus(`Shortcut ${shortcut} captured.`);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [soundboardCapturing]);

  const me = meQuery.data;
  const account = me?.account ?? null;
  const sessionOk = canUseAtprotoSession(account);
  const canRooms = Boolean(account && accountHasCapability(account, "rooms"));
  const canStages = Boolean(account && accountHasCapability(account, "stages"));

  const publicRoomOptions = (roomsQuery.data?.rooms ?? []).filter((r) => r.kind === "room" && r.accessMode !== "private" && r.isPublic !== false);
  const ownedRoomOptions = ownedRoomsQuery.data?.rooms ?? [];
  const privateRoomOptions = privateRoomsQuery.data?.rooms ?? [];
  const roomOptions = useMemo(() => {
    const byId = new Map<string, WtfLiveRoom>();
    publicRoomOptions.forEach((room) => byId.set(room.id, room));
    ownedRoomOptions.forEach((room) => byId.set(room.id, room));
    privateRoomOptions.forEach((room) => byId.set(room.id, room));
    return Array.from(byId.values());
  }, [ownedRoomOptions, privateRoomOptions, publicRoomOptions]);
  const ownedStageOptions = ownedStagesQuery.data?.stages ?? [];
  const stageOptions = useMemo(() => {
    const byId = new Map<string, WtfLiveStage>();
    (stagesQuery.data?.stages ?? []).forEach((stage) => byId.set(stage.id, stage));
    ownedStageOptions.forEach((stage) => byId.set(stage.id, stage));
    return Array.from(byId.values());
  }, [ownedStageOptions, stagesQuery.data?.stages]);
  const selectedRoom = roomOptions.find((r) => r.id === roomId) ?? null;
  const selectedStage = stageOptions.find((s) => s.id === stageId) ?? null;
  const activePublicRooms = publicRoomOptions.filter((room) => roomPresence(room).active);
  const activePublicUserCount = activePublicRooms.reduce((total, room) => total + roomPresence(room).participantCount, 0);
  const selectedRoomManageable = selectedRoom ? canManageRoom(selectedRoom) : false;
  const selectedRoomPresence = selectedRoom ? roomPresence(selectedRoom) : null;
  const selectedStageManageable = selectedStage ? selectedStage.source === "user" && ownedStageOptions.some((stage) => stage.id === selectedStage.id) : false;
  const normalizedSoundboardShortcut = normalizeWtfLiveSoundboardShortcut(soundboardShortcut);
  const soundboardShortcutInvalid = Boolean(soundboardShortcut.trim() && !normalizedSoundboardShortcut);
  const soundboardShortcutConflict = findWtfLiveSoundboardShortcutConflict(
    soundboardSettings.clips,
    normalizedSoundboardShortcut,
  );
  const saveSoundboardMutation = useMutation({
    mutationFn: (settings: WtfLiveSoundboardSettings) =>
      api.put<SoundboardSettingsResponse>("/api/wtf-live/soundboard", settings),
    onSuccess: (result) => {
      const normalized = normalizeWtfLiveSoundboardSettings(result);
      if (user?.id) writeWtfLiveSoundboardSettings(user.id, normalized);
      setSoundboardSettings(normalized);
      qc.invalidateQueries({ queryKey: ["wtf-live", "soundboard", user?.id] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Server sync failed.";
      setSoundboardStatus(`Saved locally. ${message}`);
    },
  });

  const accessListQuery = useQuery<{ members: WtfLiveRoomAccessMember[] }>({
    queryKey: ["wtf-live", "rooms", roomId, "access"],
    enabled: tab === "rooms" && Boolean(selectedRoomManageable && selectedRoom?.accessMode === "private"),
    queryFn: () => api.get(`/api/wtf-live/rooms/${encodeURIComponent(roomId)}/access`),
  });

  useEffect(() => {
    if (roomOptions.length && !roomOptions.some((r) => r.id === roomId)) setRoomId(roomOptions[0].id);
  }, [roomId, roomOptions]);
  useEffect(() => {
    if (stageOptions.length && !stageOptions.some((s) => s.id === stageId)) setStageId(stageOptions[0].id);
  }, [stageId, stageOptions]);
  useEffect(() => {
    if (!selectedRoom || selectedRoom.accessMode !== "private") {
      setSelectedAccessList("");
      return;
    }
    if (accessListQuery.data?.members) {
      setSelectedAccessList(accessListQuery.data.members.map((member) => member.username).join("\n"));
    }
  }, [accessListQuery.data?.members, selectedRoom]);

  function mergeRoomCache(room: WtfLiveRoom) {
    qc.setQueryData<WtfLiveRoomsResponse>(["wtf-live", "rooms", "mine"], (current) => mergeRoomResponse(current, room));
    if (room.accessMode === "private") {
      qc.setQueryData<WtfLiveRoomsResponse>(["wtf-live", "rooms", "private"], (current) => mergeRoomResponse(current, room));
    } else if (room.isPublic === false) {
      qc.setQueryData<WtfLiveRoomsResponse>(["wtf-live", "rooms"], (current) => removeRoomResponse(current, room.id));
    } else {
      qc.setQueryData<WtfLiveRoomsResponse>(["wtf-live", "rooms"], (current) => mergeRoomResponse(current, room));
    }
  }

  function removeRoomCache(roomIdToRemove: string) {
    qc.setQueryData<WtfLiveRoomsResponse>(["wtf-live", "rooms"], (current) => removeRoomResponse(current, roomIdToRemove));
    qc.setQueryData<WtfLiveRoomsResponse>(["wtf-live", "rooms", "mine"], (current) => removeRoomResponse(current, roomIdToRemove));
    qc.setQueryData<WtfLiveRoomsResponse>(["wtf-live", "rooms", "private"], (current) => removeRoomResponse(current, roomIdToRemove));
  }

  function mergeStageCache(stage: WtfLiveStage) {
    qc.setQueryData<WtfLiveStagesResponse>(["wtf-live", "stages", "mine"], (current) => mergeStageResponse(current, stage));
    if (stage.isPublic === false) {
      qc.setQueryData<WtfLiveStagesResponse>(["wtf-live", "stages"], (current) => removeStageResponse(current, stage.id));
    } else {
      qc.setQueryData<WtfLiveStagesResponse>(["wtf-live", "stages"], (current) => mergeStageResponse(current, stage));
    }
  }

  function removeStageCache(stageIdToRemove: string) {
    qc.setQueryData<WtfLiveStagesResponse>(["wtf-live", "stages"], (current) => removeStageResponse(current, stageIdToRemove));
    qc.setQueryData<WtfLiveStagesResponse>(["wtf-live", "stages", "mine"], (current) => removeStageResponse(current, stageIdToRemove));
  }

  function actionErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const createRoom = useMutation({
    mutationFn: () =>
      api.post<{ room?: WtfLiveRoom; missingUsernames?: string[] }>("/api/wtf-live/rooms", {
        title: createTitle.trim(),
        description: createDescription.trim(),
        accessMode: createRoomAccessMode,
        accessUsernames: parseAccessUsernames(createAccessList),
      }),
    onSuccess: (data: { room?: WtfLiveRoom; missingUsernames?: string[] }) => {
      setCreateTitle("");
      setCreateDescription("");
      setCreateRoomAccessMode("public");
      setCreateAccessList("");
      if (data?.room?.id) {
        mergeRoomCache(data.room);
        setRoomId(data.room.id);
        setTab("rooms");
        setCopyStatus(
          data.room.accessMode === "private"
            ? `${data.room.title} created as a private WTF-user room.`
            : `Public URL ready: ${publicRoomUrl(data.room.id)}`,
        );
      }
      if (data?.missingUsernames?.length) {
        setCopyStatus(`Room created, but these WTF users were not found: ${data.missingUsernames.join(", ")}`);
      }
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "mine"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "private"] });
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
        mergeStageCache(data.stage);
        setStageId(data.stage.id);
        setTab("stages");
      }
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages", "mine"] });
    },
  });
  const updateRoomAccess = useMutation({
    mutationFn: (room: WtfLiveRoom) =>
      api.patch<{ room?: WtfLiveRoom; members?: WtfLiveRoomAccessMember[]; missingUsernames?: string[] }>(
        `/api/wtf-live/rooms/${encodeURIComponent(room.id)}/access`,
        { usernames: parseAccessUsernames(selectedAccessList) },
      ),
    onSuccess: (data, room) => {
      const missing = data?.missingUsernames ?? [];
      setCopyStatus(
        missing.length
          ? `${room.title} access saved. Missing WTF users: ${missing.join(", ")}`
          : `${room.title} private access list saved.`,
      );
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "mine"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "private"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", room.id, "access"] });
    },
  });
  const updateRoomVisibility = useMutation({
    mutationFn: ({ room, isPublic }: { room: WtfLiveRoom; isPublic: boolean }) =>
      api.patch<{ room?: WtfLiveRoom }>(`/api/wtf-live/rooms/${encodeURIComponent(room.id)}`, { isPublic }),
    onSuccess: (data: { room?: WtfLiveRoom }, variables) => {
      const room = data?.room ?? variables.room;
      mergeRoomCache({ ...room, isPublic: variables.isPublic });
      setCopyStatus(`${room.title} is ${variables.isPublic ? "open" : "closed"} to guests.`);
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "mine"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "private"] });
    },
    onError: (error: unknown) => {
      setCopyStatus(actionErrorMessage(error, "Could not update room visibility."));
    },
  });
  const deleteRoom = useMutation({
    mutationFn: (room: WtfLiveRoom) => api.delete<{ ok: true; roomId: string }>(`/api/wtf-live/rooms/${encodeURIComponent(room.id)}`),
    onSuccess: (_data: { ok: true; roomId: string }, room: WtfLiveRoom) => {
      if (roomId === room.id) setRoomId("wtf-live");
      removeRoomCache(room.id);
      setCopyStatus(`${room.title} deleted.`);
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "mine"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "rooms", "private"] });
    },
    onError: (error: unknown) => {
      setCopyStatus(actionErrorMessage(error, "Could not delete room."));
    },
  });
  const updateStageVisibility = useMutation({
    mutationFn: ({ stage, isPublic }: { stage: WtfLiveStage; isPublic: boolean }) =>
      api.patch<{ stage?: WtfLiveStage }>(`/api/wtf-live/stages/${encodeURIComponent(stage.id)}`, { isPublic }),
    onSuccess: (data: { stage?: WtfLiveStage }, variables) => {
      const stage = data?.stage ?? variables.stage;
      mergeStageCache({ ...stage, isPublic: variables.isPublic });
      setCopyStatus(`${stage.title} is ${variables.isPublic ? "open" : "closed"} for stage broadcasts.`);
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages", "mine"] });
    },
    onError: (error: unknown) => {
      setCopyStatus(actionErrorMessage(error, "Could not update stage visibility."));
    },
  });
  const deleteStage = useMutation({
    mutationFn: (stage: WtfLiveStage) => api.delete<{ ok: true; stageId: string }>(`/api/wtf-live/stages/${encodeURIComponent(stage.id)}`),
    onSuccess: (_data: { ok: true; stageId: string }, stage: WtfLiveStage) => {
      if (stageId === stage.id) setStageId("wtf-stage");
      removeStageCache(stage.id);
      setCopyStatus(`${stage.title} deleted.`);
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages"] });
      qc.invalidateQueries({ queryKey: ["wtf-live", "stages", "mine"] });
    },
    onError: (error: unknown) => {
      setCopyStatus(actionErrorMessage(error, "Could not delete stage."));
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
    window.open(presentationRouteHref(publicRoomPath(room.id)), "_blank", "noopener,noreferrer");
  }

  function joinPublicRoom(room: WtfLiveRoom) {
    window.open(presentationRouteHref(publicRoomPath(room.id)), "_blank", "noopener,noreferrer");
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

  function toggleStageOpen(stage: WtfLiveStage) {
    updateStageVisibility.mutate({ stage, isPublic: stage.isPublic === false });
  }

  function confirmDeleteStage(stage: WtfLiveStage) {
    if (!window.confirm(`Delete ${stage.title}? Stage broadcasts for this lane will stop.`)) return;
    deleteStage.mutate(stage);
  }

  function saveSoundboardSettings(next: WtfLiveSoundboardSettings, statusText: string) {
    if (!user?.id) {
      setSoundboardStatus("Sign in to save a WTF LIVE soundboard.");
      return;
    }
    const saved = writeWtfLiveSoundboardSettings(user.id, next);
    setSoundboardSettings(saved);
    setSoundboardStatus(`${statusText} Syncing...`);
    saveSoundboardMutation.mutate(saved, {
      onSuccess: () => setSoundboardStatus(statusText),
    });
  }

  async function addSoundboardClip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!user?.id) {
      setSoundboardStatus("Sign in to save a WTF LIVE soundboard.");
      return;
    }
    if (soundboardSettings.clips.length >= WTF_LIVE_SOUNDBOARD_MAX_CLIPS) {
      setSoundboardStatus(`Soundboard limit is ${WTF_LIVE_SOUNDBOARD_MAX_CLIPS} clips.`);
      return;
    }
    const shortcut = normalizeWtfLiveSoundboardShortcut(soundboardShortcut);
    const conflict = findWtfLiveSoundboardShortcutConflict(soundboardSettings.clips, shortcut);
    if (conflict) {
      setSoundboardStatus(`${shortcut} is already bound to ${conflict.label}.`);
      return;
    }
    try {
      const clip = await readWtfLiveSoundboardFile(file, {
        label: soundboardLabel,
        category: soundboardCategory,
        shortcut,
        volume: soundboardVolume,
        cooldownMs: soundboardCooldownMs,
      });
      saveSoundboardSettings(
        { ...soundboardSettings, clips: [...soundboardSettings.clips, clip] },
        `${clip.label} added to Show Kit.`,
      );
      setSoundboardLabel("");
      setSoundboardCategory("General");
      setSoundboardShortcut("");
      setSoundboardVolume(WTF_LIVE_SOUNDBOARD_DEFAULT_VOLUME);
      setSoundboardCooldownMs(WTF_LIVE_SOUNDBOARD_DEFAULT_COOLDOWN_MS);
    } catch (error) {
      setSoundboardStatus(error instanceof Error ? error.message : "Could not add that sound.");
    }
  }

  function previewSoundboardClip(clip: WtfLiveSoundboardClip) {
    try {
      playWtfLiveSoundboardClip(clip, 0.75);
      setSoundboardStatus(`Previewing ${clip.label}.`);
    } catch {
      setSoundboardStatus(`Could not preview ${clip.label}.`);
    }
  }

  function deleteSoundboardClip(clip: WtfLiveSoundboardClip) {
    saveSoundboardSettings(
      {
        ...soundboardSettings,
        clips: soundboardSettings.clips.filter((candidate) => candidate.id !== clip.id),
      },
      `${clip.label} removed from Show Kit.`,
    );
  }

  function moveSoundboardClip(clip: WtfLiveSoundboardClip, direction: -1 | 1) {
    const index = soundboardSettings.clips.findIndex((candidate) => candidate.id === clip.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= soundboardSettings.clips.length) return;
    const clips = [...soundboardSettings.clips];
    const [moved] = clips.splice(index, 1);
    clips.splice(nextIndex, 0, moved);
    saveSoundboardSettings(
      {
        ...soundboardSettings,
        clips,
      },
      `${clip.label} moved ${direction < 0 ? "up" : "down"}.`,
    );
  }

  function canManageRoom(room: WtfLiveRoom) {
    return room.source === "user" && ownedRoomOptions.some((ownedRoom) => ownedRoom.id === room.id);
  }

  function roomBadgeLabel(room: WtfLiveRoom, owned: boolean) {
    if (room.isPublic === false) return "Closed";
    if (room.accessMode === "private") return owned || canManageRoom(room) ? "Private owned" : "Private";
    if (canManageRoom(room) || owned) return "Owned";
    return room.source === "system" ? "Official" : "Open";
  }

  function renderRoomCard(room: WtfLiveRoom, owned: boolean) {
    const closed = room.isPublic === false;
    const privateRoom = room.accessMode === "private";
    const manageable = canManageRoom(room);
    const presence = roomPresence(room);
    return (
      <RoomCard
        key={`${owned ? "owned" : "public"}-${room.id}`}
        data-wtf-live-room-card={room.id}
        data-wtf-live-room-surface={owned ? "owned" : "public"}
        data-wtf-live-owned-room={manageable ? "true" : undefined}
        data-wtf-live-room-active={presence.active ? "true" : "false"}
        data-wtf-live-room-users={presence.participantCount}
      >
        <RoomMetaRow>
          <RoomBadge $closed={closed}>
            {roomBadgeLabel(room, owned)}
          </RoomBadge>
          {privateRoom ? (
            <RoomPresenceBadge data-wtf-live-private-room={room.id}>
              <Lock size={11} aria-hidden />
              WTF users only
            </RoomPresenceBadge>
          ) : null}
          <RoomPresenceBadge
            $active={presence.active}
            data-wtf-live-room-presence={room.id}
          >
            <Radio size={11} aria-hidden />
            {presence.active ? "Active now" : "Quiet"}
          </RoomPresenceBadge>
          <RoomPresenceBadge data-wtf-live-room-user-count={room.id}>
            <Users size={11} aria-hidden />
            {userCountLabel(presence.participantCount)}
          </RoomPresenceBadge>
        </RoomMetaRow>
        <strong>{room.title}</strong>
        <MutedText data-wtf-live-room-share-summary={room.id}>
          {presence.active ? shareCountLabel(presence) : "No one in this room right now."}
        </MutedText>
        {room.description ? <MutedText>{room.description}</MutedText> : null}
        {privateRoom ? <MutedText>Only the owner and WTF users on the access list can enter.</MutedText> : null}
        {closed ? <MutedText>Closed until the owner reopens it.</MutedText> : null}
        {privateRoom ? <ShareLink>Private room · no public guest URL</ShareLink> : <ShareLink>{publicRoomUrl(room.id)}</ShareLink>}
        {manageable ? <MutedText data-wtf-live-owner-controls="true">Owner controls</MutedText> : null}
        <ActionGrid data-wtf-live-room-actions={room.id}>
          <Button primary size="sm" disabled={closed} onClick={() => joinPublicRoom(room)} data-wtf-live-room-join={room.id}>
            <ButtonLabel><LogIn size={14} aria-hidden /> {privateRoom ? "Join Private Room" : "Join in New Tab"}</ButtonLabel>
          </Button>
          {!privateRoom ? (
            <Button size="sm" onClick={() => copyPublicRoom(room)}>
              <ButtonLabel><Copy size={14} aria-hidden /> Copy URL</ButtonLabel>
            </Button>
          ) : null}
          {!privateRoom ? (
            <Button size="sm" disabled={closed} onClick={() => openPublicRoom(room)}>
              <ButtonLabel><ExternalLink size={14} aria-hidden /> Guest View</ButtonLabel>
            </Button>
          ) : null}
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
          {copyStatus ? (
            <span aria-live="polite" data-wtf-live-action-status>{copyStatus}</span>
          ) : account?.handle ? (
            <span>@{account.handle}</span>
          ) : (
            <span>Skywire not linked</span>
          )}
        </ContextBar>

        {tab === "overview" ? (
          <WideGrid>
            <GroupBox label="Create room">
              <Stack>
                <NativeSelect
                  aria-label="Room access type"
                  value={createRoomAccessMode}
                  onChange={(e) => setCreateRoomAccessMode(e.target.value as "public" | "private")}
                  data-wtf-live-create-room-access
                >
                  <option value="public">Public guest room</option>
                  <option value="private">Private WTF-user room</option>
                </NativeSelect>
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
                {createRoomAccessMode === "private" ? (
                  <TextArea
                    value={createAccessList}
                    placeholder="WTF usernames allowed in this room"
                    onChange={(e) => setCreateAccessList(e.target.value)}
                    data-wtf-live-create-private-access-list
                  />
                ) : null}
                <Button
                  primary
                  disabled={!createTitle.trim() || createRoom.isPending}
                  onClick={() => createRoom.mutate()}
                >
                  {createRoom.isPending ? "Creating..." : createRoomAccessMode === "private" ? "Create Private Room" : "Create Public Room"}
                </Button>
                {createRoom.isError ? <span>{(createRoom.error as Error).message}</span> : null}
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

            <GroupBox label="Private rooms">
              <RoomDirectory>
                {privateRoomsQuery.isLoading ? <Hourglass size={24} /> : null}
                {privateRoomOptions.length ? (
                  privateRoomOptions.map((room) => renderRoomCard(room, false))
                ) : (
                  <MutedText>No private WTF-user rooms are available to this account.</MutedText>
                )}
              </RoomDirectory>
            </GroupBox>

            <GroupBox label="Open public rooms">
              <RoomDirectory>
                {roomsQuery.isLoading ? <Hourglass size={24} /> : null}
                <RoomActivitySummary
                  $active={activePublicRooms.length > 0}
                  data-wtf-live-active-room-summary
                  data-wtf-live-active-room-count={activePublicRooms.length}
                  data-wtf-live-active-user-count={activePublicUserCount}
                >
                  <strong>
                    <Radio size={14} aria-hidden />
                    {activePublicRooms.length
                      ? `${activePublicRooms.length} active room${activePublicRooms.length === 1 ? "" : "s"}`
                      : "No active rooms"}
                  </strong>
                  <span>{userCountLabel(activePublicUserCount)} live now</span>
                </RoomActivitySummary>
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

        {tab === "show-kit" ? (
          <Grid>
            <GroupBox label="Soundboard">
              <Stack data-wtf-live-soundboard-settings>
                <FeedItem>
                  <strong><Music2 size={14} aria-hidden /> Clips</strong>
                  <span>{soundboardSettings.clips.length} / {WTF_LIVE_SOUNDBOARD_MAX_CLIPS} · {soundboardQuery.data?.storage ? "server presets" : "local cache"}</span>
                </FeedItem>
                <SettingsField>
                  Button label
                  <TextField
                    value={soundboardLabel}
                    placeholder="Intro sting"
                    fullWidth
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSoundboardLabel(e.target.value)}
                    data-wtf-live-soundboard-label
                  />
                </SettingsField>
                <SettingsField>
                  Category
                  <TextField
                    value={soundboardCategory}
                    placeholder="Intro / reactions / outro"
                    fullWidth
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSoundboardCategory(e.target.value)}
                    data-wtf-live-soundboard-category
                  />
                </SettingsField>
                <SettingsField>
                  Keyboard shortcut
                  <TextField
                    value={soundboardShortcut}
                    placeholder="Alt+1"
                    fullWidth
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSoundboardShortcut(e.target.value)}
                    onBlur={() => setSoundboardShortcut((current) => normalizeWtfLiveSoundboardShortcut(current) || current)}
                    data-wtf-live-soundboard-shortcut
                  />
                </SettingsField>
                <InlineActions>
                  <SettingsField>
                    Volume
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={soundboardVolume}
                      aria-label="Soundboard clip volume"
                      onChange={(event) => setSoundboardVolume(Number(event.currentTarget.value))}
                      data-wtf-live-soundboard-volume
                    />
                    <MutedText>{soundboardVolume}%</MutedText>
                  </SettingsField>
                  <SettingsField>
                    Cooldown
                    <NativeSelect
                      value={String(soundboardCooldownMs)}
                      onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSoundboardCooldownMs(Number(event.target.value))}
                      data-wtf-live-soundboard-cooldown
                    >
                      <option value="0">No cooldown</option>
                      <option value="500">0.5 seconds</option>
                      <option value="1500">1.5 seconds</option>
                      <option value="3000">3 seconds</option>
                      <option value="5000">5 seconds</option>
                      <option value="10000">10 seconds</option>
                    </NativeSelect>
                  </SettingsField>
                </InlineActions>
                <InlineActions>
                  <Button
                    type="button"
                    onClick={() => {
                      setSoundboardCapturing(true);
                      setSoundboardStatus("Press a Ctrl, Alt, or Meta shortcut.");
                    }}
                    data-wtf-live-soundboard-capture
                  >
                    <ButtonLabel><Keyboard size={14} aria-hidden /> {soundboardCapturing ? "Capturing" : "Capture Shortcut"}</ButtonLabel>
                  </Button>
                  <SettingsField>
                    Audio file
                    <input
                      type="file"
                      accept={WTF_LIVE_SOUNDBOARD_ACCEPT}
                      disabled={!user?.id || saveSoundboardMutation.isPending || soundboardShortcutInvalid || Boolean(soundboardShortcutConflict)}
                      onChange={addSoundboardClip}
                      data-wtf-live-soundboard-file
                    />
                  </SettingsField>
                </InlineActions>
                {normalizedSoundboardShortcut ? (
                  <MutedText data-wtf-live-soundboard-shortcut-preview>
                    Shortcut: {normalizedSoundboardShortcut}
                  </MutedText>
                ) : null}
                {soundboardShortcutInvalid ? (
                  <MutedText data-wtf-live-soundboard-shortcut-error>
                    Use Ctrl, Alt, or Meta with a key.
                  </MutedText>
                ) : null}
                {soundboardShortcutConflict ? (
                  <MutedText data-wtf-live-soundboard-conflict>
                    {normalizedSoundboardShortcut} is already bound to {soundboardShortcutConflict.label}.
                  </MutedText>
                ) : null}
                {!user?.id ? <MutedText>Sign in to save Show Kit clips.</MutedText> : null}
                {soundboardStatus ? (
                  <MutedText aria-live="polite" data-wtf-live-soundboard-status>
                    {soundboardStatus}
                  </MutedText>
                ) : null}
                {soundboardQuery.isLoading ? <MutedText>Loading server presets...</MutedText> : null}
              </Stack>
            </GroupBox>
            <GroupBox label="Programmed buttons">
              <FeedList data-wtf-live-soundboard-clip-list>
                {soundboardSettings.clips.length ? (
                  soundboardSettings.clips.map((clip, index) => (
                    <FeedItem key={clip.id} data-wtf-live-soundboard-clip={clip.id}>
                      <strong>{clip.label}</strong>
                      <span>{clip.category} · {clip.shortcut || "No shortcut"} · {clip.volume}% · {clip.cooldownMs ? `${(clip.cooldownMs / 1000).toFixed(clip.cooldownMs % 1000 ? 1 : 0)}s cooldown` : "no cooldown"} · {Math.round(clip.sizeBytes / 1024)} KB</span>
                      <ActionGrid>
                        <Button
                          size="sm"
                          disabled={index === 0 || saveSoundboardMutation.isPending}
                          aria-label={`Move ${clip.label} up`}
                          title="Move up"
                          onClick={() => moveSoundboardClip(clip, -1)}
                          data-wtf-live-soundboard-move-up={clip.id}
                        >
                          <ArrowUp size={14} aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          disabled={index === soundboardSettings.clips.length - 1 || saveSoundboardMutation.isPending}
                          aria-label={`Move ${clip.label} down`}
                          title="Move down"
                          onClick={() => moveSoundboardClip(clip, 1)}
                          data-wtf-live-soundboard-move-down={clip.id}
                        >
                          <ArrowDown size={14} aria-hidden />
                        </Button>
                        <Button size="sm" onClick={() => previewSoundboardClip(clip)} data-wtf-live-soundboard-preview={clip.id}>
                          <ButtonLabel><Play size={14} aria-hidden /> Preview</ButtonLabel>
                        </Button>
                        <Button size="sm" disabled={saveSoundboardMutation.isPending} onClick={() => deleteSoundboardClip(clip)} data-wtf-live-soundboard-delete={clip.id}>
                          <ButtonLabel><Trash2 size={14} aria-hidden /> Delete</ButtonLabel>
                        </Button>
                      </ActionGrid>
                    </FeedItem>
                  ))
                ) : (
                  <MutedText>No soundboard clips yet.</MutedText>
                )}
              </FeedList>
            </GroupBox>
            <GroupBox label="Runtime">
              <Stack>
                <FeedItem>
                  <strong><Upload size={14} aria-hidden /> Owner room trigger</strong>
                  <span>{soundboardSettings.clips.length ? "Ready" : "Waiting for clips"}</span>
                </FeedItem>
                <Button onClick={() => setTab("rooms")}>Open Room Host</Button>
              </Stack>
            </GroupBox>
          </Grid>
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
              <Button onClick={() => { window.location.href = presentationRouteHref(SKYWIRE_SETTINGS_PATH); }}>
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
                {selectedRoom && selectedRoomPresence ? (
                  <RoomCard
                    data-wtf-live-room-card={selectedRoom.id}
                    data-wtf-live-room-surface="selected"
                    data-wtf-live-owned-room={selectedRoomManageable ? "true" : undefined}
                    data-wtf-live-room-active={selectedRoomPresence.active ? "true" : "false"}
                    data-wtf-live-room-users={selectedRoomPresence.participantCount}
                  >
                    <RoomMetaRow>
                      <RoomBadge $closed={selectedRoom.isPublic === false}>
                        {roomBadgeLabel(selectedRoom, selectedRoomManageable)}
                      </RoomBadge>
                      {selectedRoom.accessMode === "private" ? (
                        <RoomPresenceBadge data-wtf-live-private-room={selectedRoom.id}>
                          <Lock size={11} aria-hidden />
                          WTF users only
                        </RoomPresenceBadge>
                      ) : null}
                      <RoomPresenceBadge
                        $active={selectedRoomPresence.active}
                        data-wtf-live-room-presence={selectedRoom.id}
                      >
                        <Radio size={11} aria-hidden />
                        {selectedRoomPresence.active ? "Active now" : "Quiet"}
                      </RoomPresenceBadge>
                      <RoomPresenceBadge data-wtf-live-room-user-count={selectedRoom.id}>
                        <Users size={11} aria-hidden />
                        {userCountLabel(selectedRoomPresence.participantCount)}
                      </RoomPresenceBadge>
                    </RoomMetaRow>
                    <strong>{selectedRoom.title}</strong>
                    <MutedText data-wtf-live-room-share-summary={selectedRoom.id}>
                      {selectedRoomPresence.active ? shareCountLabel(selectedRoomPresence) : "No one in this room right now."}
                    </MutedText>
                    {selectedRoom.description ? <MutedText>{selectedRoom.description}</MutedText> : null}
                    {selectedRoom.accessMode === "private" ? <MutedText>Private WTF-user room. Access is controlled by the room owner.</MutedText> : null}
                    {selectedRoom.isPublic === false ? <MutedText>Closed until you reopen it.</MutedText> : null}
                    {selectedRoom.accessMode === "private" ? <ShareLink>Private room · no public guest URL</ShareLink> : <ShareLink>{publicRoomUrl(selectedRoom.id)}</ShareLink>}
                    {selectedRoomManageable ? <MutedText data-wtf-live-owner-controls="true">Owner controls</MutedText> : null}
                    <ActionGrid data-wtf-live-room-actions={selectedRoom.id}>
                      <Button primary size="sm" disabled={selectedRoom.isPublic === false} onClick={() => joinPublicRoom(selectedRoom)} data-wtf-live-room-join={selectedRoom.id}>
                        <ButtonLabel><LogIn size={14} aria-hidden /> {selectedRoom.accessMode === "private" ? "Join Private Room" : "Join in New Tab"}</ButtonLabel>
                      </Button>
                      {selectedRoom.accessMode !== "private" ? (
                        <Button size="sm" onClick={() => copyPublicRoom(selectedRoom)}>
                          <ButtonLabel><Copy size={14} aria-hidden /> Copy URL</ButtonLabel>
                        </Button>
                      ) : null}
                      {selectedRoom.accessMode !== "private" ? (
                        <Button size="sm" disabled={selectedRoom.isPublic === false} onClick={() => openPublicRoom(selectedRoom)}>
                          <ButtonLabel><ExternalLink size={14} aria-hidden /> Guest View</ButtonLabel>
                        </Button>
                      ) : null}
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
                    {selectedRoomManageable && selectedRoom.accessMode === "private" ? (
                      <Stack data-wtf-live-private-access-editor={selectedRoom.id}>
                        <MutedText>Allowed WTF usernames</MutedText>
                        <TextArea
                          value={selectedAccessList}
                          placeholder={"wtf-user-1\nwtf-user-2"}
                          onChange={(e) => setSelectedAccessList(e.target.value)}
                          data-wtf-live-private-access-list={selectedRoom.id}
                        />
                        <Button
                          size="sm"
                          disabled={updateRoomAccess.isPending}
                          onClick={() => updateRoomAccess.mutate(selectedRoom)}
                          data-wtf-live-private-access-save={selectedRoom.id}
                        >
                          Save Private Access
                        </Button>
                        {accessListQuery.isLoading ? <MutedText>Loading access list...</MutedText> : null}
                        {updateRoomAccess.isError ? <span>{(updateRoomAccess.error as Error).message}</span> : null}
                      </Stack>
                    ) : null}
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
                <TextArea
                  value={roomText}
                  maxLength={600}
                  placeholder={selectedRoom?.accessMode === "private" ? "Private rooms use realtime chat after joining" : "Public room message"}
                  onChange={(e) => setRoomText(e.target.value)}
                />
                <Button disabled={selectedRoom?.accessMode === "private" || !sessionOk || !canRooms || !roomText.trim() || sendRoom.isPending} onClick={() => sendRoom.mutate()}>
                  Send Room Message
                </Button>
                {selectedRoom?.accessMode === "private" ? <span>Join the private room to use realtime chat with the access list.</span> : null}
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
                      {stage.title}{stage.isPublic === false ? " (closed)" : ""}
                    </option>
                  ))}
                </NativeSelect>
                {selectedStage ? (
                  <RoomCard
                    data-wtf-live-stage-card={selectedStage.id}
                    data-wtf-live-owned-stage={selectedStageManageable ? "true" : undefined}
                  >
                    <RoomMetaRow>
                      <RoomBadge $closed={selectedStage.isPublic === false}>
                        {selectedStage.isPublic === false ? "Closed" : selectedStageManageable ? "Owned stage" : selectedStage.source === "system" ? "Official stage" : "Open stage"}
                      </RoomBadge>
                      <RoomPresenceBadge>
                        <Radio size={11} aria-hidden />
                        {selectedStage.source === "system" ? "System lane" : "User lane"}
                      </RoomPresenceBadge>
                    </RoomMetaRow>
                    <strong>{selectedStage.title}</strong>
                    {selectedStage.description ? <MutedText>{selectedStage.description}</MutedText> : null}
                    {selectedStage.liveUrl ? <ShareLink>{selectedStage.liveUrl}</ShareLink> : <MutedText>No live URL set.</MutedText>}
                    <ActionGrid data-wtf-live-stage-actions={selectedStage.id}>
                      {selectedStage.liveUrl ? (
                        <Button size="sm" onClick={() => window.open(selectedStage.liveUrl || "", "_blank", "noopener,noreferrer")}>
                          <ButtonLabel><ExternalLink size={14} aria-hidden /> Open Live URL</ButtonLabel>
                        </Button>
                      ) : null}
                      {selectedStageManageable ? (
                        <Button
                          size="sm"
                          data-wtf-live-stage-close={selectedStage.id}
                          disabled={updateStageVisibility.isPending}
                          onClick={() => toggleStageOpen(selectedStage)}
                        >
                          <ButtonLabel><Power size={14} aria-hidden /> {selectedStage.isPublic === false ? "Reopen Stage" : "Close Stage"}</ButtonLabel>
                        </Button>
                      ) : null}
                      {selectedStageManageable ? (
                        <Button
                          size="sm"
                          data-wtf-live-stage-delete={selectedStage.id}
                          disabled={deleteStage.isPending}
                          onClick={() => confirmDeleteStage(selectedStage)}
                        >
                          <ButtonLabel><Trash2 size={14} aria-hidden /> Delete Stage</ButtonLabel>
                        </Button>
                      ) : null}
                    </ActionGrid>
                  </RoomCard>
                ) : null}
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
