import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCORD_PROFILE_SCOPES,
  DiscordLinkError,
  discordAuthorizationParams,
  normalizeDiscordExpectedHandle,
  resolveDiscordLinkIntent,
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
  const intent = resolveDiscordLinkIntent("another_user", {
    id: 5, discordId: "111111111111111111", discordHandle: "old_user", discordVerified: true,
  });
  assert.ok(intent);
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
  const intent = resolveDiscordLinkIntent("Legacy#1234", { id: 5 });
  assert.ok(intent);
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

test("blank Discord first link accepts the signed-in provider account", () => {
  const intent = resolveDiscordLinkIntent(undefined, { id: 5 });
  assert.ok(intent);
  assert.equal(intent.expectedHandle, null);
  assert.equal(intent.priorId, null);
  assert.deepEqual(resolveDiscordLinkIdentity(intent, 5, {
    id: "123456789012345678", username: "new_user", discriminator: "0",
  }), { id: "123456789012345678", handle: "new_user" });
});

test("blank Discord reverify stays bound to the existing provider ID", () => {
  const intent = resolveDiscordLinkIntent(undefined, {
    id: 5, discordId: "123456789012345678", discordHandle: "old_user", discordVerified: true,
  });
  assert.ok(intent);
  assert.equal(intent.expectedHandle, null);
  assert.equal(intent.priorId, "123456789012345678");
  assert.equal(intent.allowAccountChange, false);
  assert.deepEqual(resolveDiscordLinkIdentity(intent, 5, {
    id: "123456789012345678", username: "renamed_user", discriminator: "0",
  }), { id: "123456789012345678", handle: "renamed_user" });
  assert.throws(
    () => resolveDiscordLinkIdentity(intent, 5, {
      id: "999999999999999999", username: "other_user", discriminator: "0",
    }),
    (error: unknown) => error instanceof DiscordLinkError && error.code === "discord_account_mismatch"
  );
});

test("typed Discord username permits an explicit account change only for that username", () => {
  const current = {
    id: 5, discordId: "123456789012345678", discordHandle: "old_user", discordVerified: true,
  };
  const intent = resolveDiscordLinkIntent("other_user", current);
  assert.ok(intent);
  assert.equal(intent.allowAccountChange, true);
  assert.deepEqual(resolveDiscordLinkIdentity(intent, 5, {
    id: "999999999999999999", username: "other_user", discriminator: "0",
  }), { id: "999999999999999999", handle: "other_user" });
  assert.throws(
    () => resolveDiscordLinkIdentity(intent, 5, {
      id: "999999999999999999", username: "wrong_user", discriminator: "0",
    }),
    (error: unknown) => error instanceof DiscordLinkError && error.code === "discord_account_mismatch"
  );
  assert.equal(resolveDiscordLinkIntent("bad handle", current), null);
});
