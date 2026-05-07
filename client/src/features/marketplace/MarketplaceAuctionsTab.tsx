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
import type { OnChainAuction } from "./types";
import { shortAddress } from "./utils";
import {
  provenanceCreatorLabel,
  provenanceSupportLinks,
  provenanceXLabel,
  readEmbeddedProvenance,
} from "../../lib/provenance";

interface MarketplaceAuctionsTabProps {
  address?: string | null;
  admin?: string | null;
  auctionBidInputs: Record<string, string>;
  auctions: OnChainAuction[];
  onBidInputChange: (key: string, value: string) => void;
  onCancelAuction: (auctionId: number) => void | Promise<void>;
  onPlaceBid: (auction: OnChainAuction) => void | Promise<void>;
  onSelectToken: (token: OwnedToken) => void;
  onSettleAuction: (auctionId: number) => void | Promise<void>;
  nowMs: number;
}

export function MarketplaceAuctionsTab({
  address,
  admin,
  auctionBidInputs,
  auctions,
  onBidInputChange,
  onCancelAuction,
  onPlaceBid,
  onSelectToken,
  onSettleAuction,
  nowMs,
}: MarketplaceAuctionsTabProps) {
  return (
    <Grid>
      {auctions.map((auction) => {
        const startMs = Date.parse(auction.startTime);
        const endMs = Date.parse(auction.endTime);
        const started = Number.isFinite(startMs) ? nowMs >= startMs : true;
        const ended = Number.isFinite(endMs) ? nowMs >= endMs : false;
        const canBid = started && !ended;
        const isCreator = address && address === auction.creator;
        const isAdmin = address && address === admin;
        const bidKey = `${auction.id}`;
        const provenance = readEmbeddedProvenance(auction);
        const supportLink = provenanceSupportLinks(provenance)[0] || null;
        const xLabel = provenanceXLabel(provenance);

        return (
          <ListingCard
            key={`auction:${auction.id}`}
            onClick={() =>
              onSelectToken({
                id: 0,
                contract: auction.tokenContract,
                tokenId: auction.tokenId,
                balance: "1",
                name: auction.tokenName || undefined,
                thumbnail: auction.tokenThumbnail || undefined,
                metadata: auction.metadata || undefined,
                provenance: auction.provenance || null,
                walletAddress: auction.creator,
                onTradeBoard: false,
                tradeBoardQuantity: 0,
                updatedAt: "",
              })
            }
          >
            <ListingTitleBar>
              <span>🔨</span>
              {auction.tokenName || `Token #${auction.tokenId}`}
            </ListingTitleBar>
            <TokenImage>
              {auction.tokenThumbnail ? (
                <img src={auction.tokenThumbnail} alt={auction.tokenName || "Token"} />
              ) : (
                <span style={{ color: "#808080" }}>No Preview</span>
              )}
            </TokenImage>
            <ListingBody>
              <Price>{formatWtf(auction.currentPrice || auction.reserve)} WTF</Price>
              <p style={{ fontSize: 11 }}>
                Creator:{" "}
                <UserLink
                  username={auction.creatorUsername}
                  displayName={auction.creatorDisplayName}
                  fallback={shortAddress(auction.creator)}
                />
              </p>
              <p style={{ fontSize: 10 }}>
                Reserve: {formatWtf(auction.reserve)} WTF | Increment:{" "}
                {formatWtf(auction.priceIncrement)} WTF
              </p>
              <p style={{ fontSize: 10 }}>
                Start: {new Date(auction.startTime).toLocaleString()}
              </p>
              <p style={{ fontSize: 10 }}>
                End: {new Date(auction.endTime).toLocaleString()}
              </p>
              <p style={{ fontSize: 10, fontFamily: "monospace" }}>
                {auction.tokenContract}
              </p>
              {provenance && (
                <p style={{ fontSize: 10 }}>
                  Provenance: {provenanceCreatorLabel(provenance)}
                  {xLabel ? ` / ${xLabel}` : ""} ·{" "}
                  {supportLink ? (
                    <a
                      href={supportLink.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Support on Tezos
                    </a>
                  ) : (
                    "Support on Tezos"
                  )}
                </p>
              )}
            </ListingBody>
            <ListingActions onClick={(e: any) => e.stopPropagation()}>
              {canBid && !isCreator && (
                <>
                  <TextInput
                    value={auctionBidInputs[bidKey] || ""}
                    onChange={(e: any) =>
                      onBidInputChange(bidKey, e.target?.value ?? "")
                    }
                    placeholder="Bid WTF"
                    style={{ width: 70 }}
                  />
                  <Button size="sm" onClick={() => onPlaceBid(auction)}>
                    Place Bid
                  </Button>
                </>
              )}
              {(isCreator || isAdmin) && !auction.hasBid && (
                <Button size="sm" onClick={() => onCancelAuction(auction.id)}>
                  Cancel Auction
                </Button>
              )}
              {ended && (
                <Button size="sm" onClick={() => onSettleAuction(auction.id)}>
                  Settle Auction
                </Button>
              )}
            </ListingActions>
          </ListingCard>
        );
      })}
      {auctions.length === 0 && <p>No active auctions.</p>}
    </Grid>
  );
}
