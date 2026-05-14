export interface InAppInventoryTraceInput {
  currency: "exp" | "wtf";
  cause: "in_app_market_purchase" | "chain_purchase";
  purchaseId: number;
  sku: string;
  quantity: number;
  purchaseRef?: string | null;
  paymentIntentId?: number | null;
  walletAddress?: string | null;
  opHash?: string | null;
  tzktTransferId?: number | null;
  contractAddress?: string | null;
  contractListingId?: number | null;
  amountWtfUnits?: string | null;
  amountExp?: number | null;
  observedAt?: Date | string | null;
}

export function buildInAppInventoryTraceMetadata(input: InAppInventoryTraceInput) {
  return {
    source: input.cause,
    sourceType: "purchase",
    sourceId: input.purchaseId,
    domain: "market",
    ownerType: "user",
    state: "owned",
    visibility: "user_inventory",
    sku: input.sku,
    quantity: input.quantity,
    currency: input.currency,
    purchaseId: input.purchaseId,
    purchaseRef: input.purchaseRef ?? null,
    paymentIntentId: input.paymentIntentId ?? null,
    walletAddress: input.walletAddress ?? null,
    opHash: input.opHash ?? null,
    tzktTransferId: input.tzktTransferId ?? null,
    contractAddress: input.contractAddress ?? null,
    contractListingId: input.contractListingId ?? null,
    amountWtfUnits: input.amountWtfUnits ?? "0",
    amountExp: input.amountExp ?? 0,
    observedAt:
      input.observedAt instanceof Date
        ? input.observedAt.toISOString()
        : input.observedAt ?? null,
    traceRule: "P6.CA3/08",
  };
}
