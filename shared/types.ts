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
}

export type UserRole = "host" | "cohost" | "contestant" | "witness";

export function isAdmin(role: UserRole): boolean {
  return role === "host" || role === "cohost";
}

export function canParticipate(role: UserRole): boolean {
  return role === "host" || role === "cohost" || role === "contestant";
}

export const RPC_URLS: Record<string, string> = {
  mainnet: "https://mainnet.ecadinfra.com",
  ghostnet: "https://ghostnet.ecadinfra.com",
};
