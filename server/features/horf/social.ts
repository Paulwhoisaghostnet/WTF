import { isValidOpHash, type TzktTransactionOp } from "../../lib/tzkt-ops";
import { isTezosWallet } from "./model";

const FA2_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export interface GiftIntent {
  recipient: string;
  tokenContract: string;
  tokenId: string;
  amount: string;
}

export interface GiftConfirmation {
  address: string;
  opHash: string;
  gifts: GiftIntent[];
}

export interface IndexedGiftTransfer {
  id?: number;
  transactionId?: number;
  timestamp?: string;
  token?: { contract?: { address?: string } | string; tokenId?: string | number };
  from?: { address?: string } | null;
  to?: { address?: string } | null;
  amount?: string | number;
}

function nat(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  return /^\d+$/.test(text) ? BigInt(text).toString() : null;
}

export function parseGiftConfirmation(value: unknown): GiftConfirmation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const submitted = input.gifts ?? input.trades;
  if (!isTezosWallet(input.address) || !isValidOpHash(input.opHash) ||
      !Array.isArray(submitted) || submitted.length === 0) return null;
  const gifts: GiftIntent[] = [];
  for (const item of submitted) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const tokenId = nat(row.tokenId);
    const amount = nat(row.amount);
    if (!isTezosWallet(row.recipient) || row.recipient === input.address ||
        typeof row.tokenContract !== "string" || !FA2_RE.test(row.tokenContract) ||
        tokenId === null || amount === null || amount === "0" ||
        !Number.isSafeInteger(Number(amount))) return null;
    gifts.push({ recipient: row.recipient, tokenContract: row.tokenContract, tokenId, amount });
  }
  return { address: input.address, opHash: input.opHash, gifts };
}

function transferContract(row: IndexedGiftTransfer): string {
  const value = row.token?.contract;
  return typeof value === "string" ? value : String(value?.address || "");
}

/** Require a distinct indexed FA2 transfer for each declared gift. */
export function matchGiftTransfers(
  confirmation: GiftConfirmation,
  operations: TzktTransactionOp[],
  indexed: IndexedGiftTransfer[],
): IndexedGiftTransfer[] | null {
  const applied = new Set(operations.filter((operation) =>
    operation.hash === confirmation.opHash && operation.status === "applied" &&
    operation.sender?.address === confirmation.address &&
    Number.isSafeInteger(operation.id),
  ).map((operation) => operation.id!));
  if (applied.size === 0) return null;
  const remaining = [...indexed];
  const matched: IndexedGiftTransfer[] = [];
  for (const gift of confirmation.gifts) {
    const index = remaining.findIndex((row) =>
      applied.has(row.transactionId ?? -1) &&
      row.from?.address === confirmation.address && row.to?.address === gift.recipient &&
      transferContract(row) === gift.tokenContract &&
      nat(row.token?.tokenId) === gift.tokenId && nat(row.amount) === gift.amount &&
      Number.isSafeInteger(row.id) && Number(row.id) > 0 &&
      Number.isFinite(Date.parse(String(row.timestamp || ""))),
    );
    if (index < 0) return null;
    matched.push(remaining.splice(index, 1)[0]!);
  }
  return matched;
}

export function parsePossePartner(value: unknown): { address: string; nickname: string | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isTezosWallet(input.address)) return null;
  if (input.nickname != null && typeof input.nickname !== "string") return null;
  const nickname = typeof input.nickname === "string"
    ? input.nickname.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  return { address: input.address, nickname: nickname || null };
}
