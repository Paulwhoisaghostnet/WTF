import { getTezos } from "./wallet";
import { WTF_TOKEN } from "@shared/types";

const MARKETPLACE_CONTRACT =
  import.meta.env.VITE_MARKETPLACE_CONTRACT_ADDRESS || "";

if (!MARKETPLACE_CONTRACT) {
  console.warn(
    "[WTF] Missing VITE_MARKETPLACE_CONTRACT_ADDRESS; marketplace on-chain calls will fail"
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
  return setFa2Operator(
    tokenContract,
    owner,
    MARKETPLACE_CONTRACT,
    toNat(tokenId)
  );
}

export async function approveMarketplaceForWtf(owner: string) {
  return setFa2Operator(
    WTF_TOKEN.contract,
    owner,
    MARKETPLACE_CONTRACT,
    WTF_TOKEN.tokenId
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

export async function createMarketplaceListing(
  params: CreateListingParams
): Promise<string> {
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
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
  return op.opHash;
}

export async function buyMarketplaceListing(
  listingId: number
): Promise<string> {
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(MARKETPLACE_CONTRACT);
  const op = await contract.methods.buy(toNat(listingId)).send();
  await op.confirmation(1);
  return op.opHash;
}
