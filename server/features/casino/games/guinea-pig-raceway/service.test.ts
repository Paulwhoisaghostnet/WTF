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
  assert.equal(bet.snapshot.tickets[0].wagerType, "win");
  assert.equal(bet.snapshot.audit.events[0].action, "ticket_accepted");
  assert.equal(bet.snapshot.race.toteBoard.poolSummaries.find((pool) => pool.wagerType === "win")?.ticketCount, 1);

  const late = placeRacewayBet(ALICE, racerId, 5_000_000n, NOW + 91_000);
  assert.equal(late.ok, false);
  assert.equal(late.snapshot.audit.events[0].action, "bet_rejected");
});

test("Raceway mocked service accepts standard tote ticket types and rejects invalid exotic shape", () => {
  resetRacewayMockState(NOW);
  const snapshot = getRacewaySnapshot(ALICE, NOW + 1_000);
  const [first, second, third] = snapshot.entrants;
  const exacta = placeRacewayBet(
    ALICE,
    first.id,
    5_000_000n,
    NOW + 2_000,
    "exacta",
    [first.id, second.id]
  );
  assert.equal(exacta.ok, true);
  assert.equal(exacta.snapshot.tickets[0].wagerType, "exacta");
  assert.deepEqual(exacta.snapshot.tickets[0].selections, [first.id, second.id]);

  const bad = placeRacewayBet(
    ALICE,
    first.id,
    5_000_000n,
    NOW + 3_000,
    "trifecta",
    [first.id, third.id]
  );
  assert.equal(bad.ok, false);
  assert.match(bad.error ?? "", /3 selection/);
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
  assert.equal(effect.snapshot.audit.events[0].action, "effect_accepted");

  const replay = getRacewaySnapshot(ALICE, NOW + 216_000);
  assert.equal(replay.race.phase, "results_replay");
  assert.ok(replay.lastSettlement?.replayManifest.cameraAngles.includes("finish_line"));
  assert.equal(replay.lastSettlement?.officialStatus, "official");
  assert.ok(replay.lastSettlement?.auditHash);
  assert.equal(replay.audit.events[0].action, "race_settled");
  assert.deepEqual(replay.lastSettlement?.finishOrder.slice(0, 1), [replay.lastSettlement?.winningRacerId]);
});
