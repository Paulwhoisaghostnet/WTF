import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  BoardThread,
  ContractLogStatus,
  DesktopAppsResponse,
  InAppMarketAdminResponse,
  RewardLedgerFilter,
  RolePermissionMatrix,
  StudioDriveStatus,
  WtfTvResponse,
} from "./types";

type UseAdminDataQueriesArgs = {
  activeTab: number;
  ledgerFilter: RewardLedgerFilter;
  contractLogStatus: ContractLogStatus;
  contractLogSearch: string;
  expandedChallenge: number | null;
  expandedQuest: number | null;
};

export function useAdminDataQueries({
  activeTab,
  ledgerFilter,
  contractLogStatus,
  contractLogSearch,
  expandedChallenge,
  expandedQuest,
}: UseAdminDataQueriesArgs) {
  const statsQuery = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<any>("/api/admin/stats"),
  });

  const allUsersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<any[]>("/api/admin/users"),
  });

  const allSeasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.get<any[]>("/api/seasons"),
  });

  const allRoundsQuery = useQuery({
    queryKey: ["rounds"],
    queryFn: () => api.get<any[]>("/api/rounds"),
  });

  const allChallengesQuery = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<any[]>("/api/challenges"),
  });

  const allSideQuestsQuery = useQuery({
    queryKey: ["side-quests"],
    queryFn: () => api.get<any[]>("/api/side-quests"),
  });

  const boardThreadsQuery = useQuery({
    queryKey: ["admin", "message-board", "threads"],
    queryFn: () => api.get<BoardThread[]>("/api/messages/threads"),
  });

  const allLinksQuery = useQuery({
    queryKey: ["links"],
    queryFn: () => api.get<any[]>("/api/links"),
  });

  const allFaqQuery = useQuery({
    queryKey: ["faq"],
    queryFn: () => api.get<any[]>("/api/faq"),
  });

  const xpLogQuery = useQuery({
    queryKey: ["admin", "xp-log"],
    queryFn: () => api.get<any[]>("/api/admin/xp/events?limit=200"),
    enabled: activeTab === 7,
  });

  const rewardLedgerQuery = useQuery({
    queryKey: ["admin", "reward-ledger", ledgerFilter],
    queryFn: () =>
      api.get<any[]>(
        `/api/admin/reward-ledger${ledgerFilter === "all" ? "" : `?paid=${ledgerFilter === "paid"}`}`
      ),
    enabled: activeTab === 8,
  });

  const desktopAppsQuery = useQuery({
    queryKey: ["admin", "desktop-apps"],
    queryFn: () =>
      api.get<DesktopAppsResponse>("/api/admin/apps/desktop"),
    enabled: activeTab === 9,
  });

  const inAppMarketQuery = useQuery({
    queryKey: ["admin", "in-app-market", "items"],
    queryFn: () =>
      api.get<InAppMarketAdminResponse>("/api/admin/in-app-market/items"),
    enabled: activeTab === 15,
  });

  const contractActivityLogQuery = useQuery({
    queryKey: ["admin", "contract-activity", contractLogStatus, contractLogSearch],
    queryFn: () =>
      api.get<any[]>(
        `/api/admin/contract-activity?limit=500${
          contractLogStatus === "all" ? "" : `&status=${contractLogStatus}`
        }${contractLogSearch ? `&q=${encodeURIComponent(contractLogSearch)}` : ""}`
      ),
    enabled: activeTab === 10,
  });

  const wtfSubdomainGrantsQuery = useQuery({
    queryKey: ["admin", "wtf-subdomains"],
    queryFn: () => api.get<any[]>("/api/admin/wtf-subdomains"),
    enabled: activeTab === 14,
  });

  const rolePermsQuery = useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: () =>
      api.get<RolePermissionMatrix>("/api/admin/permissions"),
    enabled: activeTab === 11,
  });

  const wtfTvDataQuery = useQuery({
    queryKey: ["admin", "wtf-tv"],
    queryFn: () => api.get<WtfTvResponse>("/api/admin/wtf-tv"),
    enabled: activeTab === 12,
  });

  const studioDriveQuery = useQuery({
    queryKey: ["admin", "studio-drive"],
    queryFn: () => api.get<StudioDriveStatus>("/api/studio/admin/drive/status"),
    enabled: activeTab === 13,
  });

  const expandedChallengeQuery = useQuery({
    queryKey: ["challenges", expandedChallenge],
    queryFn: () => api.get<any>(`/api/challenges/${expandedChallenge}`),
    enabled: expandedChallenge !== null,
  });

  const expandedQuestQuery = useQuery({
    queryKey: ["side-quests", expandedQuest],
    queryFn: () => api.get<any>(`/api/side-quests/${expandedQuest}`),
    enabled: expandedQuest !== null,
  });

  return {
    stats: statsQuery.data,
    allUsers: allUsersQuery.data,
    allSeasons: allSeasonsQuery.data,
    allRounds: allRoundsQuery.data,
    allChallenges: allChallengesQuery.data,
    allSideQuests: allSideQuestsQuery.data,
    boardThreads: boardThreadsQuery.data,
    allLinks: allLinksQuery.data,
    allFaq: allFaqQuery.data,
    xpLog: xpLogQuery.data,
    rewardLedger: rewardLedgerQuery.data,
    desktopApps: desktopAppsQuery.data,
    inAppMarketItems: inAppMarketQuery.data?.items,
    contractActivityLog: contractActivityLogQuery.data,
    loadingContractActivityLog: contractActivityLogQuery.isLoading,
    wtfSubdomainGrants: wtfSubdomainGrantsQuery.data,
    rolePerms: rolePermsQuery.data,
    wtfTvData: wtfTvDataQuery.data,
    studioDrive: studioDriveQuery.data,
    refetchStudioDrive: studioDriveQuery.refetch,
    expandedChallengeData: expandedChallengeQuery.data,
    expandedQuestData: expandedQuestQuery.data,
  };
}
