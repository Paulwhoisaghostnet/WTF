import { useState, useEffect } from "react";
import {
  Button,
  Hourglass,
  Tabs,
  Tab,
  TabBody,
} from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import type { OwnedToken } from "../components/OwnedTokensGallery";
import { TokenDetailModal } from "../components/TokenCard";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";
import { useWallet } from "../lib/wallet-context";
import {
  MarketplaceErrorLine,
  MarketplaceSummaryBar,
  MarketplaceSurface,
} from "../features/marketplace/MarketplaceChrome";
import type {
  CreateFormState,
  MarketplaceProps,
  PendingOfferAccept,
  SelectedToken,
} from "../features/marketplace/types";
import { CreateMarketEntryPanel } from "../features/marketplace/CreateMarketEntryPanel";
import { MarketplaceActivityTab } from "../features/marketplace/MarketplaceActivityTab";
import { MarketplaceAuctionsTab } from "../features/marketplace/MarketplaceAuctionsTab";
import { MarketplaceListingsTab } from "../features/marketplace/MarketplaceListingsTab";
import { MarketplaceTradeBoardsTab } from "../features/marketplace/MarketplaceTradeBoardsTab";
import { OfferAcceptanceDialog } from "../features/marketplace/OfferAcceptanceDialog";
import { useMarketplaceActions } from "../features/marketplace/useMarketplaceActions";
import { useMarketplaceData } from "../features/marketplace/useMarketplaceData";

