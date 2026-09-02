import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileSource = readFileSync(new URL("./Profile.tsx", import.meta.url), "utf8");

test("Profile account shell is presentation-host aware", () => {
  assert.match(profileSource, /usePresentationShell/);
  assert.match(profileSource, /data-profile-surface="account-home"/);
  assert.match(profileSource, /data-profile-presentation-host=\{presentation\.host\}/);
  assert.match(profileSource, /data-profile-section="account"/);
  assert.match(profileSource, /data-profile-section="social"/);
  assert.match(profileSource, /data-profile-section="linked-wallets"/);
  assert.match(profileSource, /data-profile-section="owned-tokens"/);
});

test("Profile Gamma chrome scopes identity, wallet, and PFP modal regions", () => {
  assert.match(profileSource, /data-profile-presentation-host="gamma"/);
  assert.match(profileSource, /profileRegion\("avatar-button"\)/);
  assert.match(profileSource, /profileRegion\("avatar-upload"\)/);
  assert.match(profileSource, /profileRegion\("social-row"\)/);
  assert.match(profileSource, /data-profile-region="wallet-table"/);
  assert.match(profileSource, /ProfileModalWindow/);
  assert.match(profileSource, /profileRegion\("modal-window"\)/);
  assert.match(profileSource, /profileRegion\("pfp-grid"\)/);
  assert.match(profileSource, /profileRegion\("pfp-candidate"\)/);
  assert.match(profileSource, /data-profile-region="editor-toolbar"/);
  assert.match(profileSource, /profileRegion\("editor-canvas"\)/);
  assert.match(profileSource, /background-image:\s*none/);
  assert.match(profileSource, /box-shadow:\s*none/);
  assert.match(profileSource, /border-radius:\s*6px/);
});

test("Profile keeps shared account, wallet, avatar, OAuth, and Skywire behavior", () => {
  assert.match(profileSource, /queryKey:\s*\["wallets"\]/);
  assert.match(profileSource, /api\.get<WalletWithCount\[\]>\("\/api\/wallets"\)/);
  assert.match(profileSource, /queryKey:\s*\["profile-social"\]/);
  assert.match(profileSource, /api\.get<SocialProfile>\("\/api\/profile\/social"\)/);
  assert.match(profileSource, /queryKey:\s*\["auth",\s*"social-config"\]/);
  assert.match(profileSource, /api\.get<SocialOAuthConfig>\("\/api\/auth\/social\/config"\)/);
  assert.match(profileSource, /api\.put\("\/api\/profile\/account"/);
  assert.match(profileSource, /api\.post<\{ ok: true; hasPassword: boolean \}>\(\s*"\/api\/auth\/change-password"/);
  assert.match(profileSource, /api\.put\("\/api\/profile\/social"/);
  assert.match(profileSource, /api\.delete<SocialProfile>\(`\/api\/profile\/social\/\$\{provider\}`\)/);
  assert.match(profileSource, /api\.post<\{ ok: true \}>\("\/api\/atproto\/unlink"/);
  assert.match(profileSource, /fetch\("\/api\/media\/upload"/);
  assert.match(profileSource, /api\.put\("\/api\/profile\/avatar-media"/);
  assert.match(profileSource, /canvasRef\.current\.toBlob/);
  assert.match(profileSource, /tokenContract: data\.tokenContract/);
  assert.doesNotMatch(profileSource, /toDataURL\("image\/png"\)/);
  assert.match(profileSource, /api\.delete\("\/api\/profile\/pfp"\)/);
  assert.match(profileSource, /\/api\/profile\/pfp-candidates\?\$\{pfpQueryParams\}/);
  assert.match(profileSource, /presentationRouteHref\("\/skywire"\)/);
  assert.match(profileSource, /oauthStartUrl\(`\/api\/auth\/twitter-oauth2\?\$\{params\.toString\(\)\}`\)/);
  assert.match(profileSource, /oauthStartUrl\("\/api\/auth\/discord"\)/);
  assert.doesNotMatch(profileSource, /\/api\/gamma/);
});
