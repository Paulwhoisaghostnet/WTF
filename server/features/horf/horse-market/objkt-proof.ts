import { externalMarketplaceInfo } from "@shared/external-marketplaces";
import { UpstreamError } from "../../../lib/upstream";
import { horfMainnetIndex } from "../mainnet-index";
import { HORF_SEASON_START } from "../model";
import { HORF_MAINNET_CHAIN_ID } from "../stables/config";
import type { ChainReader } from "../stables/chain";

const OP_HASH_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;

export interface ObjktProofIntent {
  buyerAddress: string;
  sellerAddress: string;
  marketplaceContract: string;
  askId: string;
  tokenContract: string;
  tokenId: string;
  priceMutez: string;
  preflightLevel: number;
}

interface TzktOperation {
  id?: number;
  hash?: string;
  level?: number;
  timestamp?: string;
  counter?: number;
  nonce?: number | null;
  status?: string;
  amount?: number | string;
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
  amount?: number | string;
}

export class ObjktPurchasePendingError extends Error {}
export class ObjktPurchaseInvalidError extends Error {}

function nat(value: unknown): string | null {
  const raw = typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : typeof value === "string" ? value.trim() : "";
  return /^\d+$/.test(raw) ? BigInt(raw).toString() : null;
}

function askFromParameter(version: string, value: unknown): { askId: string | null; amount: string } {
  if (version === "v1") return { askId: nat(value), amount: "1" };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { askId: null, amount: "0" };
  const object = value as Record<string, unknown>;
  return { askId: nat(object.ask_id), amount: version === "v4" ? "1" : nat(object.amount) || "0" };
}

export function objktPurchaseOperationHash(value: unknown): value is string {
  return typeof value === "string" && OP_HASH_RE.test(value);
}

export async function readHorfMainnetRpcLevel(
  env: NodeJS.ProcessEnv = process.env,
  readJson: (url: string) => Promise<unknown> = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Mainnet RPC returned HTTP ${response.status}`);
    return response.json();
  },
): Promise<number> {
  const configured = env.HORF_MAINNET_RPC_URL?.trim() ||
    ((env.TEZOS_NETWORK || "").trim().toLowerCase() === "mainnet" ? env.TEZOS_RPC_URL?.trim() : undefined);
  const bases = configured ? [configured] : ["https://tezos-mainnet.octez.io/", "https://tcinfra.net/rpc/tezos/mainnet"];
  let lastError: unknown = null;
  for (const source of bases) {
    const base = source.replace(/\/+$/, "");
    try {
      const [chainId, header] = await Promise.all([
        readJson(`${base}/chains/main/chain_id`),
        readJson(`${base}/chains/main/blocks/head/header`),
      ]);
      if (chainId !== HORF_MAINNET_CHAIN_ID || !header || typeof header !== "object" ||
        !Number.isSafeInteger((header as { level?: unknown }).level) || Number((header as { level?: unknown }).level) <= 0) {
        throw new Error("HORF purchase intent RPC is not Tezos Mainnet");
      }
      return Number((header as { level: number }).level);
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Mainnet RPC head is unavailable");
}

/** The operation must occur after Horf's RPC head at intent creation and move this exact horse to the buyer. */
export async function verifyHorfObjktPurchase(
  intent: ObjktProofIntent, opHash: string,
  reader: ChainReader = horfMainnetIndex,
): Promise<{ operationHash: string; rootTransactionId: number; horseTransferId: number; timestamp: string }> {
  if (!objktPurchaseOperationHash(opHash)) throw new ObjktPurchaseInvalidError("Invalid Tezos operation hash");
  const info = externalMarketplaceInfo(intent.marketplaceContract);
  if (!info || info.marketplace !== "objkt" || !["v1", "v4", "v6", "v6.1", "v6.2"].includes(info.version)) {
    throw new ObjktPurchaseInvalidError("Unsupported Objkt purchase contract");
  }
  let operations: TzktOperation[];
  try { operations = await reader.getJson<TzktOperation[]>(`/operations/transactions/${opHash}`); }
  catch (error) {
    if (error instanceof UpstreamError && error.status === 404) throw new ObjktPurchasePendingError("Objkt purchase has not indexed yet");
    throw error;
  }
  if (!Array.isArray(operations) || operations.length === 0) throw new ObjktPurchasePendingError("Objkt purchase has not indexed yet");
  const roots = operations.filter((row) => row.hash === opHash && row.nonce == null &&
    row.sender?.address === intent.buyerAddress && row.target?.address === intent.marketplaceContract &&
    row.parameter?.entrypoint === "fulfill_ask" &&
    askFromParameter(info.version, row.parameter.value).askId === intent.askId &&
    askFromParameter(info.version, row.parameter.value).amount === "1");
  if (roots.length !== 1) throw new ObjktPurchaseInvalidError("Operation does not match this Horf Objkt ask");
  const root = roots[0]!;
  const time = Date.parse(String(root.timestamp || ""));
  if (root.status !== "applied" || !Number.isSafeInteger(root.id) || !Number.isSafeInteger(root.level) ||
    !Number.isSafeInteger(root.counter) || Number(root.level) <= intent.preflightLevel ||
    !Number.isFinite(time) || time < Date.parse(HORF_SEASON_START) ||
    nat(root.amount) !== intent.priceMutez) {
    throw new ObjktPurchaseInvalidError("Objkt purchase did not apply after this Horf intent at the verified price");
  }
  const children = operations.filter((row) => row.hash === opHash && row.status === "applied" &&
    row.counter === root.counter && row.sender?.address === intent.marketplaceContract &&
    row.initiator?.address === intent.buyerAddress && row.target?.address === intent.tokenContract &&
    row.parameter?.entrypoint === "transfer" && Number.isSafeInteger(row.id));
  for (const child of children) {
    const rows = await reader.getJson<TzktTransfer[]>("/tokens/transfers", {
      transactionId: child.id, "token.contract": intent.tokenContract,
      "token.tokenId": intent.tokenId, to: intent.buyerAddress, amount: "1", limit: 100,
    });
    if (!Array.isArray(rows)) throw new ObjktPurchasePendingError("Objkt token transfer has not indexed yet");
    const transfer = rows.find((row) => row.transactionId === child.id &&
      row.token?.contract?.address === intent.tokenContract && nat(row.token?.tokenId) === intent.tokenId &&
      (row.from?.address === intent.sellerAddress || row.from?.address === intent.marketplaceContract) &&
      row.to?.address === intent.buyerAddress && nat(row.amount) === "1" &&
      Number.isSafeInteger(row.id) && Number(row.id) > 0);
    if (transfer) return { operationHash: opHash, rootTransactionId: root.id!, horseTransferId: transfer.id!,
      timestamp: new Date(time).toISOString() };
  }
  throw new ObjktPurchasePendingError("Matching Objkt horse transfer has not indexed yet");
}
