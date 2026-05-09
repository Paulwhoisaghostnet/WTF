import { useMemo, useState } from "react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import type {
  ArcadeStatsResponse,
  ConsoleAuditEvent,
  ConsoleGameReport,
  ConsoleModerationGame,
  ModerateConsoleGamePayload,
  ModerateConsoleReportPayload,
  UpdateArcadeCreditRulePayload,
} from "../types";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending?: boolean;
};

type AdminVoidMutation = {
  mutate: () => void;
  isPending?: boolean;
};

type ConsoleAdminTabProps = {
  games: ConsoleModerationGame[] | undefined;
  reports: ConsoleGameReport[] | undefined;
  auditEvents: ConsoleAuditEvent[] | undefined;
  arcadeStats: ArcadeStatsResponse | undefined;
  moderateConsoleGameMutation: AdminMutation<ModerateConsoleGamePayload>;
  updateArcadeCreditRuleMutation: AdminMutation<UpdateArcadeCreditRulePayload>;
  importSourceArcadeMutation: AdminVoidMutation;
  moderateConsoleReportMutation: AdminMutation<ModerateConsoleReportPayload>;
};

const Stack = styled.div`
  display: grid;
  gap: 12px;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const HealthGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
`;

const HealthTile = styled.div`
  border: 1px solid #808080;
  background: #f3f0d7;
  padding: 8px;
  min-height: 58px;
  display: grid;
  align-content: start;
  gap: 4px;

  strong,
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 14px;
  }

  span {
    font-size: 11px;
  }
`;

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  background: #f3f0d7;

  th,
  td {
    border: 1px solid #808080;
    padding: 5px;
    vertical-align: top;
  }

  th {
    background: #d7d2ba;
    text-align: left;
  }

  input {
    width: 180px;
  }
`;

const Muted = styled.span`
  color: #555555;
`;

const StatusPill = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid #808080;
  background: ${(p) =>
    p.$status === "active"
      ? "#d6efd1"
      : p.$status === "pending"
        ? "#fff0b7"
        : p.$status === "removed" || p.$status === "rejected"
          ? "#f1c4c4"
          : "#e5e0c7"};
`;

const PriorityPill = styled.span<{ $score: number }>`
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid #808080;
  background: ${(p) =>
    p.$score >= 80
      ? "#f1c4c4"
      : p.$score >= 50
        ? "#fff0b7"
        : p.$score > 0
          ? "#d6efd1"
          : "#e5e0c7"};
`;

const ActionCell = styled.td`
  min-width: 240px;

  button {
    margin-right: 4px;
    margin-bottom: 4px;
  }
`;

