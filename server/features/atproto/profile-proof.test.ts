import test from "node:test";
import assert from "node:assert/strict";
import {
  AT_PROTO_PROFILE_SCOPE,
  atprotoProofProfileData,
  profileProofIdentityError,
  profileProofLinkChanged,
  profileProofStartTarget,
  isIdentityOnlyAtprotoGrant,
  shouldPreserveAtprotoGrantOnProfileProof,
} from "./profile-proof";

test("Profile AT proof requests identity only", () => {
  assert.equal(AT_PROTO_PROFILE_SCOPE, "atproto");
  assert.equal(isIdentityOnlyAtprotoGrant("atproto"), true);
  assert.equal(isIdentityOnlyAtprotoGrant(""), false);
  assert.equal(isIdentityOnlyAtprotoGrant("atproto transition:generic"), false);
});

test("Profile proof binds the authorized DID to the requested actor", () => {
  const base = {
    requestedActor: "artist.bsky.social",
    requestedDid: "did:plc:artist",
    verifiedDid: "did:plc:artist",
    verifiedHandle: "artist.example",
    linkedOwnerUserId: null,
    userId: 12,
  };
  assert.equal(profileProofIdentityError(base), null);
  assert.equal(profileProofIdentityError({ ...base, verifiedDid: "did:plc:other" }), "atproto_account_mismatch");
  assert.equal(profileProofIdentityError({ ...base, requestedDid: null }), "atproto_account_mismatch");
  assert.equal(
    profileProofIdentityError({ ...base, requestedActor: "did:plc:artist", requestedDid: null }),
    null,
  );
});

test("Blank AT proof uses a provider entryway and locks existing DID without a login hint", () => {
  assert.deepEqual(profileProofStartTarget({ rawActor: "", linkedAccount: null, defaultPds: "https://bsky.social" }), {
    oauthInput: "https://bsky.social",
    requestedActor: "",
    requestedDid: null,
  });
  assert.deepEqual(profileProofStartTarget({
    rawActor: "  ",
    linkedAccount: { did: "did:plc:current", pdsUrl: "https://custom-pds.example" },
    defaultPds: "https://bsky.social",
  }), {
    oauthInput: "https://custom-pds.example",
    requestedActor: "",
    requestedDid: "did:plc:current",
  });
  assert.deepEqual(profileProofStartTarget({
    rawActor: "new.bsky.social",
    linkedAccount: { did: "did:plc:current", pdsUrl: "https://custom-pds.example" },
  }), {
    oauthInput: "new.bsky.social",
    requestedActor: "new.bsky.social",
    requestedDid: null,
  });
  assert.deepEqual(profileProofStartTarget({
    rawActor: "",
    linkedAccount: { did: "did:plc:legacy", pdsUrl: null, oauthIssuer: "https://legacy-pds.example" },
  }), {
    oauthInput: "https://legacy-pds.example",
    requestedActor: "",
    requestedDid: "did:plc:legacy",
  });
});

test("Generic first link accepts the provider-authenticated DID; blank reverify rejects another DID", () => {
  const base = {
    requestedActor: "",
    verifiedDid: "did:plc:chosen",
    verifiedHandle: "chosen.bsky.social",
    linkedOwnerUserId: null,
    userId: 12,
  };
  assert.equal(profileProofIdentityError({ ...base, requestedDid: null }), null);
  assert.equal(profileProofIdentityError({ ...base, requestedDid: "did:plc:current" }), "atproto_account_mismatch");
  assert.equal(profileProofIdentityError({ ...base, requestedDid: "did:plc:chosen" }), null);
});

test("Profile AT proof refuses a link changed after either blank or typed OAuth start", () => {
  assert.equal(profileProofLinkChanged({ id: null, did: null }, null), false);
  assert.equal(profileProofLinkChanged({ id: null, did: null }, { id: 18, did: "did:plc:new" }), true);
  assert.equal(profileProofLinkChanged({ id: 18, did: "did:plc:old" }, { id: 18, did: "did:plc:old" }), false);
  assert.equal(profileProofLinkChanged({ id: 18, did: "did:plc:old" }, { id: 18, did: "did:plc:new" }), true);
  assert.equal(profileProofLinkChanged({ id: 18, did: "did:plc:old" }, null), true);
});

test("Profile proof cannot relink a DID owned by another WTF account", () => {
  assert.equal(
    profileProofIdentityError({
      requestedActor: "artist.bsky.social",
      requestedDid: "did:plc:artist",
      verifiedDid: "did:plc:artist",
      verifiedHandle: "artist.bsky.social",
      linkedOwnerUserId: 9,
      userId: 12,
    }),
    "atproto_already_linked",
  );
});

test("Reproving the same DID keeps an existing Skywire grant and session", () => {
  assert.equal(shouldPreserveAtprotoGrantOnProfileProof("did:plc:artist", "did:plc:artist", true), true);
  assert.equal(shouldPreserveAtprotoGrantOnProfileProof("did:plc:artist", "did:plc:other", true), false);
  assert.equal(shouldPreserveAtprotoGrantOnProfileProof("did:plc:artist", "did:plc:artist", false), false);
});

test("A verified AT DID can link when Bluesky has no public profile for it", () => {
  assert.deepEqual(
    atprotoProofProfileData({
      requestedActor: "artist.example",
      verifiedDid: "did:plc:artist",
      publicProfile: null,
    }),
    { handle: "artist.example", displayName: null, avatar: null, description: null },
  );
  assert.throws(() => atprotoProofProfileData({
    requestedActor: "artist.example",
    verifiedDid: "did:plc:artist",
    publicProfile: { did: "did:plc:other", handle: "artist.example" },
  }), /DID does not match/);
});
