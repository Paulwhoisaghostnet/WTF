import { useState, useEffect } from "react";
import {
  Button,
  GroupBox,
  Tabs,
  Tab,
  TabBody,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { BoardAdminTab } from "../features/admin/tabs/BoardAdminTab";
import { ChallengeAutomationAdminTab } from "../features/admin/tabs/ChallengeAutomationAdminTab";
import {
  ChallengesAdminTab,
  EMPTY_CHALLENGE_FORM,
} from "../features/admin/tabs/ChallengesAdminTab";
import { ContractLedgerAdminTab } from "../features/admin/tabs/ContractLedgerAdminTab";
import { ContentAdminTab } from "../features/admin/tabs/ContentAdminTab";
import { ConsoleAdminTab } from "../features/admin/tabs/ConsoleAdminTab";
import { DesktopAppsAdminTab } from "../features/admin/tabs/DesktopAppsAdminTab";
import { InAppMarketAdminTab } from "../features/admin/tabs/InAppMarketAdminTab";
import { OsAdminSurfacesTab } from "../features/admin/tabs/OsAdminSurfacesTab";
import { RewardsAdminTab } from "../features/admin/tabs/RewardsAdminTab";
import { RolesAdminTab } from "../features/admin/tabs/RolesAdminTab";
import {
  EMPTY_ROUND_FORM,
  RoundsAdminTab,
} from "../features/admin/tabs/RoundsAdminTab";
import { SeasonsAdminTab } from "../features/admin/tabs/SeasonsAdminTab";
import {
  EMPTY_QUEST_FORM,
  SideQuestsAdminTab,
} from "../features/admin/tabs/SideQuestsAdminTab";
import { StudioAdminTab } from "../features/admin/tabs/StudioAdminTab";
import { UsersAdminTab } from "../features/admin/tabs/UsersAdminTab";
import { WtfTezAdminTab } from "../features/admin/tabs/WtfTezAdminTab";
import { WtfTvAdminTab } from "../features/admin/tabs/WtfTvAdminTab";
import { XpLogAdminTab } from "../features/admin/tabs/XpLogAdminTab";
import { useAdminDataQueries } from "../features/admin/useAdminDataQueries";
import { useAdminMutations } from "../features/admin/useAdminMutations";
import type {
  ContractLogStatus,
  RewardLedgerFilter,
  TempPasswordResult,
} from "../features/admin/types";
import { type PermissionCategory } from "@shared/types";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const AdminFrame = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
`;

const OverviewBox = styled(GroupBox)`
  flex: 0 0 auto;
  margin-bottom: 0;
`;

const OverviewStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 6px 10px;
  font-size: 12px;
`;

const TabStrip = styled(Tabs)`
  flex: 0 0 auto;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  padding-bottom: 2px;
  scrollbar-gutter: stable;
`;

const AdminTab = styled(Tab)`
  min-width: 56px;
  max-width: 108px;
  padding-left: 7px;
  padding-right: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
`;

const AdminTabBody = styled(TabBody)`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
`;

const EMPTY_JSON_OBJECT = "{}";

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
  const [activeTab, setActiveTab] = useState(0);

  const [xpLogUserFilter, setXpLogUserFilter] = useState("");
  const [ledgerFilter, setLedgerFilter] = useState<RewardLedgerFilter>("unpaid");

  const [selectedLedgerIds, setSelectedLedgerIds] = useState<Set<number>>(new Set());
  const [batchOpHash, setBatchOpHash] = useState("");

  const [contractLogStatus, setContractLogStatus] = useState<ContractLogStatus>("all");
  const [contractLogSearch, setContractLogSearch] = useState("");

  // ─── Permissions ────────────────────────────────────────
  const [permCategoryFilter, setPermCategoryFilter] = useState<PermissionCategory | "">(
    ""
  );

  // ─── WTF TV ─────────────────────────────────────────────
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

  const [studioRootInput, setStudioRootInput] = useState("");

  // ─── Users state ───────────────────────────────────────
  const [userSearch, setUserSearch] = useState("");
  const [xpInputs, setXpInputs] = useState<Record<number, { amount: string; reason: string }>>({});
  const [identityInputs, setIdentityInputs] = useState<
    Record<number, { username: string; displayName: string }>
  >({});

  const [tempPwPanels, setTempPwPanels] = useState<Record<number, boolean>>({});
  const [tempPwInputs, setTempPwInputs] = useState<
    Record<number, { password: string; expiryHours: string }>
  >({});
  const [tempPwResults, setTempPwResults] = useState<
    Record<number, TempPasswordResult | null>
  >({});
  const [dossierPanels, setDossierPanels] = useState<Record<number, boolean>>({});

  const [subdomainGrantForm, setSubdomainGrantForm] = useState({
    userId: "",
    label: "",
    notes: "",
  });

  // ─── Seasons state ─────────────────────────────────────
  const [seasonForm, setSeasonForm] = useState({
    name: "",
    number: "",
    description: "",
    mediaAssets: EMPTY_JSON_OBJECT,
  });
  const [editingSeason, setEditingSeason] = useState<any>(null);

  // ─── Rounds state ──────────────────────────────────────
  const [roundForm, setRoundForm] = useState(EMPTY_ROUND_FORM);
  const [editingRound, setEditingRound] = useState<any>(null);

  // ─── Challenges state ──────────────────────────────────
  const [challengeForm, setChallengeForm] = useState(EMPTY_CHALLENGE_FORM);
  const [editingChallenge, setEditingChallenge] = useState<any>(null);
  const [expandedChallenge, setExpandedChallenge] = useState<number | null>(null);
  const [gradeForms, setGradeForms] = useState<Record<number, { grade: string; feedback: string }>>({});

  // ─── Side Quests state ─────────────────────────────────
  const [questForm, setQuestForm] = useState(EMPTY_QUEST_FORM);
  const [editingQuest, setEditingQuest] = useState<any>(null);
  const [expandedQuest, setExpandedQuest] = useState<number | null>(null);

  // ─── Links state ───────────────────────────────────────
  const [linkForm, setLinkForm] = useState({ title: "", url: "", description: "", category: "", displayOrder: "0" });
  const [editingLink, setEditingLink] = useState<any>(null);

  // ─── FAQ state ─────────────────────────────────────────
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "", displayOrder: "0" });
  const [editingFaq, setEditingFaq] = useState<any>(null);

  // ─── Content sub-tab ───────────────────────────────────
  const [contentSubTab, setContentSubTab] = useState<"links" | "faq">("links");

  const {
    stats,
    allUsers,
    allSeasons,
    allRounds,
    allChallenges,
    allSideQuests,
    boardThreads,
    allLinks,
    allFaq,
    xpLog,
    rewardLedger,
    desktopApps,
    inAppMarketItems,
    inAppMarketSales,
    inAppMarketPricing,
    consoleModerationGames,
    consoleReports,
    consoleAuditEvents,
    arcadeStats,
    contractActivityLog,
    loadingContractActivityLog,
    wtfSubdomainGrants,
    wtfDomainsRegistrar,
    rolePerms,
    wtfTvData,
    studioDrive,
    refetchStudioDrive,
    expandedChallengeData,
    expandedQuestData,
  } = useAdminDataQueries({
    activeTab,
    ledgerFilter,
    contractLogStatus,
    contractLogSearch,
    expandedChallenge,
    expandedQuest,
  });

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

  useEffect(() => {
    if (studioDrive) {
      setStudioRootInput(studioDrive.rootFolderId ?? "");
    }
  }, [studioDrive]);

  const {
    markPaidMutation,
    batchPayMutation,
    updateDesktopAppMutation,
    updateInAppMarketItemMutation,
    createInAppMarketItemMutation,
    repriceInAppMarketMutation,
    upsertInAppMarketSaleMutation,
    deleteInAppMarketSaleMutation,
    moderateConsoleGameMutation,
    updateArcadeCreditRuleMutation,
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
  } = useAdminMutations({
    studioDriveAccountEmail: studioDrive?.accountEmail,
    refetchStudioDrive,
    expandedChallenge,
    expandedQuest,
    clearLedgerBatchSelection: () => {
      setSelectedLedgerIds(new Set());
      setBatchOpHash("");
    },
    recordTempPasswordResult: (userId, result) => {
      setTempPwResults((prev) => ({ ...prev, [userId]: result }));
    },
    resetTempPasswordInput: (userId) => {
      setTempPwInputs((prev) => ({
        ...prev,
        [userId]: { password: "", expiryHours: "24" },
      }));
    },
    resetSubdomainGrantForm: () => {
      setSubdomainGrantForm({ userId: "", label: "", notes: "" });
    },
    resetSeasonForm: () => {
      setSeasonForm({
        name: "",
        number: "",
        description: "",
        mediaAssets: EMPTY_JSON_OBJECT,
      });
    },
    clearEditingSeason: () => setEditingSeason(null),
    resetRoundForm: () => setRoundForm(EMPTY_ROUND_FORM),
    clearEditingRound: () => setEditingRound(null),
    resetChallengeForm: () => setChallengeForm(EMPTY_CHALLENGE_FORM),
    clearEditingChallenge: () => setEditingChallenge(null),
    resetQuestForm: () => {
      setQuestForm(EMPTY_QUEST_FORM);
    },
    clearEditingQuest: () => setEditingQuest(null),
    resetLinkForm: () => {
      setLinkForm({
        title: "",
        url: "",
        description: "",
        category: "",
        displayOrder: "0",
      });
    },
    clearEditingLink: () => setEditingLink(null),
    resetFaqForm: () => {
      setFaqForm({
        question: "",
        answer: "",
        category: "",
        displayOrder: "0",
      });
    },
    clearEditingFaq: () => setEditingFaq(null),
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

  return (
    <AppWindow title="Admin Panel">
      <AdminFrame>
        {/* ═══ OVERVIEW ═══ */}
        {stats && (
          <OverviewBox label="Overview">
            <OverviewStats>
              <span>Users: <strong>{stats.users}</strong></span>
              <span>Seasons: <strong>{stats.seasons}</strong></span>
              <span>Rounds: <strong>{stats.rounds}</strong></span>
              <span>Challenges: <strong>{stats.challenges}</strong></span>
              <span>Quests: <strong>{stats.sideQuests}</strong></span>
              <span>Listings: <strong>{stats.listings}</strong></span>
              <span>Threads: <strong>{stats.threads}</strong></span>
              <span>Links: <strong>{stats.links}</strong></span>
              <span>FAQ: <strong>{stats.faq}</strong></span>
            </OverviewStats>
          </OverviewBox>
        )}

        <TabStrip value={activeTab} onChange={(v: number) => setActiveTab(v)}>
          <AdminTab value={0} title="Users">Users</AdminTab>
          <AdminTab value={1} title="Seasons">Seasons</AdminTab>
          <AdminTab value={2} title="Rounds">Rounds</AdminTab>
          <AdminTab value={3} title="Challenges">Tasks</AdminTab>
          <AdminTab value={4} title="Side Quests">Quests</AdminTab>
          <AdminTab value={5} title="Board">Board</AdminTab>
          <AdminTab value={6} title="Content">Content</AdminTab>
          <AdminTab value={7} title="XP Log">XP</AdminTab>
          <AdminTab value={8} title="Rewards">Rewards</AdminTab>
          <AdminTab value={9} title="Desktop and Start Menu Apps">Apps</AdminTab>
          <AdminTab value={10} title="Contract Ledger">Ledger</AdminTab>
          <AdminTab value={11} title="Roles">Roles</AdminTab>
          <AdminTab value={12} title="WTF TV">TV</AdminTab>
          <AdminTab value={13} title="Studio">Studio</AdminTab>
          <AdminTab value={14} title="WTF Tez">Domains</AdminTab>
          <AdminTab value={15} title="In-App Market">Market</AdminTab>
          <AdminTab value={16} title="Arcade">Arcade</AdminTab>
          <AdminTab value={17} title="OS Admin">OS</AdminTab>
          <AdminTab value={18} title="Automation">Automate</AdminTab>
        </TabStrip>

        <AdminTabBody>
        {/* ═══ TAB 0: USERS ═══ */}
        {activeTab === 0 && (
          <UsersAdminTab
            filteredUsers={filteredUsers}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            xpInputs={xpInputs}
            setXpInputs={setXpInputs}
            identityInputs={identityInputs}
            setIdentityInputs={setIdentityInputs}
            tempPwPanels={tempPwPanels}
            setTempPwPanels={setTempPwPanels}
            tempPwInputs={tempPwInputs}
            setTempPwInputs={setTempPwInputs}
            tempPwResults={tempPwResults}
            dossierPanels={dossierPanels}
            setDossierPanels={setDossierPanels}
            updateRoleMutation={updateRoleMutation}
            awardXpMutation={awardXpMutation}
            updateIdentityMutation={updateIdentityMutation}
            clearUserSocialMutation={clearUserSocialMutation}
            deleteUserMutation={deleteUserMutation}
            setTempPasswordMutation={setTempPasswordMutation}
            clearTempPasswordMutation={clearTempPasswordMutation}
          />
        )}

        {/* ═══ TAB 1: SEASONS ═══ */}
        {activeTab === 1 && (
          <SeasonsAdminTab
            allSeasons={allSeasons}
            editingSeason={editingSeason}
            setEditingSeason={setEditingSeason}
            seasonForm={seasonForm}
            setSeasonForm={setSeasonForm}
            createSeasonMutation={createSeasonMutation}
            updateSeasonMutation={updateSeasonMutation}
            deleteSeasonMutation={deleteSeasonMutation}
          />
        )}

        {/* ═══ TAB 2: ROUNDS ═══ */}
        {activeTab === 2 && (
          <RoundsAdminTab
            allRounds={allRounds}
            allSeasons={allSeasons}
            roundForm={roundForm}
            setRoundForm={setRoundForm}
            editingRound={editingRound}
            setEditingRound={setEditingRound}
            createRoundMutation={createRoundMutation}
            updateRoundMutation={updateRoundMutation}
            deleteRoundMutation={deleteRoundMutation}
            ConfirmButton={ConfirmButton}
          />
        )}

        {/* ═══ TAB 3: CHALLENGES ═══ */}
        {activeTab === 3 && (
          <ChallengesAdminTab
            allChallenges={allChallenges}
            allRounds={allRounds}
            allSeasons={allSeasons}
            expandedChallengeData={expandedChallengeData}
            challengeForm={challengeForm}
            setChallengeForm={setChallengeForm}
            editingChallenge={editingChallenge}
            setEditingChallenge={setEditingChallenge}
            expandedChallenge={expandedChallenge}
            setExpandedChallenge={setExpandedChallenge}
            gradeForms={gradeForms}
            setGradeForms={setGradeForms}
            createChallengeMutation={createChallengeMutation}
            updateChallengeMutation={updateChallengeMutation}
            gradeSubmissionMutation={gradeSubmissionMutation}
            markRewardMutation={markRewardMutation}
          />
        )}

        {/* ═══ TAB 4: SIDE QUESTS ═══ */}
        {activeTab === 4 && (
          <SideQuestsAdminTab
            allSideQuests={allSideQuests}
            expandedQuestData={expandedQuestData}
            questForm={questForm}
            setQuestForm={setQuestForm}
            editingQuest={editingQuest}
            setEditingQuest={setEditingQuest}
            expandedQuest={expandedQuest}
            setExpandedQuest={setExpandedQuest}
            createQuestMutation={createQuestMutation}
            updateQuestMutation={updateQuestMutation}
            approveCompletionMutation={approveCompletionMutation}
          />
        )}

        {/* ═══ TAB 5: MESSAGE BOARD ═══ */}
        {activeTab === 5 && (
          <BoardAdminTab
            boardThreads={boardThreads}
            moderateBoardThreadMutation={moderateBoardThreadMutation}
            deleteBoardThreadMutation={deleteBoardThreadMutation}
            ConfirmButton={ConfirmButton}
          />
        )}

        {/* ═══ TAB 6: CONTENT (LINKS + FAQ) ═══ */}
        {activeTab === 6 && (
          <ContentAdminTab
            contentSubTab={contentSubTab}
            setContentSubTab={setContentSubTab}
            allLinks={allLinks}
            allFaq={allFaq}
            linkForm={linkForm}
            setLinkForm={setLinkForm}
            editingLink={editingLink}
            setEditingLink={setEditingLink}
            faqForm={faqForm}
            setFaqForm={setFaqForm}
            editingFaq={editingFaq}
            setEditingFaq={setEditingFaq}
            createLinkMutation={createLinkMutation}
            updateLinkMutation={updateLinkMutation}
            deleteLinkMutation={deleteLinkMutation}
            createFaqMutation={createFaqMutation}
            updateFaqMutation={updateFaqMutation}
            deleteFaqMutation={deleteFaqMutation}
            ConfirmButton={ConfirmButton}
          />
        )}
        {activeTab === 7 && (
          <XpLogAdminTab
            xpLog={xpLog}
            allUsers={allUsers}
            xpLogUserFilter={xpLogUserFilter}
            setXpLogUserFilter={setXpLogUserFilter}
          />
        )}
        {/* ═══ TAB 8: REWARD LEDGER ═══ */}
        {activeTab === 8 && (
          <RewardsAdminTab
            ledgerFilter={ledgerFilter}
            setLedgerFilter={setLedgerFilter}
            rewardLedger={rewardLedger}
            selectedLedgerIds={selectedLedgerIds}
            setSelectedLedgerIds={setSelectedLedgerIds}
            batchOpHash={batchOpHash}
            setBatchOpHash={setBatchOpHash}
            markPaidMutation={markPaidMutation}
            batchPayMutation={batchPayMutation}
          />
        )}

        {activeTab === 9 && (
          <DesktopAppsAdminTab
            desktopApps={desktopApps}
            updateDesktopAppMutation={updateDesktopAppMutation}
          />
        )}
        {activeTab === 10 && (
          <ContractLedgerAdminTab
            contractActivityLog={contractActivityLog}
            loadingContractActivityLog={loadingContractActivityLog}
            contractLogStatus={contractLogStatus}
            setContractLogStatus={setContractLogStatus}
            contractLogSearch={contractLogSearch}
            setContractLogSearch={setContractLogSearch}
          />
        )}
        {/* ═══ TAB 11: ROLES & PERMISSIONS ═══ */}
        {activeTab === 11 && (
          <RolesAdminTab
            permCategoryFilter={permCategoryFilter}
            setPermCategoryFilter={setPermCategoryFilter}
            rolePerms={rolePerms}
            togglePermMutation={togglePermMutation}
            resetPermMutation={resetPermMutation}
            ConfirmButton={ConfirmButton}
          />
        )}

        {/* ═══ TAB 12: WTF TV ═══ */}
        {activeTab === 12 && (
          <WtfTvAdminTab
            wtfTvData={wtfTvData}
            wtfSourceMode={wtfSourceMode}
            setWtfSourceMode={setWtfSourceMode}
            wtfSelectedUsers={wtfSelectedUsers}
            setWtfSelectedUsers={setWtfSelectedUsers}
            wtfWalletInput={wtfWalletInput}
            setWtfWalletInput={setWtfWalletInput}
            wtfWallets={wtfWallets}
            setWtfWallets={setWtfWallets}
            wtfTokensPerWallet={wtfTokensPerWallet}
            setWtfTokensPerWallet={setWtfTokensPerWallet}
            wtfDuration={wtfDuration}
            setWtfDuration={setWtfDuration}
            wtfPlaylistSize={wtfPlaylistSize}
            setWtfPlaylistSize={setWtfPlaylistSize}
            wtfRefreshInterval={wtfRefreshInterval}
            setWtfRefreshInterval={setWtfRefreshInterval}
            wtfBumperMode={wtfBumperMode}
            setWtfBumperMode={setWtfBumperMode}
            wtfSelectedBumpers={wtfSelectedBumpers}
            setWtfSelectedBumpers={setWtfSelectedBumpers}
            wtfUpdateMutation={wtfUpdateMutation}
            wtfInitMutation={wtfInitMutation}
            wtfRefreshMutation={wtfRefreshMutation}
          />
        )}

        {/* ═══ TAB 13: STUDIO ═══ */}
        {activeTab === 13 && (
          <StudioAdminTab
            studioDrive={studioDrive}
            studioRootInput={studioRootInput}
            setStudioRootInput={setStudioRootInput}
            refetchStudioDrive={refetchStudioDrive}
            studioDriveConnectMutation={studioDriveConnectMutation}
            studioDriveDisconnectMutation={studioDriveDisconnectMutation}
            studioDriveRefreshQuotaMutation={studioDriveRefreshQuotaMutation}
            studioDriveRootFolderMutation={studioDriveRootFolderMutation}
          />
        )}
        {activeTab === 14 && (
          <WtfTezAdminTab
            allUsers={allUsers}
            wtfSubdomainGrants={wtfSubdomainGrants}
            wtfDomainsRegistrar={wtfDomainsRegistrar}
            subdomainGrantForm={subdomainGrantForm}
            setSubdomainGrantForm={setSubdomainGrantForm}
            grantWtfSubdomainMutation={grantWtfSubdomainMutation}
            updateWtfSubdomainStatusMutation={updateWtfSubdomainStatusMutation}
            ConfirmButton={ConfirmButton}
          />
        )}
        {activeTab === 15 && (
          <InAppMarketAdminTab
            items={inAppMarketItems}
            sales={inAppMarketSales}
            pricing={inAppMarketPricing}
            updateInAppMarketItemMutation={updateInAppMarketItemMutation}
            createInAppMarketItemMutation={createInAppMarketItemMutation}
            repriceInAppMarketMutation={repriceInAppMarketMutation}
            upsertInAppMarketSaleMutation={upsertInAppMarketSaleMutation}
            deleteInAppMarketSaleMutation={deleteInAppMarketSaleMutation}
          />
        )}
        {activeTab === 16 && (
          <ConsoleAdminTab
            games={consoleModerationGames}
            reports={consoleReports}
            auditEvents={consoleAuditEvents}
            arcadeStats={arcadeStats}
            moderateConsoleGameMutation={moderateConsoleGameMutation}
            updateArcadeCreditRuleMutation={updateArcadeCreditRuleMutation}
            importSourceArcadeMutation={importSourceArcadeMutation}
            moderateConsoleReportMutation={moderateConsoleReportMutation}
          />
        )}
        {activeTab === 17 && (
          <OsAdminSurfacesTab
            desktopApps={desktopApps}
            updateDesktopAppMutation={updateDesktopAppMutation}
          />
        )}
        {activeTab === 18 && <ChallengeAutomationAdminTab />}
        </AdminTabBody>
      </AdminFrame>
    </AppWindow>
  );
}
