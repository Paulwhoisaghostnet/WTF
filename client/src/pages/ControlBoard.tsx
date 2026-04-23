import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import {
  Button,
  GroupBox,
  Select,
  TextInput,
  Tabs,
  Tab,
  TabBody,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Hourglass,
} from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { UserLink } from "../components/UserLink";

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

const Muted = styled.span`
  color: #555;
  font-size: 12px;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const ModalBody = styled.div`
  background: #c3c3c3;
  border: 2px solid #000;
  box-shadow: 4px 4px 0 #000;
  padding: 16px;
  max-width: 420px;
  width: 92%;
`;

const RULE_KINDS = [
  { value: "manual", label: "Manual — operator adds rows directly" },
  { value: "bottom_n_by_wtf", label: "Bottom N by WTF balance" },
  { value: "top_n_survive", label: "Top N survive (rest drafted out)" },
  { value: "did_not_hold_token", label: "Did not hold required token" },
  { value: "submission_rank", label: "Submission rank (graded)" },
  { value: "team_rank", label: "Team rank" },
] as const;

type RuleKind = (typeof RULE_KINDS)[number]["value"];

interface Season {
  id: number;
  name: string;
  number: number;
  status: string;
}

interface Round {
  id: number;
  seasonId: number;
  number: number;
  name: string;
  status: string;
}

interface Contestant {
  id: number;
  userId: number;
  username: string;
  displayName: string | null;
  status:
    | "active"
    | "reserve"
    | "eliminated"
    | "withdrew"
    | "non_participant";
  rankAtLock: number | null;
  eliminatedAt: string | null;
  eliminatedRoundId: number | null;
  eliminationReason: string | null;
  notes: string | null;
}

interface OperatorAction {
  id: number;
  actorUserId: number | null;
  actorUsername: string | null;
  actionKind: string;
  targetKind: string;
  targetId: number | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
}

interface DraftElimination {
  id: number;
  roundId: number;
  userId: number;
  username: string;
  wasDraftedByRule: boolean;
  draftRuleKind: RuleKind | null;
  reason: string | null;
  decidedAt: string | null;
  decidedBy: number | null;
}

interface ControlBoardFeed {
  feed: OperatorAction[];
  drafts: DraftElimination[];
}

export function ControlBoard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<
    "cohort" | "round" | "tickets" | "audit" | "test" | "season3"
  >("cohort");
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [eliminateTarget, setEliminateTarget] = useState<Contestant | null>(
    null
  );

  const seasonsQuery = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => api.get<Season[]>("/api/seasons"),
  });

  const activeSeasonId =
    selectedSeasonId ??
    seasonsQuery.data?.find((s) => s.status === "active")?.id ??
    seasonsQuery.data?.[0]?.id ??
    null;

  const roundsQuery = useQuery<Round[]>({
    queryKey: ["/api/rounds", activeSeasonId],
    queryFn: () =>
      api.get<Round[]>(
        `/api/rounds?seasonId=${encodeURIComponent(String(activeSeasonId))}`
      ),
    enabled: activeSeasonId !== null,
  });

  const contestantsQuery = useQuery<Contestant[]>({
    queryKey: ["/api/seasons", activeSeasonId, "contestants"],
    queryFn: () =>
      api.get<Contestant[]>(
        `/api/seasons/${encodeURIComponent(String(activeSeasonId))}/contestants`
      ),
    enabled: activeSeasonId !== null,
  });

  const feedQuery = useQuery<ControlBoardFeed>({
    queryKey: ["/api/control-board/feed", activeSeasonId],
    queryFn: () =>
      api.get<ControlBoardFeed>(
        activeSeasonId
          ? `/api/control-board/feed?limit=200&seasonId=${activeSeasonId}`
          : "/api/control-board/feed?limit=200"
      ),
    refetchInterval: 15_000,
  });

  const eliminateMutation = useMutation({
    mutationFn: async (payload: {
      contestantId: number;
      confirmationUsername: string;
      roundId?: number | null;
      reason?: string;
      overrideReason?: string;
    }) =>
      api.post<{ ok: true; contestantId: number; eliminationId: number | null }>(
        `/api/contestants/${payload.contestantId}/eliminate`,
        {
          confirmationUsername: payload.confirmationUsername,
          roundId: payload.roundId ?? undefined,
          reason: payload.reason,
          overrideReason: payload.overrideReason,
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons"] });
      qc.invalidateQueries({ queryKey: ["/api/control-board/feed"] });
      setEliminateTarget(null);
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (contestantId: number) =>
      api.post<Contestant>(
        `/api/contestants/${contestantId}/promote-from-reserve`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons"] });
      qc.invalidateQueries({ queryKey: ["/api/control-board/feed"] });
    },
  });

  const runRuleMutation = useMutation({
    mutationFn: async (roundId: number) =>
      api.post<{ drafted: number; targetUserIds: number[] }>(
        `/api/rounds/${roundId}/run-rule`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/control-board/feed"] });
    },
  });

  const advanceRoundMutation = useMutation({
    mutationFn: async (roundId: number) =>
      api.post<Round>(`/api/rounds/${roundId}/advance`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rounds"] });
      qc.invalidateQueries({ queryKey: ["/api/control-board/feed"] });
    },
  });

  const upsertRuleMutation = useMutation({
    mutationFn: async (payload: {
      roundId: number;
      kind: RuleKind;
      params: Record<string, unknown>;
    }) =>
      api.put(`/api/rounds/${payload.roundId}/elimination-rule`, {
        kind: payload.kind,
        paramsJson: payload.params,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/control-board/feed"] });
    },
  });

  const activeContestants = useMemo(
    () =>
      (contestantsQuery.data ?? []).filter((c) => c.status === "active"),
    [contestantsQuery.data]
  );
  const reserveContestants = useMemo(
    () =>
      (contestantsQuery.data ?? []).filter((c) => c.status === "reserve"),
    [contestantsQuery.data]
  );
  const eliminatedContestants = useMemo(
    () =>
      (contestantsQuery.data ?? []).filter((c) => c.status === "eliminated"),
    [contestantsQuery.data]
  );

  const currentRound = useMemo(
    () =>
      (roundsQuery.data ?? []).find((r) => r.id === selectedRoundId) ??
      (roundsQuery.data ?? []).find((r) => r.status === "active") ??
      null,
    [roundsQuery.data, selectedRoundId]
  );

  const draftsForRound = useMemo(() => {
    if (!currentRound) return [];
    return (feedQuery.data?.drafts ?? []).filter(
      (d) => d.roundId === currentRound.id && d.decidedAt === null
    );
  }, [feedQuery.data, currentRound]);

  const canAdvance = draftsForRound.length === 0;

  if (seasonsQuery.isLoading) {
    return (
      <AppWindow title="Control Board">
        <Stack>
          <Hourglass size={24} />
          <Muted>Loading seasons...</Muted>
        </Stack>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Control Board">
      <Stack>
        <Row>
          <Muted>Season:</Muted>
          <Select<number>
            options={
              (seasonsQuery.data ?? []).map((s) => ({
                value: s.id,
                label: `#${s.number} — ${s.name}`,
              })) ?? []
            }
            value={activeSeasonId ?? undefined}
            onChange={(opt) =>
              setSelectedSeasonId((opt as { value: number }).value)
            }
            width={240}
          />
          {currentRound ? (
            <Muted>
              Active round: R{currentRound.number} · {currentRound.name} ·{" "}
              {currentRound.status}
            </Muted>
          ) : (
            <Muted>No active round.</Muted>
          )}
        </Row>

        <Tabs value={tab} onChange={(v) => setTab(v as typeof tab)}>
          <Tab value="cohort">Cohort</Tab>
          <Tab value="round">Round</Tab>
          <Tab value="tickets">Tickets</Tab>
          <Tab value="audit">Audit</Tab>
          <Tab value="test">Test Gameshow</Tab>
          <Tab value="season3">Season 3</Tab>
        </Tabs>

        <TabBody>
          {tab === "cohort" ? (
            <CohortTab
              active={activeContestants}
              reserve={reserveContestants}
              eliminated={eliminatedContestants}
              onEliminate={(c) => setEliminateTarget(c)}
              onPromote={(id) => promoteMutation.mutate(id)}
              canAct={
                (user?.effectivePermissions?.manage_gameshow ?? false) ||
                user?.role === "admin" ||
                user?.role === "host" ||
                user?.role === "cohost"
              }
            />
          ) : null}

          {tab === "round" ? (
            <RoundTab
              rounds={roundsQuery.data ?? []}
              selectedRoundId={selectedRoundId ?? currentRound?.id ?? null}
              setSelectedRoundId={setSelectedRoundId}
              draftsForRound={draftsForRound}
              canAdvance={canAdvance}
              onRunRule={(id) => runRuleMutation.mutate(id)}
              onAdvance={(id) => advanceRoundMutation.mutate(id)}
              onUpsertRule={(payload) => upsertRuleMutation.mutate(payload)}
              onEliminate={(draft) => {
                const contestant = (contestantsQuery.data ?? []).find(
                  (c) => c.userId === draft.userId
                );
                if (contestant) setEliminateTarget(contestant);
              }}
              advancing={advanceRoundMutation.isPending}
            />
          ) : null}

          {tab === "tickets" ? <TicketsTab /> : null}

          {tab === "audit" ? (
            <AuditTab feed={feedQuery.data?.feed ?? []} />
          ) : null}

          {tab === "test" ? <TestGameshowTab /> : null}

          {tab === "season3" ? <Season3Tab /> : null}
        </TabBody>
      </Stack>

      {eliminateTarget ? (
        <EliminateModal
          contestant={eliminateTarget}
          currentRoundId={currentRound?.id ?? null}
          onCancel={() => setEliminateTarget(null)}
          onConfirm={(payload) =>
            eliminateMutation.mutate({
              contestantId: eliminateTarget.id,
              ...payload,
            })
          }
          submitting={eliminateMutation.isPending}
          error={(eliminateMutation.error as Error | null)?.message ?? null}
        />
      ) : null}
    </AppWindow>
  );
}

