import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Hourglass,
  Select,
  Separator,
  TextInput,
  Tab,
  TabBody,
  Tabs,
  Window,
  WindowContent,
  WindowHeader,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { usePresentationShell } from "../lib/presentation-shell";
import { CALENDAR_PERSONAL_EVENTS_CHANGED, takeCalendarHandoff } from "../features/calendar/calendar-handoff";

const TTC_SUBMIT_URL = "https://thetezos.com/submit-event/";
const TTC_CALENDAR_URL = "https://thetezos.com/calendar-view/";
const TTC_X_URL = "https://x.com/TezosEvents";

const CalendarSurface = styled.div`
  &[data-calendar-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-calendar-presentation-host="gamma"],
  &[data-calendar-presentation-host="gamma"] * {
    letter-spacing: 0;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region],
  &[data-calendar-presentation-host="gamma"] fieldset,
  &[data-calendar-presentation-host="gamma"] button,
  &[data-calendar-presentation-host="gamma"] input,
  &[data-calendar-presentation-host="gamma"] textarea,
  &[data-calendar-presentation-host="gamma"] select {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-links"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="tabs"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="tab-body"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="browse-actions"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-panel"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="event-card"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="calendar-grid"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="event-detail"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ticket-card"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="personal-form"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="submit-form"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="tickets-panel"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="loading"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="empty"],
  &[data-calendar-presentation-host="gamma"] fieldset {
    background: #11110f !important;
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    border-radius: 6px !important;
    color: #f2ead9;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-links"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="browse-actions"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-panel"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="personal-form"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="submit-form"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="tickets-panel"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="loading"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="empty"] {
    padding: 10px;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="tabs"] {
    border-bottom-color: rgba(0, 210, 255, 0.34) !important;
    margin-bottom: 12px;
    padding: 8px;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="tab-body"] {
    padding: 10px;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="event-card"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="event-detail"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ticket-card"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-panel"] {
    margin-bottom: 10px;
  }

  &[data-calendar-presentation-host="gamma"] legend {
    color: #00d2ff !important;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    text-transform: uppercase;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="event-card"] > div,
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ticket-card"] > div,
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-panel"] > div,
  &[data-calendar-presentation-host="gamma"] fieldset > div {
    background: transparent !important;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-badge"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="kind-badge"] {
    background: #070706 !important;
    border: 1px solid rgba(0, 210, 255, 0.52);
    border-radius: 4px;
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12px;
    padding: 2px 6px;
    text-transform: uppercase;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="event-media"] {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    border-radius: 4px;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="event-description"] {
    color: rgba(242, 234, 217, 0.82);
    line-height: 1.45;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="field"] label {
    color: rgba(242, 234, 217, 0.72);
    font-size: 12px;
  }

  &[data-calendar-presentation-host="gamma"] button,
  &[data-calendar-presentation-host="gamma"] input,
  &[data-calendar-presentation-host="gamma"] textarea,
  &[data-calendar-presentation-host="gamma"] select {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    border-radius: 4px !important;
    color: #f2ead9 !important;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif !important;
    min-height: 32px;
  }

  &[data-calendar-presentation-host="gamma"] button[aria-selected="true"],
  &[data-calendar-presentation-host="gamma"] button[data-calendar-active="true"],
  &[data-calendar-presentation-host="gamma"] button:hover {
    border-color: rgba(0, 210, 255, 0.72) !important;
    color: #00d2ff !important;
  }

  &[data-calendar-presentation-host="gamma"] a {
    color: #00d2ff;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="meta"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="source-copy"],
  &[data-calendar-presentation-host="gamma"] [data-calendar-region="empty"] {
    color: rgba(242, 234, 217, 0.72);
    font-size: 13px;
    line-height: 1.45;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="error"] {
    color: #ff6b5f;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ttc-backdrop"] {
    background: rgba(7, 7, 6, 0.84);
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ttc-modal"] {
    background: #11110f !important;
    border: 1px solid rgba(0, 210, 255, 0.38) !important;
    border-radius: 6px !important;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ttc-header"] {
    background: #070706 !important;
    border-bottom: 1px solid rgba(0, 210, 255, 0.34) !important;
    color: #00d2ff !important;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ttc-body"] {
    background: #11110f !important;
    color: #f2ead9;
  }

  &[data-calendar-presentation-host="gamma"] [data-calendar-region="ttc-frame"] {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.18) !important;
    border-radius: 4px;
  }
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Split = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const EventCard = styled(GroupBox)`
  margin-bottom: 10px;
`;

const SourcePanel = styled(GroupBox)`
  align-self: start;
`;

const CalendarHeading = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;

  strong {
    font-size: 20px;
    line-height: 1.1;
  }

  span {
    display: block;
    color: #555;
    font-size: 12px;
  }
`;

