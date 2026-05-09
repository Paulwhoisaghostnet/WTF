import assert from "node:assert/strict";
import test from "node:test";
import {
  GUINEA_PIG_RACEWAY_RULES,
  buildWinProbabilityBps,
  calculateRacePayouts,
  calculateRaceWeight,
  canAcceptNewBetAtSecond,
  canInjectEffectAtSecond,
  canWalletUseRaceEffect,
  clampInjectedEffectSwingBps,
  clampRandomEffectSwingBps,
  clampTrackConditionSwingBps,
  createRaceUniquenessProfile,
  getInjectedEffectCostMicrowtf,
  getRacePhaseAtSecond,
  selectRacewayTrack,
  splitRacePoolMicrowtf,
  type RacewayEntrant,
} from "./rules";
import { buildRacewayRaceCard } from "./race-card";
import {
  buildRacewayReplayManifestDraft,
  buildReplayCameraAngles,
  isReplayManifestComplete,
} from "./replay";

const entrants: RacewayEntrant[] = [
  {
    id: "favorite",
    stats: { speed: 100, stamina: 100, cornering: 100, focus: 100, courage: 100 },
    trackBiasBps: 1_500,
    conditionBiasBps: 1_500,
    injectedEffectBps: 1_200,
    randomEffectBps: 1_800,
  },
  {
    id: "underdog",
    stats: { speed: 1, stamina: 1, cornering: 1, focus: 1, courage: 1 },
    trackBiasBps: -1_500,
    conditionBiasBps: -1_500,
    injectedEffectBps: -1_200,
    randomEffectBps: -1_800,
  },
  { id: "runner-3", stats: { speed: 64, stamina: 73, cornering: 55, focus: 82, courage: 49 } },
  { id: "runner-4", stats: { speed: 70, stamina: 68, cornering: 66, focus: 61, courage: 75 } },
  { id: "runner-5", stats: { speed: 58, stamina: 82, cornering: 77, focus: 69, courage: 54 } },
];

test("race phases enforce betting lockout, intro marks, race, and replay windows", () => {
  assert.equal(getRacePhaseAtSecond(0), "betting_open");
  assert.equal(getRacePhaseAtSecond(89), "betting_open");
  assert.equal(getRacePhaseAtSecond(90), "betting_lockout");
  assert.equal(getRacePhaseAtSecond(109), "betting_lockout");
  assert.equal(getRacePhaseAtSecond(110), "intro_marks");
  assert.equal(getRacePhaseAtSecond(139), "intro_marks");
  assert.equal(getRacePhaseAtSecond(140), "racing");
  assert.equal(getRacePhaseAtSecond(214), "racing");
  assert.equal(getRacePhaseAtSecond(215), "results_replay");
  assert.equal(canAcceptNewBetAtSecond(89), true);
  assert.equal(canAcceptNewBetAtSecond(90), false);
  assert.equal(canInjectEffectAtSecond(140), true);
  assert.equal(canInjectEffectAtSecond(139), false);
});

test("raceway publishes five track identities and deterministic track selection for a race seed", () => {
  assert.equal(GUINEA_PIG_RACEWAY_RULES.tracks.length, 5);
  assert.equal(selectRacewayTrack("race-001").key, selectRacewayTrack("race-001").key);
  const labels = new Set(GUINEA_PIG_RACEWAY_RULES.tracks.map((track) => track.label));
  assert.equal(labels.size, 5);
});

test("visible stable exposes racer stats and 3D model variants", () => {
  assert.equal(GUINEA_PIG_RACEWAY_RULES.defaultRacerStable.length, 8);
  for (const racer of GUINEA_PIG_RACEWAY_RULES.defaultRacerStable) {
    assert.ok(racer.modelVariant);
    assert.ok(racer.scoutingReport.length > 20);
    assert.ok(calculateRaceWeight({ id: racer.id, stats: racer.stats }) > 0);
  }
});

test("probability model keeps underdogs alive and prevents a favorite from becoming deterministic", () => {
  const probabilities = buildWinProbabilityBps(entrants);
  const total = probabilities.reduce((sum, entrant) => sum + entrant.winProbabilityBps, 0);
  assert.equal(total, 10_000);
  assert.ok(
    probabilities.every(
      (entrant) => entrant.winProbabilityBps >= GUINEA_PIG_RACEWAY_RULES.perRacerWinFloorBps
    )
  );
  assert.ok(
    probabilities.every(
      (entrant) => entrant.winProbabilityBps <= GUINEA_PIG_RACEWAY_RULES.maxSingleRacerWinBps
    )
  );
  assert.ok(
    probabilities.find((entrant) => entrant.id === "underdog")!.winProbabilityBps > 0
  );
  assert.ok(
    probabilities.find((entrant) => entrant.id === "favorite")!.winProbabilityBps < 10_000
  );
});

test("track, user, and random effect swings are clamped before odds are built", () => {
  assert.equal(clampTrackConditionSwingBps(99_999), 1_500);
  assert.equal(clampTrackConditionSwingBps(-99_999), -1_500);
  assert.equal(clampInjectedEffectSwingBps(99_999), 1_200);
  assert.equal(clampInjectedEffectSwingBps(-99_999), -1_200);
  assert.equal(clampRandomEffectSwingBps(99_999), 1_800);
  assert.equal(clampRandomEffectSwingBps(-99_999), -1_800);
});

