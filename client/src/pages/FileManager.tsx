import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Separator } from "react95";
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
  buildWtfProjectBundleManifest,
  type WtfProjectBundleManifest,
  type WtfProjectBundleSection,
} from "@shared/wtf-project-bundles";
import {
  buildWtfMediaServiceContract,
  type WtfMediaServiceCapability,
  type WtfMediaServiceContract,
} from "@shared/wtf-media-service";
import { buildWtfIpfsGatewayPolicy } from "@shared/ipfs-gateways";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";

type MediaItem = {
  id: number;
  title: string;
  mediaCategory: string;
  fileSize?: number | null;
  fileSizeBytes?: number | null;
  updatedAt?: string | null;
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
  gap: 8px;
  min-width: 0;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;

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
  padding: 7px;
  border: 1px solid #808080;
  background: #eeeeee;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const StatusLabel = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: #404040;
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: 14px;
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
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 68px;
  padding: 7px;
  border: 1px solid #9a9a9a;
  background: #f2f2f2;

  @media (max-width: 560px) {
    grid-template-columns: 28px minmax(0, 1fr);
  }
`;

const IconBox = styled.div`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid #808080;
  background: #dfdfdf;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const RowTitle = styled.div`
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const RowMeta = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: #404040;
  overflow-wrap: anywhere;
`;

const OpenButton = styled(Button)`
  min-width: 88px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11px;

  @media (max-width: 560px) {
    grid-column: 1 / -1;
    width: 100%;
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
  padding: 6px;
  border: 1px solid #c0c0c0;
  background: #ffffff;
  font-size: 11px;
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
  padding: 6px;
  border: 1px solid #c0c0c0;
  background: #ffffff;
  font-size: 11px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const BundlePurpose = styled.div`
  margin-top: 2px;
  color: #404040;
  overflow-wrap: anywhere;
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
  padding: 6px;
  border: 1px solid #c0c0c0;
  background: #ffffff;
  font-size: 11px;
`;

const PolicyBadge = styled.span`
  display: inline-block;
  margin-left: 5px;
  padding: 1px 4px;
  border: 1px solid #808080;
  background: #eeeeee;
  font-size: 10px;
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

  const mediaItems = mediaQuery.data ?? [];
  const projects = studioQuery.data?.projects ?? [];
  const projectBundleManifest = bundleQuery.data ?? buildWtfProjectBundleManifest();
  const projectBundleSections = projectBundleManifest.sections;
  const mediaServiceContract = mediaServiceQuery.data ?? buildWtfMediaServiceContract();
  const mediaServiceCapabilities = mediaServiceContract.capabilities;
  const ipfsGatewayPolicy = ipfsGatewayQuery.data ?? buildWtfIpfsGatewayPolicy();
  const mediaBytes = mediaItems.reduce((sum, item) => sum + itemBytes(item), 0);
  const projectBytes = projects.reduce((sum, project) => sum + Number(project.storageUsedBytes ?? 0), 0);
  const imageCount = mediaItems.filter((item) => item.mediaCategory === "image").length;
  const videoCount = mediaItems.filter((item) => item.mediaCategory === "video").length;
  const audioCount = mediaItems.filter((item) => item.mediaCategory === "audio").length;
  const projectFileCount = projects.reduce((sum, project) => sum + Number(project.fileCount ?? 0), 0);

  const dwellings = useMemo<Dwelling[]>(
    () =>
      WTF_DWELLINGS.map((dwelling) => {
        const counts: Record<WtfDwellingKey, string> = {
          desktop: "layout",
          projects: `${projects.length} projects`,
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
          projects: `${projectFileCount} files, ${formatBytes(projectBytes)}`,
          media: `${imageCount} images, ${videoCount} videos, ${audioCount} audio`,
        };
        return {
          ...dwelling,
          count: counts[dwelling.key],
          detail: details[dwelling.key] ?? dwelling.doctrineRole,
          icon: DWELLING_ICONS[dwelling.key],
        };
      }),
    [audioCount, imageCount, mediaBytes, mediaItems.length, projectBytes, projectFileCount, projects.length, videoCount]
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
    setLocation(row.route);
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
    setLocation(section.route);
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
    setLocation(capability.route);
  }

  const loading = mediaQuery.isLoading || studioQuery.isLoading;
  const recentMedia = [...mediaItems]
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    .slice(0, 5);

  return (
    <AppWindow title="File Manager">
      <Shell data-testid="file-manager">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Dwellings</StatusLabel>
            <StatusValue>{dwellings.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Media</StatusLabel>
            <StatusValue>{mediaQuery.isLoading ? "..." : `${mediaItems.length}`}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Projects</StatusLabel>
            <StatusValue>{studioQuery.isError ? "locked" : projects.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Bundle Sections</StatusLabel>
            <StatusValue>{bundleQuery.isError ? "local" : projectBundleSections.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Media Duties</StatusLabel>
            <StatusValue>{mediaServiceQuery.isError ? "local" : mediaServiceCapabilities.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>IPFS Gateways</StatusLabel>
            <StatusValue>{ipfsGatewayQuery.isError ? "local" : ipfsGatewayPolicy.gateways.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Changed</StatusLabel>
            <StatusValue>{latestLabel([...mediaItems, ...projects])}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        {loading ? (
          <GroupBox label="WTF">
            <Hourglass size={30} />
          </GroupBox>
        ) : (
          <GroupBox label="WTF">
            <DwellingGrid>
              {dwellings.map((row) => {
                const Icon = row.icon;
                return (
                  <DwellingRow key={row.key}>
                    <IconBox>
                      <Icon size={17} aria-hidden />
                    </IconBox>
                    <div>
                      <RowTitle>
                        {row.label} <span style={{ fontWeight: "normal" }}>{row.path}</span>
                      </RowTitle>
                      <RowMeta>
                        {row.owner} · {row.count} · {row.detail}
                      </RowMeta>
                    </div>
                    <OpenButton onClick={() => openDwelling(row)}>
                      <FolderOpen size={14} aria-hidden />
                      Open
                    </OpenButton>
                  </DwellingRow>
                );
              })}
            </DwellingGrid>
          </GroupBox>
        )}

        <GroupBox label={`Project Bundles · ${projectBundleManifest.rootPath}`}>
          <BundleGrid>
            {projectBundleSections.map((section) => (
              <BundleRow key={section.key}>
                <div>
                  <RowTitle>{section.label}</RowTitle>
                  <BundlePurpose>
                    {section.owner} · {section.dwelling} · {section.requiredArtifacts.length} artifacts ·{" "}
                    {section.purpose}
                  </BundlePurpose>
                </div>
                <OpenButton onClick={() => openBundleSection(section)}>
                  <FolderOpen size={14} aria-hidden />
                  Open
                </OpenButton>
              </BundleRow>
            ))}
          </BundleGrid>
        </GroupBox>

        <GroupBox label="Media Service">
          <ServiceGrid>
            {mediaServiceCapabilities.map((capability) => (
              <ServiceRow key={capability.key}>
                <RowTitle>
                  {capability.label}
                  <PolicyBadge>{capability.accessPolicy}</PolicyBadge>
                </RowTitle>
                <BundlePurpose>
                  {capability.owner} · {capability.dwelling} · {capability.outputs.length} outputs
                </BundlePurpose>
                <BundlePurpose>{capability.purpose}</BundlePurpose>
                <OpenButton onClick={() => openMediaServiceCapability(capability)}>
                  <FolderOpen size={14} aria-hidden />
                  Open
                </OpenButton>
              </ServiceRow>
            ))}
          </ServiceGrid>
        </GroupBox>

        <GroupBox label="IPFS Rendering">
          <RecentList>
            <RecentRow>
              <span>Primary gateway</span>
              <span>{ipfsGatewayPolicy.primaryGateway}</span>
            </RecentRow>
            <RecentRow>
              <span>Final fallback</span>
              <span>{ipfsGatewayPolicy.finalFallbackGateway}</span>
            </RecentRow>
            <RecentRow>
              <span>Gateway candidates</span>
              <span>{ipfsGatewayPolicy.gateways.length}</span>
            </RecentRow>
          </RecentList>
        </GroupBox>

        <GroupBox label="Recent Media">
          <RecentList>
            {recentMedia.length === 0 ? (
              <RecentRow>
                <span>No media rows available.</span>
                <span>{mediaQuery.isError ? "unavailable" : "empty"}</span>
              </RecentRow>
            ) : (
              recentMedia.map((item) => (
                <RecentRow key={item.id}>
                  <span>{item.title}</span>
                  <span>
                    {item.mediaCategory} · {formatBytes(itemBytes(item))}
                  </span>
                </RecentRow>
              ))
            )}
          </RecentList>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
