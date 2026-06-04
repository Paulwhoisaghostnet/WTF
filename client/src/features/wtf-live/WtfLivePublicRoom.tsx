import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Copy, Mic, MonitorUp, Paperclip, Radio, Send, Square, Wifi, WifiOff } from "lucide-react";
import styled from "styled-components";
import { Button, Hourglass, TextField } from "react95";
import { api } from "../../lib/api";

type PublicRoom = {
  id: string;
  title: string;
  kind: "room";
  description?: string;
  source?: "system" | "user";
  ownerUserId?: number | null;
  isPublic?: boolean;
};

type PublicRoomResponse = {
  room: PublicRoom;
  joinMode: "guest_room_only";
  roomPath: string;
  capabilities?: {
    audio?: boolean;
    camera?: boolean;
    screen?: boolean;
    media?: boolean;
    transport?: string;
  };
};

type RoomMessage = {
  uri: string;
  text: string;
  createdAt: string | null;
  author?: { handle?: string; displayName?: string | null };
};

type LiveMediaState = {
  mic: boolean;
  camera: boolean;
  screen: boolean;
};

type LivePeer = {
  peerId: string;
  guestName: string;
  mediaState: LiveMediaState;
  stream: MediaStream;
  connected: boolean;
};

type LiveChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  dataUrl: string;
  sizeBytes: number;
};

type LiveChatMessage = {
  id: string;
  peerId: string;
  guestName: string;
  text: string;
  attachments: LiveChatAttachment[];
  createdAt: string;
};

type WtfLiveSocketEvent = {
  type?: string;
  peerId?: string;
  fromPeerId?: string;
  guestName?: string;
  roomId?: string;
  peers?: Array<{ peerId?: string; guestName?: string; mediaState?: Partial<LiveMediaState> }>;
  peer?: { peerId?: string; guestName?: string; mediaState?: Partial<LiveMediaState> };
  mediaState?: Partial<LiveMediaState>;
  signal?: {
    kind?: "description" | "candidate";
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
  message?: LiveChatMessage | string;
  error?: string;
  messageText?: string;
};

const LIVE_CHAT_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "video/mp4"]);
const MAX_LIVE_CHAT_ATTACHMENTS = 4;
const MAX_LIVE_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

const GuestShell = styled.main`
  min-height: 100vh;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
    linear-gradient(180deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
    #087f7b;
  background-size: 18px 18px;
  color: #07120f;
  display: grid;
  place-items: stretch;
  padding: clamp(10px, 2vw, 22px);
  box-sizing: border-box;
`;

const RoomFrame = styled.section`
  width: min(1120px, 100%);
  min-height: calc(100vh - clamp(20px, 4vw, 44px));
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto 1fr;
  border: 2px outset #fff;
  background: #e9e9e9;
  box-shadow: 10px 12px 0 rgba(0, 0, 0, 0.42);
`;

const TitleBar = styled.header`
  background: linear-gradient(90deg, #090980, #2f3192);
  color: #fff;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 10px;
  font-weight: 700;
`;

const RoomBody = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  min-height: 0;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.section`
  border: 2px inset #fff;
  background: #f7f7f7;
  padding: 10px;
  display: grid;
  gap: 10px;
  align-content: start;
`;

const RoomHeader = styled.div`
  display: grid;
  gap: 6px;
  background: #072c4f;
  color: #fff;
  padding: 14px;
  border: 2px inset #fff;

  h1 {
    margin: 0;
    font-size: clamp(26px, 5vw, 46px);
    letter-spacing: 0;
    line-height: 1;
  }

  p {
    margin: 0;
    max-width: 68ch;
    color: #dff7ff;
  }
`;

const GuestGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ControlButton = styled(Button)<{ $active?: boolean }>`
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: ${({ $active }) => ($active ? "#dff7e8" : undefined)};

  svg {
    width: 17px;
    height: 17px;
  }
`;

const ButtonLabel = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
`;

const MicMeter = styled.div`
  border: 2px inset #fff;
  background: #ffffff;
  padding: 7px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
`;

const MicMeterTrack = styled.div`
  height: 12px;
  border: 1px solid #202020;
  background: #d5d5d5;
  overflow: hidden;
