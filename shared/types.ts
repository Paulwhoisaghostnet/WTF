export const WTF_TOKEN = {
  contract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD",
  tokenId: 0,
  symbol: "WTF",
  decimals: 8,
  name: "WTF is a token?",
  description: "WTF is an official token of WTF is a gameshow?",
  thumbnailUri:
    "https://gold-capable-caterpillar-910.mypinata.cloud/ipfs/bafkreifcv54yfmdpvs77ik35qror3ymoy3swlthhbaoqkhj6huxr42scm4",
} as const;

export function formatWtf(raw: number | string): string {
  const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return (n / 10 ** WTF_TOKEN.decimals).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function toRawWtf(amount: number): number {
  return Math.round(amount * 10 ** WTF_TOKEN.decimals);
}

export interface TzKTTokenBalance {
  id: number;
  account: { alias?: string; address: string };
  token: {
    id: number;
    contract: { address: string };
    tokenId: string;
    standard: string;
    totalSupply: string;
    metadata: Record<string, string>;
  };
  balance: string;
  transfersCount: number;
  firstLevel: number;
  firstTime: string;
  lastLevel: number;
  lastTime: string;
}

export interface TzKTTokenTransfer {
  id: number;
  level: number;
  timestamp: string;
  token: {
    id: number;
    contract: { address: string };
    tokenId: string;
    standard: string;
    metadata: Record<string, string>;
  };
  from?: { alias?: string; address: string };
  to?: { alias?: string; address: string };
  amount: string;
  transactionId: number;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  alias?: string;
  tezDomain?: string;
  balance: string;
  balanceFormatted: string;
  transfersCount: number;
  userId?: number;
  displayName?: string;
  username?: string;
}

/** In-app XP ladder (linked accounts); complements on-chain WTF rankings. */
export interface XpLeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  experiencePoints: number;
  role: string;
  xpTierLabel: string;
  xpTierKey: string;
}

export interface XpTierInfo {
  key: string;
  label: string;
  minXp: number;
  /** XP threshold for the next band, or null when already at the top band. */
  nextTierMinXp: number | null;
}

const XP_TIER_BANDS = [
  { minXp: 0, key: "newcomer", label: "Newcomer" },
  { minXp: 50, key: "regular", label: "Regular" },
  { minXp: 200, key: "dedicated", label: "Dedicated" },
  { minXp: 500, key: "veteran", label: "Veteran" },
  { minXp: 1500, key: "legend", label: "Legend" },
  { minXp: 5000, key: "icon", label: "Show Icon" },
] as const;

export function getXpTierForTotal(totalXp: number): XpTierInfo {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let idx = 0;
  for (let i = 0; i < XP_TIER_BANDS.length; i++) {
    if (xp >= XP_TIER_BANDS[i].minXp) idx = i;
    else break;
  }
  const current = XP_TIER_BANDS[idx];
  const next = XP_TIER_BANDS[idx + 1];
  return {
    key: current.key,
    label: current.label,
    minXp: current.minXp,
    nextTierMinXp: next ? next.minXp : null,
  };
}

export const ROLE_ORDER = [
  "admin",
  "host",
  "cohost",
  "resident_wizard",
  "contestant",
  "witness",
] as const;

export type UserRole = (typeof ROLE_ORDER)[number];

export const ADMIN_PANEL_ROLES: UserRole[] = ["admin", "host", "cohost"];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  host: "Host",
  cohost: "Cohost",
  resident_wizard: "Resident Wizard",
  contestant: "Contestant",
  witness: "Witness",
};

export function getRoleRank(role: UserRole): number {
  return ROLE_ORDER.indexOf(role);
}

export function hasAtLeastRole(role: UserRole, required: UserRole): boolean {
  const roleRank = getRoleRank(role);
  const requiredRank = getRoleRank(required);
  if (roleRank < 0 || requiredRank < 0) return false;
  return roleRank <= requiredRank;
}

export function isAdmin(role: UserRole): boolean {
  return ADMIN_PANEL_ROLES.includes(role);
}

export function canManageRoles(role: UserRole): boolean {
  return ADMIN_PANEL_ROLES.includes(role);
}

