export type AcquisitionType = "purchase" | "mint" | "free_transfer" | "unknown";

export interface HoldingSnapshot {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  quantity: number;
  tokenName?: string | null;
  thumbnailUri?: string | null;
  collectionName?: string | null;
  floorMutez?: bigint | number | string | null;
  floorMarketplace?: string | null;
}

export interface SaleSnapshot {
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  tokenContract: string;
  tokenId: string;
  priceMutez: bigint | number | string;
  priceUsd?: string | null;
  soldAt: string;
  opHash: string;
  marketplace?: string | null;
  editionsSold?: number | null;
  currencyId?: string | number | null;
  priceXtzMutez?: bigint | number | string | null;
}

export interface MintSnapshot {
  firstOwner?: string | null;
  tokenContract: string;
  tokenId: string;
  mintFeeMutez?: bigint | number | string | null;
  mintedAt: string;
  opHash: string;
  editions?: number | null;
  platform?: string | null;
}

export interface TransferEvidenceSnapshot {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  timestamp: string;
  opHash?: string | null;
  quantity?: number | null;
}

export interface StoredAcquisitionLotSnapshot {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  acquiredAt: string;
  opHash?: string | null;
  acquisitionType: AcquisitionType;
  quantity?: number | null;
  totalCostMutez?: bigint | number | string | null;
  marketplace?: string | null;
  costBasisKnown?: boolean | null;
}

export interface CostLot {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  acquiredAt: string;
  opHash: string | null;
  acquisitionType: AcquisitionType;
  originalQuantity: number;
  remainingQuantity: number;
  totalCostMutez: bigint;
  unitCostMutez: bigint;
  costBasisKnown: boolean;
  marketplace: string | null;
}

export interface RealizedPnlRow {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  soldAt: string;
  opHash: string;
  quantity: number;
  proceedsMutez: bigint;
  costBasisMutez: bigint | null;
  realizedPnlMutez: bigint | null;
  acquisitionTypes: AcquisitionType[];
  unknownCostQuantity: number;
  marketplace: string | null;
}

export interface UnrealizedPnlRow {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  thumbnailUri: string | null;
  collectionName: string | null;
  quantity: number;
  costBasisMutez: bigint | null;
  floorMutez: bigint | null;
  estimatedValueMutez: bigint | null;
  unrealizedPnlMutez: bigint | null;
  acquisitionTypes: AcquisitionType[];
  knownCostQuantity: number;
  unknownQuantity: number;
  binTrap: boolean;
  floorMarketplace: string | null;
}

export interface PortfolioCostingResult {
  rows: UnrealizedPnlRow[];
  realized: RealizedPnlRow[];
  totals: {
    costBasisMutez: bigint;
    estimatedValueMutez: bigint;
    unrealizedPnlMutez: bigint;
    realizedProceedsMutez: bigint;
    realizedCostBasisMutez: bigint;
    realizedPnlMutez: bigint;
    pricedPositions: number;
    unknownCostPositions: number;
    unknownCostQuantity: number;
    binTrapPositions: number;
    purchasePositions: number;
    mintPositions: number;
    freeTransferPositions: number;
    altCurrencySalesExcluded: number;
  };
}

export interface PortfolioCostingInput {
  wallets: string[];
  holdings: HoldingSnapshot[];
  sales: SaleSnapshot[];
  mints?: MintSnapshot[];
  freeTransfers?: TransferEvidenceSnapshot[];
  acquisitionLots?: StoredAcquisitionLotSnapshot[];
}

function addressKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function tokenKey(walletAddress: string, tokenContract: string, tokenId: string): string {
  return `${addressKey(walletAddress)}|${tokenContract}|${tokenId}`;
}

function acquisitionKey(
  walletAddress: string | null | undefined,
  tokenContract: string,
  tokenId: string,
  opHash: string | null | undefined,
): string {
  return `${addressKey(walletAddress)}|${tokenContract}|${tokenId}|${String(opHash ?? "")}`;
}

function toMutez(value: bigint | number | string | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "bigint") return value < 0n ? 0n : value;
  if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value)));
  if (!/^-?[0-9]+$/.test(value.trim())) return 0n;
  const parsed = BigInt(value.trim());
  return parsed < 0n ? 0n : parsed;
}

