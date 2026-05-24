const DEFAULT_TTC_ICAL_URL = "https://thetezos.com/?mec-ical-feed=1";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3500;

export interface TtcCalendarEvent {
  id: string;
  kind: "custom";
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  sourceKind: "ttc";
  sourceId: null;
  sourceProvider: "ttc";
  sourceRank: number;
  visibility: "public";
  status: "published";
  linksJson: Array<{ label: string; url: string }>;
  location: string | null;
  categories: string[];
  imageUrl: string | null;
  externalId: string;
}

interface ParsedIcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  url: string | null;
  location: string | null;
  categories: string[];
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  rrule: Record<string, string> | null;
}

let cache:
  | {
      fetchedAt: number;
      events: ParsedIcsEvent[];
    }
  | null = null;

function unfoldIcsLines(text: string): string[] {
  const output: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if (/^[ \t]/.test(raw) && output.length > 0) {
      output[output.length - 1] += raw.slice(1);
    } else if (raw.trim()) {
      output.push(raw);
    }
  }
  return output;
}

function icsValue(line: string): { key: string; value: string } | null {
  const index = line.indexOf(":");
  if (index < 0) return null;
  const key = line.slice(0, index).split(";")[0].toUpperCase();
  return { key, value: line.slice(index + 1) };
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDate(value: string): Date | null {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(
      Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      )
    );
  }

  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(
    value
  );
  if (!dateTime) return null;
  return new Date(
    Date.UTC(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      Number(dateTime[6])
    )
  );
}

function parseRrule(value: string | null): Record<string, string> | null {
  if (!value) return null;
  return Object.fromEntries(
    value
      .split(";")
      .map((part) => part.split("="))
      .filter((part): part is [string, string] => Boolean(part[0] && part[1]))
      .map(([key, val]) => [key.toUpperCase(), val])
  );
}

function parseIcs(text: string): ParsedIcsEvent[] {
  const lines = unfoldIcsLines(text);
  const events: ParsedIcsEvent[] = [];
  let block: string[] | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      block = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (block) {
        const values = new Map<string, string>();
        for (const blockLine of block) {
          const parsed = icsValue(blockLine);
          if (parsed) values.set(parsed.key, parsed.value);
        }

        const startsAt = parseIcsDate(values.get("DTSTART") ?? "");
        if (startsAt) {
          const endsAt = parseIcsDate(values.get("DTEND") ?? "");
          const title = unescapeIcs(values.get("SUMMARY") ?? "TTC event");
          const uid = unescapeIcs(values.get("UID") ?? `${title}:${startsAt.toISOString()}`);
          const url = values.get("URL") ? unescapeIcs(values.get("URL") ?? "") : null;
          events.push({
            uid,
            summary: title,
            description: values.get("DESCRIPTION")
              ? unescapeIcs(values.get("DESCRIPTION") ?? "")
              : null,
            url,
            location: values.get("LOCATION")
              ? unescapeIcs(values.get("LOCATION") ?? "")
              : null,
            categories: (values.get("CATEGORIES") ?? "")
              .split(",")
              .map((category) => unescapeIcs(category))
              .filter(Boolean),
            imageUrl: values.get("ATTACH")
              ? unescapeIcs(values.get("ATTACH") ?? "")
              : null,
            startsAt,
            endsAt,
            allDay: /^\d{8}$/.test(values.get("DTSTART") ?? ""),
            rrule: parseRrule(values.get("RRULE") ?? null),
          });
        }
      }
      block = null;
      continue;
    }
    if (block) block.push(line);
  }

  return events;
}

function addInterval(date: Date, freq: string, interval: number): Date {
  const next = new Date(date);
  if (freq === "DAILY") next.setUTCDate(next.getUTCDate() + interval);
  else if (freq === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7 * interval);
  else if (freq === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + interval);
  else if (freq === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + interval);
  else next.setUTCDate(next.getUTCDate() + 7 * interval);
  return next;
}

function overlaps(start: Date, end: Date, from: Date, to: Date): boolean {
  return start < to && end > from;
}

function expandEvent(event: ParsedIcsEvent, from: Date, to: Date): ParsedIcsEvent[] {
  const fallbackMs = event.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const durationMs = Math.max(
    1,
    (event.endsAt?.getTime() ?? event.startsAt.getTime() + fallbackMs) -
      event.startsAt.getTime()
  );

  if (!event.rrule) {
    const end = event.endsAt ?? new Date(event.startsAt.getTime() + durationMs);
    return overlaps(event.startsAt, end, from, to) ? [event] : [];
  }

  const freq = event.rrule.FREQ ?? "WEEKLY";
  const interval = Math.max(1, Number(event.rrule.INTERVAL ?? "1"));
  const countLimit = event.rrule.COUNT ? Number(event.rrule.COUNT) : Infinity;
  const until = event.rrule.UNTIL ? parseIcsDate(event.rrule.UNTIL) : null;
  const expanded: ParsedIcsEvent[] = [];
  let occurrence = event.startsAt;

  for (let count = 0; count < countLimit && count < 5000; count += 1) {
    const end = new Date(occurrence.getTime() + durationMs);
    if (until && occurrence > until) break;
    if (overlaps(occurrence, end, from, to)) {
      expanded.push({ ...event, startsAt: occurrence, endsAt: end });
    }
    if (occurrence > to) break;
    occurrence = addInterval(occurrence, freq, interval);
  }

  return expanded;
}

async function loadTtcBaseEvents(): Promise<ParsedIcsEvent[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.events;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const url = process.env.TTC_CALENDAR_FEED_URL || DEFAULT_TTC_ICAL_URL;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "WTFCalendar/1.0 (+https://wtfgameshow.app)" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`TTC calendar returned ${response.status}`);
    }
    const events = parseIcs(await response.text());
    cache = { fetchedAt: now, events };
    return events;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadTtcCalendarEvents(
  from: Date,
  to: Date
): Promise<TtcCalendarEvent[]> {
  try {
    const baseEvents = await loadTtcBaseEvents();
    return baseEvents
      .flatMap((event) => expandEvent(event, from, to))
      .map((event) => ({
        id: `ttc:${event.uid}:${event.startsAt.toISOString()}`,
        kind: "custom" as const,
        title: event.summary,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        sourceKind: "ttc" as const,
        sourceId: null,
        sourceProvider: "ttc" as const,
        sourceRank: 100,
        visibility: "public" as const,
        status: "published" as const,
        linksJson: event.url
          ? [{ label: "TTC event", url: event.url }]
          : [],
        location: event.location,
        categories: event.categories,
        imageUrl: event.imageUrl,
        externalId: event.uid,
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 500);
  } catch (err) {
    console.warn("[calendar] TTC feed unavailable:", err);
    return [];
  }
}
