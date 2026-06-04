import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalDomainRedirectTarget,
  canonicalizePlatformOrigin,
  canonicalizePlatformUrl,
  isLegacyPlatformHost,
  resolveCanonicalPublicOrigin,
} from "./canonical-domain";

test("legacy WTF Gameshow platform hosts canonicalize to wtfos.app", () => {
  assert.equal(canonicalizePlatformOrigin("https://wtfgameshow.app"), "https://wtfos.app");
  assert.equal(canonicalizePlatformOrigin("https://www.wtfgameshow.app"), "https://wtfos.app");
  assert.equal(canonicalizePlatformOrigin("https://new.wtfgameshow.app"), "https://wtfos.app");
  assert.equal(canonicalizePlatformOrigin("https://www.wtfos.app"), "https://wtfos.app");
  assert.equal(canonicalizePlatformOrigin("http://127.0.0.1:4173"), "http://127.0.0.1:4173");
});

test("legacy Skywire OAuth callback URLs preserve path and query on canonical host", () => {
  assert.equal(
    canonicalizePlatformUrl("https://wtfgameshow.app/api/atproto/oauth/callback?state=abc&code=def"),
    "https://wtfos.app/api/atproto/oauth/callback?state=abc&code=def"
  );
  assert.equal(
    canonicalizePlatformUrl("https://www.wtfgameshow.app/.well-known/oauth-client-metadata.json"),
    "https://wtfos.app/.well-known/oauth-client-metadata.json"
  );
});

test("ATProto public origin resolves legacy production env to canonical wtfos", () => {
  assert.equal(
    resolveCanonicalPublicOrigin({
      NODE_ENV: "production",
      ATPROTO_PUBLIC_BASE_URL: "https://wtfgameshow.app",
      PUBLIC_SITE_URL: "https://wtfgameshow.app",
    }),
    "https://wtfos.app"
  );
  assert.equal(
    resolveCanonicalPublicOrigin({
      NODE_ENV: "production",
      ATPROTO_PUBLIC_BASE_URL: "https://www.wtfgameshow.app/skywire",
    }),
    "https://wtfos.app"
  );
});

test("ATProto public origin keeps explicit non-WTF preview origins and local fallback", () => {
  assert.equal(
    resolveCanonicalPublicOrigin({
      NODE_ENV: "production",
      ATPROTO_PUBLIC_BASE_URL: "https://preview.example.test",
    }),
    "https://preview.example.test"
  );
  assert.equal(
    resolveCanonicalPublicOrigin({ NODE_ENV: "development" }, "http://localhost:4173"),
    "http://localhost:4173"
  );
});

test("legacy platform GET/HEAD requests redirect to canonical host with path and query", () => {
  assert.equal(isLegacyPlatformHost("wtfgameshow.app"), true);
  assert.equal(
    canonicalDomainRedirectTarget({
      method: "GET",
      originalUrl: "/skywire?tab=account",
      url: "/skywire?tab=account",
      headers: { host: "wtfgameshow.app" },
    } as any),
    "https://wtfos.app/skywire?tab=account"
  );
  assert.equal(
    canonicalDomainRedirectTarget({
      method: "HEAD",
      originalUrl: "/api/atproto/oauth/callback?state=abc",
      url: "/api/atproto/oauth/callback?state=abc",
      headers: { "x-forwarded-host": "www.wtfgameshow.app" },
    } as any),
    "https://wtfos.app/api/atproto/oauth/callback?state=abc"
  );
});

test("canonical redirect ignores mutating requests and purpose-built subdomains", () => {
  assert.equal(
    canonicalDomainRedirectTarget({
      method: "POST",
      originalUrl: "/api/auth/login",
      url: "/api/auth/login",
      headers: { host: "wtfgameshow.app" },
    } as any),
    null
  );
  assert.equal(
    canonicalDomainRedirectTarget({
      method: "GET",
      originalUrl: "/dues",
      url: "/dues",
      headers: { host: "dues.wtfgameshow.app" },
    } as any),
    null
  );
});
