import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  WCapabilityResponse,
  WGroupchatResponse,
  WTimelineResponse,
  WView,
} from "./types";

type UseWDataQueriesArgs = {
  activeView: WView;
};

// X DM endpoints are heavily rate-limited (often 1 request / 15 min on
// Pay-Per-Use). When the server reports a `rateLimitedUntil` epoch ms, the
// client pauses polling until the window passes, then resumes at normal cadence.
function makeRateLimitedRefetchInterval(baseIntervalMs: number) {
  const MAX_BACKOFF_MS = 30 * 60_000;
  return (query: { state: { data?: { rateLimitedUntil?: number | null } | undefined } }): number | false => {
    const data = query?.state?.data;
    const rateLimitedUntil = Number(data?.rateLimitedUntil || 0);
    if (rateLimitedUntil > Date.now()) {
      return Math.min(MAX_BACKOFF_MS, Math.max(baseIntervalMs, rateLimitedUntil - Date.now() + 1_000));
    }
    return baseIntervalMs;
  };
}

export function useWDataQueries(args: UseWDataQueriesArgs) {
  const { activeView } = args;

  const timelineQuery = useQuery({
    queryKey: ["w", "timeline"],
    queryFn: () => api.get<WTimelineResponse>("/api/w/timeline"),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const capabilitiesQuery = useQuery({
    queryKey: ["w", "capabilities"],
    queryFn: () => api.get<WCapabilityResponse>("/api/w/capabilities"),
    staleTime: 60_000,
  });

  const capabilities = capabilitiesQuery.data;

  const groupchatQuery = useQuery({
    queryKey: ["w", "groupchat"],
    queryFn: () => api.get<WGroupchatResponse>("/api/w/groupchat"),
    enabled: Boolean(capabilities) && capabilities?.mode !== "digest",
    staleTime: 5 * 60_000,
    refetchInterval:
      activeView === "messages"
        ? makeRateLimitedRefetchInterval(120_000)
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  return {
    timelineQuery,
    capabilitiesQuery,
    capabilities,
    groupchatQuery,
  };
}
