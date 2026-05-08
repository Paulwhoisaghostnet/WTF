import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type { UserRole } from "@shared/types";

const DashboardPage = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.Dashboard }))
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
const ConsolePage = lazy(() =>
  import("../pages/Console").then((m) => ({ default: m.Console }))
);
const ArcadePage = lazy(() =>
  import("../pages/Arcade").then((m) => ({ default: m.Arcade }))
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
const UxLabPage = lazy(() =>
  import("../pages/UxLab").then((m) => ({ default: m.UxLab }))
);

export interface PageDef {
  pattern: string;
  component: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  mapProps?: (params: Record<string, string>) => Record<string, any>;
  auth: boolean;
  roles?: UserRole[];
  title?: string;
  group?: "gameshow" | "social" | "market" | "media" | "admin" | "public";
  startMenu?: boolean;
  desktopIcon?: boolean;
}

export const PAGE_DEFS: PageDef[] = [
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
    pattern: "/wtfiam",
    component: WtfInAppMarketplacePage,
    auth: true,
    title: "WTF In-App Marketplace",
    group: "market",
    startMenu: true,
    desktopIcon: true,
  },
  { pattern: "/marketplace", component: MarketplacePage, auth: true, title: "On Chain Market", group: "market", startMenu: true },
  { pattern: "/trade-boards", component: TradeBoardsPage, auth: true, title: "Trade Boards", group: "market", startMenu: true },
  { pattern: "/w", component: WPage, auth: true, title: "W Feed", group: "social", startMenu: true },
  { pattern: "/w/post/:id", component: WPage, auth: true, title: "W Post", group: "social" },
  { pattern: "/w/chat", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/w/groupchat/:id", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/chat", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/chat/:id", component: WPage, auth: true, title: "W Chat", group: "social" },
  { pattern: "/tv", component: TVPage, auth: true, title: "WTF TV", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/dicksword", component: DickswordPage, auth: true, title: "Dicksword", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/arcade", component: ArcadePage, auth: false, title: "WTF Arcade", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/console", component: ConsolePage, auth: true, title: "WTF Console", group: "social", startMenu: true, desktopIcon: true },
  { pattern: "/game-studio", component: GameStudioPage, auth: true, title: "Game Studio", group: "media", startMenu: true, desktopIcon: true },
  {
    pattern: "/tools/particle-painter",
    component: CreationToolPage,
    mapProps: () => ({ toolId: "particle-painter" }),
    auth: true,
    title: "PArticle Painter",
    group: "media",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/tools/industrializer",
    component: CreationToolPage,
    mapProps: () => ({ toolId: "industrializer" }),
    auth: true,
    title: "INDUSTR1ALIZER",
    group: "media",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/tools/pauls-particles-v1",
    component: CreationToolPage,
    mapProps: () => ({ toolId: "pauls-particles-v1" }),
    auth: true,
    title: "Paul's Particles V1.0",
    group: "media",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/tools/nikshumika-paint",
    component: CreationToolPage,
    mapProps: () => ({ toolId: "nikshumika-paint" }),
    auth: true,
    title: "Nikshumika Paint",
    group: "media",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/tools/kandinsky-composer",
    component: CreationToolPage,
    mapProps: () => ({ toolId: "kandinsky-composer" }),
    auth: true,
    title: "Kandinsky Composer",
    group: "media",
    startMenu: true,
    desktopIcon: true,
  },
  { pattern: "/swap", component: SwapPage, auth: true, title: "Swap", group: "market", startMenu: true },
  { pattern: "/profile", component: ProfilePage, auth: true, title: "Profile", group: "social", startMenu: true },
  { pattern: "/desktop-settings", component: DesktopSettingsPage, auth: true, title: "System Appearance", group: "social", startMenu: true },
  {
    pattern: "/admin",
    component: AdminPage,
    auth: true,
    roles: ["admin", "host", "cohost"],
    title: "Admin Panel",
    group: "admin",
    startMenu: true,
  },
  {
    pattern: "/control-board",
    component: ControlBoardPage,
    auth: true,
    roles: ["admin", "host", "cohost"],
    title: "Gameshow Control",
    group: "admin",
    startMenu: true,
  },
  { pattern: "/hoard", component: HoardPage, auth: true, title: "Hoard", group: "market", startMenu: true },
  { pattern: "/my-videos", component: MyVideosPage, auth: true, title: "My Videos", group: "media", startMenu: true },
  { pattern: "/my-photos", component: MyPhotosPage, auth: true, title: "My Photos", group: "media", startMenu: true },
  { pattern: "/my-music", component: MyMusicPage, auth: true, title: "My Music", group: "media", startMenu: true },
  { pattern: "/tezamp", component: TezampPage, auth: true, title: "Tezamp", group: "media" },
  {
    pattern: "/tezamp/winamp-bootloader",
    component: TezampPage,
    mapProps: () => ({ mode: "winamp-bootloader" }),
    auth: true,
    title: "Winamp Bootloader",
    group: "media",
    startMenu: true,
    desktopIcon: true,
  },
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
    roles: ["admin", "host", "cohost"],
    title: "Contract Factory",
    group: "admin",
    startMenu: true,
  },
  {
    pattern: "/operator-wallet",
    component: OperatorWalletPage,
    auth: true,
    roles: ["admin", "host", "cohost"],
    title: "Operator Wallet",
    group: "admin",
    startMenu: true,
  },
  {
    pattern: "/control-board",
    component: ControlBoardPage,
    auth: true,
    roles: ["admin", "host", "cohost"],
    title: "Control Board",
    group: "admin",
    startMenu: true,
    desktopIcon: true,
  },
  {
    pattern: "/dev/ux-lab",
    component: UxLabPage,
    auth: true,
    roles: ["admin", "host", "cohost"],
    title: "UX Lab",
    group: "admin",
  },
];

export const FULLSCREEN_ROUTES = new Set(["/", "/login", "/register"]);

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
  for (const def of PAGE_DEFS) {
    const { regex, paramNames } = patternToRegex(def.pattern);
    const match = path.match(regex);
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

export function isWindowedRoute(path: string): boolean {
  return matchPage(path) !== null;
}
