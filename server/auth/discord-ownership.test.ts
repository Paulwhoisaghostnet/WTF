import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDiscordIdentityAvailable,
  DiscordIdentityAlreadyLinkedError,
  type DiscordOwnerTransaction,
} from "./discord-ownership";

function fakeTransaction(ownerId?: number) {
  const steps: string[] = [];
  const tx = {
    execute: async () => { steps.push("lock"); },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            steps.push("lookup");
            return ownerId === undefined ? [] : [{ id: ownerId }];
          },
        }),
      }),
    }),
  } as unknown as DiscordOwnerTransaction;
  return { tx, steps };
}

test("Discord ownership check locks the identity before looking for another owner", async () => {
  const { tx, steps } = fakeTransaction();
  await assertDiscordIdentityAvailable(tx, "123456789012345678", 5);
  assert.deepEqual(steps, ["lock", "lookup"]);
});

test("Discord ownership check rejects an identity already linked to another WTF user", async () => {
  const { tx, steps } = fakeTransaction(6);
  await assert.rejects(
    assertDiscordIdentityAvailable(tx, "123456789012345678", 5),
    DiscordIdentityAlreadyLinkedError
  );
  assert.deepEqual(steps, ["lock", "lookup"]);
});
