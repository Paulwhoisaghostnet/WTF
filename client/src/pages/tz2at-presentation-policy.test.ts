import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tz2atSource = readFileSync(new URL("./Tz2at.tsx", import.meta.url), "utf8");

test("Tz2at route exposes a presentation-host boundary for Gamma", () => {
  assert.match(tz2atSource, /usePresentationShell/);
  assert.match(tz2atSource, /data-tz2at-surface="identity-market-analytics"/);
  assert.match(tz2atSource, /data-tz2at-presentation-host=\{presentation\.host\}/);
  assert.match(tz2atSource, /data-tz2at-region="surface"/);
  assert.match(tz2atSource, /tz2atRegionAttrs\("metric"\)/);
  assert.match(tz2atSource, /tz2atRegionAttrs\("readout-panel"\)/);
  assert.match(tz2atSource, /tz2atRegionAttrs\("chart-panel"\)/);
});

test("Tz2at Gamma chrome overrides app-owned analytics panels without changing Classic defaults", () => {
  assert.match(tz2atSource, /data-tz2at-presentation-host="gamma"/);
  assert.match(tz2atSource, /background-image:\s*none\s*!important/);
  assert.match(tz2atSource, /box-shadow:\s*none\s*!important/);
  assert.match(tz2atSource, /border-radius:\s*6px\s*!important/);
  assert.match(tz2atSource, /#070706/);
  assert.match(tz2atSource, /#00d2ff/);
  assert.match(tz2atSource, /#d6ff3f/);
});

test("Tz2at keeps shared identity, analytics, OAuth, and firehose behavior", () => {
  assert.match(tz2atSource, /api\.get<Tz2atStatus>\("\/api\/tz2at\/status"\)/);
  assert.match(tz2atSource, /api\.post\("\/api\/tz2at\/import\/tzbsky"/);
  assert.match(tz2atSource, /api\.post\("\/api\/tz2at\/publish\/wallet-link"/);
  assert.match(tz2atSource, /api\.post\("\/api\/tz2at\/pds-offering\/request"/);
  assert.match(tz2atSource, /fetchWithCsrf\(`\/api\/tz2at\/firehose\/events\?\$\{params\.toString\(\)\}`\)/);
  assert.match(tz2atSource, /fetchWithCsrf\(`\/api\/tz2at\/ecosystem\/analytics\?\$\{params\.toString\(\)\}`\)/);
  assert.match(tz2atSource, /window\.open\(`\/api\/atproto\/oauth\/start\?\$\{params\.toString\(\)\}`/);
  assert.doesNotMatch(tz2atSource, /\/api\/gamma/);
});
