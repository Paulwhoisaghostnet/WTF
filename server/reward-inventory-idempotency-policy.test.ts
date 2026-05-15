import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const challengeActionHandlers = readFileSync(
  "server/challenges/actions/handlers.ts",
  "utf8"
);
const challengeRoutes = readFileSync("server/routes/challenges.ts", "utf8");
const sideQuestRoutes = readFileSync("server/routes/side-quests.ts", "utf8");
const crpNominationWatcher = readFileSync(
  "server/lib/verifiers/crp-nomination-watcher.ts",
  "utf8"
);

test("challenge automation inventory grants are idempotent under retry replay", () => {
  assert.match(challengeActionHandlers, /challengeRewardGrantKey/);
  assert.match(challengeActionHandlers, /metadataGrantKey/);
  assert.match(challengeActionHandlers, /WHEN COALESCE\(\$\{inAppInventoryItems\.metadata\}, '\{\}'::jsonb\)\s+\?\s+\$\{metadataGrantKey\}/);
  assert.match(challengeActionHandlers, /THEN \$\{inAppInventoryItems\.quantity\}/);
  assert.match(challengeActionHandlers, /ELSE \$\{inAppInventoryItems\.quantity\} \+ \$\{quantity\}/);
});

test("challenge automation WTF reward ledger uses the completion as an idempotent source", () => {
  assert.match(challengeActionHandlers, /const rewardSourceId = context\.completionId/);
  assert.match(challengeActionHandlers, /eq\(rewardLedger\.sourceType, "challenge_automation"\)/);
  assert.match(challengeActionHandlers, /eq\(rewardLedger\.sourceId, rewardSourceId\)/);
  assert.match(challengeActionHandlers, /sourceId: rewardSourceId/);
});

test("manual challenge and side-quest rewards check their source before inserting ledger rows", () => {
  assert.match(challengeRoutes, /eq\(rewardLedger\.userId, submissionRow\.userId\)/);
  assert.match(challengeRoutes, /eq\(rewardLedger\.sourceType, "challenge"\)/);
  assert.match(challengeRoutes, /eq\(rewardLedger\.sourceId, challengeId\)/);
  assert.match(challengeRoutes, /if \(!existing\) \{/);
  assert.match(challengeRoutes, /sourceId: challengeId/);

  assert.match(sideQuestRoutes, /eq\(rewardLedger\.userId, userId\)/);
  assert.match(sideQuestRoutes, /eq\(rewardLedger\.sourceType, "side_quest"\)/);
  assert.match(sideQuestRoutes, /eq\(rewardLedger\.sourceId, quest\.id\)/);
  assert.match(sideQuestRoutes, /if \(!existing\) \{/);
  assert.match(sideQuestRoutes, /sourceId: quest\.id/);
});

test("CRP nomination reward top-ups are bounded by the nomination reward counter", () => {
  assert.match(crpNominationWatcher, /rewardCount: crpNominations\.rewardCount/);
  assert.match(crpNominationWatcher, /const previousRewardCount = prev\?\.rewardCount \?\? 0/);
  assert.match(crpNominationWatcher, /previousCount: previousRewardCount/);
  assert.match(crpNominationWatcher, /eq\(crpNominations\.sideQuestId, quest\.id\)/);
  assert.match(crpNominationWatcher, /eq\(crpNominations\.postId, tweet\.id\)/);
  assert.match(crpNominationWatcher, /rewardCount: Math\.min\(\s+uniqueCount,\s+quest\.autoVerifyConfig\.maxMentions\s+\)/);
});
