import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDomainDmKey,
  getDomainChatConfig,
  normalizeDomainChatName,
} from "./chat";

test("wtf domain chat config normalizes parent domains", () => {
  const config = getDomainChatConfig({
    WTF_DOMAINS_CHAT_PARENT_DOMAINS: "wtf,hack.tez,wtf.tez",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(config.parentDomains, ["wtf.tez", "hack.tez"]);
});

test("wtf domain chat names accept labels and full names", () => {
  assert.deepEqual(normalizeDomainChatName("alice", ["wtf.tez"]), {
    ok: true,
    domain: "alice.wtf.tez",
    parentDomain: "wtf.tez",
  });
  assert.deepEqual(normalizeDomainChatName("bob.hack.tez", ["wtf.tez", "hack.tez"]), {
    ok: true,
    domain: "bob.hack.tez",
    parentDomain: "hack.tez",
  });
});

test("wtf domain dm keys are canonical", () => {
  assert.equal(
    canonicalDomainDmKey("bob.hack.tez", "alice.wtf.tez"),
    "alice.wtf.tez+bob.hack.tez"
  );
});
