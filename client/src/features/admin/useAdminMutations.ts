import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  ApproveCompletionPayload,
  AwardXpPayload,
  ClearUserSocialPayload,
  DesktopAppUpdatePayload,
  EntityUpdatePayload,
  GradeSubmissionPayload,
  GrantWtfSubdomainPayload,
  ModerateConsoleGamePayload,
  ModerateConsoleReportPayload,
  ModerateBoardThreadPayload,
  ResetPermissionPayload,
  RewardLedgerBatchPayPayload,
  RewardLedgerPayPayload,
  SetTempPasswordPayload,
  StudioDriveQuotaResponse,
  StudioDriveStartResponse,
  SubmissionRewardPayload,
  TempPasswordResult,
  TempPasswordResponse,
  TogglePermissionPayload,
  UpdateInAppMarketItemPayload,
  UpdateIdentityPayload,
  UpdateRolePayload,
  UpdateWtfSubdomainStatusPayload,
} from "./types";

type UseAdminMutationsArgs = {
  studioDriveAccountEmail?: string | null;
  refetchStudioDrive: () => unknown;
  expandedChallenge: number | null;
  expandedQuest: number | null;
  clearLedgerBatchSelection: () => void;
  recordTempPasswordResult: (
    userId: number,
    result: TempPasswordResult | null
  ) => void;
  resetTempPasswordInput: (userId: number) => void;
  resetSubdomainGrantForm: () => void;
  resetSeasonForm: () => void;
  clearEditingSeason: () => void;
  resetRoundForm: () => void;
  clearEditingRound: () => void;
  resetChallengeForm: () => void;
  clearEditingChallenge: () => void;
  resetQuestForm: () => void;
  clearEditingQuest: () => void;
  resetLinkForm: () => void;
  clearEditingLink: () => void;
  resetFaqForm: () => void;
  clearEditingFaq: () => void;
};