const CalendarWorkspace = styled.div`
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid #808080;
  background: #fff;
`;

const CalendarToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

const PeriodHeading = styled.h2`
  margin: 0;
  min-width: 190px;
  font-size: 16px;
  line-height: 1.25;
  text-align: center;

  @media (max-width: 560px) {
    order: -1;
    width: 100%;
    text-align: left;
  }
`;

const WeekHeader = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${(props) => props.$columns}, minmax(96px, 1fr));
  position: sticky;
  top: 0;
  z-index: 2;
  background: #d9e8f8;
  color: #111;
  border-bottom: 1px solid #808080;
`;

const DayHeading = styled.div<{ $today?: boolean }>`
  padding: 8px 10px;
  min-height: 54px;
  border-right: 1px solid #b8c7d7;
  font-size: 12px;

  strong {
    display: block;
    margin-top: 2px;
    font-size: 18px;
    color: ${(props) => (props.$today ? "#b11919" : "#111")};
  }
`;

const WeekBody = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${(props) => props.$columns}, minmax(112px, 1fr));
  min-height: 360px;
  overflow-x: auto;
`;

const MonthGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(96px, 1fr));
  min-width: 672px;
`;

const MonthCell = styled.section<{ $today?: boolean; $outside?: boolean }>`
  min-height: 118px;
  padding: 6px;
  border-right: 1px solid #d4d4d4;
  border-bottom: 1px solid #d4d4d4;
  background: ${(props) => props.$today ? "#fff9e8" : props.$outside ? "#f1f1f1" : "#fff"};
  color: ${(props) => props.$outside ? "#666" : "#111"};
`;

const MonthDate = styled.div<{ $today?: boolean }>`
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: ${(props) => props.$today ? "#b11919" : "inherit"};
`;

const DayColumn = styled.section<{ $today?: boolean }>`
  min-width: 112px;
  padding: 7px;
  border-right: 1px solid #d4d4d4;
  background: ${(props) => (props.$today ? "#fff9e8" : "#fff")};
`;

const GridEvent = styled.button<{ $source: string }>`
  display: block;
  width: 100%;
  margin-bottom: 6px;
  padding: 6px 7px;
  text-align: left;
  border: 1px solid ${(props) => props.$source === "ttc" ? "#087d86" : props.$source === "personal" ? "#39783b" : "#315f9b"};
  border-left-width: 5px;
  background: ${(props) => props.$source === "ttc" ? "#e6f7f7" : props.$source === "personal" ? "#edf7e9" : "#eaf2ff"};
  color: #111;
  font: inherit;
  cursor: pointer;

  strong, span { display: block; }
  strong { font-size: 12px; line-height: 1.25; }
  span { margin-top: 2px; color: #444; font-size: 11px; }

  &:focus-visible { outline: 2px solid #000080; outline-offset: 1px; }
`;

const Agenda = styled.div`
  display: grid;
  gap: 8px;
  padding: 10px;
`;

const AgendaEvent = styled.div`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #d0d0d0;

  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;

const EventDetail = styled.div`
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #808080;
  background: #f7f7f7;
`;

const SourceBadge = styled.span<{ $source: string }>`
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: bold;
  background: ${(p) =>
    p.$source === "ttc" ? "#045c64" : p.$source === "personal" ? "#2d6f2f" : "#222"};
  color: white;
`;

const KindBadge = styled.span<{ $kind: string }>`
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: bold;
  background: ${(p) =>
    p.$kind === "round_window"
      ? "#663399"
      : p.$kind === "challenge_window"
        ? "#cc5500"
        : p.$kind === "side_quest_window"
          ? "#006699"
          : p.$kind === "x_space"
            ? "#0066cc"
            : p.$kind === "discord_stage"
              ? "#5865f2"
              : "#333"};
  color: white;
`;

const Muted = styled.span`
  color: #555;
  font-size: 12px;
`;

const ErrorText = styled.div`
  color: #900;
  font-weight: bold;
  font-size: 12px;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0, 0, 0, 0.4);
`;

const ModalWindow = styled(Window)`
  width: min(980px, 96vw);
  height: min(760px, 90vh);
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled(WindowHeader)`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const IframeWrap = styled.div`
  min-height: 0;
  flex: 1;
  border: 1px solid #808080;
  background: #fff;
`;

const TtcFrame = styled.iframe`
  width: 100%;
  height: 100%;
  border: 0;
`;

const KIND_OPTIONS = [
  { value: "custom", label: "Custom" },
  { value: "round_window", label: "Round window" },
  { value: "challenge_window", label: "Challenge window" },
  { value: "side_quest_window", label: "Side quest window" },
  { value: "x_space", label: "X Space" },
  { value: "discord_stage", label: "Discord stage" },
];

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "contestants", label: "Contestants" },
  { value: "hosts", label: "Hosts" },
];

