import type { FundingActionKind } from "./funding-types";

export interface FundingCheckpoint {
  roomCode: string;
  accountId: string;
  walletAddress: string;
  network: string;
  contract: string;
  action: FundingActionKind;
  operationHash: string;
}

export interface FundingCheckpointStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function fundingCheckpointKey(accountId: string, roomCode: string): string {
  return `wtfiap:funding-operation:${encodeURIComponent(accountId)}:${encodeURIComponent(roomCode)}`;
}

export function saveFundingCheckpoint(store: FundingCheckpointStore, checkpoint: FundingCheckpoint): void {
  store.setItem(fundingCheckpointKey(checkpoint.accountId, checkpoint.roomCode), JSON.stringify(checkpoint));
}

export function loadFundingCheckpoint(store: FundingCheckpointStore, accountId: string, roomCode: string): FundingCheckpoint | null {
  const raw = store.getItem(fundingCheckpointKey(accountId, roomCode));
  if (!raw) return null;
  let value: FundingCheckpoint;
  try { value = JSON.parse(raw); } catch { throw new Error("The saved payment checkpoint is unreadable. Refresh room status before another wallet action."); }
  if (value.accountId !== accountId || value.roomCode !== roomCode ||
      typeof value.walletAddress !== "string" || typeof value.network !== "string" || typeof value.contract !== "string" ||
      !["deposit", "claim", "refund"].includes(value.action) || typeof value.operationHash !== "string" || !value.operationHash) {
    throw new Error("The saved payment checkpoint does not match this account and room.");
  }
  return value;
}

export function clearFundingCheckpoint(store: FundingCheckpointStore, accountId: string, roomCode: string): void {
  store.removeItem(fundingCheckpointKey(accountId, roomCode));
}

// One synchronous latch covers every button and keyboard route into wallet actions.
const activeActions = new Set<string | symbol>();
export function createFundingActionLatch(scope: string | symbol = Symbol("funding-action")) {
  return {
    get active() { return activeActions.has(scope); },
    async run<T>(action: () => Promise<T>): Promise<T> {
      if (activeActions.has(scope)) throw new Error("A tournament action is already in progress.");
      activeActions.add(scope);
      try { return await action(); } finally { activeActions.delete(scope); }
    },
  };
}
