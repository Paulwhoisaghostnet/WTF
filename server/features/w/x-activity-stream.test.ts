import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

process.env.DATABASE_URL ||= "postgres://wtf:wtf@127.0.0.1:5432/wtf_test";

describe("W XAA groupchat bridge policy", () => {
  it("extracts likely conversation IDs from unknown XAA chat payload shapes", async () => {
    const { extractXaaConversationIds } = await import("../../lib/x-activity-stream");

    const ids = extractXaaConversationIds({
      data: {
        event_type: "chat.received",
        payload: {
          conversation_id: "g1934373363226407162",
          object: { dmConversationId: "123-456" },
          target: { group_id: "1934373363226407162" },
        },
      },
    });

    assert.deepEqual(ids.sort(), ["123-456", "1934373363226407162", "g1934373363226407162"].sort());
  });

  it("keeps XAA as a wake-up bridge, not a personal DM poller", () => {
    const source = readFileSync("server/lib/x-activity-stream.ts", "utf8");

    assert.match(source, /\/activity\/stream/);
    assert.match(source, /\/activity\/subscriptions/);
    assert.match(source, /chat\.received/);
    assert.match(source, /chat\.sent/);
    assert.match(source, /syncConfiguredGroupchatFromActivity/);
    assert.doesNotMatch(source, /\/dm_events\?/);
    assert.doesNotMatch(source, /max_results=100/);
    assert.doesNotMatch(source, /backfill_minutes/);
    assert.doesNotMatch(source, /x-dm-sync-users/);
  });
});
