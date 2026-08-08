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

test("TTC calendar feed restores earlier occurrences from a rolling next-occurrence anchor", async () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:MEC-rolling@thetezos.com",
    "DTSTART:20260724T000000Z",
    "DTEND:20260725T000000Z",
    "RRULE:FREQ=WEEKLY",
    "SUMMARY:New issue of The Baking Sheet",
    "URL:https://thetezos.com/events/new-issue-of-the-baking-sheet/",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  process.env.TTC_CALENDAR_FEED_URL = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  const events = await loadTtcCalendarEvents(
    new Date("2026-07-13T00:00:00Z"),
    new Date("2026-07-25T00:00:00Z")
  );

  assert.deepEqual(
    events.map((event) => event.startsAt.toISOString()),
    [
      "2026-07-17T00:00:00.000Z",
      "2026-07-24T00:00:00.000Z",
    ]
  );
  assert.ok(events.every((event) => event.allDay));
});

test("TTC event metadata identifies the public TTC creator without exposing an email address", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TTC_CALENDAR_FEED_URL = "https://fixtures.test/ttc.ics";
  process.env.TTC_CALENDAR_WORDPRESS_API_URL = "https://fixtures.test/wp-json/wp/v2/mec-events";

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("ttc.ics")) {
      return new Response([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:MEC-creator@thetezos.com",
        "DTSTART:20260724T000000Z",
        "DTEND:20260725T000000Z",
        "SUMMARY:Community event",
        "URL:https://thetezos.com/events/community-event/",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"));
    }
    return Response.json([
      {
        slug: "community-event",
        link: "https://thetezos.com/events/community-event/",
        _embedded: {
          author: [{
            name: "creator@example.com",
            link: "https://thetezos.com/author/creator/",
          }],
        },
      },
    ]);
  };

  try {
    const [event] = await loadTtcCalendarEvents(
      new Date("2026-07-24T00:00:00Z"),
      new Date("2026-07-26T00:00:00Z")
    );

    assert.equal(event.creatorName, "creator");
    assert.equal(event.creatorUrl, "https://thetezos.com/author/creator/");
    assert.equal(event.sourceUrl, "https://thetezos.com/events/community-event/");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TTC_CALENDAR_WORDPRESS_API_URL;
  }
});

test("TTC creator enrichment supports WordPress numeric event permalinks", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TTC_CALENDAR_FEED_URL = "https://fixtures.test/numeric-ttc.ics";
  process.env.TTC_CALENDAR_WORDPRESS_API_URL = "https://fixtures.test/wp-json/wp/v2/mec-events";

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("numeric-ttc.ics")) {
      return new Response([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:MEC-numeric@thetezos.com",
        "DTSTART:20260724T000000Z",
        "DTEND:20260725T000000Z",
        "SUMMARY:Numeric event",
        "URL:https://thetezos.com/?post_type=mec-events&p=4503",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"));
    }
    assert.match(url, /include=4503/);
    return Response.json([
      {
        id: 4503,
        link: "https://thetezos.com/?post_type=mec-events&p=4503",
        _embedded: {
          author: [{
            name: "monthly-host",
            link: "https://thetezos.com/author/monthly-host/",
          }],
        },
      },
    ]);
  };

  try {
    const [event] = await loadTtcCalendarEvents(
      new Date("2026-07-24T00:00:00Z"),
      new Date("2026-07-26T00:00:00Z")
    );
    assert.equal(event.creatorName, "monthly-host");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TTC_CALENDAR_WORDPRESS_API_URL;
  }
});

test("TTC sync drops stale iCal rows when TTC confirms the event no longer exists", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TTC_CALENDAR_FEED_URL = "https://fixtures.test/stale-ttc.ics";
  process.env.TTC_CALENDAR_WORDPRESS_API_URL = "https://fixtures.test/wp-json/wp/v2/mec-events";

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("stale-ttc.ics")) {
      return new Response([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:MEC-stale@thetezos.com",
        "DTSTART:20260724T000000Z",
        "SUMMARY:Deleted TTC event",
        "URL:https://thetezos.com/?post_type=mec-events&p=4503",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"));
    }
    return Response.json([]);
  };

  try {
    const events = await loadTtcCalendarEvents(
      new Date("2026-07-24T00:00:00Z"),
      new Date("2026-07-26T00:00:00Z")
    );
    assert.deepEqual(events, []);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TTC_CALENDAR_WORDPRESS_API_URL;
  }
});
