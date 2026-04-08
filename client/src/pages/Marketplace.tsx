import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Select,
  Hourglass,
  Tabs,
  Tab,
  TabBody,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { OwnedTokensGallery } from "../components/OwnedTokensGallery";
import { BarterBoard } from "../components/BarterBoard";
import { UserLink } from "../components/UserLink";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { useWallet } from "../lib/wallet-context";
import {
  approveMarketplaceForToken,
  approveMarketplaceForWtf,
  createMarketplaceListingWithId,
  createMarketplaceAuction,
  buyMarketplaceListing,
  cancelMarketplaceListing,
  bidMarketplaceAuction,
  settleMarketplaceAuction,
  cancelMarketplaceAuction,
  placeMarketplaceOffer,
  cancelMarketplaceOffer,
  acceptMarketplaceOffer,
} from "../lib/tezos";
import { formatWtf, WTF_TOKEN } from "@shared/types";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
`;

const ListingCard = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  box-shadow: 1px 1px 0 #000;
  display: flex;
  flex-direction: column;
`;

const ListingTitleBar = styled.div`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: 11px;
  padding: 3px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
`;

const TokenImage = styled.div`
  width: 100%;
  min-height: 160px;
  max-height: 220px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #808080;
  border-bottom: 1px solid #808080;

  img {
    max-width: 100%;
    max-height: 220px;
    object-fit: contain;
  }
`;

const ListingBody = styled.div`
  padding: 6px 8px;
  font-size: 11px;
`;

const ListingActions = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px 8px 6px;
  flex-wrap: wrap;
  align-items: center;
  border-top: 1px solid #808080;
  margin-top: auto;
`;

const Price = styled.div`
  font-size: 18px;
  font-weight: bold;
  color: #000080;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const SelectedTokenPreview = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #dfdfdf;
  border: 2px inset #808080;
  margin-bottom: 8px;

  img {
    width: 64px;
    height: 64px;
    object-fit: contain;
    border: 1px solid #808080;
  }
`;

interface LinkedWallet {
  id: number;
  walletAddress: string;
  isPrimary: boolean;
  tokenCount?: number;
  tezDomain?: string;
}

interface SelectedToken {
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  walletAddress: string;
  tradeBoardQuantity?: number;
}

interface OnChainListing {
  id: number;
  seller: string;
  sellerUserId: number | null;
  sellerUsername: string | null;
  sellerDisplayName: string | null;
  tokenContract: string;
  tokenId: string;
  tokenAmount: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  priceWtf: string;
  royaltyRecipient: string | null;
  royaltyBps: string;
  active: boolean;
}

interface OnChainAuctionShare {
  amount: string;
  recipient: string;
}

interface OnChainAuction {
  id: number;
  creator: string;
  creatorUserId: number | null;
  creatorUsername: string | null;
  creatorDisplayName: string | null;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  reserve: string;
  startTime: string;
  endTime: string;
  extensionTime: string;
  priceIncrement: string;
  currentPrice: string;
  highestBidder: string;
  highestBidderUsername: string | null;
  highestBidderDisplayName: string | null;
  hasBid: boolean;
  shares: OnChainAuctionShare[];
  active: boolean;
}

interface OnChainOffer {
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  offerer: string;
  offererUserId: number | null;
  offererUsername: string | null;
  offererDisplayName: string | null;
  targetOwner: string;
  targetOwnerUserId: number | null;
  targetOwnerUsername: string | null;
  targetOwnerDisplayName: string | null;
  tokenAmount: string;
  amountWtf: string;
}

interface OnChainState {
  contractAddress: string;
  admin: string;
  paused: boolean;
  listings: OnChainListing[];
  auctions: OnChainAuction[];
  offers: OnChainOffer[];
  counts: {
    listings: number;
    auctions: number;
    offers: number;
  };
}

interface TradeBoardItem {
  ownerWallet: string;
  ownerUserId: number | null;
  ownerUsername: string | null;
  ownerDisplayName: string | null;
  tokenContract: string;
  tokenId: string;
  tokenAmount: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
  metadata: Record<string, any> | null;
  activeOffer: {
    tokenContract: string;
    tokenId: string;
    offerer: string;
    tokenAmount: string;
    amountWtf: string;
    targetOwner: string;
  } | null;
}

interface TradeBoardResponse {
  items: TradeBoardItem[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
    nextOffset: number;
  };
}

interface MarketplaceProps {
  initialTab?: number;
}

function parseWtfInputToRaw(input: string): number | null {
  const normalized = input.trim();
  const decimals = WTF_TOKEN.decimals;
  const re = new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
  if (!re.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const raw = Number(`${whole}${paddedFraction}`.replace(/^0+(?=\d)/, ""));
  if (!Number.isSafeInteger(raw) || raw <= 0) return null;
  return raw;
}

function inferRoyalty(token: SelectedToken): {
  recipient: string | null;
  bps: number;
} {
  const shares = token.metadata?.royalties?.shares;
  if (!shares || typeof shares !== "object") return { recipient: null, bps: 0 };
  const entries = Object.entries(shares as Record<string, any>);
  if (entries.length === 0) return { recipient: null, bps: 0 };
  const [recipient, rawShare] = entries[0];
  const numeric = Number(rawShare);
  if (!recipient || !Number.isFinite(numeric) || numeric <= 0)
    return { recipient: null, bps: 0 };
  const bps = numeric <= 1000 ? Math.round(numeric * 10) : Math.round(numeric);
  return { recipient, bps: Math.min(10_000, Math.max(0, bps)) };
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 7)}...${addr.slice(-5)}`;
}

