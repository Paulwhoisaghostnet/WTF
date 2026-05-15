import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("TV uses one canonical route and no retired alternate implementation", () => {
  const app = readRepoFile("client/src/App.tsx");
  const pageDefs = readRepoFile("client/src/routes/page-defs.ts");
  const retiredSuffix = "2";
  const retiredRoute = `/tv${retiredSuffix}`;
  const retiredSymbol = `TV${retiredSuffix}`;
  const retiredPage = `${retiredSymbol}.tsx`;

  assert.equal(
    existsSync(join(root, "client/src/pages", retiredPage)),
    false,
    "the retired TV page must stay deleted"
  );
  assert.match(
    pageDefs,
    /const TVPage = lazy\(\(\) => import\("\.\.\/pages\/TV"\)/,
    "route registry must import the canonical TV page"
  );
  assert.match(
    pageDefs,
    /pattern:\s*"\/tv"[^}]*component:\s*TVPage/s,
    "the canonical /tv route must point at TVPage"
  );
  for (const source of [app, pageDefs]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(retiredRoute)));
    assert.doesNotMatch(source, new RegExp(escapeRegExp(retiredSymbol)));
  }
});

test("canonical TV owns the hardened playback and telemetry path", () => {
  const tvPage = readRepoFile("client/src/pages/TV.tsx");
  const mediaHandlers = readRepoFile("client/src/features/tv/useTVMediaEventHandlers.ts");
  const clientTelemetry = readRepoFile("client/src/features/tv/telemetry.ts");
  const serverTelemetry = readRepoFile("server/features/tv/telemetry-routes.ts");

  assert.match(tvPage, /useTVSkipNotice/);
  assert.match(tvPage, /useTVMediaEventHandlers/);
  assert.match(tvPage, /sessionIdRef/);
  assert.match(tvPage, /TVPlaybackSurface/);
  assert.match(mediaHandlers, /reportItemEnd/);
  assert.match(mediaHandlers, /sessionIdRef/);
  assert.match(mediaHandlers, /flashSkipNotice/);
  assert.match(mediaHandlers, /sessionSkipListRef/);
  assert.match(mediaHandlers, /failedItemCountsRef/);
  assert.match(clientTelemetry, /\/api\/tv\/telemetry\/item-end/);
  assert.match(clientTelemetry, /navigator\.sendBeacon/);
  assert.match(clientTelemetry, /fetch\("\/api\/tv\/telemetry\/item-end"/);
  assert.match(
    serverTelemetry,
    /router\.post\("\/api\/tv\/telemetry\/item-end",\s*tvTelemetryRateLimit/
  );
});
