import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./in-app-market-sync.ts", import.meta.url),
  "utf8"
);

test("TzKT transaction IDs use the collection id filter, not the operation-hash route", () => {
  const helper = source.match(
    /async function fetchTransactionById[\s\S]*?\n}\n\nasync function fetchTransfersForTransactionIds/
  )?.[0];

  assert.ok(helper, "fetchTransactionById helper must remain present");
  assert.match(helper, /"\/operations\/transactions"/);
  assert.match(helper, /id:\s*transactionId/);
  assert.match(helper, /limit:\s*1/);
  assert.doesNotMatch(
    helper,
    /`\/operations\/transactions\/\$\{transactionId\}`/,
    "the path parameter is reserved for operation hashes"
  );
});