export function useAdminMutations({
  studioDriveAccountEmail,
  refetchStudioDrive,
  expandedChallenge,
  expandedQuest,
  clearLedgerBatchSelection,
  recordTempPasswordResult,
  resetTempPasswordInput,
  resetSubdomainGrantForm,
  resetSeasonForm,
  clearEditingSeason,
  resetRoundForm,
  clearEditingRound,
  resetChallengeForm,
  clearEditingChallenge,
  resetQuestForm,
  clearEditingQuest,
  resetLinkForm,
  clearEditingLink,
  resetFaqForm,
  clearEditingFaq,
}: UseAdminMutationsArgs) {
  const qc = useQueryClient();

  const markPaidMutation = useMutation({
    mutationFn: ({ id, opHash }: RewardLedgerPayPayload) =>
      api.put(`/api/admin/reward-ledger/${id}/pay`, { opHash }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reward-ledger"] });
    },
  });

  const batchPayMutation = useMutation({
    mutationFn: ({ ids, opHash }: RewardLedgerBatchPayPayload) =>
      api.put("/api/admin/reward-ledger/batch-pay", { ids, opHash }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reward-ledger"] });
      clearLedgerBatchSelection();
    },
  });

  const updateDesktopAppMutation = useMutation({
    mutationFn: ({ appKey, enabled }: DesktopAppUpdatePayload) =>
      api.put(`/api/admin/apps/desktop/${appKey}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "desktop-apps"] });
      qc.invalidateQueries({ queryKey: ["desktop", "apps"] });
    },
  });

  const updateInAppMarketItemMutation = useMutation({
    mutationFn: ({ id, ...data }: UpdateInAppMarketItemPayload) =>
      api.patch(`/api/admin/in-app-market/items/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "in-app-market", "items"] });
      qc.invalidateQueries({ queryKey: ["wtfiam"] });
    },
  });

  const moderateConsoleGameMutation = useMutation({
    mutationFn: ({ slug, action, reason }: ModerateConsoleGamePayload) =>
      api.post(`/api/arcade/admin/games/${slug}/${action}`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "console", "moderation"] });
      qc.invalidateQueries({ queryKey: ["console", "catalog"] });
    },
  });

  const importSourceArcadeMutation = useMutation({
    mutationFn: () => api.post("/api/arcade/admin/source-import", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "console", "moderation"] });
      qc.invalidateQueries({ queryKey: ["arcade", "catalog"] });
    },
  });

  const moderateConsoleReportMutation = useMutation({
    mutationFn: ({ id, action, note }: ModerateConsoleReportPayload) =>
      api.post(`/api/arcade/admin/reports/${id}/${action}`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "console", "reports"] });
      qc.invalidateQueries({ queryKey: ["admin", "console", "moderation"] });
    },
  });

  const togglePermMutation = useMutation({
    mutationFn: (data: TogglePermissionPayload) =>
      api.put("/api/admin/permissions", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "permissions"] }),
  });

  const resetPermMutation = useMutation({
    mutationFn: (data: ResetPermissionPayload) =>
      api.post("/api/admin/permissions/reset", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "permissions"] }),
  });

  const wtfUpdateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api.put("/api/admin/wtf-tv", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "wtf-tv"] }),
  });

  const wtfInitMutation = useMutation({
    mutationFn: () => api.post("/api/admin/wtf-tv/initialize", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "wtf-tv"] }),
  });

  const wtfRefreshMutation = useMutation({
    mutationFn: () => api.post("/api/admin/wtf-tv/refresh", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "wtf-tv"] }),
  });

  const studioDriveConnectMutation = useMutation({
    mutationFn: () =>
      api.post<StudioDriveStartResponse>(
        "/api/studio/admin/drive/start",
        {
          loginHint: studioDriveAccountEmail ?? undefined,
        }
      ),
    onSuccess: (data) => {
      if (data.authorizeUrl) {
        window.open(data.authorizeUrl, "_blank", "noopener");
      }
    },
  });

  const studioDriveDisconnectMutation = useMutation({
    mutationFn: () => api.post("/api/studio/admin/drive/disconnect", {}),
    onSuccess: () => {
      refetchStudioDrive();
    },
  });

  const studioDriveRefreshQuotaMutation = useMutation({
    mutationFn: () =>
      api.post<StudioDriveQuotaResponse>(
        "/api/studio/admin/drive/refresh-quota",
        {}
      ),
    onSuccess: () => {
      refetchStudioDrive();
    },
  });

  const studioDriveRootFolderMutation = useMutation({
    mutationFn: (rootFolderId: string | null) =>
      api.post("/api/studio/admin/drive/root-folder", { rootFolderId }),
    onSuccess: () => {
      refetchStudioDrive();
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: UpdateRolePayload) =>
      api.put(`/api/admin/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const awardXpMutation = useMutation({
    mutationFn: ({ id, amount, reason }: AwardXpPayload) =>
      api.post(`/api/admin/users/${id}/xp`, { amount, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const updateIdentityMutation = useMutation({
    mutationFn: ({ id, username, displayName }: UpdateIdentityPayload) =>
      api.put(`/api/admin/users/${id}/profile`, { username, displayName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const clearUserSocialMutation = useMutation({
    mutationFn: ({ id, provider }: ClearUserSocialPayload) =>
      api.delete(`/api/admin/users/${id}/social/${provider}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["profile-social"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const setTempPasswordMutation = useMutation({
    mutationFn: ({ id, password, expiryHours }: SetTempPasswordPayload) =>
      api.post<TempPasswordResponse>(
        `/api/admin/users/${id}/temp-password`,
        { password: password || undefined, expiryHours }
      ),
    onSuccess: (data, vars) => {
      recordTempPasswordResult(vars.id, {
        password: data.password,
        expiresAt: data.expiresAt,
      });
      resetTempPasswordInput(vars.id);
    },
  });

  const clearTempPasswordMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/users/${id}/temp-password`),
    onSuccess: (_data, id) => {
      recordTempPasswordResult(id, null);
    },
  });

  const grantWtfSubdomainMutation = useMutation({
    mutationFn: ({ userId, label, notes }: GrantWtfSubdomainPayload) =>
      api.post(`/api/admin/users/${userId}/wtf-subdomains`, { label, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "wtf-subdomains"] });
      resetSubdomainGrantForm();
    },
  });

  const updateWtfSubdomainStatusMutation = useMutation({
    mutationFn: ({ id, status, opHash }: UpdateWtfSubdomainStatusPayload) =>
      api.patch(`/api/admin/wtf-subdomains/${id}/status`, { status, opHash }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "wtf-subdomains"] }),
  });

  const createSeasonMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/seasons", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      resetSeasonForm();
    },
  });

  const updateSeasonMutation = useMutation({
    mutationFn: ({ id, data }: EntityUpdatePayload) => api.put(`/api/seasons/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      clearEditingSeason();
    },
  });

  const deleteSeasonMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/seasons/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const createRoundMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/rounds", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      resetRoundForm();
    },
  });

  const updateRoundMutation = useMutation({
    mutationFn: ({ id, data }: EntityUpdatePayload) => api.put(`/api/rounds/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      clearEditingRound();
    },
  });

  const deleteRoundMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/rounds/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const createChallengeMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/challenges", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      resetChallengeForm();
    },
  });

  const updateChallengeMutation = useMutation({
    mutationFn: ({ id, data }: EntityUpdatePayload) => api.put(`/api/challenges/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      clearEditingChallenge();
    },
  });

  const gradeSubmissionMutation = useMutation({
    mutationFn: ({ id, grade, feedback }: GradeSubmissionPayload) =>
      api.put(`/api/submissions/${id}/grade`, { grade, feedback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", expandedChallenge] });
    },
  });

  const markRewardMutation = useMutation({
    mutationFn: ({ id, opHash }: SubmissionRewardPayload) =>
      api.put(`/api/submissions/${id}/reward`, { opHash }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", expandedChallenge] });
    },
  });

  const createQuestMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/side-quests", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      resetQuestForm();
    },
  });

  const updateQuestMutation = useMutation({
    mutationFn: ({ id, data }: EntityUpdatePayload) => api.put(`/api/side-quests/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests"] });
      clearEditingQuest();
    },
  });

  const approveCompletionMutation = useMutation({
    mutationFn: ({ id, approved }: ApproveCompletionPayload) =>
      api.put(`/api/side-quest-completions/${id}/approve`, { approved }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests", expandedQuest] });
    },
  });

  const moderateBoardThreadMutation = useMutation({
    mutationFn: ({ id, payload }: ModerateBoardThreadPayload) =>
      api.put(`/api/messages/threads/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "message-board", "threads"] });
      qc.invalidateQueries({ queryKey: ["messages", "threads"] });
    },
  });

  const deleteBoardThreadMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/messages/threads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "message-board", "threads"] });
      qc.invalidateQueries({ queryKey: ["messages", "threads"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const createLinkMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/links", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      resetLinkForm();
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: ({ id, data }: EntityUpdatePayload) => api.put(`/api/links/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      clearEditingLink();
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/links/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const createFaqMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/faq", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      resetFaqForm();
    },
  });

  const updateFaqMutation = useMutation({
    mutationFn: ({ id, data }: EntityUpdatePayload) => api.put(`/api/faq/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      clearEditingFaq();
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/faq/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  return {
    markPaidMutation,
    batchPayMutation,
    updateDesktopAppMutation,
    updateInAppMarketItemMutation,
    moderateConsoleGameMutation,
    importSourceArcadeMutation,
    moderateConsoleReportMutation,
    togglePermMutation,
    resetPermMutation,
    wtfUpdateMutation,
    wtfInitMutation,
    wtfRefreshMutation,
    studioDriveConnectMutation,
    studioDriveDisconnectMutation,
    studioDriveRefreshQuotaMutation,
    studioDriveRootFolderMutation,
    updateRoleMutation,
    awardXpMutation,
    updateIdentityMutation,
    clearUserSocialMutation,
    deleteUserMutation,
    setTempPasswordMutation,
    clearTempPasswordMutation,
    grantWtfSubdomainMutation,
    updateWtfSubdomainStatusMutation,
    createSeasonMutation,
    updateSeasonMutation,
    deleteSeasonMutation,
    createRoundMutation,
    updateRoundMutation,
    deleteRoundMutation,
    createChallengeMutation,
    updateChallengeMutation,
    gradeSubmissionMutation,
    markRewardMutation,
    createQuestMutation,
    updateQuestMutation,
    approveCompletionMutation,
    moderateBoardThreadMutation,
    deleteBoardThreadMutation,
    createLinkMutation,
    updateLinkMutation,
    deleteLinkMutation,
    createFaqMutation,
    updateFaqMutation,
    deleteFaqMutation,
  };
}
