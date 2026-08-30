import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hourglass, Separator } from "react95";
import {
  Archive,
  Boxes,
  Database,
  FileArchive,
  Folder,
  FolderOpen,
  HardDrive,
  Image,
  Share2,
  Shield,
} from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { WTF_DWELLINGS, type WtfDwellingKey } from "@shared/wtf-dwellings";
import {
  type WtfProjectBundleManifest,
  type WtfProjectBundleSection,
} from "@shared/wtf-project-bundles";
import {
  type WtfMediaServiceCapability,
  type WtfMediaServiceContract,
} from "@shared/wtf-media-service";
import { buildWtfIpfsGatewayPolicy } from "@shared/ipfs-gateways";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiEmptyState, UiPanel } from "../components/wtfos-ui";
import {
  agentFilesystemStats,
  readAgentProjectSnapshots,
} from "../features/agent/agent-filesystem";
import { api } from "../lib/api";
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";
import { MintManagerDialog, type MintManagerArtifact } from "../features/media-library/MintManagerDialog";
import {
  asFileManagerArray,
  resolveIpfsGatewayPolicy,
  resolveMediaServiceContract,
  resolveProjectBundleManifest,
} from "./file-manager-model";

type MediaItem = {
  id: number;
  title: string;
  mediaCategory: string;
  fileSize?: number | null;
  fileSizeBytes?: number | null;
  updatedAt?: string | null;
  sourceType?: string | null;
  status?: string | null;
  mimeType?: string | null;
};

type StudioProject = {
  id: number;
  name: string;
  fileCount?: number | null;
  storageUsedBytes?: number | null;
  updatedAt?: string | null;
};

type StudioProjectsResponse = {
  projects: StudioProject[];
};

type Dwelling = {
  key: WtfDwellingKey;
  label: string;
  path: string;
  route: string;
  owner: string;
  count: string;
  detail: string;
  icon: typeof Folder;
};