function CohortTab(props: {
  active: Contestant[];
  reserve: Contestant[];
  eliminated: Contestant[];
  onEliminate: (c: Contestant) => void;
  onPromote: (contestantId: number) => void;
  canAct: boolean;
}) {
  return (
    <Stack>
      <GroupBox label={`Active (${props.active.length})`}>
        <ContestantTable
          rows={props.active}
          emptyText="No active contestants yet. Lock a cohort to populate."
          rightColumn={(c) => (
            <Button
              size="sm"
              disabled={!props.canAct}
              onClick={() => props.onEliminate(c)}
            >
              Eliminate
            </Button>
          )}
        />
      </GroupBox>

      <GroupBox label={`Reserve (${props.reserve.length})`}>
        <ContestantTable
          rows={props.reserve}
          emptyText="No reserves queued."
          rightColumn={(c) => (
            <Button
              size="sm"
              disabled={!props.canAct}
              onClick={() => props.onPromote(c.id)}
            >
              Promote
            </Button>
          )}
        />
      </GroupBox>

      <GroupBox label={`Eliminated (${props.eliminated.length})`}>
        <ContestantTable
          rows={props.eliminated}
          emptyText="No eliminations yet."
          rightColumn={(c) => (
            <Muted>
              {c.eliminatedAt
                ? new Date(c.eliminatedAt).toLocaleString()
                : "—"}
            </Muted>
          )}
        />
      </GroupBox>
    </Stack>
  );
}

