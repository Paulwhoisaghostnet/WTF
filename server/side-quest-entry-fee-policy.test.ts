import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sideQuestRoutes = readFileSync("server/routes/side-quests.ts", "utf8");
const recaptureRoutes = readFileSync("server/routes/wtf-recapture.ts", "utf8");

function routeBody(source: string, route: string, nextRoute?: string): string {
  const start = source.indexOf(route);
  assert.notEqual(start, -1, `missing route ${route}`);
  const end = nextRoute
    ? source.indexOf(nextRoute, start + route.length)
    : source.length;
  assert.notEqual(end, -1, `missing route boundary ${nextRoute}`);
  return source.slice(start, end);
}

function assertOrdered(source: string, labels: readonly string[]) {
  let previous = -1;
  for (const label of labels) {
    const index = source.indexOf(label);
    assert.ok(
      index > previous,
      `${label} must occur after the prior fee-gate step`,
    );
    previous = index;
  }
}

test("completion requires the fee decision before verification, persistence, or rewards", () => {
  const completionRoute = routeBody(
    sideQuestRoutes,
    '"/api/side-quests/:id/complete"',
    '"/api/side-quest-completions/:id/approve"',
  );
  assertOrdered(completionRoute, [
    "getSideQuestEntryFeeDecision(",
    "if (!feeDecision.allowed)",
    "runAutoVerify(",
    ".insert(sideQuestCompletions)",
    "distributeRewards(",
  ]);
});

test("first-time staff approval requires the fee decision before approval or rewards", () => {
  const approvalRoute = routeBody(
    sideQuestRoutes,
    '"/api/side-quest-completions/:id/approve"',
  );
  assertOrdered(approvalRoute, [
    "if (isApproved && !comp.approved)",
    "getSideQuestEntryFeeDecision(",
    "if (!feeDecision.allowed)",
    ".update(sideQuestCompletions)",
    "distributeRewards(",
  ]);
});

test("manual confirmation binds the fee row to the quest in the route", () => {
  const confirmationRoute = routeBody(
    recaptureRoutes,
    '"/api/side-quests/:id/entry-fee/:feeId/confirm"',
  );
  assert.match(confirmationRoute, /eq\(sideQuestEntryFees\.id, feeId\)/);
  assert.match(
    confirmationRoute,
    /eq\(sideQuestEntryFees\.sideQuestId, sideQuestId\)/,
  );
  assert.match(
    confirmationRoute,
    /\.returning\(\{ id: sideQuestEntryFees\.id \}\)/,
  );
  assert.match(confirmationRoute, /Entry fee not found for this side quest/);
});
