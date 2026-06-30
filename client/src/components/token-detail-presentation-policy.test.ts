import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sharedTokenCard = readFileSync("client/src/components/TokenCard.tsx", "utf8");
const ownedTokensGallery = readFileSync("client/src/components/OwnedTokensGallery.tsx", "utf8");
const myVideos = readFileSync("client/src/pages/MyVideos.tsx", "utf8");
const skywire = readFileSync("client/src/pages/Skywire.tsx", "utf8");

test("shared token detail modal is presentation-host aware", () => {
  assert.match(sharedTokenCard, /usePresentationShell/);
  assert.match(sharedTokenCard, /data-token-detail-modal="true"/);
  assert.match(sharedTokenCard, /data-token-detail-presentation-host=\{presentation\.host\}/);
  assert.match(sharedTokenCard, /aria-modal="true"/);
  assert.match(sharedTokenCard, /aria-label=\{`Token details: \$\{displayName\}`\}/);
  assert.match(sharedTokenCard, /\[data-token-detail-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(sharedTokenCard, /\[data-token-detail-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(sharedTokenCard, /\[data-token-detail-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
});

test("legacy owned-token detail modal is also scoped to Gamma presentation", () => {
  assert.match(ownedTokensGallery, /usePresentationShell/);
  assert.match(ownedTokensGallery, /data-token-detail-modal="true"/);
  assert.match(ownedTokensGallery, /data-token-detail-presentation-host=\{presentation\.host\}/);
  assert.match(ownedTokensGallery, /aria-modal="true"/);
  assert.match(ownedTokensGallery, /aria-label=\{`Token details: \$\{displayName\}`\}/);
  assert.match(ownedTokensGallery, /\[data-token-detail-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(ownedTokensGallery, /\[data-token-detail-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(ownedTokensGallery, /\[data-token-detail-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
});

test("Skywire app pipeline handoff keeps same-tab app routes inside the active presentation", () => {
  assert.match(skywire, /window\.open\(presentationRouteHref\(pipeline\.appRoute\), "_self"\)/);
});

test("My Videos delete cascade dialog is scoped to Gamma presentation", () => {
  assert.match(myVideos, /usePresentationShell/);
  assert.match(myVideos, /data-media-delete-modal="true"/);
  assert.match(myVideos, /data-media-delete-presentation-host=\{presentation\.host\}/);
  assert.match(myVideos, /aria-modal="true"/);
  assert.match(myVideos, /aria-label=\{`Delete video: \$\{item\.title\}`\}/);
  assert.match(myVideos, /\[data-media-delete-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(myVideos, /\[data-media-delete-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
});
