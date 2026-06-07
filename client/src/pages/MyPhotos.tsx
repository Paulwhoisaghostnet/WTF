import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  TextInput,
  Hourglass,
  GroupBox,
  Tabs,
  Tab,
  TabBody,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { TokenCard as SharedTokenCard, TokenDetailModal, TokenGrid, type TokenCardData, type TokenCardAction } from "../components/TokenCard";
import { api } from "../lib/api";
import { getTokenMimeType, isImageMime, cacheProxyUrl } from "../lib/media-resolve";
import {
  provenanceCreatorLabel,
  provenanceSupportLinks,
  readEmbeddedProvenance,
} from "../lib/provenance";

/* ─── Types ──────────────────────────────────────────── */

interface MediaItem {
  id: number;
  title: string;
  description?: string;
  sourceType: string;
  sourceUrl: string;
  playbackUrl?: string;
  posterUrl?: string;
  mimeType: string;
  status: string;
  tokenContract?: string;
  tokenId?: string;
  metadata?: Record<string, any> | null;
  mediaCategory: string;
  fileSize?: number;
  createdAt: string;
}

interface OwnedToken {
  id: number;
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  walletAddress: string;
  creatorName?: string;
  creatorAddress?: string;
  collectionName?: string;
}

/* ─── Styles ─────────────────────────────────────────── */

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
`;

const ToolBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`;

const InlineMeta = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  white-space: nowrap;
`;

const LibGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(140px, 16vw, 190px), 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;

const ScrollWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const PhotoCard = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  box-shadow: 1px 1px 0 #000;
  overflow: hidden;
`;

const PhotoThumb = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
`;

const PhotoInfo = styled.div`
  padding: 6px 8px;
  font-size: var(--wtf-type-caption, 13px);
`;

const PhotoTitle = styled.div`
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PhotoMeta = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  margin-top: 2px;
`;

const CardActions = styled.div`
  margin-top: 6px;
  display: flex;
  gap: 4px;
