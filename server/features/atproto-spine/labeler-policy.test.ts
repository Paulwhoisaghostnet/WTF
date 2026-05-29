import test from "node:test";
import assert from "node:assert/strict";
import {
  LABEL_DEFINITIONS,
  knownLabelValues,
  isKnownLabel,
  isBanLabel,
  buildLabel,
  labelerDid,
} from "./labeler-policy";

test("label registry separates bans from advisory labels", () => {
  assert.equal(isBanLabel("wtfos-ban"), true);
  assert.equal(isBanLabel("wtfos-suspend"), true);
  assert.equal(isBanLabel("warn"), false);
  assert.equal(isBanLabel("nsfw"), false);
  assert.ok(knownLabelValues().length === Object.keys(LABEL_DEFINITIONS).length);
});

test("buildLabel produces a com.atproto.label-shaped object for DIDs and records", () => {
  const account = buildLabel({ src: "did:web:mod.wtfos.me", uri: "did:plc:abc", val: "wtfos-ban" });
  assert.equal(account.src, "did:web:mod.wtfos.me");
  assert.equal(account.uri, "did:plc:abc");
  assert.equal(account.val, "wtfos-ban");
  assert.ok(account.cts);
  assert.equal(account.neg, undefined);

  const record = buildLabel({
    src: "did:web:mod.wtfos.me",
    uri: "at://did:plc:abc/app.wtfos.social.board.post/1",
    cid: "bafyrei",
    val: "spam",
    neg: true,
  });
  assert.equal(record.cid, "bafyrei");
  assert.equal(record.neg, true);
});

test("buildLabel rejects unknown values and bad subjects", () => {
  assert.throws(() => buildLabel({ src: "did:web:mod", uri: "did:plc:abc", val: "made-up" }), /unknown label/);
  assert.throws(() => buildLabel({ src: "did:web:mod", uri: "not-a-subject", val: "spam" }), /must be a DID or at:\/\//);
});

test("labelerDid derives from the network domain or explicit override", () => {
  assert.equal(labelerDid({ WTFOS_ATPROTO_NETWORK_DOMAIN: "wtfos.me" } as NodeJS.ProcessEnv), "did:web:mod.wtfos.me");
  assert.equal(labelerDid({ WTFOS_LABELER_DID: "did:plc:labeler" } as NodeJS.ProcessEnv), "did:plc:labeler");
});

test("isKnownLabel guards the registry", () => {
  assert.equal(isKnownLabel("abuse"), true);
  assert.equal(isKnownLabel("nope"), false);
});
