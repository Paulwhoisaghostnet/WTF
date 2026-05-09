import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  calculateEarnedMicroshares,
  calculatePayouts,
  splitRugPullPayment,
} from "../server/features/casino/games/rug-pull";
import {
  buildRacewayRaceCard,
  calculateRacePayouts,
  GUINEA_PIG_RACEWAY_RULES,
  splitRacePoolMicrowtf,
  type RacewayBet,
} from "../server/features/casino/games/guinea-pig-raceway";

const outDir = path.join(process.cwd(), "tmp");
mkdirSync(outDir, { recursive: true });

const rugPlayers = Array.from({ length: 5 }, (_, index) => {
  const joinAt = index * 18;
  const lockAt = 210 + index * 6;
  const finalMicroshares = calculateEarnedMicroshares({
    joinOrder: index + 1,
    fromRoundSecond: joinAt,
    toRoundSecond: lockAt,
  });
  return {
    id: `rug-player-${index + 1}`,
    joinOrder: index + 1,
    joinAt,
    lockAt,
    finalMicroshares,
  };
});

const joinSplit = splitRugPullPayment("join");
const pressSplit = splitRugPullPayment("press");
const witnessSplit = splitRugPullPayment("witness");
const rugPot =
  BigInt(rugPlayers.length * joinSplit.potMutez) +
  BigInt(3 * witnessSplit.potMutez);
const rugNextSeed = BigInt(3 * pressSplit.potMutez);
const rugPayouts = calculatePayouts({
  potMutez: rugPot,
  participants: rugPlayers.map((player) => ({
    id: player.id,
    finalMicroshares: player.finalMicroshares,
  })),
});

const raceCard = buildRacewayRaceCard({
  raceId: "sim-raceway-001",
  seedCommitment: "codex-raceway-sim",
  entrantCount: 6,
});
const raceBets: RacewayBet[] = raceCard.entrants.flatMap((entrant, index) => [
  {
    id: `bet-${entrant.id}-a`,
    walletAddress: `mock-wallet-${index + 1}`,
    racerId: entrant.id,
    stakeMicrowtf: BigInt(GUINEA_PIG_RACEWAY_RULES.minBetMicrowtf * (index + 1)),
  },
]);
const raceWinner = raceCard.entrants
  .slice()
  .sort((a, b) => b.winProbabilityBps - a.winProbabilityBps)
  .at(1)!;
const racePool = splitRacePoolMicrowtf(
  raceBets.reduce((sum, bet) => sum + BigInt(bet.stakeMicrowtf), 0n)
);
const racePayouts = calculateRacePayouts({
  winningRacerId: raceWinner.id,
  bets: raceBets,
});

const report = {
  generatedAt: new Date().toISOString(),
  rugPull: {
    players: rugPlayers.length,
    witnesses: 3,
    potMutez: rugPot.toString(),
    nextSeedPotMutez: rugNextSeed.toString(),
    platformTakeMutez: BigInt(
      rugPlayers.length * joinSplit.platformMutez +
        3 * pressSplit.platformMutez +
        3 * witnessSplit.platformMutez
    ).toString(),
    payouts: rugPayouts.map((payout) => ({
      id: payout.id,
      finalMicroshares: payout.finalMicroshares.toString(),
      payoutMutez: payout.payoutMutez.toString(),
    })),
  },
  guineaPigRaceway: {
    raceId: raceCard.raceId,
    track: raceCard.track.label,
    conditions: raceCard.conditions.map((condition) => condition.label),
    entrants: raceCard.entrants.map((entrant) => ({
      id: entrant.id,
      name: entrant.displayName,
      winProbabilityBps: entrant.winProbabilityBps,
    })),
    totalBetMicrowtf: racePool.totalBetMicrowtf.toString(),
    houseTakeMicrowtf: racePool.houseTakeMicrowtf.toString(),
    winnerPoolMicrowtf: racePool.winnerPoolMicrowtf.toString(),
    simulatedWinner: raceWinner.id,
    payouts: racePayouts.payouts.map((payout) => ({
      id: payout.id,
      racerId: payout.racerId,
      stakeMicrowtf: BigInt(payout.stakeMicrowtf).toString(),
      payoutMicrowtf: payout.payoutMicrowtf.toString(),
    })),
  },
};

const outFile = path.join(outDir, "casino-table-simulations-latest.json");
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

console.log("Casino table simulation report");
console.log(`Rug Pull players: ${report.rugPull.players}`);
console.log(`Rug Pull pot: ${report.rugPull.potMutez} mutez`);
console.log(`Raceway track: ${report.guineaPigRaceway.track}`);
console.log(`Raceway winner: ${report.guineaPigRaceway.simulatedWinner}`);
console.log(`Raceway house take: ${report.guineaPigRaceway.houseTakeMicrowtf} microwtf`);
console.log(`JSON results: ${outFile}`);
