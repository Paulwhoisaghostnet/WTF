import assert from "node:assert/strict";
import test from "node:test";
import { getFaqTutorialCatalog } from "./faq-tutorials";
import { getWtfosPromoCatalog } from "./wtfos-promos";
import {
  WTFOS_GUIDE_TV_CHANNEL_SLUG,
  getWtfosGuideTvCatalog,
} from "./wtfos-guide-tv";

test("wtfOS Guide TV is exactly the promo and FAQ catalogs", () => {
  const promos = getWtfosPromoCatalog();
  const tutorials = getFaqTutorialCatalog();
  const channelCatalog = getWtfosGuideTvCatalog();

  assert.equal(WTFOS_GUIDE_TV_CHANNEL_SLUG, "wtfos-guide-tv");
  assert.equal(channelCatalog.length, promos.length + tutorials.length);
  assert.deepEqual(
    channelCatalog.map((entry) => `${entry.kind}:${entry.slug}`),
    [
      ...promos.map((entry) => `promo:${entry.slug}`),
      ...tutorials.map((entry) => `tutorial:${entry.slug}`),
    ]
  );
  assert.ok(channelCatalog.every((entry) => entry.accountName === "TommyTezos"));
  assert.ok(channelCatalog.every((entry) => entry.sourceUri.startsWith("/api/faq/")));
  assert.ok(channelCatalog.every((entry) => ["wtfos:promo", "wtfos:faq"].includes(entry.tokenContract)));
});
