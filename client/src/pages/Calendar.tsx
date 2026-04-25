import { useMemo, useState } from "react";
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
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

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

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const EventCard = styled(GroupBox)`
  margin-bottom: 10px;
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

interface GameshowEvent {
  id: number;
  kind: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  sourceKind: string;
  sourceId: number | null;
  visibility: "public" | "contestants" | "hosts";
  status: "draft" | "published" | "cancelled";
  linksJson: Array<{ label: string; url: string }> | unknown;
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

export function Calendar() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<"today" | "week" | "season">("week");
  const [tab, setTab] = useState<"browse" | "submit" | "mine">("browse");

  const range = useMemo(() => rangeFor(view), [view]);

  const eventsQuery = useQuery<GameshowEvent[]>({
    queryKey: [
      "calendar-events",
      range.from.toISOString(),
      range.to.toISOString(),
    ],
    queryFn: () =>
      api.get<GameshowEvent[]>(
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

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStartsAt, setFormStartsAt] = useState(toIsoLocal(new Date()));
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formKind, setFormKind] = useState("custom");
  const [formVisibility, setFormVisibility] = useState<
    "public" | "contestants" | "hosts"
  >("public");
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  return (
    <AppWindow title="Calendar">
      <Stack>
        <Row>
          <Muted>
            iCal:{" "}
            <a href="/api/calendar/feed.ics" target="_blank" rel="noopener noreferrer">
              /api/calendar/feed.ics
            </a>
          </Muted>
        </Row>

        <Tabs value={tab} onChange={(v: any) => setTab(v)}>
          <Tab value="browse">Browse</Tab>
          <Tab value="submit">Submit event</Tab>
          <Tab value="mine">My tickets</Tab>
        </Tabs>

        <TabBody>
          {tab === "browse" ? (
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
              </Row>

              {eventsQuery.isLoading ? (
                <Hourglass size={24} />
              ) : (eventsQuery.data ?? []).length === 0 ? (
                <Muted>No events in this window.</Muted>
              ) : (
                (eventsQuery.data ?? []).map((e) => (
                  <EventCard key={e.id} label={e.title}>
                    <Row>
                      <KindBadge $kind={e.kind}>{e.kind}</KindBadge>
                      <Muted>
                        {new Date(e.startsAt).toLocaleString()}
                        {e.endsAt
                          ? ` → ${new Date(e.endsAt).toLocaleString()}`
                          : ""}
                      </Muted>
                      <Muted>visibility: {e.visibility}</Muted>
                    </Row>
                    {e.description ? (
                      <div style={{ marginTop: 6, fontSize: 13 }}>
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
                  </EventCard>
                ))
              )}
            </Stack>
          ) : null}

          {tab === "submit" ? (
            <Stack>
              {!user ? (
                <Muted>Sign in to submit a calendar event for review.</Muted>
              ) : (
                <>
                  <Muted>
                    Submissions are reviewed by cohosts. Approved events
                    appear in the public calendar.
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
                  {submitError ? (
                    <div
                      style={{
                        color: "#900",
                        fontWeight: "bold",
                        fontSize: 12,
                      }}
                    >
                      {submitError}
                    </div>
                  ) : null}
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
                      {submitMutation.isPending ? "Submitting…" : "Submit"}
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
                <Muted>Sign in to see your submissions.</Muted>
              ) : (myTicketsQuery.data ?? []).length === 0 ? (
                <Muted>You haven't submitted any events yet.</Muted>
              ) : (
                (myTicketsQuery.data ?? []).map((t) => (
                  <EventCard
                    key={t.id}
                    label={`${t.payloadJson?.title ?? "(untitled)"} · ${t.status}`}
                  >
                    <Row>
                      <Muted>
                        Starts:{" "}
                        {t.payloadJson?.startsAt
                          ? new Date(t.payloadJson.startsAt).toLocaleString()
                          : "—"}
                      </Muted>
                      <Muted>Kind: {t.payloadJson?.kind ?? "—"}</Muted>
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
    </AppWindow>
  );
}
