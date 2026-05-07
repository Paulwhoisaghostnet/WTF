import { api } from "../../lib/api";
import type {
  CreatorScoreResult,
  MarketPulse,
  TezosIntelSource,
} from "@shared/tezos-intel";

export interface TezosIntelSourcesResponse {
  sources: TezosIntelSource[];
  importCommands: string[];
}

export interface CreatorCompareResponse {
  creators: CreatorScoreResult[];
}

export function fetchTezosIntelSources() {
  return api.get<TezosIntelSourcesResponse>("/api/tezos-intel/sources");
}

export function fetchCreatorScore(address: string) {
  return api.get<CreatorScoreResult>(
    `/api/tezos-intel/creator/${encodeURIComponent(address)}`
  );
}

export function fetchCreatorCompare(addresses: string[]) {
  const query = new URLSearchParams({ addresses: addresses.join(",") });
  return api.get<CreatorCompareResponse>(`/api/tezos-intel/compare?${query}`);
}

export function fetchMarketPulse(windowDays = 30) {
  const query = new URLSearchParams({ windowDays: String(windowDays) });
  return api.get<MarketPulse>(`/api/tezos-intel/market-pulse?${query}`);
}
