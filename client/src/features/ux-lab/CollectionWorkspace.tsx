import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hourglass } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import {
  UiButton,
  UiPanel,
  UiTabs,
} from "../../components/wtfos-ui";
import { api } from "../../lib/api";
import { resolveTokenThumbnail, shortAddr } from "../../lib/media-resolve";
import { OwnedTokensGallery, type OwnedToken } from "../../components/OwnedTokensGallery";

interface WalletWithCount {
  id: number;
  walletAddress: string;
  tezDomain?: string | null;
  isPrimary: boolean;
  tokenCount: number;
}

interface PortfolioSummary {
  totals: {
    wallets: number;
    tokensHeld: number;
    contractsHeld: number;
  };
}

interface CollectionSummary {
  id: number;
  type: string;
  title: string;
  description: string | null;
  slug: string | null;
  isPublic: boolean;
  coverUri: string | null;
  metadata: Record<string, unknown> | null;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

interface CollectionItem {
  id: number;
  tokenContract: string;
  tokenId: string;
  quantity: number;
  position: number;
  note: string | null;
  addedAt: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  tokenDisplayUri: string | null;
  tokenMimeType: string | null;
}

interface CollectionDetailResponse {
  collection: CollectionSummary;
  items: CollectionItem[];
}

interface CollectionWorkspaceProps {
  defaultTab?: 0 | 1 | 2;
  showQuickLinks?: boolean;
  surface?: "gallery" | "portfolio";
}

interface TokensResponse {
  items: OwnedToken[];
  contracts: string[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number;
  };
}

const Lead = styled.p`
  margin: 0 0 var(--wtf-space-3, 12px);
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--wtf-space-2, 8px);
  margin-bottom: var(--wtf-space-3, 12px);
`;

const SummaryCard = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-3, 12px);
  color: var(--wtf-app-text, #111);
`;

const SummaryLabel = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.25;
`;

const SummaryValue = styled.div`
  margin-top: 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--wtf-app-link, #000080);
`;

const SummarySub = styled.div`
  margin-top: 2px;
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
  margin-bottom: var(--wtf-space-3, 12px);
`;

const ViewRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
  margin-bottom: var(--wtf-space-3, 12px);
`;

const StageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--wtf-space-3, 12px);
`;

const StageCard = styled.div<{ $hero?: boolean }>`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  display: flex;
  flex-direction: column;
  min-height: ${({ $hero }) => ($hero ? "420px" : "360px")};
  color: var(--wtf-app-text, #111);

  @media (min-width: 980px) {
    ${({ $hero }) => ($hero ? "grid-column: span 2;" : "")}
  }
`;

const StageHeader = styled.div`
  background: var(--wtf-app-primary, var(--wtf-app-link, #000080));
  color: var(--wtf-app-accent-text, #ffffff);
  padding: var(--wtf-space-2, 8px);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const StageMedia = styled.div<{ $hero?: boolean }>`
  min-height: ${({ $hero }) => ($hero ? "240px" : "190px")};
  max-height: ${({ $hero }) => ($hero ? "320px" : "260px")};
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-top: 1px solid #808080;
  border-bottom: 1px solid #808080;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const StageBody = styled.div`
  padding: var(--wtf-space-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-2, 8px);
  font-size: var(--wtf-type-caption, 13px);
  height: 100%;
`;

const StageEyebrow = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.25;
`;

const StageTitle = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: var(--wtf-app-link, #000080);
`;

const StageText = styled.p`
  margin: 0;
  color: var(--wtf-app-text, #111);
  line-height: 1.35;
`;

const StageMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const StagePill = styled.span`
  display: inline-block;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: 3px 8px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.2;
`;

const StageFooter = styled.div`
  margin-top: auto;
  display: flex;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
`;

const CollectionsLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 12px;
  margin-top: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Rail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CollectionButton = styled.button<{ $active?: boolean }>`
  text-align: left;
  width: 100%;
  border: 1px solid ${({ $active }) => ($active ? "var(--wtf-app-primary, var(--wtf-app-link, #000080))" : "var(--wtf-app-border, #808080)")};
  background: ${({ $active }) => ($active ? "var(--wtf-app-primary, var(--wtf-app-link, #000080))" : "var(--wtf-app-surface-raised, #ffffff)")};
  color: ${({ $active }) => ($active ? "var(--wtf-app-accent-text, #ffffff)" : "var(--wtf-app-text, #111)")};
  padding: var(--wtf-space-2, 8px);
  cursor: pointer;

  &:active {
    filter: brightness(0.96);
  }
`;

const CollectionTitle = styled.div`
  font-size: var(--wtf-type-body-strong, 15px);
  font-weight: 700;
  line-height: 1.25;
`;

const CollectionMeta = styled.div`
  margin-top: 4px;
  font-size: var(--wtf-type-caption, 13px);
  opacity: 0.85;
  line-height: 1.35;
`;

const CollectionDescription = styled.div`
  margin-top: var(--wtf-space-2, 8px);
  color: inherit;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  opacity: 0.9;
`;

const DetailPanel = styled(UiPanel)`
  min-height: 360px;
`;

const DetailLead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
`;

const DetailDescription = styled.p`
  margin: 0;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const DetailHero = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: 12px;
  margin-bottom: 14px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const CoverFrame = styled.div`
  min-height: 220px;
  max-height: 320px;
  background: #111;
  border: 2px inset #808080;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const DetailBadge = styled.span`
  display: inline-block;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: 3px 8px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.2;
  margin-right: 4px;
  margin-bottom: 4px;
`;

const ItemGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
`;

const ItemCard = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  display: flex;
  flex-direction: column;
  min-height: 250px;
  color: var(--wtf-app-text, #111);
`;

const ItemThumb = styled.div`
  background: #000;
  min-height: 150px;
  max-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const ItemBody = styled.div`
  padding: var(--wtf-space-2, 8px);
  font-size: var(--wtf-type-caption, 13px);
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ItemName = styled.div`
  font-weight: 700;
  margin-bottom: 4px;
`;

const ItemNote = styled.div`
  margin-top: 6px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  line-height: 1.35;
`;

const EmptyState = styled.div`
  padding: 24px 12px;
  text-align: center;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  line-height: 1.35;
`;

const ContractLine = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

function collectionTypeLabel(type: string): string {
  switch (type) {
    case "curation":
      return "Curated room";
    case "wtf_gallery":
      return "WTF room";
    case "trade_board_listing":
      return "Trade board set";
    case "objkt_curation":
      return "Objkt curation";
    case "external_listing":
      return "External set";
    default:
      return "Custom room";
  }
}

function walletLabel(wallet: WalletWithCount): string {
  return wallet.tezDomain || shortAddr(wallet.walletAddress);
}

function tokenDescription(token: OwnedToken, mode: "created" | "collected"): string {
  const metadata = token.metadata || {};
  const candidates = [
    metadata.description,
    metadata.collectionName,
    metadata.story,
    metadata.statement,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return mode === "created"
    ? "Created work from your linked-wallet archive."
    : "Collected work held inside your linked-wallet set.";
}

function tokenSeries(token: OwnedToken): string | null {
  const metadata = token.metadata || {};
  const raw = metadata.collectionName || metadata.collection || metadata.series;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function tokenTagList(token: OwnedToken): string[] {
  const metadata = token.metadata || {};
  const raw = metadata.tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).slice(0, 3);
}

export function CollectionWorkspace({
  defaultTab = 1,
  showQuickLinks = true,
  surface = "portfolio",
}: CollectionWorkspaceProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(
    null
  );
  const [createdView, setCreatedView] = useState<"room" | "portfolio">(
    surface === "gallery" ? "room" : "portfolio"
  );
  const [collectedView, setCollectedView] = useState<"room" | "portfolio">(
    surface === "gallery" ? "room" : "portfolio"
  );

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletWithCount[]>("/api/wallets"),
  });

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio-summary"],
    queryFn: () => api.get<PortfolioSummary>("/api/portfolio/summary"),
  });

  const { data: createdTokens, isLoading: createdLoading } = useQuery({
    queryKey: ["profile-tokens-stage", "created"],
    queryFn: () =>
      api.get<TokensResponse>("/api/profile/tokens?createdByMe=true&limit=12"),
    enabled: activeTab === 0 && createdView === "room",
  });

  const { data: collectedTokens, isLoading: collectedLoading } = useQuery({
    queryKey: ["profile-tokens-stage", "collected"],
    queryFn: () =>
      api.get<TokensResponse>("/api/profile/tokens?createdByMe=false&limit=12"),
    enabled: activeTab === 1 && collectedView === "room",
  });

  const { data: collectionIndex, isLoading: collectionsLoading } = useQuery({
    queryKey: ["cockpit-collections"],
    queryFn: () => api.get<{ collections: CollectionSummary[] }>("/api/cockpit/collections"),
  });

  useEffect(() => {
    if (selectedCollectionId) return;
    const firstId = collectionIndex?.collections?.[0]?.id;
    if (firstId) setSelectedCollectionId(firstId);
  }, [collectionIndex, selectedCollectionId]);

  const selectedCollection = useMemo(
    () =>
      collectionIndex?.collections?.find((collection) => collection.id === selectedCollectionId) ??
      null,
    [collectionIndex, selectedCollectionId]
  );

  const { data: collectionDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["cockpit-collection-detail", selectedCollectionId],
    queryFn: () =>
      api.get<CollectionDetailResponse>(`/api/cockpit/collections/${selectedCollectionId}`),
    enabled: activeTab === 2 && !!selectedCollectionId,
  });

  const walletCount = wallets?.length ?? 0;
  const primaryWallet = wallets?.find((wallet) => wallet.isPrimary) ?? wallets?.[0];
  const collectionCount = collectionIndex?.collections?.length ?? 0;
  const createdCount = createdTokens?.pagination?.total ?? 0;
  const collectedCount =
    collectedTokens?.pagination?.total ??
    Math.max(0, (portfolio?.totals.tokensHeld ?? 0) - createdCount);
  const isGallerySurface = surface === "gallery";

  const renderStage = (
    items: OwnedToken[] | undefined,
    isLoading: boolean,
    mode: "created" | "collected"
  ) => {
    if (isLoading) {
      return (
        <EmptyState>
          <Hourglass size={24} />
        </EmptyState>
      );
    }

    if (!items?.length) {
      return (
        <EmptyState>
          {mode === "created"
            ? "No created works are indexed for these linked wallets yet."
            : "No collected works are indexed for these linked wallets yet."}
        </EmptyState>
      );
    }

    return (
      <StageGrid>
        {items.map((token, index) => {
          const preview = resolveTokenThumbnail({
            thumbnail: token.thumbnail || undefined,
            metadata: token.metadata,
          });
          const hero = index === 0;
          const description = tokenDescription(token, mode);
          const series = tokenSeries(token);
          const tags = tokenTagList(token);
          return (
            <StageCard key={`${token.contract}:${token.tokenId}`} $hero={hero}>
              <StageHeader>
                <span>{hero ? "Featured" : mode === "created" ? "Created" : "Collected"}</span>
                <span>{series || `Token #${token.tokenId}`}</span>
              </StageHeader>
              <StageMedia $hero={hero}>
                {preview ? (
                  <img
                    src={preview.src}
                    alt={token.name || `Token #${token.tokenId}`}
                    loading="lazy"
                    onError={(event) => {
                      const target = event.currentTarget;
                      if (preview.fallbackSrc && target.dataset.usedFallback !== "1") {
                        target.dataset.usedFallback = "1";
                        target.src = preview.fallbackSrc;
                        return;
                      }
                      target.style.display = "none";
                    }}
                  />
                ) : (
                  <span style={{ color: "#808080", fontSize: 24 }}>?</span>
                )}
              </StageMedia>
              <StageBody>
                <div>
                  <StageEyebrow>
                    {mode === "created" ? "Made by linked wallets" : "Held across linked wallets"}
                  </StageEyebrow>
                  <StageTitle>{token.name || `Token #${token.tokenId}`}</StageTitle>
                </div>
                <StageText>{description}</StageText>
                <StageMeta>
                  {series ? <StagePill>{series}</StagePill> : null}
                  <StagePill>
                    {mode === "created"
                      ? "Artist view"
                      : `Held in ${shortAddr(token.walletAddress)}`}
                  </StagePill>
                  {token.onTradeBoard ? (
                    <StagePill>On Trade Board · {token.tradeBoardQuantity}</StagePill>
                  ) : null}
                  {tags.map((tag) => (
                    <StagePill key={tag}>{tag}</StagePill>
                  ))}
                </StageMeta>
                <StageFooter>
                  <UiButton
                    compact
                    onClick={() =>
                      mode === "created"
                        ? setCreatedView("portfolio")
                        : setCollectedView("portfolio")
                    }
                  >
                    Show portfolio view
                  </UiButton>
                  <UiButton compact onClick={() => setLocation("/marketplace")}>
                    Open marketplace
                  </UiButton>
                </StageFooter>
              </StageBody>
            </StageCard>
          );
        })}
      </StageGrid>
    );
  };

  return (
    <div>
      <Lead>
        {isGallerySurface
          ? "An exhibition-first surface for created work, collected work, and curated rooms. Wallet truth stays intact, but the first read belongs to the art."
          : "One portfolio surface for linked wallets, holdings, and curated sets. Wallet truth, cost basis, and collections now share one source of record."}
      </Lead>

      <SummaryGrid>
        <SummaryCard>
          <SummaryLabel>{isGallerySurface ? "Created Works" : "Linked Wallets"}</SummaryLabel>
          <SummaryValue>{isGallerySurface ? createdCount : walletCount}</SummaryValue>
          <SummarySub>
            {isGallerySurface
              ? "Artist-side holdings in view"
              : primaryWallet
                ? `Primary: ${walletLabel(primaryWallet)}`
                : "No wallet linked yet"}
          </SummarySub>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>{isGallerySurface ? "Collected Works" : "Indexed Positions"}</SummaryLabel>
          <SummaryValue>{isGallerySurface ? collectedCount : portfolio?.totals.tokensHeld ?? 0}</SummaryValue>
          <SummarySub>
            {isGallerySurface
              ? `${portfolio?.totals.contractsHeld ?? 0} contracts represented`
              : `${portfolio?.totals.contractsHeld ?? 0} contract${(portfolio?.totals.contractsHeld ?? 0) === 1 ? "" : "s"}`}
          </SummarySub>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>{isGallerySurface ? "Curated Rooms" : "Saved Collections"}</SummaryLabel>
          <SummaryValue>{collectionCount}</SummaryValue>
          <SummarySub>
            {isGallerySurface
              ? "Story-first sets built from held work"
              : "Built from the same indexed token set"}
          </SummarySub>
        </SummaryCard>
      </SummaryGrid>

      {showQuickLinks && (
        <ActionRow>
          {isGallerySurface ? (
            <>
              <UiButton onClick={() => setLocation("/dashboard")}>Open dashboard portfolio</UiButton>
              <UiButton onClick={() => setLocation("/profile")}>Open profile and wallets</UiButton>
              <UiButton onClick={() => setLocation("/messageboard")}>Open message board</UiButton>
            </>
          ) : (
            <>
              <UiButton onClick={() => setLocation("/my-gallery")}>Open exhibition</UiButton>
              <UiButton onClick={() => setLocation("/profile")}>Open profile and wallets</UiButton>
              <UiButton onClick={() => setLocation("/marketplace")}>Open marketplace</UiButton>
            </>
          )}
        </ActionRow>
      )}

      <UiTabs
        activeId={String(activeTab)}
        onChange={(value) => setActiveTab(Number(value) as 0 | 1 | 2)}
        tabs={[
          { id: "0", label: "Created" },
          { id: "1", label: "Collected" },
          { id: "2", label: "Curated" },
        ]}
      />
      <div>
        {activeTab === 0 && (
          <UiPanel title={isGallerySurface ? "Created exhibition" : "Created by linked wallets"} compact>
            <Lead>
              {isGallerySurface
                ? "Start with the authored read: image, sequence, and statement first. Drop to portfolio mode only when you need wallet or trading controls."
                : "Authored work stays distinct from collected work so provenance and creator identity never collapse into the same bucket."}
            </Lead>
            <ViewRow>
              <UiButton active={createdView === "room"} onClick={() => setCreatedView("room")}>
                Room view
              </UiButton>
              <UiButton active={createdView === "portfolio"} onClick={() => setCreatedView("portfolio")}>
                Portfolio view
              </UiButton>
            </ViewRow>
            {createdView === "room" ? renderStage(createdTokens?.items, createdLoading, "created") : (
              <OwnedTokensGallery
                walletOptions={
                  wallets?.map((wallet) => ({
                    label: `${walletLabel(wallet)}${wallet.isPrimary ? " *" : ""}`,
                    value: wallet.walletAddress,
                  })) ?? []
                }
                userWallets={wallets?.map((wallet) => wallet.walletAddress) ?? []}
              />
            )}
          </UiPanel>
        )}

        {activeTab === 1 && (
          <UiPanel title={isGallerySurface ? "Collected rooms" : "Collected across linked wallets"} compact>
            <Lead>
              {isGallerySurface
                ? "Collected work should feel like living with art, not just counting positions. Provenance stays available, but the first read belongs to the piece and why it matters."
                : "Collected work stays interoperable across every linked wallet while still preserving portfolio, trade-board, and media controls from the same holdings index."}
            </Lead>
            <ViewRow>
              <UiButton active={collectedView === "room"} onClick={() => setCollectedView("room")}>
                Room view
              </UiButton>
              <UiButton active={collectedView === "portfolio"} onClick={() => setCollectedView("portfolio")}>
                Portfolio view
              </UiButton>
            </ViewRow>
            {collectedView === "room" ? renderStage(collectedTokens?.items, collectedLoading, "collected") : (
              <OwnedTokensGallery
                walletOptions={
                  wallets?.map((wallet) => ({
                    label: `${walletLabel(wallet)}${wallet.isPrimary ? " *" : ""}`,
                    value: wallet.walletAddress,
                  })) ?? []
                }
                userWallets={wallets?.map((wallet) => wallet.walletAddress) ?? []}
              />
            )}
          </UiPanel>
        )}

        {activeTab === 2 && (
          <CollectionsLayout>
            <Rail>
              <UiPanel title={isGallerySurface ? "Curated rooms" : "Collection index"} compact>
                {collectionsLoading ? (
                  <EmptyState>
                    <Hourglass size={24} />
                  </EmptyState>
                ) : !collectionIndex?.collections?.length ? (
                  <EmptyState>
                    No curated rooms yet. This account has holdings, but nothing has been shaped into a room or public set.
                  </EmptyState>
                ) : (
                  collectionIndex.collections.map((collection) => (
                    <CollectionButton
                      key={collection.id}
                      $active={collection.id === selectedCollectionId}
                      onClick={() => setSelectedCollectionId(collection.id)}
                    >
                      <CollectionTitle>{collection.title}</CollectionTitle>
                      <CollectionMeta>
                        {collection.itemCount} item{collection.itemCount === 1 ? "" : "s"} ·{" "}
                        {collectionTypeLabel(collection.type)}
                      </CollectionMeta>
                      {collection.description ? (
                        <CollectionDescription>
                          {collection.description}
                        </CollectionDescription>
                      ) : null}
                    </CollectionButton>
                  ))
                )}
              </UiPanel>
            </Rail>

            <DetailPanel title={selectedCollection?.title || "Collection detail"} compact>
              {!selectedCollectionId ? (
                <EmptyState>Select a curated room to inspect its works.</EmptyState>
              ) : detailLoading ? (
                <EmptyState>
                  <Hourglass size={24} />
                </EmptyState>
              ) : !collectionDetail ? (
                <EmptyState>Could not load this collection.</EmptyState>
              ) : (
                <>
                  <DetailHero>
                    <CoverFrame>
                      {(() => {
                        const firstItem = collectionDetail.items[0];
                        const preview = firstItem
                          ? resolveTokenThumbnail({
                              thumbnail:
                                firstItem.tokenThumbnail ||
                                firstItem.tokenDisplayUri ||
                                undefined,
                              metadata: {
                                thumbnailUri: firstItem.tokenThumbnail,
                                displayUri: firstItem.tokenDisplayUri,
                              },
                            })
                          : null;
                        return preview ? (
                          <img src={preview.src} alt={collectionDetail.collection.title} />
                        ) : (
                          <span style={{ color: "#808080", fontSize: 24 }}>?</span>
                        );
                      })()}
                    </CoverFrame>
                    <div>
                      <DetailLead>
                        <div>
                          <DetailDescription>
                            {collectionDetail.collection.description ||
                              "A curated room built from linked-wallet holdings. The collection should read like a thesis, not just a saved filter."}
                          </DetailDescription>
                          <div style={{ marginTop: 8 }}>
                            <DetailBadge>
                              {collectionTypeLabel(collectionDetail.collection.type)}
                            </DetailBadge>
                            <DetailBadge>
                              {collectionDetail.collection.isPublic ? "Public room" : "Private room"}
                            </DetailBadge>
                            <DetailBadge>
                              {collectionDetail.items.length} work
                              {collectionDetail.items.length === 1 ? "" : "s"}
                            </DetailBadge>
                          </div>
                        </div>
                        <UiButton onClick={() => setActiveTab(1)}>Browse collected works</UiButton>
                      </DetailLead>
                    </div>
                  </DetailHero>

                  {collectionDetail.items.length === 0 ? (
                    <EmptyState>This collection exists, but it has no indexed items yet.</EmptyState>
                  ) : (
                    <ItemGrid>
                      {collectionDetail.items.map((item) => {
                        const preview = resolveTokenThumbnail({
                          thumbnail: item.tokenThumbnail || item.tokenDisplayUri || undefined,
                          metadata: {
                            thumbnailUri: item.tokenThumbnail,
                            displayUri: item.tokenDisplayUri,
                          },
                        });
                        return (
                          <ItemCard key={`${item.tokenContract}:${item.tokenId}`}>
                            <ItemThumb>
                              {preview ? (
                                <img
                                  src={preview.src}
                                  alt={item.tokenName || `Token ${item.tokenId}`}
                                  loading="lazy"
                                  onError={(event) => {
                                    const target = event.currentTarget;
                                    if (
                                      preview.fallbackSrc &&
                                      target.dataset.usedFallback !== "1"
                                    ) {
                                      target.dataset.usedFallback = "1";
                                      target.src = preview.fallbackSrc;
                                      return;
                                    }
                                    target.style.display = "none";
                                  }}
                                />
                              ) : (
                                <span style={{ color: "#808080", fontSize: 24 }}>?</span>
                              )}
                            </ItemThumb>
                            <ItemBody>
                              <StageEyebrow>Position {item.position + 1}</StageEyebrow>
                              <ItemName>{item.tokenName || `Token #${item.tokenId}`}</ItemName>
                              <div>{item.quantity} edition{item.quantity === 1 ? "" : "s"}</div>
                              <ContractLine>
                                Contract {shortAddr(item.tokenContract)} · token {item.tokenId}
                              </ContractLine>
                              {item.note ? <ItemNote>{item.note}</ItemNote> : null}
                            </ItemBody>
                          </ItemCard>
                        );
                      })}
                    </ItemGrid>
                  )}
                </>
              )}
            </DetailPanel>
          </CollectionsLayout>
        )}
      </div>
    </div>
  );
}
