import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const gallerySource = readFileSync(new URL("./Gallery.tsx", import.meta.url), "utf8");
const collektSource = readFileSync(new URL("../features/collekt/CollektBridge.tsx", import.meta.url), "utf8");
const collektHookSource = readFileSync(new URL("../features/collekt/useCollektSession.ts", import.meta.url), "utf8");

test("public Gallery and token aliases expose Gamma host markers without adding token lookup behavior", () => {
  assert.match(gallerySource, /usePresentationShell/);
  assert.match(gallerySource, /data-gallery-surface="survival-gallery"/);
  assert.match(gallerySource, /data-gallery-presentation-host=\{presentation\.host\}/);
  assert.match(gallerySource, /\[data-gallery-presentation-host="gamma"\]/);
  assert.match(gallerySource, /data-gallery-region="intro"/);
  assert.match(gallerySource, /data-gallery-region="slideshow"/);
  assert.match(gallerySource, /data-gallery-region="grid"/);
  assert.match(gallerySource, /data-gallery-region="token-card"/);
  assert.match(gallerySource, /data-gallery-region="token-preview"/);
  assert.match(gallerySource, /data-gallery-region="notice"/);
  assert.match(gallerySource, /#00d2ff/);
  assert.match(gallerySource, /survivalTokens/);
  assert.doesNotMatch(gallerySource, /api\.get|api\.post|fetch\(|useParams/);
});

test("colleKT bridge exposes Gamma host markers around profile, wallet, fallback, and embed chrome", () => {
  assert.match(collektSource, /usePresentationShell/);
  assert.match(collektSource, /data-collekt-surface="bridge"/);
  assert.match(collektSource, /data-collekt-presentation-host=\{presentation\.host\}/);
  assert.match(collektSource, /\[data-collekt-presentation-host="gamma"\]/);
  assert.match(collektSource, /data-collekt-region="source-panel"/);
  assert.match(collektSource, /data-collekt-region="launch-row"/);
  assert.match(collektSource, /data-collekt-region="wallet-panel"/);
  assert.match(collektSource, /data-collekt-region="wallet-row"/);
  assert.match(collektSource, /data-collekt-region="frame-wrap"/);
  assert.match(collektSource, /data-collekt-region="standalone-panel"/);
  assert.match(collektSource, /#00d2ff/);
});

test("colleKT keeps shared session API and standalone launch behavior raw", () => {
  assert.match(collektHookSource, /api\.get<CollektSession>\("\/api\/collekt\/session"\)/);
  assert.match(collektHookSource, /new URL\("\/wtf", moduleUrl\)/);
  assert.match(collektHookSource, /url\.searchParams\.set\("wtfApi", origin\)/);
  assert.match(collektSource, /window\.open\(launchUrl, "_blank", "noopener,noreferrer"\)/);
  assert.doesNotMatch(collektHookSource, /usePresentationShell|presentationRouteHref/);
  assert.doesNotMatch(collektSource, /api\.get|api\.post|fetch\(/);
});
