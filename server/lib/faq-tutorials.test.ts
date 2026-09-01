import assert from "node:assert/strict";
import test from "node:test";
import {
  FAQ_TUTORIAL_ACCOUNT_NAME,
  getFaqTutorialCatalog,
  getPublicFaqTutorialCatalog,
} from "./faq-tutorials";

test("FAQ tutorial catalog covers each requested registration journey as TommyTezos", () => {
  const catalog = getFaqTutorialCatalog();
  assert.equal(FAQ_TUTORIAL_ACCOUNT_NAME, "TommyTezos");
  assert.deepEqual(
    catalog.map((tutorial) => tutorial.slug),
    [
      "create-account-and-sign-in",
      "find-and-open-tools",
      "connect-tezos-wallet",
      "connect-etherlink-wallet",
      "connect-x-identity",
      "connect-discord-identity",
      "connect-skywire-bluesky",
      "connect-google-drive",
    ]
  );
  for (const tutorial of catalog) {
    assert.equal(tutorial.accountName, "TommyTezos");
    assert.match(tutorial.videoObjectKey, /^faq\/tutorials\/2026-09-01\/.+\.mp4$/);
    assert.match(tutorial.captionsObjectKey, /\.vtt$/);
    assert.match(tutorial.posterObjectKey, /\.jpg$/);
    assert.ok(tutorial.steps.length >= 4);
    assert.ok(tutorial.narration.includes("TommyTezos"));
  }
});

test("public FAQ tutorial catalog exposes proxied media, captions, and transcripts without S3 keys", () => {
  const tutorials = getPublicFaqTutorialCatalog();
  for (const tutorial of tutorials) {
    assert.equal(tutorial.accountName, "TommyTezos");
    assert.equal(tutorial.aiNarration, true);
    assert.match(tutorial.videoUrl, /^\/api\/faq\/tutorials\/.+\/video$/);
    assert.match(tutorial.captionsUrl, /\/captions$/);
    assert.match(tutorial.posterUrl, /\/poster$/);
    assert.ok(tutorial.transcript.length > 100);
    assert.equal("videoObjectKey" in tutorial, false);
    assert.equal("captionsObjectKey" in tutorial, false);
    assert.equal("posterObjectKey" in tutorial, false);
  }
});
