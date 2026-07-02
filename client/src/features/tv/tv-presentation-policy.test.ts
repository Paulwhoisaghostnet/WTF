import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync("client/src/features/tv/TVShellLayout.tsx", "utf8");
const chromeSource = readFileSync("client/src/features/tv/TVChrome.ts", "utf8");
const playbackSource = readFileSync("client/src/features/tv/TVPlaybackSurface.tsx", "utf8");

test("WTF TV cabinet and overlays are presentation-host aware", () => {
  assert.match(layoutSource, /usePresentationShell/);
  assert.match(layoutSource, /data-tv-surface="tv-shell"/);
  assert.match(layoutSource, /data-tv-presentation-host=\{presentation\.host\}/);
  assert.match(layoutSource, /data-tv-region="cabinet"/);
  assert.match(layoutSource, /data-tv-region="screen-bezel"/);
  assert.match(layoutSource, /data-tv-region="control-panel"/);

  assert.match(chromeSource, /\[data-tv-presentation-host="gamma"\]/);
  assert.match(chromeSource, /background-image:\s*none/);
  assert.match(chromeSource, /box-shadow:\s*none/);
  assert.match(chromeSource, /border-radius:\s*6px/);
  assert.match(chromeSource, /animation:\s*none/);
  assert.match(chromeSource, /display:\s*none/);
  assert.match(chromeSource, /#00d2ff/);
  assert.match(chromeSource, /#d6ff3f/);
});

test("WTF TV playback overlays expose rendered Gamma-proof regions and keep external links raw", () => {
  assert.match(playbackSource, /data-tv-region="crt-screen"/);
  assert.match(playbackSource, /data-tv-region="mtv-overlay"/);
  assert.match(playbackSource, /data-tv-region="osd"/);
  assert.match(playbackSource, /href=\{currentItem\.objktUrl\}/);
  assert.match(playbackSource, /target="_blank"/);
  assert.doesNotMatch(playbackSource, /presentationRouteHref\(currentItem\.objktUrl/);
});
