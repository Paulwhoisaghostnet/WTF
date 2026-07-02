import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const duesSource = readFileSync(new URL("./DuesManager.tsx", import.meta.url), "utf8");
const tezosIntelSource = readFileSync(new URL("./TezosIntel.tsx", import.meta.url), "utf8");
const tezosIntelChromeSource = readFileSync(
  new URL("../features/tezos-intel/IntelPanelChrome.tsx", import.meta.url),
  "utf8"
);
const creatorScoreSource = readFileSync(
  new URL("../features/tezos-intel/CreatorScorePanel.tsx", import.meta.url),
  "utf8"
);
const creatorCompareSource = readFileSync(
  new URL("../features/tezos-intel/CreatorComparePanel.tsx", import.meta.url),
  "utf8"
);
const marketPulseSource = readFileSync(
  new URL("../features/tezos-intel/MarketPulsePanel.tsx", import.meta.url),
  "utf8"
);
const publicProfileSource = readFileSync(new URL("./PublicProfile.tsx", import.meta.url), "utf8");

test("Club Dues route is presentation-host aware without changing dues or wallet behavior", () => {
  assert.match(duesSource, /usePresentationShell/);
  assert.match(duesSource, /presentationRouteHref/);
  assert.match(duesSource, /data-dues-surface="club-dues"/);
  assert.match(duesSource, /data-dues-presentation-host=\{presentation\.host\}/);
  assert.match(duesSource, /data-dues-presentation-host="gamma"/);
  for (const region of [
    "surface",
    "header",
    "payment-panel",
    "customization-panel",
    "registry-panel",
    "contract-card",
    "admin-panel",
    "status-line",
  ]) {
    assert.match(duesSource, new RegExp(`data-dues-region="${region}"`));
  }
  assert.match(duesSource, /api\.get<\{ contracts: DuesContract\[\] \}>\("\/api\/club-dues\/contracts"\)/);
  assert.match(duesSource, /api\.get<\{ memberships: Membership\[\] \}>\("\/api\/club-dues\/my"\)/);
  assert.match(duesSource, /api\.get<any>\("\/api\/admin\/club-dues"\)/);
  assert.match(duesSource, /api\.post<CompileResponse>\("\/api\/club-dues\/templates\/compile"/);
  assert.match(duesSource, /api\.post<\{ contract: DuesContract \}>\("\/api\/admin\/club-dues\/contracts"/);
  assert.match(duesSource, /api\.post\(`\/api\/admin\/club-dues\/contracts\/\$\{contractId\}\/deploy`/);
  assert.match(duesSource, /`\/api\/club-dues\/contracts\/\$\{selected\.slug\}\/payment-intents`/);
  assert.match(duesSource, /api\.post\("\/api\/club-dues\/payment-verify"/);
  assert.match(duesSource, /originateClubDuesContract/);
  assert.match(duesSource, /payClubMembership/);
  assert.doesNotMatch(duesSource, /\/api\/gamma/);
});

test("Tezos Intel route has Gamma chrome around shared market intelligence panels", () => {
  assert.match(tezosIntelSource, /usePresentationShell/);
  assert.match(tezosIntelSource, /data-tezos-intel-surface="market-intel"/);
  assert.match(tezosIntelSource, /data-tezos-intel-presentation-host=\{presentation\.host\}/);
  assert.match(tezosIntelSource, /data-tezos-intel-presentation-host="gamma"/);
  assert.match(tezosIntelSource, /data-tezos-intel-region="surface"/);
  assert.match(tezosIntelSource, /data-tezos-intel-region="grid"/);
  assert.match(tezosIntelChromeSource, /tezosIntelRegionAttrs\("panel"\)/);
  assert.match(tezosIntelChromeSource, /tezosIntelRegionAttrs\("metric-grid"\)/);
  assert.match(tezosIntelChromeSource, /tezosIntelRegionAttrs\("input"\)/);
  assert.match(tezosIntelChromeSource, /tezosIntelRegionAttrs\("textarea"\)/);
  assert.match(creatorScoreSource, /data-tezos-intel-panel="creator-score"/);
  assert.match(creatorScoreSource, /data-tezos-intel-control="creator-input"/);
  assert.match(creatorScoreSource, /data-tezos-intel-control="analyze-button"/);
  assert.match(creatorCompareSource, /data-tezos-intel-panel="creator-compare"/);
  assert.match(creatorCompareSource, /data-tezos-intel-control="compare-input"/);
  assert.match(creatorCompareSource, /data-tezos-intel-control="compare-button"/);
  assert.match(marketPulseSource, /data-tezos-intel-panel="market-pulse"/);
  assert.match(marketPulseSource, /data-tezos-intel-panel="sources"/);
  assert.match(tezosIntelSource, /background-image:\s*none\s*!important/);
  assert.match(tezosIntelSource, /box-shadow:\s*none\s*!important/);
  assert.match(tezosIntelSource, /border-radius:\s*6px\s*!important/);
  assert.match(tezosIntelSource, /#070706/);
  assert.match(tezosIntelSource, /#00d2ff/);
  assert.match(tezosIntelSource, /#d6ff3f/);
});

test("Tezos Intel keeps shared API contracts raw", () => {
  const apiSource = readFileSync(new URL("../features/tezos-intel/api.ts", import.meta.url), "utf8");
  assert.match(apiSource, /api\.get<TezosIntelSourcesResponse>\("\/api\/tezos-intel\/sources"\)/);
  assert.match(apiSource, /`\/api\/tezos-intel\/creator\/\$\{encodeURIComponent\(address\)\}`/);
  assert.match(apiSource, /`\/api\/tezos-intel\/compare\?\$\{query\}`/);
  assert.match(apiSource, /api\.get<MarketPulse>\(`\/api\/tezos-intel\/market-pulse\?\$\{query\}`\)/);
  assert.doesNotMatch(apiSource, /\/api\/gamma/);
});

test("Public profile route exposes Gamma social-discovery regions over shared profile APIs", () => {
  assert.match(publicProfileSource, /usePresentationShell/);
  assert.match(publicProfileSource, /data-public-profile-surface="public-profile"/);
  assert.match(publicProfileSource, /data-public-profile-presentation-host=\{presentation\.host\}/);
  assert.match(publicProfileSource, /data-public-profile-presentation-host="gamma"/);
  for (const region of [
    "surface",
    "tabs",
    "tab-body",
    "about-panel",
    "social-panel",
    "wallet-panel",
    "trade-board-grid",
    "token-card",
    "listings-table",
    "activity-table",
    "dm-panel",
    "dm-composer",
  ]) {
    assert.match(publicProfileSource, new RegExp(`data-public-profile-region="${region}"`));
  }
  assert.match(publicProfileSource, /api\.get<PublicUser>\(`\/api\/users\/\$\{username\}`\)/);
  assert.match(publicProfileSource, /api\.get<TradeBoardToken\[\]>\(`\/api\/users\/\$\{username\}\/trade-board`\)/);
  assert.match(publicProfileSource, /api\.get<Listing\[\]>\(`\/api\/users\/\$\{username\}\/listings`\)/);
  assert.match(publicProfileSource, /api\.get<XpEvent\[\]>\(`\/api\/users\/\$\{username\}\/activity`\)/);
  assert.match(publicProfileSource, /api\.get<\{ conversationId: number \| null; messages: DmMessage\[\] \}>\(`\/api\/users\/\$\{username\}\/dm`\)/);
  assert.match(publicProfileSource, /api\.post<\{ id: number \}>\("\/api\/messages\/dms"/);
  assert.match(publicProfileSource, /api\.post\(`\/api\/messages\/dms\/\$\{dmData\.conversationId\}\/messages`/);
  assert.match(publicProfileSource, /api\.post\(`\/api\/messages\/dms\/\$\{created\.id\}\/messages`/);
  assert.doesNotMatch(publicProfileSource, /\/api\/gamma/);
});
