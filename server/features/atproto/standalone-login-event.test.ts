import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedSystemEventInput } from "../../challenges/events/types";
import { loginRequestUser } from "./standalone-login-event";

test("standalone Skywire auth records one account event after a successful session login", async () => {
  const events: NormalizedSystemEventInput[] = [];
  const emit = async (event: NormalizedSystemEventInput) => {
    events.push(event);
  };
  const req = {
    login: (_user: unknown, done: (err?: Error) => void) => done(),
  };
  const user = { id: 42, username: "skywire-user" };

  assert.equal(await loginRequestUser(req, user, true, emit), true);
  assert.equal(await loginRequestUser(req, user, false, emit), true);
  assert.deepEqual(events.map((event) => event.eventType), [
    "auth.register.succeeded",
    "auth.login.succeeded",
  ]);
  for (const event of events) {
    assert.equal(event.userId, 42);
    assert.equal(event.source, "auth");
    assert.equal(event.metadata?.method, "atproto");
  }
});

test("standalone Skywire auth does not record a login without a successful session", async () => {
  const events: NormalizedSystemEventInput[] = [];
  const emit = async (event: NormalizedSystemEventInput) => {
    events.push(event);
  };
  const user = { id: 42, username: "skywire-user" };

  assert.equal(await loginRequestUser({}, user, false, emit), false);
  await assert.rejects(
    loginRequestUser(
      { login: (_user: unknown, done: (err: Error) => void) => done(new Error("session failed")) },
      user,
      false,
      emit
    ),
    /session failed/
  );
  assert.deepEqual(events, []);
});
