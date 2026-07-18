export type ReminderEvent = {
  id: string | number;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  sourceProvider?: string;
};

export type CalendarReminder = {
  id: string;
  eventKey: string;
  event: ReminderEvent;
  trigger: "today" | "day" | "six-hours" | "hour" | "start";
  triggerAt: number;
  label: string;
};

const HOUR = 60 * 60 * 1000;
const TRIGGERS = [
  { trigger: "day", offset: 24 * HOUR, label: "Starts tomorrow" },
  { trigger: "six-hours", offset: 6 * HOUR, label: "Starts in 6 hours" },
  { trigger: "hour", offset: HOUR, label: "Starts in 1 hour" },
  { trigger: "start", offset: 0, label: "Starting now" },
] as const;

export function calendarEventKey(event: ReminderEvent): string {
  return `${event.sourceProvider ?? "wtf"}:${event.id}:${event.startsAt}`;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function dueCalendarReminder(
  event: ReminderEvent,
  now = new Date(),
): CalendarReminder | null {
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) return null;
  const key = calendarEventKey(event);

  if (event.allDay) {
    if (!isSameLocalDay(start, now)) return null;
    const triggerAt = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return {
      id: `${key}:today`,
      eventKey: key,
      event,
      trigger: "today",
      triggerAt,
      label: "Happening today",
    };
  }

  const nowMs = now.getTime();
  const startMs = start.getTime();
  // Keep today's start reminder recoverable at login, but do not revive old events.
  if (nowMs > startMs && !isSameLocalDay(start, now)) return null;

  const due = TRIGGERS
    .map((item) => ({ ...item, triggerAt: startMs - item.offset }))
    .filter((item) => item.triggerAt <= nowMs)
    .sort((a, b) => b.triggerAt - a.triggerAt)[0];
  if (!due) return null;
  return {
    id: `${key}:${due.trigger}`,
    eventKey: key,
    event,
    trigger: due.trigger,
    triggerAt: due.triggerAt,
    label: due.label,
  };
}

export function selectCalendarReminder(
  events: ReminderEvent[],
  viewedIds: ReadonlySet<string>,
  now = new Date(),
): CalendarReminder | null {
  const candidates = events
    .map((event) => dueCalendarReminder(event, now))
    .filter((item): item is CalendarReminder => Boolean(item))
    .filter((item) => !viewedIds.has(item.id));

  // One tray popup at a time. The newest due threshold wins globally and,
  // naturally, replaces an older unviewed threshold for the same event.
  candidates.sort((a, b) => b.triggerAt - a.triggerAt);
  return candidates[0] ?? null;
}

export function reminderViewedStorageKey(userId?: number | string | null): string {
  return `wtf:calendar:reminders:viewed:${userId ?? "guest"}`;
}

export function readViewedReminderIds(key: string): Set<string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeViewedReminderIds(key: string, ids: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids).slice(-500)));
  } catch {
    // Reminder history is best-effort browser state.
  }
}
