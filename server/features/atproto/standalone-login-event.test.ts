import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedSystemEventInput } from "../../challenges/events/types";
import { loginRequestUser } from "./standalone-login-event";

test("standalone Skywire auth records one account event after a successful session login", async () => {
  const events: NormalizedSystemEventInput[] = [];
  const welcomes: Array<{ userId: number; sourceModule: string }> = [];
  const emit = async (event: NormalizedSystemEventInput) => {
    events.push(event);
  };
  const welcome = async (user: { id: number }, sourceModule: string) => {
    welcomes.push({ userId: user.id, sourceModule });
  };
  const req = {
    login: (_user: unknown, done: (err?: Error) => void) => done(),
  };
  const user = { id: 42, username: "skywire-user" };

  assert.equal(await loginRequestUser(req, user, true, emit, welcome), true);
  assert.equal(await loginRequestUser(req, user, false, emit, welcome), true);
  assert.deepEqual(events.map((event) => event.eventType), [
    "auth.register.succeeded",
    "auth.login.succeeded",
  ]);
  for (const event of events) {
    assert.equal(event.userId, 42);
    assert.equal(event.source, "auth");
    assert.equal(event.metadata?.method, "atproto");
  }
  assert.deepEqual(welcomes, [
    { userId: 42, sourceModule: "skywire-atproto-login" },
    { userId: 42, sourceModule: "skywire-atproto-login" },
  ]);
});

test("standalone Skywire auth does not record a login without a successful session", async () => {
  const events: NormalizedSystemEventInput[] = [];
  const welcomes: number[] = [];
  const emit = async (event: NormalizedSystemEventInput) => {
    events.push(event);
  };
  const user = { id: 42, username: "skywire-user" };
  const welcome = async (account: { id: number }) => { welcomes.push(account.id); };

  assert.equal(await loginRequestUser({}, user, false, emit, welcome), false);
  await assert.rejects(
    loginRequestUser(
      { login: (_user: unknown, done: (err: Error) => void) => done(new Error("session failed")) },
      user,
      false,
      emit,
      welcome
    ),
    /session failed/
  );
  assert.deepEqual(events, []);
  assert.deepEqual(welcomes, []);
});

test("standalone Skywire login succeeds when welcome delivery is temporarily unavailable", async () => {
  const events: NormalizedSystemEventInput[] = [];
  const req = { login: (_user: unknown, done: (err?: Error) => void) => done() };
  const emit = async (event: NormalizedSystemEventInput) => { events.push(event); };
  const welcome = async () => { throw new Error("welcome service unavailable"); };

  assert.equal(await loginRequestUser(req, { id: 42, username: "skywire-user" }, true, emit, welcome), true);
  assert.equal(events[0]?.eventType, "auth.register.succeeded");
});
