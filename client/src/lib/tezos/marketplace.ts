import { getTezos } from "./wallet";
import { WTF_TOKEN } from "@shared/types";
import { trackContractActivity } from "./activity-ledger";
import { toNatString, type NatInput } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";

const MARKETPLACE_CONTRACT = (
  import.meta.env.VITE_MARKETPLACE_CONTRACT_ADDRESS || ""
).trim();

function requireMarketplaceContract(): string {
  if (!MARKETPLACE_CONTRACT) {
    throw new Error(
      "VITE_MARKETPLACE_CONTRACT_ADDRESS is not configured. Set it before using marketplace actions."
    );
  }
  return MARKETPLACE_CONTRACT;
}

if (!MARKETPLACE_CONTRACT) {
  console.warn(
    "[WTF] Missing VITE_MARKETPLACE_CONTRACT_ADDRESS; marketplace actions are disabled until configured"
  );
}

interface Fa2OperatorUpdate {
  add_operator: {
    owner: string;
    operator: string;
    token_id: string;
  };
}

type MarketplaceContractVersion = "legacy" | "v2";

interface TokenRef {
  tokenContract: string;
  tokenId: string | number;
}

function toNat(value: NatInput): string {
  return toNatString(value);
}

function toOptionalNatFromStorage(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "object" && value !== null && "toString" in value
      ? (value as { toString: () => string }).toString()
      : String(value);
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

async function getNextCounter(
  contract: any,
  key: "next_listing_id" | "next_auction_id" | "next_offer_id"
): Promise<number | null> {
  try {
    const storage = await contract.storage();
    return toOptionalNatFromStorage(storage?.[key]);
  } catch {
    return null;
  }
}

function optionNone() {
  return { None: null };
}

function optionSome<T>(value: T) {
  return { Some: value };
}

function assertLegacySingleQuantity(quantity: string | number | undefined | null) {
  const value = quantity == null ? "1" : toNat(quantity);
  if (value !== "1") {
    throw new Error("Legacy marketplace accepts are blocked unless token quantity is exactly 1");
  }
}

async function fetchOnChainState(): Promise<any> {
  const response = await fetch("/api/marketplace/onchain?limit=500", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to verify marketplace terms before signing");
  }
  return response.json();
}

async function verifyOfferAcceptTerms(params: AcceptOfferParams): Promise<void> {
  const state = await fetchOnChainState();
  const offers = Array.isArray(state?.offers) ? state.offers : [];
  const expectedQuantity = toNat(params.expectedQuantity);
  const expectedUnitPriceWtf = toNat(params.expectedUnitPriceWtf);

  const offer =
    params.contractVersion === "v2"
      ? offers.find((row: any) => Number(row?.offerId) === Number(params.offerId))
      : offers.find(
          (row: any) =>
            String(row?.tokenContract) === params.expectedToken.tokenContract &&
            String(row?.tokenId) === toNat(params.expectedToken.tokenId) &&
            String(row?.targetOwner) === params.expectedTargetOwner &&
            String(row?.offerer) === params.offerer
        );

  if (!offer) {
    throw new Error("Offer is no longer active on-chain");
  }
  if (String(offer.tokenAmount ?? "") !== expectedQuantity) {
    throw new Error("Offer quantity changed before signing");
  }
  if (params.contractVersion === "legacy") {
    assertLegacySingleQuantity(offer.tokenAmount);
  }
  if (String(offer.unitPriceWtf ?? "") !== expectedUnitPriceWtf) {
    throw new Error("Offer unit price changed before signing");
  }
  if (String(offer.targetOwner ?? "") !== params.expectedTargetOwner) {
    throw new Error("Offer target owner changed before signing");
  }
  if (String(offer.tokenContract ?? "") !== params.expectedToken.tokenContract) {
    throw new Error("Offer token contract changed before signing");
  }
  if (String(offer.tokenId ?? "") !== toNat(params.expectedToken.tokenId)) {
    throw new Error("Offer token id changed before signing");
  }
}

async function setFa2Operator(
  fa2Contract: string,
  owner: string,
  operator: string,
  tokenId: NatInput
) {
  await assertNetworkReadyForSend(owner);
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(fa2Contract);
  const update: Fa2OperatorUpdate[] = [
    {
      add_operator: {
        owner,
        operator,
        token_id: toNatString(tokenId),
      },
    },
  ];
  const op = await contract.methodsObject.update_operators(update).send();
  await op.confirmation(1);
  return op.opHash;
}

export async function approveMarketplaceForToken(
  owner: string,
  tokenContract: string,
  tokenId: NatInput
) {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "approve_marketplace_for_token",
      contractAddress: tokenContract,
      entrypoint: "update_operators",
      walletAddress: owner,
      params: {
        owner,
        operator: contractAddress,
        tokenContract,
        tokenId,
      },
    },
    () => setFa2Operator(tokenContract, owner, contractAddress, tokenId)
  );
}