interface CalendarEvent {
  id: number | string;
  kind: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  sourceKind: string;
  sourceId: number | null;
  sourceProvider?: "ttc" | "wtf" | "personal";
  sourceRank?: number;
  visibility: "public" | "contestants" | "hosts";
  status: "draft" | "published" | "cancelled";
  linksJson: Array<{ label: string; url: string }> | unknown;
  location?: string | null;
  categories?: string[];
  imageUrl?: string | null;
  externalId?: string;
}

interface PersonalEvent {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  location?: string;
}

interface MyTicket {
  id: number;
  status: string;
  reviewReason: string | null;
  decidedAt: string | null;
  publishedEventId: number | null;
  payloadJson: {
    title: string;
    description?: string;
    startsAt: string;
    endsAt?: string;
    kind: string;
    visibility: string;
  };
  createdAt: string;
}

type CalendarView = "day" | "week" | "month" | "agenda";

function toIsoLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localInputToIso(value: string, allDay = false): string {
  if (!allDay) return new Date(value).toISOString();
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function startOfDay(value: Date): Date {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

function rangeFor(view: CalendarView, anchorDate: Date): {
  from: Date;
  to: Date;
} {
  const anchor = startOfDay(anchorDate);
  if (view === "day") {
    const start = anchor;
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start, to: end };
  }
  if (view === "week") {
    const start = startOfCalendarWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start, to: end };
  }
  if (view === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfCalendarWeek(first);
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return { from: start, to: end };
  }
  const start = anchor;
  const end = new Date(anchor);
  end.setDate(end.getDate() + 180);
  return { from: start, to: end };
}

function personalStorageKey(userId?: number | string | null): string {
  return `wtf:calendar:personal:${userId ?? "guest"}`;
}

