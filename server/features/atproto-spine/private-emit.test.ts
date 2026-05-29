import test from "node:test";
import assert from "node:assert/strict";
import { dmRkey, dmRoomRef, buildDmPayload, privateRepoTarget } from "./private-emit";

test("deterministic DM rkey + roomRef", () => {
  assert.equal(dmRoomRef(8), "room-8");
  assert.equal(dmRkey(8, 42), "dm-8-42");
});

test("buildDmPayload normalizes timestamps and defaults messageType", () => {
  const payload = buildDmPayload({
    messageId: 42,
    conversationId: 8,
    senderUserId: 3,
    content: "secret",
    createdAt: new Date("2026-02-01T00:00:00Z"),
  });
  assert.equal(payload.messageType, "text");
  assert.equal(payload.createdAt, "2026-02-01T00:00:00.000Z");
  assert.equal(payload.content, "secret");
});

test("privateRepoTarget requires all three env values", () => {
  assert.equal(privateRepoTarget({} as NodeJS.ProcessEnv), null);
  assert.equal(
    privateRepoTarget({ WTFOS_PRIVATE_REPO_DID: "did:web:private.wtfos.me" } as NodeJS.ProcessEnv),
    null,
  );
  const target = privateRepoTarget({
    WTFOS_PRIVATE_REPO_DID: "did:web:private.wtfos.me",
    WTFOS_PRIVATE_REPO_IDENTIFIER: "rooms.private.wtfos.me",
    WTFOS_PRIVATE_REPO_PASSWORD: "pw",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(target, {
    repoDid: "did:web:private.wtfos.me",
    identifier: "rooms.private.wtfos.me",
    password: "pw",
  });
});
