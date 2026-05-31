import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  WAdminStreamRulesPutResponse,
  WAdminStreamRulesResponse,
} from "./types";

export type SaveStreamRulesInput = {
  handles: string[];
  expectedUpdatedAt?: string | null;
};

export function useWAdminStreamRules(enabled: boolean) {
  return useQuery({
    queryKey: ["w", "admin", "stream-rules"],
    enabled,
    queryFn: () => api.get<WAdminStreamRulesResponse>("/api/w/admin/stream-rules"),
  });
}

export function useSaveStreamRulesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveStreamRulesInput) =>
      api.put<WAdminStreamRulesPutResponse>("/api/w/admin/stream-rules", {
        handles: input.handles,
        expectedUpdatedAt: input.expectedUpdatedAt ?? undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["w", "admin", "stream-rules"] });
      void queryClient.invalidateQueries({ queryKey: ["w", "capabilities"] });
    },
  });
}

export type SaveGroupchatSelectionInput = {
  conversationIds: string[];
  expectedUpdatedAt?: string | null;
};

export function useSaveGroupchatSelectionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveGroupchatSelectionInput) =>
      api.put<{
        ok: boolean;
        conversationIds: string[];
        updatedAt?: string;
      }>("/api/w/admin/groupchat", {
        conversationIds: input.conversationIds,
        expectedUpdatedAt: input.expectedUpdatedAt ?? undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["w", "groupchat"] });
      void queryClient.invalidateQueries({ queryKey: ["w", "capabilities"] });
    },
  });
}
