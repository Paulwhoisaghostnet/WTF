import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const challengeActionHandlers = readFileSync(
  "server/challenges/actions/handlers.ts",
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
