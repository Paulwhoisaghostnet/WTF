export const CALENDAR_HANDOFF_KEY = "wtf:calendar:handoff";
export const CALENDAR_PERSONAL_EVENTS_CHANGED = "wtf:calendar:personal-events-changed";

export type CalendarHandoff = {
  source: "wtf-live" | "wim" | "messageboard" | "other";
  title: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
};

export function storeCalendarHandoff(handoff: CalendarHandoff): void {
  try {
    window.sessionStorage.setItem(CALENDAR_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // A blocked session store should not block opening Calendar.
  }
}

export function takeCalendarHandoff(): CalendarHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(CALENDAR_HANDOFF_KEY);
    window.sessionStorage.removeItem(CALENDAR_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CalendarHandoff;
    return parsed && typeof parsed.title === "string" ? parsed : null;
  } catch {
    return null;
  }
}
