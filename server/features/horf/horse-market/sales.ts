import { horfMainnetIndex } from "../mainnet-index";
import { isTezosWallet } from "../model";
import { assertHorfStablesMainnet, type ChainReader } from "../stables/chain";
import { horseContractAddress } from "../horse-config";

// TzKT documents a 100-row default page; the cursor continues until exhausted.
export const HORSE_MARKET_SALE_PAGE_SIZE = 100;
const CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const OP_HASH_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;

interface TzktSaleEvent {
  id?: number;
  level?: number;
  timestamp?: string;
  contract?: { address?: string };
  tag?: string;
  payload?: unknown;
  transactionId?: number;
}

interface TzktOperation {
  id?: number;
  hash?: string;
  counter?: number;
  nonce?: number | null;
  status?: string;
  timestamp?: string;
  level?: number;
  sender?: { address?: string };
  initiator?: { address?: string } | null;
  target?: { address?: string };
  parameter?: { entrypoint?: string; value?: unknown } | null;
}

interface TzktTransfer {
  id?: number;
  transactionId?: number;
  token?: { contract?: { address?: string }; tokenId?: string | number };
  from?: { address?: string } | null;
  to?: { address?: string } | null;
  amount?: string | number;
}

export interface HorfHorseMarketSale {
  id: number;
  transactionId: number;
  timestamp: string;
  seller: string;
  buyer: string;
  listingId: string;
  tokenContract: string;
  tokenId: string;
  quantity: string;
  totalHorseRaw: string;
}

export interface VerifiedHorfHorseMarketSale extends HorfHorseMarketSale {
  operationHash: string;
  horseTransferId: number;
  paymentTransferId: number;
}

export class HorfHorseMarketSaleProofError extends Error {}

function nat(value: unknown, label: string, allowZero = false): string {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) throw new HorfHorseMarketSaleProofError(`Invalid ${label} in HORSE sale`);
  const normalized = BigInt(text).toString();
  if (!allowZero && normalized === "0") throw new HorfHorseMarketSaleProofError(`Zero ${label} in HORSE sale`);
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HorfHorseMarketSaleProofError("Invalid HORSE sale record");
  return value as Record<string, unknown>;
}

export function normalizeHorfHorseMarketSaleEvent(
  row: TzktSaleEvent, marketAddress: string, since: string, until: string | null,
): HorfHorseMarketSale {
  const id = Number(row.id);
  const transactionId = Number(row.transactionId);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(transactionId) || transactionId <= 0 ||
    row.contract?.address !== marketAddress || row.tag !== "horse_market_bought") {
    throw new HorfHorseMarketSaleProofError("Invalid HORSE market event source");
  }
  const time = Date.parse(String(row.timestamp || ""));
  if (!Number.isFinite(time) || time < Date.parse(since) || (until && time >= Date.parse(until))) {
    throw new HorfHorseMarketSaleProofError("HORSE market event escaped its season window");
  }
  const payload = record(row.payload);
  const seller = String(payload.seller || "");
  const buyer = String(payload.buyer || "");
  const tokenContract = String(payload.token_contract || "");
  if (!isTezosWallet(seller) || !isTezosWallet(buyer) || seller === buyer ||
    !CONTRACT_RE.test(tokenContract) || tokenContract === horseContractAddress()) {
    throw new HorfHorseMarketSaleProofError("Invalid participants or horse asset in HORSE market event");
  }
  return {
    id, transactionId, timestamp: new Date(time).toISOString(), seller, buyer,
    listingId: nat(payload.listing_id, "listing ID", true),
    tokenContract, tokenId: nat(payload.token_id, "horse token ID", true),
    quantity: nat(payload.quantity, "quantity"),
    totalHorseRaw: nat(payload.total_horse, "HORSE payment"),
  };
}

export function horseMarketSaleEventParams(marketAddress: string, after: number, since: string, until: string | null) {
  return {
    contract: marketAddress, tag: "horse_market_bought", "id.gt": after,
    "timestamp.ge": since, ...(until ? { "timestamp.lt": until } : {}),
    "sort.asc": "id", limit: HORSE_MARKET_SALE_PAGE_SIZE,
  };
}

export async function fetchHorfHorseMarketSalePage(
  marketAddress: string, after: number, since: string, until: string | null,
  reader: ChainReader = horfMainnetIndex,
): Promise<HorfHorseMarketSale[]> {
  await assertHorfStablesMainnet(reader);
  const rows = await reader.getJson<TzktSaleEvent[]>("/contracts/events", horseMarketSaleEventParams(marketAddress, after, since, until));
  if (!Array.isArray(rows)) throw new HorfHorseMarketSaleProofError("HORSE sale event page is invalid");
  let previous = after;
  return rows.map((row) => {
    const sale = normalizeHorfHorseMarketSaleEvent(row, marketAddress, since, until);
    if (sale.id <= previous) throw new HorfHorseMarketSaleProofError("HORSE sale event cursor did not advance");
    previous = sale.id;
    return sale;
  });
}

