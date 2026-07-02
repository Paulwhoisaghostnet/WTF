import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react95";
import { ArrowLeft, Hourglass, MonitorUp, RefreshCw, Square } from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { api, isApiRequestError } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type HostedApplication = {
  id: string;
  name: string;
  displayRequired: boolean;
  audioRequired: boolean;
  startupTimeout: number;
  coverImageUrl?: string;
  coverImageAlt?: string;
  summary?: string;
  category?: string;
  healthCheck: {
    type: string;
  };
};

type AppProgress = {
  phase: string;
  label: string;
  detail?: string;
  percent: number;
};

type AppStatus = {
  appId: string;
  state: "running" | "stopped" | "exited" | "launching" | "failed" | string;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  health: {
    ok: boolean;
    type: string;
    error?: string;
  };
  progress?: AppProgress;
  diagnostics: Record<string, unknown>;
};

type AppSessionResponse = {
  ok: boolean;
  app: HostedApplication;
  status: AppStatus;
  session: {
    appId: string;
    appName: string;
    display: {
      width: number;
      height: number;
      displayName?: string;
      required: boolean;
    };
    audio?: {
      required: boolean;
      pulseServer?: string;
    };
    stream: {
      preferredTransport: string;
      fallbackTransports: string[];
      webSocketPath: string;
      offerPath?: string;
      statusPath?: string;
      stopPath?: string;
      snapshotPath: string;
      iceServers?: RTCIceServer[];
    };
    input: {
      pointer: boolean;
      keyboard: boolean;
      clipboard: boolean;
      coordinateSpace: {
        width: number;
        height: number;
      };
    };
  };
};

type StatusResponse = {
  status: AppStatus;
};

type LaunchResponse = {
  ok: boolean;
  app: HostedApplication;
  status: AppStatus;
};

type AppSnapshotResponse = {
  ok: boolean;
  appId: string;
  contentType: string;
  capturedAt: string;
  dataUrl: string;
};

type StreamOfferResponse = {
  ok: boolean;
  streamId: string;
  transport: "webrtc" | string;
  answer: RTCSessionDescriptionInit;
  candidates?: RTCIceCandidateInit[];
  error?: string;
};

const Page = styled.main`
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: #f5f7fb;
  background: #101114;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
`;

const Header = styled.header`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #2c3038;
  background: #181a20;
`;

const TitleGroup = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
`;

const IconBox = styled.span`
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid #3a3f49;
  background: #22252d;
`;

const TitleText = styled.h1`
  min-width: 0;
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
  overflow-wrap: anywhere;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
`;

const ChromeButton = styled(Button)`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const Body = styled.section`
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 12px;
  gap: 10px;
`;

const RemoteStage = styled.div`
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  background: #050608;
  border: 1px solid #2c3038;
  overflow: hidden;
`;

const RemoteFrame = styled.div<{ $aspect: string }>`
  position: relative;
  width: min(100%, calc((100vh - 118px) * ${(p) => p.$aspect}));
  max-height: 100%;
  aspect-ratio: ${(p) => p.$aspect};
  display: grid;
  place-items: center;
  background: #000000;
  outline: none;
  touch-action: none;
`;

const SnapshotImage = styled.img`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
`;

const RemoteVideo = styled.video`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #000000;
`;

const WaitingSurface = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 16px;
  color: #d8deea;
  background: #050608;
`;

const StatusDock = styled.div`
  min-width: 0;
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid #2c3038;
  background: #181a20;
`;

const StatusLine = styled.div`
  min-width: 0;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-weight: 700;
`;

const ProgressTrack = styled.div`
  height: 14px;
  padding: 2px;
  border: 1px solid #414753;
  background: #050608;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  width: ${(p) => p.$percent}%;
  height: 100%;
  background: #3ac0ff;
  transition: width 180ms ease;
`;

const Detail = styled.div`
  min-height: 18px;
  color: #b5bdca;
  font-size: 13px;
`;

const ErrorBar = styled.div`
  padding: 8px 10px;
  border: 1px solid #7c5520;
  background: #3a2b16;
  color: #ffe1a6;
`;

function clampProgress(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function appHostWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/apphost`;
}

