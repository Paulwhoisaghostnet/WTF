import assert from "node:assert/strict";
import test from "node:test";
import {
  buildXOAuth1Authorization,
  exchangeXProofToken,
  normalizeXProofHandle,
  parseXProofIdentity,
  requestXProofToken,
  shouldUseXIdentityProof,
  xProofAccountUpdate,
  xProofAuthorizeUrl,
  XProofProviderError,
  X_PROOF_ACCESS_TOKEN_URL,
  X_PROOF_REQUEST_TOKEN_URL,
} from "./twitter-proof";

test("OAuth 1.0a signer matches the RFC 5849 form-body test vector", () => {
  const header = buildXOAuth1Authorization({
    method: "POST",
    url: "http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b",
    body: new URLSearchParams("c2&a3=2+q"),
    consumerKey: "9djdj82h48djs9d2",
    consumerSecret: "j49sk3j29djd",
    token: "kkk9d7dh3k39sjv7",
    tokenSecret: "dh893hdasih9",
    nonce: "7d8f3e4a",
    timestamp: "137131201",
    version: null,
  });
  assert.match(header, /oauth_signature="r6%2FTJjbCOr97%2F%2BUU0NsvSne7s5g%3D"/);
});

test("X proof authorize URL forces a fresh login and pre-fills the intended account", () => {
  assert.equal(normalizeXProofHandle("https://x.com/@Example_123/status/9"), "example_123");
  assert.equal(normalizeXProofHandle("bad handle"), null);
  assert.equal(normalizeXProofHandle(undefined), null);
  const url = new URL(xProofAuthorizeUrl("request-token", "example_123"));
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("oauth_token"), "request-token");
  assert.equal(url.searchParams.get("force_login"), "true");
  assert.equal(url.searchParams.get("screen_name"), "example_123");
});

test("cached Profile OAuth 2.0 requests use identity proof while W keeps its API-action flow", () => {
  assert.equal(shouldUseXIdentityProof("profile"), true);
  assert.equal(shouldUseXIdentityProof(undefined), true);
  assert.equal(shouldUseXIdentityProof("w"), false);
});

test("request-token stage signs the canonical callback and requests read access", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    observedUrl = String(url);
    observedInit = init;
    return new Response("oauth_token=request-token&oauth_token_secret=request-secret&oauth_callback_confirmed=true");
  }) as typeof fetch;
  const result = await requestXProofToken(
    { consumerKey: "consumer", consumerSecret: "secret" },
    "https://wtfos.app/api/auth/twitter-proof/callback",
    fetcher
  );
  assert.deepEqual(result, { token: "request-token", secret: "request-secret" });
  assert.equal(observedUrl, X_PROOF_REQUEST_TOKEN_URL);
  assert.equal(String(observedInit?.body), "x_auth_access_type=read");
  assert.match(String((observedInit?.headers as Record<string, string>)?.Authorization), /oauth_callback="https%3A%2F%2Fwtfos\.app%2Fapi%2Fauth%2Ftwitter-proof%2Fcallback"/);
});

test("exchange proves identity from X's token response without a metered user lookup", async () => {
  const called: string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    called.push(String(url));
    assert.equal(String(init?.body), "oauth_verifier=verifier");
    assert.match(String((init?.headers as Record<string, string>)?.Authorization), /oauth_token="request-token"/);
    return new Response("oauth_token=access&oauth_token_secret=secret&user_id=1234567890123456789&screen_name=Actual_User");
  }) as typeof fetch;
  const identity = await exchangeXProofToken(
    { consumerKey: "consumer", consumerSecret: "secret" },
    { token: "request-token", secret: "request-secret" },
    "verifier",
    fetcher
  );
  assert.deepEqual(identity, { id: "1234567890123456789", handle: "actual_user" });
  assert.deepEqual(called, [X_PROOF_ACCESS_TOKEN_URL]);
});

test("a token response with no provider identity fails closed", async () => {
  assert.equal(parseXProofIdentity("oauth_token=access&oauth_token_secret=secret"), null);
  const fetcher = (async () => new Response("oauth_token=access&oauth_token_secret=secret")) as typeof fetch;
  assert.equal(
    await exchangeXProofToken(
      { consumerKey: "consumer", consumerSecret: "secret" },
      { token: "request-token", secret: "request-secret" },
      "verifier",
      fetcher
    ),
    null
  );
});

test("provider failures cannot produce a linked identity", async () => {
  const fetcher = (async () => new Response("error=bad", { status: 403 })) as typeof fetch;
  await assert.rejects(
    requestXProofToken({ consumerKey: "consumer", consumerSecret: "secret" }, "https://wtfos.app/callback", fetcher),
    (err: unknown) => err instanceof XProofProviderError && err.stage === "request" && err.status === 403
  );
});

test("relinking clears old account API grants; proving the same account preserves them", () => {
  const replacement = xProofAccountUpdate(
    { twitterId: "old-id" },
    { id: "new-id", handle: "new_handle" }
  );
  assert.equal(replacement.twitterVerified, true);
  assert.equal(replacement.twitterOauthToken, null);
  assert.equal(replacement.twitterOauth2AccessToken, null);
  assert.equal(replacement.twitterOauth2RefreshToken, null);
  const same = xProofAccountUpdate(
    { twitterId: "same-id" },
    { id: "same-id", handle: "renamed_handle" }
  );
  assert.equal("twitterOauth2AccessToken" in same, false);
});
