import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface MastodonAccountInfo {
  id: number;
  instanceUrl: string;
  handle: string | null;
  displayName: string | null;
  linkedAt: string;
}

export interface MastodonPreferences {
  showInFeed: boolean;
  autoCrosspost: boolean;
}

export interface MastodonToot {
  id: string;
  content: string;
  created_at: string;
  url: string;
  account: {
    id: string;
    username: string;
    display_name: string;
    avatar: string;
  };
  media_attachments: { url: string; type: string }[];
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
}

export interface TimelineResult {
  toots: MastodonToot[];
  fromCache: boolean;
  linkedAt: string | null;
}

export function useMastodonAccount() {
  return useQuery({
    queryKey: ["mastodon", "account"],
    queryFn: () => api.get<MastodonAccountInfo | null>("/api/mastodon/account"),
  });
}

export function useMastodonTimeline(limit = 20) {
  return useQuery({
    queryKey: ["mastodon", "timeline", limit],
    queryFn: () => api.get<TimelineResult>(`/api/mastodon/timeline?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMastodonPreferences() {
  return useQuery({
    queryKey: ["mastodon", "preferences"],
    queryFn: () => api.get<MastodonPreferences>("/api/mastodon/preferences"),
  });
}

export function useLinkMastodon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { instanceUrl: string; accessToken: string }) =>
      api.post<{ ok: boolean; handle: string }>("/api/mastodon/link", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mastodon"] });
    },
  });
}

export function useUnlinkMastodon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete("/api/mastodon/link"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mastodon"] });
    },
  });
}

export function useUpdateMastodonPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<MastodonPreferences>) =>
      api.put<MastodonPreferences>("/api/mastodon/preferences", prefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mastodon", "preferences"] });
    },
  });
}

export function usePostToot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { status: string; visibility?: string }) =>
      api.post<MastodonToot>("/api/mastodon/toot", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mastodon", "timeline"] });
    },
  });
}
