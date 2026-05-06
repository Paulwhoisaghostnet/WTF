import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { WTF_TOKEN } from "@shared/types";
import { api } from "../../lib/api";
import {
  acceptMarketplaceOffer,
  approveMarketplaceForToken,
  approveMarketplaceForWtf,
  bidMarketplaceAuction,
  buyMarketplaceListing,
  cancelMarketplaceAuction,
  cancelMarketplaceListing,
  cancelMarketplaceOffer,
  createMarketplaceAuction,
  createMarketplaceListingWithId,
  placeMarketplaceOffer,
  settleMarketplaceAuction,
} from "../../lib/tezos";
import type {
  CreateFormState,
  OnChainAuction,
  OnChainListing,
  OnChainOffer,
  PendingOfferAccept,
  SelectedToken,
  TradeBoardItem,
} from "./types";
import { inferRoyalty, parseWtfInputToRaw } from "./utils";

interface UseMarketplaceActionsArgs {
  address?: string | null;
  auctionBidInputs: Record<string, string>;
  createForm: CreateFormState;
  invalidateMarket: () => void;
  offerInputs: Record<string, string>;
  onchainListings?: OnChainListing[];
  selectedToken: SelectedToken | null;
  setAuctionBidInputs: Dispatch<SetStateAction<Record<string, string>>>;
  setCreateForm: Dispatch<SetStateAction<CreateFormState>>;
  setErrorMsg: Dispatch<SetStateAction<string>>;
  setOfferInputs: Dispatch<SetStateAction<Record<string, string>>>;
  setPendingOfferAccept: Dispatch<SetStateAction<PendingOfferAccept>>;
  setSelectedToken: Dispatch<SetStateAction<SelectedToken | null>>;
  setShowCreate: Dispatch<SetStateAction<boolean>>;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  amount: "1",
  listingType: "buy_now",
  priceWtf: "",
  auctionReserveWtf: "",
  startTime: "",
  endTime: "",
  extensionTimeSec: "300",
  priceIncrementWtf: "",
  sharesCsv: "",
};

function parseSharesCsv(input: string): { amount: number; recipient: string }[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [amountRaw, recipientRaw] = entry.split(":").map((part) => part.trim());
      const amount = Number(amountRaw);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Shares must use integer bps amounts (example: 500:tz1...)");
      }
      if (!recipientRaw?.startsWith("tz")) {
        throw new Error("Shares recipient must be a valid tz address");
      }
      return { amount, recipient: recipientRaw };
    });
}

