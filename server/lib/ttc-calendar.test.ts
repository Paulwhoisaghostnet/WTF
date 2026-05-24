import test from "node:test";
import assert from "node:assert/strict";
import { loadTtcCalendarEvents } from "./ttc-calendar";

test("TTC calendar feed expands recurring iCal events in the requested window", async () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:MEC-test@thetezos.com",
    "DTSTART:20260526T160000Z",
    "DTEND:20260526T170000Z",
    "RRULE:FREQ=WEEKLY",
    "SUMMARY:Tezos Tea Tuesday",
    "DESCRIPTION:Weekly Tezos community space",
    "URL:https://thetezos.com/events/tezos-tea-tuesday/",
    "CATEGORIES:Community Events,Spaces",
    "LOCATION:X/Twitter",
    "ATTACH;FMTTYPE=image/png:https://thetezos.com/tea.png",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  process.env.TTC_CALENDAR_FEED_URL = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  const events = await loadTtcCalendarEvents(
    new Date("2026-06-01T00:00:00Z"),
    new Date("2026-06-10T00:00:00Z")
  );

  assert.equal(events.length, 2);
  assert.equal(events[0].title, "Tezos Tea Tuesday");
  assert.equal(events[0].sourceProvider, "ttc");
  assert.equal(events[0].sourceRank, 100);
  assert.equal(events[0].startsAt.toISOString(), "2026-06-02T16:00:00.000Z");
  assert.deepEqual(events[0].categories, ["Community Events", "Spaces"]);
  assert.equal(events[0].location, "X/Twitter");
  assert.equal(events[0].imageUrl, "https://thetezos.com/tea.png");
  assert.deepEqual(events[0].linksJson, [
    { label: "TTC event", url: "https://thetezos.com/events/tezos-tea-tuesday/" },
  ]);
});
