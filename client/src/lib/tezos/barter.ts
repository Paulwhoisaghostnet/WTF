import { getTezos } from "./wallet";

const BARTER_CONTRACT = import.meta.env.VITE_BARTER_CONTRACT_ADDRESS || "";

if (!import.meta.env.VITE_BARTER_CONTRACT_ADDRESS) {
  console.warn(
    "[WTF] Missing VITE_BARTER_CONTRACT_ADDRESS; barter actions are disabled until configured"
  );
}

interface Fa2OperatorUpdate {
  add_operator: {
    owner: string;
    operator: string;
    token_id: number;
  };
}

export interface BarterRequestedItemInput {
  tokenContract: string;
  tokenId?: string | number | null;
  amount: string | number;
}

export interface BarterOfferedItemInput {
  tokenContract: string;
  tokenId: string | number;
  amount: string | number;
}

export interface CreateBarterTradeParams {
  requestedMode: "package" | "choice";
  requestedItems: BarterRequestedItemInput[];
  offeredMode: "package" | "choice";
  offeredItems: BarterOfferedItemInput[];
  expiresAtIso?: string | null;
}

export interface CreateBarterTradeResult {
  opHash: string;
  tradeId: number | null;
}

export interface BarterSelectedOfferedToken {
  tokenContract: string;
  tokenId: string | number;
}

export interface BarterSelectedRequestedToken {
  tokenContract: string;
  tokenId?: string | number | null;
}

export interface AcceptBarterTradeParams {
  tradeId: string | number;
  selectedOfferToken?: BarterSelectedOfferedToken | null;
  selectedRequestToken?: BarterSelectedRequestedToken | null;
  requestedTransfers: BarterOfferedItemInput[];
}

function requireBarterContract(): string {
  if (!BARTER_CONTRACT) {
    throw new Error(
      "VITE_BARTER_CONTRACT_ADDRESS is not configured. Set it before using barter actions."
    );
  }
  return BARTER_CONTRACT;
}

function toNat(value: string | number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid nat value: ${value}`);
  }
  return n;
}

function toOptionalNatOption(value?: string | number | null):
  | { Some: number }
  | { None: null } {
  if (value === null || value === undefined || value === "") {
    return { None: null };
  }
  return { Some: toNat(value) };
}

function toOptionalTimestampOption(value?: string | null):
  | { Some: string }
  | { None: null } {
  if (!value) return { None: null };
  return { Some: value };
}

async function getNextTradeId(contract: any): Promise<number | null> {
  try {
    const storage = await contract.storage();
    const raw = storage?.next_trade_id;
    const asString =
      raw && typeof raw === "object" && "toString" in raw
        ? (raw as { toString: () => string }).toString()
        : String(raw ?? "");
    const n = Number(asString);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    return n;
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

export async function approveBarterForToken(
  owner: string,
  tokenContract: string,
  tokenId: string | number
): Promise<string> {
  return setFa2Operator(tokenContract, owner, requireBarterContract(), toNat(tokenId));
}

export async function createBarterTrade(
  params: CreateBarterTradeParams
): Promise<CreateBarterTradeResult> {
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(requireBarterContract());
  const tradeId = await getNextTradeId(contract);

  const op = await contract.methodsObject
    .create_trade({
      requested_mode:
        params.requestedMode === "choice"
          ? { choice: null }
          : { package: null },
      requested_items: params.requestedItems.map((item) => ({
        token_contract: item.tokenContract,
        token_id: toOptionalNatOption(item.tokenId),
        amount: toNat(item.amount),
      })),
      offered_mode:
        params.offeredMode === "choice"
          ? { choice: null }
          : { package: null },
      offered_items: params.offeredItems.map((item) => ({
        token_contract: item.tokenContract,
        token_id: toNat(item.tokenId),
        amount: toNat(item.amount),
      })),
      expires_at: toOptionalTimestampOption(params.expiresAtIso ?? null),
    })
    .send();

  await op.confirmation(1);
  return {
    opHash: op.opHash,
    tradeId,
  };
}

export async function acceptBarterTrade(
  params: AcceptBarterTradeParams
): Promise<string> {
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(requireBarterContract());

  const op = await contract.methodsObject
    .accept_trade({
      trade_id: toNat(params.tradeId),
      selected_offer_token: params.selectedOfferToken
        ? {
            Some: {
              token_contract: params.selectedOfferToken.tokenContract,
              token_id: toNat(params.selectedOfferToken.tokenId),
            },
          }
        : { None: null },
      selected_request_token: params.selectedRequestToken
        ? {
            Some: {
              token_contract: params.selectedRequestToken.tokenContract,
              token_id: toOptionalNatOption(params.selectedRequestToken.tokenId),
            },
          }
        : { None: null },
      requested_transfers: params.requestedTransfers.map((item) => ({
        token_contract: item.tokenContract,
        token_id: toNat(item.tokenId),
        amount: toNat(item.amount),
      })),
    })
    .send();

  await op.confirmation(1);
  return op.opHash;
}

export async function cancelBarterTrade(
  tradeId: string | number
): Promise<string> {
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(requireBarterContract());
  const op = await contract.methods.cancel_trade(toNat(tradeId)).send();
  await op.confirmation(1);
  return op.opHash;
}
