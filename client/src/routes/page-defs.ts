import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import {
  normalizeUserRoles,
  type DesktopAppKey,
  type UserRole,
  type UserRoleInput,
} from "@shared/types";
import {
  evaluateBrowserRouteAccess,
} from "@shared/wtf-browser-route-access";
import { BROWSER_ROUTE_META } from "@shared/wtf-browser-routes";
import { CREATION_TOOLS } from "../features/creation-tools/tool-registry";
import { findAdminSurfaceForPath } from "../features/admin-os/admin-surface-registry";

const DashboardPage = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const MissionControlPage = lazy(() =>
  import("../pages/MissionControl").then((m) => ({ default: m.MissionControl }))
);
const CommandCenterPage = lazy(() =>
  import("../pages/CommandCenter").then((m) => ({ default: m.CommandCenter }))
);
const RecoveryModePage = lazy(() =>
  import("../pages/RecoveryMode").then((m) => ({ default: m.RecoveryMode }))
);
const FileManagerPage = lazy(() =>
  import("../pages/FileManager").then((m) => ({ default: m.FileManager }))
);
const SystemSettingsPage = lazy(() =>
  import("../pages/SystemSettings").then((m) => ({ default: m.SystemSettings }))
);
const BrowserBoundariesPage = lazy(() =>
  import("../pages/BrowserBoundaries").then((m) => ({ default: m.BrowserBoundaries }))
);
const TerminalPage = lazy(() =>
  import("../pages/Terminal").then((m) => ({ default: m.Terminal }))
);
const CliShellPage = lazy(() =>
  import("../pages/CliShell").then((m) => ({ default: m.CliShell }))
);
const BackupManagerPage = lazy(() =>
  import("../pages/BackupManager").then((m) => ({ default: m.BackupManager }))
);
const RoundsPage = lazy(() =>
  import("../pages/Rounds").then((m) => ({ default: m.Rounds }))
);
const RoundDetailPage = lazy(() =>
  import("../pages/RoundDetail").then((m) => ({ default: m.RoundDetail }))
);
const ChallengesPage = lazy(() =>
  import("../pages/Challenges").then((m) => ({ default: m.Challenges }))
);
const SideQuestsPage = lazy(() =>
  import("../pages/SideQuests").then((m) => ({ default: m.SideQuests }))
);
const MessagesPage = lazy(() =>
  import("../pages/Messages").then((m) => ({ default: m.Messages }))
);
const DearDiaryPage = lazy(() =>
  import("../pages/DearDiary").then((m) => ({ default: m.DearDiary }))
);
const MessageBoardPage = lazy(() =>
  import("../pages/MessageBoard").then((m) => ({ default: m.MessageBoard }))
);
const MarketplacePage = lazy(() =>
  import("../pages/Marketplace").then((m) => ({ default: m.Marketplace }))
);
const WtfInAppMarketplacePage = lazy(() =>
  import("../pages/WtfInAppMarketplace").then((m) => ({
    default: m.WtfInAppMarketplace,
  }))
);
const TradeBoardsPage = lazy(() =>
  import("../pages/TradeBoards").then((m) => ({ default: m.TradeBoards }))
);
const WPage = lazy(() => import("../pages/W").then((m) => ({ default: m.W })));
const TVPage = lazy(() => import("../pages/TV").then((m) => ({ default: m.TV })));
const DickswordPage = lazy(() =>
  import("../pages/Dicksword").then((m) => ({ default: m.Dicksword }))
);
const IHateTelegramPage = lazy(() =>
  import("../pages/IHateTelegram").then((m) => ({ default: m.IHateTelegram }))
);
const ConsolePage = lazy(() =>
  import("../pages/Console").then((m) => ({ default: m.Console }))
);
const ArcadePage = lazy(() =>
  import("../pages/Arcade").then((m) => ({ default: m.Arcade }))
);
const CasinoPage = lazy(() =>
  import("../pages/Casino").then((m) => ({ default: m.Casino }))
);
const WtfButtonPage = lazy(() =>
  import("../pages/WtfButton").then((m) => ({ default: m.WtfButton }))
);
const RugPullPage = lazy(() =>
  import("../pages/RugPull").then((m) => ({ default: m.RugPull }))
);
const GuineaPigRacewayPage = lazy(() =>
  import("../pages/GuineaPigRaceway").then((m) => ({ default: m.GuineaPigRaceway }))
);
const DuesManagerPage = lazy(() =>
  import("../pages/DuesManager").then((m) => ({ default: m.DuesManager }))
);
const RatRacePage = lazy(() =>
  import("../pages/RatRace").then((m) => ({ default: m.RatRace }))
);
const WtfMapLabPage = lazy(() =>
  import("../pages/WtfMapLab").then((m) => ({ default: m.WtfMapLab }))
);
const GameStudioPage = lazy(() =>
  import("../pages/GameStudio").then((m) => ({ default: m.GameStudio }))
);
const CreationToolPage = lazy(() =>
  import("../pages/CreationTool").then((m) => ({ default: m.CreationTool }))
);
const SwapPage = lazy(() =>
  import("../pages/Swap").then((m) => ({ default: m.Swap }))
);
const LeaderboardPage = lazy(() =>
  import("../pages/Leaderboard").then((m) => ({ default: m.Leaderboard }))
);
const GalleryPage = lazy(() =>
  import("../pages/Gallery").then((m) => ({ default: m.Gallery }))
);
const MyGalleryPage = lazy(() =>
  import("../pages/MyGallery").then((m) => ({ default: m.MyGallery }))
);
const CollektPage = lazy(() =>
  import("../pages/Collekt").then((m) => ({ default: m.Collekt }))
);
const LinksPage = lazy(() =>
  import("../pages/Links").then((m) => ({ default: m.Links }))
);
const FaqPage = lazy(() =>
  import("../pages/Faq").then((m) => ({ default: m.Faq }))
);
const DiscordTermsPage = lazy(() =>
  import("../pages/DiscordLegal").then((m) => ({ default: m.DiscordTerms }))
);
const DiscordPrivacyPage = lazy(() =>
  import("../pages/DiscordLegal").then((m) => ({ default: m.DiscordPrivacy }))
);
const DiscordLinkedRolesPage = lazy(() =>
  import("../pages/DiscordLegal").then((m) => ({ default: m.DiscordLinkedRoles }))
);
const ProfilePage = lazy(() =>
  import("../pages/Profile").then((m) => ({ default: m.Profile }))
);
const DesktopSettingsPage = lazy(() =>
  import("../pages/DesktopSettings").then((m) => ({ default: m.DesktopSettings }))
);
const PublicProfilePage = lazy(() =>
  import("../pages/PublicProfile").then((m) => ({ default: m.PublicProfile }))
);
const AdminPage = lazy(() =>
  import("../pages/Admin").then((m) => ({ default: m.Admin }))
);
const ControlBoardPage = lazy(() =>
  import("../pages/ControlBoard").then((m) => ({ default: m.ControlBoard }))
);
const HoardPage = lazy(() =>
  import("../pages/Hoard").then((m) => ({ default: m.Hoard }))
);
const MyVideosPage = lazy(() =>
  import("../pages/MyVideos").then((m) => ({ default: m.MyVideos }))
);
const MyPhotosPage = lazy(() =>
  import("../pages/MyPhotos").then((m) => ({ default: m.MyPhotos }))
);
const MyMusicPage = lazy(() =>
  import("../pages/MyMusic").then((m) => ({ default: m.MyMusic }))
);
const TezampPage = lazy(() =>
  import("../pages/Tezamp").then((m) => ({ default: m.Tezamp }))
);
const StudioPage = lazy(() =>
  import("../pages/Studio").then((m) => ({ default: m.Studio }))
);
const StudioProjectPage = lazy(() =>
  import("../pages/StudioProject").then((m) => ({ default: m.StudioProject }))
);
const WtfRecapturePage = lazy(() =>
  import("../pages/WtfRecapture").then((m) => ({ default: m.WtfRecapture }))
);
const CalendarPage = lazy(() =>
  import("../pages/Calendar").then((m) => ({ default: m.Calendar }))
);
const MintPortalPage = lazy(() =>
  import("../pages/MintPortal").then((m) => ({ default: m.MintPortal }))
);
const ContractFactoryPage = lazy(() =>
  import("../pages/ContractFactory").then((m) => ({ default: m.ContractFactory }))
);
const OperatorWalletPage = lazy(() =>
  import("../pages/OperatorWallet").then((m) => ({ default: m.OperatorWallet }))
);
const TezosIntelPage = lazy(() =>
  import("../pages/TezosIntel").then((m) => ({ default: m.TezosIntel }))
);
const WtfSubdomainsPage = lazy(() =>
  import("../pages/WtfSubdomains").then((m) => ({ default: m.WtfSubdomains }))
);
const TaskManagerPage = lazy(() =>
  import("../pages/TaskManager").then((m) => ({ default: m.TaskManager }))
);
const UxLabPage = lazy(() =>
  import("../pages/UxLab").then((m) => ({ default: m.UxLab }))
);
const SkywirePage = lazy(() =>
  import("../pages/Skywire").then((m) => ({ default: m.Skywire }))
);
const WtfLivePage = lazy(() =>
  import("../pages/WtfLive").then((m) => ({ default: m.WtfLive }))
);
const WtfLiveRoomPage = lazy(() =>
  import("../pages/WtfLiveRoom").then((m) => ({ default: m.WtfLiveRoom }))
);
const Tz2atPage = lazy(() =>
  import("../pages/Tz2at").then((m) => ({ default: m.Tz2at }))
);
const CrpNominatePage = lazy(() =>
  import("../pages/CrpNominate").then((m) => ({ default: m.CrpNominate }))
);
const AimPage = lazy(() =>
  import("../pages/Aim").then((m) => ({ default: m.Aim }))
);
const MailPage = lazy(() =>
  import("../pages/Mail").then((m) => ({ default: m.Mail }))
);
const DigestPage = lazy(() =>
  import("../pages/Digest").then((m) => ({ default: m.Digest }))
);
const BrowserPage = lazy(() =>
  import("../pages/Browser").then((m) => ({ default: m.Browser }))
);
const MusicPage = lazy(() =>
  import("../pages/Music").then((m) => ({ default: m.Music }))
);

