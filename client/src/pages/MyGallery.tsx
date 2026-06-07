import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled, { keyframes } from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import {
  getTokenMimeType,
  resolveTokenThumbnail,
  isGameMime,
  isImageMime,
  isAudioMime,
  isPlayableMime,
  shortAddr,
  advanceResolvedMediaFallback,
} from "../lib/media-resolve";
import { TokenDetailModal, type TokenCardAction } from "../components/TokenCard";
import type { ConsoleTokenProvenance } from "@shared/console-provenance";
import {
  provenanceCreatorLabel,
  provenanceSupportLinks,
  provenanceXLabel,
  readEmbeddedProvenance,
} from "../lib/provenance";

/* ─── Types (mirror server /api/gallery/mine) ──────────── */

interface GalleryToken {
  id: number;
  walletAddress: string;
  contract: string;
  tokenId: string;
  balance: string;
  thumbnailUri: string | null;
  displayUri: string | null;
  artifactUri: string | null;
  mimeType: string | null;
  title: string;
  description: string | null;
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
  mintedAtIso: string | null;
  tags: string[];
  royalties: unknown;
  editions: string | null;
  acquiredAtIso: string | null;
  metadata: Record<string, any> | null;
  provenance: ConsoleTokenProvenance | null;
}

interface FacetRow {
  name?: string | null;
  kind?: string | null;
  address?: string | null;
  label?: string | null;
  isPrimary?: boolean | null;
  count?: number | null;
}

interface GalleryResponse {
  items: GalleryToken[];
  pagination: { limit: number; offset: number; total: number };
  facets: {
    creators: FacetRow[];
    collections: FacetRow[];
    wallets: FacetRow[];
    mediaKinds: FacetRow[];
  };
  sort: string;
}

interface MediaLibraryItem {
  id: number;
  tokenContract?: string | null;
  tokenId?: string | null;
  mediaCategory?: string | null;
}

type SortKey =
  | "acquired_desc"
  | "acquired_asc"
  | "minted_desc"
  | "minted_asc"
  | "title_asc"
  | "title_desc"
  | "creator_asc";

type GalleryImportCategory = "video" | "image" | "game" | "audio";

const IMPORT_TARGETS: Record<
  GalleryImportCategory,
  { action: string; imported: string; notice: string }
> = {
  video: {
    action: "Add to My Videos",
    imported: "In My Videos",
    notice: "Added to My Videos",
  },
  image: {
    action: "Add to My Photos",
    imported: "In My Photos",
    notice: "Added to My Photos",
  },
  game: {
    action: "Add to My Games",
    imported: "In My Games",
    notice: "Added to My Games",
  },
  audio: {
    action: "Add to My Music",
    imported: "In My Music",
    notice: "Added to My Music",
  },
};

/* ─── Styled ──────────────────────────────────────────── */

const GALLERY_CAPTION_TYPE = "var(--wtf-type-caption, 13px)";

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 260px) 1fr;
  gap: 16px;
  min-height: 100%;

  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.aside`
  background: #c0c0c0;
  border: 2px inset #dfdfdf;
  padding: 10px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-self: start;
  position: sticky;
  top: 8px;
`;

const SidebarTitle = styled.h3`
  font-size: 13px;
  margin: 0;
  padding: 4px 6px;
  background: #000080;
  color: #fff;
  letter-spacing: 0;
`;

const FilterGroup = styled.fieldset`
  border: 2px inset #dfdfdf;
  padding: 6px 8px 8px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterLegend = styled.legend`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  padding: 0 4px;
  color: #222;
`;

const Chip = styled.button<{ $active?: boolean }>`
  text-align: left;
  font-size: var(--wtf-type-caption, 13px);
  padding: 3px 6px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? "#000080" : "transparent")};
  color: ${({ $active }) => ($active ? "#fff" : "#000")};
  border: 1px solid ${({ $active }) => ($active ? "#000080" : "#8a8a8a")};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;

  &:hover {
    background: ${({ $active }) => ($active ? "#000080" : "#e0e0e0")};
  }