function saneQuantity(value: number | null | undefined, fallback = 1): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  const n = Math.floor(Number(value));
  return n > 0 ? n : fallback;
}

function compareTime(a: { at: string }, b: { at: string }): number {
  const at = Date.parse(a.at);
  const bt = Date.parse(b.at);
  if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
  if (Number.isNaN(at)) return 1;
  if (Number.isNaN(bt)) return -1;
  return at - bt;
}

type Event =
  | { kind: "acquire"; at: string; lot: CostLot }
  | { kind: "dispose"; at: string; sale: SaleSnapshot }
  | { kind: "excluded_alt_sale"; at: string };

function addLot(lots: Map<string, CostLot[]>, lot: CostLot): void {
  const key = tokenKey(lot.walletAddress, lot.tokenContract, lot.tokenId);
  const queue = lots.get(key) ?? [];
  queue.push(lot);
  lots.set(key, queue);
}

function consumeLots(
  lots: Map<string, CostLot[]>,
  sale: SaleSnapshot,
  sellerAddress: string,
): { cost: bigint | null; acquisitionTypes: AcquisitionType[]; unknownCostQuantity: number } {
  const quantity = saneQuantity(sale.editionsSold, 1);
  const queue = lots.get(tokenKey(sellerAddress, sale.tokenContract, sale.tokenId)) ?? [];
  let remaining = quantity;
  let cost = 0n;
  let unknownCostQuantity = 0;
  const acquisitionTypes = new Set<AcquisitionType>();

  for (const lot of queue) {
    if (remaining <= 0) break;
    if (lot.remainingQuantity <= 0) continue;
    const used = Math.min(remaining, lot.remainingQuantity);
    if (lot.costBasisKnown) {
      cost += BigInt(used) * lot.unitCostMutez;
    } else {
      unknownCostQuantity += used;
    }
    lot.remainingQuantity -= used;
    remaining -= used;
    acquisitionTypes.add(lot.acquisitionType);
  }

  unknownCostQuantity += Math.max(0, remaining);
  if (unknownCostQuantity > 0) {
    return { cost: null, acquisitionTypes: [...acquisitionTypes], unknownCostQuantity };
  }
  return { cost, acquisitionTypes: [...acquisitionTypes], unknownCostQuantity: 0 };
}

function isXtzSale(sale: SaleSnapshot): boolean {
  if (sale.priceXtzMutez === null) return false;
  if (sale.priceXtzMutez !== undefined && sale.priceXtzMutez !== null) return true;
  if (sale.currencyId === undefined || sale.currencyId === null) return true;
  return String(sale.currencyId) === "1";
}

