import assert from "node:assert/strict";
import test from "node:test";
import {
  getRugPullSnapshot,
  joinRugPullRound,
  joinRugPullWitness,
  pressRugPullButton,
  resetRugPullMockState,
  voteRugPullWitness,
} from "./service";
import type { ConsoleAuthUser } from "../../../console/types";

const NOW = 1_760_000_000_000;
const ALICE: ConsoleAuthUser = { id: 1, username: "alice", displayName: "Alice", role: null };

test("Rug Pull mocked service gates actions by phase and settles Panic Mode", () => {
  resetRugPullMockState(NOW);
  const joined = joinRugPullRound(ALICE, NOW);
  assert.equal(joined.ok, true);

  const lockedPress = pressRugPullButton(ALICE, NOW + 1_000);
  assert.equal(lockedPress.ok, false);

  const pressed = pressRugPullButton(ALICE, NOW + 46_000);
  assert.equal(pressed.ok, true);
  assert.equal(pressed.snapshot.round.phase, "panic");

  const settled = getRugPullSnapshot(ALICE, NOW + 80_000);
  assert.equal(settled.round.phase, "active");
  assert.equal(settled.lastSettlement?.payouts.length, 1);
});

test("Rug Pull witnesses can vote only during Panic Mode", () => {
  resetRugPullMockState(NOW);
  assert.equal(joinRugPullWitness(ALICE, NOW).ok, true);
  assert.equal(voteRugPullWitness(ALICE, "mercy", NOW).ok, false);
  assert.equal(joinRugPullRound(ALICE, NOW + 1_000).ok, true);
  assert.equal(pressRugPullButton(ALICE, NOW + 47_000).ok, true);
  const voted = voteRugPullWitness(ALICE, "mercy", NOW + 48_000);
  assert.equal(voted.ok, true);
  assert.equal(voted.snapshot.round.panicModifier, "mercy");
});
