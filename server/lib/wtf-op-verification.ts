import {
  extractCallArg,
  fetchTransactionsByHash,
  findAppliedContractCall,
  isValidOpHash,
  type TzktTransactionOp,
} from "./tzkt-ops";
import {
  WTF_FA2_CONTRACT,
  WTF_FA2_TOKEN_ID,
  WTF_OPERATOR_WALLET_ADDRESS,
} from "./constants";

export type WtfOpVerificationReason =
  | "not_configured"
  | "invalid_hash"
  | "not_found"
  | "mismatch";

export interface WtfOpVerificationResult {
  ok: boolean;
  reason?: WtfOpVerificationReason;
  sender?: string;
  level?: number | null;
  timestamp?: string | null;
}

interface Fa2Transfer {
  from: string;
  to: string;
  tokenId: string;
  amount: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function primitiveString(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function normalizeAddress(value: unknown): string | null {
  const raw = primitiveString(value)?.trim();
  if (!raw) return null;
  return /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw) ? raw : null;
}

function normalizeNat(value: unknown): string | null {
  const raw = primitiveString(value)?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return BigInt(raw).toString();
}

function opParameterValue(op: TzktTransactionOp): unknown {
  const parameter = op.parameter;
  if (!parameter || typeof parameter !== "object") return null;
  return "value" in parameter ? (parameter as { value?: unknown }).value : parameter;
}

export function collectFa2Transfers(op: TzktTransactionOp): Fa2Transfer[] {
  const value = opParameterValue(op);
  const batches = Array.isArray(value) ? value : [];
  const transfers: Fa2Transfer[] = [];

  for (const rawBatch of batches) {
    const batch = asRecord(rawBatch);
    if (!batch) continue;
    const from = normalizeAddress(batch.from_ ?? batch.from);
    const txs = Array.isArray(batch.txs) ? batch.txs : [];
    if (!from || txs.length === 0) continue;

    for (const rawTx of txs) {
      const tx = asRecord(rawTx);
      if (!tx) continue;
      const to = normalizeAddress(tx.to_ ?? tx.to);
      const tokenId = normalizeNat(tx.token_id ?? tx.tokenId);
      const amount = normalizeNat(tx.amount);
      if (!to || tokenId === null || amount === null) continue;
      transfers.push({ from, to, tokenId, amount });
    }
  }

  return transfers;
}

function hasExpectedFa2Transfer(
  op: TzktTransactionOp,
  expected: {
    fromOneOf: string[];
    to: string;
    tokenId: string;
    amount: string;
  }
): boolean {
  const froms = new Set(expected.fromOneOf.map((address) => address.toLowerCase()));
  const to = expected.to.toLowerCase();
  const amount = BigInt(expected.amount).toString();
  const tokenId = BigInt(expected.tokenId).toString();

  return collectFa2Transfers(op).some(
    (transfer) =>
      froms.has(transfer.from.toLowerCase()) &&
      transfer.to.toLowerCase() === to &&
      BigInt(transfer.amount).toString() === amount &&
      BigInt(transfer.tokenId).toString() === tokenId
  );
}

function normalizeSenderList(senderOneOf: string[]): string[] {
  return senderOneOf
    .map((sender) => normalizeAddress(sender))
    .filter((sender): sender is string => Boolean(sender));
}

export async function verifyWtfTransferToOperatorByHash(input: {
  opHash: string;
  senderOneOf: string[];
  amountWtf: string;
  retries?: number;
  retryDelayMs?: number;
}): Promise<WtfOpVerificationResult> {
  if (!WTF_OPERATOR_WALLET_ADDRESS) return { ok: false, reason: "not_configured" };
  if (!isValidOpHash(input.opHash)) return { ok: false, reason: "invalid_hash" };

  const senders = normalizeSenderList(input.senderOneOf);
  const amount = normalizeNat(input.amountWtf);
  if (senders.length === 0 || !amount || amount === "0") {
    return { ok: false, reason: "mismatch" };
  }

  const rows = await fetchTransactionsByHash(input.opHash, {
    retries: input.retries ?? 4,
    retryDelayMs: input.retryDelayMs,
  });
  if (rows.length === 0) return { ok: false, reason: "not_found" };

  const call = findAppliedContractCall(rows, {
    contract: WTF_FA2_CONTRACT,
    senderOneOf: senders,
    entrypoint: "transfer",
  });
  if (!call) return { ok: false, reason: "mismatch" };

  const hasTransfer = hasExpectedFa2Transfer(call.op, {
    fromOneOf: senders,
    to: WTF_OPERATOR_WALLET_ADDRESS,
    tokenId: WTF_FA2_TOKEN_ID,
    amount,
  });
  if (!hasTransfer) return { ok: false, reason: "mismatch" };

  return {
    ok: true,
    sender: call.sender,
    level: call.level,
    timestamp: call.timestamp,
  };
}

export async function verifyBuybackSwapByHash(input: {
  opHash: string;
  buybackContract: string;
  senderOneOf: string[];
  amountWtf: string;
  retries?: number;
  retryDelayMs?: number;
}): Promise<WtfOpVerificationResult> {
  if (!isValidOpHash(input.opHash)) return { ok: false, reason: "invalid_hash" };

  const buybackContract = normalizeAddress(input.buybackContract);
  const senders = normalizeSenderList(input.senderOneOf);
  const amount = normalizeNat(input.amountWtf);
  if (!buybackContract || senders.length === 0 || !amount || amount === "0") {
    return { ok: false, reason: "mismatch" };
  }

  const rows = await fetchTransactionsByHash(input.opHash, {
    retries: input.retries ?? 4,
    retryDelayMs: input.retryDelayMs,
  });
  if (rows.length === 0) return { ok: false, reason: "not_found" };

  const swapCall = findAppliedContractCall(rows, {
    contract: buybackContract,
    senderOneOf: senders,
    entrypoint: "swap",
  });
  if (!swapCall) return { ok: false, reason: "mismatch" };

  const calledAmount = normalizeNat(
    extractCallArg(swapCall.op, [["wtf_amount"], ["wtfAmount"], ["amount"]])
  );
  if (calledAmount !== amount) return { ok: false, reason: "mismatch" };

  const transferCall = findAppliedContractCall(rows, {
    contract: WTF_FA2_CONTRACT,
    senderOneOf: [buybackContract],
    entrypoint: "transfer",
  });
  if (!transferCall) return { ok: false, reason: "mismatch" };

  const hasTransfer = hasExpectedFa2Transfer(transferCall.op, {
    fromOneOf: senders,
    to: buybackContract,
    tokenId: WTF_FA2_TOKEN_ID,
    amount,
  });
  if (!hasTransfer) return { ok: false, reason: "mismatch" };

  return {
    ok: true,
    sender: swapCall.sender,
    level: swapCall.level,
    timestamp: swapCall.timestamp,
  };
}
