import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { DoorOpen, RefreshCw, Save, Send, Settings } from "lucide-react";
import { api } from "../../lib/api";

type TranscriptEvent = {
  id: number;
  eventType: string;
  message: string;
  visibility: string;
  locationId: string | null;
  createdAt: string;
};

type InventoryStack = {
  itemKey: string;
  label: string;
  tier: number;
  quantity: number;
  weight: number;
};

type NearbyPlayer = {
  userId: number;
  username: string;
  displayName: string | null;
  mark: string;
};

type DedRoomsCoordinate = { x: number; y: number; z: number };

type DedRoomsDoor = {
  key: string;
  label: string;
  kind: string;
  resolvedToRoomId: string | null;
};

type CharacterSheet = {
  name: string;
  level: number;
  attributes: Record<string, number>;
  skills: Record<string, number>;
};

type DedRoomsState = {
  status: "exploring" | "departed";
  departed: boolean;
  message?: string;
  campaign?: {
    mode: string;
    targetDepartures: number;
    departureCount: number;
    progress?: {
      required: string[];
      completed: string[];
      sharedUnlocked: boolean;
    };
  };
  player?: {
    locationId: string;
    placedRoomId?: string;
    coordinate?: DedRoomsCoordinate | null;
    coordinateKey?: string | null;
    status: string;
    weightLimit: number;
    inventoryWeight: number;
    commands: string[];
    attuned: boolean;
    sheet?: CharacterSheet;
  };
  room?: {
    id: string;
    title: string;
    region: string;
    description: string;
    exits: Record<string, string>;
    doors?: DedRoomsDoor[];
    tags: string[];
  };
  doors?: DedRoomsDoor[];
  map?: {
    placedCount: number;
    deckRemaining: number;
    currentCoordinate: DedRoomsCoordinate | null;
    currentCoordinateKey: string | null;
    currentPlacedRoomId: string;
    greenRoomPlaced: boolean;
    anchors: Array<{ key: string; roomId: string; title: string; discovered: boolean; coordinate: DedRoomsCoordinate | null }>;
  };
  npcs?: Array<{ key: string; name: string; mood: string; wants: string[] }>;
  resources?: Array<{ key: string; label: string; family: string; farmYield: number }>;
  minigames?: Array<{ key: string; title: string; command: string; rewardKey: string }>;
  inventory?: InventoryStack[];
  nearby?: NearbyPlayer[];
  transcript?: TranscriptEvent[];
  seedSummary?: {
    roomCount: number;
    npcCount: number;
    puzzleHookCount: number;
    minigameCount: number;
    resourceFamilyCount: number;
  };
  isAdmin?: boolean;
};

type CommandResponse = {
  lines: string[];
  state: DedRoomsState;
};

type AdminContentResponse = {
  campaign: DedRoomsState["campaign"] | null;
  records: Array<{
    id: number;
    kind: string;
    key: string;
    title: string;
    body: string;
    dataJson: unknown;
    status: string;
    version: number;
  }>;
  seed: {
    summary: NonNullable<DedRoomsState["seedSummary"]>;
    puzzleHooks: unknown[];
    minigames: unknown[];
  };
};

type PresencePeer = {
  userId: number;
  username: string;
  role?: string;
};

const Container = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100%;
  min-height: 520px;
  background: #10120f;
  color: #e8ffe4;
  font-family: var(--wtf-mono-font, "IBM Plex Mono", monospace);
  overflow: hidden;

  @media (max-width: 820px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 178px auto;
  }
`;

const Transcript = styled.main`
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 18px 20px 20px;
  background:
    linear-gradient(180deg, rgba(52, 88, 49, 0.22), rgba(16, 18, 15, 0) 180px),
    #10120f;
`;

const StatusRail = styled.aside`
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border-left: 1px solid rgba(184, 255, 188, 0.22);
  background: #161912;
  padding: 14px;

  @media (max-width: 820px) {
    grid-row: 2;
    border-left: 0;
    border-top: 1px solid rgba(184, 255, 188, 0.22);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
`;

const PromptBar = styled.form`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  border-top: 1px solid rgba(184, 255, 188, 0.25);
  background: #0c0f0b;
  padding: 10px;
`;

const PromptMark = styled.span`
  color: #96ff7d;
  font-weight: 800;
`;

const CommandInput = styled.input`
  min-width: 0;
  border: 1px solid rgba(184, 255, 188, 0.35);
  background: #11160f;
  color: #f2ffe9;
  font: inherit;
  padding: 9px 10px;
  outline: none;

  &:focus {
    border-color: #b8ffbc;
    box-shadow: 0 0 0 2px rgba(184, 255, 188, 0.12);
  }
`;

const IconButton = styled.button`
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(184, 255, 188, 0.35);
  background: #182017;
  color: #e8ffe4;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: #20311d;
  }
