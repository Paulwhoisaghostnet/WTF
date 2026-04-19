import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Select,
  Tabs,
  Tab,
  TabBody,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Hourglass,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UserLink } from "../components/UserLink";
import { WalletDossier } from "../components/WalletDossier";
import { api } from "../lib/api";
import {
  DESKTOP_APP_LABELS,
  type DesktopAppKey,
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  CATEGORY_LABELS,
  ROLE_ORDER,
  ROLE_LABELS,
  type UserRole,
  type PermissionKey,
  type PermissionCategory,
} from "@shared/types";

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const SubSection = styled.div`
  margin-top: 12px;
  padding: 8px;
  border: 1px solid #888;
  background: #fff;
`;

type BoardThread = {
  id: number;
  title: string;
  body?: string;
  creatorDisplayName?: string | null;
  creatorUsername?: string | null;
  pinned: boolean;
  locked: boolean;
  expired: boolean;
  active?: boolean;
  replyCount: number;
  createdAt: string;
};

const ROLE_OPTIONS = [
  { label: "Admin", value: "admin" },
  { label: "Host", value: "host" },
  { label: "Cohost", value: "cohost" },
  { label: "Resident Wizard", value: "resident_wizard" },
  { label: "Contestant", value: "contestant" },
  { label: "Witness", value: "witness" },
];

const SEASON_STATUS_OPTIONS = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

const ROUND_STATUS_OPTIONS = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Active", value: "active" },
  { label: "Grading", value: "grading" },
  { label: "Completed", value: "completed" },
];

const CHALLENGE_STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Grading", value: "grading" },
  { label: "Completed", value: "completed" },
];

const QUEST_STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

const GRADE_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "Bonus", value: "bonus" },
];

const AUTO_VERIFY_OPTIONS = [
  { label: "Manual (host reviews)", value: "manual" },
  { label: "Profile Avatar set", value: "profile_avatar" },
  { label: "Profile Bio set", value: "profile_bio" },
  { label: "Wallet Connected", value: "wallet_connected" },
  { label: "Twitter/X Linked", value: "social_twitter" },
  { label: "Discord Linked", value: "social_discord" },
  { label: "Posted in Message Board", value: "post_message" },
];

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  size = "sm",
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  size?: "sm" | "lg";
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <ActionRow>
        <Button size={size} onClick={onConfirm} disabled={disabled}>
          {confirmLabel || `Yes, ${label}`}
        </Button>
        <Button size={size} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </ActionRow>
    );
  }
  return (
    <Button size={size} onClick={() => setConfirming(true)} disabled={disabled}>
      {label}
    </Button>
  );
}

