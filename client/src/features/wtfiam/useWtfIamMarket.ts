import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatWtf } from "@shared/types";
import { api } from "../../lib/api";
import { buildWtfIamListings, WTFIAM_CATEGORIES } from "./catalog";
import type {
  InAppMarketResponse,
  MarketCurrency,
  WtfIamCartEntry,
  WtfIamCategoryKey,
} from "./types";

export function useWtfIamMarket(categoryKey: WtfIamCategoryKey) {
  const [currency, setCurrency] = useState<MarketCurrency>("wtf");
  const [cart, setCart] = useState<Record<string, number>>({});

  const marketQuery = useQuery({
    queryKey: ["wtfiam", categoryKey],
    queryFn: () =>
      api.get<InAppMarketResponse>(
        `/api/in-app-market?category=${encodeURIComponent(categoryKey)}`
      ),
    staleTime: 30_000,
  });

  const category = useMemo(
    () => WTFIAM_CATEGORIES.find((entry) => entry.key === categoryKey) ?? WTFIAM_CATEGORIES[0],
    [categoryKey]
  );

  const listings = useMemo(
    () => buildWtfIamListings(categoryKey, marketQuery.data?.items ?? []),
    [categoryKey, marketQuery.data?.items]
  );

  const cartEntries = useMemo<WtfIamCartEntry[]>(
    () =>
      listings
        .map((item) => ({ item, quantity: cart[item.sku] ?? 0 }))
        .filter((entry) => entry.quantity > 0),
    [cart, listings]
  );

  const liveCount = listings.filter((item) => item.source === "live").length;
  const stagedCount = listings.length - liveCount;
  const cartTicketCount = cartEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const cartSubtotalWtfUnits = cartEntries
    .reduce((sum, entry) => {
      const units = BigInt(entry.item.priceWtfUnits);
      return sum + units * BigInt(entry.quantity);
    }, 0n)
    .toString();
  const cartSubtotalWtfFormatted = formatWtf(cartSubtotalWtfUnits);
  const cartSubtotalExp = cartEntries.reduce(
    (sum, entry) => sum + entry.item.priceExp * entry.quantity,
    0
  );

  function changeTicket(sku: string, delta: number) {
    const item = listings.find((candidate) => candidate.sku === sku);
    if (!item || item.source !== "live" || item.stockQuantity <= 0) return;
    setCart((prev) => {
      const nextQty = Math.max(
        0,
        Math.min((prev[sku] ?? 0) + delta, item.stockQuantity, 99)
      );
      const next = { ...prev };
      if (nextQty <= 0) delete next[sku];
      else next[sku] = nextQty;
      return next;
    });
  }

  function clearCart() {
    setCart({});
  }

  return {
    cart,
    cartEntries,
    cartSubtotalExp,
    cartSubtotalWtfFormatted,
    cartTicketCount,
    category,
    changeTicket,
    clearCart,
    config: marketQuery.data?.config ?? null,
    currency,
    expBalance: marketQuery.data?.balances.exp ?? 0,
    isLoading: marketQuery.isLoading,
    isError: marketQuery.isError,
    listings,
    liveCount,
    setCurrency,
    stagedCount,
  };
}