function buildEvents(input: PortfolioCostingInput): Event[] {
  const walletSet = new Set(input.wallets.map(addressKey));
  const events: Event[] = [];
  const storedAcquisitionKeys = new Set<string>();

  for (const stored of input.acquisitionLots ?? []) {
    const wallet = addressKey(stored.walletAddress);
    if (!wallet || !walletSet.has(wallet)) continue;
    const qty = saneQuantity(stored.quantity, 1);
    const cost = toMutez(stored.totalCostMutez);
    const costBasisKnown =
      stored.costBasisKnown ?? !["free_transfer", "unknown"].includes(stored.acquisitionType);
    storedAcquisitionKeys.add(
      acquisitionKey(stored.walletAddress, stored.tokenContract, stored.tokenId, stored.opHash),
    );
    events.push({
      kind: "acquire",
      at: stored.acquiredAt,
      lot: {
        walletAddress: stored.walletAddress,
        tokenContract: stored.tokenContract,
        tokenId: stored.tokenId,
        acquiredAt: stored.acquiredAt,
        opHash: stored.opHash ?? null,
        acquisitionType: stored.acquisitionType,
        originalQuantity: qty,
        remainingQuantity: qty,
        totalCostMutez: cost,
        unitCostMutez: cost / BigInt(qty),
        costBasisKnown,
        marketplace: stored.marketplace ?? null,
      },
    });
  }

  for (const sale of input.sales) {
    const buyer = addressKey(sale.buyerAddress);
    const seller = addressKey(sale.sellerAddress);
    if (!isXtzSale(sale)) {
      if ((buyer && walletSet.has(buyer)) || (seller && walletSet.has(seller))) {
        events.push({ kind: "excluded_alt_sale", at: sale.soldAt });
      }
      continue;
    }

    const price = toMutez(sale.priceXtzMutez ?? sale.priceMutez);
    const qty = saneQuantity(sale.editionsSold, 1);
    if (
      buyer &&
      walletSet.has(buyer) &&
      !storedAcquisitionKeys.has(acquisitionKey(sale.buyerAddress, sale.tokenContract, sale.tokenId, sale.opHash))
    ) {
      events.push({
        kind: "acquire",
        at: sale.soldAt,
        lot: {
          walletAddress: sale.buyerAddress!,
          tokenContract: sale.tokenContract,
          tokenId: sale.tokenId,
          acquiredAt: sale.soldAt,
          opHash: sale.opHash,
          acquisitionType: "purchase",
          originalQuantity: qty,
          remainingQuantity: qty,
          totalCostMutez: price,
          unitCostMutez: price / BigInt(qty),
          costBasisKnown: true,
          marketplace: sale.marketplace ?? null,
        },
      });
    }
    if (seller && walletSet.has(seller)) {
      events.push({ kind: "dispose", at: sale.soldAt, sale });
    }
  }

  for (const mint of input.mints ?? []) {
    const owner = addressKey(mint.firstOwner);
    if (!owner || !walletSet.has(owner)) continue;
    if (storedAcquisitionKeys.has(acquisitionKey(mint.firstOwner, mint.tokenContract, mint.tokenId, mint.opHash))) {
      continue;
    }
    const qty = saneQuantity(mint.editions, 1);
    const cost = toMutez(mint.mintFeeMutez);
    events.push({
      kind: "acquire",
      at: mint.mintedAt,
      lot: {
        walletAddress: mint.firstOwner!,
        tokenContract: mint.tokenContract,
        tokenId: mint.tokenId,
        acquiredAt: mint.mintedAt,
        opHash: mint.opHash,
        acquisitionType: "mint",
        originalQuantity: qty,
        remainingQuantity: qty,
        totalCostMutez: cost,
        unitCostMutez: cost / BigInt(qty),
        costBasisKnown: true,
        marketplace: mint.platform ?? null,
      },
    });
  }

  for (const transfer of input.freeTransfers ?? []) {
    const wallet = addressKey(transfer.walletAddress);
    if (!wallet || !walletSet.has(wallet)) continue;
    if (storedAcquisitionKeys.has(acquisitionKey(transfer.walletAddress, transfer.tokenContract, transfer.tokenId, transfer.opHash))) {
      continue;
    }
    const qty = saneQuantity(transfer.quantity, 1);
    events.push({
      kind: "acquire",
      at: transfer.timestamp,
      lot: {
        walletAddress: transfer.walletAddress,
        tokenContract: transfer.tokenContract,
        tokenId: transfer.tokenId,
        acquiredAt: transfer.timestamp,
        opHash: transfer.opHash ?? null,
        acquisitionType: "free_transfer",
        originalQuantity: qty,
        remainingQuantity: qty,
        totalCostMutez: 0n,
        unitCostMutez: 0n,
        costBasisKnown: false,
        marketplace: null,
      },
    });
  }

  return events.sort(compareTime);
}