function loadPersonalEvents(key: string): PersonalEvent[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function eventEnd(event: CalendarEvent | PersonalEvent): Date {
  const start = new Date(event.startsAt);
  const end = "endsAt" in event && event.endsAt ? new Date(event.endsAt) : null;
  if (end && Number.isFinite(end.getTime())) return end;
  return new Date(start.getTime() + ((event.allDay ? 24 * 60 : 60) * 60 * 1000));
}

function inRange(event: PersonalEvent, from: Date, to: Date): boolean {
  const start = new Date(event.startsAt);
  const end = eventEnd(event);
  return start < to && end > from;
}

function formatEventTime(event: CalendarEvent): string {
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;
  if (event.allDay) {
    return end ? `${start.toLocaleDateString()} - ${end.toLocaleDateString()}` : start.toLocaleDateString();
  }
  return `${start.toLocaleString()}${end ? ` -> ${end.toLocaleString()}` : ""}`;
}

function personalToCalendarEvent(event: PersonalEvent): CalendarEvent {
  return {
    id: event.id,
    kind: "custom",
    title: event.title,
    description: event.description ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? null,
    allDay: event.allDay ?? false,
    sourceKind: "personal",
    sourceId: null,
    sourceProvider: "personal",
    sourceRank: 1,
    visibility: "public",
    status: "published",
    linksJson: [],
    location: event.location ?? null,
    categories: ["Personal"],
    imageUrl: null,
    externalId: event.id,
  };
}

function startOfCalendarWeek(value: Date): Date {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

function calendarDays(view: CalendarView, anchorDate: Date): Date[] {
  const anchor = startOfDay(anchorDate);
  if (view === "day") return [anchor];
  if (view === "agenda") return [];
  const start = view === "month"
    ? startOfCalendarWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
    : startOfCalendarWeek(anchor);
  return Array.from({ length: view === "month" ? 42 : 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    return day;
  });
}

function sameCalendarDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function calendarPeriodLabel(view: CalendarView, anchorDate: Date): string {
  const anchor = startOfDay(anchorDate);
  if (view === "day") {
    return anchor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (view === "month") {
    return anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  }
  if (view === "agenda") {
    return `Upcoming from ${anchor.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}`;
  }
  const start = startOfCalendarWeek(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startLabel = start.toLocaleDateString([], { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString([], {
    month: start.getMonth() === end.getMonth() ? undefined : "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

function moveCalendarAnchor(view: CalendarView, anchorDate: Date, direction: -1 | 1): Date {
  const next = startOfDay(anchorDate);
  if (view === "day") next.setDate(next.getDate() + direction);
  else if (view === "week") next.setDate(next.getDate() + (7 * direction));
  else if (view === "month") next.setMonth(next.getMonth() + direction, 1);
  else next.setDate(next.getDate() + (30 * direction));
  return next;
}

function eventFallsOnDay(event: CalendarEvent, day: Date): boolean {
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  const start = new Date(event.startsAt);
  const end = eventEnd(event);
  return start < next && end > day;
}

function eventClockLabel(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  return new Date(event.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function Calendar() {
  const { user } = useAuth();
  const presentation = usePresentationShell();
  const qc = useQueryClient();
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [tab, setTab] = useState<"browse" | "personal" | "submit" | "mine">("browse");
  const [showTtcSubmit, setShowTtcSubmit] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const range = useMemo(() => rangeFor(view, anchorDate), [anchorDate, view]);
  const storageKey = personalStorageKey(user?.id);
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [personalEventsReady, setPersonalEventsReady] = useState(false);

  useEffect(() => {
    setPersonalEventsReady(false);
    setPersonalEvents(loadPersonalEvents(storageKey));
    setPersonalEventsReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!personalEventsReady) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(personalEvents));
      window.dispatchEvent(new Event(CALENDAR_PERSONAL_EVENTS_CHANGED));
    } catch {
      // Local calendar entries are best-effort browser state.
    }
  }, [personalEvents, personalEventsReady, storageKey]);

  const eventsQuery = useQuery<CalendarEvent[]>({
    queryKey: [
      "calendar-events",
      range.from.toISOString(),
      range.to.toISOString(),
    ],
    queryFn: () =>
      api.get<CalendarEvent[]>(
        `/api/calendar/events?from=${encodeURIComponent(
          range.from.toISOString()
        )}&to=${encodeURIComponent(range.to.toISOString())}`
      ),
  });

  const myTicketsQuery = useQuery<MyTicket[]>({
    queryKey: ["calendar-tickets-mine"],
    queryFn: () => api.get<MyTicket[]>("/api/calendar/tickets/mine"),
    enabled: Boolean(user),
  });

  const [personalTitle, setPersonalTitle] = useState("");
  const [personalDescription, setPersonalDescription] = useState("");
  const [personalStartsAt, setPersonalStartsAt] = useState(toIsoLocal(new Date()));
  const [personalEndsAt, setPersonalEndsAt] = useState("");
  const [personalLocation, setPersonalLocation] = useState("");
  const [personalAllDay, setPersonalAllDay] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStartsAt, setFormStartsAt] = useState(toIsoLocal(new Date()));
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formKind, setFormKind] = useState("custom");
  const [formVisibility, setFormVisibility] = useState<
    "public" | "contestants" | "hosts"
  >("public");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const days = useMemo(() => calendarDays(view, anchorDate), [anchorDate, view]);
  const periodLabel = useMemo(() => calendarPeriodLabel(view, anchorDate), [anchorDate, view]);

  useEffect(() => {
    const stored = takeCalendarHandoff();
    const params = new URLSearchParams(window.location.search);
    const handoff = stored ?? (params.get("compose") === "personal" && params.get("title") ? {
      source: (params.get("source") ?? "other") as "wtf-live" | "wim" | "messageboard" | "other",
      title: params.get("title") ?? "New event",
      description: params.get("description") ?? undefined,
      location: params.get("location") ?? undefined,
    } : null);
    if (!handoff) return;
    setPersonalTitle(handoff.title);
    setPersonalDescription(handoff.description ?? "");
    setPersonalLocation(handoff.location ?? "");
    if (handoff.startsAt) setPersonalStartsAt(toIsoLocal(new Date(handoff.startsAt)));
    if (handoff.endsAt) setPersonalEndsAt(toIsoLocal(new Date(handoff.endsAt)));
    setTab("personal");
  }, []);

  const visibleEvents = useMemo(() => {
    const personal = personalEvents
      .filter((event) => inRange(event, range.from, range.to))
      .map(personalToCalendarEvent);
    return [...(eventsQuery.data ?? []), ...personal].sort((a, b) => {
      const delta = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      if (delta !== 0) return delta;
      return (b.sourceRank ?? 0) - (a.sourceRank ?? 0);
    });
  }, [eventsQuery.data, personalEvents, range.from, range.to]);

  const submitMutation = useMutation({
    mutationFn: async () =>
      api.post("/api/calendar/tickets", {
        title: formTitle,
        description: formDescription || undefined,
        startsAt: new Date(formStartsAt).toISOString(),
        endsAt: formEndsAt ? new Date(formEndsAt).toISOString() : undefined,
        allDay: false,
        kind: formKind,
        visibility: formVisibility,
      }),
    onSuccess: () => {
      setSubmitError(null);
      setFormTitle("");
      setFormDescription("");
      setFormEndsAt("");
      setTab("mine");
      qc.invalidateQueries({ queryKey: ["calendar-tickets-mine"] });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function savePersonalEvent() {
    if (!personalTitle || !personalStartsAt) return;
    setPersonalEvents((events) => [
      ...events,
      {
        id: `personal:${Date.now()}`,
        title: personalTitle,
        description: personalDescription || undefined,
        startsAt: localInputToIso(personalStartsAt, personalAllDay),
        endsAt: personalEndsAt ? localInputToIso(personalEndsAt, personalAllDay) : undefined,
        allDay: personalAllDay,
        location: personalLocation || undefined,
      },
    ]);
    setPersonalTitle("");
    setPersonalDescription("");
    setPersonalEndsAt("");
    setPersonalLocation("");
    setPersonalAllDay(false);
    setTab("browse");
  }

  function removePersonalEvent(id: string) {
    setPersonalEvents((events) => events.filter((event) => event.id !== id));
  }

  return (
    <AppWindow title="Calendar">
      <CalendarSurface
        data-calendar-presentation-host={presentation.host}
        data-calendar-surface="calendar"
        data-calendar-active-tab={tab}
      >
      <Stack data-calendar-region="shell">
        <Row data-calendar-region="source-links">
          <CalendarHeading>
            <span aria-hidden style={{ fontSize: 30 }}>📅</span>
            <div>
              <strong>WTF Calendar</strong>
              <span>Your day, the community, and what happens next.</span>
            </div>
          </CalendarHeading>
          <Muted data-calendar-region="meta">
            WTF iCal:{" "}
            <a href="/api/calendar/feed.ics" target="_blank" rel="noopener noreferrer">
              /api/calendar/feed.ics
            </a>
          </Muted>
          <Muted data-calendar-region="meta">
            TTC:{" "}
            <a href={TTC_CALENDAR_URL} target="_blank" rel="noopener noreferrer">
              calendar
            </a>
            {" / "}
            <a href={TTC_X_URL} target="_blank" rel="noopener noreferrer">
              @TezosEvents
            </a>
          </Muted>
          <Button primary style={{ marginLeft: "auto" }} onClick={() => setTab("personal")}>Create event</Button>
        </Row>

        <div data-calendar-region="tabs">
          <Tabs value={tab} onChange={(v: any) => setTab(v)}>
            <Tab value="browse">Browse</Tab>
            <Tab value="personal">Add personal</Tab>
            <Tab value="submit">Submit to WTF</Tab>
            <Tab value="mine">My tickets</Tab>
          </Tabs>
        </div>

        <TabBody data-calendar-region="tab-body">
          {tab === "browse" ? (
            <Split data-calendar-region="browse-split">
              <Stack>
                <CalendarToolbar data-calendar-region="browse-actions">
                  <Row role="group" aria-label="Calendar view">
                    {(["day", "week", "month", "agenda"] as CalendarView[]).map((calendarView) => (
                      <Button
                        key={calendarView}
                        data-calendar-active={view === calendarView ? "true" : "false"}
                        aria-pressed={view === calendarView}
                        onClick={() => setView(calendarView)}
                        primary={view === calendarView}
                      >
                        {calendarView[0].toUpperCase() + calendarView.slice(1)}
                      </Button>
                    ))}
                  </Row>
                  <Button onClick={() => setShowTtcSubmit(true)}>Submit to TTC</Button>
                </CalendarToolbar>

                <CalendarToolbar data-calendar-region="date-navigation">
                  <Button
                    aria-label={`Previous ${view}`}
                    onClick={() => setAnchorDate((current) => moveCalendarAnchor(view, current, -1))}
                  >
                    Previous
                  </Button>
                  <PeriodHeading aria-live="polite" data-calendar-region="period-label">
                    {periodLabel}
                  </PeriodHeading>
                  <Row>
                    <Button onClick={() => setAnchorDate(startOfDay(new Date()))}>Today</Button>
                    <Button
                      aria-label={`Next ${view}`}
                      onClick={() => setAnchorDate((current) => moveCalendarAnchor(view, current, 1))}
                    >
                      Next
                    </Button>
                  </Row>
                </CalendarToolbar>

                {eventsQuery.isLoading ? (
                  <div data-calendar-region="loading">
                    <Hourglass size={24} />
                  </div>
                ) : view === "agenda" ? (
                  <CalendarWorkspace data-calendar-region="calendar-grid" data-calendar-view="agenda">
                    <Agenda>
                      {visibleEvents.length === 0 ? (
                        <Muted data-calendar-region="empty">No upcoming events in this window.</Muted>
                      ) : visibleEvents.map((event) => (
                        <AgendaEvent key={`${event.sourceProvider ?? "wtf"}:${event.id}`} data-calendar-region="event-card">
                          <div><strong>{new Date(event.startsAt).toLocaleDateString([], { month: "short", day: "numeric" })}</strong><br />{eventClockLabel(event)}</div>
                          <div>
                            <Row>
                              <SourceBadge $source={event.sourceProvider ?? "wtf"} data-calendar-region="source-badge">{(event.sourceProvider ?? "wtf").toUpperCase()}</SourceBadge>
                              <strong>{event.title}</strong>
                            </Row>
                            <Muted data-calendar-region="meta">{event.location || event.categories?.join(", ") || event.kind}</Muted>
                          </div>
                        </AgendaEvent>
                      ))}
                    </Agenda>
                  </CalendarWorkspace>
                ) : view === "month" ? (
                  <CalendarWorkspace data-calendar-region="calendar-grid" data-calendar-view="month">
                    <WeekHeader $columns={7}>
                      {days.slice(0, 7).map((day) => (
                        <DayHeading key={day.toISOString()}>
                          {day.toLocaleDateString([], { weekday: "short" })}
                        </DayHeading>
                      ))}
                    </WeekHeader>
                    <MonthGrid>
                      {days.map((day) => {
                        const dayEvents = visibleEvents.filter((event) => eventFallsOnDay(event, day));
                        const isToday = sameCalendarDay(day, new Date());
                        const outsideMonth = day.getMonth() !== anchorDate.getMonth();
                        return (
                          <MonthCell
                            key={day.toISOString()}
                            $today={isToday}
                            $outside={outsideMonth}
                            aria-label={day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                            data-calendar-region="month-day"
                          >
                            <MonthDate $today={isToday}>
                              {day.getDate() === 1 ? day.toLocaleDateString([], { month: "short", day: "numeric" }) : day.getDate()}
                            </MonthDate>
                            {dayEvents.slice(0, 3).map((event) => (
                              <GridEvent
                                key={`${event.sourceProvider ?? "wtf"}:${event.id}`}
                                type="button"
                                $source={event.sourceProvider ?? "wtf"}
                                onClick={() => setSelectedEvent(event)}
                                aria-label={`${event.title}, ${formatEventTime(event)}`}
                                data-calendar-region="event-card"
                              >
                                <strong>{event.title}</strong>
                                <span>{eventClockLabel(event)}</span>
                              </GridEvent>
                            ))}
                            {dayEvents.length > 3 ? (
                              <Muted data-calendar-region="meta">+{dayEvents.length - 3} more</Muted>
                            ) : null}
                          </MonthCell>
                        );
                      })}
                    </MonthGrid>
                  </CalendarWorkspace>
                ) : (
                  <CalendarWorkspace data-calendar-region="calendar-grid" data-calendar-view={view}>
                    <WeekHeader $columns={days.length}>
                      {days.map((day) => (
                        <DayHeading key={day.toISOString()} $today={sameCalendarDay(day, new Date())}>
                          {day.toLocaleDateString([], { weekday: "short", month: view === "day" ? "short" : undefined })}
                          <strong>{day.getDate()}</strong>
                        </DayHeading>
                      ))}
                    </WeekHeader>
                    <WeekBody $columns={days.length}>
                      {days.map((day) => {
                        const events = visibleEvents.filter((event) => eventFallsOnDay(event, day));
                        return (
                          <DayColumn key={day.toISOString()} $today={sameCalendarDay(day, new Date())} aria-label={day.toLocaleDateString()}>
                            {events.length ? events.map((event) => (
                              <GridEvent
                                key={`${event.sourceProvider ?? "wtf"}:${event.id}`}
                                type="button"
                                $source={event.sourceProvider ?? "wtf"}
                                onClick={() => setSelectedEvent(event)}
                                aria-label={`${event.title}, ${formatEventTime(event)}`}
                                data-calendar-region="event-card"
                              >
                                <strong>{event.title}</strong>
                                <span>{eventClockLabel(event)}</span>
                              </GridEvent>
                            )) : <Muted data-calendar-region="meta">No events</Muted>}
                          </DayColumn>
                        );
                      })}
                    </WeekBody>
                  </CalendarWorkspace>
                )}

                {selectedEvent ? (
                  <EventDetail data-calendar-region="event-detail">
                    <Row>
                      <SourceBadge $source={selectedEvent.sourceProvider ?? "wtf"} data-calendar-region="source-badge">{(selectedEvent.sourceProvider ?? "wtf").toUpperCase()}</SourceBadge>
                      <KindBadge $kind={selectedEvent.kind} data-calendar-region="kind-badge">{selectedEvent.kind}</KindBadge>
                      <Button size="sm" style={{ marginLeft: "auto" }} onClick={() => setSelectedEvent(null)}>Close details</Button>
                    </Row>
                    <h3>{selectedEvent.title}</h3>
                    <Muted data-calendar-region="meta">{formatEventTime(selectedEvent)}{selectedEvent.location ? ` · ${selectedEvent.location}` : ""}</Muted>
                    {selectedEvent.description ? <p data-calendar-region="event-description">{selectedEvent.description}</p> : null}
                    {selectedEvent.sourceProvider === "personal" ? <Button size="sm" onClick={() => removePersonalEvent(String(selectedEvent.id))}>Remove personal event</Button> : null}
                  </EventDetail>
                ) : null}
              </Stack>

              <div data-calendar-region="source-panel">
                <SourcePanel label="Sources">
                  <Stack>
                    <Muted data-calendar-region="source-copy">TTC events are pulled from TheTezosCommunity iCal feed and ranked above WTF entries when duplicates share the same title and start time.</Muted>
                    <Muted data-calendar-region="source-copy">WTF entries come from approved WTF calendar tickets and staff-created events.</Muted>
                    <Muted data-calendar-region="source-copy">Personal entries stay in this browser profile only.</Muted>
                    <Separator />
                    <Button onClick={() => setTab("personal")}>Add personal entry</Button>
                    <Button onClick={() => setTab("submit")}>Submit to WTF</Button>
                    <Button onClick={() => setShowTtcSubmit(true)}>Submit to TTC</Button>
                  </Stack>
                </SourcePanel>
              </div>
            </Split>
          ) : null}

          {tab === "personal" ? (
            <Stack data-calendar-region="personal-form">
              <Muted data-calendar-region="meta">Personal entries appear only in your WTFos calendar view.</Muted>
              <Field data-calendar-region="field">
                <label>Title</label>
                <TextInput
                  value={personalTitle}
                  onChange={(e: any) => setPersonalTitle(e.target.value)}
                  fullWidth
                />
              </Field>
              <Field data-calendar-region="field">
                <label>Description</label>
                <TextInput
                  value={personalDescription}
                  onChange={(e: any) => setPersonalDescription(e.target.value)}
                  multiline
                  fullWidth
                />
              </Field>
              <Field data-calendar-region="field">
                <label>
                  <input
                    type="checkbox"
                    checked={personalAllDay}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setPersonalAllDay(checked);
                      setPersonalStartsAt((value) => checked ? value.slice(0, 10) : `${value.slice(0, 10)}T09:00`);
                      setPersonalEndsAt((value) => !value ? "" : checked ? value.slice(0, 10) : `${value.slice(0, 10)}T10:00`);
                    }}
                  />{" "}
                  All-day event
                </label>
              </Field>
              <Field data-calendar-region="field">
                <label>{personalAllDay ? "Date" : "Starts at (local)"}</label>
                <TextInput
                  type={personalAllDay ? "date" : "datetime-local"}
                  value={personalStartsAt}
                  onChange={(e: any) => setPersonalStartsAt(e.target.value)}
                  fullWidth
                />
              </Field>
              <Field data-calendar-region="field">
                <label>Ends at (optional)</label>
                <TextInput
                  type={personalAllDay ? "date" : "datetime-local"}
                  value={personalEndsAt}
                  onChange={(e: any) => setPersonalEndsAt(e.target.value)}
                  fullWidth
                />
              </Field>
              <Field data-calendar-region="field">
                <label>Place or stream</label>
                <TextInput
                  value={personalLocation}
                  onChange={(e: any) => setPersonalLocation(e.target.value)}
                  fullWidth
                />
              </Field>
              <Row data-calendar-region="form-actions">
                <Button primary disabled={!personalTitle || !personalStartsAt} onClick={savePersonalEvent}>
                  Add to my view
                </Button>
              </Row>
            </Stack>
          ) : null}

          {tab === "submit" ? (
            <Stack data-calendar-region="submit-form">
              <Row data-calendar-region="form-actions">
                <Button onClick={() => setShowTtcSubmit(true)}>Submit to TTC</Button>
                <Muted data-calendar-region="meta">TTC is the Tezos source of truth; WTF submissions stay in the WTF review queue.</Muted>
              </Row>
              {!user ? (
                <Muted data-calendar-region="empty">Sign in to submit a WTF calendar event for review.</Muted>
              ) : (
                <>
                  <Muted data-calendar-region="meta">
                    WTF submissions are reviewed by cohosts. Approved events
                    appear in the public WTF calendar layer.
                  </Muted>
                  <Field data-calendar-region="field">
                    <label>Title</label>
                    <TextInput
                      value={formTitle}
                      onChange={(e: any) => setFormTitle(e.target.value)}
                      fullWidth
                    />
                  </Field>
                  <Field data-calendar-region="field">
                    <label>Description</label>
                    <TextInput
                      value={formDescription}
                      onChange={(e: any) =>
                        setFormDescription(e.target.value)
                      }
                      multiline
                      fullWidth
                    />
                  </Field>
                  <Field data-calendar-region="field">
                    <label>Starts at (local)</label>
                    <TextInput
                      type="datetime-local"
                      value={formStartsAt}
                      onChange={(e: any) => setFormStartsAt(e.target.value)}
                      fullWidth
                    />
                  </Field>
                  <Field data-calendar-region="field">
                    <label>Ends at (optional)</label>
                    <TextInput
                      type="datetime-local"
                      value={formEndsAt}
                      onChange={(e: any) => setFormEndsAt(e.target.value)}
                      fullWidth
                    />
                  </Field>
                  <Field data-calendar-region="field">
                    <label>Kind</label>
                    <Select
                      value={formKind}
                      options={KIND_OPTIONS}
                      onChange={(e: any) => setFormKind(e.value)}
                      width={240}
                    />
                  </Field>
                  <Field data-calendar-region="field">
                    <label>Visibility</label>
                    <Select
                      value={formVisibility}
                      options={VISIBILITY_OPTIONS}
                      onChange={(e: any) => setFormVisibility(e.value)}
                      width={240}
                    />
                  </Field>
                  {submitError ? <ErrorText data-calendar-region="error">{submitError}</ErrorText> : null}
                  <Row data-calendar-region="form-actions">
                    <Button
                      primary
                      disabled={
                        submitMutation.isPending ||
                        !formTitle ||
                        !formStartsAt
                      }
                      onClick={() => submitMutation.mutate()}
                    >
                      {submitMutation.isPending ? "Submitting..." : "Submit to WTF"}
                    </Button>
                  </Row>
                </>
              )}
            </Stack>
          ) : null}

          {tab === "mine" ? (
            <Stack data-calendar-region="tickets-panel">
              {myTicketsQuery.isLoading ? (
                <div data-calendar-region="loading">
                  <Hourglass size={24} />
                </div>
              ) : !user ? (
                <Muted data-calendar-region="empty">Sign in to see your WTF submissions.</Muted>
              ) : (myTicketsQuery.data ?? []).length === 0 ? (
                <Muted data-calendar-region="empty">You have not submitted any WTF events yet.</Muted>
              ) : (
                (myTicketsQuery.data ?? []).map((t) => (
                  <div key={t.id} data-calendar-region="ticket-card">
                    <EventCard
                      label={`${t.payloadJson?.title ?? "(untitled)"} - ${t.status}`}
                    >
                      <Row>
                        <Muted data-calendar-region="meta">
                          Starts:{" "}
                          {t.payloadJson?.startsAt
                            ? new Date(t.payloadJson.startsAt).toLocaleString()
                            : "-"}
                        </Muted>
                        <Muted data-calendar-region="meta">Kind: {t.payloadJson?.kind ?? "-"}</Muted>
                      </Row>
                      {t.reviewReason ? (
                        <>
                          <Separator />
                          <Muted data-calendar-region="meta">Reviewer: {t.reviewReason}</Muted>
                        </>
                      ) : null}
                      {t.publishedEventId ? (
                        <Muted data-calendar-region="meta">
                          Published as event #{t.publishedEventId}
                        </Muted>
                      ) : null}
                    </EventCard>
                  </div>
                ))
              )}
            </Stack>
          ) : null}
        </TabBody>
      </Stack>

      {showTtcSubmit ? (
        <ModalBackdrop data-calendar-region="ttc-backdrop" onClick={() => setShowTtcSubmit(false)}>
          <ModalWindow data-calendar-region="ttc-modal" onClick={(e: any) => e.stopPropagation()}>
            <ModalHeader data-calendar-region="ttc-header">
              <span>Submit event to TTC</span>
              <Button size="sm" onClick={() => setShowTtcSubmit(false)}>
                X
              </Button>
            </ModalHeader>
            <WindowContent
              data-calendar-region="ttc-body"
              style={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <Row>
                <Muted data-calendar-region="meta">
                  This submits directly to TheTezosCommunity. WTF does not write to TTC.
                </Muted>
                <a href={TTC_SUBMIT_URL} target="_blank" rel="noopener noreferrer">
                  Open in new tab
                </a>
              </Row>
              <IframeWrap data-calendar-region="ttc-frame">
                <TtcFrame
                  title="Submit event to TheTezosCommunity"
                  src={TTC_SUBMIT_URL}
                  sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                />
              </IframeWrap>
            </WindowContent>
          </ModalWindow>
        </ModalBackdrop>
      ) : null}
      </CalendarSurface>
    </AppWindow>
  );
}