`;

const HeaderLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: baseline;
  margin-bottom: 14px;
`;

const RoomTitle = styled.h2`
  margin: 0;
  color: #ffffff;
  font-size: clamp(18px, 2vw, 25px);
  letter-spacing: 0;
`;

const Region = styled.span`
  color: #b7d6a8;
  font-size: 12px;
  text-transform: uppercase;
`;

const EventLine = styled.div<{ $muted?: boolean }>`
  white-space: pre-wrap;
  line-height: 1.5;
  margin: 0 0 11px;
  color: ${(props) => (props.$muted ? "#aabd9c" : "#e8ffe4")};
`;

const RoomDescription = styled.p`
  margin: 0 0 18px;
  line-height: 1.55;
  color: #f0ffe9;
`;

const RailSection = styled.section`
  margin-bottom: 14px;

  @media (max-width: 820px) {
    margin-bottom: 0;
  }
`;

const RailTitle = styled.h3`
  margin: 0 0 7px;
  color: #ffffff;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0;
`;

const RailList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 5px;
  font-size: 12px;
  color: #cbe8bf;
`;

const RailPill = styled.span`
  display: inline-flex;
  max-width: 100%;
  border: 1px solid rgba(184, 255, 188, 0.25);
  padding: 3px 6px;
  color: #e8ffe4;
  background: rgba(20, 31, 18, 0.75);
  overflow-wrap: anywhere;
`;

const Departed = styled.div`
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 420px;
  background: #10120f;
  color: #e8ffe4;
  font-family: var(--wtf-mono-font, monospace);
  font-size: 20px;
`;

const AdminPanel = styled.section`
  border-top: 1px solid rgba(184, 255, 188, 0.2);
  margin-top: 18px;
  padding-top: 14px;
`;

const AdminGrid = styled.div`
  display: grid;
  grid-template-columns: 150px 150px minmax(0, 1fr);
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const AdminInput = styled.input`
  min-width: 0;
  border: 1px solid rgba(184, 255, 188, 0.28);
  background: #11160f;
  color: #f2ffe9;
  font: inherit;
  padding: 8px;
`;

const AdminText = styled.textarea`
  grid-column: 1 / -1;
  min-height: 86px;
  resize: vertical;
  border: 1px solid rgba(184, 255, 188, 0.28);
  background: #11160f;
  color: #f2ffe9;
  font: inherit;
  padding: 8px;
`;

