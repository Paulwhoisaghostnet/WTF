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
import { usePresentationShell } from "../lib/presentation-shell";
import {
  STUDIO_MEMBER_ROLE_LABELS,
  STUDIO_STORAGE_BACKEND_LABELS,
  type StudioProjectSummary,
  type StudioStorageBackend,
  type StudioProjectNetwork,
  type StudioProjectUseCase,
} from "@shared/types";
import { MOBILE } from "../global-styles";

/* ─── Styled ─────────────────────────────────────────── */

const studioRegionAttrs = (region: string): any => ({
  "data-studio-region": region,
});

const gammaStudioScope = `[data-studio-presentation-host="gamma"]`;

const Layout = styled.div.attrs(studioRegionAttrs("project-list-surface"))`
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;

  &[data-studio-presentation-host="gamma"] {
    background: #070706;
    background-image: none;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-studio-presentation-host="gamma"],
  &[data-studio-presentation-host="gamma"] * {
    background-image: none !important;
    box-shadow: none !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-studio-presentation-host="gamma"] :where(button, input, textarea, select, p, span, strong, div, section, article, h1, h2, h3, h4, label, legend, fieldset) {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-studio-presentation-host="gamma"] :where(code, pre) {
    color: #00d2ff !important;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace !important;
  }

  &[data-studio-presentation-host="gamma"] :where(p, span, div, label, legend, strong) {
    color: #f2ead9 !important;
  }

  &[data-studio-presentation-host="gamma"] :where(fieldset, [data-studio-region]) {
    border-color: rgba(242, 234, 217, 0.2) !important;
    border-radius: 6px !important;
  }

  &[data-studio-presentation-host="gamma"] :where(fieldset) {
    background: color-mix(in srgb, #11110f 82%, #070706) !important;
  }

  &[data-studio-presentation-host="gamma"] :where(legend) {
    color: #00d2ff !important;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace !important;
    font-size: 12px !important;
    text-transform: uppercase;
  }
`;

const HeaderRow = styled.div.attrs(studioRegionAttrs("list-header"))`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  justify-content: space-between;
`;

const RunwayIntro = styled.section.attrs(studioRegionAttrs("runway-intro"))`
  border: 1px solid var(--wtf-app-border, #808080);
  background: color-mix(in srgb, var(--wtf-app-surface-raised, #fff) 90%, #b8f2ff);
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(260px, 1.4fr) minmax(360px, 2fr);
  gap: 18px;
  align-items: center;

  h1 { margin: 0 0 5px; font-size: 22px; }
  p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--wtf-app-muted-text, #444); }

  ${gammaStudioScope} & {
    background: #0d0d0b;
    border-color: rgba(0, 210, 255, 0.35) !important;
    border-radius: 6px;
  }

  ${MOBILE} { grid-template-columns: 1fr; }
`;

