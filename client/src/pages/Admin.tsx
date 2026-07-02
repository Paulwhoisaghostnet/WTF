import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bot,
  Boxes,
  ClipboardList,
  Coins,
  FileText,
  Gamepad2,
  Gift,
  HardDrive,
  Layers,
  MonitorCog,
  Package,
  RadioTower,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  Tv,
  UserCog,
  Users,
} from "lucide-react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiPanel } from "../components/wtfos-ui";
import { usePresentationShell } from "../lib/presentation-shell";
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
import { WDigestAdminTab } from "../features/admin/tabs/WDigestAdminTab";
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
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const gammaAdminScope = `[data-admin-presentation-host="gamma"]`;

const AdminFrame = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-3, 12px);
  overflow: hidden;
  background: var(--wtf-app-task-bg, var(--wtf-app-bg, #e8edf2));
  padding: var(--wtf-space-3, 12px);
  color: var(--wtf-app-text, #111);

  &[data-admin-presentation-host="gamma"] {
    background: #080807;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
    padding: 4px;
  }

  &[data-admin-presentation-host="gamma"] [data-admin-region],
  &[data-admin-presentation-host="gamma"] section,
  &[data-admin-presentation-host="gamma"] fieldset,
  &[data-admin-presentation-host="gamma"] table,
  &[data-admin-presentation-host="gamma"] th,
  &[data-admin-presentation-host="gamma"] td {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-admin-presentation-host="gamma"] section,
  &[data-admin-presentation-host="gamma"] fieldset,
  &[data-admin-presentation-host="gamma"] [data-admin-region="suite-title"],
  &[data-admin-presentation-host="gamma"] [data-admin-region="overview-box"],
  &[data-admin-presentation-host="gamma"] [data-admin-region="tab-body"] {
    border-color: rgba(242, 234, 217, 0.18) !important;
    border-radius: 6px !important;
    background: #10100e !important;
    color: #f2ead9 !important;
  }

  &[data-admin-presentation-host="gamma"] table {
    border-color: rgba(242, 234, 217, 0.18) !important;
    background: #0a0a09 !important;
    color: #f2ead9 !important;
  }

  &[data-admin-presentation-host="gamma"] th,
  &[data-admin-presentation-host="gamma"] td {
    border-color: rgba(242, 234, 217, 0.18) !important;
    background: transparent !important;
    color: rgba(242, 234, 217, 0.78) !important;
  }

  &[data-admin-presentation-host="gamma"] th {
    color: #f2ead9 !important;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    text-transform: uppercase;
  }

  &[data-admin-presentation-host="gamma"] input,
  &[data-admin-presentation-host="gamma"] select,
  &[data-admin-presentation-host="gamma"] textarea {
    border: 1px solid rgba(242, 234, 217, 0.22) !important;
    border-radius: 4px !important;
    background: #070706 !important;
    color: #f2ead9 !important;
    box-shadow: none !important;
    letter-spacing: 0;
  }

  &[data-admin-presentation-host="gamma"] button {
    background-image: none !important;
    box-shadow: none !important;
    letter-spacing: 0;
  }

  &[data-admin-presentation-host="gamma"] a {
    color: #00d2ff;
  }
`;

const SuiteHeader = styled.header`
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(300px, 1.2fr);
  gap: 10px;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const SuiteTitlePanel = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  box-shadow: inset 0 2px 0 var(--wtf-app-primary, var(--wtf-app-link, #000080));
  padding: var(--wtf-space-4, 16px);
  min-width: 0;

  ${gammaAdminScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    background: #10100e;
    color: #f2ead9;
    box-shadow: none;
  }
`;

const SuiteKicker = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.25;

  ${gammaAdminScope} & {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    text-transform: uppercase;
  }
`;

const SuiteTitle = styled.h2`
  margin: var(--wtf-space-1, 4px) 0 0;
  font-size: 22px;
  line-height: 1.15;
  overflow-wrap: anywhere;
`;

const SuiteSubtitle = styled.div`
  margin-top: var(--wtf-space-2, 8px);
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;

  ${gammaAdminScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
`;

const OverviewBox = styled(UiPanel)`
  margin-bottom: 0;
  min-width: 0;

  ${gammaAdminScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #10100e;
    color: #f2ead9;
    box-shadow: none;
  }
`;

const OverviewStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  gap: var(--wtf-space-2, 8px);
  font-size: var(--wtf-type-caption, 13px);
`;

const StatTile = styled.span`
  display: grid;
  gap: var(--wtf-space-1, 4px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-2, 8px);
  min-width: 0;

  ${gammaAdminScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 5px;
    background: #0a0a09;
    color: rgba(242, 234, 217, 0.7);
  }

  strong {
    font-size: 18px;
    line-height: 1;
    overflow-wrap: anywhere;

    ${gammaAdminScope} & {
      color: #f2ead9;
    }
  }

  span {
    color: var(--wtf-app-muted-text, #384352);
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.25;
    overflow-wrap: anywhere;

    ${gammaAdminScope} & {
      color: rgba(242, 234, 217, 0.62);
    }
  }
`;

const SuiteBody = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(218px, 252px) minmax(0, 1fr);
  gap: 10px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    overflow: auto;
  }
`;

const SuiteNav = styled.nav`
  min-height: 0;
  overflow: auto;
  border: 1px solid #15171a;
  background: #202326;
  color: #f7f7f4;
  box-shadow: 4px 4px 0 #15171a;
  padding: 9px;
  scrollbar-gutter: stable;

  ${gammaAdminScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #0a0a09;
    color: #f2ead9;
    box-shadow: none;
  }
`;

const NavGroup = styled.div`
  display: grid;
  gap: 5px;
  margin-bottom: 12px;
`;

const NavGroupTitle = styled.div`
  color: #f4c542;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  padding: 0 3px;

  ${gammaAdminScope} & {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    text-transform: uppercase;
  }
`;

const NavButton = styled.button<{ $active?: boolean; $accent: string }>`
  width: 100%;
  border: 1px solid ${({ $active, $accent }) => ($active ? $accent : "#5b626b")};
  background: ${({ $active }) => ($active ? "#f7f7f4" : "#2d3136")};
  color: ${({ $active }) => ($active ? "#15171a" : "#f7f7f4")};
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  text-align: left;
  padding: 8px;
  min-height: 44px;
  box-shadow: ${({ $active, $accent }) => ($active ? `3px 3px 0 ${$accent}` : "none")};
  cursor: pointer;

  ${gammaAdminScope} & {
    border-color: ${({ $active }) => ($active ? "#00d2ff" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 5px;
    background: ${({ $active }) => ($active ? "#11110f" : "transparent")};
    color: ${({ $active }) => ($active ? "#f2ead9" : "rgba(242, 234, 217, 0.72)")};
    box-shadow: none;
  }

  &:hover {
    border-color: ${({ $accent }) => $accent};
    background: ${({ $active }) => ($active ? "#ffffff" : "#383d43")};

    ${gammaAdminScope} & {
      border-color: #00d2ff;
      background: #11110f;
      color: #f2ead9;
    }
  }
`;

const NavIcon = styled.span<{ $accent: string }>`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid ${({ $accent }) => $accent};
  background: rgba(255, 255, 255, 0.08);
  color: ${({ $accent }) => $accent};

  ${gammaAdminScope} & {
    border-color: rgba(0, 210, 255, 0.58);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
  }
`;

const NavCopy = styled.span`
  min-width: 0;
  display: grid;
  gap: 1px;
`;

const NavLabel = styled.span`
  font-weight: 700;
  font-size: var(--wtf-type-caption, 13px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NavDescription = styled.span`
  color: inherit;
  opacity: 0.7;
  font-size: var(--wtf-type-caption, 13px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${gammaAdminScope} & {
    color: rgba(242, 234, 217, 0.58);
    opacity: 1;
  }
`;

const AdminTabBody = styled.section`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: var(--wtf-space-4, 16px);
  scrollbar-gutter: stable;

  ${gammaAdminScope} & {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #10100e;
    color: #f2ead9;
  }
`;

const ActivePanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  padding-bottom: 8px;

  ${gammaAdminScope} & {
    border-color: rgba(242, 234, 217, 0.18);
  }
`;

const ActivePanelTitle = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;

  h3 {
    margin: 0;
    font-size: var(--wtf-type-title, 18px);
  }

  p {
    margin: 2px 0 0;
    color: var(--wtf-app-muted-text, #384352);
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.35;

    ${gammaAdminScope} & {
      color: rgba(242, 234, 217, 0.68);
    }
  }
`;

const ActivePanelIcon = styled.span<{ $accent: string }>`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wtf-app-border, #808080);
  background: ${({ $accent }) => $accent};
  color: #111111;
  flex: 0 0 auto;

  ${gammaAdminScope} & {
    border-color: rgba(0, 210, 255, 0.58);
    border-radius: 5px;
    background: transparent;
    color: #00d2ff;
  }
`;

const ActivePanelBadge = styled.div<{ $accent: string }>`
  border: 1px solid var(--wtf-app-border, #808080);
  background: ${({ $accent }) => $accent};
  color: #111111;
  padding: 5px 8px;
  font-weight: 700;
  font-size: var(--wtf-type-caption, 13px);
  white-space: nowrap;

  ${gammaAdminScope} & {
    border-color: rgba(0, 210, 255, 0.58);
    border-radius: 5px;
    background: transparent;
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    text-transform: uppercase;
  }
`;

const EMPTY_JSON_OBJECT = "{}";

type AdminSection = {
  value: number;
  title: string;
  label: string;
  description: string;
  group: string;
  accent: string;
  Icon: LucideIcon;
};

const ADMIN_SECTIONS: AdminSection[] = [
  { value: 0, title: "Users", label: "Users", description: "Accounts, XP, roles", group: "Identity & Access", accent: "#86efac", Icon: Users },
  { value: 11, title: "Roles", label: "Role Control", description: "Permissions, apps, visibility", group: "Identity & Access", accent: "#facc15", Icon: ShieldCheck },
  { value: 17, title: "OS Admin", label: "OS Surfaces", description: "App registry, native ADM", group: "Identity & Access", accent: "#38bdf8", Icon: MonitorCog },
  { value: 9, title: "Desktop and Start Menu Apps", label: "App Gates", description: "Launchers, docs, install keys", group: "Identity & Access", accent: "#fb7185", Icon: Boxes },
  { value: 1, title: "Seasons", label: "Seasons", description: "Season structure", group: "Gameshow Ops", accent: "#fda4af", Icon: Trophy },
  { value: 2, title: "Rounds", label: "Rounds", description: "Rounds and windows", group: "Gameshow Ops", accent: "#fdba74", Icon: Layers },
  { value: 3, title: "Challenges", label: "Tasks", description: "Challenges and grading", group: "Gameshow Ops", accent: "#a7f3d0", Icon: ClipboardList },
  { value: 4, title: "Side Quests", label: "Quests", description: "Daily/social quests", group: "Gameshow Ops", accent: "#fde68a", Icon: BadgeCheck },
  { value: 18, title: "Automation", label: "Automation", description: "Triggers and rewards", group: "Gameshow Ops", accent: "#c4b5fd", Icon: Bot },
  { value: 8, title: "Rewards", label: "Rewards", description: "Ledger and payouts", group: "Economy", accent: "#bbf7d0", Icon: Gift },
  { value: 7, title: "XP Log", label: "XP", description: "Experience audit", group: "Economy", accent: "#bae6fd", Icon: Coins },
  { value: 10, title: "Contract Ledger", label: "Ledger", description: "On-chain activity", group: "Economy", accent: "#fecaca", Icon: ReceiptText },
  { value: 15, title: "In-App Market", label: "Market", description: "Catalog and pricing", group: "Economy", accent: "#bef264", Icon: ShoppingBag },
  { value: 14, title: "WTF Tez", label: "Domains", description: "Subdomain grants", group: "Platform Apps", accent: "#93c5fd", Icon: Package },
  { value: 12, title: "WTF TV", label: "TV", description: "Channels and source mode", group: "Platform Apps", accent: "#f0abfc", Icon: Tv },
  { value: 13, title: "Studio", label: "Studio", description: "Storage and Drive", group: "Platform Apps", accent: "#5eead4", Icon: HardDrive },
  { value: 16, title: "Arcade", label: "Arcade", description: "Games and reports", group: "Platform Apps", accent: "#fdba74", Icon: Gamepad2 },
  { value: 19, title: "W Digest", label: "W", description: "Digest handles", group: "Platform Apps", accent: "#d8b4fe", Icon: RadioTower },
  { value: 5, title: "Board", label: "Board", description: "Threads and moderation", group: "Content", accent: "#f9a8d4", Icon: FileText },
  { value: 6, title: "Content", label: "Content", description: "Links and FAQ", group: "Content", accent: "#cbd5e1", Icon: FileText },
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
        <UiButton size={size} onClick={onConfirm} disabled={disabled}>
          {confirmLabel || `Yes, ${label}`}
        </UiButton>
        <UiButton size={size} onClick={() => setConfirming(false)}>
          Cancel confirmation
        </UiButton>
      </ActionRow>
    );
  }
  return (
    <UiButton size={size} onClick={() => setConfirming(true)} disabled={disabled}>
      {label}
    </UiButton>
  );
}

export function Admin() {
  const presentation = usePresentationShell();
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
    roleCatalog,
    roleAccess,
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
    toggleRoleSurfaceAccessMutation,
    resetRoleSurfaceAccessMutation,
    upsertRoleMutation,
    wtfUpdateMutation,
    wtfInitMutation,
    wtfRefreshMutation,
    studioDriveConnectMutation,
    studioDriveDisconnectMutation,
    studioDriveRefreshQuotaMutation,
    studioDriveRootFolderMutation,
    assignUserRoleMutation,
    removeUserRoleMutation,
    updateUserCurseMutation,
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

  const activeSection =
    ADMIN_SECTIONS.find((section) => section.value === activeTab) ?? ADMIN_SECTIONS[0];
  const ActiveSectionIcon = activeSection.Icon;
  const groupedSections = ADMIN_SECTIONS.reduce<Record<string, AdminSection[]>>(
    (acc, section) => {
      acc[section.group] = [...(acc[section.group] ?? []), section];
      return acc;
    },
    {}
  );

  return (
    <AppWindow title="Admin Panel">
      <AdminFrame
        data-admin-presentation-host={presentation.host}
        data-admin-surface="control-suite"
        data-admin-region="frame"
      >
        <SuiteHeader data-admin-region="suite-header">
          <SuiteTitlePanel data-admin-region="suite-title">
            <SuiteKicker>wtfOS admin</SuiteKicker>
            <SuiteTitle>Control Suite</SuiteTitle>
            <SuiteSubtitle>{activeSection.group} / {activeSection.label}</SuiteSubtitle>
          </SuiteTitlePanel>

          <OverviewBox title="Live inventory" compact data-admin-region="overview-box">
            <OverviewStats data-admin-region="overview-stats">
              <StatTile data-admin-region="stat-tile"><strong>{stats?.users ?? "-"}</strong><span>Users</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.seasons ?? "-"}</strong><span>Seasons</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.rounds ?? "-"}</strong><span>Rounds</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.challenges ?? "-"}</strong><span>Tasks</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.sideQuests ?? "-"}</strong><span>Quests</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.listings ?? "-"}</strong><span>Listings</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.threads ?? "-"}</strong><span>Threads</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.links ?? "-"}</strong><span>Links</span></StatTile>
              <StatTile data-admin-region="stat-tile"><strong>{stats?.faq ?? "-"}</strong><span>FAQ</span></StatTile>
            </OverviewStats>
          </OverviewBox>
        </SuiteHeader>

        <SuiteBody data-admin-region="suite-body">
          <SuiteNav aria-label="Admin suite panels" data-admin-region="suite-nav">
            {Object.entries(groupedSections).map(([group, sections]) => (
              <NavGroup key={group} data-admin-region="nav-group">
                <NavGroupTitle data-admin-region="nav-group-title">{group}</NavGroupTitle>
                {sections.map((section) => {
                  const Icon = section.Icon;
                  const isActive = section.value === activeTab;
                  return (
                    <NavButton
                      key={section.value}
                      $active={isActive}
                      $accent={section.accent}
                      title={section.title}
                      aria-current={isActive ? "page" : undefined}
                      data-admin-region="nav-button"
                      data-admin-section={section.title}
                      onClick={() => setActiveTab(section.value)}
                    >
                      <NavIcon $accent={section.accent} data-admin-region="nav-icon">
                        <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
                      </NavIcon>
                      <NavCopy>
                        <NavLabel>{section.label}</NavLabel>
                        <NavDescription>{section.description}</NavDescription>
                      </NavCopy>
                    </NavButton>
                  );
                })}
              </NavGroup>
            ))}
          </SuiteNav>

          <AdminTabBody data-admin-region="tab-body" data-admin-active-section={activeSection.title}>
          <ActivePanelHeader data-admin-region="active-panel-header">
            <ActivePanelTitle>
              <ActivePanelIcon $accent={activeSection.accent} data-admin-region="active-panel-icon">
                <ActiveSectionIcon size={18} strokeWidth={2.4} aria-hidden="true" />
              </ActivePanelIcon>
              <div>
                <h3>{activeSection.label}</h3>
                <p>{activeSection.description}</p>
              </div>
            </ActivePanelTitle>
            <ActivePanelBadge $accent={activeSection.accent} data-admin-region="active-panel-badge">
              {activeSection.group}
            </ActivePanelBadge>
          </ActivePanelHeader>
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
            assignUserRoleMutation={assignUserRoleMutation}
            removeUserRoleMutation={removeUserRoleMutation}
            updateUserCurseMutation={updateUserCurseMutation}
            roleCatalog={roleCatalog}
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
            roleCatalog={roleCatalog}
            roleAccess={roleAccess}
            upsertRoleMutation={upsertRoleMutation}
            togglePermMutation={togglePermMutation}
            resetPermMutation={resetPermMutation}
            toggleRoleSurfaceAccessMutation={toggleRoleSurfaceAccessMutation}
            resetRoleSurfaceAccessMutation={resetRoleSurfaceAccessMutation}
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
        {activeTab === 19 && <WDigestAdminTab />}
          </AdminTabBody>
        </SuiteBody>
      </AdminFrame>
    </AppWindow>
  );
}
