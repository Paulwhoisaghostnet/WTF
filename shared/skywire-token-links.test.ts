import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSkywireTokenUrlsFromValues,
  isSkywireTokenUrl,
  SKYWIRE_MARKET_FEED_DOMAINS,
  SKYWIRE_MARKET_FEED_SEARCH_TERMS,
} from "./skywire-token-links";

test("Skywire token URL matcher covers every marketplace overlay URL family", () => {
  const valid = [
    "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/123",
    "https://objkt.com/token/clean_slug/456",
    "https://objkt.com/tokens/clean_slug/456",
    "https://objkt.com/collections/clean_slug/tokens/222",
    "https://objkt.com/open-edition/333",
    "https://teia.art/objkt/789",
    "https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
    "https://teia.art/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
  ];
  for (const url of valid) {
    assert.equal(isSkywireTokenUrl(url), true, url);
  }

  const invalid = [
    "https://objkt.com",
    "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/not-a-token",
    "https://teia.art/objkt/not-a-token",
    "https://example.com/objkt/789",
  ];
  for (const url of invalid) {
    assert.equal(isSkywireTokenUrl(url), false, url);
  }
});

test("Skywire token extraction reads text, external embeds, and rich-text facet hrefs", () => {
  assert.deepEqual(
    extractSkywireTokenUrlsFromValues([
      "plain copy",
      "https://objkt.com/token/clean_slug/456,",
      "https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
    ]),
    [
      "https://objkt.com/token/clean_slug/456",
      "https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
    ],
  );
});

test("Skywire marketplace feed terms stay aligned with supported overlay hosts", () => {
  for (const domain of SKYWIRE_MARKET_FEED_DOMAINS) {
    assert.ok(
      SKYWIRE_MARKET_FEED_SEARCH_TERMS.some((term) => term.startsWith(`${domain}/`)),
      `missing search term for ${domain}`,
    );
  }
});
