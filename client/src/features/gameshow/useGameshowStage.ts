import { useSyncExternalStore } from "react";
import { onlineManager, useQuery } from "@tanstack/react-query";
import { STAGE_REFRESH_INTERVAL_MS, type GameshowStageSnapshot } from "@shared/gameshow";
import { api } from "../../lib/api";

export const gameshowStageKey = (seasonId: number | null) => ["gameshow-stage", seasonId] as const;

const subscribeConnection = (onChange: () => void) => onlineManager.subscribe(onChange);
const getConnection = () => onlineManager.isOnline();
export function useGameshowConnection() {
  return useSyncExternalStore(subscribeConnection, getConnection, () => true);
}

/** Shared foreground refresh follows the existing gameshow Control Board cadence. */
export function useGameshowStage(seasonId: number | null) {
  return useQuery({
    queryKey: gameshowStageKey(seasonId),
    queryFn: () => api.get<GameshowStageSnapshot>(`/api/gameshow/seasons/${seasonId}/stage`),
    enabled: seasonId !== null,
    refetchInterval: STAGE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