export interface PageDef {
  pattern: string;
  component: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  mapProps?: (params: Record<string, string>) => Record<string, any>;
  auth: boolean;
  roles?: UserRole[];
  title?: string;
  group?: "gameshow" | "social" | "market" | "media" | "create" | "casino" | "gaming" | "desktop-os" | "admin" | "public";
  startMenu?: boolean;
  desktopIcon?: boolean;
}

export type DesktopAppAvailability = Partial<Record<DesktopAppKey, boolean>>;

export type PageAccessDeniedReason = import("@shared/wtf-browser-route-access").BrowserRouteAccessDeniedReason;

export type PageAccessState =
  | { allowed: true; surfaceId: string | null; appKey: DesktopAppKey | null }
  | {
      allowed: false;
      reason: PageAccessDeniedReason;
      surfaceId: string | null;
      appKey: DesktopAppKey | null;
      appLabel?: string;
    };

function findSurfaceForPath(path: string) {
  const surface = findAdminSurfaceForPath(path);
  if (!surface) return null;
  return { id: surface.id, desktopAppKey: surface.desktopAppKey };
}

const CREATION_TOOL_DESKTOP_ICON_PATHS = new Set<string>([
  "/tools/particle-painter",
  "/tools/industrializer",
  "/tools/pauls-particles-v1",
  "/tools/nikshumika-paint",
  "/tools/kandinsky-composer",
]);