export async function approveMarketplaceForWtf(owner: string) {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "approve_marketplace_for_wtf",
      contractAddress: WTF_TOKEN.contract,
      entrypoint: "update_operators",
      walletAddress: owner,
      params: {
        owner,
        operator: contractAddress,
        tokenContract: WTF_TOKEN.contract,
        tokenId: WTF_TOKEN.tokenId,
      },
    },
    () =>
      setFa2Operator(
        WTF_TOKEN.contract,
        owner,
        contractAddress,
        WTF_TOKEN.tokenId
      )
  );
}

export interface CreateListingParams {
  walletAddress: string;
  tokenContract: string;
  tokenId: string | number;
  amount: number;
  priceWtf: number;
  royaltyRecipient?: string | null;
  royaltyBps?: number;
  contractVersion?: MarketplaceContractVersion;
  expiryIso?: string | null;
}

export interface CreateListingResult {
  opHash: string;
  listingId: number | null;
}

export async function createMarketplaceListing(
  params: CreateListingParams
): Promise<string> {
  const result = await createMarketplaceListingWithId(params);
  return result.opHash;
}

export async function createMarketplaceListingWithId(
  params: CreateListingParams
): Promise<CreateListingResult> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "create_listing",
      contractAddress,
      entrypoint: "create_listing",
      walletAddress: params.walletAddress,
      params,
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const listingId = await getNextCounter(contract, "next_listing_id");
      const contractVersion = params.contractVersion ?? "legacy";
      const entrypoint =
        contractVersion === "v2"
          ? "create_listing"
          : "create_listing";
      const callParams =
        contractVersion === "v2"
          ? {
              token_contract: params.tokenContract,
              token_id: toNat(params.tokenId),
              quantity: toNat(params.amount),
              unit_price_wtf: toNat(params.priceWtf),
              expiry: params.expiryIso ? optionSome(params.expiryIso) : optionNone(),
              royalty_bps: toNat(params.royaltyBps ?? 0),
              royalty_recipient: params.royaltyRecipient
                ? optionSome(params.royaltyRecipient)
                : optionNone(),
            }
          : {
          token_contract: params.tokenContract,
          token_id: toNat(params.tokenId),
          token_amount: toNat(params.amount),
          price_wtf: toNat(params.priceWtf),
          royalty_recipient: params.royaltyRecipient
                ? optionSome(params.royaltyRecipient)
                : optionNone(),
          royalty_bps: toNat(params.royaltyBps ?? 0),
            };
      const op = await contract.methodsObject[entrypoint](callParams).send();
      await op.confirmation(1);
      return { opHash: op.opHash, listingId };
    }
  );
}

export interface AuctionShare {
  amount: number;
  recipient: string;
}

export interface CreateAuctionParams {
  walletAddress: string;
  tokenContract: string;
  tokenId: string | number;
  amount?: number;
  reserveWtf: number;
  startTimeIso: string;
  endTimeIso: string;
  extensionTimeSeconds: number;
  priceIncrementWtf: number;
  shares: AuctionShare[];
  contractVersion?: MarketplaceContractVersion;
}

export interface CreateAuctionResult {
  opHash: string;
  auctionId: number | null;
}