const RunwaySteps = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(6, minmax(76px, 1fr));
  gap: 4px;
  counter-reset: studio-step;

  li {
    counter-increment: studio-step;
    min-height: 54px;
    padding: 7px;
    border: 1px solid var(--wtf-app-border, #8b929a);
    background: var(--wtf-app-surface-raised, #fff);
    font-size: 11px;
    font-weight: 700;
  }
  li::before { content: "0" counter(studio-step); display: block; margin-bottom: 6px; color: #067c96; font-family: monospace; }
  ${gammaStudioScope} & li { background: #11110f; border-color: rgba(242,234,217,.2); }
  @media (max-width: 760px) { grid-template-columns: repeat(3, 1fr); }
`;

const CreateSelect = styled.select`
  min-height: var(--wtf-control-height, 32px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  padding: 4px 7px;
  font: inherit;
`;

const Intro = styled.div.attrs(studioRegionAttrs("intro"))`
  max-width: 520px;
  font-size: var(--wtf-type-body, 14px);
  color: var(--wtf-app-text, #111);

  strong {
    color: var(--wtf-app-link, #000080);
  }

  ${gammaStudioScope} & {
    max-width: 680px;
    color: rgba(242, 234, 217, 0.74);
    line-height: 1.5;
  }

  ${gammaStudioScope} & strong {
    color: #00d2ff;
  }
`;

const CreatePanel = styled(Panel).attrs({
  variant: "well",
  ...studioRegionAttrs("create-panel"),
})`
  padding: 8px;

  ${gammaStudioScope} & {
    background: color-mix(in srgb, #11110f 78%, #070706) !important;
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    color: #f2ead9;
  }
`;

const CreateRow = styled.div.attrs(studioRegionAttrs("create-row"))`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const ScrollGrid = styled.div.attrs(studioRegionAttrs("project-scroll"))`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const Grid = styled.div.attrs(studioRegionAttrs("project-grid"))`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
  padding: 4px;

  ${MOBILE} {
    grid-template-columns: 1fr;
  }
`;

const ProjectCard = styled.button.attrs(studioRegionAttrs("project-card"))`
  text-align: left;
  background: var(--wtf-app-surface-raised, #ffffff);
  border: 1px solid var(--wtf-app-border, #808080);
  padding: var(--wtf-space-3, 12px);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-2, 8px);
  font-family: inherit;
  color: var(--wtf-app-text, #111);

  &:hover {
    background: var(--wtf-app-surface, #f4f4f4);
    border-color: var(--wtf-app-link, #000080);
  }

  ${gammaStudioScope} & {
    background: color-mix(in srgb, #11110f 78%, #070706);
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
  }

  ${gammaStudioScope} &:hover,
  ${gammaStudioScope} &:focus-visible {
    background: color-mix(in srgb, #11110f 72%, #00d2ff 8%);
    border-color: #00d2ff;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }
`;

const CardTitle = styled.div.attrs(studioRegionAttrs("project-title"))`
  font-size: 14px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 6px;

  ${gammaStudioScope} & {
    color: #f2ead9;
  }
`;

const CardMeta = styled.div.attrs(studioRegionAttrs("project-meta"))`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #444);

  ${gammaStudioScope} & {
    color: rgba(242, 234, 217, 0.7);
  }
`;

const Badge = styled.span.attrs(studioRegionAttrs("badge"))<{ $kind?: "role" | "warn" | "info" }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 22px;
  padding: 2px 7px;
  font-size: var(--wtf-type-caption, 13px);
  border: 1px solid var(--wtf-app-border, #808080);
  color: var(--wtf-app-text, #111);
  background: ${(p) =>
    p.$kind === "warn"
      ? "color-mix(in srgb, var(--wtf-app-warning, #8a4b00) 18%, #ffffff)"
      : p.$kind === "info"
      ? "color-mix(in srgb, var(--wtf-app-info, #175cd3) 16%, #ffffff)"
      : "var(--wtf-app-surface-raised, #ffffff)"};

  ${gammaStudioScope} & {
    background: ${(p) =>
      p.$kind === "warn"
        ? "color-mix(in srgb, #d6ff3f 12%, #11110f)"
        : p.$kind === "info"
        ? "color-mix(in srgb, #00d2ff 12%, #11110f)"
        : "color-mix(in srgb, #11110f 84%, #070706)"};
    border: 1px solid ${(p) => (p.$kind === "info" ? "#00d2ff" : "rgba(242, 234, 217, 0.2)")};
    border-radius: 6px;
    color: ${(p) => (p.$kind === "warn" ? "#d6ff3f" : "#f2ead9")} !important;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }
`;

const QuotaWrap = styled.div.attrs(studioRegionAttrs("quota"))`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #444);

  ${gammaStudioScope} & {
    color: rgba(242, 234, 217, 0.7);
  }
`;

const EmptyState = styled.div.attrs(studioRegionAttrs("empty-state"))`
  padding: 40px 20px;
  text-align: center;
  color: var(--wtf-app-muted-text, #444);

  h3 {
    margin: 0 0 6px;
    font-size: var(--wtf-type-body-strong, 15px);
  }

  ${gammaStudioScope} & {
    background: color-mix(in srgb, #11110f 68%, #070706);
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.72);
  }

  ${gammaStudioScope} & h3 {
    color: #00d2ff;
  }
`;

const ErrorBanner = styled.div.attrs(studioRegionAttrs("error-banner"))`
  background: color-mix(in srgb, var(--wtf-app-danger, #b42318) 14%, #ffffff);
  border: 1px solid var(--wtf-app-danger, #b42318);
  padding: 6px 8px;
  font-size: var(--wtf-type-body, 14px);
  color: var(--wtf-app-text, #111);

  ${gammaStudioScope} & {
    background: color-mix(in srgb, #b42318 18%, #11110f);
    border: 1px solid color-mix(in srgb, #b42318 70%, #f2ead9);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const DrivePanel = styled(Panel).attrs({
  variant: "well",
  ...studioRegionAttrs("drive-panel"),
})`
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  ${gammaStudioScope} & {
    background: color-mix(in srgb, #11110f 78%, #070706) !important;
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    color: #f2ead9;
  }
`;

const DriveHeader = styled.div.attrs(studioRegionAttrs("drive-header"))`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
`;

const DriveStat = styled.div.attrs(studioRegionAttrs("drive-stat"))`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #444);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;

  ${gammaStudioScope} & {
    color: rgba(242, 234, 217, 0.72);
  }

  ${gammaStudioScope} & strong {
    color: #d6ff3f !important;
  }
`;

const DriveUsageWrap = styled.div.attrs(studioRegionAttrs("drive-usage"))`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 200px;
  flex: 1;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaStudioScope} & {
    color: rgba(242, 234, 217, 0.72);
  }

  ${gammaStudioScope} & strong {
    color: #00d2ff !important;
  }
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
  const presentation = usePresentationShell();

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newUseCase, setNewUseCase] = useState<StudioProjectUseCase>("artwork");
  const [newNetwork, setNewNetwork] = useState<StudioProjectNetwork>("shadownet");
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
      workflow: { useCase: StudioProjectUseCase; targetNetwork: StudioProjectNetwork };
    }) => api.post<StudioProjectSummary>("/api/studio/projects", input),
    onSuccess: (created) => {
      setNewName("");
      setNewDescription("");
      setNewUseCase("artwork");
      setNewNetwork("shadownet");
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
        <Layout data-studio-presentation-host={presentation.host} data-studio-surface="project-list">
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
        <Layout data-studio-presentation-host={presentation.host} data-studio-surface="project-list">
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
      <Layout data-studio-presentation-host={presentation.host} data-studio-surface="project-list">
        <RunwayIntro>
          <div>
            <h1>Take a Tezos project from idea to release.</h1>
            <p>
              Studio is the shared project authority for the work: frame the concept,
              coordinate in WIM, create with broot, review together, preserve on IPFS,
              mint through Pasta Protocol, and present through wtf Live.
            </p>
          </div>
          <RunwaySteps aria-label="Studio project lifecycle">
            <li>Concept</li><li>Collaborate</li><li>Create</li><li>Refine</li><li>Release</li><li>Activate</li>
          </RunwaySteps>
        </RunwayIntro>

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
                <CreateSelect
                  aria-label="Project use case"
                  value={newUseCase}
                  onChange={(event) => setNewUseCase(event.target.value as StudioProjectUseCase)}
                >
                  <option value="artwork">Artwork or media</option>
                  <option value="collection">Collection or edition</option>
                  <option value="live_experience">Live experience</option>
                  <option value="protocol">Protocol or application</option>
                  <option value="other">Other Tezos project</option>
                </CreateSelect>
                <CreateSelect
                  aria-label="Target Tezos network"
                  value={newNetwork}
                  onChange={(event) => setNewNetwork(event.target.value as StudioProjectNetwork)}
                >
                  <option value="shadownet">Shadownet · prove first</option>
                  <option value="mainnet">Mainnet · value-bearing</option>
                </CreateSelect>
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
                      workflow: { useCase: newUseCase, targetNetwork: newNetwork },
                    });
                  }}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </CreateRow>
              {createError ? <ErrorBanner>{createError}</ErrorBanner> : null}
              <div
                style={{
                  marginTop: 6,
                  fontSize: "var(--wtf-type-caption, 13px)",
                  color: "var(--wtf-app-muted-text, #444)",
                }}
              >
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
              <div style={{ fontSize: "var(--wtf-type-body, 14px)" }}>
                You can view projects you’ve been invited to, but project
                creation is unlocked at the Contestant role.
              </div>
            </CreatePanel>
          </GroupBox>
        )}

        <GroupBox label="Your Drive">
          <DrivePanel>
            {driveStatusQuery.isLoading ? (
              <div style={{ fontSize: "var(--wtf-type-body, 14px)", color: "var(--wtf-app-muted-text, #444)" }}>
                Checking Drive connection…
              </div>
            ) : !driveStatusQuery.data?.canConnect ? (
              <div style={{ fontSize: "var(--wtf-type-body, 14px)", color: "var(--wtf-app-muted-text, #444)" }}>
                Google Drive integration hasn't been configured on this
                deployment yet. Projects you create will use platform
                storage only.
              </div>
            ) : driveStatusQuery.data.connected ? (
              <>
                <DriveHeader>
                  <DriveStat>
                    <strong style={{ color: "var(--wtf-app-success, #176b38)" }}>
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
                  <div
                    style={{
                      fontSize: "var(--wtf-type-caption, 13px)",
                      color: "var(--wtf-app-muted-text, #444)",
                    }}
                  >
                    Usage will populate after the first refresh.
                  </div>
                )}
                {refreshUsageMutation.isError ? (
                  <ErrorBanner>
                    {(refreshUsageMutation.error as Error)?.message ||
                      "Failed to refresh Studio usage."}
                  </ErrorBanner>
                ) : null}
                <div
                  style={{
                    fontSize: "var(--wtf-type-caption, 13px)",
                    color: "var(--wtf-app-muted-text, #444)",
                  }}
                >
                  New projects default to your Drive. Files stay in
                  your account — disconnecting revokes access until you
                  reconnect the same Google account.
                </div>
                <div
                  style={{
                    fontSize: "var(--wtf-type-caption, 13px)",
                    color: "var(--wtf-app-muted-text, #444)",
                  }}
                >
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
                    <span style={{ color: "var(--wtf-app-muted-text, #444)" }}>
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
                <div
                  style={{
                    fontSize: "var(--wtf-type-caption, 13px)",
                    color: "var(--wtf-app-muted-text, #444)",
                  }}
                >
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
                  const workflow = project.workflow ?? {
                    phase: "concept" as const,
                    useCase: "artwork" as const,
                    targetNetwork: "shadownet" as const,
                    checklist: {},
                    references: {},
                  };
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
                      aria-label={`Open project ${project.name}`}
                      data-studio-project-id={project.id}
                      onClick={() => wm.openPage(`/studio/${project.id}`)}
                    >
                      <CardTitle>
                        <span>{project.name}</span>
                        <Badge $kind="info">{workflow.phase}</Badge>
                        {project.archived ? (
                          <Badge $kind="warn">archived</Badge>
                        ) : null}
                      </CardTitle>
                      {project.description ? (
                        <div style={{ fontSize: "var(--wtf-type-body, 14px)", color: "var(--wtf-app-text, #111)" }}>
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
                        <Badge>{workflow.targetNetwork}</Badge>
                        {project.unresolvedAnnotations > 0 ? (
                          <Badge $kind="info">
                            {project.unresolvedAnnotations} open notes
                          </Badge>
                        ) : null}
                        <span style={{ color: "var(--wtf-app-muted-text, #444)" }}>
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
                        <span style={{ color: "var(--wtf-app-muted-text, #444)" }}>
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
