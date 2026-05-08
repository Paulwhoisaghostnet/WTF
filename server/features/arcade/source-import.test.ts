import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

test("source arcade import candidate maps remote game to same-origin arcade proxy", async () => {
  const { toArcadeSourceImportCandidate } = await import("./source-import");
  const candidate = toArcadeSourceImportCandidate({
    slug: "flappy-bower",
    title: "Flappy Bower",
    description: "Tap to flap.",
    category: "arcade",
    builder: {
      domain: "skllz.hack.tez",
      address: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
    },
    ipfsCid: "fUAedxk5ti23jSWH9S1IyoSr/v1",
    coverKey: "fUAedxk5ti23jSWH9S1IyoSr/cover",
    version: 1,
    playCount: 7,
    playerCount: 2,
  });

  assert.ok(candidate);
  assert.equal(candidate.localSlug, "arcade-flappy-bower");
  assert.equal(candidate.legacySlug, "hackcade-flappy-bower");
  assert.equal(
    candidate.embedPath,
    "/api/arcade/source/fUAedxk5ti23jSWH9S1IyoSr/v1/index.html?wtfGameSlug=arcade-flappy-bower&sourceSlug=flappy-bower"
  );
  assert.equal(
    candidate.coverUri,
    "/api/arcade/source/fUAedxk5ti23jSWH9S1IyoSr/cover"
  );
  assert.equal(
    candidate.sourceUrl,
    "https://hacktez.com/arcade-files/fUAedxk5ti23jSWH9S1IyoSr/v1/index.html"
  );
  assert.equal(candidate.builderName, "skllz.hack.tez");
  assert.equal(candidate.maxPossibleScore, null);
  assert.equal(candidate.maxScorePerSecond, null);
});

test("source arcade storage keys reject traversal", async () => {
  const { normalizeArcadeSourceStorageKey } = await import("./source-import");
  assert.equal(normalizeArcadeSourceStorageKey("../index.html"), "");
  assert.equal(normalizeArcadeSourceStorageKey("/abc/v1/index.html"), "abc/v1/index.html");
  assert.equal(normalizeArcadeSourceStorageKey("abc\\v1\\index.html"), "");
});

test("source arcade health checks use WTF-owned audit action", async () => {
  const { ARCADE_SOURCE_CHECK_ACTION } = await import("./source-constants");
  assert.equal(ARCADE_SOURCE_CHECK_ACTION, "arcade_source_import_check");
});

test("source arcade worker defaults to a twice-daily cadence", async () => {
  const { resolveArcadeSourceImportIntervalMs } = await import("./source-import");
  assert.equal(resolveArcadeSourceImportIntervalMs({}), 12 * 60 * 60 * 1000);
  assert.equal(
    resolveArcadeSourceImportIntervalMs({ ARCADE_SOURCE_IMPORT_INTERVAL_MS: "1" }),
    60 * 60 * 1000
  );
});

test("source arcade public path normalizer keeps legacy rows on Arcade route", async () => {
  const { normalizeArcadeSourcePublicPath } = await import("./source-constants");
  assert.equal(
    normalizeArcadeSourcePublicPath(
      "/api/console/hackcade/abc/v1/index.html?wtfGameSlug=arcade-demo&hackcadeSlug=demo"
    ),
    "/api/arcade/source/abc/v1/index.html?wtfGameSlug=arcade-demo&sourceSlug=demo"
  );
  assert.equal(
    normalizeArcadeSourcePublicPath("/api/console/hackcade/abc/cover"),
    "/api/arcade/source/abc/cover"
  );
});

test("source compatibility global is isolated from the regular WTF Console SDK", async () => {
  const { WTF_CONSOLE_SDK } = await import("../console/sdk");
  const { ARCADE_SOURCE_COMPAT_SDK } = await import("./source-proxy");

  assert.ok(WTF_CONSOLE_SDK.includes("window.WTFConsole = sdk"));
  assert.equal(WTF_CONSOLE_SDK.includes("window.Hackcade"), false);
  assert.ok(ARCADE_SOURCE_COMPAT_SDK.includes("window.WTFArcade"));
  assert.ok(ARCADE_SOURCE_COMPAT_SDK.includes("window.Hackcade"));
});
