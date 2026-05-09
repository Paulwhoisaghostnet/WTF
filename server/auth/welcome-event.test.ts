import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_WELCOME_EVENT_TYPE,
  buildWelcomeEventInput,
  shouldRunWelcomeEvent,
} from "./welcome-event";

describe("auth welcome event", () => {
  it("runs only for accounts that have not been welcomed to WTF OS", () => {
    assert.equal(shouldRunWelcomeEvent({ id: 7, welcomedToWtfOs: false }), true);
    assert.equal(shouldRunWelcomeEvent({ id: 7, welcomedToWtfOs: null }), true);
    assert.equal(shouldRunWelcomeEvent({ id: 7, welcomedToWtfOs: true }), false);
    assert.equal(shouldRunWelcomeEvent(null), false);
  });

  it("builds a stable one-time welcome event for the user account", () => {
    const event = buildWelcomeEventInput(
      { id: 42, username: "newbie", welcomedToWtfOs: false },
      "local-login"
    );

    assert.equal(event.eventId, `${AUTH_WELCOME_EVENT_TYPE}:42`);
    assert.equal(event.eventType, AUTH_WELCOME_EVENT_TYPE);
    assert.equal(event.userId, 42);
    assert.equal(event.source, "auth");
    assert.equal(event.sourceModule, "local-login");
    assert.equal(event.rawRefType, "user");
    assert.equal(event.rawRefId, 42);
    assert.deepEqual(event.metadata, {
      eventName: "welcome event",
      method: "local-login",
      username: "newbie",
      accountAlreadyWelcomed: false,
    });
  });
});