`;

const MicMeterFill = styled.div<{ $level: number }>`
  width: ${({ $level }) => `${Math.round(Math.max(0, Math.min(1, $level)) * 100)}%`};
  height: 100%;
  background: ${({ $level }) => ($level > 0.18 ? "#06893d" : $level > 0.06 ? "#c8a600" : "#9aa0a6")};
  transition: width 80ms linear;
`;

const StatusLine = styled.div`
  min-height: 20px;
  font-size: 12px;
  color: #14312e;
`;

const PreviewGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

const PreviewBox = styled.div`
  border: 2px inset #fff;
  min-height: 150px;
  background: #080808;
  color: #f3f3f3;
  display: grid;
  place-items: center;
  overflow: hidden;
`;

const PreviewVideo = styled.video`
  width: 100%;
  height: 100%;
  min-height: 150px;
  object-fit: contain;
  background: #050505;
`;

const LiveSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
`;

const RemoteGrid = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
`;

const PeerTile = styled.article`
  border: 2px inset #fff;
  background: #111;
  color: #f5f5f5;
  display: grid;
  gap: 6px;
  min-height: 190px;
  padding: 6px;
`;

const PeerVideoFrame = styled.div`
  min-height: 150px;
  display: grid;
  place-items: center;
  background: #050505;
  overflow: hidden;
`;

const PeerMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
`;

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const MediaPill = styled.span<{ $active?: boolean }>`
  border: 1px solid ${({ $active }) => ($active ? "#85ffc2" : "#555")};
  background: ${({ $active }) => ($active ? "#123d28" : "#2b2b2b")};
  color: ${({ $active }) => ($active ? "#dfffe9" : "#cfcfcf")};
  padding: 2px 5px;
  font-size: 10px;
  text-transform: uppercase;
`;

const MessageList = styled.div`
  border: 2px inset #fff;
  background: #fff;
  min-height: 220px;
  max-height: min(52vh, 540px);
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 8px;
`;

const MessageItem = styled.article`
  border-bottom: 1px solid #d9d9d9;
  display: grid;
  gap: 3px;
  padding: 0 0 7px;
  font-size: 13px;

  strong {
    color: #090980;
  }
`;

const MessageDivider = styled.div`
  color: #4f4f4f;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const ChatComposer = styled.div`
  border: 2px inset #fff;
  background: #ececec;
  padding: 8px;
  display: grid;
  gap: 7px;
`;

const ChatTextArea = styled.textarea`
  width: 100%;
  min-height: 74px;
  border: 2px inset #fff;
  padding: 7px;
  font: inherit;
  box-sizing: border-box;
  resize: vertical;
`;

const AttachmentStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
`;

const AttachmentPreview = styled.div`
  border: 2px inset #fff;
  background: #fff;
  padding: 5px;
  display: grid;
  gap: 4px;
  font-size: 11px;
  min-width: 0;

  img,
  video {
    width: 100%;
    max-height: 110px;
    object-fit: contain;
    background: #050505;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function useVideoStream(ref: RefObject<HTMLVideoElement | null>, stream: MediaStream | null, signature = "") {
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play?.().catch(() => undefined);
  }, [ref, stream, signature]);
}

function liveSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/wtf-live`;
}

function mediaStateFromStreams(streams: {
  micStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
}): LiveMediaState {
  return {
    mic: Boolean(streams.micStream?.getAudioTracks().some((track) => track.readyState === "live")),
    camera: Boolean(streams.cameraStream?.getVideoTracks().some((track) => track.readyState === "live")),
    screen: Boolean(streams.screenStream?.getVideoTracks().some((track) => track.readyState === "live")),
  };
}