export function calculatePortfolioCosting(input: PortfolioCostingInput): PortfolioCostingResult {
  const lots = new Map<string, CostLot[]>();
  const realized: RealizedPnlRow[] = [];
  let altCurrencySalesExcluded = 0;

  for (const event of buildEvents(input)) {
    if (event.kind === "excluded_alt_sale") {
      altCurrencySalesExcluded++;
      continue;
    }
    if (event.kind === "acquire") {
      addLot(lots, event.lot);
      continue;
    }

    const seller = event.sale.sellerAddress;
    if (!seller) continue;
    const quantity = saneQuantity(event.sale.editionsSold, 1);
    const proceeds = toMutez(event.sale.priceXtzMutez ?? event.sale.priceMutez);
    const consumed = consumeLots(lots, event.sale, seller);
    realized.push({
      walletAddress: seller,
      tokenContract: event.sale.tokenContract,
      tokenId: event.sale.tokenId,
      soldAt: event.sale.soldAt,
      opHash: event.sale.opHash,
      quantity,
      proceedsMutez: proceeds,
      costBasisMutez: consumed.cost,
      realizedPnlMutez: consumed.cost === null ? null : proceeds - consumed.cost,
      acquisitionTypes: consumed.acquisitionTypes,
      unknownCostQuantity: consumed.unknownCostQuantity,
      marketplace: event.sale.marketplace ?? null,
    });
  }

  const rows: UnrealizedPnlRow[] = input.holdings.map((holding) => {
    const quantity = saneQuantity(holding.quantity, 1);
    const queue = lots.get(tokenKey(holding.walletAddress, holding.tokenContract, holding.tokenId)) ?? [];
    let remaining = quantity;
    let knownCost = 0n;
    let knownCostQuantity = 0;
    let unknownQuantity = 0;
    const types = new Set<AcquisitionType>();

    for (const lot of queue) {
      if (remaining <= 0) break;
      if (lot.remainingQuantity <= 0) continue;
      const used = Math.min(remaining, lot.remainingQuantity);
      if (lot.costBasisKnown) {
        knownCost += BigInt(used) * lot.unitCostMutez;
        knownCostQuantity += used;
      } else {
        unknownQuantity += used;
      }
      remaining -= used;
      types.add(lot.acquisitionType);
    }

    unknownQuantity += Math.max(0, remaining);
    if (unknownQuantity > 0 && types.size === 0) types.add("unknown");
    const costBasis = unknownQuantity > 0 ? null : knownCost;
    const floor =
      holding.floorMutez === null || holding.floorMutez === undefined
        ? null
        : toMutez(holding.floorMutez);
    const estimatedValue = floor === null ? null : floor * BigInt(quantity);
    const unitKnownCost =
      costBasis !== null && knownCostQuantity > 0 ? costBasis / BigInt(knownCostQuantity) : null;
    const binTrap =
      unitKnownCost !== null && unitKnownCost > 0n && floor !== null
        ? floor > unitKnownCost * 100n
        : false;

    return {
      walletAddress: holding.walletAddress,
      tokenContract: holding.tokenContract,
      tokenId: holding.tokenId,
      tokenName: holding.tokenName ?? null,
      thumbnailUri: holding.thumbnailUri ?? null,
      collectionName: holding.collectionName ?? null,
      quantity,
      costBasisMutez: costBasis,
      floorMutez: floor,
      estimatedValueMutez: estimatedValue,
      unrealizedPnlMutez:
        costBasis !== null && estimatedValue !== null ? estimatedValue - costBasis : null,
      acquisitionTypes: [...types],
      knownCostQuantity,
      unknownQuantity,
      binTrap,
      floorMarketplace: holding.floorMarketplace ?? null,
    };
  });

  const totals = {
    costBasisMutez: 0n,
    estimatedValueMutez: 0n,
    unrealizedPnlMutez: 0n,
    realizedProceedsMutez: 0n,
    realizedCostBasisMutez: 0n,
    realizedPnlMutez: 0n,
    pricedPositions: 0,
    unknownCostPositions: 0,
    unknownCostQuantity: 0,
    binTrapPositions: 0,
    purchasePositions: 0,
    mintPositions: 0,
    freeTransferPositions: 0,
    altCurrencySalesExcluded,
  };

  for (const row of rows) {
    if (row.acquisitionTypes.includes("purchase")) totals.purchasePositions++;
    if (row.acquisitionTypes.includes("mint")) totals.mintPositions++;
    if (row.acquisitionTypes.includes("free_transfer")) totals.freeTransferPositions++;

    if (row.binTrap) {
      totals.binTrapPositions++;
      continue;
    }
    if (row.costBasisMutez === null || row.estimatedValueMutez === null) {
      totals.unknownCostPositions++;
      totals.unknownCostQuantity += row.unknownQuantity;
      continue;
    }
    totals.costBasisMutez += row.costBasisMutez;
    totals.estimatedValueMutez += row.estimatedValueMutez;
    totals.unrealizedPnlMutez += row.estimatedValueMutez - row.costBasisMutez;
    totals.pricedPositions++;
  }

  for (const row of realized) {
    totals.realizedProceedsMutez += row.proceedsMutez;
    if (row.costBasisMutez !== null) {
      totals.realizedCostBasisMutez += row.costBasisMutez;
      totals.realizedPnlMutez += row.proceedsMutez - row.costBasisMutez;
    }
  }

  realized.sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt));
  return { rows, realized, totals };
}