`;

const ChipCount = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  opacity: 0.75;
`;

const TextField = styled.input`
  font-family: var(--wtf-app-font, "MEK Mono", "Segoe UI", sans-serif);
  font-size: var(--wtf-type-caption, 13px);
  padding: 4px 6px;
  border: 2px inset #dfdfdf;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
`;

const DateRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
`;

const Button95 = styled.button<{ $accent?: boolean }>`
  font-family: var(--wtf-app-font, "MEK Mono", "Segoe UI", sans-serif);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  padding: 5px 10px;
  cursor: pointer;
  background: ${({ $accent }) => ($accent ? "#000080" : "#c0c0c0")};
  color: ${({ $accent }) => ($accent ? "#fff" : "#000")};
  border: 2px outset #dfdfdf;

  &:active {
    border-style: inset;
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 8px;
  background: #c0c0c0;
  border: 2px inset #dfdfdf;
`;

const ToolbarLabel = styled.label`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const Select95 = styled.select`
  font-family: var(--wtf-app-font, "MEK Mono", "Segoe UI", sans-serif);
  font-size: var(--wtf-type-caption, 13px);
  padding: 3px 4px;
  border: 2px inset #dfdfdf;
  background: #fff;
`;

const ResultsCount = styled.div`
  margin-left: auto;
  font-size: var(--wtf-type-caption, 13px);
  color: #222;
`;

/* The gallery itself — deliberately sparse; the art carries the page.
 * Hover shows a subtle overlay with title + creator; the full card
 * opens on click. */
const Grid = styled.div`
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
`;

const Tile = styled.div`
  position: relative;
  aspect-ratio: 1;
  border: 1px solid #000;
  background: #000;
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
  transition: transform 160ms ease, box-shadow 160ms ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 3px 4px 0 rgba(0, 0, 0, 0.55);
  }
  &:hover > .tile-overlay {
    opacity: 1;
    transform: translateY(0);
  }

  img, video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  }
`;

const TileBadge = styled.span`
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.68);
  color: #88ff88;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--wtf-type-caption, 13px);
  padding: 2px 5px;
  border-radius: 2px;
  letter-spacing: 0;
  pointer-events: none;
`;

const TileOverlay = styled.div`
  position: absolute;
  inset: auto 0 0 0;
  padding: 8px 10px 9px;
  color: #fff;
  text-align: left;
  background: linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.85) 0%,
    rgba(0, 0, 0, 0.55) 70%,
    rgba(0, 0, 0, 0) 100%
  );
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 180ms ease, transform 180ms ease;
  pointer-events: auto;
`;

const TileTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TileSub = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: #ddd;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TileLink = styled.a`
  color: #88ff88;
  display: inline-block;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  margin-top: 4px;
  text-decoration: underline;
`;

const EmptyState = styled.div`
  margin-top: 20px;
  padding: 20px;
  border: 2px inset #dfdfdf;
  background: #e8e8e8;
  color: #333;
  text-align: center;
  font-size: var(--wtf-type-caption, 13px);
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  width: 18px;
  height: 18px;
  border: 2px solid #808080;
  border-top-color: #000080;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const LoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  font-size: var(--wtf-type-caption, 13px);
  color: #333;
`;

const ImportNotice = styled.div<{ $error?: boolean }>`
  margin-top: 8px;
  padding: 6px 8px;
  border: 2px inset #dfdfdf;
  background: ${({ $error }) => ($error ? "#ffd6d6" : "#e8ffe8")};
  color: ${({ $error }) => ($error ? "#6b0000" : "#004c00")};
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

/* ─── Helpers ─────────────────────────────────────────── */

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "acquired_desc", label: "Recently acquired" },
  { value: "acquired_asc", label: "Oldest acquired" },
  { value: "minted_desc", label: "Recently minted" },
  { value: "minted_asc", label: "Oldest minted" },
  { value: "title_asc", label: "Title A→Z" },
  { value: "title_desc", label: "Title Z→A" },
  { value: "creator_asc", label: "Creator A→Z" },
];

