import { getTezos } from "./wallet";
import { WTF_TOKEN } from "@shared/types";
import { trackContractActivity } from "./activity-ledger";

const DEFAULT_MARKETPLACE_CONTRACT = "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj";
const MARKETPLACE_CONTRACT =
  import.meta.env.VITE_MARKETPLACE_CONTRACT_ADDRESS ||
  DEFAULT_MARKETPLACE_CONTRACT;

if (!import.meta.env.VITE_MARKETPLACE_CONTRACT_ADDRESS) {
  console.warn(
    `[WTF] Missing VITE_MARKETPLACE_CONTRACT_ADDRESS; using default ${DEFAULT_MARKETPLACE_CONTRACT}`
  );
}

interface Fa2OperatorUpdate {
  add_operator: {
    owner: string;
    operator: string;
    token_id: number;
  };
}

function toNat(value: string | number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid nat value: ${value}`);
  }
  return n;
}

function toOptionalNatFromStorage(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "object" && value !== null && "toString" in value
      ? (value as { toString: () => string }).toString()
      : String(value);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

async function getNextCounter(
  contract: any,
  key: "next_listing_id" | "next_auction_id"
): Promise<number | null> {
  try {
    const storage = await contract.storage();
    return toOptionalNatFromStorage(storage?.[key]);
  } catch {
    return null;
  }
}

async function setFa2Operator(
  fa2Contract: string,
  owner: string,
  operator: string,
  tokenId: number
) {
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(fa2Contract);
  const update: Fa2OperatorUpdate[] = [
    {
      add_operator: {
        owner,
        operator,
        token_id: tokenId,
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
  tokenId: string | number
) {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "approve_marketplace_for_token",
      contractAddress: tokenContract,
      entrypoint: "update_operators",
      walletAddress: owner,
      params: {
        owner,
        operator: MARKETPLACE_CONTRACT,
        tokenContract,
        tokenId,
      },
    },
    () =>
      setFa2Operator(
        tokenContract,
        owner,
        MARKETPLACE_CONTRACT,
        toNat(tokenId)
      )
  );
}

export async function approveMarketplaceForWtf(owner: string) {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "approve_marketplace_for_wtf",
      contractAddress: WTF_TOKEN.contract,
      entrypoint: "update_operators",
      walletAddress: owner,
      params: {
        owner,
        operator: MARKETPLACE_CONTRACT,
        tokenContract: WTF_TOKEN.contract,
        tokenId: WTF_TOKEN.tokenId,
      },
    },
    () =>
      setFa2Operator(
        WTF_TOKEN.contract,
        owner,
        MARKETPLACE_CONTRACT,
        WTF_TOKEN.tokenId
      )
  );
}

export interface CreateListingParams {
  tokenContract: string;
  tokenId: string | number;
  amount: number;
  priceWtf: number;
  royaltyRecipient?: string | null;
  royaltyBps?: number;
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
  return trackContractActivity(
    {
      module: "marketplace",
      action: "create_listing",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "create_listing",
      params,
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const listingId = await getNextCounter(contract, "next_listing_id");
      const op = await contract.methodsObject
        .create_listing({
          token_contract: params.tokenContract,
          token_id: toNat(params.tokenId),
          token_amount: toNat(params.amount),
          price_wtf: toNat(params.priceWtf),
          royalty_recipient: params.royaltyRecipient
            ? { Some: params.royaltyRecipient }
            : { None: null },
          royalty_bps: toNat(params.royaltyBps ?? 0),
          })
        .send();
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
  tokenContract: string;
  tokenId: string | number;
  reserveWtf: number;
  startTimeIso: string;
  endTimeIso: string;
  extensionTimeSeconds: number;
  priceIncrementWtf: number;
  shares: AuctionShare[];
}

export interface CreateAuctionResult {
  opHash: string;
  auctionId: number | null;
}

export async function createMarketplaceAuction(
  params: CreateAuctionParams
): Promise<CreateAuctionResult> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "create_auction",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "create_auction",
      params,
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const auctionId = await getNextCounter(contract, "next_auction_id");
      const op = await contract.methodsObject
        .create_auction({
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
        })
        .send();
      await op.confirmation(1);
      return { opHash: op.opHash, auctionId };
    }
  );
}

export async function buyMarketplaceListing(
  listingId: number
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "buy_listing",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "buy",
      params: { listingId },
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject.buy(toNat(listingId)).send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function cancelMarketplaceListing(
  listingId: number
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "cancel_listing",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "cancel_listing",
      params: { listingId },
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject.cancel_listing(toNat(listingId)).send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function bidMarketplaceAuction(
  auctionId: number,
  amountWtf: number
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "bid_auction",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "bid",
      params: { auctionId, amountWtf },
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject
        .bid({
          auction_id: toNat(auctionId),
          amount: toNat(amountWtf),
        })
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function settleMarketplaceAuction(
  auctionId: number
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "settle_auction",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "settle_auction",
      params: { auctionId },
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject.settle_auction(toNat(auctionId)).send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function cancelMarketplaceAuction(
  auctionId: number
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "cancel_auction",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "cancel_auction",
      params: { auctionId },
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject.cancel_auction(toNat(auctionId)).send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export interface PlaceOfferParams {
  tokenContract: string;
  tokenId: string | number;
  tokenAmount?: number;
  amountWtf: number;
  targetOwner: string;
}

export async function placeMarketplaceOffer(
  params: PlaceOfferParams
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "place_offer",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "place_offer",
      params,
    },
    async () => {
      if (params.tokenAmount != null && params.tokenAmount !== 1) {
        throw new Error("Offers are single-edition only");
      }
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject
        .place_offer({
          token_contract: params.tokenContract,
          token_id: toNat(params.tokenId),
          token_amount: toNat(1),
          amount_wtf: toNat(params.amountWtf),
          target_owner: params.targetOwner,
        })
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function cancelMarketplaceOffer(
  tokenContract: string,
  tokenId: string | number
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "cancel_offer",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "cancel_offer",
      params: { tokenContract, tokenId },
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject
        .cancel_offer({
          token_contract: tokenContract,
          token_id: toNat(tokenId),
        })
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function acceptMarketplaceOffer(
  tokenContract: string,
  tokenId: string | number
): Promise<string> {
  return trackContractActivity(
    {
      module: "marketplace",
      action: "accept_offer",
      contractAddress: MARKETPLACE_CONTRACT,
      entrypoint: "accept_offer",
      params: { tokenContract, tokenId },
    },
    async () => {
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
      const op = await contract.methodsObject
        .accept_offer({
          token_contract: tokenContract,
          token_id: toNat(tokenId),
        })
        .send();
      await op.confirmation(1);
      return op.opHash;
    }
  );
}
