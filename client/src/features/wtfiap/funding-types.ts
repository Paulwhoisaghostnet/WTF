export type FundingActionKind = "deposit" | "claim" | "refund";
export type FundingCurrency = "XTZ" | "WTF";

export interface FundingConfig {
  enabled: boolean;
  reason?: string;
  network: string;
  chainId: string;
  rpcUrl: string;
  escrowContract: string;
  wtfToken: { contract: string; tokenId: string | number; decimals: 8 };
  currencyDecimals: { XTZ: 6; WTF: 8 };
  feeQuantumAtomic?: string | null;
  refundPolicy?: string | null;
  currencyQuantaAtomic: { XTZ: string; WTF: string };
  treasuryAddress: string;
  prizeRoundingPolicy: string;
}

export interface FundingWalletAction {
  entrypoint: string;
  params: unknown;
  amountMutez: string;
  expectedWallet: string;
  contract: string;
  network: string;
  chainId: string;
  fa2Operator?: { contract: string; tokenId: string | number; owner: string; operator: string };
}

export interface FundingRoom {
  roomCode: string;
  roomType: "duel" | "tournament";
  aiFill: boolean;
  battlefieldSeats: number;
  payingEntrants: number;
  status: string;
  terms: { currency: FundingCurrency; entryFee: string; entryAtomic: string; decimals: number; prizePercentages?: string[]; payoutPolicy?: string };
  roomId: string | null;
  termsHash: string | null;
  network: string;
  chainId: string;
  escrowContract: string;
  wtfToken: FundingConfig["wtfToken"];
  feeQuantumAtomic?: string | null;
  refundPolicy?: string | null;
  treasuryAddress: string;
  prizeRoundingPolicy: string;
  prizeSummary: null | { quantumAtomic: string; allocatedPlayerPrizesAtomic: string; treasuryRemainderAtomic: string; treasuryClaimed: boolean };
  roster: Array<{ playerId: string; name: string; walletAddress: string | null; deposited: boolean }>;
  depositedCount: number;
  potAtomic: string;
  chainStatus: string | null;
  lastReconciledAt: string | null;
  finalizedBlock: null | { hash: string; level: number };
  operations: Array<{ kind: string; status: string; operationHash?: string | null }>;
  self: {
    playerId: string | null;
    walletAddress: string | null;
    canBind: boolean;
    canOpen: boolean;
    canStart: boolean;
    payout: null | { amount: string; claimed: boolean };
    pendingOperations: Array<{ playerId: string; action: FundingActionKind; operationHash: string; observedAt: string; status?: "pending" | "applied" | "failed" }>;
    actions: Partial<Record<FundingActionKind, FundingWalletAction>>;
  };
  health: { lastAttemptAt: string | null; lastSuccessAt: string | null; error: string | null; headStreamConnected: boolean };
}

export function fundingEntryError(room: Pick<FundingRoom, "feeQuantumAtomic" | "terms">): string | null {
  if (!room.feeQuantumAtomic || !/^[1-9]\d*$/.test(room.feeQuantumAtomic)) return "This room has no approved entry increment. Escrow cannot open yet.";
  if (!/^[1-9]\d*$/.test(room.terms.entryAtomic) || BigInt(room.terms.entryAtomic) % BigInt(room.feeQuantumAtomic) !== 0n) {
    return `Entry must be a positive multiple of ${formatFundingAmount(room.feeQuantumAtomic, room.terms.decimals)} ${room.terms.currency}. Create a room with a valid entry before opening escrow.`;
  }
  return null;
}

export function formatFundingAmount(atomic: string, decimals: number): string {
  if (!/^\d+$/.test(atomic)) throw new Error("Invalid tournament amount.");
  const scale = 10n ** BigInt(decimals);
  const value = BigInt(atomic);
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}
