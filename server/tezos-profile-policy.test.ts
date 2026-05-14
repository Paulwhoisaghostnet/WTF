import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Tezos profile/domain helpers use shared upstream clients and bounded caches", async () => {
  const [profiles, domains, upstream] = await Promise.all([
    readFile(new URL("./tzprofiles.ts", import.meta.url), "utf8"),
    readFile(new URL("./teznames.ts", import.meta.url), "utf8"),
    readFile(new URL("./lib/upstream.ts", import.meta.url), "utf8"),
  ]);

  assert.match(profiles, /createBoundedExpiringCache<\{ alias: string \| null \}>/);
  assert.match(profiles, /from "\.\/lib\/upstream"/);
  assert.match(profiles, /tzkt\.getJson/);
  assert.match(profiles, /tzprofiles\.getJson/);
  assert.match(profiles, /objkt\.postJson/);
  assert.doesNotMatch(profiles, /await fetch\(/);
  assert.doesNotMatch(profiles, /profileCache\s*=\s*new Map/);
  assert.doesNotMatch(profiles, /TZKT_BASE/);

  assert.match(domains, /createBoundedExpiringCache<\{ domain: string \| null \}>/);
  assert.match(domains, /teznames\.getJson/);
  assert.doesNotMatch(domains, /await fetch\(/);
  assert.doesNotMatch(domains, /domainCache\s*=\s*new Map/);
  assert.doesNotMatch(domains, /TEZNAMES_API/);

  assert.match(upstream, /label: "tzprofiles"/);
  assert.match(upstream, /label: "teznames"/);
});
