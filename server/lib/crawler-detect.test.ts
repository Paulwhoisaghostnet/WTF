import assert from "node:assert/strict";
import test from "node:test";

import {
  crawlerCachePolicy,
  isCrawlerUserAgent,
  requestLooksLikeCrawler,
} from "./crawler-detect";

test("crawler detection recognizes social preview agents", () => {
  assert.equal(isCrawlerUserAgent("Twitterbot/1.0"), true);
  assert.equal(isCrawlerUserAgent("Discordbot/2.0"), true);
  assert.equal(isCrawlerUserAgent("Mozilla/5.0 Chrome/120 Safari/537.36"), false);
});

test("crawler request heuristics handle preview headers without flagging browsers", () => {
  assert.equal(
    requestLooksLikeCrawler({
      headers: {
        "user-agent": "Slackbot-LinkExpanding 1.0",
      },
    } as any),
    true
  );
  assert.equal(
    requestLooksLikeCrawler({
      headers: {
        "user-agent": "Mozilla/5.0 Chrome/120 Safari/537.36",
        purpose: "prefetch",
      },
    } as any),
    false
  );
});

test("crawler cache policy gives previews a longer HTML cache", () => {
  assert.match(crawlerCachePolicy(true), /max-age=300/);
  assert.match(crawlerCachePolicy(false), /max-age=30/);
});
