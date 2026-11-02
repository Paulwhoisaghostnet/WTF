import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCORD_PROFILE_SCOPES,
  DiscordLinkError,
  discordAuthorizationParams,
  normalizeDiscordExpectedHandle,
  resolveDiscordLinkIdentity,
} from "./discord-link";

test("Discord profile proof asks only for identity with fresh consent", () => {
  assert.deepEqual(DISCORD_PROFILE_SCOPES, ["identify"]);
  assert.deepEqual(discordAuthorizationParams(), { prompt: "consent" });
});

test("Discord handle normalization accepts modern and legacy usernames", () => {
  assert.equal(normalizeDiscordExpectedHandle(" @new.user "), "new.user");
  assert.equal(normalizeDiscordExpectedHandle("New.User#0"), "new.user");
  assert.equal(normalizeDiscordExpectedHandle("Legacy#1234"), "Legacy#1234");
  assert.equal(normalizeDiscordExpectedHandle(""), null);
  assert.equal(normalizeDiscordExpectedHandle(undefined), null);
});

test("Discord callback refuses a different account before it can be linked", () => {
  const intent = { userId: 5, expectedHandle: "another_user" };
  assert.throws(
    () => resolveDiscordLinkIdentity(intent, 5, {
      id: "123456789012345678",
      username: "cached_user",
      discriminator: "0",
    }),
    (error: unknown) => error instanceof DiscordLinkError && error.code === "discord_account_mismatch"
  );
  assert.deepEqual(resolveDiscordLinkIdentity(intent, 5, {
    id: "123456789012345678",
    username: "another_user",
    discriminator: "0",
  }), {
    id: "123456789012345678",
    handle: "another_user",
  });
});

test("Discord callback requires the initiating WTF session and valid provider identity", () => {
  const intent = { userId: 5, expectedHandle: "Legacy#1234" };
  assert.throws(
    () => resolveDiscordLinkIdentity(null, 5, {
      id: "123456789012345678", username: "Legacy", discriminator: "1234",
    }),
    (error: unknown) => error instanceof DiscordLinkError && error.code === "discord_session"
  );
  assert.throws(
    () => resolveDiscordLinkIdentity(intent, 6, {
      id: "123456789012345678", username: "Legacy", discriminator: "1234",
    }),
    (error: unknown) => error instanceof DiscordLinkError && error.code === "discord_session"
  );
  assert.throws(
    () => resolveDiscordLinkIdentity(intent, 5, { id: "", username: "Legacy", discriminator: "1234" }),
    (error: unknown) => error instanceof DiscordLinkError && error.code === "discord_profile"
  );
  assert.deepEqual(resolveDiscordLinkIdentity(intent, 5, {
    id: "123456789012345678", username: "Legacy", discriminator: "1234",
  }), {
    id: "123456789012345678",
    handle: "Legacy#1234",
  });
});
