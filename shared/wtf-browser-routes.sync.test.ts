import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BROWSER_ROUTE_META } from "./wtf-browser-routes";

test("BROWSER_ROUTE_META stays aligned with PAGE_DEFS route patterns", () => {
  const pageDefsSource = readFileSync("client/src/routes/page-defs.ts", "utf8");
  const patterns = [...pageDefsSource.matchAll(/pattern:\s*"([^"]+)"/g)].map((match) => match[1]);
  const metaPatterns = new Set(BROWSER_ROUTE_META.map((route) => route.pattern));

  const missing = patterns.filter((pattern) => !metaPatterns.has(pattern));
  assert.deepEqual(
    missing,
    [],
    `Add missing patterns to shared/wtf-browser-routes.ts: ${missing.join(", ")}`
  );
});
