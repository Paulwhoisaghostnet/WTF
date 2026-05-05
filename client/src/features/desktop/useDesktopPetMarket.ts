import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatWtf } from "@shared/types";
import { api } from "../../lib/api";
import { useWallet } from "../../lib/wallet-context";
import { MAX_TOY_BALLS } from "./toys";
import {
  type InAppMarketIntentResponse,
  type InAppMarketItem,
  type InAppMarketResponse,
  type MarketCurrency,
} from "./DesktopPetTypes";

export function useDesktopPetMarket(enabled: boolean) {
  const qc = useQueryClient();
  const { address, connect } = useWallet();
  const marketQuery = useQuery({
    queryKey: ["in-app-market", "desktop_pet"],
    queryFn: () => api.get<InAppMarketResponse>("/api/in-app-market?category=desktop_pet"),
    enabled,
    refetchInterval: enabled ? 45_000 : false,
  });
  const [marketStatus, setMarketStatus] = useState<{
    text: string;
    error?: boolean;
  }>({ text: "" });
  const [marketCurrency, setMarketCurrency] = useState<MarketCurrency>("wtf");
  const [cartTickets, setCartTickets] = useState<Record<string, number>>({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const marketItemsBySku = useMemo(() => {
    return new Map((marketQuery.data?.items ?? []).map((item) => [item.sku, item]));
  }, [marketQuery.data?.items]);
  const foodItem = marketItemsBySku.get("pet-food") ?? null;
  const medicineItem = marketItemsBySku.get("pet-medicine") ?? null;
  const shoeboxItem = marketItemsBySku.get("shoebox") ?? null;
  const ballItem =
    marketItemsBySku.get("pet-ball") ??
    (marketQuery.data?.items ?? []).find(
      (item) => item.kind === "ball" || item.kind === "toy-ball"
    ) ??
    null;
  const foodQty = foodItem?.quantityOwned ?? 0;
  const medicineQty = medicineItem?.quantityOwned ?? 0;
  const shoeboxQty = shoeboxItem?.quantityOwned ?? 0;
  const ballQty = Math.min(ballItem?.quantityOwned ?? 0, MAX_TOY_BALLS);
  const marketConfigured = marketQuery.data?.config.configured ?? false;
  const expBalance = marketQuery.data?.balances.exp ?? 0;
  const marketListings = useMemo(
    () => [foodItem, medicineItem, shoeboxItem, ballItem].filter(Boolean) as InAppMarketItem[],
    [ballItem, foodItem, medicineItem, shoeboxItem]
  );
  const cartEntries = useMemo(
    () =>
      marketListings
        .map((item) => ({
          item,
          quantity: cartTickets[item.sku] ?? 0,
        }))
        .filter((entry) => entry.quantity > 0),
    [cartTickets, marketListings]
  );
  const cartTicketCount = cartEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const cartSubtotalWtfUnits = cartEntries
    .reduce(
      (sum, entry) =>
        sum + BigInt(entry.item.priceWtfUnits) * BigInt(entry.quantity),
      0n
    )
    .toString();
  const cartSubtotalWtfFormatted = formatWtf(cartSubtotalWtfUnits);
  const cartSubtotalExp = cartEntries.reduce(
    (sum, entry) => sum + (entry.item.priceExp ?? 0) * entry.quantity,
    0
  );

  const addCartTicket = useCallback(
    (item: InAppMarketItem | null) => {
      if (!item) return;
      setCartTickets((prev) => {
        const current = prev[item.sku] ?? 0;
        if (item.sku === ballItem?.sku && ballQty + current >= MAX_TOY_BALLS) {
          setMarketStatus({ text: "Ball limit is 3 per user.", error: true });
          return prev;
        }
        setMarketStatus({ text: `${item.name} ticket added.` });
        return {
          ...prev,
          [item.sku]: Math.min(current + 1, 99),
        };
      });
    },
    [ballItem?.sku, ballQty]
  );

  const changeCartTicket = useCallback((sku: string, delta: number) => {
    setCartTickets((prev) => {
      const maxQty =
        sku === ballItem?.sku ? Math.max(0, MAX_TOY_BALLS - ballQty) : 99;
      const nextQty = Math.max(0, Math.min((prev[sku] ?? 0) + delta, maxQty));
      if (delta > 0 && sku === ballItem?.sku && nextQty === (prev[sku] ?? 0)) {
        setMarketStatus({ text: "Ball limit is 3 per user.", error: true });
      }
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[sku];
      } else {
        next[sku] = nextQty;
      }
      return next;
    });
  }, [ballItem?.sku, ballQty]);

  const clearCart = useCallback(() => {
    setCartTickets({});
  }, []);

  const checkoutMarketCart = useCallback(async () => {
    if (cartEntries.length === 0 || checkoutBusy) return;
    if (marketCurrency === "wtf" && !marketConfigured) {
      setMarketStatus({ text: "Market contract is not configured.", error: true });
      return;
    }
    if (marketCurrency === "exp" && cartSubtotalExp > expBalance) {
      setMarketStatus({ text: "Not enough EXP for that cart.", error: true });
      return;
    }

    try {
      setCheckoutBusy(true);
      setMarketStatus({ text: "Writing tickets..." });
      const cartItems = cartEntries.map((entry) => ({
        sku: entry.item.sku,
        quantity: entry.quantity,
      }));

      if (marketCurrency === "exp") {
        const intent = await api.post<InAppMarketIntentResponse>(
          "/api/in-app-market/intents",
          {
            currency: "exp",
            items: cartItems,
          }
        );
        setMarketStatus({ text: "Redeeming EXP..." });
        await api.post("/api/in-app-market/checkout-exp", {
          purchaseRef: intent.intent.purchaseRef,
        });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["in-app-market", "desktop_pet"] }),
          qc.invalidateQueries({ queryKey: ["auth", "user"] }),
        ]);
        setCartTickets({});
        setMarketStatus({ text: `${cartTicketCount} ticket(s) granted.` });
        return;
      }

      setMarketStatus({ text: "Opening wallet..." });
      let walletAddress = address;
      const tezos = await import("../../lib/tezos");
      if (!walletAddress) {
        await connect();
        walletAddress = (await tezos.getActiveAccount())?.address ?? null;
      }
      if (!walletAddress) {
        throw new Error("Connect a Tezos wallet first.");
      }

      const intent = await api.post<InAppMarketIntentResponse>(
        "/api/in-app-market/intents",
        {
          currency: "wtf",
          walletAddress,
          items: cartItems,
        }
      );
      setMarketStatus({ text: "Approving WTF..." });
      await tezos.approveInAppMarketForWtf(walletAddress);
      setMarketStatus({ text: "Sending WTF..." });
      const opHash = await tezos.purchaseInAppMarketListing({
        walletAddress,
        listingId: intent.intent.routerListingId,
        amountWtfUnits: intent.intent.subtotalWtfUnits,
        purchaseRef: intent.intent.purchaseRef,
      });
      setMarketStatus({ text: "Confirming purchase..." });
      await api.post("/api/in-app-market/verify", { opHash });
      await qc.invalidateQueries({ queryKey: ["in-app-market", "desktop_pet"] });
      setCartTickets({});
      setMarketStatus({ text: `${cartTicketCount} ticket(s) granted.` });
    } catch (err) {
      setMarketStatus({
        text: err instanceof Error ? err.message : "Checkout failed.",
        error: true,
      });
    } finally {
      setCheckoutBusy(false);
    }
  }, [
    address,
    cartEntries,
    cartSubtotalExp,
    cartTicketCount,
    checkoutBusy,
    connect,
    expBalance,
    marketConfigured,
    marketCurrency,
    qc,
  ]);

  const consumeMarketItem = useCallback(
    async (sku: string): Promise<boolean> => {
      try {
        await api.post("/api/in-app-market/use", { sku });
        await qc.invalidateQueries({ queryKey: ["in-app-market", "desktop_pet"] });
        setMarketStatus({ text: "" });
        return true;
      } catch (err) {
        setMarketStatus({
          text: err instanceof Error ? err.message : "Item unavailable.",
          error: true,
        });
        return false;
      }
    },
    [qc]
  );

  return {
    addCartTicket,
    ballItem,
    ballQty,
    cartEntries,
    cartSubtotalExp,
    cartSubtotalWtfFormatted,
    cartTicketCount,
    cartTickets,
    changeCartTicket,
    checkoutBusy,
    checkoutMarketCart,
    clearCart,
    consumeMarketItem,
    expBalance,
    foodQty,
    marketConfigured,
    marketCurrency,
    marketListings,
    marketStatus,
    medicineQty,
    setMarketCurrency,
    setMarketStatus,
    shoeboxQty,
  };
}
