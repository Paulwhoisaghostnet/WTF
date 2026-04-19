import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Hourglass,
  Panel,
  TextInput,
  ProgressBar,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { useWindowManager } from "../lib/window-context";
import { api } from "../lib/api";
import {
  STUDIO_MEMBER_ROLE_LABELS,
  STUDIO_STORAGE_BACKEND_LABELS,
  type StudioProjectSummary,
  type StudioStorageBackend,
} from "@shared/types";
import { MOBILE } from "../global-styles";

/* ─── Styled ─────────────────────────────────────────── */

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
`;

const HeaderRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  justify-content: space-between;
`;

const Intro = styled.div`
  max-width: 520px;
  font-size: 12px;
  color: #1a1a1a;

  strong {
    color: #000080;
  }
`;

const CreatePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 8px;
`;

const CreateRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const ScrollGrid = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
  padding: 4px;

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const ProjectCard = styled.button`
  text-align: left;
  background: #fff;
  border: 2px solid #8c8c8c;
  padding: 10px;
  cursor: pointer;
  box-shadow: 2px 2px 0 #000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: inherit;
  color: #000;

  &:hover {
    background: #f7f3dc;
    border-color: #000080;
  }
`;

const CardTitle = styled.div`
  font-size: 14px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const CardMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: #333;
`;

const Badge = styled.span<{ $kind?: "role" | "warn" | "info" }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  font-size: 10px;
  border: 1px solid #000;
  background: ${(p) =>
    p.$kind === "warn"
      ? "#ffd48a"
      : p.$kind === "info"
      ? "#bcd6ff"
      : "#e4e4e4"};
`;

const QuotaWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #333;
`;

const EmptyState = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: #555;

  h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }
`;

const ErrorBanner = styled.div`
  background: #ffe2e2;
  border: 1px solid #c06060;
  padding: 6px 8px;
  font-size: 12px;
  color: #800;
`;

const DrivePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DriveHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
`;

const DriveStat = styled.div`
  font-size: 11px;
  color: #333;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
`;

const DriveUsageWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 200px;
  flex: 1;
  font-size: 11px;
`;

/* ─── Component ──────────────────────────────────────── */

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface ProjectsResponse {
  projects: StudioProjectSummary[];
}

interface UserStateResponse {
  lastOpenProjectId: number | null;
  state: Record<string, unknown>;
  updatedAt: string | null;
}

interface DriveStatusResponse {
  ok: boolean;
  envConfigured: boolean;
  cryptoConfigured: boolean;
  canConnect: boolean;
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scopes: string | null;
  connectedAt: string | null;
  lastRefreshedAt: string | null;
  hasDedicatedRedirect: boolean;
  // Studio's footprint in the user's Drive.  Not a total quota — we
  // only request `drive.file`, which cannot see the user's overall
  // storage ceiling.  This tells the user how much space Studio itself
  // is using in their Drive.
  appUsage: { bytes: number; fileCount: number } | null;
  dependentProjectCount: number;
}

