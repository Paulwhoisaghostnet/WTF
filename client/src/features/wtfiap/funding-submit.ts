import { clearFundingCheckpoint, fundingCheckpointKey, loadFundingCheckpoint, saveFundingCheckpoint, type FundingCheckpoint, type FundingCheckpointStore } from "./funding-checkpoint";
import type { FundingActionKind, FundingConfig, FundingRoom } from "./funding-types";
import { sendFundingAction, type FundingWalletGateway } from "./funding-wallet";

export interface FundingSubmissionDependencies {
  store: FundingCheckpointStore;
  gateway: FundingWalletGateway;
  observe(checkpoint: FundingCheckpoint): Promise<FundingRoom>;
  onSubmitted(checkpoint: FundingCheckpoint): void;
}

export function acknowledgeFundingCheckpoint(store: FundingCheckpointStore, accountId: string, room: FundingRoom, checkpoint: FundingCheckpoint): boolean {
  if (checkpoint.accountId !== accountId || checkpoint.roomCode !== room.roomCode || checkpoint.walletAddress !== room.self.walletAddress || checkpoint.network !== room.network || checkpoint.contract !== room.escrowContract) return false;
  const operation = room.operations.find(item => item.operationHash === checkpoint.operationHash);
  const observation = room.self.pendingOperations.find(item => item.operationHash === checkpoint.operationHash && item.action === checkpoint.action);
  if (operation?.status !== "applied" && operation?.status !== "failed" && observation?.status !== "failed" && observation?.status !== "applied" && !fundingActionCompleted(room, checkpoint.action)) return false;
  clearFundingCheckpoint(store, accountId, room.roomCode);
  return true;
}

export function fundingActionCompleted(room: FundingRoom, action: FundingActionKind): boolean {
  if (!room.finalizedBlock) return false;
  if (action === "deposit") return room.roster.some(player => player.playerId === room.self.playerId && player.walletAddress === room.self.walletAddress && player.deposited);
  if (action === "claim") return room.self.payout?.claimed === true;
  return false;
}

export async function submitFundingAction(dependencies: FundingSubmissionDependencies, accountId: string, config: FundingConfig, room: FundingRoom, kind: FundingActionKind, walletAddress: string): Promise<FundingRoom> {
  if (loadFundingCheckpoint(dependencies.store, accountId, room.roomCode)) throw new Error("A submitted operation is awaiting verification. Recheck its status instead of sending again.");
  if (room.self.pendingOperations.some(item => item.status !== "failed" && item.status !== "applied" && !fundingActionCompleted(room, item.action))) throw new Error("The server is tracking a submitted operation. Recheck its status instead of sending again.");
  const action = room.self.actions[kind];
  if (!action) throw new Error("This wallet action is not available for your seat.");
  // Ensure recovery storage is writable before asking a wallet to submit anything.
  const probe = `${fundingCheckpointKey(accountId, room.roomCode)}:storage-check`;
  dependencies.store.setItem(probe, "available");
  dependencies.store.removeItem(probe);
  const operationHash = await sendFundingAction(dependencies.gateway, config, room, kind, action, walletAddress);
  const checkpoint: FundingCheckpoint = { accountId, roomCode: room.roomCode, walletAddress, network: config.network, contract: config.escrowContract, action: kind, operationHash };
  // The public hash is retained before any confirmation or HTTP request can fail.
  dependencies.onSubmitted(checkpoint);
  let storageError: unknown;
  try { saveFundingCheckpoint(dependencies.store, checkpoint); } catch (error) { storageError = error; }
  const updated = await dependencies.observe(checkpoint);
  const acknowledged = acknowledgeFundingCheckpoint(dependencies.store, accountId, updated, checkpoint);
  if (storageError && !acknowledged) throw new Error(`Submitted ${operationHash}. Browser recovery storage failed; keep this hash and use Recheck status. The server has received it.`);
  return updated;
}
