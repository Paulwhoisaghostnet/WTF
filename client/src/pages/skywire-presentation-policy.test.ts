import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skywireSource = readFileSync(new URL("./Skywire.tsx", import.meta.url), "utf8");
const skywireShellSource = readFileSync(
  new URL("../features/skywire/SkywireShell.tsx", import.meta.url),
  "utf8",
);

test("Skywire route exposes a presentation-host boundary for Gamma", () => {
  assert.match(skywireSource, /usePresentationShell/);
  assert.match(skywireSource, /data-skywire-surface="skywire-shell"/);
  assert.match(skywireSource, /data-skywire-presentation-host=\{presentation\.host\}/);
  assert.match(skywireSource, /data-skywire-region="header"/);
  assert.match(skywireSource, /data-skywire-region="content-body"/);
  assert.match(skywireSource, /data-skywire-region="status-badge"/);
});

test("Skywire Gamma chrome overrides custom panels without changing standalone styling", () => {
  assert.match(skywireSource, /data-skywire-presentation-host="gamma"/);
  assert.match(skywireSource, /background-image:\s*none\s*!important/);
  assert.match(skywireSource, /box-shadow:\s*none\s*!important/);
  assert.match(skywireSource, /border-radius:\s*6px\s*!important/);
  assert.match(skywireSource, /--sky-bg:\s*#070706/);
  assert.match(skywireSource, /--sky-cyan:\s*#00d2ff/);
  assert.match(skywireSource, /--sky-teal:\s*#d6ff3f/);
});

test("Skywire feature shell exposes rendered regions for Gamma proof", () => {
  assert.match(skywireShellSource, /data-skywire-region="sidebar"/);
  assert.match(skywireShellSource, /data-skywire-region="primary-nav"/);
  assert.match(skywireShellSource, /data-skywire-region="nav-button"/);
  assert.match(skywireShellSource, /data-skywire-active=\{sidebarTab === item\.id \? "true" : "false"\}/);
  assert.match(skywireShellSource, /data-skywire-region="content-pane"/);
  assert.match(skywireShellSource, /data-skywire-region="welcome-card"/);
  assert.match(skywireShellSource, /data-skywire-region="compose-box"/);
  assert.match(skywireShellSource, /data-skywire-region="capability-card"/);
});

test("Skywire keeps shared AT Protocol, wallet, Tezos, and route behavior", () => {
  assert.match(skywireSource, /api\.get\("\/api\/atproto\/me"\)/);
  assert.match(skywireSource, /api\.get\("\/api\/atproto\/registration\/options"\)/);
  assert.match(skywireSource, /api\.post\("\/api\/atproto\/handle\/claim"/);
  assert.match(skywireSource, /api\.get<SkywireLiveStatusResponse>\("\/api\/skywire\/live-status"\)/);
  assert.match(skywireSource, /api\.get\(`\/api\/skywire\/feed\?\$\{params\.toString\(\)\}`\)/);
  assert.match(skywireSource, /"\/api\/skywire\/post"/);
  assert.match(skywireSource, /api\.post\("\/api\/skywire\/signals"/);
  assert.match(skywireSource, /api\.get<SkywireTezosVaultResponse>\(\s*`\/api\/skywire\/tezos-vault\?limit=24&offset=\$\{encodeURIComponent/);
  assert.match(skywireSource, /api\.post\("\/api\/skywire\/events"/);
  assert.match(skywireSource, /purchaseRatRaceListing/);
  assert.match(skywireSource, /assertWalletLinkedToCurrentUser/);
  assert.match(skywireSource, /presentationRouteHref\("\/live"\)/);
  assert.doesNotMatch(skywireSource, /\/api\/gamma/);
});