function wsUrl(path: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function coordLabel(coord?: DedRoomsCoordinate | null) {
  return coord ? `${coord.x},${coord.y},${coord.z}` : "unknown";
}

function shortEventLabel(eventType: string) {
  return eventType.replace(/^ded_rooms\./, "").replace(/^command\./, "");
}

function parseJsonRecord(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function AdminEditor({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("dialogue");
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [jsonText, setJsonText] = useState("{}");
  const [campaignTarget, setCampaignTarget] = useState("50");
  const [campaignMode, setCampaignMode] = useState("active");
  const [notice, setNotice] = useState<string | null>(null);

  const adminQuery = useQuery<AdminContentResponse>({
    queryKey: ["dedrooms", "admin"],
    queryFn: () => api.get<AdminContentResponse>("/api/dedrooms/admin/content"),
    enabled,
  });

  useEffect(() => {
    const campaign = adminQuery.data?.campaign;
    if (!campaign) return;
    setCampaignMode(campaign.mode);
    setCampaignTarget(String(campaign.targetDepartures));
  }, [adminQuery.data?.campaign]);

  const saveContent = useMutation({
    mutationFn: () =>
      api.post("/api/dedrooms/admin/content", {
        kind,
        key,
        title,
        body,
        dataJson: parseJsonRecord(jsonText),
        status: "published",
      }),
    onSuccess: async () => {
      setNotice("Content published.");
      await queryClient.invalidateQueries({ queryKey: ["dedrooms", "admin"] });
    },
    onError: (err: Error) => setNotice(err.message),
  });

  const saveCampaign = useMutation({
    mutationFn: () =>
      api.patch("/api/dedrooms/admin/campaign", {
        mode: campaignMode,
        targetDepartures: Number(campaignTarget),
      }),
    onSuccess: async () => {
      setNotice("Campaign updated.");
      await queryClient.invalidateQueries({ queryKey: ["dedrooms", "state"] });
      await queryClient.invalidateQueries({ queryKey: ["dedrooms", "admin"] });
    },
    onError: (err: Error) => setNotice(err.message),
  });

  if (!enabled) return null;

  return (
    <AdminPanel aria-label="DedRooms admin editor">
      <RailTitle>ADM</RailTitle>
      <AdminGrid>
        <AdminInput value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Content kind" />
        <AdminInput value={key} onChange={(event) => setKey(event.target.value)} aria-label="Content key" />
        <AdminInput value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Content title" />
        <AdminText value={body} onChange={(event) => setBody(event.target.value)} aria-label="Content body" />
        <AdminText value={jsonText} onChange={(event) => setJsonText(event.target.value)} aria-label="Content data JSON" />
      </AdminGrid>
      <HeaderLine>
        <IconButton type="button" title="Publish content" onClick={() => saveContent.mutate()} disabled={saveContent.isPending}>
          <Save size={16} />
        </IconButton>
        <AdminInput value={campaignMode} onChange={(event) => setCampaignMode(event.target.value)} aria-label="Campaign mode" />
        <AdminInput value={campaignTarget} onChange={(event) => setCampaignTarget(event.target.value)} aria-label="Target departures" />
        <IconButton type="button" title="Save campaign" onClick={() => saveCampaign.mutate()} disabled={saveCampaign.isPending}>
          <Settings size={16} />
        </IconButton>
        {notice ? <EventLine $muted>{notice}</EventLine> : null}
      </HeaderLine>
      <RailList>
        {(adminQuery.data?.records || []).slice(0, 5).map((record) => (
          <li key={record.id}>
            <RailPill>{record.kind}:{record.key} v{record.version}</RailPill>
          </li>
        ))}
      </RailList>
    </AdminPanel>
  );
}

export function DedRoomsApp() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresencePeer[]>([]);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const stateQuery = useQuery<DedRoomsState>({
    queryKey: ["dedrooms", "state"],
    queryFn: () => api.get<DedRoomsState>("/api/dedrooms/state"),
    refetchInterval: 45_000,
  });

  const state = stateQuery.data;

  const commandMutation = useMutation({
    mutationFn: (command: string) => api.post<CommandResponse>("/api/dedrooms/command", { input: command }),
    onSuccess: (response) => {
      setError(null);
      queryClient.setQueryData(["dedrooms", "state"], response.state);
    },
    onError: (err: Error) => setError(err.message),
  });

  useEffect(() => {
    const roomId = state?.player?.locationId;
    if (!roomId || state.departed) return;
    const socket = new WebSocket(wsUrl("/ws/dedrooms"));
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "ded_rooms_join", locationId: roomId }));
    });
    socket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as any;
        if (msg.type === "ded_rooms_presence_snapshot") {
          setPresence(Array.isArray(msg.peers) ? msg.peers : []);
        }
        if (msg.type === "ded_rooms_peer_joined" && msg.peer) {
          setPresence((current) => {
            if (current.some((peer) => peer.userId === msg.peer.userId)) return current;
            return [...current, msg.peer];
          });
        }
        if (msg.type === "ded_rooms_peer_left" && msg.peer) {
          setPresence((current) => current.filter((peer) => peer.userId !== msg.peer.userId));
        }
        if (msg.type === "ded_rooms_event") {
          void queryClient.invalidateQueries({ queryKey: ["dedrooms", "state"] });
        }
      } catch {
        setError("Realtime message failed to parse.");
      }
    });
    socket.addEventListener("error", () => setError("Realtime presence disconnected."));
    return () => {
      try {
        socket.send(JSON.stringify({ type: "ded_rooms_leave" }));
      } catch {
        // Socket may already be closing.
      }
      socket.close();
    };
  }, [queryClient, state?.departed, state?.player?.locationId]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [state?.transcript?.length, state?.room?.id]);

  const transcript = useMemo(() => state?.transcript || [], [state?.transcript]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;
    setInput("");
    commandMutation.mutate(command);
  }

  if (stateQuery.isLoading) {
    return <Departed>...</Departed>;
  }

  if (state?.departed) {
    return <Departed>You have departed from this world.</Departed>;
  }

  return (
    <Container data-dedrooms-shell>
      <Transcript ref={transcriptRef}>
        <HeaderLine>
          <RoomTitle>{state?.room?.title || "DedRooms"}</RoomTitle>
          <Region>{state?.room?.region || state?.campaign?.mode || ""}</Region>
        </HeaderLine>
        <RoomDescription>{state?.room?.description || "The room is loading its alibi."}</RoomDescription>
        {transcript.map((event) => (
          <EventLine key={`${event.id}:${event.createdAt}`} $muted={event.visibility !== "private"}>
            [{shortEventLabel(event.eventType)}] {event.message}
          </EventLine>
        ))}
        {error ? <EventLine $muted>[error] {error}</EventLine> : null}
        <AdminEditor enabled={Boolean(state?.isAdmin)} />
      </Transcript>

      <StatusRail>
        <RailSection>
          <RailTitle>State</RailTitle>
          <RailList>
            <li><RailPill>{state?.campaign?.mode || "active"}</RailPill></li>
            <li><RailPill>@ {coordLabel(state?.player?.coordinate || state?.map?.currentCoordinate)}</RailPill></li>
            <li><RailPill>{state?.campaign?.departureCount || 0}/{state?.campaign?.targetDepartures || 0} departed</RailPill></li>
            <li><RailPill>{state?.player?.attuned ? "attuned" : "unaligned"}</RailPill></li>
            <li><RailPill>{state?.campaign?.progress?.sharedUnlocked ? "shared lock open" : "shared lock closed"}</RailPill></li>
            <li><RailPill>{state?.map?.greenRoomPlaced ? "green room placed" : "green room absent"}</RailPill></li>
          </RailList>
        </RailSection>
        <RailSection>
          <RailTitle>Sheet</RailTitle>
          <RailList>
            <li><RailPill>level {state?.player?.sheet?.level || 1}</RailPill></li>
            {Object.entries(state?.player?.sheet?.skills || {}).slice(0, 5).map(([skill, value]) => (
              <li key={skill}><RailPill>{skill} +{value}</RailPill></li>
            ))}
          </RailList>
        </RailSection>
        <RailSection>
          <RailTitle>Here</RailTitle>
          <RailList>
            {(state?.npcs || []).map((npc) => <li key={npc.key}><RailPill>{npc.name}</RailPill></li>)}
            {(state?.nearby || []).map((player) => <li key={player.userId}><RailPill>@{player.username} {player.mark}</RailPill></li>)}
            {presence.map((peer) => <li key={`peer-${peer.userId}`}><RailPill>@{peer.username}</RailPill></li>)}
          </RailList>
        </RailSection>
        <RailSection>
          <RailTitle>Carry</RailTitle>
          <RailList>
            <li><RailPill>{state?.player?.inventoryWeight || 0}/{state?.player?.weightLimit || 0} wt</RailPill></li>
            {(state?.inventory || []).slice(0, 8).map((stack) => (
              <li key={`${stack.itemKey}-${stack.tier}`}>
                <RailPill>{stack.quantity}x t{stack.tier} {stack.label}</RailPill>
              </li>
            ))}
          </RailList>
        </RailSection>
        <RailSection>
          <RailTitle>Room</RailTitle>
          <RailList>
            {(state?.doors || state?.room?.doors || []).slice(0, 8).map((door) => (
              <li key={door.key}><RailPill>{door.key}{door.resolvedToRoomId ? " linked" : ""}</RailPill></li>
            ))}
            {(state?.resources || []).map((resource) => <li key={resource.key}><RailPill>{resource.label}</RailPill></li>)}
            {(state?.minigames || []).map((game) => <li key={game.key}><RailPill>{game.title}</RailPill></li>)}
          </RailList>
        </RailSection>
        <RailSection>
          <RailTitle>World</RailTitle>
          <RailList>
            <li><RailPill>{state?.map?.placedCount || 0} placed</RailPill></li>
            <li><RailPill>{state?.map?.deckRemaining || 0} unplaced</RailPill></li>
            <li><RailPill>{(state?.map?.anchors || []).filter((anchor) => anchor.discovered).length}/{state?.map?.anchors?.length || 0} anchors known</RailPill></li>
            <li><RailPill>{state?.seedSummary?.roomCount || 0} rooms</RailPill></li>
            <li><RailPill>{state?.seedSummary?.npcCount || 0} NPCs</RailPill></li>
            <li><RailPill>{state?.seedSummary?.puzzleHookCount || 0} hooks</RailPill></li>
            <li><RailPill>{state?.seedSummary?.minigameCount || 0} games</RailPill></li>
          </RailList>
        </RailSection>
      </StatusRail>

      <PromptBar onSubmit={submit}>
        <PromptMark>&gt;</PromptMark>
        <CommandInput value={input} onChange={(event) => setInput(event.target.value)} autoComplete="off" spellCheck={false} aria-label="DedRooms command" />
        <IconButton type="submit" title="Send command" disabled={commandMutation.isPending}>
          <Send size={16} />
        </IconButton>
        <IconButton type="button" title="Refresh" onClick={() => void stateQuery.refetch()}>
          {state?.room?.id === "green_room_threshold" ? <DoorOpen size={16} /> : <RefreshCw size={16} />}
        </IconButton>
      </PromptBar>
    </Container>
  );
}
