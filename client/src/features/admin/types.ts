import type {
  DesktopAppKey,
  PermissionKey,
  RoleDefinition,
  UserRole,
} from "@shared/types";
import type {
  DesktopAppsResponse as SharedDesktopAppsResponse,
  DesktopAppDocStatus,
} from "@shared/desktop-apps";
import type { WtfCurseKey } from "@shared/curses";

export type BoardThread = {
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

export type RewardLedgerFilter = "all" | "unpaid" | "paid";

export type ContractLogStatus = "all" | "attempt" | "success" | "failure";

export type UpdateUserCursePayload = {
  id: number;
  curseKey: WtfCurseKey;
  active: boolean;
  reason?: string;
};

export type DesktopAppsResponse = SharedDesktopAppsResponse;

export type InAppMarketAdminItem = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  kind: string | null;
  priceWtfUnits: string;
  priceWtfFormatted: string;
  priceExp: number;
  suggestedPriceWtfUnits: string;
  suggestedPriceWtfFormatted: string;
  pricingDriftWholeWtf: number;
  rarityTier: number;
  rarityLabel: string;
  priceScore: number;
  priceWtfLocked: boolean;
  priceScoreLocked: boolean;
  contractAddress: string | null;
  contractListingId: number | null;
  active: boolean;
  stockQuantity: number;
  metadata: Record<string, unknown>;
  sortOrder: number;
  sale: {
    id: number;
    name: string;
    discountPercent: number;
    salePriceWtfUnits: string;
    salePriceWtfFormatted: string;
  } | null;
  updatedAt: string;
};

export type InAppMarketSale = {
  id: number;
  name: string;
  active: boolean;
  discountPercent: number;
  category: string | null;
  sku: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InAppMarketPricingTier = {
  tier: number;
  key: string;
  label: string;
  curve: "linear" | "log";
  minWtf: number;
  maxWtf: number;
  anchorCount: number;
};

export type InAppMarketAdminResponse = {
  items: InAppMarketAdminItem[];
  sales: InAppMarketSale[];
  pricing: {
    unitRaw: string;
    tiers: InAppMarketPricingTier[];
    activeSales: InAppMarketSale[];
  };
};

export type ConsoleModerationGame = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  embedPath: string;
  coverUri: string | null;
  builderName: string | null;
  status: string;
  active: boolean;
  playCount: number;
  playerCount: number;
  arcadeCreditsRequired: boolean;
  arcadeCreditPrice: number;
  userSubmitted: boolean;
  maxPossibleScore: number | null;
  maxScorePerSecond: number | null;
  sourceUrl: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  removedAt: string | null;
  moderationNote: string | null;
  storageMode: string | null;
  sdkVersion: string | null;
  bundleVersion: number;
  latestVersion: {
    id: number;
    version: number;
    artifactUri: string;
    sourceUrl: string | null;
    status: string;
    reviewNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
    bundleMetadata: unknown;
  } | null;
};

export type ConsoleModerationResponse = {
  games: ConsoleModerationGame[];
};

