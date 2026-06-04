import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Copy, Mic, MonitorUp, Radio, Square } from "lucide-react";
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
  object-fit: cover;
  background: #050505;
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function useVideoStream(ref: RefObject<HTMLVideoElement | null>, stream: MediaStream | null) {
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
  }, [ref, stream]);
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
  const [status, setStatus] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const screenRef = useRef<HTMLVideoElement | null>(null);
  const room = roomQuery.data?.room;
  const roomUrl = useMemo(() => {
    if (typeof window === "undefined") return `/live/r/${roomId}`;
    return `${window.location.origin}/live/r/${roomId}`;
  }, [roomId]);

  useVideoStream(cameraRef, cameraStream);
  useVideoStream(screenRef, screenStream);

  useEffect(() => () => {
    stopStream(micStream);
    stopStream(cameraStream);
    stopStream(screenStream);
  }, [cameraStream, micStream, screenStream]);

  async function copyRoomUrl() {
    await navigator.clipboard?.writeText(roomUrl);
    setStatus("Room URL copied.");
  }

  function joinRoom() {
    const name = guestName.trim() || "guest";
    localStorage.setItem("wtf-live:guest-name", name);
    setGuestName(name);
    setJoined(true);
    setStatus(`Joined as ${name}.`);
  }

  async function toggleMic() {
    if (micStream) {
      stopStream(micStream);
      setMicStream(null);
      setStatus("Mic off.");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setMicStream(stream);
    setStatus("Mic ready.");
  }

  async function toggleCamera() {
    if (cameraStream) {
      stopStream(cameraStream);
      setCameraStream(null);
      setStatus("Camera off.");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    setCameraStream(stream);
    setStatus("Camera ready.");
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
    const stream = await getDisplayMedia({ video: true, audio: true });
    setScreenStream(stream);
    setStatus("Screen share ready.");
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

  return (
    <GuestShell>
      <RoomFrame>
        <TitleBar>
          <span>WTF LIVE</span>
          <span>{joined ? "IN ROOM" : "PUBLIC ROOM"}</span>
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
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setGuestName(event.target.value)}
            />
            <GuestGrid>
              <Button primary disabled={joined} onClick={joinRoom}>
                {joined ? "Joined" : "Join Room"}
              </Button>
              <Button onClick={copyRoomUrl}>
                <Copy size={16} aria-hidden /> Copy URL
              </Button>
            </GuestGrid>
            <GuestGrid>
              <ControlButton disabled={!joined} $active={Boolean(micStream)} onClick={toggleMic}>
                {micStream ? <Square aria-hidden /> : <Mic aria-hidden />} Mic
              </ControlButton>
              <ControlButton disabled={!joined} $active={Boolean(cameraStream)} onClick={toggleCamera}>
                {cameraStream ? <Square aria-hidden /> : <Camera aria-hidden />} Camera
              </ControlButton>
              <ControlButton disabled={!joined} $active={Boolean(screenStream)} onClick={toggleScreen}>
                {screenStream ? <Square aria-hidden /> : <MonitorUp aria-hidden />} Screen
              </ControlButton>
            </GuestGrid>
            <StatusLine aria-live="polite">{status}</StatusLine>
          </Panel>

          <Panel>
            <PreviewGrid>
              <PreviewBox>
                {cameraStream ? <PreviewVideo ref={cameraRef} muted autoPlay playsInline /> : <span>Camera preview</span>}
              </PreviewBox>
              <PreviewBox>
                {screenStream ? <PreviewVideo ref={screenRef} muted autoPlay playsInline /> : <span>Screen preview</span>}
              </PreviewBox>
            </PreviewGrid>
            <MessageList aria-label="Public room messages">
              {messagesQuery.isLoading ? <Hourglass size={24} /> : null}
              {messages.length ? (
                [...messages].reverse().map((message) => (
                  <MessageItem key={message.uri}>
                    <strong>{message.author?.displayName || message.author?.handle || "host"}</strong>
                    {formatDate(message.createdAt) ? <span>{formatDate(message.createdAt)}</span> : null}
                    <div>{message.text}</div>
                  </MessageItem>
                ))
              ) : (
                <span>No room messages yet.</span>
              )}
            </MessageList>
          </Panel>
        </RoomBody>
      </RoomFrame>
    </GuestShell>
  );
}
