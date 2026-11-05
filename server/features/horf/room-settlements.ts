import { horfMainnetIndex } from "./mainnet-index";
import { isTezosWallet } from "./model";
import type { RoomChainReader } from "./rooms/chain";

// TzKT's documented default event page is 100. The cursor has no total cap.
export const HORF_ROOM_EVENT_PAGE_SIZE = 100;
const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const OP_HASH_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;

interface TzktEvent {
  id?: number;
  timestamp?: string;
  transactionId?: number;
  contract?: { address?: string };
  tag?: string | null;
  payload?: unknown;
}

interface TzktTransaction {
  id?: number;
  hash?: string;
  status?: string;
  target?: { address?: string };
}

export interface HorfRoomSettlement {
  id: number;
  timestamp: string;
  operationHash: string;
  mode: 0 | 1 | 2 | 3;
  owner: string;
  claimant: string;
  outputContract: string;
  outputTokenId: string;
  inputContract: string | null;
  inputTokenId: string | null;
}

export interface HorfRoomSettlementPage {
  settlements: HorfRoomSettlement[];
  cursor: number;
  complete: boolean;
}

function nat(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label} in Horf room settlement`);
  return BigInt(text).toString();
}

export function normalizeHorfRoomSettlementEvent(
  row: TzktEvent, contractAddress: string, since: string,
  until: string | null, operationHash: string,
): HorfRoomSettlement | null {
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0 || row.contract?.address !== contractAddress) {
    throw new Error("Unexpected TzKT Horf room event source");
  }
  const time = Date.parse(String(row.timestamp || ""));
  if (!Number.isFinite(time) || time < Date.parse(since) || (until && time >= Date.parse(until))) {
    throw new Error("TzKT Horf room event escaped its season window");
  }
  if (row.tag !== "horse_claimed" && row.tag !== "horse_swapped" && row.tag !== "private_offer_fulfilled") {
    return null; // Deposits, private escrow creation, and cancellations are custody, not trades.
  }
  if (!OP_HASH_RE.test(operationHash) || !Number.isSafeInteger(row.transactionId) ||
      !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    throw new Error("Invalid TzKT Horf room settlement proof");
  }
  const payload = row.payload as Record<string, unknown>;
  nat(payload.listing_id, "listing ID"); // Listing zero is valid.
  const owner = String(payload.owner || "");
  const claimant = String(payload.claimant || "");
  if (!isTezosWallet(owner) || !isTezosWallet(claimant) || owner === claimant) {
    throw new Error("Invalid trader wallets in Horf room settlement");
  }
  const claimed = row.tag === "horse_claimed";
  const mode = claimed ? Number(nat(payload.mode, "room mode"))
    : row.tag === "horse_swapped" ? 2 : 3;
  if (!Number.isInteger(mode) || mode < 0 || mode > 3 || (claimed && mode > 1)) {
    throw new Error("Invalid room mode in Horf settlement");
  }
  const outputContract = String(claimed ? payload.token_contract || "" : payload.output_contract || "");
  const outputTokenId = nat(claimed ? payload.token_id : payload.output_id, "output token ID");
  if (!KT1_RE.test(outputContract)) throw new Error("Invalid output FA2 in Horf room settlement");
  const inputContract = claimed ? null : String(payload.input_contract || "");
  const inputTokenId = claimed ? null : nat(payload.input_id, "input token ID");
  if (!claimed && (!KT1_RE.test(inputContract || "") ||
      (inputContract === outputContract && inputTokenId === outputTokenId))) {
    throw new Error("Invalid input FA2 in Horf room settlement");
  }
  return { id, timestamp: new Date(time).toISOString(), operationHash,
    mode: mode as HorfRoomSettlement["mode"], owner, claimant,
    outputContract, outputTokenId, inputContract, inputTokenId };
}

export async function fetchHorfRoomSettlementPage(
  contractAddress: string, after: number, since: string, until: string | null,
  reader: RoomChainReader = horfMainnetIndex,
): Promise<HorfRoomSettlementPage> {
  const rows = await reader.getJson<TzktEvent[]>("/contracts/events", {
    contract: contractAddress, "id.gt": after, "timestamp.ge": since,
    ...(until ? { "timestamp.lt": until } : {}), "sort.asc": "id", limit: HORF_ROOM_EVENT_PAGE_SIZE,
  });
  if (!Array.isArray(rows)) throw new Error("TzKT Horf room event page was not an array");
  let cursor = after;
  const settlements: HorfRoomSettlement[] = [];
  const operationHashes = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= cursor || row.contract?.address !== contractAddress) {
      throw new Error("TzKT Horf room event cursor did not advance");
    }
    cursor = id;
    if (row.tag !== "horse_claimed" && row.tag !== "horse_swapped" && row.tag !== "private_offer_fulfilled") continue;
    const transactionId = Number(row.transactionId);
    if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
      throw new Error("Horf room settlement has no TzKT transaction");
    }
    let operationHash = operationHashes.get(transactionId);
    if (!operationHash) {
      const operations = await reader.getJson<TzktTransaction[]>("/operations/transactions",
        { id: transactionId, limit: 2 });
      const matching = Array.isArray(operations) ? operations.filter((operation) =>
        operation.id === transactionId && operation.status === "applied" &&
        operation.target?.address === contractAddress && OP_HASH_RE.test(operation.hash || "")) : [];
      if (matching.length !== 1) throw new Error("Horf room settlement operation is not a unique applied Mainnet transaction");
      operationHash = matching[0]!.hash!;
      operationHashes.set(transactionId, operationHash);
    }
    const settlement = normalizeHorfRoomSettlementEvent(row, contractAddress, since, until, operationHash);
    if (settlement) settlements.push(settlement);
  }
  return { settlements, cursor, complete: rows.length < HORF_ROOM_EVENT_PAGE_SIZE };
}
