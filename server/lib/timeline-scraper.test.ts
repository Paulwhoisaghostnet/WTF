import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPostsFromProfileHtml,
  parseStatusUrl,
} from "./timeline-scraper";
import { getWTimelineIngestMode } from "./w-timeline-ingest-mode";

test("parseStatusUrl extracts tweet id and handle", () => {
  assert.deepEqual(parseStatusUrl("https://x.com/tezos/status/1234567890"), {
    id: "1234567890",
    handle: "tezos",
  });
});

test("extractPostsFromProfileHtml parses tweet articles", () => {
  const html = `
    <article data-testid="tweet">
      <a href="/tezos/status/111"></a>
      <time datetime="2026-05-28T12:00:00.000Z"></time>
      <div data-testid="tweetText">Hello <span>Tezos</span></div>
    </article>
  `;
  const posts = extractPostsFromProfileHtml(html, "tezos");
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.id, "111");
  assert.match(posts[0]?.displayText || "", /Hello Tezos/);
});

test("getWTimelineIngestMode defaults to digest when stream is off", () => {
  const prevMode = process.env.W_TIMELINE_INGEST_MODE;
  const prevStream = process.env.W_TIMELINE_STREAM_ENABLED;
  const prevScraper = process.env.W_TIMELINE_SCRAPER_ENABLED;
  delete process.env.W_TIMELINE_INGEST_MODE;
  process.env.W_TIMELINE_STREAM_ENABLED = "0";
  process.env.W_TIMELINE_SCRAPER_ENABLED = "1";
  assert.equal(getWTimelineIngestMode(), "digest");
  if (prevMode === undefined) delete process.env.W_TIMELINE_INGEST_MODE;
  else process.env.W_TIMELINE_INGEST_MODE = prevMode;
  if (prevStream === undefined) delete process.env.W_TIMELINE_STREAM_ENABLED;
  else process.env.W_TIMELINE_STREAM_ENABLED = prevStream;
  if (prevScraper === undefined) delete process.env.W_TIMELINE_SCRAPER_ENABLED;
  else process.env.W_TIMELINE_SCRAPER_ENABLED = prevScraper;
});
