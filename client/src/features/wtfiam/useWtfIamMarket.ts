import { useEffect, useMemo, useState } from "react";
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

const WTF_RAW_UNITS_PER_WHOLE = 100_000_000n;

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
  const cartHasAppUnlock = cartEntries.some((entry) => entry.item.kind === "app-unlock");
  const cartSubtotalWtfUnits = cartEntries
    .reduce((sum, entry) => {
      const units = BigInt(entry.item.priceWtfUnits);
      const discountPercent = entry.item.sale?.discountPercent ?? 0;
      const baseLine = units * BigInt(entry.quantity);
      return sum + applyDiscount(baseLine, discountPercent);
    }, 0n);
  const roundedCartSubtotalWtfUnits = ceilToWholeWtf(cartSubtotalWtfUnits).toString();
  const cartSubtotalWtfFormatted = formatWtf(roundedCartSubtotalWtfUnits);
  const cartSubtotalExp = cartEntries.reduce(
    (sum, entry) => {
      const base = entry.item.priceExp * entry.quantity;
      const discountPercent = entry.item.sale?.discountPercent ?? 0;
      if (discountPercent <= 0 || base <= 0) return sum + base;
      return sum + Math.max(1, Math.ceil((base * (100 - discountPercent)) / 100));
    },
    0
  );

  useEffect(() => {
    if (cartHasAppUnlock && currency === "exp") setCurrency("wtf");
  }, [cartHasAppUnlock, currency]);

  function changeTicket(sku: string, delta: number) {
    const item = listings.find((candidate) => candidate.sku === sku);
    if (
      !item ||
      item.source !== "live" ||
      item.stockQuantity <= 0 ||
      item.purchaseBlockedReason ||
      item.appStore?.canPurchase === false
    ) {
      return;
    }
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
    cartHasAppUnlock,
    cartTicketCount,
    category,
    changeTicket,
    clearCart,
    config: marketQuery.data?.config ?? null,
    currency,
    expBalance: marketQuery.data?.balances.exp ?? 0,
    rewardWtfBalance: marketQuery.data?.balances.rewardWtf ?? 0,
    isLoading: marketQuery.isLoading,
    isError: marketQuery.isError,
    listings,
    liveCount,
    setCurrency,
    stagedCount,
    tipLedger: marketQuery.data?.tipLedger ?? { received: [], sent: [] },
  };
}

function applyDiscount(rawUnits: bigint, discountPercent: number): bigint {
  if (discountPercent <= 0) return rawUnits;
  const percent = BigInt(Math.max(0, Math.min(99, Math.floor(discountPercent))));
  return (rawUnits * (100n - percent) + 99n) / 100n;
}

function ceilToWholeWtf(rawUnits: bigint): bigint {
  if (rawUnits <= 0n) return 0n;
  return (
    ((rawUnits + WTF_RAW_UNITS_PER_WHOLE - 1n) / WTF_RAW_UNITS_PER_WHOLE) *
    WTF_RAW_UNITS_PER_WHOLE
  );
}
