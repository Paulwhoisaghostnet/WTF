import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("remaining core TzKT kernel callers use the shared upstream client", async () => {
  const upstreamSource = await readFile(new URL("./lib/upstream.ts", import.meta.url), "utf8");
  const files = await Promise.all([
    "lib/operator-wallet-balances.ts",
    "lib/contract-metadata-sync.ts",
    "lib/tzkt-ops.ts",
    "tzprofiles.ts",
    "features/wtf-subdomains/contracts.ts",
    "routes/contract-activity.ts",
    "routes/operator-wallet.ts",
  ].map(async (file) => ({
    file,
    source: await readFile(new URL(`./${file}`, import.meta.url), "utf8"),
  })));

  for (const { file, source } of files) {
    assert.match(source, /from ".*upstream"/, file);
    assert.match(source, /tzkt\)?\.(?:raw|getJson)/, file);
    assert.doesNotMatch(source, /await fetch\(/, file);
  }

  assert.match(upstreamSource, /import \{ getTzktBase \} from "\.\/contract-config"/);
  assert.match(upstreamSource, /baseUrl: getTzktBase\(\)/);
  assert.doesNotMatch(
    upstreamSource,
    /baseUrl: \(process\.env\.TZKT_API_URL/,
    "the shared TzKT client must inherit the central network-aware endpoint resolver"
  );

  const operator = files.find((entry) => entry.file === "lib/operator-wallet-balances.ts")!.source;
  assert.doesNotMatch(operator, /TZKT_BASE/, "operator balances must not own a TzKT base URL");

  const metadata = files.find((entry) => entry.file === "lib/contract-metadata-sync.ts")!.source;
  assert.doesNotMatch(
    metadata,
    /getTzktBase|RETRY_COUNT|RETRY_DELAY_MS/,
    "contract metadata sync must inherit endpoint and retry policy from the shared client"
  );

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
