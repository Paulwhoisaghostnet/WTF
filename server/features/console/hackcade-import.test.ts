import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

test("Hackcade import candidate maps remote game to same-origin console proxy", async () => {
  const { toHackcadeImportCandidate } = await import("./hackcade-import");
  const candidate = toHackcadeImportCandidate({
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
  assert.equal(candidate.localSlug, "hackcade-flappy-bower");
  assert.equal(
    candidate.embedPath,
    "/api/console/hackcade/fUAedxk5ti23jSWH9S1IyoSr/v1/index.html?wtfGameSlug=hackcade-flappy-bower&hackcadeSlug=flappy-bower"
  );
  assert.equal(
    candidate.coverUri,
    "/api/console/hackcade/fUAedxk5ti23jSWH9S1IyoSr/cover"
  );
  assert.equal(
    candidate.sourceUrl,
    "https://hacktez.com/arcade-files/fUAedxk5ti23jSWH9S1IyoSr/v1/index.html"
  );
  assert.equal(candidate.builderName, "skllz.hack.tez");
  assert.equal(candidate.maxPossibleScore, null);
  assert.equal(candidate.maxScorePerSecond, null);
});

test("Hackcade storage keys reject traversal", async () => {
  const { normalizeHackcadeStorageKey } = await import("./hackcade-import");
  assert.equal(normalizeHackcadeStorageKey("../index.html"), "");
  assert.equal(normalizeHackcadeStorageKey("/abc/v1/index.html"), "abc/v1/index.html");
  assert.equal(normalizeHackcadeStorageKey("abc\\v1\\index.html"), "");
});