test("paid race effects have costs, wallet caps, target caps, and cooldowns", () => {
  assert.equal(getInjectedEffectCostMicrowtf("snack_toss"), 2_000_000);
  assert.equal(
    canWalletUseRaceEffect({
      priorEffectsByWallet: 0,
      priorEffectsOnRacer: 0,
      secondsSinceLastEffectByWallet: null,
    }),
    true
  );
  assert.equal(
    canWalletUseRaceEffect({
      priorEffectsByWallet: GUINEA_PIG_RACEWAY_RULES.maxEffectsPerWalletPerRace,
      priorEffectsOnRacer: 0,
      secondsSinceLastEffectByWallet: 30,
    }),
    false
  );
  assert.equal(
    canWalletUseRaceEffect({
      priorEffectsByWallet: 1,
      priorEffectsOnRacer: GUINEA_PIG_RACEWAY_RULES.maxEffectsPerRacerPerRace,
      secondsSinceLastEffectByWallet: 30,
    }),
    false
  );
  assert.equal(
    canWalletUseRaceEffect({
      priorEffectsByWallet: 1,
      priorEffectsOnRacer: 1,
      secondsSinceLastEffectByWallet: 2,
    }),
    false
  );
});

test("race pool splits a house slice and pays winning bets proportionally with dust assigned", () => {
  const split = splitRacePoolMicrowtf(101n);
  assert.equal(split.houseTakeMicrowtf, 5n);
  assert.equal(split.winnerPoolMicrowtf, 96n);

  const settled = calculateRacePayouts({
    winningRacerId: "miso",
    bets: [
      { id: "a", walletAddress: "tz1a", racerId: "miso", stakeMicrowtf: 10n },
      { id: "b", walletAddress: "tz1b", racerId: "miso", stakeMicrowtf: 20n },
      { id: "c", walletAddress: "tz1c", racerId: "nori", stakeMicrowtf: 70n },
    ],
  });
  assert.equal(settled.houseTakeMicrowtf, 5n);
  assert.equal(settled.winnerPoolMicrowtf, 95n);
  assert.deepEqual(
    settled.payouts.map((payout) => payout.payoutMicrowtf),
    [32n, 63n, 0n]
  );
});

test("race pool carries winner pool when nobody backed the winner", () => {
  const settled = calculateRacePayouts({
    winningRacerId: "no-ticket",
    bets: [
      { id: "a", walletAddress: "tz1a", racerId: "miso", stakeMicrowtf: 10n },
      { id: "b", walletAddress: "tz1b", racerId: "nori", stakeMicrowtf: 20n },
    ],
  });
  assert.equal(settled.houseTakeMicrowtf, 1n);
  assert.equal(settled.winnerPoolMicrowtf, 29n);
  assert.equal(settled.carryoverMicrowtf, 29n);
});

test("race uniqueness profile changes when track, conditions, globals, or field changes", () => {
  const base = createRaceUniquenessProfile({
    raceId: "race-1",
    trackKey: "cloverleaf_classic",
    conditionKeys: ["clear_fast", "snack_scent"],
    globalVariableBps: { trackGrip: 50, crowdNoise: -10 },
    racerIds: ["a", "b", "c", "d", "e"],
  });
  const changed = createRaceUniquenessProfile({
    raceId: "race-1",
    trackKey: "moonlight_boardwalk",
    conditionKeys: ["clear_fast", "snack_scent"],
    globalVariableBps: { trackGrip: 50, crowdNoise: -10 },
    racerIds: ["a", "b", "c", "d", "e"],
  });
  assert.notEqual(base, changed);
});

test("race-card director creates a unique public card with probabilities and visible schedule", () => {
  const card = buildRacewayRaceCard({
    raceId: "raceway-001",
    seedCommitment: "commitment-a",
    entrantCount: 6,
  });
  assert.equal(card.entrants.length, 6);
  assert.equal(card.conditions.length, 3);
  assert.equal(card.scheduleSeconds.introMarks, 30);
  assert.equal(
    card.entrants.reduce((sum, entrant) => sum + entrant.winProbabilityBps, 0),
    10_000
  );
  assert.ok(card.uniquenessProfile.includes(card.track.key));

  const nextCard = buildRacewayRaceCard({
    raceId: "raceway-002",
    seedCommitment: "commitment-b",
    entrantCount: 6,
  });
  assert.notEqual(card.uniquenessProfile, nextCard.uniquenessProfile);
});

test("replay archive drafts include track cameras plus required audit angles", () => {
  const track = GUINEA_PIG_RACEWAY_RULES.tracks[0];
  const angles = buildReplayCameraAngles(track);
  assert.ok(angles.includes("finish_line"));
  assert.ok(angles.includes("winner_closeup"));
  assert.ok(angles.includes(track.replayAngles[0]));

  const manifest = buildRacewayReplayManifestDraft({
    raceId: "raceway-001",
    track,
    winnerRacerId: "miso-missile",
    settlementHash: "settlement-hash",
    effectTimeline: [
      {
        second: 15,
        walletAddressHash: "wallet-b",
        racerId: "nori-nova",
        effectKey: "fan_chant",
      },
      {
        second: 3,
        walletAddressHash: "wallet-a",
        racerId: "miso-missile",
        effectKey: "snack_toss",
      },
    ],
  });
  assert.equal(manifest.effectTimeline[0].second, 3);
  assert.equal(isReplayManifestComplete(manifest), true);
});
