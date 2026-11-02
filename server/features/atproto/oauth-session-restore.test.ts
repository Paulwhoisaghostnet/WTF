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
  assert.deepEqual(session.authMethod, { method: "none" });
  assert.equal(session.tokenSet.sub, row.did);
  assert.equal(session.tokenSet.iss, row.oauthIssuer);
  assert.equal(session.tokenSet.aud, row.pdsUrl);
  assert.equal(session.tokenSet.access_token, "access-token");
  assert.equal(session.tokenSet.refresh_token, "refresh-token");
  assert.equal(session.tokenSet.expires_at, expiresAt.toISOString());
});

test("legacy OAuth rows still restore from encrypted server storage after a page refresh", async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "atproto-oauth-restore-test-secret";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  process.env.ATPROTO_DEFAULT_PDS = "https://bsky.social";
  const { encryptOAuthSecret } = await import("../../auth/oauth-crypto");
  const { restoreSessionFromRow, atprotoAccountSessionSummary } = await import("./oauth");

  const row = {
    did: "did:plc:legacyrefresh",
    pdsUrl: null,
    oauthIssuer: null,
    oauthScopes: null,
    encryptedAccessToken: encryptOAuthSecret("access-token"),
    encryptedRefreshToken: encryptOAuthSecret("refresh-token"),
    encryptedDpopKey: encryptOAuthSecret(JSON.stringify({ kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" })),
    tokenExpiresAt: null,
  } as any;

  const session = restoreSessionFromRow(row);
  assert.ok(session);
  assert.deepEqual(session.authMethod, { method: "none" });
  assert.equal(session.tokenSet.sub, row.did);
  assert.equal(session.tokenSet.iss, "https://bsky.social");
  assert.equal(session.tokenSet.aud, "https://bsky.social");
  assert.equal(atprotoAccountSessionSummary(row).reconnectRequired, false);
});

test("accounts with deleted token pairs are surfaced as reconnect-required instead of raw SDK errors", async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  const { atprotoAccountSessionSummary, restoreSessionFromRow } = await import("./oauth");
  const row = {
    did: "did:plc:deletedtokens",
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    encryptedDpopKey: null,
  } as any;

  assert.equal(restoreSessionFromRow(row), undefined);
  assert.deepEqual(atprotoAccountSessionSummary(row), {
    status: "reconnect_required",
    reconnectRequired: true,
    reason: "missing_token_pair",
  });
});

test("Skywire chat OAuth opt-in persists as canonical account scope and capability", async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "atproto-oauth-restore-test-secret";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  const {
    accountHasAtprotoCapability,
    encryptedSessionFields,
    resolveAtprotoOAuthGrantState,
  } = await import("./oauth");

  const grants = resolveAtprotoOAuthGrantState({
    appName: "skywire",
    tokenScope: "atproto transition:generic",
    requestedScope: "atproto transition:generic transition:chat.bsky",
    chatRequested: true,
    fallbackScope: "atproto",
  });

  assert.equal(grants.requestedScope, "atproto transition:generic transition:chat.bsky");
  assert.equal(grants.grantedScope, "atproto transition:generic transition:chat.bsky");
  assert.equal(grants.chatEnabled, true);

  const fields = encryptedSessionFields(
    {
      dpopJwk: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
      authMethod: { method: "none" },
      tokenSet: {
        sub: "did:plc:chatupgrade",
        access_token: "access-token",
        refresh_token: "refresh-token",
        scope: "atproto transition:generic",
      },
    } as any,
    { oauthScopes: grants.grantedScope }
  );
  assert.equal(fields.oauthScopes, "atproto transition:generic transition:chat.bsky");
  assert.equal(
    accountHasAtprotoCapability(
      {
        oauthScopes: "atproto transition:generic",
        oauthChatEnabled: true,
      } as any,
      "chat"
    ),
    true
  );
});

test("OAuthSession wrapper objects cannot be persisted as encrypted token material", async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "atproto-oauth-restore-test-secret";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  const { encryptedSessionFields } = await import("./oauth");

  const sdkWrapperShape = {
    did: "did:plc:wrapper",
    sub: "did:plc:wrapper",
    getTokenInfo: async () => ({
      sub: "did:plc:wrapper",
      scope: "atproto transition:generic transition:chat.bsky",
      iss: "https://bsky.social",
      aud: "https://bsky.social",
    }),
    getTokenSet: async () => ({
      sub: "did:plc:wrapper",
      access_token: "access-token",
      refresh_token: "refresh-token",
    }),
  };

  assert.throws(
    () => encryptedSessionFields(sdkWrapperShape as any),
    /Skywire's AT Protocol session needs to be reconnected/
  );
});

test("Profile proof captures the OAuth SDK session without writing it to an existing DID row", async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "atproto-oauth-restore-test-secret";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  const {
    captureAtprotoOAuthCallbackSessions,
    saveAtprotoSdkSessionForDid,
    takePendingOAuthSessionForDid,
  } = await import("./oauth");
  const session = {
    dpopJwk: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
    authMethod: { method: "none" },
    tokenSet: {
      sub: "did:plc:proof",
      access_token: "new-identity-token",
      refresh_token: "new-identity-refresh-token",
      scope: "atproto",
    },
  } as any;

  const captured = await captureAtprotoOAuthCallbackSessions(async () => {
    await saveAtprotoSdkSessionForDid("did:plc:proof", session);
    return "verified";
  });
  assert.equal(captured.value, "verified");
  assert.equal(captured.sessions.get("did:plc:proof"), session);
  assert.equal(takePendingOAuthSessionForDid("did:plc:proof"), null);
});

test("Profile identity proof has a separate OAuth client grant from Skywire", async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  const { getAtprotoOAuthClient, getAtprotoProfileProofOAuthClient } = await import("./oauth");
  const skywire = await getAtprotoOAuthClient();
  const profile = await getAtprotoProfileProofOAuthClient();
  assert.notEqual(profile.clientMetadata.client_id, skywire.clientMetadata.client_id);
  assert.equal(profile.clientMetadata.scope, "atproto");
  assert.deepEqual(profile.clientMetadata.redirect_uris, skywire.clientMetadata.redirect_uris);
});

test("public Profile OAuth metadata advertises an identity-only client separate from Skywire", async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "atproto-oauth-restore-test-secret";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/wtf_test";
  const { default: express } = await import("express");
  const { default: atprotoRouter } = await import("../../routes/atproto");
  const app = express();
  app.use(atprotoRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const [skywireResponse, profileResponse] = await Promise.all([
      fetch(`${origin}/.well-known/oauth-client-metadata.json`),
      fetch(`${origin}/.well-known/oauth-client-metadata-profile.json`),
    ]);
    assert.equal(skywireResponse.status, 200);
    assert.equal(profileResponse.status, 200);
    const skywire = await skywireResponse.json() as { client_id: string; redirect_uris: string[] };
    const profile = await profileResponse.json() as { client_id: string; scope: string; redirect_uris: string[] };
    assert.equal(profile.scope, "atproto");
    assert.notEqual(profile.client_id, skywire.client_id);
    assert.deepEqual(profile.redirect_uris, skywire.redirect_uris);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});