`;

const UploadArea = styled.div`
  border: 2px dashed #808080;
  background: #f0f0f0;
  padding: 20px;
  text-align: center;
  font-size: var(--wtf-type-body, 14px);
  cursor: pointer;
  &:hover { background: #e8e8e8; }
`;

const UploadForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const UploadIcon = styled.div`
  font-size: 24px;
  margin-bottom: 6px;
`;

const EmptyText = styled.p`
  font-size: var(--wtf-type-caption, 13px);
  padding: 8px;
  margin: 0;
  color: var(--wtf-app-muted, #4b5563);
`;

const StateText = styled.p<{ $tone?: "success" | "danger" }>`
  color: ${({ $tone }) =>
    $tone === "success"
      ? "var(--wtf-app-success-text, #14532d)"
      : "var(--wtf-app-danger-text, #7f1d1d)"};
  font-size: var(--wtf-type-caption, 13px);
  margin: 0;
`;

const MAX_UPLOAD_MB = 25;

/* ─── Component ──────────────────────────────────────── */

export function MyPhotos() {
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [detailToken, setDetailToken] = useState<TokenCardData | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  const myMediaQuery = useQuery({
    queryKey: ["media-library", "image"],
    queryFn: () => api.get<MediaItem[]>("/api/media/mine?category=image"),
  });

  const myTokensQuery = useQuery({
    queryKey: ["profile-tokens-image-import"],
    queryFn: async () => {
      const res = await api.get<{ items: OwnedToken[] }>("/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=true");
      const created = res.items || [];
      const res2 = await api.get<{ items: OwnedToken[] }>("/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=false");
      const collected = res2.items || [];
      const seen = new Set(created.map((t) => `${t.contract}:${t.tokenId}`));
      const merged = [...created, ...collected.filter((t) => !seen.has(`${t.contract}:${t.tokenId}`))];
      return merged;
    },
  });

  const importMutation = useMutation({
    mutationFn: (body: { contract: string; tokenId: string }) =>
      api.post("/api/media/import-token", { ...body, mediaCategory: "image" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library", "image"] }),
  });

  const uploadMutation = useMutation({
    mutationFn: (body: { title: string; mimeType: string; fileData: string }) =>
      api.post("/api/media/upload", { ...body, mediaCategory: "image" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library", "image"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/media/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library", "image"] }),
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      alert(`File exceeds ${MAX_UPLOAD_MB}MB limit`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Only image files are accepted");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const title = uploadTitle.trim() || file.name;
      uploadMutation.mutate({ title, mimeType: file.type, fileData: dataUrl });
      setUploadTitle("");
    };
    reader.readAsDataURL(file);
  }, [uploadTitle, uploadMutation]);

  const mediaItems = (myMediaQuery.data || []) as MediaItem[];
  const tokens = (myTokensQuery.data || []) as OwnedToken[];

  const imageTokens = tokens.filter((t) => {
    const mime = getTokenMimeType(t.metadata);
    return isImageMime(mime) && mime !== "image/gif";
  });

  const filteredTokens = search
    ? imageTokens.filter((t) => {
        const q = search.toLowerCase();
        const meta = t.metadata || {};
        const creators = Array.isArray(meta.creators) ? meta.creators : [];
        const tags = Array.isArray(meta.tags) ? meta.tags : [];
        return (
          (t.name || "").toLowerCase().includes(q) ||
          t.contract.includes(q) ||
          t.tokenId.includes(q) ||
          (t.creatorName || "").toLowerCase().includes(q) ||
          (t.creatorAddress || "").toLowerCase().includes(q) ||
          (t.collectionName || "").toLowerCase().includes(q) ||
          creators.some((c: string) => String(c).toLowerCase().includes(q)) ||
          tags.some((tag: string) => String(tag).toLowerCase().includes(q))
        );
      })
    : imageTokens;

  const importedKeys = new Set(
    mediaItems
      .filter((m) => m.tokenContract && m.tokenId)
      .map((m) => `${m.tokenContract}:${m.tokenId}`)
  );

  const tokenActions = useCallback(
    (token: TokenCardData): TokenCardAction[] => {
      const key = `${token.contract}:${token.tokenId}`;
      const alreadyImported = importedKeys.has(key);
      return [
        {
          label: alreadyImported ? "Imported" : "Import",
          icon: alreadyImported ? "✓" : "📥",
          disabled: alreadyImported || importMutation.isPending,
          onClick: (t) => importMutation.mutate({ contract: t.contract, tokenId: t.tokenId }),
        },
      ];
    },
    [importedKeys, importMutation]
  );

  function getMediaUrl(item: MediaItem): string {
    if (item.sourceType === "upload") return `/api/media/${item.id}/file`;
    if (item.playbackUrl) return cacheProxyUrl(item.playbackUrl);
    return cacheProxyUrl(item.sourceUrl);
  }

  function getOverlayField(item: MediaItem, field: "creatorName" | "collectionName"): string {
    const raw = item.metadata?.wtfTvOverlay?.[field];
    return typeof raw === "string" ? raw : "";
  }

  return (
    <AppWindow title="🖼️ My Photos">
      <Content>
        <Tabs value={tab} onChange={(v: number) => setTab(v)}>
          <Tab value={0}>Library</Tab>
          <Tab value={1}>Import from Tokens</Tab>
          <Tab value={2}>Upload</Tab>
        </Tabs>
        <TabBody>
          {/* ─── Library tab ─── */}
          {tab === 0 && (
            <>
              {myMediaQuery.isLoading ? (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <Hourglass size={32} />
                </div>
              ) : mediaItems.length === 0 ? (
                <EmptyText>
                  No photos in your library yet. Import from tokens or upload directly.
                </EmptyText>
              ) : (
                <LibGrid>
                  {mediaItems.map((item) => {
                    const provenance = readEmbeddedProvenance(item);
                    const supportLink = provenanceSupportLinks(provenance)[0] || null;
                    return (
                      <PhotoCard key={item.id}>
                        <PhotoThumb>
                          <img src={getMediaUrl(item)} alt={item.title} loading="lazy" />
                        </PhotoThumb>
                        <PhotoInfo>
                          <PhotoTitle>{item.title}</PhotoTitle>
                          <PhotoMeta>
                            {item.mimeType}
                            {item.tokenContract && ` · Token`}
                            {item.fileSize && ` · ${(item.fileSize / 1024).toFixed(0)}KB`}
                          </PhotoMeta>
                          {(getOverlayField(item, "creatorName") ||
                            getOverlayField(item, "collectionName")) && (
                            <PhotoMeta>
                              {[
                                getOverlayField(item, "creatorName") &&
                                  `Creator · ${getOverlayField(item, "creatorName")}`,
                                getOverlayField(item, "collectionName") &&
                                  `Collection · ${getOverlayField(item, "collectionName")}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </PhotoMeta>
                          )}
                          {provenance && (
                            <PhotoMeta>
                              Provenance · {provenanceCreatorLabel(provenance)}
                              {supportLink && (
                                <>
                                  {" · "}
                                  <a href={supportLink.url} target="_blank" rel="noopener noreferrer">
                                    Support on Tezos
                                  </a>
                                </>
                              )}
                            </PhotoMeta>
                          )}
                          <CardActions>
                            <Button
                              size="sm"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (confirm("Remove from library?")) deleteMutation.mutate(item.id);
                              }}
                            >
                              Remove photo
                            </Button>
                          </CardActions>
                        </PhotoInfo>
                      </PhotoCard>
                    );
                  })}
                </LibGrid>
              )}
            </>
          )}

          {/* ─── Import from Tokens tab ─── */}
          {tab === 1 && (
            <>
              <ToolBar>
                <TextInput
                  aria-label="Search image tokens"
                  value={search}
                  onChange={(e: any) => setSearch(e.target?.value ?? "")}
                  placeholder="Search by name, creator, tag..."
                  style={{ flex: 1, minWidth: 160 }}
                />
                <InlineMeta>
                  {filteredTokens.length} of {imageTokens.length} image token{imageTokens.length !== 1 ? "s" : ""}
                  {tokens.length > 0 ? ` (${tokens.length} total)` : ""}
                </InlineMeta>
              </ToolBar>

              {myTokensQuery.isLoading ? (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <Hourglass size={32} />
                </div>
              ) : filteredTokens.length === 0 ? (
                <EmptyText>
                  No image tokens found in your wallets. Sync your wallet in Profile.
                </EmptyText>
              ) : (
                <ScrollWrap>
                  <TokenGrid $size="md">
                    {filteredTokens.map((token) => (
                      <SharedTokenCard
                        key={`${token.contract}:${token.tokenId}`}
                        token={token}
                        actions={tokenActions(token)}
                        onClick={(t) => setDetailToken(t)}
                      />
                    ))}
                  </TokenGrid>
                </ScrollWrap>
              )}
            </>
          )}

          {/* ─── Upload tab ─── */}
          {tab === 2 && (
            <GroupBox label="Upload Image">
              <UploadForm>
                <TextInput
                  aria-label="Image upload title"
                  value={uploadTitle}
                  onChange={(e: any) => setUploadTitle(e.target?.value ?? "")}
                  placeholder="Image title (optional)"
                />
                <UploadArea onClick={() => document.getElementById("photo-upload-input")?.click()}>
                  {uploadMutation.isPending ? (
                    <Hourglass size={24} />
                  ) : (
                    <>
                      <UploadIcon>🖼️</UploadIcon>
                      Click to upload an image file (max {MAX_UPLOAD_MB}MB)
                    </>
                  )}
                </UploadArea>
                <input
                  id="photo-upload-input"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
                {uploadMutation.isError && (
                  <StateText $tone="danger">Upload failed. Please try again.</StateText>
                )}
                {uploadMutation.isSuccess && (
                  <StateText $tone="success">Uploaded successfully.</StateText>
                )}
              </UploadForm>
            </GroupBox>
          )}
        </TabBody>

        {detailToken && (
          <TokenDetailModal
            token={detailToken}
            onClose={() => setDetailToken(null)}
            actions={tokenActions(detailToken)}
          />
        )}
      </Content>
    </AppWindow>
  );
}