export async function createMarketplaceAuction(
  params: CreateAuctionParams
): Promise<CreateAuctionResult> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "create_auction",
      contractAddress,
      entrypoint: "create_auction",
      walletAddress: params.walletAddress,
      params,
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const auctionId = await getNextCounter(contract, "next_auction_id");
      const contractVersion = params.contractVersion ?? "legacy";
      const callParams =
        contractVersion === "v2"
          ? {
              token_contract: params.tokenContract,
              token_id: toNat(params.tokenId),
              quantity: toNat(params.amount ?? 1),
              reserve_wtf: toNat(params.reserveWtf),
              min_increment_wtf: toNat(params.priceIncrementWtf),
              start_time: params.startTimeIso,
              end_time: params.endTimeIso,
            }
          : {
          token_contract: params.tokenContract,
          token_id: toNat(params.tokenId),
          reserve: toNat(params.reserveWtf),
          start_time: params.startTimeIso,
          end_time: params.endTimeIso,
          extension_time: toNat(params.extensionTimeSeconds),
          price_increment: toNat(params.priceIncrementWtf),
          shares: params.shares.map((share) => ({
            amount: toNat(share.amount),
            recipient: share.recipient,
          })),
            };
      const op = await contract.methodsObject.create_auction(callParams).send();
      await op.confirmation(1);
      return { opHash: op.opHash, auctionId };
    }
  );
}

export interface BuyListingParams {
  listingId: number;
  quantity: string | number;
  expectedToken: TokenRef;
  expectedOwner: string;
  expectedUnitPriceWtf: string | number;
  walletAddress: string;
  contractVersion?: MarketplaceContractVersion;
}

