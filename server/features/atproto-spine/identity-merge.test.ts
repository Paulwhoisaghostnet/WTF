import test from "node:test";
import assert from "node:assert/strict";
import { mergeSpineIdentity } from "./identity-merge";

test("prefers the WTF repo DID + handle when provisioned", () => {
  const id = mergeSpineIdentity({
    userId: 1,
    canonicalDid: "did:plc:canonical",
    canonicalHandle: "alice.bsky.social",
    wtfDid: "did:plc:wtfrepo",
    wtfHandle: "alice.wtfos.me",
    wtfPdsUrl: "https://pds.wtfos.me",
    identityId: 9,
  });
  assert.equal(id.repoDid, "did:plc:wtfrepo");
  assert.equal(id.handle, "alice.wtfos.me");
  assert.equal(id.hasRepo, true);
  assert.equal(id.canonicalDid, "did:plc:canonical");
});

test("falls back to canonical identity when no WTF repo exists", () => {
  const id = mergeSpineIdentity({
    userId: 2,
    canonicalDid: "did:plc:canonical",
    canonicalHandle: "bob.bsky.social",
  });
  assert.equal(id.repoDid, "did:plc:canonical");
  assert.equal(id.handle, "bob.bsky.social");
  assert.equal(id.hasRepo, false);
});

test("uses a verified handle claim over the canonical handle", () => {
  const id = mergeSpineIdentity({
    userId: 3,
    canonicalDid: "did:plc:c",
    canonicalHandle: "c.bsky.social",
    handleClaim: "carol.wtfos.me",
  });
  assert.equal(id.handle, "carol.wtfos.me");
});

test("returns nulls when nothing is linked", () => {
  const id = mergeSpineIdentity({ userId: 4 });
  assert.equal(id.repoDid, null);
  assert.equal(id.handle, null);
  assert.equal(id.hasRepo, false);
});
