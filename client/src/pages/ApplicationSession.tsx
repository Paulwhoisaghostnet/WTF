import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react95";
import { ArrowLeft, Hourglass, MonitorUp, Radio, RefreshCw, Square } from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { api, isApiRequestError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWindowManager } from "../lib/window-context";

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

type StreamStats = {
  fps: number | null;
  rttMs: number | null;
  jitterMs: number | null;
  framesDecoded: number;
};

const Page = styled.main`
  position: relative;
  height: 100%;
  min-height: 420px;
  display: block;
  overflow: hidden;
  color: #f5f7fb;
  background: #000000;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
`;

const Header = styled.header`
  position: absolute;
  z-index: 5;
  top: 8px;
  left: 8px;
  right: 8px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 38px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(12, 14, 18, 0.78);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.34);
`;

const TitleGroup = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
`;

const IconBox = styled.span`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(34, 37, 45, 0.84);
`;

const TitleText = styled.h1`
  min-width: 0;
  margin: 0;
  font-size: 15px;
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
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const Body = styled.section`
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  display: block;
`;

const RemoteStage = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  background: #050608;
  border: 0;
  overflow: hidden;
  container-type: size;
`;

const RemoteFrame = styled.div<{ $aspect: string; $aspectRatio: number; $nativeCursor: boolean }>`
  position: relative;
  width: 100%;
  width: min(100%, calc(100cqh * ${(p) => p.$aspectRatio}));
  max-height: 100%;
  aspect-ratio: ${(p) => p.$aspect};
  display: grid;
  place-items: center;
  background: #000000;
  outline: none;
  touch-action: none;
  /* The remote application streams its own native cursor, so the local
     cursor is hidden over the play surface to avoid a duplicate pointer. */
  cursor: ${(p) => (p.$nativeCursor ? "none" : "default")};
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
  pointer-events: none;
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
  position: absolute;
  z-index: 5;
  left: 8px;
  right: 8px;
  bottom: 8px;
  max-width: 760px;
  margin: 0 auto;
  min-width: 0;
  display: grid;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(12, 14, 18, 0.78);
  backdrop-filter: blur(8px);
  box-shadow: 0 -10px 24px rgba(0, 0, 0, 0.28);
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
  height: 8px;
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

