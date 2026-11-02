import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDiscordIdentityAvailable,
  DiscordIdentityAlreadyLinkedError,
  discordLinkSnapshotCondition,
  type DiscordOwnerTransaction,
} from "./discord-ownership";
import { db } from "../db";
import { users } from "@shared/schema";

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

test("Discord link update compares the OAuth-start link snapshot atomically", () => {
  const empty = db.update(users).set({ discordHandle: "new_user" }).where(
    discordLinkSnapshotCondition(5, {
      discordId: null, discordHandle: null, discordVerified: false,
    })
  ).toSQL();
  assert.match(empty.sql, /discord_id" is null/);
  assert.match(empty.sql, /discord_handle" is null/);
  assert.match(empty.sql, /discord_verified" = /);
  assert.ok(empty.params.includes(5));
  assert.ok(empty.params.includes(false));

  const linked = db.update(users).set({ discordHandle: "new_user" }).where(
    discordLinkSnapshotCondition(5, {
      discordId: "123456789012345678", discordHandle: "old_user", discordVerified: true,
    })
  ).toSQL();
  assert.ok(linked.params.includes("123456789012345678"));
  assert.ok(linked.params.includes("old_user"));
  assert.ok(linked.params.includes(true));
});