export function Marketplace({
  initialTab = 0,
  surfaceVariant = "marketplace",
}: MarketplaceProps) {
  const { user } = useAuth();
  const { address } = useWallet();
  const presentation = usePresentationShell();

  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedToken, setSelectedToken] = useState<SelectedToken | null>(null);

  const [createForm, setCreateForm] = useState<CreateFormState>({
    amount: "1",
    listingType: "buy_now",
    priceWtf: "",
    auctionReserveWtf: "",
    startTime: "",
    endTime: "",
    extensionTimeSec: "300",
    priceIncrementWtf: "",
    sharesCsv: "",
  });

  const [offerInputs, setOfferInputs] = useState<Record<string, string>>({});
  const [auctionBidInputs, setAuctionBidInputs] = useState<Record<string, string>>({});
  const [boardSearch, setBoardSearch] = useState("");
  const [tradeBoardMode, setTradeBoardMode] = useState<"offers" | "barter">(
    "offers"
  );
  const [pendingOfferAccept, setPendingOfferAccept] = useState<PendingOfferAccept>(null);
  const [detailToken, setDetailToken] = useState<OwnedToken | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const listToken = params.get("listToken");
    const contract = params.get("contract");
    const tokenIdParam = params.get("tokenId");
    const amountParam = params.get("amount");
    if (listToken && contract && tokenIdParam) {
      setShowCreate(true);
      setActiveTab(0);
      (async () => {
        try {
          const res = await api.get<any>(
            `/api/profile/tokens?contract=${contract}&onTradeBoard=true&limit=200`
          );
          const found = res.items?.find(
            (t: any) =>
              String(t.id) === listToken ||
              (t.contract === contract && t.tokenId === tokenIdParam)
          );
          if (found) {
            setSelectedToken({
              contract: found.contract,
              tokenId: found.tokenId,
              balance: found.balance,
              name: found.name,
              thumbnail: found.thumbnail,
              metadata: found.metadata,
              walletAddress: found.walletAddress,
              creatorName: found.creatorName || undefined,
              creatorAddress: found.creatorAddress || undefined,
              collectionName: found.collectionName || undefined,
              provenance: found.provenance || null,
              tradeBoardQuantity: found.tradeBoardQuantity ?? (Number(found.balance) || 1),
            });
            setCreateForm((f) => ({
              ...f,
              amount: amountParam || "1",
            }));
          }
        } catch {
          // non-fatal
        }
      })();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const {
    invalidateMarket,
    loadingBoard,
    loadingOnchain,
    myAuctions,
    externalListings,
    myListings,
    myOffers,
    offersByToken,
    offersToMe,
    onchain,
    tradeBoard,
    wallets,
    walletOptions,
  } = useMarketplaceData({
    address,
    boardSearch,
    hasUser: !!user,
  });

  const handleTokenSelect = (token: any) => {
    setSelectedToken({
      contract: token.contract,
      tokenId: token.tokenId,
      balance: token.balance,
      name: token.name,
      thumbnail: token.thumbnail,
      metadata: token.metadata,
      walletAddress: token.walletAddress,
      creatorName: token.creatorName || undefined,
      creatorAddress: token.creatorAddress || undefined,
      collectionName: token.collectionName || undefined,
      provenance: token.provenance || null,
      tradeBoardQuantity: token.tradeBoardQuantity ?? (Number(token.balance) || 1),
    });
    setCreateForm((f) => ({
      ...f,
      amount: "1",
    }));
  };

  const updateField = (field: string) => (e: any) =>
    setCreateForm((f) => ({ ...f, [field]: e.target?.value ?? e.value }));

  const {
    createMutation,
    handleAcceptActivityOffer,
    handleAcceptListingOffer,
    handleAcceptTradeBoardOffer,
    handleAuctionBidInputChange,
    handleBuyListing,
    handleCancelAuction,
    handleCancelExternalListing,
    handleCancelListing,
    handleCancelOffer,
    handleCancelTradeBoardOffer,
    handleCreateSubmit,
    handleListingOfferInputChange,
    handlePlaceAuctionBid,
    handlePlaceListingOffer,
    handlePlaceTradeBoardOffer,
    handleRejectOffer,
    handleRejectTradeBoardOffer,
    handleSettleAuction,
    runAcceptOfferForToken,
  } = useMarketplaceActions({
    address,
    auctionBidInputs,
    createForm,
    contractVersion: onchain?.contractVersion ?? "legacy",
    invalidateMarket,
    legacyContractAddress: onchain?.legacyContractAddress ?? null,
    offerInputs,
    onchainListings: onchain?.listings,
    selectedToken,
    setAuctionBidInputs,
    setCreateForm,
    setErrorMsg,
    setOfferInputs,
    setPendingOfferAccept,
    setSelectedToken,
    setShowCreate,
  });

  const onNow = Date.now();

  return (
    <AppWindow title="WTF On Chain Market + Trade Boards">
      <MarketplaceSurface
        data-marketplace-presentation-host={presentation.host}
        data-marketplace-surface={surfaceVariant}
        data-marketplace-active-tab={activeTab}
      >
        {pendingOfferAccept && (
          <OfferAcceptanceDialog
            pendingOfferAccept={pendingOfferAccept}
            onCancel={() => setPendingOfferAccept(null)}
            onConfirm={async (pending) => {
              try {
                await runAcceptOfferForToken(pending);
                setPendingOfferAccept(null);
              } catch (err: any) {
                setErrorMsg(err?.message || "Accept offer failed");
              }
            }}
          />
        )}

        <div data-marketplace-region="tabs">
          <Tabs value={activeTab} onChange={(v: number) => setActiveTab(v)}>
            <Tab value={0}>Listings</Tab>
            <Tab value={1}>Auctions</Tab>
            <Tab value={2}>Trade Boards</Tab>
            <Tab value={3}>My Activity</Tab>
          </Tabs>
        </div>

        <TabBody>
          {(loadingOnchain || !onchain) && (
            <div style={{ padding: 16 }}>
              <Hourglass size={32} />
            </div>
          )}

          {onchain && activeTab === 0 && (
            <>
              <MarketplaceSummaryBar>
                <span>
                  {onchain.counts.listings} active listing(s)
                  {onchain.paused ? " | Contract paused" : ""}
                </span>
                {user && (
                  <Button onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? "Cancel" : "+ New Listing/Auction"}
                  </Button>
                )}
              </MarketplaceSummaryBar>

              {showCreate && (
                <CreateMarketEntryPanel
                  createForm={createForm}
                  errorMsg={errorMsg}
                  hasLinkedWallets={!!wallets?.length}
                  isSubmitting={createMutation.isPending}
                  onClearSelectedToken={() => setSelectedToken(null)}
                  onFieldChange={updateField}
                  onListingTypeChange={(listingType) =>
                    setCreateForm((f) => ({
                      ...f,
                      listingType,
                    }))
                  }
                  onSubmit={handleCreateSubmit}
                  onTokenSelect={handleTokenSelect}
                  selectedToken={selectedToken}
                  walletOptions={walletOptions}
                />
              )}

              {loadingOnchain ? (
                <Hourglass size={32} />
              ) : (
                <MarketplaceListingsTab
                  address={address}
                  listings={onchain.listings}
                  offerInputs={offerInputs}
                  offersByToken={offersByToken}
                  onAcceptOffer={handleAcceptListingOffer}
                  onBuyListing={handleBuyListing}
                  onCancelListing={handleCancelListing}
                  onOfferInputChange={handleListingOfferInputChange}
                  onPlaceOffer={handlePlaceListingOffer}
                  onSelectToken={setDetailToken}
                />
              )}
            </>
          )}

          {onchain && activeTab === 1 && (
            <>
              <MarketplaceSummaryBar>
                <span>{onchain.counts.auctions} active auction(s)</span>
              </MarketplaceSummaryBar>
              <MarketplaceAuctionsTab
                address={address}
                admin={onchain.admin}
                auctionBidInputs={auctionBidInputs}
                auctions={onchain.auctions}
                nowMs={onNow}
                onBidInputChange={handleAuctionBidInputChange}
                onCancelAuction={handleCancelAuction}
                onPlaceBid={handlePlaceAuctionBid}
                onSelectToken={setDetailToken}
                onSettleAuction={handleSettleAuction}
              />
            </>
          )}

          {activeTab === 2 && (
            <MarketplaceTradeBoardsTab
              address={address}
              boardSearch={boardSearch}
              items={tradeBoard?.items || []}
              loadingBoard={loadingBoard}
              mode={tradeBoardMode}
              offerInputs={offerInputs}
              onAcceptOffer={handleAcceptTradeBoardOffer}
              onCancelOffer={handleCancelTradeBoardOffer}
              onModeChange={setTradeBoardMode}
              onOfferInputChange={handleListingOfferInputChange}
              onPlaceOffer={handlePlaceTradeBoardOffer}
              onRejectOffer={handleRejectTradeBoardOffer}
              onSearchChange={setBoardSearch}
              onSelectToken={setDetailToken}
            />
          )}

          {onchain && activeTab === 3 && (
            <MarketplaceActivityTab
              myAuctions={myAuctions}
              externalListings={externalListings}
              myListings={myListings}
              myOffers={myOffers}
              offersToMe={offersToMe}
              onAcceptOffer={handleAcceptActivityOffer}
              onCancelListing={handleCancelListing}
              onCancelExternalListing={handleCancelExternalListing}
              onCancelOffer={handleCancelOffer}
              onRejectOffer={handleRejectOffer}
              onSettleAuction={handleSettleAuction}
            />
          )}

          {errorMsg && <MarketplaceErrorLine>{errorMsg}</MarketplaceErrorLine>}
        </TabBody>

        {detailToken && (
          <TokenDetailModal
            token={detailToken}
            onClose={() => setDetailToken(null)}
          />
        )}
      </MarketplaceSurface>
    </AppWindow>
  );
}
