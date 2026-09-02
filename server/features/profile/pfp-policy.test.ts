import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProfilePfpTokenReference,
  sanitizeProfilePfpImageUrl,
} from "./pfp-policy";

test("profile PFP URLs accept only normalized IPFS or allowlisted public media", () => {
  assert.equal(
    sanitizeProfilePfpImageUrl("http://cdn.objkt.com/avatar.png"),
    "https://cdn.objkt.com/avatar.png",
  );
  assert.match(
    sanitizeProfilePfpImageUrl("ipfs://bafybeigdyrzt/avatar.png") || "",
    /^https:\/\//,
  );
  assert.equal(
    sanitizeProfilePfpImageUrl("https://user:pass@cdn.objkt.com/avatar.png"),
    "https://cdn.objkt.com/avatar.png",
  );
});

test("profile PFP URLs reject data, script, private, and unallowlisted URLs", () => {
  for (const unsafe of [
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "http://127.0.0.1/avatar.png",
    "https://tracker.invalid/pixel.gif",
  ]) {
    assert.equal(sanitizeProfilePfpImageUrl(unsafe), null, unsafe);
  }
});

test("token-backed PFP references require a complete bounded contract and token id", () => {
  assert.deepEqual(normalizeProfilePfpTokenReference(null, null), {
    ok: true,
    value: null,
  });
  assert.deepEqual(normalizeProfilePfpTokenReference(" KT1Owned ", " 42 "), {
    ok: true,
    value: { tokenContract: "KT1Owned", tokenId: "42" },
  });
  assert.equal(normalizeProfilePfpTokenReference("KT1Owned", null).ok, false);
  assert.equal(normalizeProfilePfpTokenReference(null, "42").ok, false);
  assert.equal(normalizeProfilePfpTokenReference("K".repeat(37), "42").ok, false);
  assert.equal(normalizeProfilePfpTokenReference("KT1Owned", "4".repeat(257)).ok, false);
});
