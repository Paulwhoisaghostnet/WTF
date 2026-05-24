import test from "node:test";
import assert from "node:assert/strict";

test("restored OAuth sessions keep SDK-required token subject and issuer fields", async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "atproto-oauth-restore-test-secret";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  const { encryptOAuthSecret } = await import("../../auth/oauth-crypto");
  const { restoreSessionFromRow } = await import("./oauth");

  const expiresAt = new Date("2026-05-24T22:00:00.000Z");
  const row = {
    did: "did:plc:skywiretest",
    pdsUrl: "https://bsky.social",
    oauthIssuer: "https://bsky.social",
    oauthScopes: "atproto transition:generic",
    encryptedAccessToken: encryptOAuthSecret("access-token"),
    encryptedRefreshToken: encryptOAuthSecret("refresh-token"),
    encryptedDpopKey: encryptOAuthSecret(JSON.stringify({ kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" })),
    tokenExpiresAt: expiresAt,
  } as any;

  const session = restoreSessionFromRow(row);
  assert.ok(session);
  assert.equal(session.tokenSet.sub, row.did);
  assert.equal(session.tokenSet.iss, row.oauthIssuer);
  assert.equal(session.tokenSet.aud, row.pdsUrl);
  assert.equal(session.tokenSet.access_token, "access-token");
  assert.equal(session.tokenSet.refresh_token, "refresh-token");
  assert.equal(session.tokenSet.expires_at, expiresAt.toISOString());
});
