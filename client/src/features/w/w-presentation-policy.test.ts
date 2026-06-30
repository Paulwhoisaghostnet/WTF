import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync("client/src/features/w/WShell.tsx", "utf8");
const timelineSource = readFileSync("client/src/features/w/timeline/WTimelinePanel.tsx", "utf8");

test("W shell and timeline custom chrome are presentation-host aware", () => {
  assert.match(shellSource, /usePresentationShell/);
  assert.match(shellSource, /data-w-surface="w-shell"/);
  assert.match(shellSource, /data-w-presentation-host=\{presentation\.host\}/);
  assert.match(shellSource, /\[data-w-presentation-host="gamma"\]/);
  assert.match(shellSource, /data-w-region="header"/);
  assert.match(shellSource, /data-w-region="title"/);
  assert.match(shellSource, /data-w-region="view-nav"/);
  assert.match(shellSource, /data-w-region="main-surface"/);
  assert.match(shellSource, /background-image:\s*none/);
  assert.match(shellSource, /box-shadow:\s*none/);
  assert.match(shellSource, /border-radius:\s*6px/);
  assert.match(shellSource, /letter-spacing:\s*0/);

  assert.match(timelineSource, /\[data-w-presentation-host="gamma"\]/);
  assert.match(timelineSource, /data-w-region="post-card"/);
  assert.match(timelineSource, /data-w-region="embed-frame"/);
  assert.match(timelineSource, /background-image:\s*none/);
  assert.match(timelineSource, /box-shadow:\s*none/);
  assert.match(timelineSource, /border-radius:\s*6px/);
});

test("W keeps X and OAuth exits outside presentation route rewriting", () => {
  assert.match(timelineSource, /window\.open\(post\.url, "_blank", "noopener,noreferrer"\)/);
  assert.match(timelineSource, /window\.open\(xIntentRepost\(post\.id\), "_blank", "noopener,noreferrer"\)/);
  assert.match(timelineSource, /window\.open\(xIntentReply\(post\.id\), "_blank", "noopener,noreferrer"\)/);
});
