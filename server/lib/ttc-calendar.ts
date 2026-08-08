import { WTFOS_PLATFORM_ORIGIN } from "@shared/platform-branding";

const DEFAULT_TTC_ICAL_URL = "https://thetezos.com/?mec-ical-feed=1";
const DEFAULT_TTC_WORDPRESS_API_URL =
  "https://thetezos.com/wp-json/wp/v2/mec-events";
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
  sourceUrl: string | null;
  creatorName: string | null;
  creatorUrl: string | null;
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
  recurrenceFloor: Date | null;
  creatorName: string | null;
  creatorUrl: string | null;
}

let cache:
  | {
      fetchedAt: number;
      events: ParsedIcsEvent[];
      feedUrl: string;
      wordpressApiUrl: string;
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
          const startsAtRaw = values.get("DTSTART") ?? "";
          const endsAtRaw = values.get("DTEND") ?? "";
          const midnightUtcSpan = Boolean(
            endsAt &&
            /^\d{8}T000000Z$/.test(startsAtRaw) &&
            /^\d{8}T000000Z$/.test(endsAtRaw) &&
            endsAt.getTime() > startsAt.getTime() &&
            (endsAt.getTime() - startsAt.getTime()) % (24 * 60 * 60 * 1000) === 0
          );
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
            allDay: /^\d{8}$/.test(startsAtRaw) || midnightUtcSpan,
            rrule: parseRrule(values.get("RRULE") ?? null),
            recurrenceFloor: parseIcsDate(values.get("CREATED") ?? ""),
            creatorName: null,
            creatorUrl: null,
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

function subtractInterval(date: Date, freq: string, interval: number): Date {
  return addInterval(date, freq, -interval);
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

  // MEC's aggregate iCal feed advances DTSTART to the next occurrence. Rewind
  // open-ended series so a requested week still contains occurrences that
  // happened before the feed was fetched.
  if (!event.rrule.COUNT) {
    for (let count = 0; count < 5000; count += 1) {
      const previous = subtractInterval(occurrence, freq, interval);
      const previousEnd = new Date(previous.getTime() + durationMs);
      if (event.recurrenceFloor && previous < event.recurrenceFloor) break;
      if (previousEnd <= from) break;
      occurrence = previous;
    }
  }

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

function eventSlug(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "thetezos.com" && parsed.hostname !== "www.thetezos.com") {
      return null;
    }
    const match = /^\/events\/([^/]+)\/?$/.exec(parsed.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function eventWordpressId(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "thetezos.com" && parsed.hostname !== "www.thetezos.com") {
      return null;
    }
    const id = parsed.searchParams.get("p");
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function publicCreatorName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return null;
  const email = /^([^@\s]+)@[^@\s]+$/.exec(name);
  return email?.[1] ?? name;
}

async function enrichTtcCreators(
  events: ParsedIcsEvent[],
  wordpressApiUrl: string,
  signal: AbortSignal
): Promise<ParsedIcsEvent[]> {
  const slugs = [...new Set(events.map((event) => eventSlug(event.url)).filter(Boolean))] as string[];
  const ids = [...new Set(events.map((event) => eventWordpressId(event.url)).filter(Boolean))] as string[];
  if (slugs.length === 0 && ids.length === 0) return events;

  try {
    type CreatorRow = {
      id?: number;
      slug?: string;
      _embedded?: {
        author?: Array<{ name?: unknown; link?: unknown }>;
      };
    };
    const loadRows = async (
      parameter: "slug" | "include",
      values: string[]
    ): Promise<CreatorRow[]> => {
      if (values.length === 0) return [];
      const url = new URL(wordpressApiUrl);
      url.searchParams.set(parameter, values.join(","));
      url.searchParams.set("per_page", String(Math.min(100, values.length)));
      url.searchParams.set("_embed", "author");
      const response = await fetch(url, {
        headers: { "User-Agent": `WTFCalendar/1.0 (+${WTFOS_PLATFORM_ORIGIN})` },
        signal,
      });
      if (!response.ok) {
        throw new Error(`TTC event metadata returned ${response.status}`);
      }
      return await response.json() as CreatorRow[];
    };
    const rows = (
      await Promise.all([
        loadRows("slug", slugs),
        loadRows("include", ids),
      ])
    ).flat();
    const creators = new Map(
      rows.flatMap((row) => {
        const author = row._embedded?.author?.[0];
        const name = publicCreatorName(author?.name);
        const key = row.slug
          ? `slug:${row.slug}`
          : row.id
            ? `id:${row.id}`
            : null;
        if (!key || !name) return [];
        const link = typeof author?.link === "string" ? author.link : null;
        return [[key, { name, link }] as const];
      })
    );
    const verifiedRefs = new Set(
      rows.flatMap((row) => [
        ...(row.slug ? [`slug:${row.slug}`] : []),
        ...(row.id ? [`id:${row.id}`] : []),
      ])
    );

    return events.flatMap((event) => {
      const slug = eventSlug(event.url);
      const id = eventWordpressId(event.url);
      const key = slug ? `slug:${slug}` : id ? `id:${id}` : null;
      if (key && !verifiedRefs.has(key)) return [];
      const creator = slug
        ? creators.get(`slug:${slug}`)
        : id
          ? creators.get(`id:${id}`)
          : null;
      return [
        creator
          ? { ...event, creatorName: creator.name, creatorUrl: creator.link }
          : event,
      ];
    });
  } catch {
    return events;
  }
}

async function loadTtcBaseEvents(): Promise<ParsedIcsEvent[]> {
  const now = Date.now();
  const feedUrl = process.env.TTC_CALENDAR_FEED_URL || DEFAULT_TTC_ICAL_URL;
  const wordpressApiUrl =
    process.env.TTC_CALENDAR_WORDPRESS_API_URL || DEFAULT_TTC_WORDPRESS_API_URL;
  if (
    cache &&
    cache.feedUrl === feedUrl &&
    cache.wordpressApiUrl === wordpressApiUrl &&
    now - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return cache.events;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": `WTFCalendar/1.0 (+${WTFOS_PLATFORM_ORIGIN})` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`TTC calendar returned ${response.status}`);
    }
    const parsedEvents = parseIcs(await response.text());
    const shouldEnrich =
      Boolean(process.env.TTC_CALENDAR_WORDPRESS_API_URL) ||
      /^https:\/\/(?:www\.)?thetezos\.com\//i.test(feedUrl);
    const events = shouldEnrich
      ? await enrichTtcCreators(
          parsedEvents,
          wordpressApiUrl,
          controller.signal
        )
      : parsedEvents;
    cache = { fetchedAt: now, events, feedUrl, wordpressApiUrl };
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
        sourceUrl: event.url,
        creatorName: event.creatorName,
        creatorUrl: event.creatorUrl,
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 500);
  } catch (err) {
    console.warn("[calendar] TTC feed unavailable:", err);
    return [];
  }
}
