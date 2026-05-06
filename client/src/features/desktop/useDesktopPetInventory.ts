import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { MAX_TOY_BALLS } from "./toys";
import { type InAppMarketResponse } from "./DesktopPetTypes";

export function useDesktopPetInventory(enabled: boolean) {
  const qc = useQueryClient();
  const inventoryQuery = useQuery({
    queryKey: ["in-app-market", "desktop_pet"],
    queryFn: () => api.get<InAppMarketResponse>("/api/in-app-market?category=desktop_pet"),
    enabled,
    refetchInterval: enabled ? 45_000 : false,
  });
  const [inventoryStatus, setInventoryStatus] = useState<{
    text: string;
    error?: boolean;
  }>({ text: "" });

  const inventoryItemsBySku = useMemo(() => {
    return new Map((inventoryQuery.data?.items ?? []).map((item) => [item.sku, item]));
  }, [inventoryQuery.data?.items]);
  const foodItem = inventoryItemsBySku.get("pet-food") ?? null;
  const medicineItem = inventoryItemsBySku.get("pet-medicine") ?? null;
  const shoeboxItem = inventoryItemsBySku.get("shoebox") ?? null;
  const ballItem =
    inventoryItemsBySku.get("pet-ball") ??
    (inventoryQuery.data?.items ?? []).find(
      (item) => item.kind === "ball" || item.kind === "toy-ball"
    ) ??
    null;

  const consumeInventoryItem = useCallback(
    async (sku: string): Promise<boolean> => {
      try {
        await api.post("/api/in-app-market/use", { sku });
        await qc.invalidateQueries({ queryKey: ["in-app-market", "desktop_pet"] });
        setInventoryStatus({ text: "" });
        return true;
      } catch (err) {
        setInventoryStatus({
          text: err instanceof Error ? err.message : "Item unavailable.",
          error: true,
        });
        return false;
      }
    },
    [qc]
  );

  return {
    ballQty: Math.min(ballItem?.quantityOwned ?? 0, MAX_TOY_BALLS),
    consumeInventoryItem,
    foodQty: foodItem?.quantityOwned ?? 0,
    inventoryStatus,
    medicineQty: medicineItem?.quantityOwned ?? 0,
    setInventoryStatus,
    shoeboxQty: shoeboxItem?.quantityOwned ?? 0,
  };
}
