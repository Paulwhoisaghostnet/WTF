import type {
  DesktopAppKey,
  PermissionKey,
  UserRole,
} from "@shared/types";

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

export type DesktopAppsResponse = {
  apps: Record<DesktopAppKey, boolean>;
  list: Array<{ key: DesktopAppKey; enabled: boolean }>;
};

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
  contractAddress: string | null;
  contractListingId: number | null;
  active: boolean;
  stockQuantity: number;
  metadata: Record<string, unknown>;
  sortOrder: number;
  updatedAt: string;
};

export type InAppMarketAdminResponse = {
  items: InAppMarketAdminItem[];
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

export type RolePermissionMatrix = Record<
  UserRole,
  Record<PermissionKey, boolean>
>;

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
};

export type ModerateConsoleReportPayload = {
  id: number;
  action: "review" | "resolve" | "dismiss" | "reopen";
  note?: string;
};

export type UpdateInAppMarketItemPayload = {
  id: number;
  active?: boolean;
  stockQuantity?: number;
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
