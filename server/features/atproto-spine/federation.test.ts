import test from "node:test";
import assert from "node:assert/strict";
import {
  federationConfig,
  shouldIndexCollection,
  requestCrawl,
  createInviteCode,
} from "./federation";

test("federationConfig parses relays + hostnames from env with defaults", () => {
  const cfg = federationConfig({ WTFOS_ATPROTO_NETWORK_DOMAIN: "wtfos.me" } as NodeJS.ProcessEnv);
  assert.deepEqual(cfg.crawlRelays, ["https://relay.wtfos.me"]);
  assert.deepEqual(cfg.pdsHostnames, ["pds.wtfos.me"]);
  assert.equal(cfg.acceptExternal, false);

  const custom = federationConfig({
    WTFOS_CRAWL_RELAYS: "https://relay.wtfos.me, https://bsky.network",
    WTFOS_FEDERATED_PDS_HOSTS: "pds.wtfos.me,social.wtfos.me",
    WTFOS_ACCEPT_EXTERNAL: "true",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(custom.crawlRelays, ["https://relay.wtfos.me", "https://bsky.network"]);
  assert.equal(custom.pdsHostnames.length, 2);
  assert.equal(custom.acceptExternal, true);
});

test("shouldIndexCollection always accepts our lexicons; external gated by config", () => {
  const closed = federationConfig({ WTFOS_ACCEPT_EXTERNAL: "false" } as NodeJS.ProcessEnv);
  assert.equal(shouldIndexCollection("app.wtfos.social.board.post", closed), true);
  assert.equal(shouldIndexCollection("app.bsky.feed.post", closed), false);

  const open = federationConfig({
    WTFOS_ACCEPT_EXTERNAL: "true",
    WTFOS_EXTERNAL_COLLECTION_ALLOWLIST: "app.bsky.",
  } as NodeJS.ProcessEnv);
  assert.equal(shouldIndexCollection("app.bsky.feed.post", open), true);
  assert.equal(shouldIndexCollection("com.example.thing", open), false);
});

test("requestCrawl POSTs hostname to the relay requestCrawl XRPC", async () => {
  let captured: { url: string; body: string } | null = null;
  const fakeFetch = (async (url: URL | string, init?: RequestInit) => {
    captured = { url: String(url), body: String(init?.body) };
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;
  const result = await requestCrawl({ relayUrl: "https://relay.wtfos.me", hostname: "pds.wtfos.me", fetchImpl: fakeFetch });
  assert.equal(result.ok, true);
  assert.ok(captured!.url.endsWith("/xrpc/com.atproto.sync.requestCrawl"));
  assert.match(captured!.body, /pds\.wtfos\.me/);
});

test("createInviteCode requires admin auth and returns the code", async () => {
  const fakeFetch = (async (_url: URL | string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>)?.authorization ?? "";
    assert.match(auth, /^Basic /);
    return { ok: true, status: 200, json: async () => ({ code: "wtfos-invite-123" }) } as Response;
  }) as unknown as typeof fetch;
  const result = await createInviteCode({
    pdsUrl: "https://pds.wtfos.me",
    adminPassword: "admin-secret",
    fetchImpl: fakeFetch,
  });
  assert.equal(result.code, "wtfos-invite-123");
});