const Shell = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  &[data-gamma-utility-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-gamma-utility-presentation-host="gamma"],
  &[data-gamma-utility-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region] {
    min-width: 0;
    background-image: none;
    border-radius: 6px;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="status-cell"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="panel"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="dwelling-row"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="bundle-row"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="service-row"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="recent-row"] {
    border: 1px solid rgba(242, 234, 217, 0.16);
    background: #11110f;
    color: #f2ead9;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="label"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="meta"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="purpose"] {
    color: rgba(242, 234, 217, 0.7);
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="label"] {
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 0.74rem;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="icon"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="badge"] {
    border: 1px solid rgba(0, 210, 255, 0.5);
    background: #070706;
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"] {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:hover,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:focus-visible {
    border-color: #00d2ff;
    color: #f2ead9;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 1160px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div`
  min-height: 58px;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
`;

const StatusLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: var(--wtf-app-muted-text, #384352);
  line-height: 1.25;
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: var(--wtf-type-body, 15px);
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const DwellingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const DwellingRow = styled.div`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  min-height: 72px;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  min-width: 0;

  @media (max-width: 560px) {
    grid-template-columns: 32px minmax(0, 1fr);
  }
`;

const IconBox = styled.div`
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #111);
`;

const RowTitle = styled.div`
  font-size: var(--wtf-type-body, 15px);
  font-weight: bold;
  overflow-wrap: anywhere;
  line-height: 1.25;
`;

const RowMeta = styled.div`
  margin-top: 2px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const OpenButton = styled(UiButton)`
  min-width: 116px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: var(--wtf-type-caption, 13px);
  white-space: normal;

  @media (max-width: 560px) {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 44px;
  }
`;

const RecentList = styled.div`
  display: grid;
  gap: 6px;
`;

const RecentRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  min-width: 0;
`;

const BundleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const BundleRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  min-width: 0;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const BundlePurpose = styled.div`
  margin-top: 2px;
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const ServiceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ServiceRow = styled.div`
  min-height: 82px;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
`;

const PolicyBadge = styled.span`
  display: inline-block;
  margin-left: 5px;
  padding: 1px 4px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-info-bg, var(--wtf-app-surface, #f4f4f4));
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
`;

function itemBytes(item: MediaItem) {
  return Number(item.fileSizeBytes ?? item.fileSize ?? 0) || 0;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function latestLabel(items: Array<{ updatedAt?: string | null }>) {
  const latest = items
    .map((item) => item.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return latest ? new Date(latest).toLocaleString() : "no recent changes";
}

function jobStatusLabel(
  job: WtfMediaServiceContract["jobs"][number] | null | undefined
): string {
  if (!job) return "not registered";
  if (!job.registered) return "not registered";
  if (job.running) return "running";
  return job.latest?.status ?? "waiting";
}

const DWELLING_ICONS: Record<WtfDwellingKey, typeof Folder> = {
  desktop: HardDrive,
  projects: FolderOpen,
  media: Image,
  documents: Folder,
  downloads: FileArchive,
  vault: Shield,
  apps: Boxes,
  chain: Database,
  archives: Archive,
  shared: Share2,
};

export function FileManager() {
  const [mintArtifact, setMintArtifact] = useState<MintManagerArtifact | null>(null);
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();

  const mediaQuery = useQuery({
    queryKey: ["file-manager", "media"],
    queryFn: () => api.get<MediaItem[]>("/api/media/mine"),
  });
  const studioQuery = useQuery({
    queryKey: ["file-manager", "studio-projects"],
    queryFn: () => api.get<StudioProjectsResponse>("/api/studio/projects"),
    retry: false,
  });
  const bundleQuery = useQuery({
    queryKey: ["file-manager", "project-bundles"],
    queryFn: () => api.get<WtfProjectBundleManifest>("/api/cockpit/project-bundles"),
    retry: false,
  });
  const mediaServiceQuery = useQuery({
    queryKey: ["file-manager", "media-service"],
    queryFn: () => api.get<WtfMediaServiceContract>("/api/cockpit/media-service"),
    retry: false,
  });
  const ipfsGatewayQuery = useQuery({
    queryKey: ["file-manager", "ipfs-gateways"],
    queryFn: () => api.get<ReturnType<typeof buildWtfIpfsGatewayPolicy>>("/api/cockpit/ipfs-gateways"),
    retry: false,
  });

  const mediaItems = asFileManagerArray<MediaItem>(mediaQuery.data);
  const projects = asFileManagerArray<StudioProject>(studioQuery.data?.projects);
  const projectBundleManifest = resolveProjectBundleManifest(bundleQuery.data);
  const projectBundleSections = projectBundleManifest.sections;
  const mediaServiceContract = resolveMediaServiceContract(mediaServiceQuery.data);
  const mediaServiceCapabilities = mediaServiceContract.capabilities;
  const mediaServiceJobs = asFileManagerArray<WtfMediaServiceContract["jobs"][number]>(
    mediaServiceContract.jobs
  );
  const mediaServiceJobsByName = new Map(mediaServiceJobs.map((job) => [job.name, job]));
  const ipfsGatewayPolicy = resolveIpfsGatewayPolicy(ipfsGatewayQuery.data);
  const agentSnapshots = useMemo(() => readAgentProjectSnapshots(), []);
  const agentStats = useMemo(() => agentFilesystemStats(agentSnapshots), [agentSnapshots]);
  const mediaBytes = mediaItems.reduce((sum, item) => sum + itemBytes(item), 0);
  const projectBytes = projects.reduce((sum, project) => sum + Number(project.storageUsedBytes ?? 0), 0);
  const totalProjectBytes = projectBytes + agentStats.contentBytes;
  const imageCount = mediaItems.filter((item) => item.mediaCategory === "image").length;
  const videoCount = mediaItems.filter((item) => item.mediaCategory === "video").length;
  const audioCount = mediaItems.filter((item) => item.mediaCategory === "audio").length;
  const projectFileCount = projects.reduce((sum, project) => sum + Number(project.fileCount ?? 0), 0);
  const totalProjectFileCount = projectFileCount + agentStats.fileCount;
  const totalProjectCount = projects.length + agentStats.snapshotCount;

  const dwellings = useMemo<Dwelling[]>(
    () =>
      WTF_DWELLINGS.map((dwelling) => {
        const counts: Record<WtfDwellingKey, string> = {
          desktop: "layout",
          projects: `${totalProjectCount} projects`,
          media: `${mediaItems.length} items`,
          documents: "journal",
          downloads: `${formatBytes(mediaBytes)}`,
          vault: "tokens",
          apps: "tools",
          chain: "mainnet",
          archives: "proof",
          shared: "social",
        };
        const details: Partial<Record<WtfDwellingKey, string>> = {
          projects: `${totalProjectFileCount} files, ${formatBytes(totalProjectBytes)}, ${agentStats.snapshotCount} Agent snapshots`,
          media: `${imageCount} images, ${videoCount} videos, ${audioCount} audio`,
        };
        return {
          ...dwelling,
          count: counts[dwelling.key],
          detail: details[dwelling.key] ?? dwelling.doctrineRole,
          icon: DWELLING_ICONS[dwelling.key],
        };
      }),
    [
      agentStats.snapshotCount,
      audioCount,
      imageCount,
      mediaBytes,
      mediaItems.length,
      totalProjectBytes,
      totalProjectCount,
      totalProjectFileCount,
      videoCount,
    ]
  );

  useEffect(() => {
    logClientSystemEvent({
      eventType: "file_manager.viewed",
      metadata: {
        mediaCount: mediaItems.length,
        projectCount: projects.length,
        studioAvailable: !studioQuery.isError,
      },
    });
  }, [mediaItems.length, projects.length, studioQuery.isError]);

  function openDwelling(row: Dwelling) {
    logClientSystemEvent({
      eventType: "file_manager.opened",
      metadata: { dwelling: row.key, route: row.route },
    });
    setLocation(presentationRouteHref(row.route, presentation.host));
  }

  function openBundleSection(section: WtfProjectBundleSection) {
    logClientSystemEvent({
      eventType: "project_bundle_manifest.opened",
      metadata: {
        section: section.key,
        route: section.route,
        dwelling: section.dwelling,
      },
    });
    setLocation(presentationRouteHref(section.route, presentation.host));
  }

  function openMediaServiceCapability(capability: WtfMediaServiceCapability) {
    logClientSystemEvent({
      eventType: "media_service_capability.opened",
      metadata: {
        capability: capability.key,
        route: capability.route,
        accessPolicy: capability.accessPolicy,
      },
    });
    setLocation(presentationRouteHref(capability.route, presentation.host));
  }

  const loading = mediaQuery.isLoading || studioQuery.isLoading;
  const mediaFolderItems = [...mediaItems]
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));

  return (
    <AppWindow title="File Manager">
      <Shell
        data-testid="file-manager"
        data-gamma-utility-surface="file-manager"
        data-gamma-utility-presentation-host={presentation.host}
        data-gamma-utility-region="surface"
      >
        <StatusGrid data-gamma-utility-region="status-grid">
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Dwellings</StatusLabel>
            <StatusValue>{dwellings.length}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Media</StatusLabel>
            <StatusValue>{mediaQuery.isLoading ? "..." : `${mediaItems.length}`}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Projects</StatusLabel>
            <StatusValue>{studioQuery.isError ? "locked" : totalProjectCount}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Bundle Sections</StatusLabel>
            <StatusValue>{bundleQuery.isError ? "local" : projectBundleSections.length}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Media Duties</StatusLabel>
            <StatusValue>{mediaServiceQuery.isError ? "local" : mediaServiceCapabilities.length}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Media Jobs</StatusLabel>
            <StatusValue>{mediaServiceQuery.isError ? "local" : mediaServiceJobs.length}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">IPFS Gateways</StatusLabel>
            <StatusValue>{ipfsGatewayQuery.isError ? "local" : ipfsGatewayPolicy.gateways.length}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Changed</StatusLabel>
            <StatusValue>{latestLabel([...mediaItems, ...projects])}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        {loading ? (
          <UiPanel title="WTF dwellings" compact data-gamma-utility-region="panel">
            <Hourglass size={30} />
          </UiPanel>
        ) : (
          <UiPanel title="WTF dwellings" compact data-gamma-utility-region="panel">
            <DwellingGrid>
              {dwellings.map((row) => {
                const Icon = row.icon;
                return (
                  <DwellingRow key={row.key} data-gamma-utility-region="dwelling-row">
                    <IconBox data-gamma-utility-region="icon">
                      <Icon size={17} aria-hidden />
                    </IconBox>
                    <div>
                      <RowTitle>
                        {row.label} <span style={{ fontWeight: "normal" }}>{row.path}</span>
                      </RowTitle>
                      <RowMeta data-gamma-utility-region="meta">
                        {row.owner} · {row.count} · {row.detail}
                      </RowMeta>
                    </div>
                    <OpenButton data-gamma-utility-region="button" onClick={() => openDwelling(row)}>
                      <FolderOpen size={14} aria-hidden />
                      Open {row.label}
                    </OpenButton>
                  </DwellingRow>
                );
              })}
            </DwellingGrid>
          </UiPanel>
        )}

        <UiPanel title={`Project bundles: ${projectBundleManifest.rootPath}`} compact data-gamma-utility-region="panel">
          <BundleGrid>
            {projectBundleSections.map((section) => (
              <BundleRow key={section.key} data-gamma-utility-region="bundle-row">
                <div>
                  <RowTitle>{section.label}</RowTitle>
                  <BundlePurpose data-gamma-utility-region="purpose">
                    {section.owner} · {section.dwelling} · {section.requiredArtifacts.length} artifacts ·{" "}
                    {section.purpose}
                  </BundlePurpose>
                </div>
                <OpenButton data-gamma-utility-region="button" onClick={() => openBundleSection(section)}>
                  <FolderOpen size={14} aria-hidden />
                  Open {section.label}
                </OpenButton>
              </BundleRow>
            ))}
          </BundleGrid>
        </UiPanel>

        <UiPanel title="Media service" compact data-gamma-utility-region="panel">
          <ServiceGrid>
            {mediaServiceCapabilities.map((capability) => (
              <ServiceRow key={capability.key} data-gamma-utility-region="service-row">
                <RowTitle>
                  {capability.label}
                  <PolicyBadge data-gamma-utility-region="badge">{capability.accessPolicy}</PolicyBadge>
                </RowTitle>
                <BundlePurpose data-gamma-utility-region="purpose">
                  {capability.owner} · {capability.dwelling} · {capability.outputs.length} outputs
                </BundlePurpose>
                <BundlePurpose data-gamma-utility-region="purpose">{capability.purpose}</BundlePurpose>
                {capability.jobNames && capability.jobNames.length > 0 && (
                  <BundlePurpose data-gamma-utility-region="purpose">
                    Jobs:{" "}
                    {capability.jobNames
                      .map((name) => `${name} (${jobStatusLabel(mediaServiceJobsByName.get(name))})`)
                      .join(", ")}
                  </BundlePurpose>
                )}
                <OpenButton data-gamma-utility-region="button" onClick={() => openMediaServiceCapability(capability)}>
                  <FolderOpen size={14} aria-hidden />
                  Open {capability.label}
                </OpenButton>
              </ServiceRow>
            ))}
          </ServiceGrid>
        </UiPanel>

        <UiPanel title="IPFS rendering" compact data-gamma-utility-region="panel">
          <RecentList>
            <RecentRow data-gamma-utility-region="recent-row">
              <span>Primary gateway</span>
              <span>{ipfsGatewayPolicy.primaryGateway}</span>
            </RecentRow>
            <RecentRow data-gamma-utility-region="recent-row">
              <span>Final fallback</span>
              <span>{ipfsGatewayPolicy.finalFallbackGateway}</span>
            </RecentRow>
            <RecentRow data-gamma-utility-region="recent-row">
              <span>Gateway candidates</span>
              <span>{ipfsGatewayPolicy.gateways.length}</span>
            </RecentRow>
          </RecentList>
        </UiPanel>

        <UiPanel title="Media folder" compact data-gamma-utility-region="panel">
          <RecentList>
            {mediaFolderItems.length === 0 ? (
              <UiEmptyState title="No recent media">
                {mediaQuery.isError
                  ? "Media rows are unavailable right now."
                  : "Uploaded and imported media will appear here after your library syncs."}
              </UiEmptyState>
            ) : (
              mediaFolderItems.map((item) => (
                <RecentRow key={item.id} data-gamma-utility-region="recent-row">
                  <span>{item.title}</span>
                  <RecentActions>
                    <span>
                    {item.mediaCategory} · {formatBytes(itemBytes(item))}
                    </span>
                    {item.sourceType === "upload" && item.status === "ready" && item.mimeType && (
                      <OpenButton
                        data-gamma-utility-region="button"
                        onClick={() => setMintArtifact({
                          mediaItemId: item.id,
                          title: item.title,
                          fileName: item.title,
                          mimeType: item.mimeType || "application/octet-stream",
                        })}
                      >
                        Mint this media
                      </OpenButton>
                    )}
                  </RecentActions>
                </RecentRow>
              ))
            )}
          </RecentList>
        </UiPanel>
        {mintArtifact && (
          <MintManagerDialog artifact={mintArtifact} onClose={() => setMintArtifact(null)} />
        )}
      </Shell>
    </AppWindow>
  );
}

const RecentActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;