export type ConsoleGameReport = {
  id: number;
  gameId: number;
  slug: string;
  title: string;
  builderName: string | null;
  reporterUserId: number | null;
  reporterUsername: string | null;
  reporterDisplayName: string | null;
  category: string;
  reason: string;
  status: string;
  priorityScore: number;
  sameCategoryOpenCount: number;
  totalOpenCount: number;
  invalidScoreSignals: number;
  resolvedBy: number | null;
  resolverUsername: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type ConsoleReportsResponse = {
  reports: ConsoleGameReport[];
};

export type ConsoleAuditEvent = {
  id: number;
  gameId: number | null;
  slug: string | null;
  title: string | null;
  actorUserId: number | null;
  actorUsername: string | null;
  action: string;
  reason: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ConsoleAuditResponse = {
  events: ConsoleAuditEvent[];
};

export type ArcadePaymentConfig = {
  sku: string;
  currency: "wtf";
  feeWtfUnits: string;
  feeWtfFormatted: string;
  contractAddress: string | null;
  routerListingId: number;
  configured: boolean;
};

export type ArcadeStatsResponse = {
  totalGames: number;
  publishedGames: number;
  pendingGames: number;
  sourceArcadeGames?: number;
  creatorGames: number;
  gameStudioGames: number;
  totalPlays: number;
  totalPlayers: number;
  totalScores: number;
  totalConsoleXp: number;
  openReports: number;
  latestSourceArcadeImportAt?: string | null;
  latestConsoleActivityAt: string | null;
  topCategories: Array<{
    category: string;
    games: number;
    plays: number;
  }>;
  payment: ArcadePaymentConfig;
};

export type RolePermissionMatrix = Record<UserRole, Record<PermissionKey, boolean>>;

export type AdminSurfaceAccess = {
  id: string;
  label: string;
  domain: string;
  subdomain: string;
  kind: string;
  routePatterns: string[];
  desktopAppKey?: DesktopAppKey;
  adminPanelTabs: string[];
  nativeSettings: string[];
  automationHandles: string[];
  adminRoutes: string[];
};

export type RoleSurfaceAccessMatrix = Record<UserRole, Record<string, boolean>>;

export type RoleAccessResponse = {
  roles: RoleDefinition[];
  surfaces: AdminSurfaceAccess[];
  matrix: RoleSurfaceAccessMatrix;
};

export type RoleCatalogResponse = {
  roles: RoleDefinition[];
};

export type UpsertRolePayload = {
  slug: string;
  label: string;
  category: string;
  purpose: string;
  description?: string | null;
  accessLevel?: number;
  sortOrder?: number;
  color?: string | null;
  icon?: string | null;
  defaultWtfOsAccess?: boolean;
  isAssignable?: boolean;
};

export type WtfTvConfig = {
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

export type WtfTvResponse = {
  config: WtfTvConfig | null;
  channelTitle: string | null;
  users: Array<{ id: number; username: string; displayName: string | null }>;
  bumpers: Array<{
    id: number;
    title: string;
    ownerUserId: number;
    durationMs: number;
  }>;
};

export type StudioDriveStatus = {
  ok: boolean;
  envConfigured: boolean;
  cryptoConfigured: boolean;
  canConnect: boolean;
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scopes: string | null;
  rootFolderId: string | null;
  appUsage: {
    bytes: number | null;
    fileCount: number | null;
    refreshedAt: string | null;
  } | null;
  connectedAt: string | null;
  lastRefreshedAt: string | null;
};

export type StudioDriveStartResponse = {
  ok: true;
  authorizeUrl: string;
};

export type StudioDriveQuotaResponse = {
  ok: boolean;
  appUsage: { bytes: number; fileCount: number };
};

export type TempPasswordResult = {
  password: string;
  expiresAt: string;
};

export type TempPasswordResponse = TempPasswordResult & {
  ok: boolean;
  expiryHours: number;
};

export type RewardLedgerPayPayload = {
  id: number;
  opHash?: string;
};

export type RewardLedgerBatchPayPayload = {
  ids: number[];
  opHash?: string;
};

export type DesktopAppUpdatePayload = {
  appKey: DesktopAppKey;
  enabled: boolean;
  docStatus?: DesktopAppDocStatus;
  docsUpdatedAt?: string | null;
  issueInstallKey?: boolean;
  revokeInstallKey?: boolean;
};

export type ModerateConsoleReportPayload = {
  id: number;
  action: "review" | "resolve" | "dismiss" | "reopen";
  note?: string;
};

export type UpdateArcadeCreditRulePayload = {
  slug: string;
  creditsRequired: boolean;
  creditPrice: number;
  reason?: string;
};

export type UpdateInAppMarketItemPayload = {
  id: number;
  name?: string;
  description?: string | null;
  category?: string;
  kind?: string;
  priceWtfWhole?: number;
  priceExp?: number;
  active?: boolean;
  stockQuantity?: number;
  rarityTier?: number;
  priceScore?: number;
  priceWtfLocked?: boolean;
  priceScoreLocked?: boolean;
  sortOrder?: number;
  rebalance?: boolean;
};

export type CreateInAppMarketItemPayload = {
  sku: string;
  name: string;
  description?: string | null;
  category: string;
  kind: string;
  priceWtfWhole?: number;
  priceExp?: number;
  stockQuantity: number;
  active: boolean;
  rarityTier: number;
  priceScore: number;
  priceWtfLocked?: boolean;
  priceScoreLocked?: boolean;
};

export type UpsertInAppMarketSalePayload = {
  id?: number;
  name: string;
  active: boolean;
  discountPercent: number;
  category?: string | null;
  sku?: string | null;
};

export type ModerateConsoleGamePayload = {
  slug: string;
  action: "approve" | "reject" | "remove" | "restore";
  reason?: string;
};

export type TogglePermissionPayload = {
  role: string;
  permissionKey: string;
  granted: boolean;
};

export type ResetPermissionPayload = {
  role?: string;
};

export type UpdateRolePayload = {
  id: number;
  role: string;
};

export type AssignUserRolePayload = {
  id: number;
  role: UserRole;
};

export type RemoveUserRolePayload = {
  id: number;
  role: UserRole;
};

export type ToggleRoleSurfaceAccessPayload = {
  role: UserRole;
  surfaceId: string;
  granted: boolean;
};

export type ResetRoleSurfaceAccessPayload = {
  role?: UserRole;
};

export type AwardXpPayload = {
  id: number;
  amount: number;
  reason: string;
};

export type UpdateIdentityPayload = {
  id: number;
  username: string;
  displayName: string;
};

export type ClearUserSocialPayload = {
  id: number;
  provider: "twitter" | "discord";
};

export type SetTempPasswordPayload = {
  id: number;
  password: string;
  expiryHours: number;
};

export type GrantWtfSubdomainPayload = {
  userId: number;
  label: string;
  notes?: string;
};

export type UpdateWtfSubdomainStatusPayload = {
  id: number;
  status: string;
  opHash?: string;
};

export type EntityUpdatePayload = {
  id: number;
  data: any;
};

export type GradeSubmissionPayload = {
  id: number;
  grade: string;
  feedback: string;
};

export type SubmissionRewardPayload = {
  id: number;
  opHash?: string;
};

export type ApproveCompletionPayload = {
  id: number;
  approved: boolean;
};

export type ModerateBoardThreadPayload = {
  id: number;
  payload: any;
};
