import { createHash } from "crypto";

export function buildInAppMarketCartHash(input: {
  purchaseRef: string;
  routerListingId: number;
  subtotalWtfUnits: string;
  items: unknown;
}): string {
  const items = Array.isArray(input.items) ? input.items : [];
  const normalizedItems = items.map((raw) => {
    const item =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return {
      sku: String(item.sku ?? ""),
      quantity: Number(item.quantity ?? 0),
      lineWtfUnits: String(item.lineWtfUnits ?? "0"),
    };
  });
  const payload = JSON.stringify({
    v: 2,
    purchaseRef: input.purchaseRef,
    routerListingId: input.routerListingId,
    subtotalWtfUnits: String(input.subtotalWtfUnits),
    items: normalizedItems,
  });
  return createHash("sha256").update(payload).digest("hex");
}
