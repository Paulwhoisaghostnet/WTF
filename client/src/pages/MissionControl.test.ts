import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  asMissionArray,
  deriveMissionControlCounts,
  deriveMissionControlHealth,
} from "./mission-control-model";

const missionControlSource = readFileSync("client/src/pages/MissionControl.tsx", "utf8");

test("Mission Control counts only live work and failed jobs", () => {
  const counts = deriveMissionControlCounts({
    challenges: [
      { id: 1, title: "Open", status: "active" },
      { id: 2, title: "Closed", status: "completed" },
    ],
    rewards: [
      { id: 1, challengeTitle: "Ready", claimable: true, claimed: false },
      { id: 2, challengeTitle: "Claimed", claimable: true, claimed: true },
      { id: 3, challengeTitle: "Held", claimable: false, claimed: false },
    ],
    notifications: { unreadCount: 3, items: [] },
    sync: {
      jobs: [
        { name: "ok", latest: { status: "completed" } },
        { name: "failed", latest: { status: "failed" } },
        { name: "errored", latest: { status: "completed", error: "boom" } },
      ],
    },
  });

  assert.deepEqual(counts, {
    openChallenges: 1,
    claimableRewards: 1,
    unreadNotifications: 3,
    failedJobs: 2,
  });
});

test("Mission Control ignores auth error envelopes where optional arrays are expected", () => {
  assert.deepEqual(asMissionArray({ error: "Not authenticated" }), []);

  const counts = deriveMissionControlCounts({
    challenges: { error: "offline" },
    rewards: { error: "Not authenticated" },
    notifications: null,
    sync: { jobs: { error: "not loaded" } as any },
  });

  assert.deepEqual(counts, {
    openChallenges: 0,
    claimableRewards: 0,
    unreadNotifications: 0,
    failedJobs: 0,
  });
});

test("Mission Control health summarizes production chain and job fields", () => {
  const health = deriveMissionControlHealth({
    ok: true,
    db: { ok: true },
    chain: {
      ok: true,
      network: "mainnet",
      tezosRpcUrl: "https://rpc.tzkt.io/mainnet",
    },
    jobs: {
      ok: true,
      registered: 26,
      running: 1,
      recentErrors: 0,
    },
  });

  assert.deepEqual(health, {
    system: "OK",
    db: "OK",
    chain: "mainnet ready",
    rpc: "https://rpc.tzkt.io/mainnet",
    jobs: "26 job(s), 1 running, 0 recent error(s)",
    recentErrors: 0,
  });
});

test("Mission Control emits shell events for view and route actions", () => {
  assert.match(missionControlSource, /eventType:\s*"mission_control\.viewed"/);
  assert.match(missionControlSource, /eventType:\s*"mission_control\.action_opened"/);
  assert.match(
    missionControlSource,
    /metadata:\s*\{\s*path,\s*intent\s*\}/,
    "route actions should preserve the target and reason for system observability"
  );
});
