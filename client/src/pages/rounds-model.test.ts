import assert from "node:assert/strict";
import test from "node:test";
import { deriveRoundsLaunchState } from "./rounds-model";

test("rounds launch state favors active rounds and active challenge counts", () => {
  const state = deriveRoundsLaunchState({
    season: { number: 3, name: "Big Show", status: "active" },
    rounds: [
      { number: 1, name: "Warmup", status: "completed", startDate: "2026-05-01T00:00:00.000Z" },
      { number: 2, name: "Live Call", status: "active", startDate: "2026-05-18T20:00:00.000Z" },
      { number: 3, name: "Finale", status: "upcoming", startDate: "2026-06-01T20:00:00.000Z" },
    ],
    challenges: [{ status: "active" }, { status: "completed" }, { status: "active" }],
    now: new Date("2026-05-18T12:00:00.000Z"),
  });

  assert.deepEqual(state, {
    seasonLabel: "Season 3: Big Show",
    seasonStatus: "active",
    launchStatus: "Live",
    activeRounds: 1,
    prepRounds: 1,
    openChallenges: 2,
    nextRoundLabel: "Round 2: Live Call",
  });
});

test("rounds launch state identifies a preparing season before live rounds", () => {
  const state = deriveRoundsLaunchState({
    season: { number: 4, name: "Next Cast", status: "draft" },
    rounds: [{ number: 1, name: "Casting", status: "draft" }],
    challenges: [],
    now: new Date("2026-05-18T12:00:00.000Z"),
  });

  assert.equal(state.launchStatus, "Preparing");
  assert.equal(state.nextRoundLabel, "Round 1: Casting");
});
