import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  TwitterOAuth2Diagnostics,
  WAdminDmConversationsResponse,
  WAdminStreamRulesResponse,
  WAdminStreamStatusResponse,
  WCapabilityResponse,
  WFollowsListResponse,
  WFollowsSummaryResponse,
  WGroupchatResponse,
  WSpacesResponse,
  WTimelineResponse,
  WView,
} from "./types";

type UseWDataQueriesArgs = {
  activeView: WView;
  followListType: "followers" | "following";
  followListRequested: boolean;
  userRole?: string | null;
  hasPermission: (permission: string) => boolean;
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
  const {
    activeView,
    followListType,
    followListRequested,
    userRole,
    hasPermission,
  } = args;

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
  const canUseWAdminControls = Boolean(
    userRole === "admin" ||
      (capabilities?.canUseAdminControls &&
        hasPermission("access_admin_panel") &&
        hasPermission("manage_roles"))
  );

  const followsSummaryQuery = useQuery({
    queryKey: ["w", "follows", "summary"],
    queryFn: () => api.get<WFollowsSummaryResponse>("/api/w/follows/summary"),
    enabled: false,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const followsListQuery = useQuery({
    queryKey: ["w", "follows", followListType],
    queryFn: () => api.get<WFollowsListResponse>(`/api/w/follows?type=${followListType}&limit=100`),
    enabled: false,
    retry: false,
    staleTime: 60_000,
  });

  const groupchatQuery = useQuery({
    queryKey: ["w", "groupchat"],
    queryFn: () => api.get<WGroupchatResponse>("/api/w/groupchat"),
    enabled: Boolean(capabilities),
    staleTime: 5 * 60_000,
    refetchInterval:
      activeView === "messages"
        ? makeRateLimitedRefetchInterval(120_000)
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const adminDmConversationsQuery = useQuery({
    queryKey: ["w", "admin", "dm-conversations"],
    queryFn: () =>
      api.get<WAdminDmConversationsResponse>("/api/w/admin/dm-conversations?limit=100"),
    enabled: Boolean(
      canUseWAdminControls &&
        capabilities?.platformAccountConfigured
    ),
    retry: false,
    staleTime: 60_000,
  });

  const oauthDiagnosticsQuery = useQuery<TwitterOAuth2Diagnostics>({
    queryKey: ["auth", "twitter-oauth2", "diagnostics"],
    queryFn: () =>
      api.get<TwitterOAuth2Diagnostics>("/api/auth/twitter-oauth2/diagnostics"),
    enabled: activeView === "settings" && canUseWAdminControls,
    retry: false,
    staleTime: 30_000,
  });

  const adminStreamRulesQuery = useQuery({
    queryKey: ["w", "admin", "stream-rules"],
    queryFn: () => api.get<WAdminStreamRulesResponse>("/api/w/admin/stream-rules"),
    enabled: activeView === "settings" && canUseWAdminControls,
    retry: false,
    staleTime: 30_000,
  });

  const adminStreamStatusQuery = useQuery({
    queryKey: ["w", "admin", "stream-status"],
    queryFn: () => api.get<WAdminStreamStatusResponse>("/api/w/admin/stream-status"),
    enabled: activeView === "settings" && canUseWAdminControls,
    retry: false,
    staleTime: 10_000,
    refetchInterval: activeView === "settings" && canUseWAdminControls ? 10_000 : false,
  });

  const dmDiagnosticsQuery = useQuery({
    queryKey: ["w", "dm-diagnostics"],
    queryFn: () => api.get<any>("/api/w/dm-diagnostics"),
    // Diagnostics intentionally bypass the cache: each admin-triggered run hits X directly.
    enabled: false,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const spacesQuery = useQuery({
    queryKey: ["w", "spaces"],
    queryFn: () => api.get<WSpacesResponse>("/api/w/spaces"),
    enabled: false,
    retry: false,
    staleTime: 60_000,
  });

  return {
    timelineQuery,
    capabilitiesQuery,
    capabilities,
    canUseWAdminControls,
    followsSummaryQuery,
    followsListQuery,
    groupchatQuery,
    adminDmConversationsQuery,
    oauthDiagnosticsQuery,
    adminStreamRulesQuery,
    adminStreamStatusQuery,
    dmDiagnosticsQuery,
    spacesQuery,
  };
}
