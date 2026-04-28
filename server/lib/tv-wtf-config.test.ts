import assert from "node:assert/strict";
import test from "node:test";

import {
  compareWtfChannelConfigPriority,
  pickPreferredWtfChannelConfig,
} from "./tv-wtf-config";

test("pickPreferredWtfChannelConfig prefers configured channel rows over null-channel rows", () => {
  const picked = pickPreferredWtfChannelConfig([
    {
      id: 1,
      channelId: null,
      enabled: true,
      updatedAt: new Date("2026-04-28T12:00:00.000Z"),
    },
    {
      id: 2,
      channelId: 77,
      enabled: false,
      updatedAt: new Date("2026-04-27T12:00:00.000Z"),
    },
  ]);

  assert.equal(picked?.id, 2);
});

test("pickPreferredWtfChannelConfig prefers enabled, newer rows when multiple channel configs exist", () => {
  const rows = [
    {
      id: 3,
      channelId: 77,
      enabled: false,
      updatedAt: new Date("2026-04-28T11:00:00.000Z"),
    },
    {
      id: 4,
      channelId: 77,
      enabled: true,
      updatedAt: new Date("2026-04-28T10:00:00.000Z"),
    },
    {
      id: 5,
      channelId: 88,
      enabled: true,
      updatedAt: new Date("2026-04-28T12:00:00.000Z"),
    },
  ];

  const picked = pickPreferredWtfChannelConfig(rows);
  assert.equal(picked?.id, 5);
  assert.ok(compareWtfChannelConfigPriority(rows[2]!, rows[1]!) > 0);
});

test("pickPreferredWtfChannelConfig breaks ties by latest update then highest id", () => {
  const picked = pickPreferredWtfChannelConfig([
    {
      id: 7,
      channelId: 99,
      enabled: true,
      updatedAt: "2026-04-28T12:00:00.000Z",
    },
    {
      id: 8,
      channelId: 99,
      enabled: true,
      updatedAt: "2026-04-28T12:00:00.000Z",
    },
  ]);

  assert.equal(picked?.id, 8);
});