export function Studio() {
  const { user, hasPermission } = useAuth();
  const wm = useWindowManager();
  const qc = useQueryClient();

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const resumedRef = useRef(false);

  const canAccess = hasPermission("access_studio");
  const canCreate = hasPermission("create_studio_projects");

  const projectsQuery = useQuery({
    queryKey: ["studio", "projects"],
    queryFn: () => api.get<ProjectsResponse>("/api/studio/projects"),
    enabled: !!user && canAccess,
    staleTime: 10_000,
  });

  const userStateQuery = useQuery({
    queryKey: ["studio", "user-state"],
    queryFn: () => api.get<UserStateResponse>("/api/studio/user-state"),
    enabled: !!user && canAccess,
    staleTime: 30_000,
  });

  const driveStatusQuery = useQuery({
    queryKey: ["studio", "drive-status"],
    queryFn: () =>
      api.get<DriveStatusResponse>("/api/studio/drive/status"),
    enabled: !!user && canAccess,
    staleTime: 30_000,
  });

  const connectDriveMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; authorizeUrl: string }>(
        "/api/studio/drive/start",
        {}
      ),
    onSuccess: (data) => {
      if (data?.authorizeUrl) {
        window.open(data.authorizeUrl, "_blank", "noopener,noreferrer");
      }
    },
  });

  const disconnectDriveMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>("/api/studio/drive/disconnect", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio", "drive-status"] });
    },
  });

  const refreshUsageMutation = useMutation({
    mutationFn: () =>
      api.post<{
        ok: boolean;
        appUsage: { bytes: number; fileCount: number };
      }>("/api/studio/drive/refresh-quota", {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["studio", "drive-status"] });
      // Seed the cache so the usage line updates instantly instead of
      // waiting for the /drive/status round-trip.
      qc.setQueryData<DriveStatusResponse | undefined>(
        ["studio", "drive-status"],
        (prev) =>
          prev && data?.appUsage
            ? { ...prev, appUsage: data.appUsage }
            : prev,
      );
    },
  });

  // Auto-resume: when the list page opens and we have a persisted
  // `lastOpenProjectId` that the user still belongs to, hop directly into
  // that project.  We only do this once per mount.
  useEffect(() => {
    if (resumedRef.current) return;
    if (!userStateQuery.data?.lastOpenProjectId) return;
    if (!projectsQuery.data?.projects) return;
    const resumeId = userStateQuery.data.lastOpenProjectId;
    const match = projectsQuery.data.projects.find(
      (p) => p.id === resumeId && !p.archived
    );
    if (!match) return;
    resumedRef.current = true;
    wm.openPage(`/studio/${match.id}`);
  }, [userStateQuery.data, projectsQuery.data, wm]);

  const createMutation = useMutation({
    mutationFn: (input: {
      name: string;
      description: string | null;
      storageBackend: StudioStorageBackend;
    }) => api.post<StudioProjectSummary>("/api/studio/projects", input),
    onSuccess: (created) => {
      setNewName("");
      setNewDescription("");
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ["studio", "projects"] });
      wm.openPage(`/studio/${created.id}`);
    },
    onError: (err: Error) => {
      setCreateError(err.message || "Failed to create project");
    },
  });

  const sorted = useMemo(() => {
    const list = projectsQuery.data?.projects ?? [];
    return [...list].sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [projectsQuery.data]);

  if (!user) {
    return (
      <AppWindow title="Studio">
        <Layout>
          <EmptyState>
            <h3>Sign in to enter Studio</h3>
            <p>Studio is a private collaborative workspace for WTF creators.</p>
          </EmptyState>
        </Layout>
      </AppWindow>
    );
  }

  if (!canAccess) {
    return (
      <AppWindow title="Studio">
        <Layout>
          <EmptyState>
            <h3>Studio is invite-only for your current role</h3>
            <p>
              Ask a host or climb to Witness to browse shared project rooms.
            </p>
          </EmptyState>
        </Layout>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Studio">
      <Layout>
        <HeaderRow>
          <Intro>
            <strong>Studio</strong> is the private creator room of WTF. Drop
            files, drop notes, mark things up, and keep the conversation
            attached to the work. Everything stays inside the platform.
          </Intro>
        </HeaderRow>

        {canCreate ? (
          <GroupBox label="New project">
            <CreatePanel>
              <CreateRow>
                <TextInput
                  placeholder="Project name"
                  value={newName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewName(e.target.value)
                  }
                  style={{ flex: 1, minWidth: 180 }}
                  maxLength={200}
                />
                <TextInput
                  placeholder="Short description (optional)"
                  value={newDescription}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewDescription(e.target.value)
                  }
                  style={{ flex: 2, minWidth: 220 }}
                  maxLength={500}
                />
                <Button
                  onClick={() => {
                    const name = newName.trim();
                    if (!name) {
                      setCreateError("Project name is required");
                      return;
                    }
                    createMutation.mutate({
                      name,
                      description: newDescription.trim() || null,
                      storageBackend: "local_disk",
                    });
                  }}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </CreateRow>
              {createError ? <ErrorBanner>{createError}</ErrorBanner> : null}
              <div style={{ marginTop: 6, fontSize: 11, color: "#333" }}>
                {driveStatusQuery.data?.connected
                  ? `New projects will use your connected Google Drive (${driveStatusQuery.data.accountEmail ?? "signed in"}).`
                  : driveStatusQuery.data?.canConnect
                  ? "New projects use platform storage by default. Connect your own Google Drive below to route your projects there instead."
                  : "New projects start on platform storage."}
              </div>
            </CreatePanel>
          </GroupBox>
        ) : (
          <GroupBox label="New project">
            <CreatePanel>
              <div style={{ fontSize: 12 }}>
                You can view projects you’ve been invited to, but project
                creation is unlocked at the Contestant role.
              </div>
            </CreatePanel>
          </GroupBox>
        )}

        <GroupBox label="Your Drive">
          <DrivePanel>
            {driveStatusQuery.isLoading ? (
              <div style={{ fontSize: 12, color: "#555" }}>
                Checking Drive connection…
              </div>
            ) : !driveStatusQuery.data?.canConnect ? (
              <div style={{ fontSize: 12, color: "#555" }}>
                Google Drive integration hasn't been configured on this
                deployment yet. Projects you create will use platform
                storage only.
              </div>
            ) : driveStatusQuery.data.connected ? (
              <>
                <DriveHeader>
                  <DriveStat>
                    <strong style={{ color: "#0a5c1b" }}>
                      Connected
                    </strong>
                    <span>
                      as {driveStatusQuery.data.accountEmail ?? "(email unknown)"}
                    </span>
                    {driveStatusQuery.data.dependentProjectCount > 0 ? (
                      <Badge>
                        {driveStatusQuery.data.dependentProjectCount}{" "}
                        project{driveStatusQuery.data.dependentProjectCount === 1 ? "" : "s"}{" "}
                        rely on this Drive
                      </Badge>
                    ) : null}
                  </DriveStat>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button
                      onClick={() => refreshUsageMutation.mutate()}
                      disabled={refreshUsageMutation.isPending}
                      title="Recount bytes & files Studio is using in this Drive"
                    >
                      {refreshUsageMutation.isPending
                        ? "Refreshing…"
                        : "Refresh Studio usage"}
                    </Button>
                    <Button
                      onClick={() => {
                        const count =
                          driveStatusQuery.data?.dependentProjectCount ?? 0;
                        const warn =
                          count > 0
                            ? `Disconnect? ${count} project${count === 1 ? "" : "s"} backed by this Drive will lose read/write access until you reconnect the same Google account.`
                            : "Disconnect your Drive?";
                        if (window.confirm(warn)) {
                          disconnectDriveMutation.mutate();
                        }
                      }}
                      disabled={disconnectDriveMutation.isPending}
                    >
                      {disconnectDriveMutation.isPending
                        ? "Disconnecting…"
                        : "Disconnect"}
                    </Button>
                  </div>
                </DriveHeader>
                {driveStatusQuery.data.appUsage ? (
                  <DriveUsageWrap>
                    <span>
                      Studio is using{" "}
                      <strong>
                        {formatBytes(driveStatusQuery.data.appUsage.bytes)}
                      </strong>{" "}
                      across {driveStatusQuery.data.appUsage.fileCount}{" "}
                      file
                      {driveStatusQuery.data.appUsage.fileCount === 1
                        ? ""
                        : "s"}
                      {" "}in your Drive.
                    </span>
                  </DriveUsageWrap>
                ) : (
                  <div style={{ fontSize: 11, color: "#777" }}>
                    Usage will populate after the first refresh.
                  </div>
                )}
                {refreshUsageMutation.isError ? (
                  <ErrorBanner>
                    {(refreshUsageMutation.error as Error)?.message ||
                      "Failed to refresh Studio usage."}
                  </ErrorBanner>
                ) : null}
                <div style={{ fontSize: 11, color: "#555" }}>
                  New projects default to your Drive. Files stay in
                  your account — disconnecting revokes access until you
                  reconnect the same Google account.
                </div>
                <div style={{ fontSize: 11, color: "#777" }}>
                  We request only the <code>drive.file</code> scope, so
                  Studio can't see your total Drive quota — the number
                  above is just Studio's own footprint in your Drive.
                </div>
              </>
            ) : (
              <>
                <DriveHeader>
                  <DriveStat>
                    <strong>Not connected</strong>
                    <span style={{ color: "#555" }}>
                      New projects use platform storage until you connect.
                    </span>
                  </DriveStat>
                  <Button
                    onClick={() => connectDriveMutation.mutate()}
                    disabled={connectDriveMutation.isPending}
                  >
                    {connectDriveMutation.isPending
                      ? "Opening…"
                      : "Connect Google Drive"}
                  </Button>
                </DriveHeader>
                <div style={{ fontSize: 11, color: "#555" }}>
                  We request the minimum Drive scope —{" "}
                  <code>drive.file</code> — which only gives Studio access
                  to files it creates in your Drive. You can revoke at any
                  time from your Google account settings or from this
                  panel.
                </div>
                {connectDriveMutation.isError ? (
                  <ErrorBanner>
                    {(connectDriveMutation.error as Error)?.message ||
                      "Failed to start Drive connection."}
                  </ErrorBanner>
                ) : null}
              </>
            )}
          </DrivePanel>
        </GroupBox>

        <GroupBox label="Your projects" style={{ flex: 1, minHeight: 0 }}>
          <ScrollGrid>
            {projectsQuery.isLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 200,
                }}
              >
                <Hourglass size={32} />
              </div>
            ) : projectsQuery.isError ? (
              <ErrorBanner>
                {(projectsQuery.error as Error).message ||
                  "Failed to load projects."}
              </ErrorBanner>
            ) : sorted.length === 0 ? (
              <EmptyState>
                <h3>No projects yet</h3>
                <p>
                  {canCreate
                    ? "Create your first room above and start dropping work."
                    : "Ask a collaborator to invite you to their project."}
                </p>
              </EmptyState>
            ) : (
              <Grid>
                {sorted.map((project) => {
                  const usedPct = project.storageQuotaBytes
                    ? Math.min(
                        100,
                        Math.round(
                          (project.storageUsedBytes /
                            project.storageQuotaBytes) *
                            100
                        )
                      )
                    : 0;
                  return (
                    <ProjectCard
                      key={project.id}
                      onClick={() => wm.openPage(`/studio/${project.id}`)}
                    >
                      <CardTitle>
                        <span>{project.name}</span>
                        {project.archived ? (
                          <Badge $kind="warn">archived</Badge>
                        ) : null}
                      </CardTitle>
                      {project.description ? (
                        <div style={{ fontSize: 12, color: "#333" }}>
                          {project.description.length > 140
                            ? `${project.description.slice(0, 137)}…`
                            : project.description}
                        </div>
                      ) : null}
                      <CardMeta>
                        <Badge $kind="role">
                          {STUDIO_MEMBER_ROLE_LABELS[project.role]}
                        </Badge>
                        <Badge>{project.memberCount} members</Badge>
                        <Badge>{project.fileCount} files</Badge>
                        {project.unresolvedAnnotations > 0 ? (
                          <Badge $kind="info">
                            {project.unresolvedAnnotations} open notes
                          </Badge>
                        ) : null}
                        <span style={{ color: "#777" }}>
                          {formatRelative(project.updatedAt)}
                        </span>
                      </CardMeta>
                      <QuotaWrap>
                        <span>
                          {formatBytes(project.storageUsedBytes)} /{" "}
                          {formatBytes(project.storageQuotaBytes)}
                        </span>
                        <div style={{ flex: 1, minWidth: 60 }}>
                          <ProgressBar value={usedPct} hideValue />
                        </div>
                        <span style={{ color: "#555" }}>
                          {
                            STUDIO_STORAGE_BACKEND_LABELS[
                              project.storageBackend
                            ]
                          }
                        </span>
                      </QuotaWrap>
                    </ProjectCard>
                  );
                })}
              </Grid>
            )}
          </ScrollGrid>
        </GroupBox>
      </Layout>
    </AppWindow>
  );
}