export function useMarketplaceActions({
  address,
  auctionBidInputs,
  createForm,
  invalidateMarket,
  offerInputs,
  onchainListings,
  selectedToken,
  setAuctionBidInputs,
  setCreateForm,
  setErrorMsg,
  setOfferInputs,
  setPendingOfferAccept,
  setSelectedToken,
  setShowCreate,
}: UseMarketplaceActionsArgs) {
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/marketplace", data),
    onSuccess: () => {
      setShowCreate(false);
      setSelectedToken(null);
      setErrorMsg("");
      setCreateForm(EMPTY_CREATE_FORM);
      invalidateMarket();
    },
    onError: (err: any) => {
      setErrorMsg(err?.message || "Failed to persist marketplace entry");
    },
  });

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
    targetOwner: string
  ) => {
    if (!address) throw new Error("Connect wallet before placing offers");
    const key = `${tokenContract}:${tokenId}`;
    const amountWtf = parseWtfInputToRaw(offerInputs[key] || "");
    if (!amountWtf) {
      throw new Error(`Offer amount must be positive (up to ${WTF_TOKEN.decimals} decimals)`);
    }

    await approveMarketplaceForWtf(address);
    await placeMarketplaceOffer({
      tokenContract,
      tokenId,
      tokenAmount: 1,
      amountWtf,
      targetOwner,
    });
    setOfferInputs((prev) => ({ ...prev, [key]: "" }));
    invalidateMarket();
  };

  const runAcceptOfferForToken = async (
    tokenContract: string,
    tokenId: string,
    listed: boolean,
    quantity = 1
  ) => {
    if (!address) throw new Error("Connect wallet before accepting offers");
    if (Number.isInteger(quantity) && quantity <= 0) {
      throw new Error("Offer quantity must be a positive integer");
    }
    if (!listed) {
      await approveMarketplaceForToken(address, tokenContract, tokenId);
    }
    await acceptMarketplaceOffer(tokenContract, tokenId);
    invalidateMarket();
  };

  const acceptOfferForToken = async (
    tokenContract: string,
    tokenId: string,
    listed: boolean,
    offerTokenAmount?: string
  ) => {
    const qty = Number(offerTokenAmount || "1");
    if (Number.isInteger(qty) && qty > 1) {
      setPendingOfferAccept({
        tokenContract,
        tokenId,
        listed,
        quantity: qty,
      });
      return;
    }
    await runAcceptOfferForToken(tokenContract, tokenId, listed, Math.max(1, qty || 1));
  };

  const handleCancelListing = async (listingId: number) => {
    try {
      await cancelMarketplaceListing(listingId);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Cancel failed");
    }
  };

  const handleBuyListing = async (listing: OnChainListing) => {
    try {
      if (!address) throw new Error("Connect wallet before buying");
      await approveMarketplaceForWtf(address);
      await buyMarketplaceListing(listing.id);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Buy failed");
    }
  };

  const handleListingOfferInputChange = (key: string, value: string) => {
    setOfferInputs((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handlePlaceListingOffer = async (listing: OnChainListing) => {
    try {
      await placeOfferForToken(listing.tokenContract, listing.tokenId, listing.seller);
    } catch (err: any) {
      setErrorMsg(err?.message || "Offer failed");
    }
  };

  const handleAcceptListingOffer = async (
    listing: OnChainListing,
    offer: OnChainOffer
  ) => {
    try {
      await acceptOfferForToken(
        listing.tokenContract,
        listing.tokenId,
        true,
        offer.tokenAmount
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Accept offer failed");
    }
  };

  const handleSettleAuction = async (auctionId: number) => {
    try {
      await settleMarketplaceAuction(auctionId);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Settle failed");
    }
  };

  const handleAuctionBidInputChange = (key: string, value: string) => {
    setAuctionBidInputs((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handlePlaceAuctionBid = async (auction: OnChainAuction) => {
    try {
      if (!address) throw new Error("Connect wallet before bidding");
      const bidKey = `${auction.id}`;
      const raw = parseWtfInputToRaw(auctionBidInputs[bidKey] || "");
      if (!raw) throw new Error("Bid amount is required");
      await approveMarketplaceForWtf(address);
      await bidMarketplaceAuction(auction.id, raw);
      setAuctionBidInputs((prev) => ({ ...prev, [bidKey]: "" }));
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Bid failed");
    }
  };

  const handleCancelAuction = async (auctionId: number) => {
    try {
      await cancelMarketplaceAuction(auctionId);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Cancel auction failed");
    }
  };

  const handleCancelOffer = async (tokenContract: string, tokenId: string) => {
    try {
      await cancelMarketplaceOffer(tokenContract, tokenId);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Cancel offer failed");
    }
  };

  const handleRejectOffer = async (tokenContract: string, tokenId: string) => {
    try {
      await cancelMarketplaceOffer(tokenContract, tokenId);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Reject failed");
    }
  };

  const handleAcceptActivityOffer = async (offer: OnChainOffer) => {
    try {
      const listed = (onchainListings || []).some(
        (listing) =>
          listing.tokenContract === offer.tokenContract &&
          listing.tokenId === offer.tokenId &&
          listing.seller === address
      );
      await acceptOfferForToken(offer.tokenContract, offer.tokenId, listed);
    } catch (err: any) {
      setErrorMsg(err?.message || "Accept failed");
    }
  };

  const handlePlaceTradeBoardOffer = async (item: TradeBoardItem) => {
    try {
      await placeOfferForToken(item.tokenContract, item.tokenId, item.ownerWallet);
    } catch (err: any) {
      setErrorMsg(err?.message || "Offer failed");
    }
  };

  const handleCancelTradeBoardOffer = async (item: TradeBoardItem) => {
    try {
      await cancelMarketplaceOffer(item.tokenContract, item.tokenId);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Cancel offer failed");
    }
  };

  const handleAcceptTradeBoardOffer = async (item: TradeBoardItem) => {
    try {
      await acceptOfferForToken(
        item.tokenContract,
        item.tokenId,
        false,
        item.activeOffer?.tokenAmount
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Accept offer failed");
    }
  };

  const handleRejectTradeBoardOffer = async (item: TradeBoardItem) => {
    try {
      await cancelMarketplaceOffer(item.tokenContract, item.tokenId);
      invalidateMarket();
    } catch (err: any) {
      setErrorMsg(err?.message || "Reject failed");
    }
  };

  return {
    createMutation,
    handleAcceptActivityOffer,
    handleAcceptListingOffer,
    handleAcceptTradeBoardOffer,
    handleAuctionBidInputChange,
    handleBuyListing,
    handleCancelAuction,
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
  };
}
