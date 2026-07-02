import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Panel, Separator } from "react95";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Hourglass,
  MonitorUp,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api, isApiRequestError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { usePresentationShell } from "../lib/presentation-shell";

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
  owner?: AppHostOwner | null;
  diagnostics: Record<string, unknown>;
};

type AppHostOwner = {
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
  label?: string | null;
};

type AppProgress = {
  phase: string;
  label: string;
  detail?: string;
  percent: number;
};

type ApplicationsResponse = {
  apps: HostedApplication[];
  activeSession?: ActiveSession | null;
};

type ActiveSession = {
  appId: string;
  appName: string;
  state: string;
  owner?: AppHostOwner | null;
  progress?: AppProgress;
};

type StatusResponse = {
  status: AppStatus;
};

type LaunchResponse = {
  ok: boolean;
  app: HostedApplication;
  status: AppStatus;
  activeSession?: ActiveSession | null;
};

const Shell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;

  &[data-applications-presentation-host="gamma"] {
    color: var(--gamma-milk, #f2ead9);
    background: #070706;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-applications-presentation-host="gamma"],
  &[data-applications-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-applications-presentation-host="gamma"] [data-applications-region] {
    background-image: none;
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
  }

  &[data-applications-presentation-host="gamma"] fieldset,
  &[data-applications-presentation-host="gamma"] [data-applications-region="title-card"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="launch-window"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="status-block"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="conflict-banner"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="empty-state"] {
    color: var(--gamma-milk, #f2ead9);
    background: rgba(17, 17, 15, 0.86);
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
  }

  &[data-applications-presentation-host="gamma"] legend {
    color: var(--gamma-cyan, #00d2ff);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0;
  }

  &[data-applications-presentation-host="gamma"] [data-applications-region="icon"] {
    color: var(--gamma-cyan, #00d2ff);
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  &[data-applications-presentation-host="gamma"] [data-applications-region="title-card"][aria-pressed="true"] {
    border-color: var(--gamma-cyan, #00d2ff);
    background: rgba(0, 210, 255, 0.12);
  }

  &[data-applications-presentation-host="gamma"] [data-applications-region="app-meta"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="card-summary"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="detail-line"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="progress-detail"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="support-note"] {
    color: rgba(242, 234, 217, 0.68);
  }

  &[data-applications-presentation-host="gamma"] [data-applications-region="tag"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="card-pill"],
  &[data-applications-presentation-host="gamma"] [data-applications-region="state-pill"] {
    color: #070706;
    background: var(--gamma-cyan, #00d2ff);
    border: 1px solid var(--gamma-cyan, #00d2ff);
  }

  &[data-applications-presentation-host="gamma"] [data-applications-region="progress-track"] {
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  &[data-applications-presentation-host="gamma"] [data-applications-region="progress-fill"] {
    background: var(--gamma-cyan, #00d2ff);
  }

  &[data-applications-presentation-host="gamma"] button {
    color: var(--gamma-cyan, #00d2ff);
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-applications-presentation-host="gamma"] pre {
    color: var(--gamma-milk, #f2ead9);
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const TitleLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const TitleText = styled.h2`
  margin: 0;
  font-size: var(--wtf-type-heading-sm, 18px);
  line-height: 1.2;
`;

const AppGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
  gap: 8px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const CarouselShell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;
`;

const CarouselControls = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const TitleCarousel = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 260px);
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  padding: 2px 2px 8px;
  scroll-snap-type: x mandatory;
`;

const TitleCard = styled(Panel).attrs({ variant: "well" })<{ $active?: boolean; $locked?: boolean }>`
  scroll-snap-align: start;
  min-height: 260px;
  display: grid;
  grid-template-rows: 132px auto;
  gap: 8px;
  width: 100%;
  padding: 8px;
  text-align: left;
  color: inherit;
  border: 2px ${(p) => (p.$active ? "inset" : "outset")} #ffffff;
  background: ${(p) => (p.$active ? "#d7e7ff" : "var(--wtf-app-surface, #f2f2f2)")};
  font: inherit;
  opacity: ${(p) => (p.$locked ? 0.68 : 1)};
  cursor: pointer;

  &:focus-visible {
    outline: 2px dotted #000000;
    outline-offset: -5px;
  }
`;

const CoverFrame = styled.div`
  position: relative;
  min-width: 0;
  height: 132px;
  border: 1px solid #808080;
  background: #111111;
  overflow: hidden;
`;

const CoverImage = styled.img`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
`;

const CoverFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 8px;
  color: #ffffff;
  background: linear-gradient(135deg, #111827, #0f766e);
  text-align: center;
  font-weight: bold;
`;

const CardBody = styled.div`
  display: grid;
  gap: 5px;
  min-width: 0;
`;

const CardPillRow = styled.div`
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
`;

const CardSummary = styled.p`
  margin: 0;
  min-height: 38px;
  color: var(--wtf-app-muted, #4b5563);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const IconBox = styled.span`
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid #808080;
  background: #dfdfdf;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const AppName = styled.span`
  display: block;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const AppMeta = styled.span`
  display: block;
  margin-top: 3px;
  color: var(--wtf-app-muted, #4b5563);
  font-size: var(--wtf-type-caption, 13px);
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 5px;
  border: 1px solid #808080;
  background: #eeeeee;
  font-size: var(--wtf-type-caption, 12px);
  font-weight: bold;
`;

const DetailPanel = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;
`;

const StatusBlock = styled.div`
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #eeeeee);
`;

const LaunchWindow = styled.div`
  display: grid;
  gap: 8px;
  padding: 10px;
  min-height: 170px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #eeeeee);
`;

const StatusLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const StatePill = styled.span<{ $state: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid #808080;
  background: ${(p) =>
    p.$state === "running"
      ? "#d8f0d0"
      : p.$state === "launching"
        ? "#d7e7ff"
        : p.$state === "failed" || p.$state === "exited"
          ? "#f5df9a"
          : "#eeeeee"};
  font-weight: bold;
  font-size: var(--wtf-type-caption, 13px);
`;

const ProgressBlock = styled.div`
  display: grid;
  gap: 5px;
`;

const ProgressHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  font-weight: bold;
`;

const ProgressTrack = styled.div`
  height: 18px;
  padding: 2px;
  border: 1px inset #ffffff;
  background: #ffffff;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  width: ${(p) => p.$percent}%;
  height: 100%;
  background: #000080;
  transition: width 240ms ease;
`;

const ProgressDetail = styled.div`
  min-height: 18px;
  color: var(--wtf-app-muted, #4b5563);
  font-size: var(--wtf-type-caption, 13px);
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const ActionButton = styled(Button)`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

const SupportNote = styled.div`
  padding: 7px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-subtle-surface, #f7f7f7);
  color: var(--wtf-app-muted, #4b5563);
  font-size: var(--wtf-type-caption, 13px);
`;

const ConflictBanner = styled.div`
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-warning-surface, #ffffd6);
  color: var(--wtf-app-text, #111111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const EmptyState = styled.div`
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-warning-surface, #ffffd6);
  font-size: var(--wtf-type-caption, 13px);
`;

function statusIcon(status?: AppStatus) {
  if (!status) return Activity;
  if (status.state === "running" && status.health?.ok) return CheckCircle2;
  if (status.state === "launching") return Hourglass;
  if (status.state === "failed") return AlertTriangle;
  if (status.state === "running") return Activity;
  if (status.state === "exited") return AlertTriangle;
  return Square;
}

function fetchStatus(appId: string) {
  return api.get<StatusResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/status`);
}

function applicationPlayPath(appId: string) {
  return `/applications/${encodeURIComponent(appId)}/play`;
}

function clampProgress(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function fallbackProgress(
  app: HostedApplication | null,
  status: AppStatus | undefined,
  pendingLaunch: { appId: string; startedAt: number } | null,
): AppProgress {
  if (status?.progress) {
    return { ...status.progress, percent: clampProgress(status.progress.percent) };
  }
  if (app && pendingLaunch?.appId === app.id) {
    const elapsedSeconds = Math.max(0, (Date.now() - pendingLaunch.startedAt) / 1000);
    const timeoutSeconds = Math.max(1, app.startupTimeout || 60);
    return {
      phase: "opening",
      label: "Opening application",
      detail: "This can take a few minutes the first time.",
      percent: Math.min(92, Math.max(12, Math.round((elapsedSeconds / timeoutSeconds) * 92))),
    };
  }
  if (status?.state === "running") {
    return { phase: "ready", label: "Ready", detail: "The application is open.", percent: 100 };
  }
  if (status?.state === "failed" || status?.state === "exited") {
    return {
      phase: "closed",
      label: status.state === "failed" ? "Could not open application" : "Closed",
      detail: "wtfOS saved a private support record for this launch.",
      percent: 100,
    };
  }
  return { phase: "idle", label: "Ready to open", detail: "Select Open when you are ready.", percent: 0 };
}

function ownerLabel(owner?: AppHostOwner | null) {
  return owner?.label || owner?.displayName || owner?.username || "the current player";
}

function busyMessage(activeSession: ActiveSession | null | undefined, activeOwnedByCurrentUser: boolean) {
  if (!activeSession) return null;
  if (activeOwnedByCurrentUser) {
    return `${activeSession.appName} is already open for you. Stop it before opening another external app.`;
  }
  return `Sorry, try joining user "${ownerLabel(activeSession.owner)}" in "${activeSession.appName}".`;
}

export function Applications() {
  const presentation = usePresentationShell();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const appsQuery = useQuery({
    queryKey: ["applications", "apps"],
    queryFn: () => api.get<ApplicationsResponse>("/api/apphost/apps"),
  });

  const apps = appsQuery.data?.apps ?? [];
  const activeSession = appsQuery.data?.activeSession ?? null;
  const activeId = selectedId ?? apps[0]?.id ?? null;
  const activeApp = useMemo(
    () => apps.find((app) => app.id === activeId) ?? null,
    [activeId, apps]
  );
  const selectedIndex = Math.max(0, apps.findIndex((app) => app.id === activeId));
  const currentUserId = user?.id != null ? String(user.id) : null;
  const activeOwnerId = activeSession?.owner?.userId ? String(activeSession.owner.userId) : null;
  const activeOwnedByCurrentUser = Boolean(currentUserId && activeOwnerId && currentUserId === activeOwnerId);
  // Launching is blocked when someone else owns the active session (even for
  // the same title), or when the user's own session is for a different title.
  const selectedBlockedByActiveSession = Boolean(
    activeSession &&
      activeApp &&
      (!activeOwnedByCurrentUser || activeSession.appId !== activeApp.id)
  );
  const hostBusyMessage = selectedBlockedByActiveSession
    ? busyMessage(activeSession, activeOwnedByCurrentUser)
    : null;

  const statusQuery = useQuery({
    queryKey: ["applications", "status", activeId],
    queryFn: () => fetchStatus(activeId ?? ""),
    enabled: Boolean(activeId),
    refetchInterval: activeId ? 1000 : false,
  });

  const stopMutation = useMutation({
    mutationFn: (appId: string) =>
      api.post<LaunchResponse>(`/api/apphost/apps/${encodeURIComponent(appId)}/stop`, {}),
    onSuccess: (_data, appId) => {
      setSelectedId(appId);
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  const status = statusQuery.data?.status;
  const progress = fallbackProgress(activeApp, status, null);
  const StatusIcon = statusIcon(status);
  const busy = stopMutation.isPending || appsQuery.isFetching || statusQuery.isFetching;
  const loadError =
    appsQuery.error || statusQuery.error || stopMutation.error || null;
  const canStopSelected = Boolean(
    activeApp &&
      status &&
      (status.state === "running" || status.state === "launching") &&
      (!activeSession ||
        (activeSession.appId === activeApp.id && (activeOwnedByCurrentUser || !activeSession.owner?.userId)))
  );

  function selectRelative(delta: number) {
    if (apps.length === 0) return;
    const next = (selectedIndex + delta + apps.length) % apps.length;
    setSelectedId(apps[next]?.id ?? null);
  }

  function openApplicationTab(appId: string) {
    const opened = window.open(applicationPlayPath(appId), "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = applicationPlayPath(appId);
    }
  }

  return (
    <AppWindow title="Applications">
      <Shell
        data-applications-presentation-host={presentation.host}
        data-applications-surface="applications"
        data-applications-region="surface"
      >
        <Toolbar data-applications-region="toolbar">
          <TitleLine data-applications-region="title-line">
            <IconBox data-applications-region="icon">
              <MonitorUp size={18} />
            </IconBox>
            <TitleText data-applications-region="title">Applications</TitleText>
          </TitleLine>
          <ActionButton onClick={() => void appsQuery.refetch()} disabled={busy} data-applications-region="action-button">
            {busy ? <Hourglass size={16} /> : <RefreshCw size={15} />}
            Refresh
          </ActionButton>
        </Toolbar>

        {loadError ? (
          <EmptyState role="alert" data-applications-region="empty-state">
            {isApiRequestError(loadError) ? loadError.message : "Application host is unavailable"}
          </EmptyState>
        ) : null}

        <AppGrid data-applications-region="app-grid">
          <GroupBox label="External apps">
            {appsQuery.isLoading ? (
              <EmptyState data-applications-region="empty-state">Loading applications...</EmptyState>
            ) : apps.length === 0 ? (
              <EmptyState data-applications-region="empty-state">No application manifests are available.</EmptyState>
            ) : (
              <CarouselShell data-applications-region="carousel-shell">
                <CarouselControls data-applications-region="carousel-controls">
                  <ActionButton type="button" onClick={() => selectRelative(-1)} data-applications-region="action-button">
                    <ChevronLeft size={15} />
                    Previous
                  </ActionButton>
                  <AppMeta data-applications-region="app-meta">
                    {selectedIndex + 1} / {apps.length}
                  </AppMeta>
                  <ActionButton type="button" onClick={() => selectRelative(1)} data-applications-region="action-button">
                    Next
                    <ChevronRight size={15} />
                  </ActionButton>
                </CarouselControls>
                <TitleCarousel data-applications-region="title-carousel" aria-label="External app title selection">
                  {apps.map((app) => {
                    const isActive = app.id === activeId;
                    const isInUse = activeSession?.appId === app.id;
                    const isLocked = Boolean(activeSession && activeSession.appId !== app.id);
                    return (
                      <TitleCard
                        as="button"
                        key={app.id}
                        type="button"
                        $active={isActive}
                        $locked={isLocked}
                        onClick={() => setSelectedId(app.id)}
                        aria-pressed={isActive}
                        data-applications-region="title-card"
                        data-applications-app-id={app.id}
                      >
                        <CoverFrame data-applications-region="cover-frame">
                          {app.coverImageUrl ? (
                            <CoverImage
                              src={app.coverImageUrl}
                              alt={app.coverImageAlt || `${app.name} cover image`}
                              data-applications-region="cover-image"
                            />
                          ) : (
                            <CoverFallback data-applications-region="cover-image">{app.name}</CoverFallback>
                          )}
                        </CoverFrame>
                        <CardBody>
                          <AppName data-applications-region="app-name">{app.name}</AppName>
                          <CardSummary data-applications-region="card-summary">
                            {app.summary || "Remote hosted app"}
                          </CardSummary>
                          <CardPillRow>
                            <Tag data-applications-region="card-pill">{app.category || "External app"}</Tag>
                            {isInUse ? <Tag data-applications-region="card-pill">In use</Tag> : null}
                          </CardPillRow>
                        </CardBody>
                      </TitleCard>
                    );
                  })}
                </TitleCarousel>
              </CarouselShell>
            )}
          </GroupBox>

          <DetailPanel data-applications-region="detail-panel">
            <GroupBox label={activeApp?.name ?? "Application"}>
              {activeApp ? (
                <LaunchWindow data-applications-region="launch-window">
                  {hostBusyMessage ? (
                    <ConflictBanner role="status" data-applications-region="conflict-banner">
                      {hostBusyMessage}
                    </ConflictBanner>
                  ) : null}
                  <StatusLine data-applications-region="status-line">
                    <strong>{activeApp.name}</strong>
                    <StatePill $state={status?.state ?? "unknown"} data-applications-region="state-pill">
                      <StatusIcon size={14} />
                      {progress.label}
                    </StatePill>
                  </StatusLine>
                  <StatusBlock data-applications-region="status-block">
                    <ProgressBlock data-applications-region="progress">
                      <ProgressHeader data-applications-region="progress-header">
                        <span>{progress.label}</span>
                        <span>{progress.percent}%</span>
                      </ProgressHeader>
                      <ProgressTrack
                        data-applications-region="progress-track"
                        role="progressbar"
                        aria-label={`${activeApp.name} launch progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress.percent}
                      >
                        <ProgressFill $percent={progress.percent} data-applications-region="progress-fill" />
                      </ProgressTrack>
                      <ProgressDetail data-applications-region="progress-detail">{progress.detail}</ProgressDetail>
                    </ProgressBlock>
                  </StatusBlock>
                  <ActionRow data-applications-region="actions">
                    <ActionButton
                      onClick={() => openApplicationTab(activeApp.id)}
                      disabled={selectedBlockedByActiveSession}
                      data-applications-region="action-button"
                    >
                      <Play size={15} />
                      Open
                    </ActionButton>
                    <ActionButton
                      onClick={() => stopMutation.mutate(activeApp.id)}
                      disabled={stopMutation.isPending || !canStopSelected}
                      data-applications-region="action-button"
                    >
                      <Square size={15} />
                      Stop
                    </ActionButton>
                    <ActionButton onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching} data-applications-region="action-button">
                      <RefreshCw size={15} />
                      Status
                    </ActionButton>
                  </ActionRow>
                  <SupportNote data-applications-region="support-note">
                    wtfOS handles setup privately and opens the selected application when it is ready.
                  </SupportNote>
                </LaunchWindow>
              ) : (
                <EmptyState data-applications-region="empty-state">Select an application.</EmptyState>
              )}
            </GroupBox>
          </DetailPanel>
        </AppGrid>

        <div data-applications-region="separator">
          <Separator />
        </div>
      </Shell>
    </AppWindow>
  );
}