export function canParticipate(role: UserRole): boolean {
  return (
    role === "admin" ||
    role === "host" ||
    role === "cohost" ||
    role === "resident_wizard" ||
    role === "contestant"
  );
}

export const DESKTOP_APPS = [
  "hoard",
  "w",
  "tv",
  "console",
  "studio",
  "gallery",
] as const;
export type DesktopAppKey = (typeof DESKTOP_APPS)[number];

export const DESKTOP_APP_LABELS: Record<DesktopAppKey, string> = {
  hoard: "Hoard!",
  w: "W",
  tv: "WTF TV",
  console: "WTF Console",
  studio: "Studio",
  gallery: "My Gallery",
};

// ---------------------------------------------------------------------------
// Studio microapp
// ---------------------------------------------------------------------------

export const STUDIO_MEMBER_ROLES = [
  "owner",
  "editor",
  "commenter",
  "viewer",
] as const;
export type StudioMemberRole = (typeof STUDIO_MEMBER_ROLES)[number];

export const STUDIO_MEMBER_ROLE_LABELS: Record<StudioMemberRole, string> = {
  owner: "Owner",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};

export function studioRoleCanEditFiles(role: StudioMemberRole): boolean {
  return role === "owner" || role === "editor";
}

export function studioRoleCanAnnotate(role: StudioMemberRole): boolean {
  return role === "owner" || role === "editor" || role === "commenter";
}

export function studioRoleCanChat(role: StudioMemberRole): boolean {
  return role === "owner" || role === "editor" || role === "commenter";
}

export function studioRoleCanInvite(role: StudioMemberRole): boolean {
  return role === "owner" || role === "editor";
}

export function studioRoleCanManageProject(role: StudioMemberRole): boolean {
  return role === "owner";
}

export const STUDIO_STORAGE_BACKENDS = ["local_disk", "google_drive"] as const;
export type StudioStorageBackend = (typeof STUDIO_STORAGE_BACKENDS)[number];

export const STUDIO_STORAGE_BACKEND_LABELS: Record<StudioStorageBackend, string> = {
  local_disk: "Platform (WTF server)",
  google_drive: "Google Drive (BYO 15GB)",
};

export const STUDIO_ANNOTATION_KINDS = [
  "pin",
  "sticky_note",
  "draw",
  "arrow",
  "rect",
  "text",
  "highlight",
] as const;
export type StudioAnnotationKind = (typeof STUDIO_ANNOTATION_KINDS)[number];

export const DM_CONVERSATION_TYPES = ["direct", "studio"] as const;
export type DmConversationType = (typeof DM_CONVERSATION_TYPES)[number];

export const DM_MESSAGE_TYPES = ["text", "studio_system", "studio_event"] as const;
export type DmMessageType = (typeof DM_MESSAGE_TYPES)[number];

/** Event keys used in both user_notifications and studio system messages. */
export const STUDIO_EVENT_KEYS = [
  "studio.project_created",
  "studio.project_archived",
  "studio.member_joined",
  "studio.member_left",
  "studio.member_role_changed",
  "studio.file_uploaded",
  "studio.file_renamed",
  "studio.file_moved",
  "studio.file_deleted",
  "studio.folder_created",
  "studio.folder_renamed",
  "studio.annotation_added",
  "studio.annotation_resolved",
  "studio.mention",
] as const;
export type StudioEventKey = (typeof STUDIO_EVENT_KEYS)[number];

/**
 * Lightweight shared shapes for the client side; server owns the full row
 * types via drizzle-zod, but the client needs enough to render.
 */
export interface StudioProjectSummary {
  id: number;
  name: string;
  description: string | null;
  ownerUserId: number;
  ownerDisplayName: string;
  coverImageUrl: string | null;
  storageBackend: StudioStorageBackend;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  archived: boolean;
  conversationId: number | null;
  memberCount: number;
  fileCount: number;
  unreadMessages: number;
  unresolvedAnnotations: number;
  updatedAt: string;
  role: StudioMemberRole;
}

export interface StudioFolderNode {
  id: number;
  name: string;
  parentFolderId: number | null;
  position: number;
}