function ContestantTable(props: {
  rows: Contestant[];
  emptyText: string;
  rightColumn: (c: Contestant) => React.ReactNode;
}) {
  if (props.rows.length === 0) {
    return <Muted>{props.emptyText}</Muted>;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeadCell>User</TableHeadCell>
          <TableHeadCell>Rank@lock</TableHeadCell>
          <TableHeadCell>Notes</TableHeadCell>
          <TableHeadCell> </TableHeadCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {props.rows.map((c) => (
          <TableRow key={c.id}>
            <TableDataCell>
              <UserLink username={c.username} />
              {c.displayName ? (
                <Muted style={{ marginLeft: 4 }}>· {c.displayName}</Muted>
              ) : null}
            </TableDataCell>
            <TableDataCell>{c.rankAtLock ?? "—"}</TableDataCell>
            <TableDataCell>
              {c.notes ? (
                <span>{c.notes}</span>
              ) : c.eliminationReason ? (
                <Muted>{c.eliminationReason}</Muted>
              ) : (
                "—"
              )}
            </TableDataCell>
            <TableDataCell>{props.rightColumn(c)}</TableDataCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RoundTab(props: {
  rounds: Round[];
  selectedRoundId: number | null;
  setSelectedRoundId: (id: number) => void;
  draftsForRound: DraftElimination[];
  canAdvance: boolean;
  onRunRule: (roundId: number) => void;
  onAdvance: (roundId: number) => void;
  onUpsertRule: (payload: {
    roundId: number;
    kind: RuleKind;
    params: Record<string, unknown>;
  }) => void;
  onEliminate: (draft: DraftElimination) => void;
  advancing: boolean;
}) {
  const [ruleKind, setRuleKind] = useState<RuleKind>("bottom_n_by_wtf");
  const [ruleN, setRuleN] = useState<string>("5");

  const round = props.rounds.find((r) => r.id === props.selectedRoundId);

  return (
    <Stack>
      <Row>
        <Muted>Round:</Muted>
        <Select<number>
          options={props.rounds.map((r) => ({
            value: r.id,
            label: `R${r.number} — ${r.name} (${r.status})`,
          }))}
          value={round?.id}
          onChange={(opt) =>
            props.setSelectedRoundId((opt as { value: number }).value)
          }
          width={320}
        />
      </Row>

      {!round ? (
        <Muted>Select a round to manage.</Muted>
      ) : (
        <>
          <GroupBox label="Elimination rule">
            <Row>
              <Select<RuleKind>
                options={RULE_KINDS.map((k) => ({
                  value: k.value,
                  label: k.label,
                }))}
                value={ruleKind}
                onChange={(opt) =>
                  setRuleKind((opt as { value: RuleKind }).value)
                }
                width={320}
              />
              {(ruleKind === "bottom_n_by_wtf" ||
                ruleKind === "top_n_survive") && (
                <>
                  <Muted>N:</Muted>
                  <TextInput
                    value={ruleN}
                    onChange={(e) => setRuleN(e.target.value)}
                    style={{ width: 80 }}
                  />
                </>
              )}
              <Button
                onClick={() =>
                  props.onUpsertRule({
                    roundId: round.id,
                    kind: ruleKind,
                    params:
                      ruleKind === "bottom_n_by_wtf" ||
                      ruleKind === "top_n_survive"
                        ? { n: parseInt(ruleN, 10) || 0 }
                        : {},
                  })
                }
              >
                Save rule
              </Button>
              <Button onClick={() => props.onRunRule(round.id)}>
                Run rule
              </Button>
            </Row>
            <Muted>
              "Save rule" persists the rule for this round.
              {" "}
              "Run rule" drafts eliminations based on current data.
              {" "}
              Nothing is final until you confirm each row below.
            </Muted>
          </GroupBox>

          <GroupBox
            label={`Draft eliminations (${props.draftsForRound.length})`}
          >
            {props.draftsForRound.length === 0 ? (
              <Muted>
                No unconfirmed drafts. "Advance round" is unlocked when this
                list is empty.
              </Muted>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>User</TableHeadCell>
                    <TableHeadCell>Source</TableHeadCell>
                    <TableHeadCell>Reason</TableHeadCell>
                    <TableHeadCell> </TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {props.draftsForRound.map((d) => (
                    <TableRow key={d.id}>
                      <TableDataCell>
                        <UserLink username={d.username} />
                      </TableDataCell>
                      <TableDataCell>
                        {d.wasDraftedByRule ? d.draftRuleKind ?? "rule" : "manual"}
                      </TableDataCell>
                      <TableDataCell>{d.reason ?? "—"}</TableDataCell>
                      <TableDataCell>
                        <Button size="sm" onClick={() => props.onEliminate(d)}>
                          Confirm…
                        </Button>
                      </TableDataCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </GroupBox>

          <Row>
            <Button
              disabled={!props.canAdvance || props.advancing}
              onClick={() => props.onAdvance(round.id)}
            >
              {props.advancing ? "Advancing…" : "Advance round"}
            </Button>
            <Muted>
              Unlocks only when every draft elimination above has been
              confirmed or overridden.
            </Muted>
          </Row>
        </>
      )}
    </Stack>
  );
}

function AuditTab(props: { feed: OperatorAction[] }) {
  if (props.feed.length === 0) return <Muted>No operator actions yet.</Muted>;
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeadCell>When</TableHeadCell>
          <TableHeadCell>Actor</TableHeadCell>
          <TableHeadCell>Action</TableHeadCell>
          <TableHeadCell>Target</TableHeadCell>
          <TableHeadCell>Payload</TableHeadCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {props.feed.map((a) => (
          <TableRow key={a.id}>
            <TableDataCell>
              {new Date(a.createdAt).toLocaleString()}
            </TableDataCell>
            <TableDataCell>
              {a.actorUsername ? (
                <UserLink username={a.actorUsername} />
              ) : (
                "—"
              )}
            </TableDataCell>
            <TableDataCell>{a.actionKind}</TableDataCell>
            <TableDataCell>
              {a.targetKind}
              {a.targetId !== null ? `#${a.targetId}` : ""}
            </TableDataCell>
            <TableDataCell>
              <pre
                style={{
                  fontSize: 11,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(a.payloadJson ?? {}, null, 0)}
              </pre>
            </TableDataCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface CalendarTicketRow {
  id: number;
  submitterUserId: number;
  submitterUsername: string | null;
  submitterDisplayName: string | null;
  payloadJson: {
    title: string;
    description?: string;
    startsAt: string;
    endsAt?: string;
    kind: string;
    visibility: string;
  };
  status: string;
  reviewerUserId: number | null;
  reviewReason: string | null;
  decidedAt: string | null;
  publishedEventId: number | null;
  createdAt: string;
  updatedAt: string;
}

function TicketsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<
    | "submitted"
    | "under_review"
    | "changes_requested"
    | "approved"
    | "rejected"
    | "cancelled"
  >("submitted");
  const [reasonFor, setReasonFor] = useState<Record<number, string>>({});

  const ticketsQuery = useQuery<CalendarTicketRow[]>({
    queryKey: ["/api/calendar/tickets/queue", statusFilter],
    queryFn: () =>
      api.get<CalendarTicketRow[]>(
        `/api/calendar/tickets/queue?status=${encodeURIComponent(statusFilter)}`
      ),
  });

  const decideMutation = useMutation({
    mutationFn: async (payload: {
      id: number;
      decision: "approve" | "reject" | "request_changes" | "cancel";
      reason?: string;
    }) =>
      api.post(`/api/calendar/tickets/${payload.id}/decide`, {
        decision: payload.decision,
        reason: payload.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/calendar/tickets/queue"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => api.post("/api/calendar/sync"),
  });

  return (
    <Stack>
      <Row>
        <Muted>Queue:</Muted>
        <Select
          options={[
            { value: "submitted", label: "Submitted" },
            { value: "under_review", label: "Under review" },
            { value: "changes_requested", label: "Changes requested" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          value={statusFilter}
          onChange={(opt: any) => setStatusFilter(opt.value)}
          width={220}
        />
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? "Syncing…" : "Re-materialize calendar"}
        </Button>
      </Row>

      {(ticketsQuery.data ?? []).length === 0 ? (
        <Muted>No tickets in this state.</Muted>
      ) : (
        (ticketsQuery.data ?? []).map((t) => (
          <GroupBox
            key={t.id}
            label={`#${t.id} · ${t.payloadJson?.title ?? "(untitled)"} · ${t.status}`}
          >
            <Row>
              <Muted>Submitter:</Muted>
              <UserLink username={t.submitterUsername ?? ""} />
              <Muted>
                Starts:{" "}
                {t.payloadJson?.startsAt
                  ? new Date(t.payloadJson.startsAt).toLocaleString()
                  : "—"}
              </Muted>
              <Muted>Kind: {t.payloadJson?.kind ?? "custom"}</Muted>
              <Muted>Visibility: {t.payloadJson?.visibility ?? "public"}</Muted>
            </Row>
            {t.payloadJson?.description ? (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {t.payloadJson.description}
              </div>
            ) : null}
            {t.status === "submitted" || t.status === "under_review" ? (
              <>
                <div style={{ height: 6 }} />
                <TextInput
                  value={reasonFor[t.id] ?? ""}
                  onChange={(e: any) =>
                    setReasonFor((prev) => ({
                      ...prev,
                      [t.id]: e.target.value,
                    }))
                  }
                  placeholder="Reviewer note (optional)"
                  fullWidth
                />
                <div style={{ height: 6 }} />
                <Row>
                  <Button
                    primary
                    onClick={() =>
                      decideMutation.mutate({
                        id: t.id,
                        decision: "approve",
                        reason: reasonFor[t.id],
                      })
                    }
                  >
                    Approve & publish
                  </Button>
                  <Button
                    onClick={() =>
                      decideMutation.mutate({
                        id: t.id,
                        decision: "request_changes",
                        reason: reasonFor[t.id],
                      })
                    }
                  >
                    Request changes
                  </Button>
                  <Button
                    onClick={() =>
                      decideMutation.mutate({
                        id: t.id,
                        decision: "reject",
                        reason: reasonFor[t.id],
                      })
                    }
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() =>
                      decideMutation.mutate({
                        id: t.id,
                        decision: "cancel",
                        reason: reasonFor[t.id],
                      })
                    }
                  >
                    Cancel
                  </Button>
                </Row>
              </>
            ) : (
              <Muted>
                Decided{" "}
                {t.decidedAt
                  ? new Date(t.decidedAt).toLocaleString()
                  : "—"}
                {t.reviewReason ? ` · ${t.reviewReason}` : ""}
                {t.publishedEventId
                  ? ` · published as event #${t.publishedEventId}`
                  : ""}
              </Muted>
            )}
          </GroupBox>
        ))
      )}
    </Stack>
  );
}

function EliminateModal(props: {
  contestant: Contestant;
  currentRoundId: number | null;
  onCancel: () => void;
  onConfirm: (payload: {
    confirmationUsername: string;
    roundId?: number | null;
    reason?: string;
    overrideReason?: string;
  }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const matches =
    typed.trim().toLowerCase() === props.contestant.username.toLowerCase();

  return (
    <ModalBackdrop>
      <ModalBody>
        <h3 style={{ marginTop: 0 }}>Confirm elimination</h3>
        <p>
          Type the contestant's username exactly to confirm elimination of{" "}
          <strong>{props.contestant.username}</strong>
          {props.contestant.displayName
            ? ` (${props.contestant.displayName})`
            : ""}
          .
        </p>
        <TextInput
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Username…"
          autoFocus
          fullWidth
        />
        <div style={{ height: 8 }} />
        <label style={{ display: "block" }}>
          <Muted>Reason (optional)</Muted>
          <TextInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. bottom of WTF standings"
            fullWidth
          />
        </label>
        <div style={{ height: 8 }} />
        <label style={{ display: "block" }}>
          <Muted>
            Override reason (only if this is a rule-drafted row you are
            overriding)
          </Muted>
          <TextInput
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Why override?"
            fullWidth
          />
        </label>
        {props.error ? (
          <div
            style={{
              marginTop: 8,
              color: "#900",
              fontWeight: "bold",
              fontSize: 12,
            }}
          >
            {props.error}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
          }}
        >
          <Button onClick={props.onCancel} disabled={props.submitting}>
            Cancel
          </Button>
          <Button
            primary
            disabled={!matches || props.submitting}
            onClick={() =>
              props.onConfirm({
                confirmationUsername: typed,
                roundId: props.currentRoundId,
                reason: reason || undefined,
                overrideReason: overrideReason || undefined,
              })
            }
          >
            {props.submitting ? "Eliminating…" : "Confirm eliminate"}
          </Button>
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}

interface TestGameshowState {
  season: { id: number; number: number; status: string };
  contestants: Array<{
    userId: number;
    username: string;
    contestantRowId: number;
  }>;
  rounds: Array<{ id: number; number: number; name: string }>;
  challenges: Array<{ id: number; roundId: number; title: string }>;
  sideQuest: { id: number; title: string } | null;
  buybackDryRun: { id: number; label: string; status: string } | null;
  notes: string[];
}

function TestGameshowTab() {
  const qc = useQueryClient();
  const statusQuery = useQuery<{ ok: true; state: TestGameshowState | null }>({
    queryKey: ["/api/control-board/test-gameshow/status"],
    queryFn: () =>
      api.get<{ ok: true; state: TestGameshowState | null }>(
        "/api/control-board/test-gameshow/status"
      ),
  });
  const seedMutation = useMutation({
    mutationFn: async () =>
      api.post<{ ok: true; state: TestGameshowState }>(
        "/api/control-board/test-gameshow/seed"
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/control-board/test-gameshow/status"],
      });
      qc.invalidateQueries({ queryKey: ["/api/seasons"] });
    },
  });
  const state = seedMutation.data?.state ?? statusQuery.data?.state ?? null;
  return (
    <Stack>
      <GroupBox label="Phase 11 — Test Gameshow (5 contestants · 3 rounds)">
        <Stack>
          <Muted>
            Idempotently provisions the dummy "Test Gameshow S0" season
            (number&nbsp;900), five tester accounts, three rounds (Teia mint,
            WTF-hold + CRP nomination, Inverse Snake hi-score), a WITWIB-style
            persistent side quest, and a draft ghostnet buyback window. Safe to
            re-run.
          </Muted>
          <Row>
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending
                ? "Seeding…"
                : state
                  ? "Re-run seeder (idempotent)"
                  : "Seed test gameshow"}
            </Button>
            <Button onClick={() => statusQuery.refetch()}>Refresh</Button>
          </Row>
          {seedMutation.isError ? (
            <Muted>Seed failed: {String((seedMutation.error as Error).message)}</Muted>
          ) : null}
        </Stack>
      </GroupBox>

      {state ? (
        <>
          <GroupBox label={`Season: ${state.season.number} (${state.season.status})`}>
            <Muted>
              Season&nbsp;id&nbsp;{state.season.id}. Use this id in the Cohort
              tab's selector to drive eliminations and round advancement.
            </Muted>
          </GroupBox>

          <GroupBox label={`Contestants (${state.contestants.length})`}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>User&nbsp;id</TableHeadCell>
                  <TableHeadCell>Username</TableHeadCell>
                  <TableHeadCell>Contestant&nbsp;row</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.contestants.map((c) => (
                  <TableRow key={c.userId}>
                    <TableDataCell>{c.userId}</TableDataCell>
                    <TableDataCell>
                      <UserLink username={c.username} />
                    </TableDataCell>
                    <TableDataCell>{c.contestantRowId}</TableDataCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GroupBox>

          <GroupBox label="Rounds">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>#</TableHeadCell>
                  <TableHeadCell>Name</TableHeadCell>
                  <TableHeadCell>Challenge</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.rounds.map((r) => {
                  const ch = state.challenges.find((c) => c.roundId === r.id);
                  return (
                    <TableRow key={r.id}>
                      <TableDataCell>R{r.number}</TableDataCell>
                      <TableDataCell>{r.name}</TableDataCell>
                      <TableDataCell>
                        {ch ? `#${ch.id} · ${ch.title}` : "—"}
                      </TableDataCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </GroupBox>

          <GroupBox label="Side quest">
            <Muted>
              {state.sideQuest
                ? `#${state.sideQuest.id} · ${state.sideQuest.title}`
                : "No side quest seeded yet."}
            </Muted>
          </GroupBox>

          <GroupBox label="Pre-test buyback dry run">
            <Muted>
              {state.buybackDryRun
                ? `#${state.buybackDryRun.id} · ${state.buybackDryRun.label} · ${state.buybackDryRun.status}`
                : "Not scaffolded (WTF_OPERATOR_WALLET_ADDRESS unset or already scaffolded elsewhere)."}
            </Muted>
          </GroupBox>

          {state.notes.length > 0 ? (
            <GroupBox label="Notes">
              <Stack>
                {state.notes.map((n, i) => (
                  <Muted key={i}>• {n}</Muted>
                ))}
              </Stack>
            </GroupBox>
          ) : null}
        </>
      ) : statusQuery.isLoading ? (
        <Muted>
          <Hourglass size={16} /> Loading test gameshow status…
        </Muted>
      ) : (
        <Muted>
          Not seeded yet — click "Seed test gameshow" above to stand it up.
        </Muted>
      )}
    </Stack>
  );
}

// ─── Phase 12 — Season 3 scaffold tab ────────────────────────────────────

interface Season3State {
  season: {
    id: number;
    number: number;
    name: string;
    status: string;
    anteWtfRequired: string;
  };
  rounds: Array<{
    id: number;
    number: number;
    name: string;
    status: string;
    rule: { kind: string; paramsJson: unknown } | null;
  }>;
  sideQuest: { id: number; title: string; persistent: boolean } | null;
  stickerTemplate: { id: number; title: string; status: string } | null;
  calendarEvents: Array<{
    id: number;
    kind: string;
    title: string;
    startsAt: string;
    status: string;
  }>;
  notes: string[];
}

function Season3Tab() {
  const qc = useQueryClient();
  const statusQuery = useQuery<{ ok: true; state: Season3State | null }>({
    queryKey: ["/api/control-board/season3/status"],
    queryFn: () =>
      api.get<{ ok: true; state: Season3State | null }>(
        "/api/control-board/season3/status"
      ),
  });
  const scaffoldMutation = useMutation({
    mutationFn: async () =>
      api.post<{ ok: true; state: Season3State }>(
        "/api/control-board/season3/scaffold"
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/control-board/season3/status"],
      });
      qc.invalidateQueries({ queryKey: ["/api/seasons"] });
      qc.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
  });
  const state =
    scaffoldMutation.data?.state ?? statusQuery.data?.state ?? null;
  return (
    <Stack>
      <GroupBox label="Phase 12 — Season 3 scaffold (10 rounds · 50 contestants)">
        <Stack>
          <Muted>
            Idempotently stands up the Season 3 shell: season row with
            ante_wtf_required, ten upcoming rounds each with a default
            elimination rule, the persistent Season 3 sidequest stream, the
            Tezos Sticker Design Challenge template, and three published
            calendar events (kickoff, mid-season stage, finale) so the iCal
            feed and Discord mirror come online on their next tick. Safe to
            re-run — missing pieces are filled in, existing ones are left
            alone.
          </Muted>
          <Row>
            <Button
              onClick={() => scaffoldMutation.mutate()}
              disabled={scaffoldMutation.isPending}
            >
              {scaffoldMutation.isPending
                ? "Scaffolding…"
                : state
                  ? "Re-run scaffold (idempotent)"
                  : "Scaffold Season 3"}
            </Button>
            <Button onClick={() => statusQuery.refetch()}>Refresh</Button>
          </Row>
          {scaffoldMutation.isError ? (
            <Muted>
              Scaffold failed:{" "}
              {String((scaffoldMutation.error as Error).message)}
            </Muted>
          ) : null}
        </Stack>
      </GroupBox>

      {state ? (
        <>
          <GroupBox
            label={`Season: S${state.season.number} · ${state.season.name} (${state.season.status})`}
          >
            <Muted>
              Season&nbsp;id&nbsp;{state.season.id}. Ante required:{" "}
              {state.season.anteWtfRequired} WTF. Lock the cohort and flip
              status to <code>active</code> from the Cohort tab once all 50
              contestants have attested their ante.
            </Muted>
          </GroupBox>

          <GroupBox label={`Rounds (${state.rounds.length})`}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>#</TableHeadCell>
                  <TableHeadCell>Name</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Elim&nbsp;rule</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.rounds.map((r) => (
                  <TableRow key={r.id}>
                    <TableDataCell>R{r.number}</TableDataCell>
                    <TableDataCell>{r.name}</TableDataCell>
                    <TableDataCell>{r.status}</TableDataCell>
                    <TableDataCell>
                      {r.rule
                        ? `${r.rule.kind} · ${JSON.stringify(r.rule.paramsJson)}`
                        : "—"}
                    </TableDataCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GroupBox>

          <GroupBox label="Sidequest stream">
            <Muted>
              {state.sideQuest
                ? `#${state.sideQuest.id} · ${state.sideQuest.title} · ${
                    state.sideQuest.persistent ? "persistent" : "one-shot"
                  }`
                : "No sidequest seeded yet."}
            </Muted>
          </GroupBox>

          <GroupBox label="Sticker Design Challenge (template)">
            <Muted>
              {state.stickerTemplate
                ? `#${state.stickerTemplate.id} · ${state.stickerTemplate.title} · ${state.stickerTemplate.status}`
                : "Not scaffolded."}
            </Muted>
          </GroupBox>

          <GroupBox label={`Calendar (${state.calendarEvents.length})`}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Kind</TableHeadCell>
                  <TableHeadCell>Title</TableHeadCell>
                  <TableHeadCell>Starts</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.calendarEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableDataCell>{e.kind}</TableDataCell>
                    <TableDataCell>{e.title}</TableDataCell>
                    <TableDataCell>
                      {new Date(e.startsAt).toLocaleString()}
                    </TableDataCell>
                    <TableDataCell>{e.status}</TableDataCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GroupBox>

          {state.notes.length > 0 ? (
            <GroupBox label="Notes">
              <Stack>
                {state.notes.map((n, i) => (
                  <Muted key={i}>• {n}</Muted>
                ))}
              </Stack>
            </GroupBox>
          ) : null}
        </>
      ) : statusQuery.isLoading ? (
        <Muted>
          <Hourglass size={16} /> Loading Season 3 status…
        </Muted>
      ) : (
        <Muted>
          Not scaffolded yet — click "Scaffold Season 3" above to stand it
          up.
        </Muted>
      )}
    </Stack>
  );
}