const CREATION_TOOL_PAGE_DEFS: PageDef[] = CREATION_TOOLS.map((tool) => ({
  pattern: tool.routePath,
  component: CreationToolPage,
  mapProps: () => ({ toolId: tool.id }),
  auth: true,
  title: tool.title,
  group: "create",
  startMenu: true,
  desktopIcon: CREATION_TOOL_DESKTOP_ICON_PATHS.has(tool.routePath),
}));

export const PAGE_DEFS: PageDef[] = [
  {
    pattern: "/mission-control",
    component: MissionControlPage,
    auth: true,
    title: "Mission Control",
    group: "desktop-os",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/command-palette",
    component: CommandCenterPage,
    auth: true,
    title: "Command Palette",
    group: "desktop-os",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/recovery-mode",
    component: RecoveryModePage,
    auth: true,
    title: "Recovery Mode",
    group: "desktop-os",
    startMenu: true,
  },
  {
    pattern: "/file-manager",
    component: FileManagerPage,
    auth: true,
    title: "File Manager",
    group: "desktop-os",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/settings",
    component: SystemSettingsPage,
    auth: true,
    title: "Settings",
    group: "desktop-os",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/browser-boundaries",
    component: BrowserBoundariesPage,
    auth: true,
    title: "Browser Boundaries",
    group: "desktop-os",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/terminal",
    component: TerminalPage,
    auth: true,
    title: "Terminal",
    group: "desktop-os",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/cli",
    component: CliShellPage,
    auth: true,
    title: "CLI",
    group: "desktop-os",
    startMenu: true,
  },
  {
    pattern: "/backup-manager",
    component: BackupManagerPage,
    auth: true,
    roles: ["admin"],
    title: "Backup Manager",
    group: "admin",
    startMenu: true,
  },
  { pattern: "/dashboard", component: DashboardPage, auth: true, title: "Dashboard", group: "gameshow", startMenu: true, desktopIcon: true },
  {
    pattern: "/rounds/:id",
    component: RoundDetailPage,
    mapProps: (p) => ({ roundId: p.id }),
    auth: true,
    title: "Round Detail",
    group: "gameshow",
  },
  { pattern: "/rounds", component: RoundsPage, auth: true, title: "Rounds", group: "gameshow", startMenu: true },
  { pattern: "/challenges", component: ChallengesPage, auth: true, title: "Challenges", group: "gameshow", startMenu: true },
  { pattern: "/side-quests", component: SideQuestsPage, auth: true, title: "Side Quests", group: "gameshow", startMenu: true },
  { pattern: "/messages", component: MessagesPage, auth: true, title: "Inbox", group: "social", startMenu: true },
  { pattern: "/messages/dms/:id", component: MessagesPage, auth: true, title: "Inbox", group: "social" },
  {
    pattern: "/notification-center",
    component: MessagesPage,
    mapProps: () => ({ initialTab: "notifications" }),
    auth: true,
    title: "Notification Center",
    group: "desktop-os",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/notifications",
    component: MessagesPage,
    mapProps: () => ({ initialTab: "notifications" }),
    auth: true,
    title: "Notification Center",
    group: "desktop-os",
    startMenu: true,
  },
  { pattern: "/dear-diary", component: DearDiaryPage, auth: true, title: "Dear Diary", group: "social", startMenu: true, desktopIcon: true },
  {
    pattern: "/wtfiam",
    component: WtfInAppMarketplacePage,
    auth: true,
    title: "WTF In-App Marketplace",
    group: "market",
    startMenu: true,
    desktopIcon: true,
  },
  { pattern: "/marketplace", component: MarketplacePage, auth: true, title: "On Chain Market", group: "market", startMenu: true },
  { pattern: "/rat-race", component: RatRacePage, auth: true, title: "Rat Race", group: "market", startMenu: true, desktopIcon: true },
  { pattern: "/map-lab", component: WtfMapLabPage, auth: true, title: "WTF Map Lab", group: "desktop-os", startMenu: true, desktopIcon: true },
  { pattern: "/trade-boards", component: TradeBoardsPage, auth: true, title: "Trade Boards", group: "market", startMenu: true },
  { pattern: "/w", component: WPage, auth: true, title: "W Feed", group: "social", startMenu: true },
  { pattern: "/w/post/:id", component: WPage, auth: true, title: "W Post", group: "social" },
  { pattern: "/w/chat", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/w/groupchat/:id", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/chat", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/chat/:id", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/tv", component: TVPage, auth: true, title: "WTF TV", group: "media", startMenu: true, desktopIcon: true },
  { pattern: "/dicksword", component: DickswordPage, auth: true, title: "Dicksword", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/i-hate-telegram", component: IHateTelegramPage, auth: true, title: "I Hate Telegram", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/arcade", component: ArcadePage, auth: false, title: "WTF Arcade", group: "gaming", startMenu: true, desktopIcon: true },
  { pattern: "/casino", component: CasinoPage, auth: true, title: "WTF Casino", group: "casino", startMenu: true, desktopIcon: true },
  { pattern: "/casino/wtf-button", component: WtfButtonPage, auth: true, title: "WTF Button", group: "casino" },
  { pattern: "/casino/rug-pull", component: RugPullPage, auth: true, title: "Rug Pull", group: "casino" },
  { pattern: "/casino/guinea-pig-raceway", component: GuineaPigRacewayPage, auth: true, title: "Guinea Pig Raceway", group: "casino" },
  { pattern: "/dues", component: DuesManagerPage, auth: false, title: "Club Dues Manager", group: "market", startMenu: true, desktopIcon: true },
  { pattern: "/console", component: ConsolePage, auth: true, title: "WTF Console", group: "gaming", startMenu: true, desktopIcon: true },
  { pattern: "/game-studio", component: GameStudioPage, auth: true, title: "Game Studio", group: "gaming", startMenu: true, desktopIcon: true },
  ...CREATION_TOOL_PAGE_DEFS,
  { pattern: "/swap", component: SwapPage, auth: true, title: "Swap", group: "market", startMenu: true },
  { pattern: "/profile", component: ProfilePage, auth: true, title: "Profile", group: "social", startMenu: true },
  { pattern: "/theme-builder", component: DesktopSettingsPage, auth: true, title: "Theme Builder", group: "desktop-os", startMenu: true, desktopIcon: true },
  { pattern: "/desktop-settings", component: DesktopSettingsPage, auth: true, title: "System Appearance", group: "desktop-os", startMenu: true },
  {
    pattern: "/admin",
    component: AdminPage,
    auth: true,
    roles: ["admin"],
    title: "Admin Panel",
    group: "admin",
    startMenu: true,
  },
  { pattern: "/hoard", component: HoardPage, auth: true, title: "Hoard", group: "market", startMenu: true },
  { pattern: "/my-videos", component: MyVideosPage, auth: true, title: "My Videos", group: "media", startMenu: true },
  { pattern: "/my-photos", component: MyPhotosPage, auth: true, title: "My Photos", group: "media", startMenu: true },
  { pattern: "/my-music", component: MyMusicPage, auth: true, title: "My Music", group: "media", startMenu: true },
  { pattern: "/tezamp", component: TezampPage, auth: true, title: "Tezamp", group: "media" },
  {
    pattern: "/studio/:id",
    component: StudioProjectPage,
    mapProps: (p) => ({ projectId: p.id }),
    auth: true,
    title: "Studio Project",
    group: "media",
  },
  { pattern: "/studio", component: StudioPage, auth: true, title: "Studio", group: "media", startMenu: true, desktopIcon: true },
  { pattern: "/leaderboard", component: LeaderboardPage, auth: false, title: "Leaderboard", group: "public", startMenu: true },
  { pattern: "/gallery", component: GalleryPage, auth: false, title: "Gallery", group: "public", startMenu: true },
  { pattern: "/gallery/token/:contract/:tokenId", component: GalleryPage, auth: false, title: "Gallery Token", group: "public" },
  { pattern: "/token/:contract/:tokenId", component: GalleryPage, auth: false, title: "Gallery Token", group: "public" },
  { pattern: "/my-gallery", component: MyGalleryPage, auth: true, title: "My Gallery", group: "media", startMenu: true, desktopIcon: true },
  { pattern: "/collekt", component: CollektPage, auth: true, title: "colleKT", group: "media", startMenu: true, desktopIcon: true },
  { pattern: "/tezos-intel", component: TezosIntelPage, auth: true, title: "Tezos Intel", group: "market", startMenu: true, desktopIcon: true },
  { pattern: "/wtf-subdomains", component: WtfSubdomainsPage, auth: true, title: "WTF Domains", group: "social", startMenu: true },
  { pattern: "/links", component: LinksPage, auth: false, title: "Links", group: "public", startMenu: true },
  { pattern: "/faq", component: FaqPage, auth: false, title: "FAQ", group: "public", startMenu: true },
  { pattern: "/discord/terms", component: DiscordTermsPage, auth: false, title: "Discord Terms", group: "public" },
  { pattern: "/discord/privacy", component: DiscordPrivacyPage, auth: false, title: "Discord Privacy", group: "public" },
  { pattern: "/discord/linked-roles", component: DiscordLinkedRolesPage, auth: false, title: "Discord Linked Roles", group: "public" },
  {
    pattern: "/user/:username",
    component: PublicProfilePage,
    mapProps: (p) => ({ username: p.username }),
    auth: false,
    title: "User Profile",
    group: "public",
  },
  { pattern: "/messageboard", component: MessageBoardPage, auth: false, title: "Message Board", group: "social", startMenu: true },
  { pattern: "/wtf-recapture", component: WtfRecapturePage, auth: false, title: "WTF Recapture", group: "gameshow", startMenu: true },
  { pattern: "/calendar", component: CalendarPage, auth: false, title: "Calendar", group: "gameshow", startMenu: true },
  { pattern: "/mint-portal", component: MintPortalPage, auth: true, title: "Mint Portal", group: "gameshow", startMenu: true, desktopIcon: true },
  {
    pattern: "/contract-factory",
    component: ContractFactoryPage,
    auth: true,
    roles: ["admin"],
    title: "Contract Factory",
    group: "admin",
    startMenu: true,
  },
  {
    pattern: "/operator-wallet",
    component: OperatorWalletPage,
    auth: true,
    roles: ["admin"],
    title: "Operator Wallet",
    group: "admin",
    startMenu: true,
  },
  {
    pattern: "/control-board",
    component: ControlBoardPage,
    auth: true,
    roles: ["admin"],
    title: "Control Board",
    group: "admin",
    startMenu: true,
  },
  { pattern: "/skywire", component: SkywirePage, auth: true, title: "Skywire", group: "social", startMenu: true, desktopIcon: true },
  {
    pattern: "/live/r/:roomId",
    component: WtfLiveRoomPage,
    mapProps: (p) => ({ roomId: p.roomId }),
    auth: false,
    title: "WTF LIVE Room",
    group: "social",
  },
  { pattern: "/live", component: WtfLivePage, auth: true, title: "WTF LIVE", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/tz2at", component: Tz2atPage, auth: true, title: "tz2at", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/crp-nominate", component: CrpNominatePage, auth: true, title: "CRP Nominations", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/wim", component: AimPage, auth: true, title: "WIM", group: "social", startMenu: true },
  { pattern: "/aim", component: AimPage, auth: true, title: "WIM", group: "social" },
  { pattern: "/mail", component: MailPage, auth: true, title: "WTF Mail", group: "social", startMenu: true },
  { pattern: "/digest", component: DigestPage, auth: true, title: "Digest", group: "social", startMenu: true },
  { pattern: "/browser", component: BrowserPage, auth: true, title: "Browser", group: "desktop-os", startMenu: true },
  { pattern: "/music", component: MusicPage, auth: true, title: "TezosBeats", group: "media", startMenu: true },
  {
    pattern: "/task-manager",
    component: TaskManagerPage,
    auth: true,
    title: "Task Manager",
    group: "desktop-os",
    startMenu: true,
  },
  {
    pattern: "/dev/ux-lab",
    component: UxLabPage,
    auth: true,
    roles: ["admin"],
    title: "UX Lab",
    group: "admin",
  },
];

export const FULLSCREEN_ROUTES = new Set(["/", "/login", "/register", "/cli", "/live/r/:roomId"]);

function patternToRegex(pattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

export function matchPage(path: string) {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? path;
  for (const def of PAGE_DEFS) {
    const { regex, paramNames } = patternToRegex(def.pattern);
    const match = cleanPath.match(regex);
    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      const props = def.mapProps ? def.mapProps(params) : {};
      return { def, params, props };
    }
  }
  return null;
}

export function isFullscreenRoute(path: string): boolean {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? path;
  if (FULLSCREEN_ROUTES.has(cleanPath)) return true;
  for (const pattern of FULLSCREEN_ROUTES) {
    if (patternToRegex(pattern).regex.test(cleanPath)) return true;
  }
  return false;
}

export function canOpenPageDef(
  def: PageDef,
  role: UserRoleInput,
  accessSurfaceIds: readonly string[] = [],
  apps: DesktopAppAvailability = {}
): boolean {
  return getPageAccessState(def, role, accessSurfaceIds, apps).allowed;
}

export function getPageAccessState(
  def: PageDef,
  role: UserRoleInput,
  accessSurfaceIds: readonly string[] = [],
  apps: DesktopAppAvailability = {}
): PageAccessState {
  const state = evaluateBrowserRouteAccess(def.pattern, BROWSER_ROUTE_META, {
    role,
    accessSurfaceIds,
    apps,
    findSurfaceForPath,
  });

  if (state.allowed) {
    return { allowed: true, surfaceId: state.surfaceId, appKey: state.appKey };
  }

  if (state.reason === "unknown-route") {
    return {
      allowed: false,
      reason: "role-denied",
      surfaceId: state.surfaceId,
      appKey: state.appKey,
    };
  }

  return {
    allowed: false,
    reason: state.reason,
    surfaceId: state.surfaceId,
    appKey: state.appKey,
    appLabel: state.appLabel,
  };
}

export function isWindowedRoute(path: string): boolean {
  return matchPage(path) !== null;
}