const StatsLine = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  color: #8fd3a8;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
`;

const ErrorBar = styled.div`
  position: absolute;
  z-index: 6;
  top: 56px;
  left: 8px;
  right: 8px;
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
  const wm = useWindowManager();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const pendingMoveRef = useRef<Record<string, unknown> | null>(null);
  const moveFlushHandleRef = useRef<number | null>(null);
  const launchAttemptedRef = useRef<string | null>(null);
  const virtualPointerRef = useRef({ x: 0.5, y: 0.5 });
  const [launchStartedAt, setLaunchStartedAt] = useState<number | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "connected" | "failed">("idle");
  const [streamDetail, setStreamDetail] = useState<string | null>(null);
  const [streamStats, setStreamStats] = useState<StreamStats | null>(null);
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [pointerLocked, setPointerLocked] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["applications", "session", appId],
    queryFn: () => api.get<AppSessionResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/session`),
    enabled: Boolean(appId && user),
    refetchInterval: 5000,
  });

  const statusQuery = useQuery({
    queryKey: ["applications", "status", appId],
    queryFn: () => api.get<StatusResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/status`),
    enabled: Boolean(appId && user),
    refetchInterval: 2000,
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
  const controlsReady = status?.state === "running" && socketReady;
  const iceServersKey = useMemo(
    () => JSON.stringify(session?.stream.iceServers ?? []),
    [session?.stream.iceServers],
  );
  const shouldCapture = Boolean(
    appId &&
      user &&
      status &&
      (status.state === "launching" ||
        (status.state === "running" && status.progress?.phase !== "ready")) &&
      streamState !== "connected",
  );
  const snapshotQuery = useQuery({
    queryKey: ["applications", "snapshot", appId],
    queryFn: () => api.get<AppSnapshotResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/snapshot`),
    enabled: shouldCapture,
    refetchInterval: shouldCapture ? 1000 : false,
    staleTime: 0,
    gcTime: 1000,
  });

  const resumeRemotePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const wasMuted = video.muted;
    video.muted = false;
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      void playAttempt.catch(() => {
        // Autoplay policy blocked unmuted playback (no user gesture yet).
        // Fall back to muted playback so video keeps rendering; audio
        // resumes on the next real interaction.
        video.muted = true;
        void video.play().catch(() => undefined);
        if (!wasMuted) {
          setStreamDetail("Click the game to enable audio.");
        }
      });
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !remoteStream) return;
    if (video.srcObject !== remoteStream) {
      video.srcObject = remoteStream;
    }
    // Muted autoplay is always permitted, so video frames render before any
    // user gesture. Audio is enabled by resumeRemotePlayback on interaction.
    video.muted = true;
    void video.play().catch(() => undefined);
  }, [remoteStream]);

  useEffect(() => {
    launchAttemptedRef.current = null;
  }, [appId]);

  useEffect(() => {
    const handleLockChange = () => {
      setPointerLocked(document.pointerLockElement === frameRef.current);
    };
    document.addEventListener("pointerlockchange", handleLockChange);
    return () => {
      document.removeEventListener("pointerlockchange", handleLockChange);
      if (document.pointerLockElement === frameRef.current) {
        document.exitPointerLock();
      }
    };
  }, []);

  useEffect(() => {
    if (!user || !sessionQuery.data || launchMutation.isPending) return;
    const state = sessionQuery.data.status?.state;
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
    if (
      !user ||
      !appId ||
      status?.state !== "running" ||
      status?.progress?.phase !== "ready" ||
      session?.stream.preferredTransport !== "webrtc"
    ) {
      setRemoteStream(null);
      setStreamState("idle");
      return;
    }
    if (typeof RTCPeerConnection === "undefined" || typeof MediaStream === "undefined") {
      setStreamState("failed");
      setStreamDetail("Live stream is not supported by this browser. Showing snapshots.");
      return;
    }

    // streamAttempt bumps when the zero-frame watchdog decides the current
    // stream is stalled; changing it tears this connection down and renegotiates.
    void streamAttempt;
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
      receivedStream.addTrack(event.track);
      setRemoteStream(new MediaStream(receivedStream.getTracks()));
      setStreamState("connected");
      setStreamDetail("Live stream connected.");
      const video = videoRef.current;
      if (video) {
        video.srcObject = receivedStream;
        video.muted = true;
        void video.play().catch(() => undefined);
      }
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
  }, [appId, iceServersKey, session?.audio?.required, session?.stream.preferredTransport, status?.state, streamAttempt, user]);

  useEffect(() => {
    if (streamState !== "connected") {
      setStreamStats(null);
      return;
    }
    let lastFramesDecoded = 0;
    let lastSampleAt = 0;
    let zeroFrameSamples = 0;
    const interval = window.setInterval(() => {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection || peerConnection.connectionState !== "connected") return;
      void peerConnection.getStats().then((report) => {
        let framesDecoded = 0;
        let jitterSeconds: number | undefined;
        let rttSeconds: number | undefined;
        let reportedFps: number | undefined;
        report.forEach((entry) => {
          const stats = entry as Record<string, unknown>;
          if (stats.type === "inbound-rtp" && stats.kind === "video") {
            framesDecoded = Number(stats.framesDecoded) || 0;
            if (typeof stats.framesPerSecond === "number") reportedFps = stats.framesPerSecond;
            if (typeof stats.jitter === "number") jitterSeconds = stats.jitter;
          }
          if (stats.type === "candidate-pair" && stats.state === "succeeded" && typeof stats.currentRoundTripTime === "number") {
            rttSeconds = stats.currentRoundTripTime;
          }
        });
        const now = performance.now();
        let fps: number | undefined = reportedFps;
        if (fps === undefined && lastSampleAt > 0 && now > lastSampleAt) {
          fps = ((framesDecoded - lastFramesDecoded) * 1000) / (now - lastSampleAt);
        }
        lastFramesDecoded = framesDecoded;
        lastSampleAt = now;
        setStreamStats({
          fps: fps !== undefined ? Math.max(0, Math.round(fps)) : null,
          rttMs: rttSeconds !== undefined ? Math.round(rttSeconds * 1000) : null,
          jitterMs: jitterSeconds !== undefined ? Math.round(jitterSeconds * 1000) : null,
          framesDecoded,
        });
        // Watchdog: a healthy stream decodes frames within a second or two of
        // connecting. If the connection reports "connected" but no video frame
        // ever arrives (e.g. the capture pipeline stalled while the game was
        // still initialising its display), renegotiate a fresh stream instead
        // of sitting on a black window until the user refreshes.
        if (framesDecoded === 0) {
          zeroFrameSamples += 1;
          if (zeroFrameSamples >= 5) {
            zeroFrameSamples = 0;
            setStreamDetail("Restarting the live stream.");
            setStreamAttempt((attempt) => attempt + 1);
          }
        } else {
          zeroFrameSamples = 0;
        }
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [streamState]);

  const flushPendingMove = useCallback(() => {
    moveFlushHandleRef.current = null;
    const payload = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (!payload || !appId) return;
    void api.post(`/api/apphost/apps/${encodeURIComponent(appId)}/input`, payload).catch(() => undefined);
  }, [appId]);

  const sendInput = useCallback(
    (event: Record<string, unknown>) => {
      if (!controlsReady || !appId) return;
      if (event.type === "pointer" && event.action === "move") {
        pendingMoveRef.current = event;
        if (moveFlushHandleRef.current == null) {
          moveFlushHandleRef.current = window.requestAnimationFrame(flushPendingMove);
        }
        return;
      }
      void api.post(`/api/apphost/apps/${encodeURIComponent(appId)}/input`, event).catch(() => undefined);
    },
    [appId, controlsReady, flushPendingMove],
  );

  useEffect(() => {
    return () => {
      if (moveFlushHandleRef.current != null) {
        window.cancelAnimationFrame(moveFlushHandleRef.current);
        moveFlushHandleRef.current = null;
      }
      pendingMoveRef.current = null;
    };
  }, [appId]);

  function pointerPayload(event: PointerEvent<HTMLDivElement>, action: string) {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    if (document.pointerLockElement === frame) {
      // Pointer lock: the OS cursor is trapped and clientX/Y freeze, so track
      // a virtual position from relative movement. The game's streamed cursor
      // is the visible pointer; Esc releases the lock.
      if (action === "move" && rect.width > 0 && rect.height > 0) {
        virtualPointerRef.current = {
          x: Math.max(0, Math.min(1, virtualPointerRef.current.x + event.movementX / rect.width)),
          y: Math.max(0, Math.min(1, virtualPointerRef.current.y + event.movementY / rect.height)),
        };
      }
      return {
        type: "pointer",
        action,
        x: virtualPointerRef.current.x,
        y: virtualPointerRef.current.y,
        button: event.button + 1,
        pointerType: event.pointerType,
      };
    }
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    virtualPointerRef.current = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
    return {
      type: "pointer",
      action,
      x: virtualPointerRef.current.x,
      y: virtualPointerRef.current.y,
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
    resumeRemotePlayback();
    const payload = pointerPayload(event, action);
    if (!payload) return;
    if (event.type === "pointerdown" && document.pointerLockElement !== frameRef.current) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    sendInput(payload);
    if (event.type === "pointerup" && payload.action === "up") {
      sendInput({ ...payload, action: "click" });
    }
  }

  function handleWheelEvent(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    resumeRemotePlayback();
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const locked = document.pointerLockElement === frame;
    sendInput({
      type: "pointer",
      action: "wheel",
      x: locked ? virtualPointerRef.current.x : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: locked ? virtualPointerRef.current.y : Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }

  function handleKeyEvent(event: KeyboardEvent<HTMLDivElement>) {
    event.preventDefault();
    resumeRemotePlayback();
    if (event.type === "keydown" && (event.key === "Enter" || event.key === " ")) {
      sendInput({
        type: "keyboard",
        action: "press",
        key: event.key,
        code: event.code,
      });
      return;
    }
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
    const display = sessionQuery.data?.session?.display;
    const width = display?.width || 1280;
    const height = display?.height || 720;
    return `${width} / ${height}`;
  }, [sessionQuery.data?.session?.display]);
  const aspectRatio = useMemo(() => {
    const display = sessionQuery.data?.session?.display;
    const width = display?.width || 1280;
    const height = display?.height || 720;
    return width / height;
  }, [sessionQuery.data?.session?.display]);
  const loadError = sessionQuery.error || statusQuery.error || launchMutation.error || stopMutation.error || null;

  function openLiveRooms() {
    wm.openPage("/live?tab=rooms");
  }

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login", { replace: true });
    }
  }, [isLoading, setLocation, user]);

  return (
    <AppWindow title={appName}>
      <Page data-application-session-region="surface" data-application-session-mode="game-first">
        <Header data-application-session-region="overlay-controls">
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
            <ChromeButton type="button" onClick={openLiveRooms} data-application-session-region="live-room-action">
              <Radio size={15} />
              WTF LIVE
            </ChromeButton>
            <ChromeButton type="button" onClick={() => void statusQuery.refetch()}>
              {statusQuery.isFetching ? <Hourglass size={15} /> : <RefreshCw size={15} />}
              Status
            </ChromeButton>
            <ChromeButton type="button" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending || status?.state !== "running"}>
              <Square size={15} />
              Stop
            </ChromeButton>
            {remoteStream ? (
              <ChromeButton
                type="button"
                onClick={() => {
                  const frame = frameRef.current;
                  if (!frame) return;
                  if (document.pointerLockElement === frame) {
                    document.exitPointerLock();
                    return;
                  }
                  try {
                    void (frame.requestPointerLock() as Promise<void> | undefined)?.catch?.(() => undefined);
                  } catch {
                    // Pointer lock is best-effort.
                  }
                }}
              >
                {pointerLocked ? "Release cursor" : "Capture cursor"}
              </ChromeButton>
            ) : null}
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
              $aspectRatio={aspectRatio}
              $nativeCursor={Boolean(remoteStream)}
              tabIndex={0}
              role="application"
              aria-label={appName}
              data-application-session-region="remote-surface"
              data-remote-cursor-surface={remoteStream ? "true" : undefined}
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
                  muted
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
          <StatusDock data-application-session-region="status-overlay">
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
            <Detail>
              {pointerLocked
                ? "Cursor captured by the game. Press Esc to release it."
                : streamDetail ||
                  progress.detail ||
                  (socketReady ? "Click or press Enter to interact. Capture cursor traps the mouse for drag-heavy games." : "Connecting session.")}
            </Detail>
            {streamStats ? (
              <StatsLine data-application-session-region="stream-stats">
                <span>{streamStats.fps != null ? `${streamStats.fps} fps` : "fps —"}</span>
                <span>{streamStats.rttMs != null ? `${streamStats.rttMs} ms RTT` : "RTT —"}</span>
                <span>{streamStats.jitterMs != null ? `${streamStats.jitterMs} ms jitter` : "jitter —"}</span>
              </StatsLine>
            ) : null}
          </StatusDock>
        </Body>
      </Page>
    </AppWindow>
  );
}