export function isLastHorfHorseMarketSalePage(page: readonly HorfHorseMarketSale[]): boolean {
  return page.length < HORSE_MARKET_SALE_PAGE_SIZE;
}

function matchingTransfer(
  rows: TzktTransfer[], transactionId: number,
  tokenContract: string, tokenId: string, from: string, to: string, amount: string,
): number | null {
  const found = rows.find((row) =>
    row.transactionId === transactionId && row.token?.contract?.address === tokenContract &&
    nat(row.token?.tokenId, "indexed token ID", true) === tokenId &&
    row.from?.address === from && row.to?.address === to &&
    nat(row.amount, "indexed amount") === amount &&
    Number.isSafeInteger(row.id) && Number(row.id) > 0);
  return found?.id ?? null;
}

async function transferForOperation(
  operation: TzktOperation, reader: ChainReader,
  tokenContract: string, tokenId: string, from: string, to: string, amount: string,
): Promise<number | null> {
  const rows = await reader.getJson<TzktTransfer[]>("/tokens/transfers", {
    transactionId: operation.id, "token.contract": tokenContract, "token.tokenId": tokenId,
    from, to, amount, limit: 100,
  });
  if (!Array.isArray(rows)) throw new HorfHorseMarketSaleProofError("Indexed sale transfer page is invalid");
  return matchingTransfer(rows, operation.id!, tokenContract, tokenId, from, to, amount);
}

/** Bind the market event to an applied buy and two distinct indexed FA2 movements. */
export async function verifyHorfHorseMarketSale(
  sale: HorfHorseMarketSale, marketAddress: string, paymentContract: string,
  reader: ChainReader = horfMainnetIndex,
): Promise<VerifiedHorfHorseMarketSale> {
  await assertHorfStablesMainnet(reader);
  if (!CONTRACT_RE.test(marketAddress) || !CONTRACT_RE.test(paymentContract) || sale.tokenContract === paymentContract) {
    throw new HorfHorseMarketSaleProofError("Invalid HORSE sale contracts");
  }
  const roots = await reader.getJson<TzktOperation[]>("/operations/transactions", { id: sale.transactionId, limit: 1 });
  const root = Array.isArray(roots) ? roots[0] : null;
  if (!root || root.id !== sale.transactionId || root.status !== "applied" ||
    root.sender?.address !== sale.buyer || root.target?.address !== marketAddress ||
    root.parameter?.entrypoint !== "buy_listing" || !Number.isSafeInteger(root.counter) ||
    !OP_HASH_RE.test(String(root.hash || "")) ||
    Date.parse(String(root.timestamp || "")) !== Date.parse(sale.timestamp)) {
    throw new HorfHorseMarketSaleProofError("HORSE sale has no matching applied market purchase");
  }
  const operations = await reader.getJson<TzktOperation[]>(`/operations/transactions/${root.hash}`);
  if (!Array.isArray(operations)) throw new HorfHorseMarketSaleProofError("HORSE sale operation group is invalid");
  const internal = operations.filter((operation) =>
    operation.hash === root.hash && operation.status === "applied" &&
    operation.counter === root.counter && operation.sender?.address === marketAddress &&
    operation.initiator?.address === sale.buyer && operation.parameter?.entrypoint === "transfer" &&
    Number.isSafeInteger(operation.id) && Number(operation.id) > 0);
  const horseOp = internal.find((operation) => operation.target?.address === sale.tokenContract);
  const paymentOp = internal.find((operation) => operation.target?.address === paymentContract);
  if (!horseOp || !paymentOp || horseOp.id === paymentOp.id) {
    throw new HorfHorseMarketSaleProofError("HORSE sale is missing its horse or payment transfer");
  }
  const [horseTransferId, paymentTransferId] = await Promise.all([
    transferForOperation(horseOp, reader, sale.tokenContract, sale.tokenId, marketAddress, sale.buyer, sale.quantity),
    transferForOperation(paymentOp, reader, paymentContract, "0", sale.buyer, sale.seller, sale.totalHorseRaw),
  ]);
  if (!horseTransferId || !paymentTransferId || horseTransferId === paymentTransferId) {
    throw new HorfHorseMarketSaleProofError("HORSE sale did not have two indexed token movements");
  }
  return { ...sale, operationHash: root.hash!, horseTransferId, paymentTransferId };
}
