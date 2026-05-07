import { Button, Hourglass, TextInput } from "react95";
import { formatWtf } from "@shared/types";
import type { OwnedToken } from "../../components/OwnedTokensGallery";
import { BarterBoard } from "../../components/BarterBoard";
import { UserLink } from "../../components/UserLink";
import {
  Grid,
  ListingActions,
  ListingBody,
  ListingCard,
  ListingTitleBar,
  TokenImage,
} from "./MarketplaceChrome";
import type { TradeBoardItem } from "./types";
import { shortAddress } from "./utils";
import {
  provenanceCreatorLabel,
  provenanceSupportLinks,
  provenanceXLabel,
  readEmbeddedProvenance,
} from "../../lib/provenance";

type TradeBoardMode = "offers" | "barter";

interface MarketplaceTradeBoardsTabProps {
  address?: string | null;
  boardSearch: string;
  items: TradeBoardItem[];
  loadingBoard: boolean;
  mode: TradeBoardMode;
  offerInputs: Record<string, string>;
  onAcceptOffer: (item: TradeBoardItem) => void | Promise<void>;
  onCancelOffer: (item: TradeBoardItem) => void | Promise<void>;
  onModeChange: (mode: TradeBoardMode) => void;
  onOfferInputChange: (key: string, value: string) => void;
  onPlaceOffer: (item: TradeBoardItem) => void | Promise<void>;
  onRejectOffer: (item: TradeBoardItem) => void | Promise<void>;
  onSearchChange: (search: string) => void;
  onSelectToken: (token: OwnedToken) => void;
}

export function MarketplaceTradeBoardsTab({
  address,
  boardSearch,
  items,
  loadingBoard,
  mode,
  offerInputs,
  onAcceptOffer,
  onCancelOffer,
  onModeChange,
  onOfferInputChange,
  onPlaceOffer,
  onRejectOffer,
  onSearchChange,
  onSelectToken,
}: MarketplaceTradeBoardsTabProps) {
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button active={mode === "offers"} onClick={() => onModeChange("offers")}>
          Offer Board
        </Button>
        <Button active={mode === "barter"} onClick={() => onModeChange("barter")}>
          Barter Board
        </Button>
        {mode === "offers" && (
          <TextInput
            value={boardSearch}
            onChange={(e: any) => onSearchChange(e.target?.value ?? "")}
            placeholder="Search token, wallet, or user"
            fullWidth
          />
        )}
      </div>

      {mode === "barter" ? (
        <BarterBoard address={address} />
      ) : loadingBoard ? (
        <Hourglass size={32} />
      ) : (
        <Grid>
          {items.map((item) => {
            const key = `${item.tokenContract}:${item.tokenId}`;
            const isOwner = address && item.ownerWallet === address;
            const activeOffer = item.activeOffer;
            const boardQty = Number(item.tokenAmount || "0");
            const activeOfferQty = activeOffer
              ? Number(activeOffer.tokenAmount || "0")
              : 0;
            const canAcceptActiveOffer =
              !!activeOffer &&
              Number.isInteger(boardQty) &&
              Number.isInteger(activeOfferQty) &&
              boardQty > 0 &&
              activeOfferQty > 0 &&
              activeOfferQty <= boardQty;
            const provenance = readEmbeddedProvenance(item);
            const supportLink = provenanceSupportLinks(provenance)[0] || null;
            const xLabel = provenanceXLabel(provenance);

            return (
              <ListingCard
                key={`board:${item.ownerWallet}:${key}`}
                onClick={() =>
                  onSelectToken({
                    id: 0,
                    contract: item.tokenContract,
                    tokenId: item.tokenId,
                    balance: item.walletBalance,
                    name: item.tokenName || undefined,
                    thumbnail: item.tokenThumbnail || undefined,
                    metadata: item.metadata || undefined,
                    provenance: item.provenance || null,
                    walletAddress: item.ownerWallet,
                    creatorName: item.creatorName || undefined,
                    creatorAddress: item.creatorAddress || undefined,
                    collectionName: item.collectionName || undefined,
                    onTradeBoard: true,
                    tradeBoardQuantity: item.tradeBoardQuantity,
                    updatedAt: "",
                  })
                }
              >
                <ListingTitleBar>
                  <span>📋</span>
                  {item.tokenName || `Token #${item.tokenId}`}
                </ListingTitleBar>
                <TokenImage>
                  {item.tokenThumbnail ? (
                    <img src={item.tokenThumbnail} alt={item.tokenName || "Token"} />
                  ) : (
                    <span style={{ color: "#808080" }}>No Preview</span>
                  )}
                </TokenImage>
                <ListingBody>
                  <p style={{ fontSize: 11 }}>
                    Owner:{" "}
                    <UserLink
                      username={item.ownerUsername}
                      displayName={item.ownerDisplayName}
                      fallback={shortAddress(item.ownerWallet)}
                    />
                  </p>
                  <p style={{ fontSize: 10 }}>
                    Trade board qty: {item.tokenAmount} / Wallet balance: {item.walletBalance}
                  </p>
                  <p style={{ fontSize: 10, fontFamily: "monospace" }}>
                    {item.tokenContract}
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
                  {activeOffer ? (
                    <p style={{ fontSize: 10, marginTop: 4 }}>
                      Offer: {formatWtf(activeOffer.amountWtf)} WTF for{" "}
                      {activeOffer.tokenAmount} by {shortAddress(activeOffer.offerer)}
                    </p>
                  ) : (
                    <p style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>
                      No active offer yet.
                    </p>
                  )}
                  {isOwner && activeOffer && !canAcceptActiveOffer && (
                    <p style={{ fontSize: 10, marginTop: 4, color: "#800000" }}>
                      Offer qty exceeds current trade board qty. Cancel and request a new offer.
                    </p>
                  )}
                </ListingBody>
                <ListingActions onClick={(e: any) => e.stopPropagation()}>
                  {!isOwner && (
                    <>
                      <TextInput
                        value={offerInputs[key] || ""}
                        onChange={(e: any) =>
                          onOfferInputChange(key, e.target?.value ?? "")
                        }
                        placeholder="Offer WTF"
                        style={{ width: 70 }}
                      />
                      <Button size="sm" onClick={() => onPlaceOffer(item)}>
                        Offer
                      </Button>
                      {activeOffer && activeOffer.offerer === address && (
                        <Button size="sm" onClick={() => onCancelOffer(item)}>
                          Cancel Mine
                        </Button>
                      )}
                    </>
                  )}
                  {isOwner && activeOffer && (
                    <>
                      {canAcceptActiveOffer && (
                        <Button size="sm" onClick={() => onAcceptOffer(item)}>
                          Accept
                        </Button>
                      )}
                      <Button size="sm" onClick={() => onRejectOffer(item)}>
                        Reject
                      </Button>
                    </>
                  )}
                </ListingActions>
              </ListingCard>
            );
          })}

          {items.length === 0 && <p>No trade board tokens found.</p>}
        </Grid>
      )}
    </>
  );
}