function createStreamId() {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `stream-${random}`.slice(0, 80);
}

function waitForIceGathering(peerConnection: RTCPeerConnection, timeoutMs: number) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs);
    function done() {
      window.clearTimeout(timeout);
      peerConnection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    }
    function handleChange() {
      if (peerConnection.iceGatheringState === "complete") {
        done();
      }
    }
    peerConnection.addEventListener("icegatheringstatechange", handleChange);
  });
}

function fallbackProgress(status: AppStatus | undefined, launchStartedAt: number | null): AppProgress {
  if (status?.progress) {
    return { ...status.progress, percent: clampProgress(status.progress.percent) };
  }
  if (launchStartedAt) {
    const elapsed = Math.max(0, Date.now() - launchStartedAt);
    return {
      phase: "opening",
      label: "Opening application",
      detail: "Preparing the remote session.",
      percent: Math.min(92, Math.max(10, Math.round(elapsed / 1200))),
    };
  }
  if (status?.state === "running") {
    return { phase: "ready", label: "Ready", detail: "The application is open.", percent: 100 };
  }
  if (status?.state === "failed") {
    return { phase: "failed", label: "Could not open application", detail: "Diagnostics were captured.", percent: 100 };
  }
  return { phase: "idle", label: "Starting", detail: "Preparing the remote session.", percent: 8 };
}

