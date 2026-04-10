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

export const DESKTOP_APPS = ["hoard", "w", "tv"] as const;
export type DesktopAppKey = (typeof DESKTOP_APPS)[number];

export const DESKTOP_APP_LABELS: Record<DesktopAppKey, string> = {
  hoard: "Hoard!",
  w: "W",
  tv: "WTF TV",
};

export function canManageMultipleTvChannels(role: UserRole): boolean {
  return role === "admin" || role === "host" || role === "cohost";
}

export function maxTvChannelsForRole(role: UserRole): number {
  return canManageMultipleTvChannels(role) ? 3 : 1;
}

export function canCreateTvChannels(role: UserRole): boolean {
  return hasAtLeastRole(role, "contestant");
}

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
