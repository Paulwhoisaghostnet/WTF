import assert from "node:assert/strict";
import test from "node:test";
import {
  getRacewaySnapshot,
  injectRacewayEffect,
  placeRacewayBet,
  resetRacewayMockState,
} from "./service";
import type { ConsoleAuthUser } from "../../../console/types";

const NOW = 1_760_000_000_000;
const ALICE: ConsoleAuthUser = { id: 1, username: "alice", displayName: "Alice", role: null };

test("Raceway mocked service accepts paced bets only before lockout", () => {
  resetRacewayMockState(NOW);
  const snapshot = getRacewaySnapshot(ALICE, NOW + 1_000);
  const racerId = snapshot.entrants[0].id;
  const bet = placeRacewayBet(ALICE, racerId, 5_000_000n, NOW + 2_000);
  assert.equal(bet.ok, true);
  assert.equal(bet.snapshot.bets.length, 1);

  const late = placeRacewayBet(ALICE, racerId, 5_000_000n, NOW + 91_000);
  assert.equal(late.ok, false);
});

test("Raceway mocked service accepts effects only while racing and records replay settlement", () => {
  resetRacewayMockState(NOW);
  const racingAt = NOW + 141_000;
  const snapshot = getRacewaySnapshot(ALICE, racingAt);
  assert.equal(snapshot.race.phase, "racing");
  const racerId = snapshot.entrants[0].id;
  const effect = injectRacewayEffect(ALICE, racerId, "snack_toss", racingAt + 1_000);
  assert.equal(effect.ok, true);
  assert.equal(effect.snapshot.effects.length, 1);

  const replay = getRacewaySnapshot(ALICE, NOW + 216_000);
  assert.equal(replay.race.phase, "results_replay");
  assert.ok(replay.lastSettlement?.replayManifest.cameraAngles.includes("finish_line"));
});
