import { api } from "../../lib/api";
import { buyHorseOnObjktInHorf, type HorfObjktPurchase } from "../../lib/tezos/horf-horse-market";

const PENDING_KEY = "horf:objkt-pending-purchases";

export type PendingObjktPurchase = {
  intentId: string;
  opHash: string;
  buyerAddress: string;
  tokenContract: string;
  tokenId: string;
};

export type ObjktConfirmation = {
  status: "verified" | "pending";
  operationHash: string;
  tradeCounted: boolean;
};

function isPendingPurchase(value: unknown): value is PendingObjktPurchase {
  const record = value as Partial<PendingObjktPurchase> | null;
  return Boolean(record && typeof record.intentId === "string" && record.intentId &&
    typeof record.opHash === "string" && record.opHash &&
    typeof record.buyerAddress === "string" && record.buyerAddress &&
    typeof record.tokenContract === "string" && record.tokenContract &&
    typeof record.tokenId === "string" && /^\d+$/.test(record.tokenId));
}

export function pendingObjktPurchases(storage: Pick<Storage, "getItem"> = window.localStorage): PendingObjktPurchase[] {
  try {
    const value = JSON.parse(storage.getItem(PENDING_KEY) || "[]") as unknown;
    return Array.isArray(value) ? value.filter(isPendingPurchase) : [];
  } catch { return []; }
}

export function pendingObjktPurchaseFor(buyerAddress: string | null, tokenContract: string, tokenId: string): PendingObjktPurchase | null {
  if (!buyerAddress) return null;
  return pendingObjktPurchases().find((record) => record.buyerAddress === buyerAddress &&
    record.tokenContract === tokenContract && record.tokenId === tokenId) ?? null;
}

export function rememberObjktPurchase(record: PendingObjktPurchase, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): void {
  try {
    storage.setItem(PENDING_KEY, JSON.stringify([record, ...pendingObjktPurchases(storage).filter((item) => item.intentId !== record.intentId)]));
  } catch { /* Browser storage may be disabled; the current page still retains the record. */ }
}

export function forgetObjktPurchase(intentId: string, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): void {
  try { storage.setItem(PENDING_KEY, JSON.stringify(pendingObjktPurchases(storage).filter((item) => item.intentId !== intentId))); }
  catch { /* A failed cleanup cannot invalidate a verified on-chain purchase. */ }
}

export async function confirmHorfObjktPurchase(record: PendingObjktPurchase): Promise<ObjktConfirmation> {
  const result = await api.post<ObjktConfirmation>("/api/horf/horse-market/objkt-confirm", {
    buyerAddress: record.buyerAddress, intentId: record.intentId, opHash: record.opHash,
  });
  if (result.status === "verified") forgetObjktPurchase(record.intentId);
  return result;
}

export async function purchaseObjktHorseInHorf(input: {
  buyerAddress: string;
  ask: HorfObjktPurchase;
  onStage?: (stage: "preflight" | "preparing" | "wallet" | "confirming") => void;
  onSubmitted?: (record: PendingObjktPurchase) => void;
}): Promise<{ opHash: string; verification: ObjktConfirmation | null; verificationError: string | null; record: PendingObjktPurchase }> {
  let intentId: string | null = null;
  let pending: PendingObjktPurchase | null = null;
  const opHash = await buyHorseOnObjktInHorf(input.buyerAddress, input.ask, async () => {
    const result = await api.post<{ intentId: string; purchase: HorfObjktPurchase }>("/api/horf/horse-market/objkt-intent", {
      buyerAddress: input.buyerAddress,
      marketplaceContract: input.ask.marketplaceContract,
      askId: input.ask.askId,
      tokenContract: input.ask.tokenContract,
      tokenId: input.ask.tokenId,
      sellerAddress: input.ask.sellerAddress,
      priceMutez: input.ask.priceMutez,
    });
    if (!result.intentId || !result.purchase) throw new Error("Horf could not save the Objkt purchase intent.");
    intentId = result.intentId;
    return result.purchase;
  }, {
    onStage: input.onStage,
    onSubmitted: (hash) => {
      if (!intentId) throw new Error("Horf lost the Objkt purchase intent. Keep the operation hash for support.");
      pending = { intentId, opHash: hash, buyerAddress: input.buyerAddress,
        tokenContract: input.ask.tokenContract, tokenId: input.ask.tokenId };
      rememberObjktPurchase(pending);
      input.onSubmitted?.(pending);
    },
  });
  if (!pending) throw new Error("The Objkt operation confirmed without a recorded Horf purchase intent.");
  try {
    const verification = await confirmHorfObjktPurchase(pending);
    return { opHash, verification, verificationError: null, record: pending };
  } catch (error) {
    // The operation is confirmed; this record lets the trader retry proof
    // submission even if the Horf API or chain index is briefly unavailable.
    return { opHash, verification: null, verificationError: error instanceof Error ? error.message : "Horf confirmation is unavailable", record: pending };
  }
}
