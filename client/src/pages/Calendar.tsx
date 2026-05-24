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

const TTC_SUBMIT_URL = "https://thetezos.com/submit-event/";
const TTC_CALENDAR_URL = "https://thetezos.com/calendar-view/";
const TTC_X_URL = "https://x.com/TezosEvents";

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
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
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

const PreviewImage = styled.img`
  width: 54px;
  height: 54px;
  object-fit: cover;
  border: 1px solid #808080;
  background: #fff;
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

function toIsoLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function rangeFor(view: "today" | "week" | "season"): {
  from: Date;
  to: Date;
} {
  const now = new Date();
  if (view === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start, to: end };
  }
  if (view === "week") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start, to: end };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
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

export function Calendar() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<"today" | "week" | "season">("week");
  const [tab, setTab] = useState<"browse" | "personal" | "submit" | "mine">("browse");
  const [showTtcSubmit, setShowTtcSubmit] = useState(false);

  const range = useMemo(() => rangeFor(view), [view]);
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

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStartsAt, setFormStartsAt] = useState(toIsoLocal(new Date()));
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formKind, setFormKind] = useState("custom");
  const [formVisibility, setFormVisibility] = useState<
    "public" | "contestants" | "hosts"
  >("public");
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        startsAt: new Date(personalStartsAt).toISOString(),
        endsAt: personalEndsAt ? new Date(personalEndsAt).toISOString() : undefined,
        location: personalLocation || undefined,
      },
    ]);
    setPersonalTitle("");
    setPersonalDescription("");
    setPersonalEndsAt("");
    setPersonalLocation("");
    setTab("browse");
  }

  function removePersonalEvent(id: string) {
    setPersonalEvents((events) => events.filter((event) => event.id !== id));
  }

  return (
    <AppWindow title="Calendar">
      <Stack>
        <Row>
          <Muted>
            WTF iCal:{" "}
            <a href="/api/calendar/feed.ics" target="_blank" rel="noopener noreferrer">
              /api/calendar/feed.ics
            </a>
          </Muted>
          <Muted>
            TTC:{" "}
            <a href={TTC_CALENDAR_URL} target="_blank" rel="noopener noreferrer">
              calendar
            </a>
            {" / "}
            <a href={TTC_X_URL} target="_blank" rel="noopener noreferrer">
              @TezosEvents
            </a>
          </Muted>
        </Row>

        <Tabs value={tab} onChange={(v: any) => setTab(v)}>
          <Tab value="browse">Browse</Tab>
          <Tab value="personal">Add personal</Tab>
          <Tab value="submit">Submit to WTF</Tab>
          <Tab value="mine">My tickets</Tab>
        </Tabs>

        <TabBody>
          {tab === "browse" ? (
            <Split>
              <Stack>
                <Row>
                  <Button
                    onClick={() => setView("today")}
                    primary={view === "today"}
                  >
                    Today
                  </Button>
                  <Button
                    onClick={() => setView("week")}
                    primary={view === "week"}
                  >
                    This week
                  </Button>
                  <Button
                    onClick={() => setView("season")}
                    primary={view === "season"}
                  >
                    This season
                  </Button>
                  <Button onClick={() => setShowTtcSubmit(true)}>
                    Submit to TTC
                  </Button>
                </Row>

                {eventsQuery.isLoading ? (
                  <Hourglass size={24} />
                ) : visibleEvents.length === 0 ? (
                  <Muted>No events in this window.</Muted>
                ) : (
                  visibleEvents.map((e) => (
                    <EventCard key={`${e.sourceProvider ?? "wtf"}:${e.id}`} label={e.title}>
                      <Row>
                        {e.imageUrl ? <PreviewImage src={e.imageUrl} alt="" /> : null}
                        <Stack>
                          <Row>
                            <SourceBadge $source={e.sourceProvider ?? "wtf"}>
                              {(e.sourceProvider ?? "wtf").toUpperCase()}
                            </SourceBadge>
                            <KindBadge $kind={e.kind}>{e.kind}</KindBadge>
                            <Muted>{formatEventTime(e)}</Muted>
                          </Row>
                          <Row>
                            <Muted>visibility: {e.visibility}</Muted>
                            {e.location ? <Muted>place: {e.location}</Muted> : null}
                            {e.categories?.length ? (
                              <Muted>{e.categories.join(", ")}</Muted>
                            ) : null}
                          </Row>
                        </Stack>
                      </Row>
                      {e.description ? (
                        <div style={{ marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>
                          {e.description}
                        </div>
                      ) : null}
                      {Array.isArray(e.linksJson) && e.linksJson.length > 0 ? (
                        <div style={{ marginTop: 6 }}>
                          {(e.linksJson as Array<{
                            label: string;
                            url: string;
                          }>).map((l) => (
                            <div key={l.url}>
                              <a href={l.url} target="_blank" rel="noopener noreferrer">
                                {l.label}
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {e.sourceProvider === "personal" ? (
                        <Row style={{ marginTop: 8 }}>
                          <Button size="sm" onClick={() => removePersonalEvent(String(e.id))}>
                            Remove
                          </Button>
                        </Row>
                      ) : null}
                    </EventCard>
                  ))
                )}
              </Stack>

              <SourcePanel label="Sources">
                <Stack>
                  <Muted>TTC events are pulled from TheTezosCommunity iCal feed and ranked above WTF entries when duplicates share the same title and start time.</Muted>
                  <Muted>WTF entries come from approved WTF calendar tickets and staff-created events.</Muted>
                  <Muted>Personal entries stay in this browser profile only.</Muted>
                  <Separator />
                  <Button onClick={() => setTab("personal")}>Add personal entry</Button>
                  <Button onClick={() => setTab("submit")}>Submit to WTF</Button>
                  <Button onClick={() => setShowTtcSubmit(true)}>Submit to TTC</Button>
                </Stack>
              </SourcePanel>
            </Split>
          ) : null}

          {tab === "personal" ? (
            <Stack>
              <Muted>Personal entries appear only in your WTFos calendar view.</Muted>
              <Field>
                <label>Title</label>
                <TextInput
                  value={personalTitle}
                  onChange={(e: any) => setPersonalTitle(e.target.value)}
                  fullWidth
                />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput
                  value={personalDescription}
                  onChange={(e: any) => setPersonalDescription(e.target.value)}
                  multiline
                  fullWidth
                />
              </Field>
              <Field>
                <label>Starts at (local)</label>
                <TextInput
                  type="datetime-local"
                  value={personalStartsAt}
                  onChange={(e: any) => setPersonalStartsAt(e.target.value)}
                  fullWidth
                />
              </Field>
              <Field>
                <label>Ends at (optional)</label>
                <TextInput
                  type="datetime-local"
                  value={personalEndsAt}
                  onChange={(e: any) => setPersonalEndsAt(e.target.value)}
                  fullWidth
                />
              </Field>
              <Field>
                <label>Place or stream</label>
                <TextInput
                  value={personalLocation}
                  onChange={(e: any) => setPersonalLocation(e.target.value)}
                  fullWidth
                />
              </Field>
              <Row>
                <Button primary disabled={!personalTitle || !personalStartsAt} onClick={savePersonalEvent}>
                  Add to my view
                </Button>
              </Row>
            </Stack>
          ) : null}

          {tab === "submit" ? (
            <Stack>
              <Row>
                <Button onClick={() => setShowTtcSubmit(true)}>Submit to TTC</Button>
                <Muted>TTC is the Tezos source of truth; WTF submissions stay in the WTF review queue.</Muted>
              </Row>
              {!user ? (
                <Muted>Sign in to submit a WTF calendar event for review.</Muted>
              ) : (
                <>
                  <Muted>
                    WTF submissions are reviewed by cohosts. Approved events
                    appear in the public WTF calendar layer.
                  </Muted>
                  <Field>
                    <label>Title</label>
                    <TextInput
                      value={formTitle}
                      onChange={(e: any) => setFormTitle(e.target.value)}
                      fullWidth
                    />
                  </Field>
                  <Field>
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
                  <Field>
                    <label>Starts at (local)</label>
                    <TextInput
                      type="datetime-local"
                      value={formStartsAt}
                      onChange={(e: any) => setFormStartsAt(e.target.value)}
                      fullWidth
                    />
                  </Field>
                  <Field>
                    <label>Ends at (optional)</label>
                    <TextInput
                      type="datetime-local"
                      value={formEndsAt}
                      onChange={(e: any) => setFormEndsAt(e.target.value)}
                      fullWidth
                    />
                  </Field>
                  <Field>
                    <label>Kind</label>
                    <Select
                      value={formKind}
                      options={KIND_OPTIONS}
                      onChange={(e: any) => setFormKind(e.value)}
                      width={240}
                    />
                  </Field>
                  <Field>
                    <label>Visibility</label>
                    <Select
                      value={formVisibility}
                      options={VISIBILITY_OPTIONS}
                      onChange={(e: any) => setFormVisibility(e.value)}
                      width={240}
                    />
                  </Field>
                  {submitError ? <ErrorText>{submitError}</ErrorText> : null}
                  <Row>
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
            <Stack>
              {myTicketsQuery.isLoading ? (
                <Hourglass size={24} />
              ) : !user ? (
                <Muted>Sign in to see your WTF submissions.</Muted>
              ) : (myTicketsQuery.data ?? []).length === 0 ? (
                <Muted>You have not submitted any WTF events yet.</Muted>
              ) : (
                (myTicketsQuery.data ?? []).map((t) => (
                  <EventCard
                    key={t.id}
                    label={`${t.payloadJson?.title ?? "(untitled)"} - ${t.status}`}
                  >
                    <Row>
                      <Muted>
                        Starts:{" "}
                        {t.payloadJson?.startsAt
                          ? new Date(t.payloadJson.startsAt).toLocaleString()
                          : "-"}
                      </Muted>
                      <Muted>Kind: {t.payloadJson?.kind ?? "-"}</Muted>
                    </Row>
                    {t.reviewReason ? (
                      <>
                        <Separator />
                        <Muted>Reviewer: {t.reviewReason}</Muted>
                      </>
                    ) : null}
                    {t.publishedEventId ? (
                      <Muted>
                        Published as event #{t.publishedEventId}
                      </Muted>
                    ) : null}
                  </EventCard>
                ))
              )}
            </Stack>
          ) : null}
        </TabBody>
      </Stack>

      {showTtcSubmit ? (
        <ModalBackdrop onClick={() => setShowTtcSubmit(false)}>
          <ModalWindow onClick={(e: any) => e.stopPropagation()}>
            <ModalHeader>
              <span>Submit event to TTC</span>
              <Button size="sm" onClick={() => setShowTtcSubmit(false)}>
                X
              </Button>
            </ModalHeader>
            <WindowContent style={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <Row>
                <Muted>
                  This submits directly to TheTezosCommunity. WTF does not write to TTC.
                </Muted>
                <a href={TTC_SUBMIT_URL} target="_blank" rel="noopener noreferrer">
                  Open in new tab
                </a>
              </Row>
              <IframeWrap>
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
    </AppWindow>
  );
}
