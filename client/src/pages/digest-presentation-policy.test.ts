import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const digestSource = readFileSync(new URL("./Digest.tsx", import.meta.url), "utf8");

test("Digest chrome is presentation-host aware", () => {
  assert.match(digestSource, /usePresentationShell/);
  assert.match(digestSource, /presentationRouteHref/);
  assert.match(digestSource, /data-digest-surface="comms-digest"/);
  assert.match(digestSource, /data-digest-presentation-host=\{presentation\.host\}/);
  assert.match(digestSource, /\[data-digest-presentation-host="gamma"\]/);
  assert.match(digestSource, /data-digest-region="source-panel"/);
  assert.match(digestSource, /data-digest-region="toolbar"/);
  assert.match(digestSource, /data-digest-region="source-select"/);
  assert.match(digestSource, /data-digest-region="feed"/);
  assert.match(digestSource, /data-digest-region="card"/);
  assert.match(digestSource, /data-digest-region="title"/);
  assert.match(digestSource, /data-digest-region="preview"/);
  assert.match(digestSource, /data-digest-region="open-button"/);
  assert.match(digestSource, /data-digest-region="source-button"/);
});

test("Digest Gamma styling stays within the presentation layer", () => {
  assert.match(digestSource, /background-image:\s*none/);
  assert.match(digestSource, /box-shadow:\s*none/);
  assert.match(digestSource, /text-shadow:\s*none/);
  assert.match(digestSource, /border-radius:\s*6px/);
  assert.match(digestSource, /letter-spacing:\s*0/);
  assert.match(digestSource, /#070706/);
  assert.match(digestSource, /#11110f/);
  assert.match(digestSource, /#00d2ff/);
  assert.match(digestSource, /#d6ff3f/);
  assert.match(digestSource, /#f2ead9/);
});

test("Digest preserves shared comms APIs and rewrites only browser navigation", () => {
  assert.match(digestSource, /api\.get<\{ sources: Source\[\] \}>\("\/api\/comms\/sources"\)/);
  assert.match(digestSource, /api\.get<\{ items: CommsCard\[\] \}>/);
  assert.match(digestSource, /\/api\/comms\/items/);
  assert.match(digestSource, /api\.post\(`\/api\/comms\/items\/\$\{id\}\/read`, \{\}\)/);
  assert.match(digestSource, /presentationRouteHref\(route, presentation\.host\)/);
  assert.match(digestSource, /openPresentationRoute\(`\/browser\?url=\$\{encodeURIComponent\(item\.originUrl!\)\}`\)/);
  assert.doesNotMatch(digestSource, /\/api\/gamma/);
});
