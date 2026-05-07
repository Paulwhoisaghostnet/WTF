import type {
  CreatorScoreBreakdown,
  CreatorScoreInput,
  CreatorScoreResult,
} from "@shared/tezos-intel";

export function calculateCreatorScore(input: CreatorScoreInput): CreatorScoreResult {
  const breakdown: CreatorScoreBreakdown = {
    liquidity: cap(scale(input.saleCount, 50) * 25),
    volume: cap(scale(mutezToXtz(input.totalVolumeMutez), 500) * 25),
    collectors: cap(scale(input.collectorCount, 75) * 20),
    recency: cap(calculateRecency(input.lastSaleAt) * 15),
    activeMarket: cap(calculateActiveMarket(input) * 15),
  };

  const score = Math.round(
    breakdown.liquidity +
      breakdown.volume +
      breakdown.collectors +
      breakdown.recency +
      breakdown.activeMarket
  );

  return {
    ...input,
    score,
    grade: gradeScore(score, input.tokenCount),
    breakdown,
  };
}

export function compareCreatorScores(creators: CreatorScoreInput[]) {
  return creators
    .map(calculateCreatorScore)
    .sort((a, b) => b.score - a.score || b.totalVolumeMutez - a.totalVolumeMutez);
}

function calculateActiveMarket(input: CreatorScoreInput) {
  if (input.activeListingCount <= 0) return 0;
  const listingSignal = scale(input.activeListingCount, 25);
  const floorSignal = input.floorMutez > 0 ? 1 : 0.35;
  return Math.min(1, listingSignal * floorSignal + 0.15);
}

function calculateRecency(lastSaleAt?: string | null) {
  if (!lastSaleAt) return 0;
  const last = new Date(lastSaleAt);
  if (Number.isNaN(last.getTime())) return 0;
  const days = Math.max(0, (Date.now() - last.getTime()) / 86_400_000);
  if (days <= 30) return 1;
  if (days >= 365) return 0.15;
  return 1 - (days - 30) / 394;
}

function gradeScore(score: number, tokenCount: number): CreatorScoreResult["grade"] {
  if (tokenCount === 0) return "unrated";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  return "D";
}

function scale(value: number, capAt: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, Math.log10(value + 1) / Math.log10(capAt + 1));
}

function cap(value: number) {
  return Math.max(0, Math.min(100, value));
}

function mutezToXtz(mutez: number) {
  return mutez / 1_000_000;
}
