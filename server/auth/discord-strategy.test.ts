import assert from "node:assert/strict";
import test from "node:test";
import { createDiscordStrategy } from "./passport";

test("Discord strategy issues an identity-only, consented, state-bound request", () => {
  const old = {
    id: process.env.DISCORD_CLIENT_ID,
    secret: process.env.DISCORD_CLIENT_SECRET,
    site: process.env.PUBLIC_SITE_URL,
  };
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DISCORD_CLIENT_SECRET = "test-secret";
  process.env.PUBLIC_SITE_URL = "https://wtfos.app";
  try {
    const strategy = createDiscordStrategy() as any;
    const req = { query: {}, session: {} };
    let redirect = "";
    strategy.redirect = (url: string) => { redirect = url; };
    strategy.error = (error: Error) => { throw error; };
    strategy.authenticate(req);

    const authorize = new URL(redirect);
    assert.equal(authorize.origin, "https://discord.com");
    assert.equal(authorize.searchParams.get("scope"), "identify");
    assert.equal(authorize.searchParams.get("prompt"), "consent");
    assert.equal(authorize.searchParams.get("redirect_uri"), "https://wtfos.app/api/auth/discord/callback");
    assert.ok(authorize.searchParams.get("state"));

    let tokenExchanges = 0;
    strategy._oauth2.getOAuthAccessToken = () => { tokenExchanges++; };
    let failed = false;
    strategy.fail = () => { failed = true; };
    strategy.authenticate({ query: { code: "code", state: "wrong-state" }, session: req.session });
    assert.equal(failed, true);
    assert.equal(tokenExchanges, 0);
  } finally {
    if (old.id === undefined) delete process.env.DISCORD_CLIENT_ID;
    else process.env.DISCORD_CLIENT_ID = old.id;
    if (old.secret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
    else process.env.DISCORD_CLIENT_SECRET = old.secret;
    if (old.site === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = old.site;
  }
});
