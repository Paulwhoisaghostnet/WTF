import assert from "node:assert/strict";
import test from "node:test";
import { dueCalendarReminder, selectCalendarReminder } from "./calendar-reminders";

const event = {
  id: 7,
  title: "Drop day",
  startsAt: "2026-07-20T18:00:00.000Z",
  allDay: false,
  sourceProvider: "wtf",
};

test("timed reminders advance through day, six-hour, hour, and start thresholds", () => {
  assert.equal(dueCalendarReminder(event, new Date("2026-07-19T18:01:00.000Z"))?.trigger, "day");
  assert.equal(dueCalendarReminder(event, new Date("2026-07-20T12:01:00.000Z"))?.trigger, "six-hours");
  assert.equal(dueCalendarReminder(event, new Date("2026-07-20T17:01:00.000Z"))?.trigger, "hour");
  assert.equal(dueCalendarReminder(event, new Date("2026-07-20T18:01:00.000Z"))?.trigger, "start");
});

test("an unviewed older threshold is replaced instead of stacked", () => {
  const reminder = selectCalendarReminder([event], new Set(), new Date("2026-07-20T17:05:00.000Z"));
  assert.equal(reminder?.trigger, "hour");
});

test("viewing a threshold allows the next threshold to appear later", () => {
  const hour = dueCalendarReminder(event, new Date("2026-07-20T17:05:00.000Z"));
  const atStart = selectCalendarReminder(
    [event],
    new Set(hour ? [hour.id] : []),
    new Date("2026-07-20T18:05:00.000Z"),
  );
  assert.equal(atStart?.trigger, "start");
});