export async function buyMarketplaceListing(params: BuyListingParams): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "buy_listing",
      contractAddress,
      entrypoint: params.contractVersion === "v2" ? "buy_listing" : "buy",
      walletAddress: params.walletAddress,
      params,
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const contractVersion = params.contractVersion ?? "legacy";
      if (contractVersion === "legacy") {
        assertLegacySingleQuantity(params.quantity);
      }
      const op =
        contractVersion === "v2"
          ? await contract.methodsObject
              .buy_listing({
                listing_id: toNat(params.listingId),
                quantity: toNat(params.quantity),
                expected_token: {
                  token_contract: params.expectedToken.tokenContract,
                  token_id: toNat(params.expectedToken.tokenId),
                },
                expected_owner: params.expectedOwner,
                expected_unit_price_wtf: toNat(params.expectedUnitPriceWtf),
              })
              .send()
          : await contract.methodsObject.buy(toNat(params.listingId)).send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function cancelMarketplaceListing(
  listingId: number,
  walletAddress: string
): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "cancel_listing",
      contractAddress,
      entrypoint: "cancel_listing",
      walletAddress,
      params: { listingId },
    },
    async () => {
      await assertNetworkReadyForSend(walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .cancel_listing(toNat(listingId))
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function bidMarketplaceAuction(
  auctionId: number,
  amountWtf: number,
  walletAddress: string,
  contractVersion: MarketplaceContractVersion = "legacy"
): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "bid_auction",
      contractAddress,
      entrypoint: "bid",
      walletAddress,
      params: { auctionId, amountWtf, contractVersion },
    },
    async () => {
      await assertNetworkReadyForSend(walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .bid(
          contractVersion === "v2"
            ? {
                auction_id: toNat(auctionId),
                amount_wtf: toNat(amountWtf),
              }
            : {
                auction_id: toNat(auctionId),
                amount: toNat(amountWtf),
              }
        )
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function settleMarketplaceAuction(
  auctionId: number,
  walletAddress: string
): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "settle_auction",
      contractAddress,
      entrypoint: "settle_auction",
      walletAddress,
      params: { auctionId },
    },
    async () => {
      await assertNetworkReadyForSend(walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .settle_auction(toNat(auctionId))
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function cancelMarketplaceAuction(
  auctionId: number,
  walletAddress: string
): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "cancel_auction",
      contractAddress,
      entrypoint: "cancel_auction",
      walletAddress,
      params: { auctionId },
    },
    async () => {
      await assertNetworkReadyForSend(walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .cancel_auction(toNat(auctionId))
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export interface PlaceOfferParams {
  walletAddress: string;
  tokenContract: string;
  tokenId: string | number;
  tokenAmount?: number;
  quantity?: number;
  amountWtf: number;
  unitPriceWtf?: number;
  targetOwner: string;
  contractVersion?: MarketplaceContractVersion;
  expiryIso?: string | null;
}

export async function placeMarketplaceOffer(
  params: PlaceOfferParams
): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "place_offer",
      contractAddress,
      entrypoint: "place_offer",
      walletAddress: params.walletAddress,
      params,
    },
    async () => {
      if ((params.contractVersion ?? "legacy") === "legacy" && params.tokenAmount != null && params.tokenAmount !== 1) {
        throw new Error("Offers are single-edition only");
      }
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const contractVersion = params.contractVersion ?? "legacy";
      const quantity = params.quantity ?? params.tokenAmount ?? 1;
      const unitPriceWtf = params.unitPriceWtf ?? params.amountWtf;
      if (contractVersion === "legacy") {
        assertLegacySingleQuantity(quantity);
      }
      const callParams =
        contractVersion === "v2"
          ? {
              token_contract: params.tokenContract,
              token_id: toNat(params.tokenId),
              target_owner: params.targetOwner,
              quantity: toNat(quantity),
              unit_price_wtf: toNat(unitPriceWtf),
              expiry: params.expiryIso ? optionSome(params.expiryIso) : optionNone(),
            }
          : {
          token_contract: params.tokenContract,
          token_id: toNat(params.tokenId),
          token_amount: toNat(1),
          amount_wtf: toNat(params.amountWtf),
          target_owner: params.targetOwner,
            };
      const op = await contract.methodsObject.place_offer(callParams).send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export interface CancelOfferParams {
  offerId: number | null;
  tokenContract: string;
  tokenId: string | number;
  targetOwner: string;
  walletAddress: string;
  contractVersion?: MarketplaceContractVersion;
}

export async function cancelMarketplaceOffer(params: CancelOfferParams): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "cancel_offer",
      contractAddress,
      entrypoint: "cancel_offer",
      walletAddress: params.walletAddress,
      params,
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const contractVersion = params.contractVersion ?? "legacy";
      if (contractVersion === "v2" && params.offerId == null) {
        throw new Error("V2 offer cancellation requires an offer id");
      }
      const op =
        contractVersion === "v2"
          ? await contract.methodsObject.cancel_offer(toNat(params.offerId!)).send()
          : await contract.methodsObject
              .cancel_offer({
                owner: params.targetOwner,
                token_contract: params.tokenContract,
                token_id: toNat(params.tokenId),
              })
              .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export interface AcceptOfferParams {
  offerId: number | null;
  expectedToken: TokenRef;
  expectedTargetOwner: string;
  expectedQuantity: string | number;
  expectedUnitPriceWtf: string | number;
  totalWtf: string | number;
  offerer: string;
  walletAddress: string;
  contractVersion: MarketplaceContractVersion;
  legacyContractAddress?: string | null;
  listed?: boolean;
}

export async function acceptMarketplaceOffer(params: AcceptOfferParams): Promise<string> {
  const contractAddress = requireMarketplaceContract();
  return trackContractActivity(
    {
      module: "marketplace",
      action: "accept_offer",
      contractAddress,
      entrypoint: "accept_offer",
      walletAddress: params.walletAddress,
      params: {
        offerId: params.offerId,
        tokenContract: params.expectedToken.tokenContract,
        tokenId: params.expectedToken.tokenId,
        expectedTargetOwner: params.expectedTargetOwner,
        quantity: toNat(params.expectedQuantity),
        expectedQuantity: toNat(params.expectedQuantity),
        unitPriceWtf: toNat(params.expectedUnitPriceWtf),
        expectedUnitPriceWtf: toNat(params.expectedUnitPriceWtf),
        totalWtf: toNat(params.totalWtf),
        offerer: params.offerer,
        contractVersion: params.contractVersion,
        legacyContractAddress: params.legacyContractAddress,
        listed: params.listed ?? false,
      },
    },
    async () => {
      assertLegacySingleQuantity(
        params.contractVersion === "legacy" ? params.expectedQuantity : "1"
      );
      if (params.contractVersion === "v2" && params.offerId == null) {
        throw new Error("V2 offer acceptance requires an offer id");
      }
      await verifyOfferAcceptTerms(params);
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op =
        params.contractVersion === "v2"
          ? await contract.methodsObject
              .accept_offer({
                offer_id: toNat(params.offerId!),
                expected_token: {
                  token_contract: params.expectedToken.tokenContract,
                  token_id: toNat(params.expectedToken.tokenId),
                },
                expected_target_owner: params.expectedTargetOwner,
                expected_quantity: toNat(params.expectedQuantity),
                expected_unit_price_wtf: toNat(params.expectedUnitPriceWtf),
              })
              .send()
          : await contract.methodsObject
              .accept_offer({
                owner: params.expectedTargetOwner,
                token_contract: params.expectedToken.tokenContract,
                token_id: toNat(params.expectedToken.tokenId),
              })
              .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}
