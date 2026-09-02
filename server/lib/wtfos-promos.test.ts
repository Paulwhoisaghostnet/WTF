import assert from "node:assert/strict";
import test from "node:test";
import {
  WTFOS_PROMO_ACCOUNT_NAME,
  getPublicWtfosPromoCatalog,
  getWtfosPromoCatalog,
} from "./wtfos-promos";

test("wtfOS promo catalog covers the canonical task wayfinder with TommyTezos", () => {
  const catalog = getWtfosPromoCatalog();
  assert.equal(WTFOS_PROMO_ACCOUNT_NAME, "TommyTezos");
  assert.deepEqual(
    catalog.map((promo) => promo.category),
    ["Overview", "Play", "Create", "Shop", "Events", "Talk"]
  );

  for (const promo of catalog) {
    assert.equal(promo.accountName, "TommyTezos");
    assert.ok(promo.scenes.length > 0);
    assert.equal(promo.spokenSteps.length, promo.scenes.length);
    assert.equal(promo.narration, promo.spokenSteps.join(" "));
    assert.ok(promo.scenes.every((scene) => scene.route.startsWith("/")));
    assert.match(promo.videoObjectKey, /^faq\/promos\/2026-09-01\/.+\.mp4$/);
    assert.match(promo.captionsObjectKey, /\.vtt$/);
    assert.match(promo.posterObjectKey, /\.jpg$/);
    assert.match(promo.narration, /^Hey, I'm Tommy\./);
  }
});

test("public promo catalog exposes same-origin media routes without S3 keys", () => {
  const promos = getPublicWtfosPromoCatalog();
  for (const promo of promos) {
    assert.match(promo.videoUrl, /^\/api\/faq\/promos\/.+\/video$/);
    assert.match(promo.captionsUrl, /^\/api\/faq\/promos\/.+\/captions$/);
    assert.match(promo.posterUrl, /^\/api\/faq\/promos\/.+\/poster$/);
    assert.equal(promo.aiNarration, true);
    assert.ok(promo.transcript.length > 0);
    assert.equal("videoObjectKey" in promo, false);
    assert.equal("captionsObjectKey" in promo, false);
    assert.equal("posterObjectKey" in promo, false);
  }
});
