import { Button, GroupBox } from "react95";
import { formatWtf } from "@shared/types";
import { UserLink } from "../../components/UserLink";
import { Grid } from "./MarketplaceChrome";
import type {
  ExternalMarketplaceListing,
  OnChainAuction,
  OnChainListing,
  OnChainOffer,
} from "./types";
import { shortAddress } from "./utils";

function formatXtzFromMutez(mutez: string | null | undefined): string {
  if (!mutez) return "-";
  const n = Number(mutez) / 1e6;
  if (!Number.isFinite(n)) return "-";
  if (n >= 10_000) return Math.round(n).toLocaleString();
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

interface MarketplaceActivityTabProps {
  externalListings: ExternalMarketplaceListing[];
  myAuctions: OnChainAuction[];
  myListings: OnChainListing[];
  myOffers: OnChainOffer[];
  offersToMe: OnChainOffer[];
  onAcceptOffer: (offer: OnChainOffer) => void | Promise<void>;
  onCancelExternalListing: (listing: ExternalMarketplaceListing) => void | Promise<void>;
  onCancelListing: (listingId: number) => void | Promise<void>;
  onCancelOffer: (tokenContract: string, tokenId: string) => void | Promise<void>;
  onRejectOffer: (tokenContract: string, tokenId: string) => void | Promise<void>;
  onSettleAuction: (auctionId: number) => void | Promise<void>;
}

export function MarketplaceActivityTab({
  externalListings,
  myAuctions,
  myListings,
  myOffers,
  offersToMe,
  onAcceptOffer,
  onCancelExternalListing,
  onCancelListing,
  onCancelOffer,
  onRejectOffer,
  onSettleAuction,
}: MarketplaceActivityTabProps) {
  return (
    <Grid>
      <GroupBox label="My Listings">
        {myListings.length === 0 ? (
          <p style={{ fontSize: 11 }}>No active listings.</p>
        ) : (
          myListings.map((listing) => (
            <div key={`my-listing-${listing.id}`} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11 }}>
                {listing.tokenName || `#${listing.tokenId}`} - {formatWtf(listing.priceWtf)} WTF
              </div>
              <Button
                size="sm"
                fullWidth
                onClick={() => onCancelListing(listing.id)}
              >
                Cancel Listing #{listing.id}
              </Button>
            </div>
          ))
        )}
      </GroupBox>

      <GroupBox label="External Listings">
        {externalListings.length === 0 ? (
          <p style={{ fontSize: 11 }}>No indexed objkt/Teia listings.</p>
        ) : (
          externalListings.map((listing) => (
            <div key={`external-${listing.marketplaceContract}-${listing.listingId}`} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11 }}>
                {listing.tokenName || `#${listing.tokenId}`} -{" "}
                {formatXtzFromMutez(listing.priceMutez)} XTZ on{" "}
                {listing.marketplaceName}
              </div>
              <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 4 }}>
                listing #{listing.listingId} · {shortAddress(listing.sellerAddress)}
              </div>
              <Button
                size="sm"
                fullWidth
                disabled={!listing.cancellable}
                onClick={() => onCancelExternalListing(listing)}
              >
                {listing.cancellable ? "Cancel External Listing" : "Cancel Not Supported"}
              </Button>
            </div>
          ))
        )}
      </GroupBox>

      <GroupBox label="My Auctions">
        {myAuctions.length === 0 ? (
          <p style={{ fontSize: 11 }}>No active auctions.</p>
        ) : (
          myAuctions.map((auction) => (
            <div key={`my-auction-${auction.id}`} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11 }}>
                {auction.tokenName || `#${auction.tokenId}`} - current{" "}
                {formatWtf(auction.currentPrice || auction.reserve)} WTF
              </div>
              <Button
                size="sm"
                fullWidth
                onClick={() => onSettleAuction(auction.id)}
              >
                Try Settle Auction #{auction.id}
              </Button>
            </div>
          ))
        )}
      </GroupBox>

      <GroupBox label="My Offers">
        {myOffers.length === 0 ? (
          <p style={{ fontSize: 11 }}>No active offers placed.</p>
        ) : (
          myOffers.map((offer) => (
            <div
              key={`my-offer-${offer.tokenContract}:${offer.tokenId}`}
              style={{ marginBottom: 8 }}
            >
              <div style={{ fontSize: 11 }}>
                {offer.tokenName || `#${offer.tokenId}`} - {formatWtf(offer.amountWtf)} WTF
              </div>
              <Button
                size="sm"
                fullWidth
                onClick={() => onCancelOffer(offer.tokenContract, offer.tokenId)}
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
          offersToMe.map((offer) => (
            <div
              key={`to-me-${offer.tokenContract}:${offer.tokenId}`}
              style={{ marginBottom: 8 }}
            >
              <div style={{ fontSize: 11 }}>
                {offer.tokenName || `#${offer.tokenId}`} - {formatWtf(offer.amountWtf)} WTF from{" "}
                <UserLink
                  username={offer.offererUsername}
                  displayName={offer.offererDisplayName}
                  fallback={shortAddress(offer.offerer)}
                />
              </div>
              <Button size="sm" fullWidth onClick={() => onAcceptOffer(offer)}>
                Accept Offer
              </Button>
              <Button
                size="sm"
                fullWidth
                style={{ marginTop: 4 }}
                onClick={() => onRejectOffer(offer.tokenContract, offer.tokenId)}
              >
                Reject Offer
              </Button>
            </div>
          ))
        )}
      </GroupBox>
    </Grid>
  );
}
