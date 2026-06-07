import { Button, TextInput } from "react95";
import { formatWtf } from "@shared/types";
import type { OwnedToken } from "../../components/OwnedTokensGallery";
import { UserLink } from "../../components/UserLink";
import {
  Grid,
  ListingActions,
  ListingBody,
  ListingCard,
  ListingTitleBar,
  Price,
  TokenImage,
} from "./MarketplaceChrome";
import type { OnChainListing, OnChainOffer } from "./types";
import { shortAddress } from "./utils";
import {
  provenanceCreatorLabel,
  provenanceSupportLinks,
  provenanceXLabel,
  readEmbeddedProvenance,
} from "../../lib/provenance";

interface MarketplaceListingsTabProps {
  address?: string | null;
  listings: OnChainListing[];
  offerInputs: Record<string, string>;
  offersByToken: Map<string, OnChainOffer>;
  onAcceptOffer: (listing: OnChainListing, offer: OnChainOffer) => void | Promise<void>;
  onBuyListing: (listing: OnChainListing) => void | Promise<void>;
  onCancelListing: (listingId: number) => void | Promise<void>;
  onOfferInputChange: (key: string, value: string) => void;
  onPlaceOffer: (listing: OnChainListing) => void | Promise<void>;
  onSelectToken: (token: OwnedToken) => void;
}

export function MarketplaceListingsTab({
  address,
  listings,
  offerInputs,
  offersByToken,
  onAcceptOffer,
  onBuyListing,
  onCancelListing,
  onOfferInputChange,
  onPlaceOffer,
  onSelectToken,
}: MarketplaceListingsTabProps) {
  return (
    <Grid>
      {listings.map((listing) => {
        const offerKey = `${listing.tokenContract}:${listing.tokenId}`;
        const activeOffer = offersByToken.get(
          `${listing.seller}:${listing.tokenContract}:${listing.tokenId}`
        );
        const isMine = address && address === listing.seller;
        const provenance = readEmbeddedProvenance(listing);
        const supportLink = provenanceSupportLinks(provenance)[0] || null;
        const xLabel = provenanceXLabel(provenance);

        return (
          <ListingCard
            key={`${listing.tokenContract}:${listing.tokenId}:${listing.id}`}
            onClick={() =>
              onSelectToken({
                id: 0,
                contract: listing.tokenContract,
                tokenId: listing.tokenId,
                balance: listing.tokenAmount,
                name: listing.tokenName || undefined,
                thumbnail: listing.tokenThumbnail || undefined,
                metadata: listing.metadata || undefined,
                provenance: listing.provenance || null,
                walletAddress: listing.seller,
                onTradeBoard: false,
                tradeBoardQuantity: 0,
                updatedAt: "",
              })
            }
          >
            <ListingTitleBar>
              <span>💰</span>
              {listing.tokenName || `Token #${listing.tokenId}`}
            </ListingTitleBar>
            <TokenImage>
              {listing.tokenThumbnail ? (
                <img src={listing.tokenThumbnail} alt={listing.tokenName || "Token"} />
              ) : (
                <span style={{ color: "#808080" }}>No Preview</span>
              )}
            </TokenImage>
            <ListingBody>
              <Price>{formatWtf(listing.priceWtf)} WTF</Price>
              <p style={{ fontSize: 11 }}>
                Seller:{" "}
                <UserLink
                  username={listing.sellerUsername}
                  displayName={listing.sellerDisplayName}
                  fallback={shortAddress(listing.seller)}
                />
              </p>
              <p style={{ fontSize: 10, fontFamily: "monospace" }}>
                {listing.tokenContract}
              </p>
              {provenance && (
                <p style={{ fontSize: 10 }}>
                  Provenance: {provenanceCreatorLabel(provenance)}
                  {xLabel ? ` / ${xLabel}` : ""} ·{" "}
                  {supportLink ? (
                    <a
                      href={supportLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Support on Tezos
                    </a>
                  ) : (
                    "Support on Tezos"
                  )}
                </p>
              )}
              <p style={{ fontSize: 10 }}>
                Amount: {listing.tokenAmount} | On-chain ID: {listing.id}
              </p>
              {activeOffer && (
                <p style={{ fontSize: 10, marginTop: 4 }}>
                  Top offer: {formatWtf(activeOffer.amountWtf)} WTF by{" "}
                  <UserLink
                    username={activeOffer.offererUsername}
                    displayName={activeOffer.offererDisplayName}
                    fallback={shortAddress(activeOffer.offerer)}
                  />
                </p>
              )}
            </ListingBody>
            <ListingActions onClick={(e: any) => e.stopPropagation()}>
              {!isMine && (
                <>
                  <Button size="sm" onClick={() => onBuyListing(listing)}>
                    Buy Now
                  </Button>
                  <TextInput
                    value={offerInputs[offerKey] || ""}
                    onChange={(e: any) =>
                      onOfferInputChange(offerKey, e.target?.value ?? "")
                    }
                    placeholder="Offer WTF"
                    style={{ width: 70 }}
                  />
                  <Button size="sm" onClick={() => onPlaceOffer(listing)}>
                    Offer
                  </Button>
                </>
              )}
              {isMine && (
                <>
                  <Button size="sm" onClick={() => onCancelListing(listing.id)}>
                    Cancel Listing
                  </Button>
                  {activeOffer && (
                    <Button size="sm" onClick={() => onAcceptOffer(listing, activeOffer)}>
                      Accept Offer
                    </Button>
                  )}
                </>
              )}
            </ListingActions>
          </ListingCard>
        );
      })}

      {listings.length === 0 && <p>No active listings.</p>}
    </Grid>
  );
}
