export type HorfPosseMember = {
  id: number;
  address: string;
  nickname: string | null;
  createdAt: string;
};

export type HorfPosseResponse = { partners: HorfPosseMember[] };

export type HorfHorseConfig = {
  status: "ready" | "unconfigured";
  network: "mainnet";
  chainId: "NetXdQprcVkpaWU";
  token: { contract: string; tokenId: "0"; decimals: 8; symbol: "HORSE" } | null;
  balanceRaw: string | null;
  asOf: string | null;
};

export type HorfHorseActivity = Omit<HorfHorseConfig, "balanceRaw"> & {
  receivedRaw: string;
  sentRaw: string;
  awardedRaw: string;
};

export type HorfGift = {
  id: number;
  from: string;
  to: string;
  token: { contract: string; tokenId: string; name: string; image: string | null };
  amount: number;
  timestamp: string;
  opHash: string;
  returnedFavor: boolean;
  returnedAt: string | null;
};

export type HorfGiftsResponse = { gifts: HorfGift[] };
