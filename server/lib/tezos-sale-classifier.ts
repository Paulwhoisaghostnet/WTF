import { externalMarketplaceName, isKnownExternalMarketplace } from "@shared/external-marketplaces";

export interface SaleClassifierAccount {
  address?: string | null;
}

export interface SaleClassifierOperation {
  amount?: number | string | null;
  sender?: SaleClassifierAccount | null;
  target?: SaleClassifierAccount | null;
  initiator?: SaleClassifierAccount | null;
  parameter?: {
    entrypoint?: string | null;
    value?: unknown;
  } | null;
}

export interface SaleClassificationInput {
  buyerAddress: string | null;
  fallbackSellerAddress: string | null;
  operations: SaleClassifierOperation[];
}

export interface SaleClassification {
  paidMutez: number;
  sellerAddress: string | null;
  marketplace: string | null;
  marketplaceContract: string | null;
}

function firstKnownMarketplaceAddress(op: SaleClassifierOperation) {
  const candidates = [
    op.target?.address,
    op.sender?.address,
    op.initiator?.address,
  ];
  return candidates.find((address) => isKnownExternalMarketplace(address)) ?? null;
}

export function classifyTezosSaleOperation(
  input: SaleClassificationInput
): SaleClassification {
  const buyerAddress = input.buyerAddress;
  let paidMutez = 0;
  let sellerAddress = input.fallbackSellerAddress;
  let marketplaceContract: string | null = null;
  let unknownMarketplaceTarget: string | null = null;

  for (const op of input.operations ?? []) {
    const amount = Number(op?.amount ?? 0);
    const senderAddress = op?.sender?.address ?? null;
    const targetAddress = op?.target?.address ?? null;
    const knownMarketplace = firstKnownMarketplaceAddress(op);

    if (!marketplaceContract && knownMarketplace) {
      marketplaceContract = knownMarketplace;
    }

    if (amount > 0 && targetAddress && targetAddress !== buyerAddress) {
      paidMutez += amount;
      if (!sellerAddress && !isKnownExternalMarketplace(targetAddress)) {
        sellerAddress = targetAddress;
      }
    }

    if (
      !unknownMarketplaceTarget &&
      targetAddress &&
      targetAddress !== buyerAddress &&
      isKnownExternalMarketplace(targetAddress)
    ) {
      unknownMarketplaceTarget = targetAddress;
    }

    if (!sellerAddress && senderAddress && senderAddress !== buyerAddress) {
      sellerAddress = senderAddress;
    }
  }

  const resolvedMarketplaceContract = marketplaceContract ?? unknownMarketplaceTarget;
  return {
    paidMutez,
    sellerAddress,
    marketplace: resolvedMarketplaceContract
      ? externalMarketplaceName(resolvedMarketplaceContract)
      : null,
    marketplaceContract: resolvedMarketplaceContract,
  };
}
