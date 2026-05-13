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

type DwellingKey =
  | "desktop"
  | "projects"
  | "media"
  | "documents"
  | "downloads"
  | "vault"
  | "apps"
  | "chain"
  | "archives"
  | "shared";

type Dwelling = {
  key: DwellingKey;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 760px) {
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

  const mediaItems = mediaQuery.data ?? [];
  const projects = studioQuery.data?.projects ?? [];
  const mediaBytes = mediaItems.reduce((sum, item) => sum + itemBytes(item), 0);
  const projectBytes = projects.reduce((sum, project) => sum + Number(project.storageUsedBytes ?? 0), 0);
  const imageCount = mediaItems.filter((item) => item.mediaCategory === "image").length;
  const videoCount = mediaItems.filter((item) => item.mediaCategory === "video").length;
  const audioCount = mediaItems.filter((item) => item.mediaCategory === "audio").length;
  const projectFileCount = projects.reduce((sum, project) => sum + Number(project.fileCount ?? 0), 0);

  const dwellings = useMemo<Dwelling[]>(
    () => [
      {
        key: "desktop",
        label: "Desktop",
        path: "WTF/Desktop",
        route: "/desktop-settings",
        owner: "Shell",
        count: "layout",
        detail: "appearance, wallpaper, cursor, and window state",
        icon: HardDrive,
      },
      {
        key: "projects",
        label: "Projects",
        path: "WTF/Projects",
        route: "/studio",
        owner: "Studio",
        count: `${projects.length} projects`,
        detail: `${projectFileCount} files, ${formatBytes(projectBytes)}`,
        icon: FolderOpen,
      },
      {
        key: "media",
        label: "Media",
        path: "WTF/Media",
        route: "/my-gallery",
        owner: "Media Temple",
        count: `${mediaItems.length} items`,
        detail: `${imageCount} images, ${videoCount} videos, ${audioCount} audio`,
        icon: Image,
      },
      {
        key: "documents",
        label: "Documents",
        path: "WTF/Documents",
        route: "/dear-diary",
        owner: "Dear Diary",
        count: "journal",
        detail: "personal notes and written memory",
        icon: Folder,
      },
      {
        key: "downloads",
        label: "Downloads",
        path: "WTF/Downloads",
        route: "/my-videos",
        owner: "Media Library",
        count: `${formatBytes(mediaBytes)}`,
        detail: "uploaded and imported media assets",
        icon: FileArchive,
      },
      {
        key: "vault",
        label: "Vault",
        path: "WTF/Vault",
        route: "/hoard",
        owner: "Wallet",
        count: "tokens",
        detail: "owned on-chain assets and wallet-backed inventory",
        icon: Shield,
      },
      {
        key: "apps",
        label: "Apps",
        path: "WTF/Apps",
        route: "/game-studio",
        owner: "Creator Tools",
        count: "tools",
        detail: "games, creation tools, and launchable app work",
        icon: Boxes,
      },
      {
        key: "chain",
        label: "Chain",
        path: "WTF/Chain",
        route: "/dashboard",
        owner: "Cockpit",
        count: "mainnet",
        detail: "wallet activity, holdings, and sync state",
        icon: Database,
      },
      {
        key: "archives",
        label: "Archives",
        path: "WTF/Archives",
        route: "/recovery-mode",
        owner: "Recovery",
        count: "proof",
        detail: "backup, restore proof, and incident reports",
        icon: Archive,
      },
      {
        key: "shared",
        label: "Shared",
        path: "WTF/Shared",
        route: "/w",
        owner: "W",
        count: "social",
        detail: "public posts, groupchat, and shared discovery",
        icon: Share2,
      },
    ],
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