function normalizeMediaState(value: Partial<LiveMediaState> | undefined): LiveMediaState {
  return {
    mic: Boolean(value?.mic),
    camera: Boolean(value?.camera),
    screen: Boolean(value?.screen),
  };
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readAttachment(file: File): Promise<LiveChatAttachment> {
  return new Promise((resolve, reject) => {
    if (!LIVE_CHAT_MEDIA_TYPES.has(file.type)) {
      reject(new Error("Unsupported media type."));
      return;
    }
    if (file.size > MAX_LIVE_CHAT_ATTACHMENT_BYTES) {
      reject(new Error("Media file is larger than 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read media file."));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith(`data:${file.type};base64,`)) {
        reject(new Error("Unsupported media encoding."));
        return;
      }
      resolve({
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type,
        kind: file.type.startsWith("video/") ? "video" : "image",
        dataUrl,
        sizeBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

function RemotePeerTile({ peer }: { peer: LivePeer }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamSignature = peer.stream
    .getTracks()
    .map((track) => `${track.kind}:${track.id}:${track.readyState}`)
    .join("|");
  useVideoStream(videoRef, peer.stream, streamSignature);
  const hasVideo = peer.stream.getVideoTracks().some((track) => track.readyState === "live");
  const hasAudio = peer.stream.getAudioTracks().some((track) => track.readyState === "live");
  return (
    <PeerTile data-wtf-live-remote-peer={peer.peerId}>
      <PeerMeta>
        <strong>{peer.guestName}</strong>
        <span>{peer.connected ? "Connected" : "Connecting"}</span>
      </PeerMeta>
      <PeerVideoFrame>
        {hasVideo || hasAudio ? (
          <PreviewVideo
            ref={videoRef}
            data-wtf-live-remote-video={peer.peerId}
            autoPlay
            playsInline
          />
        ) : (
          <span>No media yet</span>
        )}
      </PeerVideoFrame>
      <PillRow>
        <MediaPill $active={peer.mediaState.mic}>Mic</MediaPill>
        <MediaPill $active={peer.mediaState.camera}>Camera</MediaPill>
        <MediaPill $active={peer.mediaState.screen}>Screen</MediaPill>
      </PillRow>
    </PeerTile>
  );
}

export function WtfLivePublicRoom({ roomId }: { roomId: string }) {
  const roomQuery = useQuery<PublicRoomResponse>({
    queryKey: ["wtf-live", "public-room", roomId],
    queryFn: () => api.get(`/api/wtf-live/public/rooms/${encodeURIComponent(roomId)}`),
  });
  const messagesQuery = useQuery<{ messages: RoomMessage[] }>({
    queryKey: ["wtf-live", "public-room", roomId, "messages"],
    queryFn: () => api.get(`/api/wtf-live/public/rooms/${encodeURIComponent(roomId)}/messages`),
  });

  const [guestName, setGuestName] = useState(() => localStorage.getItem("wtf-live:guest-name") || "");
  const [joined, setJoined] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<LivePeer[]>([]);
  const [liveMessages, setLiveMessages] = useState<LiveChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatAttachments, setChatAttachments] = useState<LiveChatAttachment[]>([]);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const screenRef = useRef<HTMLVideoElement | null>(null);
  const micAnimationRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const selfPeerIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMediaStateRef = useRef<LiveMediaState>({ mic: false, camera: false, screen: false });
  const localStreamsRef = useRef({ micStream: null as MediaStream | null, cameraStream: null as MediaStream | null, screenStream: null as MediaStream | null });
  const room = roomQuery.data?.room;
  const roomUrl = useMemo(() => {
    if (typeof window === "undefined") return `/live/r/${roomId}`;
    return `${window.location.origin}/live/r/${roomId}`;
  }, [roomId]);

  useVideoStream(cameraRef, cameraStream);
  useVideoStream(screenRef, screenStream);

  useEffect(() => {
    localStreamsRef.current = { micStream, cameraStream, screenStream };
  }, [cameraStream, micStream, screenStream]);

  useEffect(() => () => {
    socketRef.current?.close();
    socketRef.current = null;
    for (const connection of peerConnectionsRef.current.values()) connection.close();
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    stopStream(localStreamsRef.current.micStream);
    stopStream(localStreamsRef.current.cameraStream);
    stopStream(localStreamsRef.current.screenStream);
  }, []);

  useEffect(() => {
    if (!micStream) {
      setMicLevel(0);
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setMicLevel(0);
      setStatus("Mic ready. Level meter is not supported in this browser.");
      return;
    }

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(micStream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    audioContext.resume().catch(() => undefined);

    const readLevel = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / samples.length);
      const nextLevel = Math.min(1, rms * 5);
      setMicLevel((current) => (Math.abs(current - nextLevel) > 0.015 ? nextLevel : current));
      micAnimationRef.current = requestAnimationFrame(readLevel);
    };

    readLevel();

    return () => {
      if (micAnimationRef.current !== null) cancelAnimationFrame(micAnimationRef.current);
      micAnimationRef.current = null;
      source.disconnect();
      audioContext.close().catch(() => undefined);
      setMicLevel(0);
    };
  }, [micStream]);

  function sendRoomSocket(payload: Record<string, unknown>) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function currentMediaState() {
    return mediaStateFromStreams(localStreamsRef.current);
  }

  function hasAnyMedia(state: LiveMediaState) {
    return state.mic || state.camera || state.screen;
  }

  function upsertRemotePeer(next: {
    peerId: string;
    guestName?: string;
    mediaState?: Partial<LiveMediaState>;
    stream?: MediaStream;
    connected?: boolean;
  }) {
    if (!next.peerId || next.peerId === selfPeerIdRef.current) return;
    const stream = next.stream ?? remoteStreamsRef.current.get(next.peerId) ?? new MediaStream();
    remoteStreamsRef.current.set(next.peerId, stream);
    setRemotePeers((current) => {
      const existing = current.find((peer) => peer.peerId === next.peerId);
      const updated: LivePeer = {
        peerId: next.peerId,
        guestName: next.guestName || existing?.guestName || "guest",
        mediaState: normalizeMediaState(next.mediaState ?? existing?.mediaState),
        stream,
        connected: next.connected ?? existing?.connected ?? false,
      };
      const others = current.filter((peer) => peer.peerId !== next.peerId);
      return [...others, updated].sort((a, b) => a.guestName.localeCompare(b.guestName));
    });
  }

  function removeRemotePeer(remotePeerId: string) {
    peerConnectionsRef.current.get(remotePeerId)?.close();
    peerConnectionsRef.current.delete(remotePeerId);
    remoteStreamsRef.current.delete(remotePeerId);
    setRemotePeers((current) => current.filter((peer) => peer.peerId !== remotePeerId));
  }

  async function syncLocalTracks(connection: RTCPeerConnection) {
    const desiredTracks = new Map<string, { track: MediaStreamTrack; stream: MediaStream }>();
    const addStreamTracks = (stream: MediaStream | null) => {
      stream?.getTracks()
        .filter((track) => track.readyState === "live")
        .forEach((track) => desiredTracks.set(track.id, { track, stream }));
    };
    addStreamTracks(localStreamsRef.current.micStream);
    addStreamTracks(localStreamsRef.current.cameraStream);
    addStreamTracks(localStreamsRef.current.screenStream);

    for (const transceiver of connection.getTransceivers()) {
      const sender = transceiver.sender;
      if (sender.track && !desiredTracks.has(sender.track.id)) {
        await sender.replaceTrack(null);
        if (transceiver.direction === "sendrecv") transceiver.direction = "recvonly";
        if (transceiver.direction === "sendonly") transceiver.direction = "inactive";
      }
    }
    const activeTrackIds = new Set(
      connection.getSenders()
        .map((sender) => sender.track?.id)
        .filter((trackId): trackId is string => Boolean(trackId)),
    );
    for (const { track, stream } of desiredTracks.values()) {
      if (activeTrackIds.has(track.id)) continue;
      const reusable = connection
        .getTransceivers()
        .find((transceiver) =>
          transceiver.receiver.track.kind === track.kind &&
          !transceiver.sender.track &&
          transceiver.direction !== "stopped"
        );
      if (reusable) {
        await reusable.sender.replaceTrack(track);
        if (reusable.direction === "recvonly") reusable.direction = "sendrecv";
        if (reusable.direction === "inactive") reusable.direction = "sendonly";
        continue;
      }
      connection.addTrack(track, stream);
    }
  }

  function sendSignal(toPeerId: string, signal: WtfLiveSocketEvent["signal"]) {
    sendRoomSocket({ type: "wtf_live_signal", toPeerId, signal });
  }

  function ensurePeerConnection(remotePeerId: string) {
    const existing = peerConnectionsRef.current.get(remotePeerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
    peerConnectionsRef.current.set(remotePeerId, connection);
    try {
      connection.addTransceiver("audio", { direction: "recvonly" });
      connection.addTransceiver("video", { direction: "recvonly" });
      connection.addTransceiver("video", { direction: "recvonly" });
    } catch {
      // Older browser builds may not expose transceivers, but addTrack still works for local senders.
    }
    const remoteStream = remoteStreamsRef.current.get(remotePeerId) ?? new MediaStream();
    remoteStreamsRef.current.set(remotePeerId, remoteStream);
    upsertRemotePeer({ peerId: remotePeerId, stream: remoteStream });

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(remotePeerId, {
        kind: "candidate",
        candidate: event.candidate.toJSON(),
      });
    };
    connection.ontrack = (event) => {
      const stream = remoteStreamsRef.current.get(remotePeerId) ?? new MediaStream();
      const tracks = event.streams.length ? event.streams.flatMap((item) => item.getTracks()) : [event.track];
      for (const track of tracks) {
        if (!stream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          stream.addTrack(track);
        }
      }
      remoteStreamsRef.current.set(remotePeerId, stream);
      upsertRemotePeer({ peerId: remotePeerId, stream, connected: true });
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        upsertRemotePeer({ peerId: remotePeerId, connected: false });
        return;
      }
      upsertRemotePeer({ peerId: remotePeerId, connected: connection.connectionState === "connected" });
    };
    void syncLocalTracks(connection);
    return connection;
  }

  async function createOfferForPeer(remotePeerId: string) {
    const connection = ensurePeerConnection(remotePeerId);
    await syncLocalTracks(connection);
    if (connection.signalingState !== "stable") return;
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      sendSignal(remotePeerId, {
        kind: "description",
        description: connection.localDescription?.toJSON() ?? offer,
      });
    } catch {
      setStatus("Could not start media negotiation with a room peer.");
    }
  }

  async function renegotiateAllPeers() {
    for (const [remotePeerId, connection] of peerConnectionsRef.current) {
      await syncLocalTracks(connection);
      await createOfferForPeer(remotePeerId);
    }
  }

  async function handleSignal(fromPeerId: string | undefined, signal: WtfLiveSocketEvent["signal"]) {
    if (!fromPeerId || !signal) return;
    const connection = ensurePeerConnection(fromPeerId);
    try {
      if (signal.kind === "description" && signal.description) {
        const description = signal.description;
        if (description.type === "offer") {
          await connection.setRemoteDescription(description);
          if (connection.signalingState !== "have-remote-offer") return;
          await syncLocalTracks(connection);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          sendSignal(fromPeerId, {
            kind: "description",
            description: connection.localDescription?.toJSON() ?? answer,
          });
          return;
        }
        if (description.type === "answer" && connection.signalingState !== "stable") {
          await connection.setRemoteDescription(description);
        }
        return;
      }
      if (signal.kind === "candidate" && signal.candidate) {
        await connection.addIceCandidate(signal.candidate);
      }
    } catch {
      setStatus("Room media negotiation hit a peer connection error.");
    }
  }

  function handleSocketEvent(event: WtfLiveSocketEvent) {
    if (event.type === "wtf_live_connected" && event.peerId) {
      selfPeerIdRef.current = event.peerId;
      setPeerId(event.peerId);
      return;
    }

    if (event.type === "wtf_live_room_snapshot") {
      if (event.peerId) {
        selfPeerIdRef.current = event.peerId;
        setPeerId(event.peerId);
      }
      const peers = event.peers ?? [];
      peers.forEach((peer) => {
        if (!peer.peerId) return;
        ensurePeerConnection(peer.peerId);
        upsertRemotePeer({
          peerId: peer.peerId,
          guestName: peer.guestName,
        mediaState: peer.mediaState,
      });
        if (hasAnyMedia(currentMediaState())) void createOfferForPeer(peer.peerId);
      });
      setSocketReady(true);
      setJoined(true);
      setStatus(peers.length ? `Connected with ${peers.length} room peer${peers.length === 1 ? "" : "s"}.` : "Connected. Waiting for room peers.");
      return;
    }

    if (event.type === "wtf_live_peer_joined" && event.peer?.peerId) {
      ensurePeerConnection(event.peer.peerId);
      upsertRemotePeer({
        peerId: event.peer.peerId,
        guestName: event.peer.guestName,
        mediaState: event.peer.mediaState,
      });
      if (hasAnyMedia(currentMediaState())) void createOfferForPeer(event.peer.peerId);
      return;
    }

    if (event.type === "wtf_live_peer_left" && event.peerId) {
      removeRemotePeer(event.peerId);
      return;
    }

    if (event.type === "wtf_live_media_state" && event.peerId) {
      upsertRemotePeer({
        peerId: event.peerId,
        guestName: event.guestName,
        mediaState: event.mediaState,
      });
      return;
    }

    if (event.type === "wtf_live_signal") {
      void handleSignal(event.fromPeerId, event.signal);
      return;
    }

    if (event.type === "wtf_live_chat_message" && typeof event.message === "object" && event.message) {
      const liveMessage = event.message as LiveChatMessage;
      setLiveMessages((current) => {
        if (current.some((message) => message.id === liveMessage.id)) return current;
        return [...current, liveMessage].slice(-120);
      });
      return;
    }

    if (event.type === "error") {
      setStatus(event.messageText || (typeof event.message === "string" ? event.message : "WTF LIVE room error."));
    }
  }

  function connectRoomSocket(name: string) {
    socketRef.current?.close();
    for (const connection of peerConnectionsRef.current.values()) connection.close();
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    lastMediaStateRef.current = { mic: false, camera: false, screen: false };
    setRemotePeers([]);
    setSocketReady(false);

    const socket = new WebSocket(liveSocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      sendRoomSocket({
        type: "wtf_live_join_room",
        roomId,
        guestName: name,
        mediaState: currentMediaState(),
      });
    };
    socket.onmessage = (rawEvent) => {
      try {
        handleSocketEvent(JSON.parse(String(rawEvent.data)) as WtfLiveSocketEvent);
      } catch {
        setStatus("Received an unreadable room event.");
      }
    };
    socket.onerror = () => {
      setStatus("Room connection failed.");
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      setSocketReady(false);
      setJoined(false);
      setStatus("Room connection closed.");
    };
  }

  function publishMediaState() {
    sendRoomSocket({
      type: "wtf_live_media_state",
      mediaState: currentMediaState(),
    });
  }

  useEffect(() => {
    if (!joined || !socketReady) return;
    const previousMediaState = lastMediaStateRef.current;
    const nextMediaState = currentMediaState();
    publishMediaState();
    if (hasAnyMedia(previousMediaState) || hasAnyMedia(nextMediaState)) {
      void renegotiateAllPeers();
    }
    lastMediaStateRef.current = nextMediaState;
  }, [joined, socketReady, micStream, cameraStream, screenStream]);

  async function copyRoomUrl() {
    await navigator.clipboard?.writeText(roomUrl);
    setStatus("Room URL copied.");
  }

  function joinRoom() {
    const name = guestName.trim() || "guest";
    localStorage.setItem("wtf-live:guest-name", name);
    setGuestName(name);
    setJoined(true);
    setStatus(`Connecting as ${name}...`);
    connectRoomSocket(name);
  }

  async function toggleMic() {
    if (micStream) {
      stopStream(micStream);
      setMicStream(null);
      setStatus("Mic off.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setStatus("Mic ready.");
    } catch {
      setStatus("Mic permission was blocked.");
    }
  }

  async function toggleCamera() {
    if (cameraStream) {
      stopStream(cameraStream);
      setCameraStream(null);
      setStatus("Camera off.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraStream(stream);
      setStatus("Camera ready.");
    } catch {
      setStatus("Camera permission was blocked.");
    }
  }

  async function toggleScreen() {
    if (screenStream) {
      stopStream(screenStream);
      setScreenStream(null);
      setStatus("Screen share off.");
      return;
    }
    const getDisplayMedia = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
    if (!getDisplayMedia) {
      setStatus("Screen share is not available in this browser.");
      return;
    }
    try {
      const stream = await getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenStream(null);
        setStatus("Screen share ended.");
      });
      setScreenStream(stream);
      setStatus("Screen share ready.");
    } catch {
      setStatus("Screen share was cancelled.");
    }
  }

  async function handleAttachmentInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const slots = MAX_LIVE_CHAT_ATTACHMENTS - chatAttachments.length;
    if (slots <= 0) {
      setStatus("Remove a media item before attaching another.");
      return;
    }
    try {
      const attachments = await Promise.all(files.slice(0, slots).map((file) => readAttachment(file)));
      setChatAttachments((current) => [...current, ...attachments].slice(0, MAX_LIVE_CHAT_ATTACHMENTS));
      setStatus("Media attached.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not attach media.");
    }
  }

  function removeAttachment(attachmentId: string) {
    setChatAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function sendLiveChat() {
    const text = chatText.trim();
    if (!text && chatAttachments.length === 0) {
      setStatus("Type a message or attach media first.");
      return;
    }
    if (!socketReady || !sendRoomSocket({ type: "wtf_live_chat_message", text, attachments: chatAttachments })) {
      setStatus("Room chat is not connected.");
      return;
    }
    setChatText("");
    setChatAttachments([]);
  }

  if (roomQuery.isLoading) {
    return (
      <GuestShell>
        <RoomFrame>
          <TitleBar>WTF LIVE</TitleBar>
          <Panel style={{ margin: 10, placeItems: "center" }}>
            <Hourglass size={32} />
          </Panel>
        </RoomFrame>
      </GuestShell>
    );
  }

  if (!room) {
    return (
      <GuestShell>
        <RoomFrame>
          <TitleBar>WTF LIVE</TitleBar>
          <Panel style={{ margin: 10 }}>
            <strong>Room not found.</strong>
            <span>This room link is no longer available.</span>
          </Panel>
        </RoomFrame>
      </GuestShell>
    );
  }

  const messages = messagesQuery.data?.messages ?? [];
  const canSendChat = joined && socketReady && (Boolean(chatText.trim()) || chatAttachments.length > 0);

  return (
    <GuestShell>
      <RoomFrame>
        <TitleBar>
          <span>WTF LIVE</span>
          <span>
            {socketReady ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} aria-hidden />}{" "}
            {joined ? (socketReady ? "LIVE ROOM" : "CONNECTING") : "PUBLIC ROOM"}
          </span>
        </TitleBar>
        <RoomBody>
          <Panel>
            <RoomHeader>
              <span><Radio size={16} aria-hidden /> PUBLIC ROOM</span>
              <h1>{room.title}</h1>
              {room.description ? <p>{room.description}</p> : null}
            </RoomHeader>
            <TextField
              value={guestName}
              placeholder="Display name"
              fullWidth
              disabled={joined}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setGuestName(event.target.value)}
            />
            <GuestGrid>
              <Button primary disabled={joined} onClick={joinRoom} data-wtf-live-join-room>
                {joined ? "Joined" : "Join Room"}
              </Button>
              <Button onClick={copyRoomUrl}>
                <ButtonLabel><Copy size={16} aria-hidden /> Copy URL</ButtonLabel>
              </Button>
            </GuestGrid>
            <GuestGrid>
              <ControlButton disabled={!joined || !socketReady} $active={Boolean(micStream)} onClick={toggleMic}>
                {micStream ? <Square aria-hidden /> : <Mic aria-hidden />} Mic
              </ControlButton>
              <ControlButton disabled={!joined || !socketReady} $active={Boolean(cameraStream)} onClick={toggleCamera}>
                {cameraStream ? <Square aria-hidden /> : <Camera aria-hidden />} Camera
              </ControlButton>
              <ControlButton disabled={!joined || !socketReady} $active={Boolean(screenStream)} onClick={toggleScreen}>
                {screenStream ? <Square aria-hidden /> : <MonitorUp aria-hidden />} Screen
              </ControlButton>
            </GuestGrid>
            {joined ? (
              <MicMeter aria-label={`Mic level ${Math.round(micLevel * 100)} percent`}>
                <span>Mic check</span>
                <MicMeterTrack>
                  <MicMeterFill $level={micStream ? micLevel : 0} />
                </MicMeterTrack>
                <span>{micStream ? (micLevel > 0.04 ? "Signal" : "Quiet") : "Off"}</span>
              </MicMeter>
            ) : null}
            <StatusLine aria-live="polite">{status}</StatusLine>
          </Panel>

          <Panel>
            <LiveSectionHeader>
              <span>People in room</span>
              <span>{remotePeers.length ? `${remotePeers.length} remote` : "waiting"}</span>
            </LiveSectionHeader>
            <RemoteGrid data-wtf-live-remote-grid>
              {remotePeers.length ? remotePeers.map((peer) => <RemotePeerTile key={peer.peerId} peer={peer} />) : (
                <PeerTile>
                  <PeerVideoFrame><span>No other participants yet</span></PeerVideoFrame>
                  <PeerMeta><strong>Room</strong><span>{socketReady ? "Connected" : "Offline"}</span></PeerMeta>
                </PeerTile>
              )}
            </RemoteGrid>
            <LiveSectionHeader>
              <span>Local preview</span>
              <span>{peerId ? peerId.slice(0, 12) : "not joined"}</span>
            </LiveSectionHeader>
            <PreviewGrid>
              <PreviewBox>
                {cameraStream ? <PreviewVideo ref={cameraRef} muted autoPlay playsInline /> : <span>Camera preview</span>}
              </PreviewBox>
              <PreviewBox>
                {screenStream ? <PreviewVideo ref={screenRef} muted autoPlay playsInline /> : <span>Screen preview</span>}
              </PreviewBox>
            </PreviewGrid>
            <MessageList aria-label="WTF LIVE room chat" data-wtf-live-chat-log>
              {messagesQuery.isLoading ? <Hourglass size={24} /> : null}
              {liveMessages.map((message) => (
                <MessageItem key={message.id} data-wtf-live-chat-message={message.id}>
                  <strong>{message.guestName}</strong>
                  <span>{formatDate(message.createdAt)}</span>
                  {message.text ? <div>{message.text}</div> : null}
                  {message.attachments.length ? (
                    <AttachmentStrip>
                      {message.attachments.map((attachment) => (
                        <AttachmentPreview key={attachment.id}>
                          {attachment.kind === "video" ? (
                            <video src={attachment.dataUrl} controls playsInline />
                          ) : (
                            <img src={attachment.dataUrl} alt={attachment.name} />
                          )}
                          <span>{attachment.name} {formatFileSize(attachment.sizeBytes)}</span>
                        </AttachmentPreview>
                      ))}
                    </AttachmentStrip>
                  ) : null}
                </MessageItem>
              ))}
              {messages.length ? <MessageDivider>Public AT room notes</MessageDivider> : null}
              {messages.length ? (
                [...messages].reverse().map((message) => (
                  <MessageItem key={message.uri}>
                    <strong>{message.author?.displayName || message.author?.handle || "host"}</strong>
                    {formatDate(message.createdAt) ? <span>{formatDate(message.createdAt)}</span> : null}
                    <div>{message.text}</div>
                  </MessageItem>
                ))
              ) : null}
              {!liveMessages.length && !messages.length ? <span>No room chat yet.</span> : null}
            </MessageList>
            <ChatComposer>
              <ChatTextArea
                data-wtf-live-chat-text
                disabled={!joined || !socketReady}
                value={chatText}
                maxLength={1200}
                placeholder={socketReady ? "Type in the room" : "Join the room to chat"}
                onChange={(event) => setChatText(event.target.value)}
              />
              {chatAttachments.length ? (
                <AttachmentStrip>
                  {chatAttachments.map((attachment) => (
                    <AttachmentPreview key={attachment.id}>
                      {attachment.kind === "video" ? (
                        <video src={attachment.dataUrl} controls playsInline />
                      ) : (
                        <img src={attachment.dataUrl} alt={attachment.name} />
                      )}
                      <span>{attachment.name} {formatFileSize(attachment.sizeBytes)}</span>
                      <Button onClick={() => removeAttachment(attachment.id)}>Remove</Button>
                    </AttachmentPreview>
                  ))}
                </AttachmentStrip>
              ) : null}
              <HiddenFileInput
                ref={fileInputRef}
                data-wtf-live-chat-file
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,video/mp4"
                onChange={handleAttachmentInput}
              />
              <GuestGrid>
                <Button
                  disabled={!joined || !socketReady || chatAttachments.length >= MAX_LIVE_CHAT_ATTACHMENTS}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ButtonLabel><Paperclip size={16} aria-hidden /> Media</ButtonLabel>
                </Button>
                <Button primary disabled={!canSendChat} onClick={sendLiveChat} data-wtf-live-chat-send>
                  <ButtonLabel><Send size={16} aria-hidden /> Send</ButtonLabel>
                </Button>
              </GuestGrid>
            </ChatComposer>
          </Panel>
        </RoomBody>
      </RoomFrame>
    </GuestShell>
  );
}