const MEDIA_KINDS: { value: string; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "game", label: "Game" },
  { value: "gif", label: "GIF" },
  { value: "animated", label: "Animated" },
  { value: "image", label: "Still image" },
];

function buildQueryString(params: Record<string, string>) {
  const entries = Object.entries(params).filter(([, v]) => v && v.length > 0);
  if (entries.length === 0) return "";
  return (
    "?" +
    entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&")
  );
}

function toggleInList(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function mediaKindFromMime(mime: string | null | undefined): string {
  if (!mime) return "other";
  const m = mime.toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "image/gif") return "gif";
  if (m === "image/webp" || m === "image/apng") return "animated";
  if (m.startsWith("image/")) return "image";
  if (isGameMime(m)) return "game";
  return "other";
}

function galleryMime(token: GalleryToken): string | null {
  return getTokenMimeType(token.metadata) || token.mimeType || null;
}

function importCategoryForToken(token: GalleryToken): GalleryImportCategory | null {
  const mime = galleryMime(token);
  if (isPlayableMime(mime)) return "video";
  if (isAudioMime(mime)) return "audio";
  if (isImageMime(mime)) return "image";
  if (isGameMime(mime)) return "game";
  return null;
}

function tokenKey(contract: string | null | undefined, tokenId: string | null | undefined) {
  if (!contract || !tokenId) return "";
  return `${contract}:${tokenId}`;
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Could not add token to your WTF media.";
}

