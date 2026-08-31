import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dedRoomsSource = readFileSync(
  new URL("../features/dedrooms/DedRoomsApp.tsx", import.meta.url),
  "utf8"
);
const recaptureSource = readFileSync(new URL("./WtfRecapture.tsx", import.meta.url), "utf8");
const mintPortalSource = readFileSync(new URL("./MintPortal.tsx", import.meta.url), "utf8");
const generativeSource = readFileSync(
  new URL("../features/mint-portal/GenerativeArtPanel.tsx", import.meta.url),
  "utf8"
);

test("gameshow native leftovers expose Gamma-aware owner boundaries", () => {
  for (const source of [dedRoomsSource, recaptureSource, mintPortalSource]) {
    assert.match(source, /usePresentationShell/);
    assert.doesNotMatch(source, /\/api\/gamma/);
  }

  assert.match(dedRoomsSource, /data-dedrooms-surface="mud"/);
  assert.match(dedRoomsSource, /data-dedrooms-presentation-host=\{presentation\.host\}/);
  assert.match(dedRoomsSource, /\[data-dedrooms-presentation-host="gamma"\]/);
  for (const region of ["surface", "transcript", "status-rail", "prompt-bar", "command-input", "admin-panel"]) {
    assert.match(dedRoomsSource, new RegExp(`data-dedrooms-region="${region}"`));
  }

  assert.match(recaptureSource, /data-wtf-recapture-surface="recapture"/);
  assert.match(recaptureSource, /data-wtf-recapture-presentation-host=\{presentation\.host\}/);
  assert.match(recaptureSource, /\[data-wtf-recapture-presentation-host="gamma"\]/);
  for (const region of ["surface", "tabs", "payment-boundary", "leader-row", "buyback-window", "auction-card", "metrics-grid"]) {
    assert.match(recaptureSource, new RegExp(`data-wtf-recapture-region="${region}"`));
  }

  assert.match(mintPortalSource, /data-mint-portal-surface="mint-portal"/);
  assert.match(mintPortalSource, /data-mint-portal-presentation-host=\{presentation\.host\}/);
  assert.match(mintPortalSource, /\[data-mint-portal-presentation-host="gamma"\]/);
  for (const region of ["surface", "tabs", "challenges-tab", "direct-mint", "challenge-card", "generative-tab"]) {
    assert.match(mintPortalSource, new RegExp(`data-mint-portal-region="${region}"`));
  }

  assert.match(generativeSource, /data-generative-art-surface="mint-portal-generative"/);
  for (const region of ["surface", "editor-panel", "editor", "actions", "preview-panel", "guide"]) {
    assert.match(generativeSource, new RegExp(`data-generative-art-region="${region}"`));
  }
});

test("gameshow native Gamma chrome follows the current visual budget", () => {
  for (const [label, source] of [
    ["DedRooms", dedRoomsSource],
    ["WTF Recapture", recaptureSource],
    ["Mint Portal", mintPortalSource],
  ] as const) {
    assert.match(source, /background:\s*#070706/, label);
    assert.match(source, /color:\s*#f2ead9/, label);
    assert.match(source, /#00d2ff/, label);
    assert.match(source, /#d6ff3f/, label);
    assert.match(source, /background-image:\s*none/, label);
    assert.match(source, /box-shadow:\s*none/, label);
    assert.match(source, /border-radius:\s*6px/, label);
  }
});

test("gameshow native routes keep shared behavior surfaces raw", () => {
  assert.match(dedRoomsSource, /\/api\/dedrooms\/state/);
  assert.match(dedRoomsSource, /\/api\/dedrooms\/command/);
  assert.match(dedRoomsSource, /\/api\/dedrooms\/admin\/content/);
  assert.match(dedRoomsSource, /\/api\/dedrooms\/admin\/campaign/);
  assert.match(dedRoomsSource, /\/ws\/dedrooms/);

  assert.match(recaptureSource, /\/api\/wtf-recapture\/leaderboard\?limit=100/);
  assert.match(recaptureSource, /\/api\/buyback-windows\/active/);
  assert.match(recaptureSource, /\/api\/wtf-auctions/);
  assert.match(recaptureSource, /\/api\/wtf-recapture\/mine/);
  assert.match(recaptureSource, /\/api\/buyback-windows\/\$\{w\.id\}\/swap-intent/);
  assert.match(recaptureSource, /\/api\/wtf-auctions\/\$\{auction\.id\}\/bids/);
  assert.match(recaptureSource, /Manual wallet step — verified on-chain\./);
  assert.match(recaptureSource, /credits the action only after TzKT reports an applied operation/);
  assert.match(recaptureSource, /Auction bids are off-chain commitments/);
  assert.match(recaptureSource, /Verify completed wallet swap/);
  assert.match(recaptureSource, /Record off-chain bid/);

  assert.match(mintPortalSource, /\/api\/mint-portal\/challenges/);
  assert.match(mintPortalSource, /\/api\/mint-portal\/contracts\?network=/);
  assert.match(mintPortalSource, /mintOpenEditionFromWtf/);
  assert.match(mintPortalSource, /\/api\/mint-portal\/record-mint/);
  assert.match(mintPortalSource, /\/api\/mint-portal\/match/);
});
