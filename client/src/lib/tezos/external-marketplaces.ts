import {
  EXTERNAL_CANCEL_ENTRYPOINT_BY_MARKETPLACE,
  externalCancelEntrypoint,
  isCancellableExternalMarketplace,
} from "@shared/external-marketplaces";
import { trackContractActivity } from "./activity-ledger";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";

export type WalletParamsWithKind = Record<string, unknown> & { kind: "transaction" };

export interface Fa2TransferInput {
  fa: string;
  tokenId: string;
  to: string;
  amount: number;
}

export interface RevocableOperatorGrant {
  fa: string;
  tokenId: string;
  operatorAddress: string;
}

export interface CancellableExternalListing {
  marketplaceContract: string;
  bigmapKey: number;
}

const TXS_PER_TRANSFER_CALL = 5;

function assertTokenId(value: string): void {
  if (!/^[0-9]+$/.test(value)) throw new Error(`Invalid token id: ${value}`);
}

function assertPositiveAmount(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Invalid amount for ${label}`);
  }
  return Math.floor(value);
}

export { EXTERNAL_CANCEL_ENTRYPOINT_BY_MARKETPLACE, isCancellableExternalMarketplace };

export async function buildFa2BatchTransferOps(
  sender: string,
  transfers: Fa2TransferInput[],
): Promise<WalletParamsWithKind[]> {
  const tezos = await getTezos();
  const byContract = new Map<string, Array<{ to_: string; token_id: number; amount: number }>>();
  for (const transfer of transfers) {
    assertTokenId(transfer.tokenId);
    const rows = byContract.get(transfer.fa) ?? [];
    rows.push({
      to_: transfer.to,
      token_id: Number(transfer.tokenId),
      amount: assertPositiveAmount(transfer.amount, `${transfer.fa}:${transfer.tokenId}`),
    });
    byContract.set(transfer.fa, rows);
  }

  const ops: WalletParamsWithKind[] = [];
  for (const [fa, txs] of byContract) {
    const contract = await tezos.wallet.at(fa);
    for (let i = 0; i < txs.length; i += TXS_PER_TRANSFER_CALL) {
      const chunk = txs.slice(i, i + TXS_PER_TRANSFER_CALL);
      const params = contract.methodsObject
        .transfer([{ from_: sender, txs: chunk }])
        .toTransferParams();
      ops.push({ kind: "transaction", ...params });
    }
  }
  return ops;
}

export async function buildCancelExternalListingsOps(
  listings: CancellableExternalListing[],
): Promise<WalletParamsWithKind[]> {
  const tezos = await getTezos();
  const ops: WalletParamsWithKind[] = [];
  for (const listing of listings) {
    const entrypoint = externalCancelEntrypoint(listing.marketplaceContract);
    if (!entrypoint) {
      throw new Error(`Cancel is not supported for marketplace ${listing.marketplaceContract}`);
    }
    if (!Number.isInteger(listing.bigmapKey) || listing.bigmapKey < 0) {
      throw new Error(`Invalid listing key for ${listing.marketplaceContract}`);
    }
    const contract = await tezos.wallet.at(listing.marketplaceContract);
    const params = contract.methodsObject[entrypoint](listing.bigmapKey).toTransferParams();
    ops.push({ kind: "transaction", ...params });
  }
  return ops;
}

export async function buildRevokeOperatorOps(
  ownerAddress: string,
  grants: RevocableOperatorGrant[],
): Promise<WalletParamsWithKind[]> {
  const tezos = await getTezos();
  const byContract = new Map<string, Array<{ remove_operator: { owner: string; operator: string; token_id: number } }>>();
  for (const grant of grants) {
    assertTokenId(grant.tokenId);
    const rows = byContract.get(grant.fa) ?? [];
    rows.push({
      remove_operator: {
        owner: ownerAddress,
        operator: grant.operatorAddress,
        token_id: Number(grant.tokenId),
      },
    });
    byContract.set(grant.fa, rows);
  }

  const ops: WalletParamsWithKind[] = [];
  for (const [fa, updates] of byContract) {
    const contract = await tezos.wallet.at(fa);
    const params = contract.methodsObject.update_operators(updates).toTransferParams();
    ops.push({ kind: "transaction", ...params });
  }
  return ops;
}

async function sendBatch(
  context: Record<string, unknown>,
  ops: WalletParamsWithKind[],
  waitConfirmation = true,
): Promise<{ opHash: string }> {
  if (ops.length === 0) throw new Error("No operations to send");
  return trackContractActivity(
    {
      module: "external_marketplace",
      action: String(context.action ?? "batch"),
      contractAddress: typeof context.contractAddress === "string" ? context.contractAddress : null,
      entrypoint: typeof context.entrypoint === "string" ? context.entrypoint : null,
      walletAddress: typeof context.walletAddress === "string" ? context.walletAddress : null,
      params: context,
    },
    async () => {
      await assertNetworkReadyForSend();
      const tezos = await getTezos();
      const op = await tezos.wallet.batch(ops).send();
      if (waitConfirmation) await op.confirmation(1);
      return { opHash: op.opHash };
    },
  );
}

export async function cancelExternalListings(
  walletAddress: string,
  listings: CancellableExternalListing[],
): Promise<{ opHash: string }> {
  const ops = await buildCancelExternalListingsOps(listings);
  return sendBatch(
    {
      action: "cancel_external_listings",
      walletAddress,
      count: listings.length,
      listings,
    },
    ops,
  );
}

export async function revokeExternalOperators(
  ownerAddress: string,
  grants: RevocableOperatorGrant[],
): Promise<{ opHash: string }> {
  const ops = await buildRevokeOperatorOps(ownerAddress, grants);
  return sendBatch(
    {
      action: "revoke_external_operators",
      walletAddress: ownerAddress,
      count: grants.length,
      grants,
    },
    ops,
  );
}

export async function sendFa2BatchTransfer(
  sender: string,
  transfers: Fa2TransferInput[],
): Promise<{ opHash: string }> {
  const ops = await buildFa2BatchTransferOps(sender, transfers);
  return sendBatch(
    {
      action: "batch_fa2_transfer",
      walletAddress: sender,
      count: transfers.length,
      transfers,
    },
    ops,
  );
}