export function Marketplace({ initialTab = 0 }: MarketplaceProps) {
  const { user } = useAuth();
  const { address } = useWallet();
  const qc = useQueryClient();

  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedToken, setSelectedToken] = useState<SelectedToken | null>(null);

  const [createForm, setCreateForm] = useState({
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
          const res = await api.get<any>(`/api/profile/tokens?contract=${contract}&limit=200`);
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

  const { data: onchain, isLoading: loadingOnchain } = useQuery({
    queryKey: ["marketplace", "onchain"],
    queryFn: () => api.get<OnChainState>("/api/marketplace/onchain"),
    refetchInterval: 15_000,
  });

  const { data: tradeBoard, isLoading: loadingBoard } = useQuery({
    queryKey: ["marketplace", "trade-board", boardSearch],
    queryFn: () =>
      api.get<TradeBoardResponse>(
        `/api/marketplace/trade-board?limit=200&q=${encodeURIComponent(boardSearch)}`
      ),
    refetchInterval: 15_000,
  });

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<LinkedWallet[]>("/api/wallets"),
    enabled: !!user,
  });

  const walletOptions =
    wallets?.map((w) => ({
      label: `${w.walletAddress.slice(0, 10)}...${w.walletAddress.slice(-6)}${w.isPrimary ? " *" : ""} [${w.tokenCount ?? 0}]`,
      value: w.walletAddress,
    })) ?? [];

  const offersByToken = useMemo(() => {
    const map = new Map<string, OnChainOffer>();
    for (const offer of onchain?.offers ?? []) {
      map.set(`${offer.tokenContract}:${offer.tokenId}`, offer);
    }
    return map;
  }, [onchain?.offers]);

  const myListings = useMemo(
    () => (onchain?.listings ?? []).filter((l) => l.seller === address),
    [onchain?.listings, address]
  );

  const myAuctions = useMemo(
    () => (onchain?.auctions ?? []).filter((a) => a.creator === address),
    [onchain?.auctions, address]
  );

  const myOffers = useMemo(
    () => (onchain?.offers ?? []).filter((o) => o.offerer === address),
    [onchain?.offers, address]
  );

  const offersToMe = useMemo(
    () => (onchain?.offers ?? []).filter((o) => o.targetOwner === address),
    [onchain?.offers, address]
  );

  const invalidateMarket = () => {
    qc.invalidateQueries({ queryKey: ["marketplace"] });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/marketplace", data),
    onSuccess: () => {
      setShowCreate(false);
      setSelectedToken(null);
      setErrorMsg("");
      setCreateForm({
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
      invalidateMarket();
    },
    onError: (err: any) => {
      setErrorMsg(err?.message || "Failed to persist marketplace entry");
    },
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
      tradeBoardQuantity: token.tradeBoardQuantity ?? (Number(token.balance) || 1),
    });
    setCreateForm((f) => ({
      ...f,
      amount: "1",
    }));
  };

  const updateField = (field: string) => (e: any) =>
    setCreateForm((f) => ({ ...f, [field]: e.target?.value ?? e.value }));

  const parseSharesCsv = (input: string): { amount: number; recipient: string }[] => {
    const trimmed = input.trim();
    if (!trimmed) return [];
    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [amountRaw, recipientRaw] = entry.split(":").map((p) => p.trim());
        const amount = Number(amountRaw);
        if (!Number.isInteger(amount) || amount <= 0) {
          throw new Error("Shares must use integer bps amounts (example: 500:tz1...)");
        }
        if (!recipientRaw?.startsWith("tz")) {
          throw new Error("Shares recipient must be a valid tz address");
        }
        return { amount, recipient: recipientRaw };
      });
  };

  const handleCreateSubmit = () => {
    if (!selectedToken) return;

    const run = async () => {
      if (!address) throw new Error("Connect wallet before creating listings or auctions");

      const amount = Number(createForm.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Amount must be a positive integer");
      }
      const maxAllowed = selectedToken.tradeBoardQuantity ?? (Number(selectedToken.balance) || 1);
      if (amount > maxAllowed) {
        throw new Error(`Amount cannot exceed trade board quantity (${maxAllowed})`);
      }

      await approveMarketplaceForToken(address, selectedToken.contract, selectedToken.tokenId);

      if (createForm.listingType === "buy_now") {
        const priceWtf = parseWtfInputToRaw(createForm.priceWtf);
        if (!priceWtf) {
          throw new Error(`Price must be a positive WTF amount (up to ${WTF_TOKEN.decimals} decimals)`);
        }

        const royalty = inferRoyalty(selectedToken);
        const result = await createMarketplaceListingWithId({
          tokenContract: selectedToken.contract,
          tokenId: selectedToken.tokenId,
          amount,
          priceWtf,
          royaltyRecipient: royalty.recipient,
          royaltyBps: royalty.bps,
        });

        createMutation.mutate({
          tokenContract: selectedToken.contract,
          tokenId: selectedToken.tokenId,
          tokenName: selectedToken.name || null,
          tokenThumbnail: selectedToken.thumbnail || null,
          amount,
          listingType: "buy_now",
          priceWtf,
          minBidWtf: null,
          endTime: null,
          opHash: result.opHash,
          onChainId: result.listingId != null ? String(result.listingId) : null,
        });
        return;
      }

      const reserveWtf = parseWtfInputToRaw(createForm.auctionReserveWtf);
      const priceIncrementWtf = parseWtfInputToRaw(createForm.priceIncrementWtf);
      if (!reserveWtf) {
        throw new Error("Auction reserve must be a positive WTF amount");
      }
      if (!priceIncrementWtf) {
        throw new Error("Auction price increment must be a positive WTF amount");
      }
      if (!createForm.startTime || !createForm.endTime) {
        throw new Error("Auction requires start and end timestamps");
      }

      const start = new Date(createForm.startTime);
      const end = new Date(createForm.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("Invalid auction start/end time");
      }

      const extensionTimeSeconds = Number(createForm.extensionTimeSec);
      if (!Number.isInteger(extensionTimeSeconds) || extensionTimeSeconds <= 0) {
        throw new Error("Extension time must be a positive integer in seconds");
      }

      const shares = parseSharesCsv(createForm.sharesCsv);

      const result = await createMarketplaceAuction({
        tokenContract: selectedToken.contract,
        tokenId: selectedToken.tokenId,
        reserveWtf,
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
        extensionTimeSeconds,
        priceIncrementWtf,
        shares,
      });

      createMutation.mutate({
        tokenContract: selectedToken.contract,
        tokenId: selectedToken.tokenId,
        tokenName: selectedToken.name || null,
        tokenThumbnail: selectedToken.thumbnail || null,
        amount: 1,
        listingType: "auction",
        priceWtf: reserveWtf,
        minBidWtf: reserveWtf,
        endTime: end.toISOString(),
        opHash: result.opHash,
        onChainId: result.auctionId != null ? String(result.auctionId) : null,
      });
    };

    run().catch((err: any) => {
      setErrorMsg(err?.message || "Failed to create on-chain market entry");
    });
  };

  const placeOfferForToken = async (
    tokenContract: string,
    tokenId: string,
    tokenAmount: string,
    targetOwner: string
  ) => {
    if (!address) throw new Error("Connect wallet before placing offers");
    const key = `${tokenContract}:${tokenId}`;
    const amountWtf = parseWtfInputToRaw(offerInputs[key] || "");
    if (!amountWtf) {
      throw new Error(`Offer amount must be positive (up to ${WTF_TOKEN.decimals} decimals)`);
    }
    const parsedAmount = Number(tokenAmount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      throw new Error("Token amount for offer is invalid");
    }

    await approveMarketplaceForWtf(address);
    await placeMarketplaceOffer({
      tokenContract,
      tokenId,
      tokenAmount: parsedAmount,
      amountWtf,
      targetOwner,
    });
    setOfferInputs((prev) => ({ ...prev, [key]: "" }));
    invalidateMarket();
  };

  const acceptOfferForToken = async (tokenContract: string, tokenId: string, listed: boolean) => {
    if (!address) throw new Error("Connect wallet before accepting offers");
    if (!listed) {
      await approveMarketplaceForToken(address, tokenContract, tokenId);
    }
    await acceptMarketplaceOffer(tokenContract, tokenId);
    invalidateMarket();
  };

  const onNow = Date.now();

  return (
    <AppWindow title="WTF Marketplace + Trade Boards">
      <Tabs value={activeTab} onChange={(v: number) => setActiveTab(v)}>
        <Tab value={0}>Listings</Tab>
        <Tab value={1}>Auctions</Tab>
        <Tab value={2}>Trade Boards</Tab>
        <Tab value={3}>My Activity</Tab>
      </Tabs>

      <TabBody>
        {(loadingOnchain || !onchain) && (
          <div style={{ padding: 16 }}>
            <Hourglass size={32} />
          </div>
        )}

        {onchain && activeTab === 0 && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <span>
                {onchain.counts.listings} active listing(s)
                {onchain.paused ? " | Contract paused" : ""}
              </span>
              {user && (
                <Button onClick={() => setShowCreate(!showCreate)}>
                  {showCreate ? "Cancel" : "+ New Listing/Auction"}
                </Button>
              )}
            </div>

            {showCreate && (
              <GroupBox label="Create Listing / Auction" style={{ marginBottom: 12 }}>
                {selectedToken ? (
                  <>
                    <SelectedTokenPreview>
                      {selectedToken.thumbnail ? (
                        <img src={selectedToken.thumbnail} alt={selectedToken.name || "Token"} />
                      ) : (
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            background: "#c0c0c0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid #808080",
                            fontSize: 24,
                          }}
                        >
                          ?
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: "bold", fontSize: 13 }}>
                          {selectedToken.name || `Token #${selectedToken.tokenId}`}
                        </div>
                        <div style={{ fontFamily: "monospace", fontSize: 10 }}>
                          {selectedToken.contract}
                        </div>
                        <div style={{ fontSize: 11 }}>
                          ID: {selectedToken.tokenId} | Balance: {selectedToken.balance}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => setSelectedToken(null)} style={{ marginLeft: "auto" }}>
                        Change
                      </Button>
                    </SelectedTokenPreview>

                    <Field>
                      <label>Listing Type</label>
                      <Select
                        value={createForm.listingType}
                        onChange={(e: any) =>
                          setCreateForm((f) => ({
                            ...f,
                            listingType: e.value,
                          }))
                        }
                        options={[
                          { label: "Buy Now", value: "buy_now" },
                          { label: "Auction", value: "auction" },
                        ]}
                        width={200}
                      />
                    </Field>

                    {createForm.listingType === "buy_now" ? (
                      <>
                        <Field>
                          <label>
                            Amount to List{" "}
                            <span style={{ fontSize: 10, opacity: 0.7 }}>
                              (Max: {selectedToken.tradeBoardQuantity ?? selectedToken.balance})
                            </span>
                          </label>
                          <TextInput
                            value={createForm.amount}
                            onChange={updateField("amount")}
                            fullWidth
                          />
                        </Field>
                        <Field>
                          <label>Price (WTF)</label>
                          <TextInput
                            value={createForm.priceWtf}
                            onChange={updateField("priceWtf")}
                            placeholder="100.00000000"
                            fullWidth
                          />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field>
                          <label>Reserve (WTF)</label>
                          <TextInput
                            value={createForm.auctionReserveWtf}
                            onChange={updateField("auctionReserveWtf")}
                            placeholder="100.00000000"
                            fullWidth
                          />
                        </Field>
                        <Field>
                          <label>Start Time (ISO)</label>
                          <TextInput
                            value={createForm.startTime}
                            onChange={updateField("startTime")}
                            placeholder="2026-04-20T18:00:00.000Z"
                            fullWidth
                          />
                        </Field>
                        <Field>
                          <label>End Time (ISO)</label>
                          <TextInput
                            value={createForm.endTime}
                            onChange={updateField("endTime")}
                            placeholder="2026-04-21T18:00:00.000Z"
                            fullWidth
                          />
                        </Field>
                        <Field>
                          <label>Extension Time (seconds)</label>
                          <TextInput
                            value={createForm.extensionTimeSec}
                            onChange={updateField("extensionTimeSec")}
                            fullWidth
                          />
                        </Field>
                        <Field>
                          <label>Price Increment (WTF)</label>
                          <TextInput
                            value={createForm.priceIncrementWtf}
                            onChange={updateField("priceIncrementWtf")}
                            placeholder="10.00000000"
                            fullWidth
                          />
                        </Field>
                        <Field>
                          <label>Shares (optional, bps:tz1..., comma-separated)</label>
                          <TextInput
                            value={createForm.sharesCsv}
                            onChange={updateField("sharesCsv")}
                            placeholder="500:tz1...,250:tz1..."
                            fullWidth
                          />
                        </Field>
                      </>
                    )}

                    {errorMsg && (
                      <p style={{ color: "red", fontSize: 12, margin: "6px 0" }}>
                        {errorMsg}
                      </p>
                    )}

                    <Button onClick={handleCreateSubmit} disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Submitting..." : "Submit"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 12, marginBottom: 8 }}>
                      Select a token from your Trade Board to list or auction.
                      Add tokens to your Trade Board from the Profile &gt; Owned Tokens view first.
                    </p>
                    {wallets && wallets.length > 0 ? (
                      <OwnedTokensGallery
                        walletOptions={walletOptions}
                        selectable
                        onSelect={handleTokenSelect}
                        pageSize={24}
                        tradeBoardOnly
                      />
                    ) : (
                      <p style={{ fontSize: 12, color: "red" }}>
                        Link a wallet in Profile before creating market entries.
                      </p>
                    )}
                  </>
                )}
              </GroupBox>
            )}

            {loadingOnchain ? (
              <Hourglass size={32} />
            ) : (
              <Grid>
                {onchain.listings.map((l) => {
                  const offerKey = `${l.tokenContract}:${l.tokenId}`;
                  const activeOffer = offersByToken.get(offerKey);
                  const isMine = address && address === l.seller;

                  return (
                    <ListingCard key={`${l.tokenContract}:${l.tokenId}:${l.id}`}>
                      <ListingTitleBar>
                        <span>💰</span>
                        {l.tokenName || `Token #${l.tokenId}`}
                      </ListingTitleBar>
                      <TokenImage>
                        {l.tokenThumbnail ? <img src={l.tokenThumbnail} alt={l.tokenName || "Token"} /> : <span style={{ color: "#808080" }}>No Preview</span>}
                      </TokenImage>
                      <ListingBody>
                        <Price>{formatWtf(l.priceWtf)} WTF</Price>
                        <p style={{ fontSize: 11 }}>Seller: <UserLink username={l.sellerUsername} displayName={l.sellerDisplayName} fallback={shortAddress(l.seller)} /></p>
                        <p style={{ fontSize: 10, fontFamily: "monospace" }}>{l.tokenContract}</p>
                        <p style={{ fontSize: 10 }}>Amount: {l.tokenAmount} | On-chain ID: {l.id}</p>
                        {activeOffer && (
                          <p style={{ fontSize: 10, marginTop: 4 }}>
                            Top offer: {formatWtf(activeOffer.amountWtf)} WTF by <UserLink username={activeOffer.offererUsername} displayName={activeOffer.offererDisplayName} fallback={shortAddress(activeOffer.offerer)} />
                          </p>
                        )}
                      </ListingBody>
                      <ListingActions>
                        {!isMine && (
                          <>
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  if (!address) throw new Error("Connect wallet before buying");
                                  await approveMarketplaceForWtf(address);
                                  await buyMarketplaceListing(l.id);
                                  invalidateMarket();
                                } catch (err: any) {
                                  setErrorMsg(err?.message || "Buy failed");
                                }
                              }}
                            >
                              Buy Now
                            </Button>
                            <TextInput
                              value={offerInputs[offerKey] || ""}
                              onChange={(e: any) =>
                                setOfferInputs((prev) => ({
                                  ...prev,
                                  [offerKey]: e.target?.value ?? "",
                                }))
                              }
                              placeholder="Offer WTF"
                              style={{ width: 70 }}
                            />
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await placeOfferForToken(l.tokenContract, l.tokenId, l.tokenAmount, l.seller);
                                } catch (err: any) {
                                  setErrorMsg(err?.message || "Offer failed");
                                }
                              }}
                            >
                              Offer
                            </Button>
                          </>
                        )}
                        {isMine && (
                          <>
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await cancelMarketplaceListing(l.id);
                                  invalidateMarket();
                                } catch (err: any) {
                                  setErrorMsg(err?.message || "Cancel failed");
                                }
                              }}
                            >
                              Cancel Listing
                            </Button>
                            {activeOffer && (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await acceptOfferForToken(l.tokenContract, l.tokenId, true);
                                  } catch (err: any) {
                                    setErrorMsg(err?.message || "Accept offer failed");
                                  }
                                }}
                              >
                                Accept Offer
                              </Button>
                            )}
                          </>
                        )}
                      </ListingActions>
                    </ListingCard>
                  );
                })}

                {onchain.listings.length === 0 && <p>No active listings.</p>}
              </Grid>
            )}
          </>
        )}

        {onchain && activeTab === 1 && (
          <>
            <div style={{ marginBottom: 12 }}>
              {onchain.counts.auctions} active auction(s)
            </div>
            <Grid>
              {onchain.auctions.map((a) => {
                const nowMs = onNow;
                const startMs = Date.parse(a.startTime);
                const endMs = Date.parse(a.endTime);
                const started = Number.isFinite(startMs) ? nowMs >= startMs : true;
                const ended = Number.isFinite(endMs) ? nowMs >= endMs : false;
                const canBid = started && !ended;
                const isCreator = address && address === a.creator;
                const isAdmin = address && address === onchain.admin;
                const bidKey = `${a.id}`;

                return (
                  <ListingCard key={`auction:${a.id}`}>
                    <ListingTitleBar>
                      <span>🔨</span>
                      {a.tokenName || `Token #${a.tokenId}`}
                    </ListingTitleBar>
                    <TokenImage>
                      {a.tokenThumbnail ? <img src={a.tokenThumbnail} alt={a.tokenName || "Token"} /> : <span style={{ color: "#808080" }}>No Preview</span>}
                    </TokenImage>
                    <ListingBody>
                      <Price>{formatWtf(a.currentPrice || a.reserve)} WTF</Price>
                      <p style={{ fontSize: 11 }}>
                        Creator: <UserLink username={a.creatorUsername} displayName={a.creatorDisplayName} fallback={shortAddress(a.creator)} />
                      </p>
                      <p style={{ fontSize: 10 }}>Reserve: {formatWtf(a.reserve)} WTF | Increment: {formatWtf(a.priceIncrement)} WTF</p>
                      <p style={{ fontSize: 10 }}>Start: {new Date(a.startTime).toLocaleString()}</p>
                      <p style={{ fontSize: 10 }}>End: {new Date(a.endTime).toLocaleString()}</p>
                      <p style={{ fontSize: 10, fontFamily: "monospace" }}>{a.tokenContract}</p>
                    </ListingBody>
                    <ListingActions>
                      {canBid && !isCreator && (
                        <>
                          <TextInput
                            value={auctionBidInputs[bidKey] || ""}
                            onChange={(e: any) =>
                              setAuctionBidInputs((prev) => ({
                                ...prev,
                                [bidKey]: e.target?.value ?? "",
                              }))
                            }
                            placeholder="Bid WTF"
                            style={{ width: 70 }}
                          />
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                if (!address) throw new Error("Connect wallet before bidding");
                                const raw = parseWtfInputToRaw(auctionBidInputs[bidKey] || "");
                                if (!raw) throw new Error("Bid amount is required");
                                await approveMarketplaceForWtf(address);
                                await bidMarketplaceAuction(a.id, raw);
                                setAuctionBidInputs((prev) => ({ ...prev, [bidKey]: "" }));
                                invalidateMarket();
                              } catch (err: any) {
                                setErrorMsg(err?.message || "Bid failed");
                              }
                            }}
                          >
                            Place Bid
                          </Button>
                        </>
                      )}
                      {(isCreator || isAdmin) && !a.hasBid && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await cancelMarketplaceAuction(a.id);
                              invalidateMarket();
                            } catch (err: any) {
                              setErrorMsg(err?.message || "Cancel auction failed");
                            }
                          }}
                        >
                          Cancel Auction
                        </Button>
                      )}
                      {ended && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await settleMarketplaceAuction(a.id);
                              invalidateMarket();
                            } catch (err: any) {
                              setErrorMsg(err?.message || "Settle failed");
                            }
                          }}
                        >
                          Settle Auction
                        </Button>
                      )}
                    </ListingActions>
                  </ListingCard>
                );
              })}
              {onchain.auctions.length === 0 && <p>No active auctions.</p>}
            </Grid>
          </>
        )}

        {activeTab === 2 && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Button
                active={tradeBoardMode === "offers"}
                onClick={() => setTradeBoardMode("offers")}
              >
                Offer Board
              </Button>
              <Button
                active={tradeBoardMode === "barter"}
                onClick={() => setTradeBoardMode("barter")}
              >
                Barter Board
              </Button>
              {tradeBoardMode === "offers" && (
                <TextInput
                  value={boardSearch}
                  onChange={(e: any) => setBoardSearch(e.target?.value ?? "")}
                  placeholder="Search token, wallet, or user"
                  fullWidth
                />
              )}
            </div>

            {tradeBoardMode === "barter" ? (
              <BarterBoard address={address} />
            ) : loadingBoard ? (
              <Hourglass size={32} />
            ) : (
              <Grid>
                {(tradeBoard?.items || []).map((item) => {
                  const key = `${item.tokenContract}:${item.tokenId}`;
                  const isOwner = address && item.ownerWallet === address;
                  const activeOffer = item.activeOffer;

                  return (
                    <ListingCard key={`board:${item.ownerWallet}:${key}`}>
                      <ListingTitleBar>
                        <span>📋</span>
                        {item.tokenName || `Token #${item.tokenId}`}
                      </ListingTitleBar>
                      <TokenImage>
                        {item.tokenThumbnail ? <img src={item.tokenThumbnail} alt={item.tokenName || "Token"} /> : <span style={{ color: "#808080" }}>No Preview</span>}
                      </TokenImage>
                      <ListingBody>
                        <p style={{ fontSize: 11 }}>
                          Owner: <UserLink username={item.ownerUsername} displayName={item.ownerDisplayName} fallback={shortAddress(item.ownerWallet)} />
                        </p>
                        <p style={{ fontSize: 10 }}>Amount: {item.tokenAmount}</p>
                        <p style={{ fontSize: 10, fontFamily: "monospace" }}>{item.tokenContract}</p>
                        {activeOffer ? (
                          <p style={{ fontSize: 10, marginTop: 4 }}>
                            Offer: {formatWtf(activeOffer.amountWtf)} WTF by {shortAddress(activeOffer.offerer)}
                          </p>
                        ) : (
                          <p style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>No active offer yet.</p>
                        )}
                      </ListingBody>
                      <ListingActions>
                        {!isOwner && (
                          <>
                            <TextInput
                              value={offerInputs[key] || ""}
                              onChange={(e: any) =>
                                setOfferInputs((prev) => ({
                                  ...prev,
                                  [key]: e.target?.value ?? "",
                                }))
                              }
                              placeholder="Offer WTF"
                              style={{ width: 70 }}
                            />
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await placeOfferForToken(item.tokenContract, item.tokenId, item.tokenAmount, item.ownerWallet);
                                } catch (err: any) {
                                  setErrorMsg(err?.message || "Offer failed");
                                }
                              }}
                            >
                              Offer
                            </Button>
                            {activeOffer && activeOffer.offerer === address && (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await cancelMarketplaceOffer(item.tokenContract, item.tokenId);
                                    invalidateMarket();
                                  } catch (err: any) {
                                    setErrorMsg(err?.message || "Cancel offer failed");
                                  }
                                }}
                              >
                                Cancel Mine
                              </Button>
                            )}
                          </>
                        )}
                        {isOwner && activeOffer && (
                          <>
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await acceptOfferForToken(item.tokenContract, item.tokenId, false);
                                } catch (err: any) {
                                  setErrorMsg(err?.message || "Accept offer failed");
                                }
                              }}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await cancelMarketplaceOffer(item.tokenContract, item.tokenId);
                                  invalidateMarket();
                                } catch (err: any) {
                                  setErrorMsg(err?.message || "Reject failed");
                                }
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </ListingActions>
                    </ListingCard>
                  );
                })}

                {(tradeBoard?.items?.length || 0) === 0 && <p>No trade board tokens found.</p>}
              </Grid>
            )}
          </>
        )}

        {onchain && activeTab === 3 && (
          <Grid>
            <GroupBox label="My Listings">
              {myListings.length === 0 ? (
                <p style={{ fontSize: 11 }}>No active listings.</p>
              ) : (
                myListings.map((l) => (
                  <div key={`my-listing-${l.id}`} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11 }}>
                      {l.tokenName || `#${l.tokenId}`} - {formatWtf(l.priceWtf)} WTF
                    </div>
                    <Button
                      size="sm"
                      fullWidth
                      onClick={async () => {
                        try {
                          await cancelMarketplaceListing(l.id);
                          invalidateMarket();
                        } catch (err: any) {
                          setErrorMsg(err?.message || "Cancel failed");
                        }
                      }}
                    >
                      Cancel Listing #{l.id}
                    </Button>
                  </div>
                ))
              )}
            </GroupBox>

            <GroupBox label="My Auctions">
              {myAuctions.length === 0 ? (
                <p style={{ fontSize: 11 }}>No active auctions.</p>
              ) : (
                myAuctions.map((a) => (
                  <div key={`my-auction-${a.id}`} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11 }}>
                      {a.tokenName || `#${a.tokenId}`} - current {formatWtf(a.currentPrice || a.reserve)} WTF
                    </div>
                    <Button
                      size="sm"
                      fullWidth
                      onClick={async () => {
                        try {
                          await settleMarketplaceAuction(a.id);
                          invalidateMarket();
                        } catch (err: any) {
                          setErrorMsg(err?.message || "Settle failed");
                        }
                      }}
                    >
                      Try Settle Auction #{a.id}
                    </Button>
                  </div>
                ))
              )}
            </GroupBox>

            <GroupBox label="My Offers">
              {myOffers.length === 0 ? (
                <p style={{ fontSize: 11 }}>No active offers placed.</p>
              ) : (
                myOffers.map((o) => (
                  <div key={`my-offer-${o.tokenContract}:${o.tokenId}`} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11 }}>
                      {o.tokenName || `#${o.tokenId}`} - {formatWtf(o.amountWtf)} WTF
                    </div>
                    <Button
                      size="sm"
                      fullWidth
                      onClick={async () => {
                        try {
                          await cancelMarketplaceOffer(o.tokenContract, o.tokenId);
                          invalidateMarket();
                        } catch (err: any) {
                          setErrorMsg(err?.message || "Cancel offer failed");
                        }
                      }}
                    >
                      Cancel Offer
                    </Button>
                  </div>
                ))
              )}
            </GroupBox>

            <GroupBox label="Offers To Me">
              {offersToMe.length === 0 ? (
                <p style={{ fontSize: 11 }}>No active offers received.</p>
              ) : (
                offersToMe.map((o) => (
                  <div key={`to-me-${o.tokenContract}:${o.tokenId}`} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11 }}>
                      {o.tokenName || `#${o.tokenId}`} - {formatWtf(o.amountWtf)} WTF from <UserLink username={o.offererUsername} displayName={o.offererDisplayName} fallback={shortAddress(o.offerer)} />
                    </div>
                    <Button
                      size="sm"
                      fullWidth
                      onClick={async () => {
                        try {
                          const listed = (onchain.listings || []).some(
                            (l) =>
                              l.tokenContract === o.tokenContract &&
                              l.tokenId === o.tokenId &&
                              l.seller === address
                          );
                          await acceptOfferForToken(o.tokenContract, o.tokenId, listed);
                        } catch (err: any) {
                          setErrorMsg(err?.message || "Accept failed");
                        }
                      }}
                    >
                      Accept Offer
                    </Button>
                    <Button
                      size="sm"
                      fullWidth
                      style={{ marginTop: 4 }}
                      onClick={async () => {
                        try {
                          await cancelMarketplaceOffer(o.tokenContract, o.tokenId);
                          invalidateMarket();
                        } catch (err: any) {
                          setErrorMsg(err?.message || "Reject failed");
                        }
                      }}
                    >
                      Reject Offer
                    </Button>
                  </div>
                ))
              )}
            </GroupBox>
          </Grid>
        )}

        {errorMsg && (
          <p style={{ color: "red", fontSize: 12, marginTop: 10 }}>
            {errorMsg}
          </p>
        )}
      </TabBody>
    </AppWindow>
  );
}
