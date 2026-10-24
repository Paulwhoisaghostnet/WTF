import { fundingEntryError, type FundingActionKind, type FundingConfig, type FundingRoom, type FundingWalletAction } from "./funding-types";

export interface FundingCall { contract: string; entrypoint: string; params: unknown; amountMutez: string }

function sameRecord(value: unknown, expected: Record<string, string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(expected).length && Object.entries(expected).every(([key, item]) => record[key] === item);
}

// This boundary accepts the specific room operation, never a general signing request from the iframe.
export function fundingCalls(config: FundingConfig, room: FundingRoom, kind: FundingActionKind, action: FundingWalletAction, walletAddress: string): FundingCall[] {
  if (!config.enabled && kind === "deposit") throw new Error("New tournament funding is unavailable.");
  if (!room.roomId || !room.termsHash) throw new Error("The room’s terms have not been frozen yet.");
  if (config.network !== room.network || config.chainId !== room.chainId || config.escrowContract !== room.escrowContract || config.wtfToken.contract !== room.wtfToken.contract || String(config.wtfToken.tokenId) !== String(room.wtfToken.tokenId)) throw new Error("The funding configuration does not match this room’s immutable settings.");
  if (!room.self.walletAddress || walletAddress !== room.self.walletAddress || action.expectedWallet !== walletAddress) throw new Error("Use the exact wallet bound to your tournament seat.");
  if (action.network !== config.network || action.chainId !== config.chainId || action.contract !== config.escrowContract) throw new Error("The wallet action does not match this room’s network and escrow.");
  if (!/^(0|[1-9]\d*)$/.test(action.amountMutez) || !/^(0|[1-9]\d*)$/.test(room.terms.entryAtomic)) throw new Error("The room contains an invalid atomic amount.");
  if (kind === "deposit") {
    const entryError = fundingEntryError(room);
    if (entryError) throw new Error(entryError);
    if (action.entrypoint !== "join_room" || !sameRecord(action.params, { room_id: room.roomId, expected_terms_hash: room.termsHash })) throw new Error("The deposit does not match this room’s frozen terms.");
    const creatorFee = room.self.playerId && room.self.playerId === room.hostPlayerId ? BigInt(room.houseFeeAtomic || "0") : 0n;
    const expectedAmount = room.terms.currency === "XTZ" ? (BigInt(room.terms.entryAtomic) + creatorFee).toString() : "0";
    if (action.amountMutez !== expectedAmount) throw new Error("The deposit amount does not match this seat’s entry and creator fee.");
  } else {
    if (action.entrypoint !== (kind === "claim" ? "claim" : "refund") || action.params !== room.roomId || action.amountMutez !== "0" || action.fa2Operator) throw new Error("The withdrawal does not match this room.");
  }
  const call: FundingCall = { contract: action.contract, entrypoint: action.entrypoint, params: action.params, amountMutez: action.amountMutez };
  if (kind !== "deposit" || room.terms.currency === "XTZ") {
    if (action.fa2Operator) throw new Error("An XTZ deposit must not change token permissions.");
    return [call];
  }
  const operator = action.fa2Operator;
  if (!operator || operator.owner !== walletAddress || operator.operator !== config.escrowContract || operator.contract !== config.wtfToken.contract || String(operator.tokenId) !== String(config.wtfToken.tokenId)) throw new Error("The WTF token permission does not match this room’s asset.");
  const permission = { owner: walletAddress, operator: config.escrowContract, token_id: String(config.wtfToken.tokenId) };
  return [
    { contract: config.wtfToken.contract, entrypoint: "update_operators", params: [{ add_operator: permission }], amountMutez: "0" },
    call,
    { contract: config.wtfToken.contract, entrypoint: "update_operators", params: [{ remove_operator: permission }], amountMutez: "0" },
  ];
}

export interface FundingWalletGateway {
  network(): string;
  assertOwnership(address: string): Promise<unknown>;
  assertReady(address: string): Promise<void>;
  chainId(): Promise<string>;
  send(calls: FundingCall[], expectedWallet: string, network: string, chainId: string): Promise<{ opHash: string }>;
}

export async function sendFundingAction(gateway: FundingWalletGateway, config: FundingConfig, room: FundingRoom, kind: FundingActionKind, action: FundingWalletAction, walletAddress: string): Promise<string> {
  const calls = fundingCalls(config, room, kind, action, walletAddress);
  if (gateway.network() !== config.network) throw new Error(`This room is fixed to Tezos ${config.network}. Select that network before continuing.`);
  await gateway.assertOwnership(walletAddress);
  await gateway.assertReady(walletAddress);
  if (gateway.network() !== config.network || await gateway.chainId() !== config.chainId) throw new Error("The active wallet RPC does not match this room’s chain.");
  const operation = await gateway.send(calls, walletAddress, config.network, config.chainId);
  if (!operation.opHash) throw new Error("The wallet did not return an operation hash. Recheck room status before trying again.");
  return operation.opHash;
}
