import test from "node:test";
import assert from "node:assert/strict";
import { lexiconSchemas } from "@shared/atproto";
import { isSpineEnabled, WTFOS_DOMAINS } from "./config";
import { shouldIndexCollection, federationConfig } from "./federation";
import { mergeSpineIdentity } from "./identity-merge";
import { buildLabel, isBanLabel } from "./labeler-policy";
import { toAppviewRow } from "./appview/record-shape";

/**
 * Constitutional acceptance / LAW gates (S5.3). Executable invariants that must hold for the
 * AT Protocol spine to be safe to ship. These encode the WTF doctrine ("spine, not body";
 * additive + flag-gated + zero default disruption) as assertions.
 */

test("LAW: the spine is OFF by default (no behavior change unless explicitly enabled)", () => {
  assert.equal(isSpineEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(isSpineEnabled({ ATPROTO_SPINE_ENABLED: "false" } as NodeJS.ProcessEnv), false);
  assert.equal(isSpineEnabled({ ATPROTO_SPINE_ENABLED: "true" } as NodeJS.ProcessEnv), true);
});

test("LAW: every published lexicon lives under the app.wtfos.* namespace", () => {
  const keys = Object.keys(lexiconSchemas);
  assert.ok(keys.length > 0, "lexicon registry must not be empty");
  for (const key of keys) {
    assert.ok(key.startsWith("app.wtfos."), `lexicon ${key} must be namespaced under app.wtfos.*`);
  }
});

test("LAW: federation does not index external collections unless explicitly opted in", () => {
  const closed = federationConfig({} as NodeJS.ProcessEnv);
  assert.equal(shouldIndexCollection("app.bsky.feed.post", closed), false);
  assert.equal(shouldIndexCollection("app.wtfos.social.board.post", closed), true);
});

test("LAW: users without a provisioned repo never get a publish target", () => {
  const id = mergeSpineIdentity({ userId: 1, canonicalHandle: "x.bsky.social" });
  assert.equal(id.hasRepo, false);
});

test("LAW: moderation bans are explicit + only known labels are emitted", () => {
  assert.equal(isBanLabel("wtfos-ban"), true);
  assert.equal(isBanLabel("warn"), false);
  assert.throws(() => buildLabel({ src: "did:web:mod", uri: "did:plc:a", val: "totally-made-up" }));
});

test("LAW: the AppView never indexes a delete as a live record", () => {
  assert.equal(toAppviewRow({ action: "delete", did: "did:plc:a", collection: "c", rkey: "r" }), null);
});

test("doctrine: the seven logical domains are stable", () => {
  assert.deepEqual(
    [...WTFOS_DOMAINS].sort(),
    ["arcade", "commerce", "media", "ops", "os", "social", "tezos"].sort(),
  );
});
