import { useEffect } from "react";
import {
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "../../lib/api";

export type CockpitChallenge = {
  id: number;
  title: string;
  status?: string | null;
  rewardType?: string | null;
};

export type CockpitSyncStatusResponse = {
  jobs: Array<{
    name: string;
    intervalMs?: number | null;
    latest?: {
      status?: string | null;
      startedAt?: string | null;
      finishedAt?: string | null;
      error?: string | null;
    } | null;
  }>;
};

export const cockpitQueryKeys = {
  challenges: ["challenges"] as const,
  syncStatus: ["cockpit", "sync-status"] as const,
};

export const COCKPIT_SYNC_STATUS_REFRESH_MS = 60_000;

type CockpitPollScheduler = {
  setInterval: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof globalThis.setInterval>;
  clearInterval: (handle: ReturnType<typeof globalThis.setInterval>) => void;
};

type CockpitPollState = {
  subscribers: number;
  handle: ReturnType<typeof globalThis.setInterval>;
  scheduler: CockpitPollScheduler;
};

const defaultCockpitPollScheduler: CockpitPollScheduler = {
  setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
  clearInterval: (handle) => globalThis.clearInterval(handle),
};

const syncStatusPollers = new WeakMap<QueryClient, CockpitPollState>();

export function subscribeCockpitSyncStatusPolling(
  queryClient: QueryClient,
  scheduler: CockpitPollScheduler = defaultCockpitPollScheduler
): () => void {
  const existing = syncStatusPollers.get(queryClient);
  if (existing) {
    existing.subscribers += 1;
  } else {
    const handle = scheduler.setInterval(() => {
      void queryClient.refetchQueries({
        queryKey: cockpitQueryKeys.syncStatus,
        exact: true,
        type: "active",
      });
    }, COCKPIT_SYNC_STATUS_REFRESH_MS);
    syncStatusPollers.set(queryClient, {
      subscribers: 1,
      handle,
      scheduler,
    });
  }

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    const state = syncStatusPollers.get(queryClient);
    if (!state) return;
    state.subscribers -= 1;
    if (state.subscribers > 0) return;
    state.scheduler.clearInterval(state.handle);
    syncStatusPollers.delete(queryClient);
  };
}

export function cockpitChallengesQueryOptions() {
  return queryOptions({
    queryKey: cockpitQueryKeys.challenges,
    queryFn: () => api.get<CockpitChallenge[]>("/api/challenges"),
  });
}

export function cockpitSyncStatusQueryOptions() {
  return queryOptions({
    queryKey: cockpitQueryKeys.syncStatus,
    queryFn: () =>
      api.get<CockpitSyncStatusResponse>("/api/cockpit/sync/status"),
    staleTime: COCKPIT_SYNC_STATUS_REFRESH_MS,
  });
}

export function useCockpitChallengesQuery() {
  return useQuery(cockpitChallengesQueryOptions());
}

export function useCockpitSyncStatusQuery() {
  const queryClient = useQueryClient();
  useEffect(
    () => subscribeCockpitSyncStatusPolling(queryClient),
    [queryClient]
  );
  return useQuery(cockpitSyncStatusQueryOptions());
}
