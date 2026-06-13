import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildUserSiteManifest,
  canIssueWtfDidForRoles,
  classifyUserSiteHost,
  digestUserSiteManifest,
  isBlockedUserSitePath,
  normalizeUserSiteSlug,
  pageSlugForRequestPath,
  validateUserSiteLabel,
} from "./policy";

test("username labels are derived strictly from valid DNS usernames", () => {
  assert.deepEqual(validateUserSiteLabel("Ernie", "wtfos.me"), {
    ok: true,
    label: "ernie",
    host: "ernie.wtfos.me",
  });
  assert.equal(validateUserSiteLabel("api", "wtfos.me").ok, false);
  assert.equal(validateUserSiteLabel("bad.name", "wtfos.me").ok, false);
  assert.equal(validateUserSiteLabel("-bad", "wtfos.me").ok, false);
});

test("user site host classification only accepts unreserved single-label hosts", () => {
  assert.deepEqual(classifyUserSiteHost("ernie.wtfos.me", "wtfos.me"), {
    isUserSiteHost: true,
    host: "ernie.wtfos.me",
    label: "ernie",
  });
  assert.equal(classifyUserSiteHost("a.b.wtfos.me", "wtfos.me").isUserSiteHost, false);
  assert.equal(classifyUserSiteHost("pds.wtfos.me", "wtfos.me").isUserSiteHost, false);
  assert.equal(classifyUserSiteHost("wtfos.app", "wtfos.me").isUserSiteHost, false);
});

test("privileged paths are blocked on user hosts while AT DID path stays public", () => {
  assert.equal(isBlockedUserSitePath("/api/health"), true);
  assert.equal(isBlockedUserSitePath("/auth/login"), true);
  assert.equal(isBlockedUserSitePath("/xrpc/com.atproto.repo.putRecord"), true);
  assert.equal(isBlockedUserSitePath("/sw.js"), true);
  assert.equal(isBlockedUserSitePath("/.well-known/atproto-did"), false);
  assert.equal(isBlockedUserSitePath("/.well-known/wtfos-pins"), false);
  assert.equal(isBlockedUserSitePath("/project"), false);
});

test("site slugs are bounded to root plus named pages", () => {
  assert.equal(pageSlugForRequestPath("/"), "home");
  assert.equal(pageSlugForRequestPath("/Project-One"), "project-one");
  assert.equal(pageSlugForRequestPath("/nested/page"), null);
  assert.equal(normalizeUserSiteSlug("api"), null);
  assert.equal(normalizeUserSiteSlug("home"), "home");
});

test("WTF DID issuance roles are explicit", () => {
  assert.equal(canIssueWtfDidForRoles(["witness", "contestant"]), false);
  assert.equal(canIssueWtfDidForRoles(["trusted_creator"]), true);
  assert.equal(canIssueWtfDidForRoles(["resident_wizard"]), true);
});

test("manifest digest changes with page and DID target snapshots", () => {
  const base = buildUserSiteManifest({
    host: "ernie.wtfos.me",
    url: "https://ernie.wtfos.me/",
    didTarget: {
      did: "did:plc:ernie",
      source: "bsky",
      handle: "ernie.bsky.social",
      pdsUrl: "https://bsky.social",
    },
    pages: [{ slug: "home", title: "Home", html: "<h1>Ernie</h1>" }],
    assetMediaIds: [1],
    versionNumber: 1,
    publishedAt: "2026-06-10T12:00:00.000Z",
  });
  const changed = buildUserSiteManifest({
    host: "ernie.wtfos.me",
    url: "https://ernie.wtfos.me/",
    didTarget: {
      did: "did:plc:ernie",
      source: "bsky",
      handle: "ernie.bsky.social",
      pdsUrl: "https://bsky.social",
    },
    pages: [{ slug: "home", title: "Home", html: "<h1>New</h1>" }],
    assetMediaIds: [1],
    versionNumber: 1,
    publishedAt: "2026-06-10T12:00:00.000Z",
  });
  assert.notEqual(digestUserSiteManifest(base), digestUserSiteManifest(changed));
});
