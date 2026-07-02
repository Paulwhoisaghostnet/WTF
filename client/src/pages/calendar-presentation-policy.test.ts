import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const calendarSource = readFileSync("client/src/pages/Calendar.tsx", "utf8");

test("Calendar route exposes a Gamma-aware presentation boundary", () => {
  assert.match(calendarSource, /usePresentationShell/);
  assert.match(calendarSource, /data-calendar-presentation-host=\{presentation\.host\}/);
  assert.match(calendarSource, /data-calendar-surface="calendar"/);
  assert.match(calendarSource, /data-calendar-active-tab=\{tab\}/);
  assert.match(calendarSource, /\[data-calendar-presentation-host="gamma"\]/);
});

test("Calendar Gamma chrome covers browse forms tickets and TTC modal regions", () => {
  for (const region of [
    "source-links",
    "tabs",
    "tab-body",
    "browse-actions",
    "event-card",
    "source-panel",
    "personal-form",
    "submit-form",
    "tickets-panel",
    "ticket-card",
    "ttc-modal",
    "ttc-frame",
  ]) {
    assert.match(calendarSource, new RegExp(`data-calendar-region="${region}"`));
  }
  assert.match(calendarSource, /background-image:\s*none/);
  assert.match(calendarSource, /box-shadow:\s*none/);
  assert.match(calendarSource, /text-shadow:\s*none/);
  assert.match(calendarSource, /border-radius:\s*6px/);
  assert.match(calendarSource, /#00d2ff/);
});

test("Calendar keeps shared event APIs local storage and TTC handoff unchanged", () => {
  assert.match(calendarSource, /\/api\/calendar\/events\?from=/);
  assert.match(calendarSource, /\/api\/calendar\/tickets\/mine/);
  assert.match(calendarSource, /api\.post\("\/api\/calendar\/tickets"/);
  assert.match(calendarSource, /\/api\/calendar\/feed\.ics/);
  assert.match(calendarSource, /wtf:calendar:personal/);
  assert.match(calendarSource, /https:\/\/thetezos\.com\/submit-event\//);
  assert.match(calendarSource, /sandbox="allow-forms allow-popups allow-same-origin allow-scripts"/);
  assert.doesNotMatch(calendarSource, /\/api\/gamma/);
});
