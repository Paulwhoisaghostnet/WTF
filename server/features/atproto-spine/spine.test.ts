import test from "node:test";
import assert from "node:assert/strict";
import { LexiconValidationError } from "@shared/atproto";
import {
  getSpineConfig,
  isSpineEnabled,
  defaultRoutingRules,
  WTFOS_DOMAINS,
  RESERVED_HANDLES,
} from "./config";
import { buildSpineWrite, isRegistrableHandleLabel, handleForLabel } from "./records";

test("isSpineEnabled defaults off and respects the flag", () => {
  assert.equal(isSpineEnabled({}), false);
  assert.equal(isSpineEnabled({ ATPROTO_SPINE_ENABLED: "false" }), false);
  assert.equal(isSpineEnabled({ ATPROTO_SPINE_ENABLED: "true" }), true);
  assert.equal(isSpineEnabled({ ATPROTO_SPINE_ENABLED: "1" }), true);
});

test("getSpineConfig builds a full topology from env with sensible defaults", () => {
  const config = getSpineConfig({});
  assert.equal(config.networkDomain, "wtfos.me");
  assert.equal(config.lexiconNamespace, "app.wtfos");
  assert.equal(config.master.url, "http://wtfos-pds:3000");
  for (const domain of WTFOS_DOMAINS) {
    assert.ok(config.domains[domain]?.url, `domain ${domain} should have a URL`);
  }
  assert.ok(config.reservedHandles.includes("relay"));
});

test("getSpineConfig honors explicit env overrides", () => {
  const config = getSpineConfig({
    WTFOS_ATPROTO_NETWORK_DOMAIN: "example.net",
    WTFOS_PDS_INTERNAL_URL: "https://pds.example.net/",
    WTFOS_PRIMARY_ATPROTO_DID: "did:web:pds.example.net",
  });
  assert.equal(config.networkDomain, "example.net");
  assert.equal(config.master.url, "https://pds.example.net");
  assert.equal(config.master.repoDid, "did:web:pds.example.net");
});

test("defaultRoutingRules produce one prefix rule per domain", () => {
  const rules = defaultRoutingRules("app.wtfos");
  assert.equal(rules.length, WTFOS_DOMAINS.length);
  const social = rules.find((r) => r.domain === "social");
  assert.equal(social?.typePrefix, "app.wtfos.social.");
});

test("buildSpineWrite validates and injects $type with a deterministic rkey", () => {
  const write = buildSpineWrite(
    "app.wtfos.social.board.post",
    {
      schemaVersion: 1,
      postId: "42",
      channelRef: "at://did:plc:abc/app.wtfos.social.board.channel/general",
      text: "gm wtfOS",
      createdAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    },
    ["board", 42],
  );
  assert.equal(write.collection, "app.wtfos.social.board.post");
  assert.equal(write.rkey, "board-42");
  assert.equal(write.record.$type, "app.wtfos.social.board.post");
  assert.equal(write.record.text, "gm wtfOS");
});

test("buildSpineWrite rejects records that fail lexicon validation", () => {
  assert.throws(
    () => buildSpineWrite("app.wtfos.social.board.post", { text: 123 as unknown as string }),
    LexiconValidationError,
  );
});

test("buildSpineWrite rejects unknown lexicon types", () => {
  assert.throws(
    () => buildSpineWrite("app.wtfos.not.real" as never, { foo: "bar" }),
    LexiconValidationError,
  );
});

test("reserved + infra handle labels are not registrable", () => {
  for (const reserved of RESERVED_HANDLES) {
    assert.equal(isRegistrableHandleLabel(reserved), false, `${reserved} must be reserved`);
  }
  assert.equal(isRegistrableHandleLabel("ab"), false, "too short");
  assert.equal(isRegistrableHandleLabel("-bad"), false, "bad dns label");
  assert.equal(isRegistrableHandleLabel("alice"), true);
  assert.equal(handleForLabel("Alice"), "alice.wtfos.me");
});
