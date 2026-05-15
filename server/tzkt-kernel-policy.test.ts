import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("remaining core TzKT kernel callers use the shared upstream client", async () => {
  const files = await Promise.all([
    "lib/operator-wallet-balances.ts",
    "features/wtf-subdomains/contracts.ts",
    "routes/contract-activity.ts",
    "routes/operator-wallet.ts",
  ].map(async (file) => ({
    file,
    source: await readFile(new URL(`./${file}`, import.meta.url), "utf8"),
  })));

  for (const { file, source } of files) {
    assert.match(source, /from "\.\.\/.*upstream"|from "\.\/upstream"/, file);
    assert.match(source, /tzkt\.(raw|getJson)/, file);
    assert.doesNotMatch(source, /await fetch\(/, file);
  }

  const operator = files.find((entry) => entry.file === "lib/operator-wallet-balances.ts")!.source;
  assert.doesNotMatch(operator, /TZKT_BASE/, "operator balances must not own a TzKT base URL");

  const operatorRoutes = files.find((entry) => entry.file === "routes/operator-wallet.ts")!.source;
  assert.doesNotMatch(
    operatorRoutes,
    /process\.env\.TZKT_API_URL/,
    "operator-wallet reconciliation must not own a TzKT base URL"
  );
  assert.match(
    operatorRoutes,
    /TzKT upstream returned invalid operation data/,
    "operator-wallet reconciliation must fail closed on malformed TzKT responses"
  );
});