function hasArchiveTarget(token: GalleryToken): boolean {
  const meta = token.metadata || {};
  const formatUris = Array.isArray(meta.formats)
    ? meta.formats.map((format: any) => format?.uri)
    : [];
  const values = [
    token.artifactUri,
    token.displayUri,
    token.thumbnailUri,
    meta.artifactUri,
    meta.artifact_uri,
    meta.displayUri,
    meta.display_uri,
    meta.thumbnailUri,
    meta.thumbnail_uri,
    ...formatUris,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return values.some((value) => {
    const lower = value.toLowerCase();
    return lower.startsWith("ipfs://") || lower.includes("/ipfs/") || lower.includes(".ipfs.");
  });
}

/* ─── Page ────────────────────────────────────────────── */

export function MyGallery() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("acquired_desc");
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [mintedFrom, setMintedFrom] = useState("");
  const [mintedTo, setMintedTo] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<GalleryToken | null>(null);
  const [importNotice, setImportNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const pageSize = 60;

  const params = useMemo(() => {
    return {
      limit: String(pageSize),
      offset: String(page * pageSize),
      sort,
      q: query.trim(),
      creator: selectedCreators.join(","),
      collection: selectedCollections.join(","),
      wallet: selectedWallets.join(","),
      mediaKind: selectedKinds.join(","),
      tag: selectedTag.trim(),
      mintedFrom,
      mintedTo,
    };
  }, [
    page,
    sort,
    query,
    selectedCreators,
    selectedCollections,
    selectedWallets,
    selectedKinds,
    selectedTag,
    mintedFrom,
    mintedTo,
  ]);

  const galleryQuery = useQuery({
    queryKey: ["gallery", "mine", params],
    queryFn: () =>
      api.get<GalleryResponse>(`/api/gallery/mine${buildQueryString(params)}`),
    staleTime: 60_000,
  });

  const mediaLibraryQuery = useQuery({
    queryKey: ["media-library", "all"],
    queryFn: () => api.get<MediaLibraryItem[]>("/api/media/mine"),
    staleTime: 60_000,
  });

  const importMutation = useMutation({
    mutationFn: (body: {
      contract: string;
      tokenId: string;
      mediaCategory: GalleryImportCategory;
    }) => api.post<MediaLibraryItem>("/api/media/import-token", body),
    onSuccess: (_item, vars) => {
      qc.invalidateQueries({ queryKey: ["media-library"] });
      qc.invalidateQueries({ queryKey: ["console", "cartridges"] });
      setImportNotice({
        kind: "ok",
        text: IMPORT_TARGETS[vars.mediaCategory].notice,
      });
    },
    onError: (error) => {
      setImportNotice({ kind: "error", text: mutationErrorMessage(error) });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (body: { contract: string; tokenId: string }) =>
      api.post<{ ok: boolean; jobId: number; message: string }>("/api/archive/token", body),
    onSuccess: (result) => {
      setImportNotice({
        kind: "ok",
        text: result.message || "Artifact queued for preservation",
      });
    },
    onError: (error) => {
      setImportNotice({
        kind: "error",
        text: error instanceof Error && error.message
          ? error.message
          : "Could not queue artifact for preservation.",
      });
    },
  });

  const data = galleryQuery.data;
  const items = data?.items ?? [];
  const facets = data?.facets ?? {
    creators: [],
    collections: [],
    wallets: [],
    mediaKinds: [],
  };
  const total = data?.pagination?.total ?? 0;
  const shown = items.length;
  const canPrev = page > 0;
  const canNext = (page + 1) * pageSize < total;

  const clearFilters = () => {
    setQuery("");
    setSelectedCreators([]);
    setSelectedCollections([]);
    setSelectedWallets([]);
    setSelectedKinds([]);
    setSelectedTag("");
    setMintedFrom("");
    setMintedTo("");
    setPage(0);
  };

  const resetPage = () => setPage(0);

  const creatorsFacet = facets.creators ?? [];
  const collectionsFacet = facets.collections ?? [];
  const walletsFacet = facets.wallets ?? [];
  const kindsFacet = facets.mediaKinds ?? [];

  const importedCategoryByToken = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of mediaLibraryQuery.data || []) {
      const key = tokenKey(item.tokenContract, item.tokenId);
      if (!key) continue;
      map.set(key, item.mediaCategory || "media");
    }
    return map;
  }, [mediaLibraryQuery.data]);

  const kindCountFor = (v: string): number | undefined =>
    kindsFacet.find((k) => k.kind === v)?.count ?? undefined;

  const tokenActionsFor = (token: GalleryToken): TokenCardAction[] => {
    const category = importCategoryForToken(token);
    const actions: TokenCardAction[] = [];
    const importedCategory = importedCategoryByToken.get(tokenKey(token.contract, token.tokenId));
    const importedLabels = IMPORT_TARGETS[importedCategory as GalleryImportCategory];
    const isImported = Boolean(importedCategory);
    const isPending =
      importMutation.isPending &&
      importMutation.variables?.contract === token.contract &&
      importMutation.variables?.tokenId === token.tokenId;
    const isArchivePending =
      archiveMutation.isPending &&
      archiveMutation.variables?.contract === token.contract &&
      archiveMutation.variables?.tokenId === token.tokenId;

    if (category) {
      const labels = IMPORT_TARGETS[category];
      actions.push({
        label: isPending
          ? "Adding..."
          : isImported
            ? importedLabels?.imported || "In WTF Media"
            : labels.action,
        disabled: isImported || importMutation.isPending,
        onClick: () =>
          importMutation.mutate({
            contract: token.contract,
            tokenId: token.tokenId,
            mediaCategory: category,
          }),
      });
    }

    if (hasArchiveTarget(token)) {
      actions.push({
        label: isArchivePending ? "Queuing archive..." : "Preserve artifact",
        disabled: archiveMutation.isPending,
        onClick: () =>
          archiveMutation.mutate({
            contract: token.contract,
            tokenId: token.tokenId,
          }),
      });
    }

    return actions;
  };

  return (
    <AppWindow title="My Gallery">
      <Layout>
        <Sidebar>
          <SidebarTitle>FILTERS</SidebarTitle>

          <FilterGroup>
            <FilterLegend>Search</FilterLegend>
            <TextField
              aria-label="Search gallery tokens"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Title · creator · collection · token id"
            />
          </FilterGroup>

          <FilterGroup>
            <FilterLegend>Media kind</FilterLegend>
            {MEDIA_KINDS.map((k) => {
              const count = kindCountFor(k.value);
              return (
                <Chip
                  key={k.value}
                  $active={selectedKinds.includes(k.value)}
                  onClick={() => {
                    setSelectedKinds((prev) => toggleInList(prev, k.value));
                    resetPage();
                  }}
                >
                  <span>{k.label}</span>
                  {count !== undefined && <ChipCount>{count}</ChipCount>}
                </Chip>
              );
            })}
          </FilterGroup>

          {walletsFacet.length > 0 && (
            <FilterGroup>
              <FilterLegend>Wallets</FilterLegend>
              {walletsFacet.map((w) => {
                const addr = w.address || "";
                const label = w.label || shortAddr(addr);
                const on = selectedWallets.includes(addr);
                return (
                  <Chip
                    key={addr}
                    $active={on}
                    onClick={() => {
                      setSelectedWallets((prev) => toggleInList(prev, addr));
                      resetPage();
                    }}
                    title={addr}
                  >
                    <span>
                      {label}
                      {w.isPrimary ? " ★" : ""}
                    </span>
                  </Chip>
                );
              })}
            </FilterGroup>
          )}

          {creatorsFacet.length > 0 && (
            <FilterGroup>
              <FilterLegend>Creators ({creatorsFacet.length})</FilterLegend>
              {creatorsFacet.slice(0, 18).map((c) => {
                const name = c.name || "";
                if (!name) return null;
                return (
                  <Chip
                    key={name}
                    $active={selectedCreators.includes(name)}
                    onClick={() => {
                      setSelectedCreators((prev) => toggleInList(prev, name));
                      resetPage();
                    }}
                    title={name}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name.length > 20 ? `${name.slice(0, 20)}…` : name}
                    </span>
                    <ChipCount>{c.count ?? ""}</ChipCount>
                  </Chip>
                );
              })}
            </FilterGroup>
          )}

          {collectionsFacet.length > 0 && (
            <FilterGroup>
              <FilterLegend>
                Collections ({collectionsFacet.length})
              </FilterLegend>
              {collectionsFacet.slice(0, 18).map((c) => {
                const name = c.name || "";
                if (!name) return null;
                return (
                  <Chip
                    key={name}
                    $active={selectedCollections.includes(name)}
                    onClick={() => {
                      setSelectedCollections((prev) =>
                        toggleInList(prev, name)
                      );
                      resetPage();
                    }}
                    title={name}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name.length > 24 ? `${name.slice(0, 24)}…` : name}
                    </span>
                    <ChipCount>{c.count ?? ""}</ChipCount>
                  </Chip>
                );
              })}
            </FilterGroup>
          )}

          <FilterGroup>
            <FilterLegend>Tag</FilterLegend>
            <TextField
              aria-label="Filter gallery by tag"
              value={selectedTag}
              onChange={(e) => {
                setSelectedTag(e.target.value);
                resetPage();
              }}
              placeholder="e.g. glitch, pixel, generative"
            />
          </FilterGroup>

          <FilterGroup>
            <FilterLegend>Minted on</FilterLegend>
            <DateRow>
              <TextField
                type="date"
                aria-label="Minted from date"
                value={mintedFrom}
                onChange={(e) => {
                  setMintedFrom(e.target.value);
                  resetPage();
                }}
              />
              <TextField
                type="date"
                aria-label="Minted to date"
                value={mintedTo}
                onChange={(e) => {
                  setMintedTo(e.target.value);
                  resetPage();
                }}
              />
            </DateRow>
          </FilterGroup>

          <Button95 onClick={clearFilters}>CLEAR ALL</Button95>
        </Sidebar>

        <main>
          <Toolbar>
            <ToolbarLabel htmlFor="sort-select">Sort:</ToolbarLabel>
            <Select95
              id="sort-select"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                resetPage();
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select95>
            <ResultsCount>
              {galleryQuery.isLoading
                ? "Loading…"
                : galleryQuery.isError
                  ? "Error"
                  : `Showing ${shown} of ${total}`}
            </ResultsCount>
          </Toolbar>

          {importNotice && (
            <ImportNotice $error={importNotice.kind === "error"}>
              {importNotice.text}
            </ImportNotice>
          )}

          {galleryQuery.isLoading && (
            <LoadingRow>
              <Spinner />
              Loading your collection…
            </LoadingRow>
          )}

          {galleryQuery.isError && (
            <EmptyState>
              Could not load your gallery. Please retry.
            </EmptyState>
          )}

          {!galleryQuery.isLoading && !galleryQuery.isError && shown === 0 && (
            <EmptyState>
              No tokens match the current filters. Clear filters or sync a new
              wallet to see your collection.
            </EmptyState>
          )}

          {shown > 0 && (
            <Grid>
              {items.map((t) => {
                const mime = galleryMime(t) || undefined;
                const resolved = resolveTokenThumbnail(
                  {
                    thumbnail: t.thumbnailUri || undefined,
                    metadata: t.metadata || {},
                  },
                  { preferVideo: false }
                );
                const srcImg = resolved?.src;
                const kindLabel = mediaKindFromMime(mime);
                const provenance = readEmbeddedProvenance(t);
                const supportLink = provenanceSupportLinks(provenance)[0] || null;
                const xLabel = provenanceXLabel(provenance);
                return (
                  <Tile
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(t);
                      }
                    }}
                    data-testid={`gallery-tile-${t.id}`}
                    aria-label={`Open ${t.title}`}
                    title={t.title}
                  >
                    {srcImg ? (
                      <img
                        src={srcImg}
                        alt={t.title}
                        loading="lazy"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (advanceResolvedMediaFallback(el, resolved)) return;
                          el.style.display = "none";
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#666",
                          fontSize: 32,
                        }}
                      >
                        ?
                      </div>
                    )}
                    {kindLabel !== "image" && kindLabel !== "other" && (
                      <TileBadge>
                        {kindLabel === "video" ? "VIDEO" : kindLabel.toUpperCase()}
                      </TileBadge>
                    )}
                    <TileOverlay className="tile-overlay">
                      <TileTitle>{t.title}</TileTitle>
                      <TileSub>
                        {provenance
                          ? `Provenance · ${provenanceCreatorLabel(provenance)}${
                              xLabel ? ` / ${xLabel}` : ""
                            }`
                          : t.creatorName ||
                            (t.creatorAddress ? shortAddr(t.creatorAddress) : "")}
                      </TileSub>
                      {supportLink && (
                        <TileLink
                          href={supportLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Support on Tezos
                        </TileLink>
                      )}
                    </TileOverlay>
                  </Tile>
                );
              })}
            </Grid>
          )}

          {(canPrev || canNext) && (
            <Toolbar style={{ marginTop: 12 }}>
              <Button95
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← PREV
              </Button95>
              <span style={{ fontSize: GALLERY_CAPTION_TYPE }}>
                Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <Button95
                disabled={!canNext}
                onClick={() => setPage((p) => p + 1)}
              >
                NEXT →
              </Button95>
            </Toolbar>
          )}
        </main>
      </Layout>

      {open && (
        <TokenDetailModal
          token={{
            id: open.id,
            contract: open.contract,
            tokenId: open.tokenId,
            name: open.title,
            thumbnail: open.thumbnailUri || undefined,
            metadata: open.metadata || {},
            balance: open.balance,
            mimeType: galleryMime(open) || undefined,
            walletAddress: open.walletAddress,
            creatorName: open.creatorName || undefined,
            creatorAddress: open.creatorAddress || undefined,
            collectionName: open.collectionName || undefined,
            provenance: open.provenance,
          }}
          actions={tokenActionsFor(open)}
          onClose={() => setOpen(null)}
        />
      )}
    </AppWindow>
  );
}