export function ApplicationSession({ appId }: { appId: string }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const lastMoveAtRef = useRef(0);
  const launchAttemptedRef = useRef<string | null>(null);
  const [launchStartedAt, setLaunchStartedAt] = useState<number | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "connected" | "failed">("idle");
  const [streamDetail, setStreamDetail] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["applications", "session", appId],
    queryFn: () => api.get<AppSessionResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/session`),
    enabled: Boolean(appId && user),
    refetchInterval: 3000,
  });

  const statusQuery = useQuery({
    queryKey: ["applications", "status", appId],
    queryFn: () => api.get<StatusResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/status`),
    enabled: Boolean(appId && user),
    refetchInterval: 1000,
  });

  const launchMutation = useMutation({
    mutationFn: () => api.post<LaunchResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/launch`, {}),
    onMutate: () => setLaunchStartedAt(Date.now()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["applications", "status", appId] });
      void queryClient.invalidateQueries({ queryKey: ["applications", "session", appId] });
      setLaunchStartedAt(null);
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.post<LaunchResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/stop`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["applications", "status", appId] });
    },
  });

  const status = statusQuery.data?.status ?? sessionQuery.data?.status;
  const session = sessionQuery.data?.session;
  const iceServersKey = useMemo(
    () => JSON.stringify(session?.stream.iceServers ?? []),
    [session?.stream.iceServers],
  );
  const shouldCapture = Boolean(
    appId &&
      user &&
      status &&
      ["running", "launching"].includes(status.state) &&
      streamState !== "connected",
  );
  const snapshotQuery = useQuery({
    queryKey: ["applications", "snapshot", appId],
    queryFn: () => api.get<AppSnapshotResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/snapshot`),
    enabled: shouldCapture,
    refetchInterval: shouldCapture ? (status?.state === "running" ? 350 : 1000) : false,
    staleTime: 0,
    gcTime: 1000,
  });

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    launchAttemptedRef.current = null;
  }, [appId]);

  useEffect(() => {
    if (!user || !sessionQuery.data || launchMutation.isPending) return;
    const state = sessionQuery.data.status.state;
    if (state === "running" || state === "launching") return;
    if (launchAttemptedRef.current === appId) return;
    launchAttemptedRef.current = appId;
    launchMutation.mutate();
  }, [appId, launchMutation, sessionQuery.data, user]);

  useEffect(() => {
    if (!user || !appId) return;
    const ws = new WebSocket(appHostWebSocketUrl());
    wsRef.current = ws;
    ws.addEventListener("open", () => {
      setSocketReady(true);
      ws.send(JSON.stringify({ type: "apphost_join", appId }));
    });
    ws.addEventListener("close", () => {
      setSocketReady(false);
      if (wsRef.current === ws) wsRef.current = null;
    });
    return () => {
      try {
        ws.send(JSON.stringify({ type: "apphost_leave", appId }));
      } catch {
        // The socket may already be closing.
      }
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [appId, user]);

  useEffect(() => {
    if (!user || !appId || status?.state !== "running" || session?.stream.preferredTransport !== "webrtc") {
      setRemoteStream(null);
      setStreamState("idle");
      return;
    }
    if (typeof RTCPeerConnection === "undefined" || typeof MediaStream === "undefined") {
      setStreamState("failed");
      setStreamDetail("Live stream is not supported by this browser. Showing snapshots.");
      return;
    }

    let cancelled = false;
    const streamId = createStreamId();
    streamIdRef.current = streamId;
    const iceServers = JSON.parse(iceServersKey) as RTCIceServer[];
    const peerConnection = new RTCPeerConnection({ iceServers });
    const receivedStream = new MediaStream();
    peerConnectionRef.current = peerConnection;
    setStreamState("connecting");
    setStreamDetail("Starting live stream.");

    peerConnection.addTransceiver("video", { direction: "recvonly" });
    if (session.audio?.required) {
      peerConnection.addTransceiver("audio", { direction: "recvonly" });
    }
    peerConnection.addEventListener("track", (event) => {
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        receivedStream.addTrack(event.track);
        setRemoteStream(receivedStream);
      }
      setStreamState("connected");
      setStreamDetail("Live stream connected.");
    });
    peerConnection.addEventListener("connectionstatechange", () => {
      if (cancelled) return;
      if (peerConnection.connectionState === "connected") {
        setStreamState("connected");
        setStreamDetail("Live stream connected.");
      }
      if (["failed", "disconnected", "closed"].includes(peerConnection.connectionState)) {
        setStreamState("failed");
        setStreamDetail("Live stream fell back to snapshots.");
        setRemoteStream(null);
      }
    });

    async function startWebRtcStream() {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering(peerConnection, 2500);
      const localDescription = peerConnection.localDescription;
      if (!localDescription) {
        throw new Error("Browser did not create a local WebRTC offer.");
      }
      const response = await api.post<StreamOfferResponse>(
        `/api/apphost/apps/${encodeURIComponent(appId)}/stream/offer`,
        {
          streamId,
          offer: {
            type: localDescription.type,
            sdp: localDescription.sdp,
          },
        },
      );
      if (!response.ok || !response.answer) {
        throw new Error(response.error || "Application host did not answer the WebRTC offer.");
      }
      await peerConnection.setRemoteDescription(response.answer);
      for (const candidate of response.candidates ?? []) {
        await peerConnection.addIceCandidate(candidate);
      }
      if (!cancelled) {
        setStreamDetail("Connecting live stream.");
      }
    }

    void startWebRtcStream().catch((error) => {
      if (cancelled) return;
      setStreamState("failed");
      setStreamDetail(error instanceof Error ? `${error.message} Showing snapshots.` : "Live stream fell back to snapshots.");
      setRemoteStream(null);
      peerConnection.close();
      void api.post(`/api/apphost/apps/${encodeURIComponent(appId)}/stream/stop`, { streamId }).catch(() => undefined);
    });

    return () => {
      cancelled = true;
      peerConnection.close();
      setRemoteStream(null);
      setStreamState("idle");
      if (peerConnectionRef.current === peerConnection) {
        peerConnectionRef.current = null;
      }
      if (streamIdRef.current === streamId) {
        streamIdRef.current = null;
      }
      void api.post(`/api/apphost/apps/${encodeURIComponent(appId)}/stream/stop`, { streamId }).catch(() => undefined);
    };
  }, [appId, iceServersKey, session?.audio?.required, session?.stream.preferredTransport, status?.state, user]);

  function sendInput(event: Record<string, unknown>) {
    const ws = wsRef.current;
    const payload = JSON.stringify({ type: "apphost_input", appId, event });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      return;
    }
    void api.post(`/api/apphost/apps/${encodeURIComponent(appId)}/input`, event).catch(() => undefined);
  }

  function pointerPayload(event: PointerEvent<HTMLDivElement>, action: string) {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    return {
      type: "pointer",
      action,
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      button: event.button + 1,
      pointerType: event.pointerType,
    };
  }

  function handlePointerEvent(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    frameRef.current?.focus();
    const action =
      event.type === "pointerdown"
        ? "down"
        : event.type === "pointerup"
          ? "up"
          : event.type === "pointermove"
            ? "move"
            : "click";
    if (action === "move") {
      const now = Date.now();
      if (now - lastMoveAtRef.current < 35) return;
      lastMoveAtRef.current = now;
    }
    const payload = pointerPayload(event, action);
    if (!payload) return;
    if (event.type === "pointerdown") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    sendInput(payload);
  }

  function handleWheelEvent(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    sendInput({
      type: "pointer",
      action: "wheel",
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }

  function handleKeyEvent(event: KeyboardEvent<HTMLDivElement>) {
    event.preventDefault();
    sendInput({
      type: "keyboard",
      action: event.type === "keydown" ? "down" : "up",
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
  }

  const progress = fallbackProgress(status, launchStartedAt);
  const app = sessionQuery.data?.app;
  const appName = app?.name || appId;
  const aspect = useMemo(() => {
    const display = sessionQuery.data?.session.display;
    const width = display?.width || 1280;
    const height = display?.height || 720;
    return `${width} / ${height}`;
  }, [sessionQuery.data?.session.display]);
  const loadError = sessionQuery.error || statusQuery.error || launchMutation.error || stopMutation.error || null;

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login", { replace: true });
    }
  }, [isLoading, setLocation, user]);

  return (
    <Page data-application-session-region="surface">
      <Header data-application-session-region="header">
        <TitleGroup>
          <IconBox>
            <MonitorUp size={18} />
          </IconBox>
          <TitleText>{appName}</TitleText>
        </TitleGroup>
        <HeaderActions>
          <ChromeButton type="button" onClick={() => setLocation("/applications")}>
            <ArrowLeft size={15} />
            Applications
          </ChromeButton>
          <ChromeButton type="button" onClick={() => void statusQuery.refetch()}>
            {statusQuery.isFetching ? <Hourglass size={15} /> : <RefreshCw size={15} />}
            Status
          </ChromeButton>
          <ChromeButton type="button" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending || status?.state !== "running"}>
            <Square size={15} />
            Stop
          </ChromeButton>
        </HeaderActions>
      </Header>
      <Body>
        {loadError ? (
          <ErrorBar role="alert">
            {isApiRequestError(loadError) ? loadError.message : "Application host is unavailable"}
          </ErrorBar>
        ) : null}
        <RemoteStage data-application-session-region="stage">
          <RemoteFrame
            ref={frameRef}
            $aspect={aspect}
            tabIndex={0}
            role="application"
            aria-label={appName}
            data-application-session-region="remote-surface"
            onPointerDown={handlePointerEvent}
            onPointerUp={handlePointerEvent}
            onPointerMove={handlePointerEvent}
            onWheel={handleWheelEvent}
            onKeyDown={handleKeyEvent}
            onKeyUp={handleKeyEvent}
          >
            {remoteStream ? (
              <RemoteVideo
                ref={videoRef}
                autoPlay
                playsInline
                data-application-session-region="webrtc-video"
              />
            ) : snapshotQuery.data?.dataUrl ? (
              <SnapshotImage
                src={snapshotQuery.data.dataUrl}
                alt=""
                draggable={false}
                data-application-session-region="snapshot"
              />
            ) : (
              <WaitingSurface>
                <Hourglass size={36} />
              </WaitingSurface>
            )}
          </RemoteFrame>
        </RemoteStage>
        <StatusDock data-application-session-region="status">
          <StatusLine>
            <span>{progress.label}</span>
            <span>{progress.percent}%</span>
          </StatusLine>
          <ProgressTrack
            role="progressbar"
            aria-label={`${appName} launch progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <ProgressFill $percent={progress.percent} />
          </ProgressTrack>
          <Detail>{streamDetail || progress.detail || (socketReady ? "Session connected." : "Connecting session.")}</Detail>
        </StatusDock>
      </Body>
    </Page>
  );
}