export function ConsoleAdminTab({
  games,
  reports,
  auditEvents,
  arcadeStats,
  moderateConsoleGameMutation,
  updateArcadeCreditRuleMutation,
  importSourceArcadeMutation,
  moderateConsoleReportMutation,
}: ConsoleAdminTabProps) {
  const [status, setStatus] = useState("pending");
  const [reportStatus, setReportStatus] = useState("open");
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({});
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
  const [reportNotes, setReportNotes] = useState<Record<number, string>>({});

  const filteredGames = useMemo(
    () =>
      (games ?? []).filter((game) =>
        status === "all"
          ? true
          : status === "pending"
            ? game.status === "pending" || game.latestVersion?.status === "pending"
            : game.status === status
      ),
    [games, status]
  );
  const filteredReports = useMemo(
    () =>
      (reports ?? [])
        .filter((report) =>
          reportStatus === "all" ? true : report.status === reportStatus
        )
        .sort(
          (a, b) =>
            (b.priorityScore || 0) - (a.priorityScore || 0) ||
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    [reports, reportStatus]
  );
  const visibleAuditEvents = useMemo(
    () => (auditEvents ?? []).slice(0, 80),
    [auditEvents]
  );

  function moderate(game: ConsoleModerationGame, action: ModerateConsoleGamePayload["action"]) {
    moderateConsoleGameMutation.mutate({
      slug: game.slug,
      action,
      reason: reasonInputs[game.slug] || undefined,
    });
  }

  function updateCreditRule(game: ConsoleModerationGame) {
    const value = creditInputs[game.slug] ?? String(game.arcadeCreditPrice ?? 1);
    const creditPrice = Math.max(0, Math.min(99, Math.floor(Number(value) || 0)));
    updateArcadeCreditRuleMutation.mutate({
      slug: game.slug,
      creditsRequired: creditPrice > 0,
      creditPrice,
      reason: reasonInputs[game.slug] || undefined,
    });
  }

  function moderateReport(
    report: ConsoleGameReport,
    action: ModerateConsoleReportPayload["action"]
  ) {
    moderateConsoleReportMutation.mutate({
      id: report.id,
      action,
      note: reportNotes[report.id] || undefined,
    });
  }

  return (
    <Stack>
      <GroupBox label="Arcade Health">
        <Toolbar>
          <FilterRow>
            <span>Play tickets and source checks</span>
            <Muted>{sourceImportHealth(arcadeStats?.latestSourceArcadeImportAt)}</Muted>
          </FilterRow>
          <Button
            size="sm"
            disabled={importSourceArcadeMutation.isPending}
            onClick={() => importSourceArcadeMutation.mutate()}
          >
            Check Compatible Games
          </Button>
        </Toolbar>
        <HealthGrid>
          <HealthTile>
            <strong>{arcadeStats?.payment?.feeWtfFormatted ?? "1.00"} WTF</strong>
            <span>play ticket fee</span>
          </HealthTile>
          <HealthTile>
            <strong>{arcadeStats?.payment?.configured ? "Ready" : "Pending"}</strong>
            <span>{arcadeStats?.payment?.contractAddress || "contract config"}</span>
          </HealthTile>
          <HealthTile>
            <strong>{arcadeStats?.sourceArcadeGames ?? 0}</strong>
            <span>compatible-source games</span>
          </HealthTile>
          <HealthTile>
            <strong>{arcadeStats?.publishedGames ?? 0}</strong>
            <span>live Arcade games</span>
          </HealthTile>
          <HealthTile>
            <strong>{(arcadeStats?.totalPlays ?? 0).toLocaleString()}</strong>
            <span>ticketed plays</span>
          </HealthTile>
          <HealthTile>
            <strong>{formatDateTime(arcadeStats?.latestSourceArcadeImportAt)}</strong>
            <span>latest source check</span>
          </HealthTile>
        </HealthGrid>
      </GroupBox>
      <GroupBox label="WTF Arcade">
      <Toolbar>
        <FilterRow>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="pending">Pending / Updates</option>
            <option value="active">Active</option>
            <option value="rejected">Rejected</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
          <Muted>{filteredGames.length} games</Muted>
        </FilterRow>
      </Toolbar>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Builder</th>
              <th>Status</th>
              <th>Bundle</th>
              <th>Credits</th>
              <th>Caps</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredGames.map((game) => (
              <tr key={game.slug}>
                <td>
                  <strong>{game.title}</strong>
                  <br />
                  <Muted>{game.slug}</Muted>
                  <br />
                  <Muted>{game.category}</Muted>
                </td>
                <td>
                  {game.builderName || "Unknown"}
                  <br />
                  <Muted>{game.submittedAt ? new Date(game.submittedAt).toLocaleString() : "Imported"}</Muted>
                </td>
                <td>
                  <StatusPill $status={game.status}>{game.status}</StatusPill>
                  <br />
                  <Muted>{game.active ? "public" : "hidden"}</Muted>
                  {game.latestVersion?.status === "pending" && (
                    <>
                      <br />
                      <Muted>v{game.latestVersion.version} pending</Muted>
                    </>
                  )}
                </td>
                <td>
                  v{game.bundleVersion}
                  <br />
                  <Muted>{game.storageMode || "static"}</Muted>
                  {bundleFileCount(game) != null && (
                    <>
                      <br />
                      <Muted>
                        {bundleFileCount(game)} files
                      </Muted>
                    </>
                  )}
                </td>
                <td>
                  <strong>
                    {game.arcadeCreditsRequired
                      ? `${game.arcadeCreditPrice ?? 1} credit${(game.arcadeCreditPrice ?? 1) === 1 ? "" : "s"}`
                      : "free play"}
                  </strong>
                  <br />
                  <Muted>
                    {game.userSubmitted ? "creator-submitted" : "admin priced"}
                  </Muted>
                  <br />
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={game.userSubmitted}
                    value={creditInputs[game.slug] ?? String(game.arcadeCreditPrice ?? 1)}
                    onChange={(event) =>
                      setCreditInputs((prev) => ({
                        ...prev,
                        [game.slug]: event.target.value,
                      }))
                    }
                  />
                  <br />
                  <Button
                    size="sm"
                    disabled={game.userSubmitted || updateArcadeCreditRuleMutation.isPending}
                    onClick={() => updateCreditRule(game)}
                  >
                    Set Price
                  </Button>
                </td>
                <td>
                  Max {game.maxPossibleScore ?? "open"}
                  <br />
                  Rate {game.maxScorePerSecond ?? "open"}/s
                </td>
                <ActionCell>
                  <input
                    placeholder="Reason or note"
                    value={reasonInputs[game.slug] || ""}
                    onChange={(event) =>
                      setReasonInputs((prev) => ({
                        ...prev,
                        [game.slug]: event.target.value,
                      }))
                    }
                  />
                  <br />
                  <Button
                    size="sm"
                    disabled={moderateConsoleGameMutation.isPending}
                    onClick={() => moderate(game, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    disabled={moderateConsoleGameMutation.isPending}
                    onClick={() => moderate(game, "reject")}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={moderateConsoleGameMutation.isPending}
                    onClick={() => moderate(game, "remove")}
                  >
                    Remove
                  </Button>
                  <Button
                    size="sm"
                    disabled={moderateConsoleGameMutation.isPending}
                    onClick={() => moderate(game, "restore")}
                  >
                    Restore
                  </Button>
                </ActionCell>
              </tr>
            ))}
            {filteredGames.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Muted>No Arcade games match this filter.</Muted>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
      </GroupBox>
      <GroupBox label="Arcade Reports">
      <Toolbar>
        <FilterRow>
          <span>Status</span>
          <select
            value={reportStatus}
            onChange={(event) => setReportStatus(event.target.value)}
          >
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </select>
          <Muted>{filteredReports.length} reports</Muted>
        </FilterRow>
      </Toolbar>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Reporter</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredReports.map((report) => (
              <tr key={report.id}>
                <td>
                  <strong>{report.title}</strong>
                  <br />
                  <Muted>{report.slug}</Muted>
                  <br />
                  <Muted>{report.builderName || "Unknown builder"}</Muted>
                </td>
                <td>
                  {report.reporterDisplayName || report.reporterUsername || "Unknown"}
                  <br />
                  <Muted>{new Date(report.createdAt).toLocaleString()}</Muted>
                </td>
                <td>{report.category}</td>
                <td>
                  <PriorityPill $score={report.priorityScore}>
                    {report.priorityScore}
                  </PriorityPill>
                  <br />
                  <Muted>{report.totalOpenCount} open on game</Muted>
                  <br />
                  <Muted>{report.sameCategoryOpenCount} matching category</Muted>
                  {report.invalidScoreSignals > 0 && (
                    <>
                      <br />
                      <Muted>{report.invalidScoreSignals} score signals</Muted>
                    </>
                  )}
                </td>
                <td>{report.reason}</td>
                <td>
                  <StatusPill $status={report.status}>{report.status}</StatusPill>
                  {report.resolutionNote && (
                    <>
                      <br />
                      <Muted>{report.resolutionNote}</Muted>
                    </>
                  )}
                </td>
                <ActionCell>
                  <input
                    placeholder="Resolution note"
                    value={reportNotes[report.id] || ""}
                    onChange={(event) =>
                      setReportNotes((prev) => ({
                        ...prev,
                        [report.id]: event.target.value,
                      }))
                    }
                  />
                  <br />
                  <Button
                    size="sm"
                    disabled={moderateConsoleReportMutation.isPending}
                    onClick={() => moderateReport(report, "review")}
                  >
                    Review
                  </Button>
                  <Button
                    size="sm"
                    disabled={moderateConsoleReportMutation.isPending}
                    onClick={() => moderateReport(report, "resolve")}
                  >
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    disabled={moderateConsoleReportMutation.isPending}
                    onClick={() => moderateReport(report, "dismiss")}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    disabled={moderateConsoleReportMutation.isPending}
                    onClick={() => moderateReport(report, "reopen")}
                  >
                    Reopen
                  </Button>
                </ActionCell>
              </tr>
            ))}
            {filteredReports.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Muted>No Arcade reports match this filter.</Muted>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
      </GroupBox>
      <GroupBox label="Arcade Audit">
      <Toolbar>
        <FilterRow>
          <span>Recent events</span>
          <Muted>{visibleAuditEvents.length} events</Muted>
        </FilterRow>
      </Toolbar>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Game</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {visibleAuditEvents.map((event) => (
              <tr key={event.id}>
                <td>
                  <Muted>{new Date(event.createdAt).toLocaleString()}</Muted>
                </td>
                <td>
                  {event.title || "System"}
                  <br />
                  <Muted>{event.slug || "no game"}</Muted>
                </td>
                <td>
                  {event.actorUsername || "system"}
                  {event.actorUserId != null && (
                    <>
                      <br />
                      <Muted>#{event.actorUserId}</Muted>
                    </>
                  )}
                </td>
                <td>{event.action}</td>
                <td>{event.reason || auditPayloadSummary(event.payload)}</td>
              </tr>
            ))}
            {visibleAuditEvents.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Muted>No Arcade audit events yet.</Muted>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
      </GroupBox>
    </Stack>
  );
}

function bundleFileCount(game: ConsoleModerationGame): number | null {
  const metadata = game.latestVersion?.bundleMetadata;
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as any).fileCount;
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Unknown";
  return timestamp.toLocaleString();
}

function sourceImportHealth(value: string | null | undefined): string {
  if (!value) return "No source check recorded";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Source check timestamp unreadable";
  const ageHours = (Date.now() - timestamp) / 3_600_000;
  if (ageHours <= 13) return "Source check fresh";
  if (ageHours <= 26) return "Source check due soon";
  return "Source check stale";
}

function auditPayloadSummary(payload: Record<string, unknown>): string {
  const slug = payload.gameSlug || payload.slug;
  const reportId = payload.reportId;
  if (slug && reportId) return `${String(slug)} / report #${String(reportId)}`;
  if (slug) return String(slug);
  if (reportId) return `report #${String(reportId)}`;
  const keys = Object.keys(payload);
  return keys.length ? keys.slice(0, 3).join(", ") : "";
}
