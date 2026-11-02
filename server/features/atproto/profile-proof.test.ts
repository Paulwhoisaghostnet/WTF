import test from "node:test";
import assert from "node:assert/strict";
import {
  AT_PROTO_PROFILE_SCOPE,
  atprotoProofProfileData,
  profileProofIdentityError,
  isIdentityOnlyAtprotoGrant,
  shouldPreserveAtprotoGrantOnProfileProof,
} from "./profile-proof";

test("Profile AT proof requests identity only", () => {
  assert.equal(AT_PROTO_PROFILE_SCOPE, "atproto");
  assert.equal(isIdentityOnlyAtprotoGrant("atproto"), true);
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
