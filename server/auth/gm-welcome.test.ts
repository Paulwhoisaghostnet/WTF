import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_GM_WELCOME_EVENT_TYPE,
  buildGmWelcomeEventInput,
  currentGmWelcomeUtcDay,
  selectGmNftForUtcDay,
  shouldShowDailyGmWelcome,
  type GmNftManifest,
} from "./gm-welcome";

const manifest: GmNftManifest = {
  projectId: 24858,
  projectName: "GM!",
  collectionUrl: "https://objkt.com/collections/fxhash/projects/24858",
  authorName: "Paulwhoisaghost#3465",
  authorAddress: "tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2",
  generatedAt: "2026-05-09T00:00:00.000Z",
  assets: [
    {
      id: "FX0-1",
      onChainId: 1,
      iteration: 1,
      name: "GM! #1",
      sourceUri: "ipfs://one",
      filename: "one.png",
    },
    {
      id: "FX0-2",
      onChainId: 2,
      iteration: 2,
      name: "GM! #2",
      sourceUri: "ipfs://two",
      filename: "two.png",
    },
  ],
};

describe("daily GM welcome event", () => {
  it("uses UTC day boundaries for the resettable account flag", () => {
    assert.equal(
      currentGmWelcomeUtcDay(new Date("2026-05-09T23:59:59.999Z")),
      "2026-05-09"
    );
    assert.equal(
      currentGmWelcomeUtcDay(new Date("2026-05-10T00:00:00.000Z")),
      "2026-05-10"
    );
  });

  it("runs only when the user has not been flagged for the UTC day", () => {
    assert.equal(
      shouldShowDailyGmWelcome({ id: 7, gmWelcomeUtcDay: "2026-05-08" }, "2026-05-09"),
      true
    );
    assert.equal(
      shouldShowDailyGmWelcome({ id: 7, gmWelcomeUtcDay: null }, "2026-05-09"),
      true
    );
    assert.equal(
      shouldShowDailyGmWelcome({ id: 7, gmWelcomeUtcDay: "2026-05-09" }, "2026-05-09"),
      false
    );
    assert.equal(shouldShowDailyGmWelcome(null, "2026-05-09"), false);
  });

  it("selects a deterministic cached NFT for a UTC day", () => {
    const first = selectGmNftForUtcDay(manifest, "2026-05-09");
    const second = selectGmNftForUtcDay(manifest, "2026-05-09");
    assert.deepEqual(first, second);
    assert.ok(first?.filename.endsWith(".png"));
  });

  it("builds a stable daily GM welcome event", () => {
    const event = buildGmWelcomeEventInput(
      { id: 42, username: "gm-user", gmWelcomeUtcDay: "2026-05-08" },
      "local-login",
      "2026-05-09"
    );

    assert.equal(event.eventId, `${AUTH_GM_WELCOME_EVENT_TYPE}:42:2026-05-09`);
    assert.equal(event.eventType, AUTH_GM_WELCOME_EVENT_TYPE);
    assert.equal(event.userId, 42);
    assert.equal(event.metadata?.eventName, "daily GM welcome event");
    assert.equal(event.metadata?.utcDay, "2026-05-09");
    assert.equal(event.metadata?.projectId, 24858);
  });
});
