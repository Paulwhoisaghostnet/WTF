import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionControlCounts } from "./mission-control-model";

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