export function Admin() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);

  // ─── Shared data queries ───────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<any>("/api/admin/stats"),
  });

  const { data: allUsers } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<any[]>("/api/admin/users"),
  });

  const { data: allSeasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.get<any[]>("/api/seasons"),
  });

  const { data: allRounds } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => api.get<any[]>("/api/rounds"),
  });

  const { data: allChallenges } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => api.get<any[]>("/api/challenges"),
  });

  const { data: allSideQuests } = useQuery({
    queryKey: ["side-quests"],
    queryFn: () => api.get<any[]>("/api/side-quests"),
  });

  const { data: boardThreads } = useQuery({
    queryKey: ["admin", "message-board", "threads"],
    queryFn: () => api.get<BoardThread[]>("/api/messages/threads"),
  });

  const { data: allLinks } = useQuery({
    queryKey: ["links"],
    queryFn: () => api.get<any[]>("/api/links"),
  });

  const { data: allFaq } = useQuery({
    queryKey: ["faq"],
    queryFn: () => api.get<any[]>("/api/faq"),
  });

  const [xpLogUserFilter, setXpLogUserFilter] = useState("");
  const { data: xpLog } = useQuery({
    queryKey: ["admin", "xp-log"],
    queryFn: () => api.get<any[]>("/api/admin/xp/events?limit=200"),
    enabled: activeTab === 7,
  });

  const [ledgerFilter, setLedgerFilter] = useState<"all" | "unpaid" | "paid">("unpaid");
  const { data: rewardLedger } = useQuery({
    queryKey: ["admin", "reward-ledger", ledgerFilter],
    queryFn: () =>
      api.get<any[]>(
        `/api/admin/reward-ledger${ledgerFilter === "all" ? "" : `?paid=${ledgerFilter === "paid"}`}`
      ),
    enabled: activeTab === 8,
  });

  const [selectedLedgerIds, setSelectedLedgerIds] = useState<Set<number>>(new Set());
  const [batchOpHash, setBatchOpHash] = useState("");

  const { data: desktopApps } = useQuery({
    queryKey: ["admin", "desktop-apps"],
    queryFn: () =>
      api.get<{
        apps: Record<DesktopAppKey, boolean>;
        list: Array<{ key: DesktopAppKey; enabled: boolean }>;
      }>("/api/admin/apps/desktop"),
    enabled: activeTab === 9,
  });

  const [contractLogStatus, setContractLogStatus] = useState<
    "all" | "attempt" | "success" | "failure"
  >("all");
  const [contractLogSearch, setContractLogSearch] = useState("");

  const { data: contractActivityLog, isLoading: loadingContractActivityLog } = useQuery({
    queryKey: ["admin", "contract-activity", contractLogStatus, contractLogSearch],
    queryFn: () =>
      api.get<any[]>(
        `/api/admin/contract-activity?limit=500${
          contractLogStatus === "all" ? "" : `&status=${contractLogStatus}`
        }${contractLogSearch ? `&q=${encodeURIComponent(contractLogSearch)}` : ""}`
      ),
    enabled: activeTab === 10,
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id, opHash }: { id: number; opHash?: string }) =>
      api.put(`/api/admin/reward-ledger/${id}/pay`, { opHash }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reward-ledger"] });
    },
  });

  const batchPayMutation = useMutation({
    mutationFn: ({ ids, opHash }: { ids: number[]; opHash?: string }) =>
      api.put("/api/admin/reward-ledger/batch-pay", { ids, opHash }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reward-ledger"] });
      setSelectedLedgerIds(new Set());
      setBatchOpHash("");
    },
  });

  const updateDesktopAppMutation = useMutation({
    mutationFn: ({ appKey, enabled }: { appKey: DesktopAppKey; enabled: boolean }) =>
      api.put(`/api/admin/apps/desktop/${appKey}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "desktop-apps"] });
      qc.invalidateQueries({ queryKey: ["desktop", "apps"] });
    },
  });

  // ─── Permissions ────────────────────────────────────────
  const { data: rolePerms } = useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: () =>
      api.get<Record<UserRole, Record<PermissionKey, boolean>>>(
        "/api/admin/permissions"
      ),
    enabled: activeTab === 11,
  });

  const [permCategoryFilter, setPermCategoryFilter] = useState<PermissionCategory | "">(
    ""
  );

  const togglePermMutation = useMutation({
    mutationFn: (data: {
      role: string;
      permissionKey: string;
      granted: boolean;
    }) => api.put("/api/admin/permissions", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "permissions"] }),
  });

  const resetPermMutation = useMutation({
    mutationFn: (data: { role?: string }) =>
      api.post("/api/admin/permissions/reset", data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "permissions"] }),
  });

  // ─── WTF TV ─────────────────────────────────────────────
  type WtfTvConfig = {
    id: number;
    channelId: number | null;
    enabled: boolean;
    sourceMode: string;
    sourceUserIds: number[];
    sourceWalletAddresses: string[];
    tokensPerWalletPerHour: number;
    defaultDurationSeconds: number;
    playlistSize: number;
    refreshIntervalMinutes: number;
    bumperMode: string;
    selectedBumperIds: number[];
    lastRefreshedAt: string | null;
  };
  type WtfTvResponse = {
    config: WtfTvConfig | null;
    channelTitle: string | null;
    users: Array<{ id: number; username: string; displayName: string | null }>;
    bumpers: Array<{ id: number; title: string; ownerUserId: number; durationMs: number }>;
  };

  const { data: wtfTvData } = useQuery({
    queryKey: ["admin", "wtf-tv"],
    queryFn: () => api.get<WtfTvResponse>("/api/admin/wtf-tv"),
    enabled: activeTab === 12,
  });

  const [wtfSourceMode, setWtfSourceMode] = useState("all_users");
  const [wtfSelectedUsers, setWtfSelectedUsers] = useState<number[]>([]);
  const [wtfWalletInput, setWtfWalletInput] = useState("");
  const [wtfWallets, setWtfWallets] = useState<string[]>([]);
  const [wtfTokensPerWallet, setWtfTokensPerWallet] = useState(5);
  const [wtfDuration, setWtfDuration] = useState(15);
  const [wtfPlaylistSize, setWtfPlaylistSize] = useState(100);
  const [wtfRefreshInterval, setWtfRefreshInterval] = useState(30);
  const [wtfBumperMode, setWtfBumperMode] = useState("community_pool");
  const [wtfSelectedBumpers, setWtfSelectedBumpers] = useState<number[]>([]);
  const [wtfInitialized, setWtfInitialized] = useState(false);

  useEffect(() => {
    if (wtfTvData?.config && !wtfInitialized) {
      const c = wtfTvData.config;
      setWtfSourceMode(c.sourceMode);
      setWtfSelectedUsers(c.sourceUserIds || []);
      setWtfWallets(c.sourceWalletAddresses || []);
      setWtfTokensPerWallet(c.tokensPerWalletPerHour);
      setWtfDuration(c.defaultDurationSeconds);
      setWtfPlaylistSize(c.playlistSize);
      setWtfRefreshInterval(c.refreshIntervalMinutes);
      setWtfBumperMode(c.bumperMode);
      setWtfSelectedBumpers(c.selectedBumperIds || []);
      setWtfInitialized(true);
    }
  }, [wtfTvData, wtfInitialized]);

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

  type StudioDriveStatus = {
    ok: boolean;
    envConfigured: boolean;
    cryptoConfigured: boolean;
    canConnect: boolean;
    configured: boolean;
    connected: boolean;
    accountEmail: string | null;
    scopes: string | null;
    rootFolderId: string | null;
    // Studio's footprint in the platform Drive (bytes + file count).
    // Not a full Drive quota — `drive.file` scope doesn't allow us to
    // see the account's total storage ceiling.
    appUsage: {
      bytes: number | null;
      fileCount: number | null;
      refreshedAt: string | null;
    } | null;
    connectedAt: string | null;
    lastRefreshedAt: string | null;
  };

  const { data: studioDrive, refetch: refetchStudioDrive } = useQuery({
    queryKey: ["admin", "studio-drive"],
    queryFn: () => api.get<StudioDriveStatus>("/api/studio/admin/drive/status"),
    enabled: activeTab === 13,
  });

  const [studioRootInput, setStudioRootInput] = useState("");
  useEffect(() => {
    if (studioDrive) {
      setStudioRootInput(studioDrive.rootFolderId ?? "");
    }
  }, [studioDrive]);

  const studioDriveConnectMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; authorizeUrl: string }>(
        "/api/studio/admin/drive/start",
        {
          loginHint: studioDrive?.accountEmail ?? undefined,
        }
      ),
    onSuccess: (data) => {
      if (data.authorizeUrl) {
        // Open Google's consent screen in a new tab; the callback lives
        // on our own server so nothing else needs to happen here.
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
      api.post<{
        ok: boolean;
        appUsage: { bytes: number; fileCount: number };
      }>("/api/studio/admin/drive/refresh-quota", {}),
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

  // ─── Users mutations ───────────────────────────────────
  const [userSearch, setUserSearch] = useState("");
  const [xpInputs, setXpInputs] = useState<Record<number, { amount: string; reason: string }>>({});
  const [identityInputs, setIdentityInputs] = useState<
    Record<number, { username: string; displayName: string }>
  >({});

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      api.put(`/api/admin/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const awardXpMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: number; amount: number; reason: string }) =>
      api.post(`/api/admin/users/${id}/xp`, { amount, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const updateIdentityMutation = useMutation({
    mutationFn: ({ id, username, displayName }: { id: number; username: string; displayName: string }) =>
      api.put(`/api/admin/users/${id}/profile`, { username, displayName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });

  const clearUserSocialMutation = useMutation({
    mutationFn: ({ id, provider }: { id: number; provider: "twitter" | "discord" }) =>
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

  const [tempPwPanels, setTempPwPanels] = useState<Record<number, boolean>>({});
  const [tempPwInputs, setTempPwInputs] = useState<
    Record<number, { password: string; expiryHours: string }>
  >({});
  const [tempPwResults, setTempPwResults] = useState<
    Record<number, { password: string; expiresAt: string } | null>
  >({});
  const [dossierPanels, setDossierPanels] = useState<Record<number, boolean>>({});

  const setTempPasswordMutation = useMutation({
    mutationFn: ({ id, password, expiryHours }: { id: number; password: string; expiryHours: number }) =>
      api.post<{ ok: boolean; password: string; expiresAt: string; expiryHours: number }>(
        `/api/admin/users/${id}/temp-password`,
        { password: password || undefined, expiryHours }
      ),
    onSuccess: (data, vars) => {
      setTempPwResults((prev) => ({ ...prev, [vars.id]: { password: data.password, expiresAt: data.expiresAt } }));
      setTempPwInputs((prev) => ({ ...prev, [vars.id]: { password: "", expiryHours: "24" } }));
    },
  });

  const clearTempPasswordMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/users/${id}/temp-password`),
    onSuccess: (_data, id) => {
      setTempPwResults((prev) => ({ ...prev, [id]: null }));
    },
  });

  const filteredUsers = (allUsers || []).filter((u: any) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  // ─── Seasons mutations ─────────────────────────────────
  const [seasonForm, setSeasonForm] = useState({ name: "", number: "", description: "" });
  const [editingSeason, setEditingSeason] = useState<any>(null);

  const createSeasonMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/seasons", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setSeasonForm({ name: "", number: "", description: "" });
    },
  });

  const updateSeasonMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/seasons/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      setEditingSeason(null);
    },
  });

  const deleteSeasonMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/seasons/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  // ─── Rounds mutations ──────────────────────────────────
  const [roundForm, setRoundForm] = useState({ seasonId: "", name: "", number: "", description: "", rewardXp: "", rewardEscrowSlug: "" });
  const [editingRound, setEditingRound] = useState<any>(null);

  const createRoundMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/rounds", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setRoundForm({ seasonId: "", name: "", number: "", description: "", rewardXp: "", rewardEscrowSlug: "" });
    },
  });

  const updateRoundMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/rounds/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      setEditingRound(null);
    },
  });

  const deleteRoundMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/rounds/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  // ─── Challenges mutations ──────────────────────────────
  const [challengeForm, setChallengeForm] = useState({ roundId: "", title: "", description: "", criteria: "", rules: "", rewardAmountWtf: "", rewardXp: "", rewardEscrowSlug: "", status: "draft" });
  const [editingChallenge, setEditingChallenge] = useState<any>(null);
  const [expandedChallenge, setExpandedChallenge] = useState<number | null>(null);
  const [gradeForms, setGradeForms] = useState<Record<number, { grade: string; feedback: string }>>({});

  const { data: expandedChallengeData } = useQuery({
    queryKey: ["challenges", expandedChallenge],
    queryFn: () => api.get<any>(`/api/challenges/${expandedChallenge}`),
    enabled: expandedChallenge !== null,
  });

  const createChallengeMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/challenges", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setChallengeForm({ roundId: "", title: "", description: "", criteria: "", rules: "", rewardAmountWtf: "", rewardXp: "", rewardEscrowSlug: "", status: "draft" });
    },
  });

  const updateChallengeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/challenges/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      setEditingChallenge(null);
    },
  });

  const gradeSubmissionMutation = useMutation({
    mutationFn: ({ id, grade, feedback }: { id: number; grade: string; feedback: string }) =>
      api.put(`/api/submissions/${id}/grade`, { grade, feedback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", expandedChallenge] });
    },
  });

  const markRewardMutation = useMutation({
    mutationFn: ({ id, opHash }: { id: number; opHash?: string }) =>
      api.put(`/api/submissions/${id}/reward`, { opHash }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", expandedChallenge] });
    },
  });

  // ─── Side Quests mutations ─────────────────────────────
  const [questForm, setQuestForm] = useState({ title: "", description: "", criteria: "", rewardAmountWtf: "", rewardXp: "", maxCompletions: "", deadline: "", status: "draft", persistent: false, autoVerifyType: "manual" });
  const [editingQuest, setEditingQuest] = useState<any>(null);
  const [expandedQuest, setExpandedQuest] = useState<number | null>(null);

  const { data: expandedQuestData } = useQuery({
    queryKey: ["side-quests", expandedQuest],
    queryFn: () => api.get<any>(`/api/side-quests/${expandedQuest}`),
    enabled: expandedQuest !== null,
  });

  const createQuestMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/side-quests", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setQuestForm({ title: "", description: "", criteria: "", rewardAmountWtf: "", rewardXp: "", maxCompletions: "", deadline: "", status: "draft", persistent: false, autoVerifyType: "manual" });
    },
  });

  const updateQuestMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/side-quests/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests"] });
      setEditingQuest(null);
    },
  });

  const approveCompletionMutation = useMutation({
    mutationFn: ({ id, approved }: { id: number; approved: boolean }) =>
      api.put(`/api/side-quest-completions/${id}/approve`, { approved }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["side-quests", expandedQuest] });
    },
  });

  // ─── Message Board mutations ───────────────────────────
  const moderateBoardThreadMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
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

  // ─── Links mutations ───────────────────────────────────
  const [linkForm, setLinkForm] = useState({ title: "", url: "", description: "", category: "", displayOrder: "0" });
  const [editingLink, setEditingLink] = useState<any>(null);

  const createLinkMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/links", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setLinkForm({ title: "", url: "", description: "", category: "", displayOrder: "0" });
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/links/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      setEditingLink(null);
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/links/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  // ─── FAQ mutations ─────────────────────────────────────
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "", displayOrder: "0" });
  const [editingFaq, setEditingFaq] = useState<any>(null);

  const createFaqMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/faq", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setFaqForm({ question: "", answer: "", category: "", displayOrder: "0" });
    },
  });

  const updateFaqMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/api/faq/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      setEditingFaq(null);
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/faq/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  // ─── Content sub-tab ───────────────────────────────────
  const [contentSubTab, setContentSubTab] = useState<"links" | "faq">("links");

  return (
    <AppWindow title="Admin Panel">
      {/* ═══ OVERVIEW ═══ */}
      {stats && (
        <GroupBox label="Overview" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Users: <strong>{stats.users}</strong></span>
            <span>Seasons: <strong>{stats.seasons}</strong></span>
            <span>Rounds: <strong>{stats.rounds}</strong></span>
            <span>Challenges: <strong>{stats.challenges}</strong></span>
            <span>Side Quests: <strong>{stats.sideQuests}</strong></span>
            <span>Listings: <strong>{stats.listings}</strong></span>
            <span>Threads: <strong>{stats.threads}</strong></span>
            <span>Links: <strong>{stats.links}</strong></span>
            <span>FAQ: <strong>{stats.faq}</strong></span>
          </div>
        </GroupBox>
      )}

      <Tabs value={activeTab} onChange={(v: number) => setActiveTab(v)}>
        <Tab value={0}>Users</Tab>
        <Tab value={1}>Seasons</Tab>
        <Tab value={2}>Rounds</Tab>
        <Tab value={3}>Challenges</Tab>
        <Tab value={4}>Side Quests</Tab>
        <Tab value={5}>Board</Tab>
        <Tab value={6}>Content</Tab>
        <Tab value={7}>XP Log</Tab>
        <Tab value={8}>Rewards</Tab>
        <Tab value={9}>Desktop Apps</Tab>
        <Tab value={10}>Contract Ledger</Tab>
        <Tab value={11}>Roles</Tab>
        <Tab value={12}>WTF TV</Tab>
        <Tab value={13}>Studio</Tab>
      </Tabs>

      <TabBody>
        {/* ═══ TAB 0: USERS ═══ */}
        {activeTab === 0 && (
          <>
            <h3>Manage Users</h3>
            <Field>
              <TextInput
                placeholder="Search users by name or email..."
                value={userSearch}
                onChange={(e: any) => setUserSearch(e.target.value)}
                fullWidth
              />
            </Field>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Username</TableHeadCell>
                  <TableHeadCell>Display Name</TableHeadCell>
                  <TableHeadCell>Role</TableHeadCell>
                  <TableHeadCell>XP</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((u: any) => {
                  const xpInput = xpInputs[u.id] || { amount: "", reason: "" };
                  const identityDraft = identityInputs[u.id] || {
                    username: u.username || "",
                    displayName: u.displayName || "",
                  };
                  const tempPwPanel = tempPwPanels[u.id] ?? false;
                  const tempPwInput = tempPwInputs[u.id] || { password: "", expiryHours: "24" };
                  const tempPwResult = tempPwResults[u.id];
                  const dossierOpen = dossierPanels[u.id] ?? false;
                  return (
                    <TableRow key={u.id}>
                      <TableDataCell><UserLink username={u.username} /></TableDataCell>
                      <TableDataCell>{u.displayName || "---"}</TableDataCell>
                      <TableDataCell>
                        <Select
                          value={u.role}
                          onChange={(e: any) =>
                            updateRoleMutation.mutate({ id: u.id, role: e.value })
                          }
                          options={ROLE_OPTIONS}
                          width={150}
                        />
                      </TableDataCell>
                      <TableDataCell>{u.experiencePoints ?? 0}</TableDataCell>
                      <TableDataCell>
                        <ActionRow>
                          <TextInput
                            placeholder="username"
                            value={identityDraft.username}
                            onChange={(e: any) =>
                              setIdentityInputs((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...identityDraft,
                                  username: String(e.target.value || "")
                                    .toLowerCase()
                                    .replace(/\s+/g, ""),
                                },
                              }))
                            }
                            style={{ width: 115 }}
                          />
                          <TextInput
                            placeholder="display name"
                            value={identityDraft.displayName}
                            onChange={(e: any) =>
                              setIdentityInputs((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...identityDraft,
                                  displayName: e.target.value,
                                },
                              }))
                            }
                            style={{ width: 130 }}
                          />
                          <Button
                            size="sm"
                            disabled={updateIdentityMutation.isPending}
                            onClick={() =>
                              updateIdentityMutation.mutate({
                                id: u.id,
                                username: identityDraft.username,
                                displayName: identityDraft.displayName,
                              })
                            }
                          >
                            Save Names
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              clearUserSocialMutation.isPending ||
                              (!u.twitterHandle && !u.twitterVerified)
                            }
                            onClick={() =>
                              clearUserSocialMutation.mutate({ id: u.id, provider: "twitter" })
                            }
                          >
                            Clear X
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              clearUserSocialMutation.isPending ||
                              (!u.discordHandle && !u.discordVerified)
                            }
                            onClick={() =>
                              clearUserSocialMutation.mutate({ id: u.id, provider: "discord" })
                            }
                          >
                            Clear Discord
                          </Button>
                          <TextInput
                            placeholder="XP"
                            value={xpInput.amount}
                            onChange={(e: any) =>
                              setXpInputs((prev) => ({
                                ...prev,
                                [u.id]: { ...xpInput, amount: e.target.value },
                              }))
                            }
                            style={{ width: 60 }}
                          />
                          <TextInput
                            placeholder="Reason"
                            value={xpInput.reason}
                            onChange={(e: any) =>
                              setXpInputs((prev) => ({
                                ...prev,
                                [u.id]: { ...xpInput, reason: e.target.value },
                              }))
                            }
                            style={{ width: 120 }}
                          />
                          <Button
                            size="sm"
                            disabled={!xpInput.amount || awardXpMutation.isPending}
                            onClick={() => {
                              const amt = parseInt(xpInput.amount);
                              if (!amt) return;
                              awardXpMutation.mutate({
                                id: u.id,
                                amount: amt,
                                reason: xpInput.reason || "manual_admin_adjustment",
                              });
                              setXpInputs((prev) => ({
                                ...prev,
                                [u.id]: { amount: "", reason: "" },
                              }));
                            }}
                          >
                            Award XP
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              setTempPwPanels((prev) => ({ ...prev, [u.id]: !tempPwPanel }))
                            }
                          >
                            {tempPwPanel ? "▲ Temp PW" : "▼ Temp PW"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              setDossierPanels((prev) => ({ ...prev, [u.id]: !dossierOpen }))
                            }
                          >
                            {dossierOpen ? "▲ Dossier" : "▼ Dossier"}
                          </Button>
                          <ConfirmButton
                            label="Delete"
                            confirmLabel="Confirm Delete"
                            onConfirm={() => deleteUserMutation.mutate(u.id)}
                            disabled={deleteUserMutation.isPending}
                          />
                        </ActionRow>

                        {tempPwPanel && (
                          <SubSection style={{ marginTop: 8 }}>
                            <p style={{ fontSize: 11, marginBottom: 6 }}>
                              <strong>Temporary password for {u.username}</strong><br />
                              The user can log in with either their real password or the temp
                              password until it expires. Leave the password field blank to
                              auto-generate a secure one.
                            </p>
                            {tempPwResult && (
                              <p
                                style={{
                                  fontSize: 11,
                                  padding: 6,
                                  background: "#e8ffe8",
                                  border: "1px solid #008000",
                                  marginBottom: 6,
                                  wordBreak: "break-all",
                                }}
                              >
                                <strong>Temp password (shown once):</strong>{" "}
                                <code style={{ background: "#fff", padding: "1px 4px", userSelect: "all" }}>
                                  {tempPwResult.password}
                                </code>
                                <br />
                                <span style={{ fontSize: 10, color: "#555" }}>
                                  Expires: {new Date(tempPwResult.expiresAt).toLocaleString()}
                                </span>
                              </p>
                            )}
                            <ActionRow style={{ flexWrap: "wrap" }}>
                              <TextInput
                                type="password"
                                placeholder="Custom temp password (optional)"
                                value={tempPwInput.password}
                                onChange={(e: any) =>
                                  setTempPwInputs((prev) => ({
                                    ...prev,
                                    [u.id]: { ...tempPwInput, password: e.target.value },
                                  }))
                                }
                                style={{ width: 220 }}
                              />
                              <Select
                                value={tempPwInput.expiryHours}
                                onChange={(e: any) =>
                                  setTempPwInputs((prev) => ({
                                    ...prev,
                                    [u.id]: { ...tempPwInput, expiryHours: e.value },
                                  }))
                                }
                                options={[
                                  { label: "1 hour", value: "1" },
                                  { label: "4 hours", value: "4" },
                                  { label: "24 hours", value: "24" },
                                  { label: "48 hours", value: "48" },
                                  { label: "7 days", value: "168" },
                                ]}
                                width={120}
                              />
                              <Button
                                size="sm"
                                disabled={setTempPasswordMutation.isPending}
                                onClick={() =>
                                  setTempPasswordMutation.mutate({
                                    id: u.id,
                                    password: tempPwInput.password,
                                    expiryHours: Number(tempPwInput.expiryHours) || 24,
                                  })
                                }
                              >
                                {setTempPasswordMutation.isPending ? "Setting..." : "Set Temp PW"}
                              </Button>
                              {tempPwResult && (
                                <Button
                                  size="sm"
                                  disabled={clearTempPasswordMutation.isPending}
                                  onClick={() => clearTempPasswordMutation.mutate(u.id)}
                                >
                                  Revoke
                                </Button>
                              )}
                            </ActionRow>
                          </SubSection>
                        )}

                        {dossierOpen && (
                          <SubSection style={{ marginTop: 8 }}>
                            <p style={{ fontSize: 11, marginBottom: 6 }}>
                              <strong>On-Chain Dossier for {u.username}</strong>
                              <br />
                              Live wallet surveillance — pulled from TzKT and
                              synced every 5 minutes. Use Resync to force a
                              fresh backfill.
                            </p>
                            <WalletDossier mode="admin-user" userId={u.id} />
                          </SubSection>
                        )}
                      </TableDataCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredUsers.length === 0 && <p>No users found.</p>}
          </>
        )}

        {/* ═══ TAB 1: SEASONS ═══ */}
        {activeTab === 1 && (
          <>
            <h3>Seasons</h3>

            {/* Existing seasons list */}
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>#</TableHeadCell>
                  <TableHeadCell>Name</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Description</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(allSeasons || []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableDataCell>{s.number}</TableDataCell>
                    <TableDataCell>{s.name}</TableDataCell>
                    <TableDataCell>{s.status}</TableDataCell>
                    <TableDataCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.description || "---"}
                    </TableDataCell>
                    <TableDataCell>
                      <ActionRow>
                        <Button
                          size="sm"
                          onClick={() =>
                            setEditingSeason(
                              editingSeason?.id === s.id
                                ? null
                                : { ...s, name: s.name, number: String(s.number), description: s.description || "", status: s.status }
                            )
                          }
                        >
                          {editingSeason?.id === s.id ? "Cancel" : "Edit"}
                        </Button>
                        <ConfirmButton
                          label="Delete"
                          confirmLabel="Confirm"
                          onConfirm={() => deleteSeasonMutation.mutate(s.id)}
                          disabled={deleteSeasonMutation.isPending}
                        />
                      </ActionRow>
                    </TableDataCell>
                  </TableRow>
                ))}
                {(!allSeasons || allSeasons.length === 0) && (
                  <TableRow>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>No seasons yet.</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Edit season form */}
            {editingSeason && (
              <GroupBox label={`Edit Season #${editingSeason.number}`} style={{ marginTop: 12 }}>
                <Field>
                  <label>Name</label>
                  <TextInput value={editingSeason.name} onChange={(e: any) => setEditingSeason((p: any) => ({ ...p, name: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Number</label>
                  <TextInput value={editingSeason.number} onChange={(e: any) => setEditingSeason((p: any) => ({ ...p, number: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Status</label>
                  <Select value={editingSeason.status} onChange={(e: any) => setEditingSeason((p: any) => ({ ...p, status: e.value }))} options={SEASON_STATUS_OPTIONS} width={200} />
                </Field>
                <Field>
                  <label>Description</label>
                  <TextInput value={editingSeason.description} onChange={(e: any) => setEditingSeason((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
                </Field>
                <Button
                  onClick={() =>
                    updateSeasonMutation.mutate({
                      id: editingSeason.id,
                      data: {
                        name: editingSeason.name,
                        number: parseInt(editingSeason.number),
                        status: editingSeason.status,
                        description: editingSeason.description,
                      },
                    })
                  }
                  disabled={updateSeasonMutation.isPending}
                >
                  Save Changes
                </Button>
              </GroupBox>
            )}

            {/* Create season form */}
            <GroupBox label="New Season" style={{ marginTop: 12 }}>
              <Field>
                <label>Name</label>
                <TextInput value={seasonForm.name} onChange={(e: any) => setSeasonForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Number</label>
                <TextInput value={seasonForm.number} onChange={(e: any) => setSeasonForm((f) => ({ ...f, number: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput value={seasonForm.description} onChange={(e: any) => setSeasonForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
              </Field>
              <Button
                onClick={() =>
                  createSeasonMutation.mutate({
                    name: seasonForm.name,
                    number: parseInt(seasonForm.number),
                    description: seasonForm.description,
                  })
                }
                disabled={createSeasonMutation.isPending}
              >
                Create Season
              </Button>
            </GroupBox>
          </>
        )}

        {/* ═══ TAB 2: ROUNDS ═══ */}
        {activeTab === 2 && (
          <>
            <h3>Rounds</h3>

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Season</TableHeadCell>
                  <TableHeadCell>#</TableHeadCell>
                  <TableHeadCell>Name</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>XP</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(allRounds || []).map((r: any) => {
                  const season = (allSeasons || []).find((s: any) => s.id === r.seasonId);
                  return (
                    <TableRow key={r.id}>
                      <TableDataCell>{season ? `S${season.number}` : "---"}</TableDataCell>
                      <TableDataCell>{r.number}</TableDataCell>
                      <TableDataCell>{r.name}</TableDataCell>
                      <TableDataCell>{r.status}</TableDataCell>
                      <TableDataCell>{r.rewardXp}</TableDataCell>
                      <TableDataCell>
                        <ActionRow>
                          <Button
                            size="sm"
                            onClick={() =>
                              setEditingRound(
                                editingRound?.id === r.id
                                  ? null
                                  : { ...r, seasonId: String(r.seasonId), number: String(r.number), rewardXp: String(r.rewardXp || 0), description: r.description || "", rewardEscrowSlug: r.rewardEscrowSlug || "" }
                              )
                            }
                          >
                            {editingRound?.id === r.id ? "Cancel" : "Edit"}
                          </Button>
                          <ConfirmButton
                            label="Delete"
                            confirmLabel="Confirm"
                            onConfirm={() => deleteRoundMutation.mutate(r.id)}
                            disabled={deleteRoundMutation.isPending}
                          />
                        </ActionRow>
                      </TableDataCell>
                    </TableRow>
                  );
                })}
                {(!allRounds || allRounds.length === 0) && (
                  <TableRow>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>No rounds yet.</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {editingRound && (
              <GroupBox label={`Edit Round: ${editingRound.name}`} style={{ marginTop: 12 }}>
                <Field>
                  <label>Season</label>
                  <Select
                    value={parseInt(editingRound.seasonId) || undefined}
                    onChange={(e: any) => setEditingRound((p: any) => ({ ...p, seasonId: String(e.value) }))}
                    options={(allSeasons || []).map((s: any) => ({ label: `Season ${s.number}: ${s.name}`, value: s.id }))}
                    width={300}
                  />
                </Field>
                <Field>
                  <label>Name</label>
                  <TextInput value={editingRound.name} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, name: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Number</label>
                  <TextInput value={editingRound.number} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, number: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Status</label>
                  <Select value={editingRound.status} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, status: e.value }))} options={ROUND_STATUS_OPTIONS} width={200} />
                </Field>
                <Field>
                  <label>XP Reward</label>
                  <TextInput value={editingRound.rewardXp} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, rewardXp: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Description</label>
                  <TextInput value={editingRound.description} onChange={(e: any) => setEditingRound((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
                </Field>
                <Button
                  onClick={() =>
                    updateRoundMutation.mutate({
                      id: editingRound.id,
                      data: {
                        seasonId: parseInt(editingRound.seasonId),
                        name: editingRound.name,
                        number: parseInt(editingRound.number),
                        status: editingRound.status,
                        rewardXp: parseInt(editingRound.rewardXp) || 0,
                        description: editingRound.description,
                        rewardEscrowSlug: editingRound.rewardEscrowSlug || null,
                      },
                    })
                  }
                  disabled={updateRoundMutation.isPending}
                >
                  Save Changes
                </Button>
              </GroupBox>
            )}

            <GroupBox label="New Round" style={{ marginTop: 12 }}>
              <Field>
                <label>Season</label>
                <Select
                  value={parseInt(roundForm.seasonId) || undefined}
                  onChange={(e: any) => setRoundForm((f) => ({ ...f, seasonId: String(e.value) }))}
                  options={(allSeasons || []).map((s: any) => ({ label: `Season ${s.number}: ${s.name}`, value: s.id }))}
                  width={300}
                />
              </Field>
              <Field>
                <label>Name</label>
                <TextInput value={roundForm.name} onChange={(e: any) => setRoundForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Number</label>
                <TextInput value={roundForm.number} onChange={(e: any) => setRoundForm((f) => ({ ...f, number: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>XP Reward</label>
                <TextInput value={roundForm.rewardXp} onChange={(e: any) => setRoundForm((f) => ({ ...f, rewardXp: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Escrow Slug (optional)</label>
                <TextInput value={roundForm.rewardEscrowSlug} onChange={(e: any) => setRoundForm((f) => ({ ...f, rewardEscrowSlug: e.target.value }))} fullWidth />
              </Field>
              <Button
                onClick={() =>
                  createRoundMutation.mutate({
                    seasonId: parseInt(roundForm.seasonId),
                    name: roundForm.name,
                    number: parseInt(roundForm.number),
                    description: roundForm.description,
                    rewardXp: parseInt(roundForm.rewardXp) || 0,
                    rewardEscrowSlug: roundForm.rewardEscrowSlug || null,
                  })
                }
                disabled={createRoundMutation.isPending}
              >
                Create Round
              </Button>
            </GroupBox>
          </>
        )}

        {/* ═══ TAB 3: CHALLENGES ═══ */}
        {activeTab === 3 && (
          <>
            <h3>Challenges</h3>

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Title</TableHeadCell>
                  <TableHeadCell>Round</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>WTF / XP</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(allChallenges || []).map((c: any) => {
                  const round = (allRounds || []).find((r: any) => r.id === c.roundId);
                  return (
                    <TableRow key={c.id}>
                      <TableDataCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title}
                      </TableDataCell>
                      <TableDataCell>{round ? `R${round.number}` : "---"}</TableDataCell>
                      <TableDataCell>{c.status}</TableDataCell>
                      <TableDataCell>{c.rewardAmountWtf || 0} / {c.rewardXp || 0}</TableDataCell>
                      <TableDataCell>
                        <ActionRow>
                          <Button
                            size="sm"
                            onClick={() =>
                              setEditingChallenge(
                                editingChallenge?.id === c.id
                                  ? null
                                  : {
                                      ...c,
                                      roundId: String(c.roundId || ""),
                                      rewardAmountWtf: String(c.rewardAmountWtf || 0),
                                      rewardXp: String(c.rewardXp || 0),
                                      criteria: c.criteria || "",
                                      rules: c.rules || "",
                                      rewardEscrowSlug: c.rewardEscrowSlug || "",
                                    }
                              )
                            }
                          >
                            {editingChallenge?.id === c.id ? "Cancel" : "Edit"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setExpandedChallenge(expandedChallenge === c.id ? null : c.id)}
                          >
                            {expandedChallenge === c.id ? "Hide Subs" : "Submissions"}
                          </Button>
                        </ActionRow>
                      </TableDataCell>
                    </TableRow>
                  );
                })}
                {(!allChallenges || allChallenges.length === 0) && (
                  <TableRow>
                    <TableDataCell>No challenges yet.</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Submissions sub-panel */}
            {expandedChallenge !== null && expandedChallengeData?.submissions && (
              <SubSection>
                <h4>Submissions for: {expandedChallengeData.title}</h4>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>User</TableHeadCell>
                      <TableHeadCell>Content</TableHeadCell>
                      <TableHeadCell>Grade</TableHeadCell>
                      <TableHeadCell>Rewarded</TableHeadCell>
                      <TableHeadCell>Actions</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expandedChallengeData.submissions.map((sub: any) => {
                      const gf = gradeForms[sub.id] || { grade: sub.grade || "pending", feedback: sub.feedback || "" };
                      return (
                        <TableRow key={sub.id}>
                          <TableDataCell><UserLink username={sub.username} displayName={sub.displayName} /></TableDataCell>
                          <TableDataCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sub.contentText || sub.contentUrl || "---"}
                          </TableDataCell>
                          <TableDataCell>
                            <Select
                              value={gf.grade}
                              onChange={(e: any) =>
                                setGradeForms((prev) => ({
                                  ...prev,
                                  [sub.id]: { ...gf, grade: e.value },
                                }))
                              }
                              options={GRADE_OPTIONS}
                              width={110}
                            />
                          </TableDataCell>
                          <TableDataCell>{sub.rewardDistributed ? "Yes" : "No"}</TableDataCell>
                          <TableDataCell>
                            <ActionRow>
                              <TextInput
                                placeholder="Feedback"
                                value={gf.feedback}
                                onChange={(e: any) =>
                                  setGradeForms((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...gf, feedback: e.target.value },
                                  }))
                                }
                                style={{ width: 100 }}
                              />
                              <Button
                                size="sm"
                                onClick={() =>
                                  gradeSubmissionMutation.mutate({
                                    id: sub.id,
                                    grade: gf.grade,
                                    feedback: gf.feedback,
                                  })
                                }
                                disabled={gradeSubmissionMutation.isPending}
                              >
                                Grade
                              </Button>
                              {!sub.rewardDistributed && (sub.grade === "pass" || sub.grade === "bonus") && (
                                <Button
                                  size="sm"
                                  onClick={() => markRewardMutation.mutate({ id: sub.id })}
                                  disabled={markRewardMutation.isPending}
                                >
                                  Mark Rewarded
                                </Button>
                              )}
                            </ActionRow>
                          </TableDataCell>
                        </TableRow>
                      );
                    })}
                    {expandedChallengeData.submissions.length === 0 && (
                      <TableRow>
                        <TableDataCell>No submissions.</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </SubSection>
            )}

            {/* Edit challenge form */}
            {editingChallenge && (
              <GroupBox label={`Edit: ${editingChallenge.title}`} style={{ marginTop: 12 }}>
                <Field>
                  <label>Title</label>
                  <TextInput value={editingChallenge.title} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, title: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Round</label>
                  <Select
                    value={parseInt(editingChallenge.roundId) || undefined}
                    onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, roundId: String(e.value) }))}
                    options={[{ label: "No round", value: 0 }, ...(allRounds || []).map((r: any) => ({ label: `R${r.number}: ${r.name}`, value: r.id }))]}
                    width={300}
                  />
                </Field>
                <Field>
                  <label>Status</label>
                  <Select value={editingChallenge.status} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, status: e.value }))} options={CHALLENGE_STATUS_OPTIONS} width={200} />
                </Field>
                <Field>
                  <label>Description</label>
                  <TextInput value={editingChallenge.description} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
                </Field>
                <Field>
                  <label>Criteria</label>
                  <TextInput value={editingChallenge.criteria} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, criteria: e.target.value }))} multiline fullWidth />
                </Field>
                <Field>
                  <label>Rules</label>
                  <TextInput value={editingChallenge.rules} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, rules: e.target.value }))} multiline fullWidth />
                </Field>
                <Field>
                  <label>Reward WTF</label>
                  <TextInput value={editingChallenge.rewardAmountWtf} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, rewardAmountWtf: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Reward XP</label>
                  <TextInput value={editingChallenge.rewardXp} onChange={(e: any) => setEditingChallenge((p: any) => ({ ...p, rewardXp: e.target.value }))} fullWidth />
                </Field>
                <Button
                  onClick={() =>
                    updateChallengeMutation.mutate({
                      id: editingChallenge.id,
                      data: {
                        title: editingChallenge.title,
                        roundId: parseInt(editingChallenge.roundId) || null,
                        status: editingChallenge.status,
                        description: editingChallenge.description,
                        criteria: editingChallenge.criteria,
                        rules: editingChallenge.rules,
                        rewardAmountWtf: parseInt(editingChallenge.rewardAmountWtf) || 0,
                        rewardXp: parseInt(editingChallenge.rewardXp) || 0,
                        rewardEscrowSlug: editingChallenge.rewardEscrowSlug || null,
                      },
                    })
                  }
                  disabled={updateChallengeMutation.isPending}
                >
                  Save Changes
                </Button>
              </GroupBox>
            )}

            {/* Create challenge form */}
            <GroupBox label="New Challenge" style={{ marginTop: 12 }}>
              <Field>
                <label>Round (optional)</label>
                <Select
                  value={parseInt(challengeForm.roundId) || undefined}
                  onChange={(e: any) => setChallengeForm((f) => ({ ...f, roundId: String(e.value) }))}
                  options={[{ label: "No round", value: 0 }, ...(allRounds || []).map((r: any) => ({ label: `R${r.number}: ${r.name}`, value: r.id }))]}
                  width={300}
                />
              </Field>
              <Field>
                <label>Title</label>
                <TextInput value={challengeForm.title} onChange={(e: any) => setChallengeForm((f) => ({ ...f, title: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput value={challengeForm.description} onChange={(e: any) => setChallengeForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Criteria</label>
                <TextInput value={challengeForm.criteria} onChange={(e: any) => setChallengeForm((f) => ({ ...f, criteria: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Rules</label>
                <TextInput value={challengeForm.rules} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rules: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Reward WTF</label>
                <TextInput value={challengeForm.rewardAmountWtf} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rewardAmountWtf: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Reward XP</label>
                <TextInput value={challengeForm.rewardXp} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rewardXp: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Escrow Slug (optional)</label>
                <TextInput value={challengeForm.rewardEscrowSlug} onChange={(e: any) => setChallengeForm((f) => ({ ...f, rewardEscrowSlug: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Status</label>
                <Select value={challengeForm.status} onChange={(e: any) => setChallengeForm((f) => ({ ...f, status: e.value }))} options={CHALLENGE_STATUS_OPTIONS.slice(0, 2)} width={200} />
              </Field>
              <Button
                onClick={() =>
                  createChallengeMutation.mutate({
                    roundId: parseInt(challengeForm.roundId) || null,
                    title: challengeForm.title,
                    description: challengeForm.description,
                    criteria: challengeForm.criteria,
                    rules: challengeForm.rules,
                    rewardAmountWtf: parseInt(challengeForm.rewardAmountWtf) || 0,
                    rewardXp: parseInt(challengeForm.rewardXp) || 0,
                    rewardEscrowSlug: challengeForm.rewardEscrowSlug || null,
                    status: challengeForm.status,
                  })
                }
                disabled={createChallengeMutation.isPending}
              >
                Create Challenge
              </Button>
            </GroupBox>
          </>
        )}

        {/* ═══ TAB 4: SIDE QUESTS ═══ */}
        {activeTab === 4 && (
          <>
            <h3>Side Quests</h3>

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Title</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Reward</TableHeadCell>
                  <TableHeadCell>Max</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(allSideQuests || []).map((sq: any) => (
                  <TableRow key={sq.id}>
                    <TableDataCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sq.title}
                    </TableDataCell>
                    <TableDataCell>{sq.status}</TableDataCell>
                    <TableDataCell>{sq.rewardAmountWtf || 0} WTF / {sq.rewardXp || 0} XP</TableDataCell>
                    <TableDataCell>
                      {sq.maxCompletions ?? "∞"}
                      {sq.persistent && " [P]"}
                      {sq.autoVerifyType !== "manual" && ` [${sq.autoVerifyType}]`}
                    </TableDataCell>
                    <TableDataCell>
                      <ActionRow>
                        <Button
                          size="sm"
                          onClick={() =>
                            setEditingQuest(
                              editingQuest?.id === sq.id
                                ? null
                                : {
                                    ...sq,
                                    rewardAmountWtf: String(sq.rewardAmountWtf || 0),
                                    rewardXp: String(sq.rewardXp || 0),
                                    maxCompletions: String(sq.maxCompletions || ""),
                                    criteria: sq.criteria || "",
                                    deadline: sq.deadline || "",
                                    persistent: !!sq.persistent,
                                    autoVerifyType: sq.autoVerifyType || "manual",
                                  }
                            )
                          }
                        >
                          {editingQuest?.id === sq.id ? "Cancel" : "Edit"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setExpandedQuest(expandedQuest === sq.id ? null : sq.id)}
                        >
                          {expandedQuest === sq.id ? "Hide" : "Completions"}
                        </Button>
                      </ActionRow>
                    </TableDataCell>
                  </TableRow>
                ))}
                {(!allSideQuests || allSideQuests.length === 0) && (
                  <TableRow>
                    <TableDataCell>No side quests yet.</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Completions sub-panel */}
            {expandedQuest !== null && expandedQuestData?.completions && (
              <SubSection>
                <h4>Completions for: {expandedQuestData.title}</h4>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>User</TableHeadCell>
                      <TableHeadCell>Proof</TableHeadCell>
                      <TableHeadCell>Date</TableHeadCell>
                      <TableHeadCell>Approved</TableHeadCell>
                      <TableHeadCell>Actions</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expandedQuestData.completions.map((comp: any) => (
                      <TableRow key={comp.id}>
                        <TableDataCell><UserLink username={comp.username} displayName={comp.displayName} /></TableDataCell>
                        <TableDataCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {comp.proofText || comp.proofUrl || "---"}
                        </TableDataCell>
                        <TableDataCell>{new Date(comp.completedAt).toLocaleDateString()}</TableDataCell>
                        <TableDataCell>
                          {comp.approved === true ? "Approved" : comp.approved === false ? "Rejected" : "Pending"}
                          {comp.xpAwarded > 0 && ` (+${comp.xpAwarded} XP)`}
                        </TableDataCell>
                        <TableDataCell>
                          {comp.approved === null && (
                            <ActionRow>
                              <Button
                                size="sm"
                                onClick={() => approveCompletionMutation.mutate({ id: comp.id, approved: true })}
                                disabled={approveCompletionMutation.isPending}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => approveCompletionMutation.mutate({ id: comp.id, approved: false })}
                                disabled={approveCompletionMutation.isPending}
                              >
                                Reject
                              </Button>
                            </ActionRow>
                          )}
                          {comp.approved !== null && <span>---</span>}
                        </TableDataCell>
                      </TableRow>
                    ))}
                    {expandedQuestData.completions.length === 0 && (
                      <TableRow>
                        <TableDataCell>No completions.</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </SubSection>
            )}

            {/* Edit quest */}
            {editingQuest && (
              <GroupBox label={`Edit: ${editingQuest.title}`} style={{ marginTop: 12 }}>
                <Field>
                  <label>Title</label>
                  <TextInput value={editingQuest.title} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, title: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Status</label>
                  <Select value={editingQuest.status} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, status: e.value }))} options={QUEST_STATUS_OPTIONS} width={200} />
                </Field>
                <Field>
                  <label>Description</label>
                  <TextInput value={editingQuest.description} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
                </Field>
                <Field>
                  <label>Criteria</label>
                  <TextInput value={editingQuest.criteria} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, criteria: e.target.value }))} multiline fullWidth />
                </Field>
                <Field>
                  <label>Reward WTF</label>
                  <TextInput value={editingQuest.rewardAmountWtf} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, rewardAmountWtf: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Reward XP</label>
                  <TextInput value={editingQuest.rewardXp} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, rewardXp: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Max Completions</label>
                  <TextInput value={editingQuest.maxCompletions} onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, maxCompletions: e.target.value }))} fullWidth />
                </Field>
                <Field>
                  <label>Auto-Verify Type</label>
                  <Select
                    value={editingQuest.autoVerifyType}
                    onChange={(e: any) => setEditingQuest((p: any) => ({ ...p, autoVerifyType: e.value }))}
                    options={AUTO_VERIFY_OPTIONS}
                    width={250}
                  />
                </Field>
                <Field>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={editingQuest.persistent}
                      onChange={(e) => setEditingQuest((p: any) => ({ ...p, persistent: e.target.checked }))}
                    />
                    Persistent (always available, completable once per user)
                  </label>
                </Field>
                <Button
                  onClick={() =>
                    updateQuestMutation.mutate({
                      id: editingQuest.id,
                      data: {
                        title: editingQuest.title,
                        status: editingQuest.status,
                        description: editingQuest.description,
                        criteria: editingQuest.criteria,
                        rewardAmountWtf: parseInt(editingQuest.rewardAmountWtf) || 0,
                        rewardXp: parseInt(editingQuest.rewardXp) || 0,
                        maxCompletions: parseInt(editingQuest.maxCompletions) || null,
                        persistent: editingQuest.persistent,
                        autoVerifyType: editingQuest.autoVerifyType,
                      },
                    })
                  }
                  disabled={updateQuestMutation.isPending}
                >
                  Save Changes
                </Button>
              </GroupBox>
            )}

            {/* Create quest */}
            <GroupBox label="New Side Quest" style={{ marginTop: 12 }}>
              <Field>
                <label>Title</label>
                <TextInput value={questForm.title} onChange={(e: any) => setQuestForm((f) => ({ ...f, title: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput value={questForm.description} onChange={(e: any) => setQuestForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Criteria</label>
                <TextInput value={questForm.criteria} onChange={(e: any) => setQuestForm((f) => ({ ...f, criteria: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Reward WTF</label>
                <TextInput value={questForm.rewardAmountWtf} onChange={(e: any) => setQuestForm((f) => ({ ...f, rewardAmountWtf: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Reward XP</label>
                <TextInput value={questForm.rewardXp} onChange={(e: any) => setQuestForm((f) => ({ ...f, rewardXp: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Max Completions</label>
                <TextInput value={questForm.maxCompletions} onChange={(e: any) => setQuestForm((f) => ({ ...f, maxCompletions: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Auto-Verify Type</label>
                <Select
                  value={questForm.autoVerifyType}
                  onChange={(e: any) => setQuestForm((f) => ({ ...f, autoVerifyType: e.value }))}
                  options={AUTO_VERIFY_OPTIONS}
                  width={250}
                />
              </Field>
              <Field>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={questForm.persistent}
                    onChange={(e) => setQuestForm((f) => ({ ...f, persistent: e.target.checked }))}
                  />
                  Persistent (always available, completable once per user)
                </label>
              </Field>
              <Field>
                <label>Status</label>
                <Select value={questForm.status} onChange={(e: any) => setQuestForm((f) => ({ ...f, status: e.value }))} options={QUEST_STATUS_OPTIONS.slice(0, 2)} width={200} />
              </Field>
              <Button
                onClick={() =>
                  createQuestMutation.mutate({
                    title: questForm.title,
                    description: questForm.description,
                    criteria: questForm.criteria,
                    rewardAmountWtf: parseInt(questForm.rewardAmountWtf) || 0,
                    rewardXp: parseInt(questForm.rewardXp) || 0,
                    maxCompletions: parseInt(questForm.maxCompletions) || null,
                    persistent: questForm.persistent,
                    autoVerifyType: questForm.autoVerifyType,
                    status: questForm.status,
                  })
                }
                disabled={createQuestMutation.isPending}
              >
                Create Side Quest
              </Button>
            </GroupBox>
          </>
        )}

        {/* ═══ TAB 5: MESSAGE BOARD ═══ */}
        {activeTab === 5 && (
          <>
            <h3>Message Board</h3>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Thread</TableHeadCell>
                  <TableHeadCell>Author</TableHeadCell>
                  <TableHeadCell>Replies</TableHeadCell>
                  <TableHeadCell>Created</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(boardThreads || []).map((thread) => (
                  <TableRow key={thread.id} style={thread.active === false ? { opacity: 0.6, background: "#e8e8e8" } : undefined}>
                    <TableDataCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {thread.active === false ? "[Archived] " : ""}{thread.title}
                    </TableDataCell>
                    <TableDataCell><UserLink username={thread.creatorUsername} displayName={thread.creatorDisplayName} fallback="---" /></TableDataCell>
                    <TableDataCell>{thread.replyCount || 0}</TableDataCell>
                    <TableDataCell>{new Date(thread.createdAt).toLocaleDateString()}</TableDataCell>
                    <TableDataCell>
                      {thread.pinned ? "Pinned " : ""}
                      {thread.locked ? "Locked " : ""}
                      {thread.expired ? "Expired" : thread.active === false ? "Archived" : "Active"}
                    </TableDataCell>
                    <TableDataCell>
                      <ActionRow>
                        <Button
                          size="sm"
                          onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { pinned: !thread.pinned } })}
                          disabled={moderateBoardThreadMutation.isPending}
                        >
                          {thread.pinned ? "Unpin" : "Pin"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { locked: !thread.locked } })}
                          disabled={moderateBoardThreadMutation.isPending}
                        >
                          {thread.locked ? "Unlock" : "Lock"}
                        </Button>
                        {thread.active === false ? (
                          <Button
                            size="sm"
                            onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { active: true } })}
                            disabled={moderateBoardThreadMutation.isPending}
                          >
                            Unarchive
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => moderateBoardThreadMutation.mutate({ id: thread.id, payload: { active: false } })}
                            disabled={moderateBoardThreadMutation.isPending}
                          >
                            Archive
                          </Button>
                        )}
                        <ConfirmButton
                          label="Delete"
                          confirmLabel="Confirm"
                          onConfirm={() => deleteBoardThreadMutation.mutate(thread.id)}
                          disabled={deleteBoardThreadMutation.isPending}
                        />
                      </ActionRow>
                    </TableDataCell>
                  </TableRow>
                ))}
                {(!boardThreads || boardThreads.length === 0) && (
                  <TableRow>
                    <TableDataCell>No board threads yet.</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                    <TableDataCell>---</TableDataCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}

        {/* ═══ TAB 6: CONTENT (LINKS + FAQ) ═══ */}
        {activeTab === 6 && (
          <>
            <h3>Content Management</h3>
            <ActionRow style={{ marginBottom: 12 }}>
              <Button onClick={() => setContentSubTab("links")} active={contentSubTab === "links"}>
                Links
              </Button>
              <Button onClick={() => setContentSubTab("faq")} active={contentSubTab === "faq"}>
                FAQ
              </Button>
            </ActionRow>

            {/* ── Links ── */}
            {contentSubTab === "links" && (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Order</TableHeadCell>
                      <TableHeadCell>Title</TableHeadCell>
                      <TableHeadCell>URL</TableHeadCell>
                      <TableHeadCell>Category</TableHeadCell>
                      <TableHeadCell>Actions</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(allLinks || []).map((lnk: any) => (
                      <TableRow key={lnk.id}>
                        <TableDataCell>{lnk.displayOrder}</TableDataCell>
                        <TableDataCell>{lnk.title}</TableDataCell>
                        <TableDataCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lnk.url}
                        </TableDataCell>
                        <TableDataCell>{lnk.category || "---"}</TableDataCell>
                        <TableDataCell>
                          <ActionRow>
                            <Button
                              size="sm"
                              onClick={() =>
                                setEditingLink(
                                  editingLink?.id === lnk.id
                                    ? null
                                    : { ...lnk, displayOrder: String(lnk.displayOrder || 0), description: lnk.description || "", category: lnk.category || "" }
                                )
                              }
                            >
                              {editingLink?.id === lnk.id ? "Cancel" : "Edit"}
                            </Button>
                            <ConfirmButton
                              label="Delete"
                              confirmLabel="Confirm"
                              onConfirm={() => deleteLinkMutation.mutate(lnk.id)}
                              disabled={deleteLinkMutation.isPending}
                            />
                          </ActionRow>
                        </TableDataCell>
                      </TableRow>
                    ))}
                    {(!allLinks || allLinks.length === 0) && (
                      <TableRow>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>No links yet.</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {editingLink && (
                  <GroupBox label={`Edit: ${editingLink.title}`} style={{ marginTop: 12 }}>
                    <Field>
                      <label>Title</label>
                      <TextInput value={editingLink.title} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, title: e.target.value }))} fullWidth />
                    </Field>
                    <Field>
                      <label>URL</label>
                      <TextInput value={editingLink.url} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, url: e.target.value }))} fullWidth />
                    </Field>
                    <Field>
                      <label>Description</label>
                      <TextInput value={editingLink.description} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
                    </Field>
                    <Field>
                      <label>Category</label>
                      <TextInput value={editingLink.category} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, category: e.target.value }))} fullWidth />
                    </Field>
                    <Field>
                      <label>Display Order</label>
                      <TextInput value={editingLink.displayOrder} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, displayOrder: e.target.value }))} fullWidth />
                    </Field>
                    <Button
                      onClick={() =>
                        updateLinkMutation.mutate({
                          id: editingLink.id,
                          data: {
                            title: editingLink.title,
                            url: editingLink.url,
                            description: editingLink.description,
                            category: editingLink.category || null,
                            displayOrder: parseInt(editingLink.displayOrder) || 0,
                          },
                        })
                      }
                      disabled={updateLinkMutation.isPending}
                    >
                      Save Changes
                    </Button>
                  </GroupBox>
                )}

                <GroupBox label="New Link" style={{ marginTop: 12 }}>
                  <Field>
                    <label>Title</label>
                    <TextInput value={linkForm.title} onChange={(e: any) => setLinkForm((f) => ({ ...f, title: e.target.value }))} fullWidth />
                  </Field>
                  <Field>
                    <label>URL</label>
                    <TextInput value={linkForm.url} onChange={(e: any) => setLinkForm((f) => ({ ...f, url: e.target.value }))} fullWidth />
                  </Field>
                  <Field>
                    <label>Description</label>
                    <TextInput value={linkForm.description} onChange={(e: any) => setLinkForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
                  </Field>
                  <Field>
                    <label>Category</label>
                    <TextInput value={linkForm.category} onChange={(e: any) => setLinkForm((f) => ({ ...f, category: e.target.value }))} fullWidth />
                  </Field>
                  <Field>
                    <label>Display Order</label>
                    <TextInput value={linkForm.displayOrder} onChange={(e: any) => setLinkForm((f) => ({ ...f, displayOrder: e.target.value }))} fullWidth />
                  </Field>
                  <Button
                    onClick={() =>
                      createLinkMutation.mutate({
                        title: linkForm.title,
                        url: linkForm.url,
                        description: linkForm.description,
                        category: linkForm.category || null,
                        displayOrder: parseInt(linkForm.displayOrder) || 0,
                      })
                    }
                    disabled={createLinkMutation.isPending}
                  >
                    Create Link
                  </Button>
                </GroupBox>
              </>
            )}

            {/* ── FAQ ── */}
            {contentSubTab === "faq" && (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Order</TableHeadCell>
                      <TableHeadCell>Question</TableHeadCell>
                      <TableHeadCell>Category</TableHeadCell>
                      <TableHeadCell>Actions</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(allFaq || []).map((faq: any) => (
                      <TableRow key={faq.id}>
                        <TableDataCell>{faq.displayOrder}</TableDataCell>
                        <TableDataCell style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {faq.question}
                        </TableDataCell>
                        <TableDataCell>{faq.category || "---"}</TableDataCell>
                        <TableDataCell>
                          <ActionRow>
                            <Button
                              size="sm"
                              onClick={() =>
                                setEditingFaq(
                                  editingFaq?.id === faq.id
                                    ? null
                                    : { ...faq, displayOrder: String(faq.displayOrder || 0), category: faq.category || "" }
                                )
                              }
                            >
                              {editingFaq?.id === faq.id ? "Cancel" : "Edit"}
                            </Button>
                            <ConfirmButton
                              label="Delete"
                              confirmLabel="Confirm"
                              onConfirm={() => deleteFaqMutation.mutate(faq.id)}
                              disabled={deleteFaqMutation.isPending}
                            />
                          </ActionRow>
                        </TableDataCell>
                      </TableRow>
                    ))}
                    {(!allFaq || allFaq.length === 0) && (
                      <TableRow>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>No FAQ items yet.</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {editingFaq && (
                  <GroupBox label="Edit FAQ" style={{ marginTop: 12 }}>
                    <Field>
                      <label>Question</label>
                      <TextInput value={editingFaq.question} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, question: e.target.value }))} multiline fullWidth />
                    </Field>
                    <Field>
                      <label>Answer</label>
                      <TextInput value={editingFaq.answer} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, answer: e.target.value }))} multiline fullWidth />
                    </Field>
                    <Field>
                      <label>Category</label>
                      <TextInput value={editingFaq.category} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, category: e.target.value }))} fullWidth />
                    </Field>
                    <Field>
                      <label>Display Order</label>
                      <TextInput value={editingFaq.displayOrder} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, displayOrder: e.target.value }))} fullWidth />
                    </Field>
                    <Button
                      onClick={() =>
                        updateFaqMutation.mutate({
                          id: editingFaq.id,
                          data: {
                            question: editingFaq.question,
                            answer: editingFaq.answer,
                            category: editingFaq.category || null,
                            displayOrder: parseInt(editingFaq.displayOrder) || 0,
                          },
                        })
                      }
                      disabled={updateFaqMutation.isPending}
                    >
                      Save Changes
                    </Button>
                  </GroupBox>
                )}

                <GroupBox label="New FAQ Item" style={{ marginTop: 12 }}>
                  <Field>
                    <label>Question</label>
                    <TextInput value={faqForm.question} onChange={(e: any) => setFaqForm((f) => ({ ...f, question: e.target.value }))} multiline fullWidth />
                  </Field>
                  <Field>
                    <label>Answer</label>
                    <TextInput value={faqForm.answer} onChange={(e: any) => setFaqForm((f) => ({ ...f, answer: e.target.value }))} multiline fullWidth />
                  </Field>
                  <Field>
                    <label>Category</label>
                    <TextInput value={faqForm.category} onChange={(e: any) => setFaqForm((f) => ({ ...f, category: e.target.value }))} fullWidth />
                  </Field>
                  <Field>
                    <label>Display Order</label>
                    <TextInput value={faqForm.displayOrder} onChange={(e: any) => setFaqForm((f) => ({ ...f, displayOrder: e.target.value }))} fullWidth />
                  </Field>
                  <Button
                    onClick={() =>
                      createFaqMutation.mutate({
                        question: faqForm.question,
                        answer: faqForm.answer,
                        category: faqForm.category || null,
                        displayOrder: parseInt(faqForm.displayOrder) || 0,
                      })
                    }
                    disabled={createFaqMutation.isPending}
                  >
                    Create FAQ Item
                  </Button>
                </GroupBox>
              </>
            )}
          </>
        )}
        {activeTab === 7 && (
          <>
            <GroupBox label="XP Reward Log">
              <ActionRow style={{ marginBottom: 8 }}>
                <TextInput
                  placeholder="Filter by user..."
                  value={xpLogUserFilter}
                  onChange={(e: any) => setXpLogUserFilter(e.target.value)}
                  style={{ width: 200 }}
                />
              </ActionRow>
              {!xpLog ? (
                <Hourglass size={32} />
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Date</TableHeadCell>
                      <TableHeadCell>User</TableHeadCell>
                      <TableHeadCell>Reason</TableHeadCell>
                      <TableHeadCell style={{ textAlign: "right" }}>Amount</TableHeadCell>
                      <TableHeadCell>Awarded By</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {xpLog
                      .filter((ev: any) => {
                        if (!xpLogUserFilter) return true;
                        const q = xpLogUserFilter.toLowerCase();
                        const user = (allUsers || []).find((u: any) => u.id === ev.userId);
                        return (
                          user?.username?.toLowerCase().includes(q) ||
                          user?.displayName?.toLowerCase().includes(q)
                        );
                      })
                      .map((ev: any) => {
                        const user = (allUsers || []).find((u: any) => u.id === ev.userId);
                        const awardedByUser = ev.awardedBy
                          ? (allUsers || []).find((u: any) => u.id === ev.awardedBy)
                          : null;
                        return (
                          <TableRow key={ev.id}>
                            <TableDataCell style={{ fontSize: 11 }}>
                              {new Date(ev.createdAt).toLocaleString()}
                            </TableDataCell>
                            <TableDataCell>
                              <UserLink
                                username={user?.username}
                                displayName={user?.displayName}
                                fallback={`user #${ev.userId}`}
                              />
                            </TableDataCell>
                            <TableDataCell>{ev.reason}</TableDataCell>
                            <TableDataCell
                              style={{
                                textAlign: "right",
                                color: ev.amount >= 0 ? "#008000" : "#800000",
                                fontWeight: "bold",
                              }}
                            >
                              {ev.amount >= 0 ? "+" : ""}
                              {ev.amount}
                            </TableDataCell>
                            <TableDataCell>
                              {awardedByUser ? (
                                <UserLink
                                  username={awardedByUser.username}
                                  displayName={awardedByUser.displayName}
                                />
                              ) : (
                                "system"
                              )}
                            </TableDataCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </GroupBox>
          </>
        )}
        {/* ═══ TAB 8: REWARD LEDGER ═══ */}
        {activeTab === 8 && (
          <>
            <h3>WTF Reward Ledger</h3>
            <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
              Every approved side quest and graded challenge (pass/bonus) with a WTF reward creates a ledger entry.
              Use this to track and batch-pay IOUs.
            </p>
            <ActionRow style={{ marginBottom: 12 }}>
              <Button onClick={() => setLedgerFilter("unpaid")} active={ledgerFilter === "unpaid"}>
                Unpaid
              </Button>
              <Button onClick={() => setLedgerFilter("paid")} active={ledgerFilter === "paid"}>
                Paid
              </Button>
              <Button onClick={() => setLedgerFilter("all")} active={ledgerFilter === "all"}>
                All
              </Button>
            </ActionRow>

            {!rewardLedger ? (
              <Hourglass size={32} />
            ) : (
              <>
                {ledgerFilter === "unpaid" && rewardLedger.length > 0 && (
                  <GroupBox label="Batch Pay" style={{ marginBottom: 12 }}>
                    <ActionRow>
                      <label style={{ fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={selectedLedgerIds.size === rewardLedger.length && rewardLedger.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLedgerIds(new Set(rewardLedger.map((r: any) => r.id)));
                            } else {
                              setSelectedLedgerIds(new Set());
                            }
                          }}
                        />
                        {" "}Select All ({rewardLedger.length})
                      </label>
                      <span style={{ fontSize: 12 }}>
                        Total: <strong>{rewardLedger.filter((r: any) => selectedLedgerIds.has(r.id)).reduce((s: number, r: any) => s + (r.amountWtf || 0), 0)} WTF</strong>
                      </span>
                      <TextInput
                        placeholder="Op hash (optional)"
                        value={batchOpHash}
                        onChange={(e: any) => setBatchOpHash(e.target.value)}
                        style={{ width: 200 }}
                      />
                      <Button
                        size="sm"
                        disabled={selectedLedgerIds.size === 0 || batchPayMutation.isPending}
                        onClick={() =>
                          batchPayMutation.mutate({
                            ids: Array.from(selectedLedgerIds),
                            opHash: batchOpHash || undefined,
                          })
                        }
                      >
                        Mark {selectedLedgerIds.size} as Paid
                      </Button>
                    </ActionRow>
                  </GroupBox>
                )}

                <Table>
                  <TableHead>
                    <TableRow>
                      {ledgerFilter === "unpaid" && <TableHeadCell style={{ width: 30 }}></TableHeadCell>}
                      <TableHeadCell>User</TableHeadCell>
                      <TableHeadCell>Wallet</TableHeadCell>
                      <TableHeadCell>Amount</TableHeadCell>
                      <TableHeadCell>Reason</TableHeadCell>
                      <TableHeadCell>Date</TableHeadCell>
                      <TableHeadCell>Status</TableHeadCell>
                      {ledgerFilter === "unpaid" && <TableHeadCell>Actions</TableHeadCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rewardLedger.map((entry: any) => (
                      <TableRow key={entry.id}>
                        {ledgerFilter === "unpaid" && (
                          <TableDataCell>
                            <input
                              type="checkbox"
                              checked={selectedLedgerIds.has(entry.id)}
                              onChange={(e) => {
                                const next = new Set(selectedLedgerIds);
                                if (e.target.checked) next.add(entry.id);
                                else next.delete(entry.id);
                                setSelectedLedgerIds(next);
                              }}
                            />
                          </TableDataCell>
                        )}
                        <TableDataCell>
                          <UserLink username={entry.username} displayName={entry.displayName} />
                        </TableDataCell>
                        <TableDataCell style={{ fontSize: 10, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {entry.walletAddress || "---"}
                        </TableDataCell>
                        <TableDataCell style={{ fontWeight: "bold" }}>
                          {entry.amountWtf} WTF
                        </TableDataCell>
                        <TableDataCell style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.reason}
                        </TableDataCell>
                        <TableDataCell style={{ fontSize: 11 }}>
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </TableDataCell>
                        <TableDataCell>
                          {entry.paid ? (
                            <span style={{ color: "green" }}>
                              Paid{entry.opHash ? ` (${entry.opHash.slice(0, 8)}...)` : ""}
                            </span>
                          ) : (
                            <span style={{ color: "#a00" }}>Unpaid</span>
                          )}
                        </TableDataCell>
                        {ledgerFilter === "unpaid" && (
                          <TableDataCell>
                            <Button
                              size="sm"
                              onClick={() => markPaidMutation.mutate({ id: entry.id })}
                              disabled={markPaidMutation.isPending}
                            >
                              Pay
                            </Button>
                          </TableDataCell>
                        )}
                      </TableRow>
                    ))}
                    {rewardLedger.length === 0 && (
                      <TableRow>
                        <TableDataCell>No entries.</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                        <TableDataCell>---</TableDataCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </>
        )}

        {activeTab === 9 && (
          <>
            <h3>Desktop Microapps</h3>
            <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
              Toggle desktop icons for special events. Disabled apps are removed from desktop icons.
            </p>
            {!desktopApps ? (
              <Hourglass size={32} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>App</TableHeadCell>
                    <TableHeadCell>Key</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                    <TableHeadCell>Action</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {desktopApps.list.map((row) => (
                    <TableRow key={row.key}>
                      <TableDataCell>{DESKTOP_APP_LABELS[row.key]}</TableDataCell>
                      <TableDataCell>{row.key}</TableDataCell>
                      <TableDataCell style={{ color: row.enabled ? "#0a6f0a" : "#8a1f1f" }}>
                        {row.enabled ? "Enabled" : "Disabled"}
                      </TableDataCell>
                      <TableDataCell>
                        <Button
                          size="sm"
                          disabled={updateDesktopAppMutation.isPending}
                          onClick={() =>
                            updateDesktopAppMutation.mutate({
                              appKey: row.key,
                              enabled: !row.enabled,
                            })
                          }
                        >
                          Turn {row.enabled ? "Off" : "On"}
                        </Button>
                      </TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
        {activeTab === 10 && (
          <>
            <h3>Contract Activity Ledger (UTC)</h3>
            <p style={{ marginBottom: 8, fontSize: 12, color: "#444" }}>
              Includes both attempted and completed contract interactions from the UX.
            </p>
            <ActionRow style={{ marginBottom: 12 }}>
              <Button active={contractLogStatus === "all"} onClick={() => setContractLogStatus("all")}>
                All
              </Button>
              <Button active={contractLogStatus === "attempt"} onClick={() => setContractLogStatus("attempt")}>
                Attempts
              </Button>
              <Button active={contractLogStatus === "success"} onClick={() => setContractLogStatus("success")}>
                Success
              </Button>
              <Button active={contractLogStatus === "failure"} onClick={() => setContractLogStatus("failure")}>
                Failure
              </Button>
              <TextInput
                placeholder="Search action, wallet, contract, op hash..."
                value={contractLogSearch}
                onChange={(e: any) => setContractLogSearch(e.target.value)}
                style={{ width: 280 }}
              />
            </ActionRow>

            {loadingContractActivityLog ? (
              <Hourglass size={32} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>UTC Time</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                    <TableHeadCell>User</TableHeadCell>
                    <TableHeadCell>Wallet</TableHeadCell>
                    <TableHeadCell>Action</TableHeadCell>
                    <TableHeadCell>Contract</TableHeadCell>
                    <TableHeadCell>Op Hash</TableHeadCell>
                    <TableHeadCell>Details</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(contractActivityLog || []).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableDataCell style={{ fontSize: 11 }}>
                        {new Date(row.createdAt).toISOString()}
                      </TableDataCell>
                      <TableDataCell
                        style={{
                          color:
                            row.status === "success"
                              ? "#0a6f0a"
                              : row.status === "failure"
                                ? "#8a1f1f"
                                : "#444",
                          fontWeight: "bold",
                        }}
                      >
                        {row.status}
                      </TableDataCell>
                      <TableDataCell>
                        <UserLink
                          username={row.username}
                          displayName={row.displayName}
                          fallback={row.userId ? `user #${row.userId}` : "anon"}
                        />
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: 10 }}>
                        {row.walletAddress || "---"}
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: 11 }}>
                        {row.module}.{row.action}
                        {row.entrypoint ? ` (${row.entrypoint})` : ""}
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: 10 }}>
                        {row.contractAddress || "---"}
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: 10 }}>
                        {row.opHash ? `${row.opHash.slice(0, 12)}...` : "---"}
                      </TableDataCell>
                      <TableDataCell style={{ fontSize: 10, maxWidth: 320 }}>
                        <div>interaction: {row.interactionId}</div>
                        <div>network: {row.network || "---"}</div>
                        {row.error ? <div style={{ color: "#8a1f1f" }}>error: {row.error}</div> : null}
                        {row.params ? (
                          <pre
                            style={{
                              marginTop: 4,
                              maxHeight: 120,
                              overflow: "auto",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {JSON.stringify(row.params, null, 2)}
                          </pre>
                        ) : null}
                      </TableDataCell>
                    </TableRow>
                  ))}
                  {(contractActivityLog || []).length === 0 && (
                    <TableRow>
                      <TableDataCell>No contract activity found.</TableDataCell>
                      <TableDataCell>---</TableDataCell>
                      <TableDataCell>---</TableDataCell>
                      <TableDataCell>---</TableDataCell>
                      <TableDataCell>---</TableDataCell>
                      <TableDataCell>---</TableDataCell>
                      <TableDataCell>---</TableDataCell>
                      <TableDataCell>---</TableDataCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </>
        )}
        {/* ═══ TAB 11: ROLES & PERMISSIONS ═══ */}
        {activeTab === 11 && (
          <>
            <h3>Roles & Permissions</h3>
            <p style={{ fontSize: 12, marginBottom: 8, color: "#444" }}>
              Toggle individual permissions for each role. Admin core permissions cannot be revoked.
            </p>

            <ActionRow style={{ marginBottom: 10, flexWrap: "wrap" }}>
              <Select
                value={permCategoryFilter}
                onChange={(e: any) => setPermCategoryFilter(e.value)}
                options={[
                  { label: "All Categories", value: "" },
                  ...PERMISSION_CATEGORIES.map((c) => ({
                    label: CATEGORY_LABELS[c],
                    value: c,
                  })),
                ]}
                width={180}
              />
              <ConfirmButton
                label="Reset All to Defaults"
                confirmLabel="Yes, Reset All"
                onConfirm={() => resetPermMutation.mutate({})}
                disabled={resetPermMutation.isPending}
              />
              {ROLE_ORDER.filter((r) => r !== "admin").map((r) => (
                <ConfirmButton
                  key={r}
                  label={`Reset ${ROLE_LABELS[r]}`}
                  confirmLabel={`Yes, Reset ${ROLE_LABELS[r]}`}
                  onConfirm={() => resetPermMutation.mutate({ role: r })}
                  disabled={resetPermMutation.isPending}
                />
              ))}
            </ActionRow>

            {!rolePerms ? (
              <Hourglass size={32} />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell style={{ minWidth: 200, position: "sticky", left: 0, background: "#c0c0c0", zIndex: 1 }}>
                        Permission
                      </TableHeadCell>
                      {ROLE_ORDER.map((role) => (
                        <TableHeadCell
                          key={role}
                          style={{ textAlign: "center", minWidth: 90 }}
                        >
                          {ROLE_LABELS[role]}
                        </TableHeadCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {PERMISSION_CATEGORIES
                      .filter((cat) => !permCategoryFilter || cat === permCategoryFilter)
                      .map((cat) => {
                        const catPerms = PERMISSIONS.filter((p) => p.category === cat);
                        if (catPerms.length === 0) return null;
                        return [
                          <tr key={`cat-${cat}`}>
                            <td
                              colSpan={ROLE_ORDER.length + 1}
                              style={{
                                background: "#000080",
                                color: "#fff",
                                fontWeight: "bold",
                                fontSize: 12,
                                padding: "4px 8px",
                              }}
                            >
                              {CATEGORY_LABELS[cat]}
                            </td>
                          </tr>,
                          ...catPerms.map((perm) => {
                            return (
                              <TableRow key={perm.key}>
                                <TableDataCell
                                  style={{
                                    fontSize: 11,
                                    position: "sticky",
                                    left: 0,
                                    background: "#c0c0c0",
                                    zIndex: 1,
                                  }}
                                  title={perm.description}
                                >
                                  <div>{perm.label}</div>
                                  <div style={{ fontSize: 9, color: "#666", marginTop: 1 }}>
                                    {perm.description}
                                  </div>
                                </TableDataCell>
                                {ROLE_ORDER.map((role) => {
                                  const granted = rolePerms[role]?.[perm.key as PermissionKey] ?? false;
                                  const isLocked =
                                    role === "admin" || role === "host";

                                  return (
                                    <TableDataCell
                                      key={role}
                                      style={{ textAlign: "center" }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={granted}
                                        disabled={
                                          isLocked ||
                                          togglePermMutation.isPending
                                        }
                                        onChange={() =>
                                          togglePermMutation.mutate({
                                            role,
                                            permissionKey: perm.key,
                                            granted: !granted,
                                          })
                                        }
                                        title={
                                          isLocked
                                            ? `${ROLE_LABELS[role]} always has all permissions`
                                            : `${granted ? "Revoke" : "Grant"} ${perm.label} for ${ROLE_LABELS[role]}`
                                        }
                                        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
                                      />
                                    </TableDataCell>
                                  );
                                })}
                              </TableRow>
                            );
                          }),
                        ];
                      })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {/* ═══ TAB 12: WTF TV ═══ */}
        {activeTab === 12 && (
          <>
            <h3>WTF TV Channel</h3>
            <p style={{ marginBottom: 12, fontSize: 13, color: "#555" }}>
              The official community channel that auto-populates from user-owned tokens.
            </p>

            {!wtfTvData ? (
              <Hourglass size={32} />
            ) : !wtfTvData.config?.channelId ? (
              <GroupBox label="Initialize">
                <p style={{ marginBottom: 8 }}>
                  No WTF TV channel exists yet. Create one to get started.
                </p>
                <Button
                  onClick={() => wtfInitMutation.mutate()}
                  disabled={wtfInitMutation.isPending}
                >
                  {wtfInitMutation.isPending ? "Creating..." : "Create WTF TV Channel"}
                </Button>
              </GroupBox>
            ) : (
              <>
                <GroupBox label="Status">
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span>
                      Channel: <strong>{wtfTvData.channelTitle || "WTF TV"}</strong>
                      {" "}(ID: {wtfTvData.config.channelId})
                    </span>
                    <span>
                      Enabled:{" "}
                      <input
                        type="checkbox"
                        checked={wtfTvData.config.enabled}
                        onChange={(e) =>
                          wtfUpdateMutation.mutate({ enabled: e.target.checked })
                        }
                      />
                    </span>
                    <span>
                      Last refresh:{" "}
                      {wtfTvData.config.lastRefreshedAt
                        ? new Date(wtfTvData.config.lastRefreshedAt).toLocaleString()
                        : "Never"}
                    </span>
                    <Button
                      onClick={() => wtfRefreshMutation.mutate()}
                      disabled={wtfRefreshMutation.isPending}
                      size="sm"
                    >
                      {wtfRefreshMutation.isPending ? "Refreshing..." : "Refresh Now"}
                    </Button>
                  </div>
                </GroupBox>

                <GroupBox label="Token Source" style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Select
                      value={wtfSourceMode}
                      onChange={(e: any) => setWtfSourceMode(e.value)}
                      options={[
                        { value: "all_users", label: "All Users" },
                        { value: "selected_users", label: "Selected Users" },
                        { value: "specific_wallets", label: "Specific Wallets" },
                      ]}
                      width={200}
                    />
                  </div>

                  {wtfSourceMode === "selected_users" && (
                    <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #888", padding: 4, marginBottom: 8 }}>
                      {(wtfTvData.users || []).map((u) => (
                        <label key={u.id} style={{ display: "block", fontSize: 12, padding: "2px 4px" }}>
                          <input
                            type="checkbox"
                            checked={wtfSelectedUsers.includes(u.id)}
                            onChange={(e) => {
                              setWtfSelectedUsers((prev) =>
                                e.target.checked
                                  ? [...prev, u.id]
                                  : prev.filter((id) => id !== u.id)
                              );
                            }}
                          />{" "}
                          {u.displayName || u.username} (@{u.username})
                        </label>
                      ))}
                    </div>
                  )}

                  {wtfSourceMode === "specific_wallets" && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <TextInput
                          value={wtfWalletInput}
                          onChange={(e: any) => setWtfWalletInput(e.target.value)}
                          placeholder="tz1... wallet address"
                          style={{ flex: 1 }}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            const addr = wtfWalletInput.trim();
                            if (addr && !wtfWallets.includes(addr)) {
                              setWtfWallets((prev) => [...prev, addr]);
                              setWtfWalletInput("");
                            }
                          }}
                        >
                          Add
                        </Button>
                      </div>
                      {wtfWallets.map((w) => (
                        <div key={w} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, padding: "2px 0" }}>
                          <span style={{ flex: 1, fontFamily: "monospace" }}>{w}</span>
                          <Button size="sm" onClick={() => setWtfWallets((prev) => prev.filter((x) => x !== w))}>
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </GroupBox>

                <GroupBox label="Playlist Settings" style={{ marginTop: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", maxWidth: 500 }}>
                    <label style={{ fontSize: 13 }}>Tokens per wallet/hour:</label>
                    <TextInput
                      type="number"
                      value={String(wtfTokensPerWallet)}
                      onChange={(e: any) => setWtfTokensPerWallet(Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: 80 }}
                    />

                    <label style={{ fontSize: 13 }}>Default duration (seconds):</label>
                    <TextInput
                      type="number"
                      value={String(wtfDuration)}
                      onChange={(e: any) => setWtfDuration(Math.max(3, Number(e.target.value) || 15))}
                      style={{ width: 80 }}
                    />

                    <label style={{ fontSize: 13 }}>Playlist size (tokens):</label>
                    <TextInput
                      type="number"
                      value={String(wtfPlaylistSize)}
                      onChange={(e: any) => setWtfPlaylistSize(Math.max(5, Number(e.target.value) || 100))}
                      style={{ width: 80 }}
                    />

                    <label style={{ fontSize: 13 }}>Auto-refresh interval (min):</label>
                    <TextInput
                      type="number"
                      value={String(wtfRefreshInterval)}
                      onChange={(e: any) => setWtfRefreshInterval(Math.max(5, Number(e.target.value) || 30))}
                      style={{ width: 80 }}
                    />
                  </div>
                </GroupBox>

                <GroupBox label="Bumper Settings" style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Select
                      value={wtfBumperMode}
                      onChange={(e: any) => setWtfBumperMode(e.value)}
                      options={[
                        { value: "community_pool", label: "Community Pool (all bumpers)" },
                        { value: "selected", label: "Selected Bumpers Only" },
                        { value: "none", label: "No Bumpers" },
                      ]}
                      width={280}
                    />
                  </div>

                  {wtfBumperMode === "selected" && (
                    <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #888", padding: 4, marginBottom: 8 }}>
                      {(wtfTvData.bumpers || []).map((b) => (
                        <label key={b.id} style={{ display: "block", fontSize: 12, padding: "2px 4px" }}>
                          <input
                            type="checkbox"
                            checked={wtfSelectedBumpers.includes(b.id)}
                            onChange={(e) => {
                              setWtfSelectedBumpers((prev) =>
                                e.target.checked
                                  ? [...prev, b.id]
                                  : prev.filter((id) => id !== b.id)
                              );
                            }}
                          />{" "}
                          {b.title} ({(b.durationMs / 1000).toFixed(1)}s)
                        </label>
                      ))}
                      {(wtfTvData.bumpers || []).length === 0 && (
                        <span style={{ fontSize: 12, color: "#888" }}>No bumpers uploaded yet</span>
                      )}
                    </div>
                  )}
                </GroupBox>

                <div style={{ marginTop: 16 }}>
                  <Button
                    primary
                    onClick={() =>
                      wtfUpdateMutation.mutate({
                        sourceMode: wtfSourceMode,
                        sourceUserIds: wtfSelectedUsers,
                        sourceWalletAddresses: wtfWallets,
                        tokensPerWalletPerHour: wtfTokensPerWallet,
                        defaultDurationSeconds: wtfDuration,
                        playlistSize: wtfPlaylistSize,
                        refreshIntervalMinutes: wtfRefreshInterval,
                        bumperMode: wtfBumperMode,
                        selectedBumperIds: wtfSelectedBumpers,
                      })
                    }
                    disabled={wtfUpdateMutation.isPending}
                  >
                    {wtfUpdateMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ TAB 13: STUDIO ═══ */}
        {activeTab === 13 && (
          <>
            <h3>Studio — Platform Drive (fallback pool)</h3>
            <p style={{ marginBottom: 12, fontSize: 13, color: "#555" }}>
              Studio projects are backed by one of three stores, in this order:
              <br />
              <strong>1.</strong> the creating user's own Google Drive (if they
              connected it in Studio → Your Drive),
              <br />
              <strong>2.</strong> <em>this</em> platform Drive account (the
              shared fallback configured here), or
              <br />
              <strong>3.</strong> the local server disk (dev / last-resort).
              <br />
              <br />
              New projects default to 5&nbsp;GB of Drive quota each. Against a
              2&nbsp;TB platform pool, ~400 projects fit before any admin
              intervention.
            </p>

            {!studioDrive ? (
              <Hourglass size={32} />
            ) : (
              <>
                <GroupBox label="Connection Status">
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12 }}>
                      <strong>Environment:</strong>{" "}
                      {studioDrive.envConfigured ? (
                        <span style={{ color: "#0b5c12" }}>
                          GOOGLE_CLIENT_ID / SECRET / REDIRECT configured
                        </span>
                      ) : (
                        <span style={{ color: "#c03027" }}>
                          missing one of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
                          GOOGLE_OAUTH_REDIRECT_URI
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <strong>Encryption key:</strong>{" "}
                      {studioDrive.cryptoConfigured ? (
                        <span style={{ color: "#0b5c12" }}>
                          STUDIO_CRYPTO_KEY (or SESSION_SECRET fallback) set
                        </span>
                      ) : (
                        <span style={{ color: "#c03027" }}>
                          missing STUDIO_CRYPTO_KEY — refresh token cannot be
                          sealed
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <strong>Platform Drive:</strong>{" "}
                      {studioDrive.connected ? (
                        <span style={{ color: "#0b5c12" }}>
                          Connected as{" "}
                          <code>{studioDrive.accountEmail ?? "(unknown)"}</code>
                        </span>
                      ) : (
                        <span style={{ color: "#c03027" }}>Not connected</span>
                      )}
                    </div>
                    {studioDrive.connectedAt && (
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Connected at{" "}
                        {new Date(studioDrive.connectedAt).toLocaleString()}
                      </div>
                    )}
                    {studioDrive.lastRefreshedAt && (
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Last token refresh{" "}
                        {new Date(studioDrive.lastRefreshedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </GroupBox>

                <GroupBox label="Connect / Disconnect" style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button
                      primary={!studioDrive.connected}
                      disabled={
                        !studioDrive.canConnect ||
                        studioDriveConnectMutation.isPending
                      }
                      onClick={() => studioDriveConnectMutation.mutate()}
                    >
                      {studioDrive.connected
                        ? "Reconnect Drive"
                        : "Connect Platform Drive"}
                    </Button>
                    {studioDrive.connected && (
                      <Button
                        disabled={studioDriveDisconnectMutation.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Disconnect the platform Drive?  New uploads will refuse until reconnected."
                            )
                          )
                            return;
                          studioDriveDisconnectMutation.mutate();
                        }}
                      >
                        {studioDriveDisconnectMutation.isPending
                          ? "Disconnecting..."
                          : "Disconnect"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => refetchStudioDrive()}
                    >
                      Reload status
                    </Button>
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                    Clicking "Connect" opens Google's consent screen in a new
                    tab.  Sign in as the platform account (e.g.{" "}
                    <code>wtfgameshowemail@gmail.com</code>), approve the
                    requested scopes, and this page will refresh with the new
                    connection on the next reload.
                  </div>
                </GroupBox>

                <GroupBox
                  label="Studio footprint (shared pool)"
                  style={{ marginTop: 12 }}
                >
                  {studioDrive.appUsage ? (
                    <div style={{ fontSize: 12, display: "grid", gap: 4 }}>
                      <div>
                        <strong>Used by Studio:</strong>{" "}
                        {formatBytesAdmin(studioDrive.appUsage.bytes)}
                      </div>
                      <div>
                        <strong>Files:</strong>{" "}
                        {studioDrive.appUsage.fileCount ?? 0}
                      </div>
                      {studioDrive.appUsage.refreshedAt && (
                        <div style={{ fontSize: 11, color: "#555" }}>
                          Refreshed{" "}
                          {new Date(
                            studioDrive.appUsage.refreshedAt
                          ).toLocaleString()}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#777" }}>
                        This is only what Studio has uploaded into this
                        Drive. The account's total Drive quota isn't
                        shown — we request only <code>drive.file</code>,
                        which can't see the account-level ceiling.
                      </div>
                      <div>
                        <Button
                          size="sm"
                          disabled={
                            studioDriveRefreshQuotaMutation.isPending ||
                            !studioDrive.connected
                          }
                          onClick={() =>
                            studioDriveRefreshQuotaMutation.mutate()
                          }
                        >
                          {studioDriveRefreshQuotaMutation.isPending
                            ? "Refreshing..."
                            : "Refresh from Drive"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: "#888" }}>
                      Not available — connect Drive first.
                    </span>
                  )}
                </GroupBox>

                <GroupBox label="Root Folder" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    Drive folder id where Studio creates per-project folders.
                    Leave blank to upload into the account's "My Drive" root.
                  </div>
                  <ActionRow>
                    <TextInput
                      value={studioRootInput}
                      onChange={(e: any) => setStudioRootInput(e.target.value)}
                      placeholder="e.g. 1A2b3C..."
                      style={{ width: 320 }}
                    />
                    <Button
                      size="sm"
                      disabled={
                        studioDriveRootFolderMutation.isPending ||
                        !studioDrive.connected
                      }
                      onClick={() =>
                        studioDriveRootFolderMutation.mutate(
                          studioRootInput.trim() === "" ? null : studioRootInput.trim()
                        )
                      }
                    >
                      {studioDriveRootFolderMutation.isPending
                        ? "Saving..."
                        : "Save root folder"}
                    </Button>
                  </ActionRow>
                </GroupBox>
              </>
            )}
          </>
        )}
      </TabBody>
    </AppWindow>
  );
}

/* ── Formatting helpers local to the Studio admin panel ── */

function formatBytesAdmin(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;
  if (bytes >= TB) return `${(bytes / TB).toFixed(2)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / KB).toFixed(0)} KB`;
}
