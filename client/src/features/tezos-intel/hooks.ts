import { useQuery } from "@tanstack/react-query";

import {
  fetchCreatorCompare,
  fetchCreatorScore,
  fetchMarketPulse,
  fetchTezosIntelSources,
} from "./api";

export function useTezosIntelSources() {
  return useQuery({
    queryKey: ["/api/tezos-intel/sources"],
    queryFn: fetchTezosIntelSources,
  });
}

export function useCreatorScore(address: string) {
  const normalized = address.trim();
  return useQuery({
    queryKey: ["/api/tezos-intel/creator", normalized],
    queryFn: () => fetchCreatorScore(normalized),
    enabled: normalized.length > 0,
  });
}

export function useCreatorCompare(addresses: string[]) {
  const normalized = addresses.map((a) => a.trim()).filter(Boolean).slice(0, 8);
  return useQuery({
    queryKey: ["/api/tezos-intel/compare", normalized],
    queryFn: () => fetchCreatorCompare(normalized),
    enabled: normalized.length > 0,
  });
}

export function useMarketPulse(windowDays = 30) {
  return useQuery({
    queryKey: ["/api/tezos-intel/market-pulse", windowDays],
    queryFn: () => fetchMarketPulse(windowDays),
  });
}
