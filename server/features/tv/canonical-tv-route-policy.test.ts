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

test("TV route and page stay as modular compatibility wrappers", () => {
  const tvRoute = readRepoFile("server/routes/tv.ts");
  const tvPage = readRepoFile("client/src/pages/TV.tsx");
  const tvMenuScreens = readRepoFile("client/src/features/tv/TVMenuScreens.tsx");

  assert.ok(tvRoute.split("\n").length < 80, "server/routes/tv.ts should stay a thin wrapper");
  assert.ok(tvPage.split("\n").length < 1000, "client/src/pages/TV.tsx should stay below 1000 lines");
  assert.ok(
    tvMenuScreens.split("\n").length < 600,
    "client/src/features/tv/TVMenuScreens.tsx should stay below 600 lines"
  );

  for (const path of [
    "server/features/tv/channel-routes.ts",
    "server/features/tv/playback-routes.ts",
    "server/features/tv/playlist-routes.ts",
    "server/features/tv/bumper-routes.ts",
    "server/features/tv/cache-routes.ts",
    "client/src/features/tv/TVPlaybackSurface.tsx",
    "client/src/features/tv/useTVDataQueries.ts",
    "client/src/features/tv/useTVMutations.ts",
    "client/src/features/tv/useTVQueueAdvanceController.ts",
    "client/src/features/tv/menu/PlaylistsScreen.tsx",
    "client/src/features/tv/menu/BumpersScreen.tsx",
    "client/src/features/tv/menu/ScheduleScreen.tsx",
  ]) {
    assert.ok(existsSync(join(root, path)), `${path} must exist`);
  }
});