export interface StudioFileNode {
  id: number;
  folderId: number | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailUrl: string | null;
  currentVersion: number;
  uploaderId: number | null;
  uploaderDisplayName: string | null;
  unresolvedAnnotations: number;
  updatedAt: string;
}

export interface StudioMemberSummary {
  userId: number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  role: StudioMemberRole;
  joinedAt: string;
  lastOpenedAt: string | null;
  online?: boolean;
  viewingFileId?: number | null;
}

export interface StudioAnnotationPayload {
  id: number;
  fileId: number;
  authorUserId: number;
  authorDisplayName: string | null;
  kind: StudioAnnotationKind;
  position: Record<string, unknown>;
  data: Record<string, unknown>;
  color: string | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  comments: StudioAnnotationCommentPayload[];
}

export interface StudioAnnotationCommentPayload {
  id: number;
  annotationId: number;
  authorId: number;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export interface StudioPresenceEntry {
  userId: number;
  username: string;
  role: UserRole;
  viewingFileId: number | null;
}

export function canManageMultipleTvChannels(role: UserRole): boolean {
  return role === "admin" || role === "host" || role === "cohost";
}

export function maxTvChannelsForRole(role: UserRole): number {
  return canManageMultipleTvChannels(role) ? 3 : 1;
}

export function canCreateTvChannels(role: UserRole): boolean {
  return hasAtLeastRole(role, "contestant");
}

// ---------------------------------------------------------------------------
// Permissions (Discord-style granular permission system)
// ---------------------------------------------------------------------------

export const PERMISSION_CATEGORIES = [
  "general",
  "game",
  "social",
  "market",
  "moderation",
  "admin",
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export interface PermissionDef {
  key: string;
  label: string;
  description: string;
  category: PermissionCategory;
}

export const PERMISSIONS: PermissionDef[] = [
  // ── General ──
  { key: "view_dashboard", label: "View Dashboard", description: "Access the dashboard page", category: "general" },
  { key: "edit_own_profile", label: "Edit Own Profile", description: "Change own display name, bio, avatar, PFP", category: "general" },
  { key: "link_wallets", label: "Link Wallets", description: "Connect and link Tezos wallets to account", category: "general" },
  { key: "view_leaderboard", label: "View Leaderboard", description: "Access the WTF token leaderboard", category: "general" },
  { key: "view_gallery", label: "View Gallery", description: "Browse the token gallery", category: "general" },

  // ── Game ──
  { key: "view_rounds", label: "View Rounds", description: "See rounds and round details", category: "game" },
  { key: "view_challenges", label: "View Challenges", description: "See challenges list and details", category: "game" },
  { key: "submit_challenges", label: "Submit Challenges", description: "Submit entries to active challenges", category: "game" },
  { key: "view_side_quests", label: "View Side Quests", description: "See available side quests", category: "game" },
  { key: "complete_side_quests", label: "Complete Side Quests", description: "Mark side quests as complete", category: "game" },

  // ── Social ──
  { key: "send_dms", label: "Send Direct Messages", description: "Send private messages to other users", category: "social" },
  { key: "read_message_board", label: "Read Message Board", description: "View message board threads and replies", category: "social" },
  { key: "post_message_board", label: "Post on Message Board", description: "Create threads and reply on the message board", category: "social" },
  { key: "react_messages", label: "React to Messages", description: "Add emoji reactions to messages and posts", category: "social" },
  { key: "create_tv_channel", label: "Create TV Channel", description: "Create a WTF TV channel", category: "social" },
  { key: "access_studio", label: "Access Studio", description: "Open the Studio microapp and be invited to projects", category: "social" },
  { key: "create_studio_projects", label: "Create Studio Projects", description: "Start new Studio projects and invite collaborators", category: "social" },

  // ── Market ──
  { key: "view_marketplace", label: "View Marketplace", description: "Browse marketplace listings and auctions", category: "market" },
  { key: "create_listings", label: "Create Listings", description: "List tokens for sale or auction on-chain", category: "market" },
  { key: "buy_listings", label: "Buy Listings", description: "Purchase listed tokens", category: "market" },
  { key: "place_offers", label: "Place Offers", description: "Make WTF offers on trade board tokens", category: "market" },
  { key: "manage_trade_board", label: "Manage Trade Board", description: "Add/remove own tokens on the trade board", category: "market" },
  { key: "use_swap", label: "Use Swap", description: "Access the SpicySwap DEX integration", category: "market" },

  // ── Moderation ──
  { key: "pin_threads", label: "Pin Threads", description: "Pin or unpin message board threads", category: "moderation" },
  { key: "lock_threads", label: "Lock Threads", description: "Lock or unlock threads from new replies", category: "moderation" },
  { key: "delete_any_post", label: "Delete Any Post", description: "Remove any thread or reply on the message board", category: "moderation" },
  { key: "delete_any_message", label: "Delete Any DM", description: "Remove any direct message in any conversation", category: "moderation" },
  { key: "manage_channels", label: "Manage Board Channels", description: "Create, edit, and delete board channels", category: "moderation" },
  { key: "mute_users", label: "Mute Users", description: "Temporarily restrict a user from posting", category: "moderation" },

  // ── Admin ──
  { key: "access_admin_panel", label: "Access Admin Panel", description: "Open the admin panel", category: "admin" },
  { key: "manage_users", label: "Manage Users", description: "Edit user profiles, assign roles, delete accounts", category: "admin" },
  { key: "manage_roles", label: "Manage Roles", description: "Configure role permissions", category: "admin" },
  { key: "manage_seasons", label: "Manage Seasons", description: "Create and edit seasons, rounds", category: "admin" },
  { key: "manage_challenges", label: "Manage Challenges", description: "Create, edit, grade challenges and submissions", category: "admin" },
  { key: "manage_side_quests", label: "Manage Side Quests", description: "Create and edit side quests", category: "admin" },
  { key: "manage_content", label: "Manage Content", description: "Edit links, FAQ, and site content", category: "admin" },
  { key: "manage_rewards", label: "Manage Rewards", description: "View reward ledger and mark payments", category: "admin" },
  { key: "manage_desktop_apps", label: "Manage Desktop Apps", description: "Toggle desktop app visibility", category: "admin" },
  { key: "manage_media", label: "Manage Media", description: "Moderate user-uploaded media library items", category: "admin" },
  { key: "manage_settings", label: "Manage Settings", description: "View platform diagnostics and system settings", category: "admin" },
  { key: "manage_tv", label: "Manage TV", description: "Manage WTF TV channels and global config", category: "admin" },
  { key: "manage_studio", label: "Manage Studio", description: "Moderate any Studio project, change quotas, resolve disputes", category: "admin" },
  { key: "award_xp", label: "Award XP", description: "Grant experience points to users", category: "admin" },
  { key: "view_contract_ledger", label: "View Contract Ledger", description: "See on-chain contract activity log", category: "admin" },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const CATEGORY_LABELS: Record<PermissionCategory, string> = {
  general: "General",
  game: "Game",
  social: "Social",
  market: "Market",
  moderation: "Moderation",
  admin: "Administration",
};

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  admin: [...PERMISSION_KEYS],
  host: [...PERMISSION_KEYS],
  cohost: PERMISSION_KEYS.filter(
    (k) => k !== "manage_roles" && k !== "manage_rewards"
  ),
  resident_wizard: [
    "view_dashboard", "edit_own_profile", "link_wallets", "view_leaderboard", "view_gallery",
    "view_rounds", "view_challenges", "submit_challenges", "view_side_quests", "complete_side_quests",
    "send_dms", "read_message_board", "post_message_board", "react_messages", "create_tv_channel",
    "access_studio", "create_studio_projects",
    "view_marketplace", "create_listings", "buy_listings", "place_offers", "manage_trade_board", "use_swap",
    "pin_threads", "lock_threads",
  ],
  contestant: [
    "view_dashboard", "edit_own_profile", "link_wallets", "view_leaderboard", "view_gallery",
    "view_rounds", "view_challenges", "submit_challenges", "view_side_quests", "complete_side_quests",
    "send_dms", "read_message_board", "post_message_board", "react_messages", "create_tv_channel",
    "access_studio", "create_studio_projects",
    "view_marketplace", "create_listings", "buy_listings", "place_offers", "manage_trade_board", "use_swap",
  ],
  witness: [
    "view_dashboard", "edit_own_profile", "link_wallets", "view_leaderboard", "view_gallery",
    "view_rounds", "view_challenges", "view_side_quests",
    "read_message_board", "react_messages",
    "access_studio",
    "view_marketplace", "use_swap",
  ],
};

export const RPC_URLS: Record<string, string> = {
  mainnet: "https://mainnet.ecadinfra.com",
  ghostnet: "https://ghostnet.ecadinfra.com",
};

// ---------------------------------------------------------------------------
// SpicySwap DEX constants & types
// ---------------------------------------------------------------------------

export const SPICY_API_URL = "https://spicyb.sdaotools.xyz/api/rest";
export const SPICY_ROUTER = "KT1PwoZxyv4XkPEGnTqWYvjA1UYiPTgAGyqL";
export const WTZ_CONTRACT = "KT1Pyd1r9F4nMaHy8pPZxPSq6VCn9hVbVrf4";
export const WTZ_TOKEN_CONTRACT = "KT1PnUZCp3u2KzWr93pn4DD7HAJnm3rWVrgn";
export const WTZ_TOKEN_ID = 0;
export const TEZ_DECIMALS = 6;

export const WTF_TOKEN_TAG = `${WTF_TOKEN.contract}:${WTF_TOKEN.tokenId}`;
export const XTZ_TAG = `${WTZ_TOKEN_CONTRACT}:${WTZ_TOKEN_ID}`;

export const DEFAULT_SWAP_FROM: SpicyToken = {
  name: "XTZ",
  symbol: "XTZ",
  decimals: TEZ_DECIMALS,
  img: "https://seeklogo.com/images/T/tezos-xtz-logo-C96D3F7FB9-seeklogo.com.png",
  tag: XTZ_TAG,
  derivedXtz: 1,
  derivedUsd: 0,
  totalLiquidityXtz: 0,
  totalLiquidityUsd: 0,
};

export const DEFAULT_SWAP_TO: SpicyToken = {
  name: WTF_TOKEN.name,
  symbol: WTF_TOKEN.symbol,
  decimals: WTF_TOKEN.decimals,
  img: WTF_TOKEN.thumbnailUri,
  tag: WTF_TOKEN_TAG,
  derivedXtz: 0,
  derivedUsd: 0,
  totalLiquidityXtz: 0,
  totalLiquidityUsd: 0,
};

export interface SpicyToken {
  name: string;
  symbol: string;
  decimals: number;
  img: string;
  tag: string; // "CONTRACT:TOKEN_ID" – TOKEN_ID is "null" for FA1.2
  derivedXtz: number;
  derivedUsd: number;
  totalLiquidityXtz: number;
  totalLiquidityUsd: number;
}

export interface SpicyPool {
  pairId: string;
  fromToken: SpicyToken;
  toToken: SpicyToken;
  reserveFrom: number;
  reserveTo: number;
  volumeUsd: number;
  volumeXtz: number;
}

export interface SpicyPoolMetric {
  date: string;
  reserveUsd: number;
  volumeUsd: number;
}

export interface SwapPair {
  from?: SpicyToken;
  to?: SpicyToken;
  pool?: SpicyPool;
}

export interface SwapParameters {
  fromToken: SpicyToken;
  toToken: SpicyToken;
  fromAmount: number;
  toAmount: number;
  rate: number;
  impact: number;
  slippage: number;
}

export function convertToMutez(token: SpicyToken, amount: number): number {
  return Math.floor(amount * 10 ** token.decimals);
}

export function rawToBalance(amount: number, decimals: number): number {
  return amount / 10 ** decimals;
}

export function getPoolByTags(
  pools: SpicyPool[],
  fromTag: string,
  toTag: string
): SpicyPool | undefined {
  return pools.find(
    (p) =>
      (p.fromToken.tag === fromTag || p.fromToken.tag === toTag) &&
      (p.toToken.tag === fromTag || p.toToken.tag === toTag)
  );
}
