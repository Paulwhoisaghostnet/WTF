import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const calendarSource = readFileSync("client/src/pages/Calendar.tsx", "utf8");
const taskbarSource = readFileSync("client/src/components/layout/Taskbar.tsx", "utf8");
const wimSource = readFileSync("client/src/pages/Wim.tsx", "utf8");
const boardSource = readFileSync("client/src/pages/MessageBoard.tsx", "utf8");
const liveRoomSource = readFileSync("client/src/features/wtf-live/WtfLivePublicRoom.tsx", "utf8");

test("Calendar route exposes a Gamma-aware presentation boundary", () => {
  assert.match(calendarSource, /usePresentationShell/);
  assert.match(calendarSource, /data-calendar-presentation-host=\{presentation\.host\}/);
  assert.match(calendarSource, /data-calendar-surface="calendar"/);
  assert.match(calendarSource, /data-calendar-active-tab=\{tab\}/);
  assert.match(calendarSource, /\[data-calendar-presentation-host="gamma"\]/);
});

test("Calendar has an OS-priority tray reminder and modern calendar workspace", () => {
  assert.match(taskbarSource, /data-calendar-tray="true"/);
  assert.match(taskbarSource, /data-calendar-reminder-popup/);
  assert.match(taskbarSource, /selectCalendarReminder/);
  assert.match(taskbarSource, /wm\.openPage\("\/calendar"\)/);
  assert.match(calendarSource, /data-calendar-region="calendar-grid"/);
  assert.match(calendarSource, /data-calendar-view=\{view\}/);
  assert.match(calendarSource, /type CalendarView = "day" \| "week" \| "month" \| "agenda"/);
  assert.match(calendarSource, /data-calendar-region="date-navigation"/);
  assert.match(calendarSource, /Previous \$\{view\}/);
  assert.match(calendarSource, /Next \$\{view\}/);
  assert.match(calendarSource, /data-calendar-region="month-day"/);
  assert.match(calendarSource, /Create event/);
});

test("communications surfaces expose narrow calendar handoffs", () => {
  assert.match(wimSource, /data-wim-calendar-handoff="true"/);
  assert.match(boardSource, /data-messageboard-calendar-handoff=\{ch\.id\}/);
  assert.match(liveRoomSource, /data-wtf-live-room-calendar-handoff=\{room\.id\}/);
  assert.match(calendarSource, /takeCalendarHandoff/);
  assert.match(calendarSource, /params\.get\("compose"\) === "personal"/);
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
