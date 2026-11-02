import type { FundingWalletAction } from "./funding-types";
import type { FundingCall } from "./funding-wallet";

export interface SponsorWalletRoom {
  config: { enabled: boolean };
  roomId: string | null;
  termsHash: string | null;
  network: "mainnet" | "shadownet";
  chainId: string;
  escrowContract: string;
  houseFeeAtomic?: string | null;
  wtfToken: { contract: string; tokenId: string | number };
  terms: {
    deposit: { xtzAtomic: string };
    entry: { currency: "FREE" | "XTZ" | "WTF"; entryAtomic: string };
    tokens: Array<{ contract: string; tokenId: string }>;
  };
  self: { walletAddress: string | null };
}

const atomic = (value: string): bigint => {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error("Invalid atomic amount in this prize room.");
  return BigInt(value);
};
function exactRecord(value: unknown, expected: Record<string, unknown>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, item]) => record[key] === item);
}
function operatorCalls(action: FundingWalletAction, room: SponsorWalletRoom, asset?: { contract: string; tokenId: string }): FundingCall[] {
  const call: FundingCall = { contract: action.contract, entrypoint: action.entrypoint,
    params: action.params, amountMutez: action.amountMutez };
  if (!asset) {
    if (action.fa2Operator) throw new Error("This action must not request token permission.");
    return [call];
  }
  const operator = action.fa2Operator;
  if (!operator || operator.owner !== action.expectedWallet || operator.operator !== room.escrowContract ||
      operator.contract !== asset.contract || String(operator.tokenId) !== asset.tokenId)
    throw new Error("Token permission differs from this room's exact prize asset.");
  const permission = { owner: action.expectedWallet, operator: room.escrowContract, token_id: asset.tokenId };
  return [
    { contract: asset.contract, entrypoint: "update_operators", params: [{ add_operator: permission }], amountMutez: "0" },
    call,
    { contract: asset.contract, entrypoint: "update_operators", params: [{ remove_operator: permission }], amountMutez: "0" },
  ];
}

// Reject any server action that differs from the visible, pinned room terms.
// Only the exact escrow entrypoint is exposed to the wallet gateway.
export function sponsorWalletCalls(room: SponsorWalletRoom, action: FundingWalletAction,
  kind: string, index?: number, currency?: "XTZ" | "WTF"): FundingCall[] {
  if (!room.roomId || !room.termsHash)
    throw new Error("Prize escrow is not verified and open yet.");
  if (!room.config.enabled && ["sponsorXtz", "sponsorWtf", "sponsorLot", "entry"].includes(kind))
    throw new Error("New deposits to this prize escrow are unavailable.");
  if (action.contract !== room.escrowContract || action.network !== room.network ||
      action.chainId !== room.chainId || action.expectedWallet !== room.self.walletAddress)
    throw new Error("Wallet action differs from this room's bound wallet or chain.");
  const common = { room_id: room.roomId, expected_terms_hash: room.termsHash };
  const expectedParams: unknown = kind === "sponsorLot" ? { ...common, index }
    : ["sponsorXtz", "sponsorWtf", "entry"].includes(kind) ? common
    : ["cancel", "refundSponsorXtz", "refundSponsorWtf"].includes(kind) ? room.roomId
    : kind === "refundEntry" ? { room_id: room.roomId, player: room.self.walletAddress }
    : ["refundSponsorLot", "lotClaim"].includes(kind) ? { room_id: room.roomId, index }
    : kind === "cashClaim" ? { room_id: room.roomId, recipient: room.self.walletAddress,
      currency: currency === "XTZ" ? 0 : currency === "WTF" ? 1 : -1 }
    : null;
  const paramsMatch = typeof expectedParams === "string" ? action.params === expectedParams
    : expectedParams !== null && exactRecord(action.params, expectedParams as Record<string, unknown>);
  if (!paramsMatch) throw new Error("Wallet action differs from this room's fixed prize terms.");
  const allowed: Record<string, string> = {
    sponsorXtz: "fund_sponsor_xtz", sponsorWtf: "fund_sponsor_wtf", sponsorLot: "fund_sponsor_lot",
    entry: "join_room", cancel: "cancel_room", refundEntry: "refund_entry",
    refundSponsorXtz: "refund_sponsor_xtz", refundSponsorWtf: "refund_sponsor_wtf",
    refundSponsorLot: "refund_sponsor_lot", cashClaim: "claim_cash", lotClaim: "claim_lot",
  };
  if (action.entrypoint !== allowed[kind]) throw new Error("Unexpected escrow entrypoint for this prize action.");
  let amount = 0n, asset: { contract: string; tokenId: string } | undefined;
  if (kind === "sponsorXtz") amount = atomic(room.terms.deposit.xtzAtomic) +
    (room.terms.entry.currency === "XTZ" ? atomic(room.houseFeeAtomic || "0") : 0n);
  if (kind === "entry" && room.terms.entry.currency === "XTZ") amount = atomic(room.terms.entry.entryAtomic);
  if (kind === "sponsorWtf" || kind === "entry" && room.terms.entry.currency === "WTF")
    asset = { contract: room.wtfToken.contract, tokenId: String(room.wtfToken.tokenId) };
  if (kind === "sponsorLot") {
    const lot = room.terms.tokens[index ?? -1];
    if (!lot) throw new Error("Unknown prize token lot.");
    asset = { contract: lot.contract, tokenId: lot.tokenId };
  }
  if (atomic(action.amountMutez) !== amount)
    throw new Error("Wallet amount differs from the displayed prize or entry.");
  return operatorCalls(action, room, asset);
}
