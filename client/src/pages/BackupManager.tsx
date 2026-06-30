import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hourglass, Separator } from "react95";
import {
  ArchiveRestore,
  CheckCircle2,
  DatabaseBackup,
  FileCheck2,
  HardDriveDownload,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import {
  UiButton,
  UiEmptyState,
  UiNotice,
  UiPanel,
  UiStatusPill,
} from "../components/wtfos-ui";
import { api } from "../lib/api";
import {
  presentationRouteHref,
  usePresentationShell,
} from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";

type RestoreRequirement = {
  key: string;
  ok: boolean;
  detail: string;
};

type RestoreProof = {
  status: "safe_to_claim" | "not_proven";
  canClaimSafety: boolean;
  generatedAt: string;
  requirements: RestoreRequirement[];
  backup: {
    filename?: string | null;
    bytes?: number | null;
    sha256?: string | null;
    createdAt?: string | null;
  } | null;
  targets: Array<{
    name: string;
    status: string;
    bytes?: number | null;
    sha256Match?: boolean | null;
  }>;
  restoreDrill: {
    status: "passed" | "failed" | "missing";
    restoredAt?: string;
    source?: string;
    rowCounts?: Array<{ table: string; backupRows: number; restoredRows: number }>;
    mediaManifest?: {
      status: "passed" | "failed" | "missing";
      expectedRows: number;
      restoredRows: number;
      checksumSha256: string | null;
      checkedObjects: number;
      missingObjects: number;
    };
    error?: string;
  };
};

type BackupRestoreProofResponse = {
  jobName: string;
  latestRun: {
    id: number;
    status: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    itemsIn?: number | null;
    itemsOut?: number | null;
    error?: string | null;
  } | null;
  restoreProof: RestoreProof | null;
  canClaimSafety: boolean;
  fetchedAt: string;
};

const Shell = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  &[data-backup-manager-presentation-host="gamma"] {
    padding: 16px;
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-backup-manager-presentation-host="gamma"],
  &[data-backup-manager-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-backup-manager-presentation-host="gamma"] [data-backup-manager-region] {
    background-image: none;
    border-radius: 6px;
  }

  &[data-backup-manager-presentation-host="gamma"] :where(fieldset, table, [data-backup-manager-region="status-cell"], [data-backup-manager-region="row"], [data-backup-manager-region="panel"]) {
    color: #f2ead9;
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  &[data-backup-manager-presentation-host="gamma"] :where(button) {
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(0, 210, 255, 0.54);
    border-radius: 6px;
  }

  &[data-backup-manager-presentation-host="gamma"] :where(button:hover, button:focus-visible) {
    color: #070706;
    background: #00d2ff;
    outline: 2px solid #00d2ff;
    outline-offset: 2px;
  }
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div<{ $tone?: "ok" | "warn" | "error" }>`
  min-height: 72px;
  padding: var(--wtf-space-3, 12px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: ${(p) =>
    p.$tone === "ok"
      ? "var(--wtf-app-success-bg, #e7f6ec)"
      : p.$tone === "error"
        ? "var(--wtf-app-danger-bg, #fde8e6)"
        : "var(--wtf-app-warning-bg, #fff3d6)"};
  box-shadow: inset 0 2px 0
    ${(p) =>
      p.$tone === "ok"
        ? "var(--wtf-app-success, #176b38)"
        : p.$tone === "error"
          ? "var(--wtf-app-danger, #b42318)"
          : "var(--wtf-app-warning, #8a4b00)"};
  color: var(--wtf-app-text, #111);
`;

const StatusLabel = styled.div`
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  line-height: 1.25;
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: var(--wtf-type-body-strong, 15px);
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Rows = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  padding: var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-surface-raised, #ffffff);
  border: 1px solid var(--wtf-app-border, #808080);

  @media (max-width: 560px) {
    grid-template-columns: 24px minmax(0, 1fr);
  }
`;

const RowTitle = styled.div`
  font-size: var(--wtf-type-body-strong, 15px);
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const RowMeta = styled.div`
  margin-top: 2px;
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const Badge = styled(UiStatusPill).attrs<{ $ok?: boolean }>((p) => ({
  $tone: p.$ok ? "success" : "warning",
}))<{ $ok?: boolean }>`
  min-width: 78px;
  justify-content: center;
  text-align: center;
  text-transform: none;

  @media (max-width: 560px) {
    grid-column: 1 / -1;
  }
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const ActionButton = styled(UiButton)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--wtf-space-1, 4px);
  min-height: var(--wtf-control-min-height, 32px);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;

  @media (max-width: 768px) {
    min-height: 44px;
  }
`;

function formatBytes(bytes: number | null | undefined) {
  const raw = Number(bytes ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = raw;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortHash(value: string | null | undefined) {
  if (!value) return "missing";
  if (value.length <= 16) return value;
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}

export function BackupManager() {
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();
  const proofQuery = useQuery({
    queryKey: ["backup-manager", "restore-proof"],
    queryFn: () =>
      api.get<BackupRestoreProofResponse>("/api/cockpit/backup/restore-proof"),
    refetchInterval: 60_000,
  });

  const proof = proofQuery.data?.restoreProof ?? null;
  const latestRun = proofQuery.data?.latestRun ?? null;
  const canClaimSafety = Boolean(proofQuery.data?.canClaimSafety && proof?.canClaimSafety);

  useEffect(() => {
    if (!proofQuery.data) return;
    logClientSystemEvent({
      eventType: "backup_manager.viewed",
      metadata: {
        jobName: proofQuery.data.jobName,
        canClaimSafety,
        latestRunStatus: latestRun?.status ?? null,
        proofStatus: proof?.status ?? null,
      },
    });
  }, [canClaimSafety, latestRun?.status, proof?.status, proofQuery.data]);

  function open(path: string, action: string) {
    logClientSystemEvent({
      eventType: "backup_manager.opened",
      metadata: { action, path },
    });
    setLocation(presentationRouteHref(path, presentation.host));
  }

  if (proofQuery.isLoading) {
    return (
      <AppWindow title="Backup Manager">
        <Shell
          data-testid="backup-manager"
          data-backup-manager-surface="restore-proof"
          data-backup-manager-presentation-host={presentation.host}
          data-backup-manager-region="surface"
        >
          <UiPanel title="Restore proof" compact data-backup-manager-region="panel">
            <Hourglass size={30} />
          </UiPanel>
        </Shell>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Backup Manager">
      <Shell
        data-testid="backup-manager"
        data-backup-manager-surface="restore-proof"
        data-backup-manager-presentation-host={presentation.host}
        data-backup-manager-region="surface"
      >
        <StatusGrid data-backup-manager-region="status-grid">
          <StatusCell $tone={canClaimSafety ? "ok" : "warn"} data-backup-manager-region="status-cell">
            <StatusLabel>Safety Claim</StatusLabel>
            <StatusValue>{canClaimSafety ? "proven" : "not proven"}</StatusValue>
          </StatusCell>
          <StatusCell $tone={latestRun?.status === "success" ? "ok" : "warn"} data-backup-manager-region="status-cell">
            <StatusLabel>Backup Job</StatusLabel>
            <StatusValue>{latestRun?.status ?? "missing"}</StatusValue>
          </StatusCell>
          <StatusCell $tone={proof?.restoreDrill?.status === "passed" ? "ok" : "warn"} data-backup-manager-region="status-cell">
            <StatusLabel>Restore Drill</StatusLabel>
            <StatusValue>{proof?.restoreDrill?.status ?? "missing"}</StatusValue>
          </StatusCell>
          <StatusCell $tone={proofQuery.isError ? "error" : "ok"} data-backup-manager-region="status-cell">
            <StatusLabel>Fetched</StatusLabel>
            <StatusValue>{formatDate(proofQuery.data?.fetchedAt)}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Actions data-backup-manager-region="actions">
          <ActionButton data-backup-manager-region="button" onClick={() => open("/recovery-mode", "recovery-mode")}>
            <ArchiveRestore size={14} aria-hidden />
            Open Recovery Mode
          </ActionButton>
          <ActionButton data-backup-manager-region="button" onClick={() => open("/admin", "admin")}>
            <FileCheck2 size={14} aria-hidden />
            Open Admin logs
          </ActionButton>
          <ActionButton data-backup-manager-region="button" onClick={() => proofQuery.refetch()}>
            <HardDriveDownload size={14} aria-hidden />
            Refresh restore proof
          </ActionButton>
        </Actions>

        <div data-backup-manager-region="separator">
          <Separator />
        </div>

        {proofQuery.isError ? (
          <UiPanel title="Restore proof error" compact tone="danger" data-backup-manager-region="panel">
            <UiNotice tone="danger">
              <ShieldAlert size={16} aria-hidden />
              <div>
                <RowTitle>Restore proof unavailable</RowTitle>
                <RowMeta>
                  {proofQuery.error instanceof Error
                    ? proofQuery.error.message
                    : "Backup proof request failed"}
                </RowMeta>
              </div>
            </UiNotice>
          </UiPanel>
        ) : (
          <DetailGrid data-backup-manager-region="detail-grid">
            <UiPanel title="Requirements" compact data-backup-manager-region="panel">
              <Rows>
                {(proof?.requirements ?? []).map((requirement) => (
                  <Row key={requirement.key} data-backup-manager-region="row">
                    {requirement.ok ? (
                      <CheckCircle2 size={16} aria-hidden />
                    ) : (
                      <XCircle size={16} aria-hidden />
                    )}
                    <div>
                      <RowTitle>{requirement.key.replace(/_/g, " ")}</RowTitle>
                      <RowMeta>{requirement.detail}</RowMeta>
                    </div>
                    <Badge $ok={requirement.ok}>{requirement.ok ? "ok" : "open"}</Badge>
                  </Row>
                ))}
              </Rows>
            </UiPanel>

            <UiPanel title="Artifact" compact data-backup-manager-region="panel">
              <Rows>
                <Row data-backup-manager-region="row">
                  <DatabaseBackup size={16} aria-hidden />
                  <div>
                    <RowTitle>{proof?.backup?.filename ?? "No backup artifact"}</RowTitle>
                    <RowMeta>
                      {formatBytes(proof?.backup?.bytes)} - {formatDate(proof?.backup?.createdAt)}
                    </RowMeta>
                  </div>
                  <Badge $ok={Boolean(proof?.backup?.sha256)}>sha</Badge>
                </Row>
                <Row data-backup-manager-region="row">
                  <FileCheck2 size={16} aria-hidden />
                  <div>
                    <RowTitle>Checksum</RowTitle>
                    <RowMeta>{shortHash(proof?.backup?.sha256)}</RowMeta>
                  </div>
                  <Badge $ok={Boolean(proof?.backup?.sha256)}>proof</Badge>
                </Row>
                <Row data-backup-manager-region="row">
                  <ArchiveRestore size={16} aria-hidden />
                  <div>
                    <RowTitle>Latest run</RowTitle>
                    <RowMeta>
                      {latestRun
                        ? `${formatDate(latestRun.startedAt)} - ${formatDate(latestRun.finishedAt)}`
                        : "No scheduler run recorded"}
                    </RowMeta>
                  </div>
                  <Badge $ok={latestRun?.status === "success"}>{latestRun?.status ?? "none"}</Badge>
                </Row>
              </Rows>
            </UiPanel>
          </DetailGrid>
        )}

        <UiPanel title="Targets" compact data-backup-manager-region="panel">
          {(proof?.targets ?? []).length === 0 ? (
            <UiEmptyState title="No target proof">
              No successful local or off-host retention target was returned.
            </UiEmptyState>
          ) : (
            <Rows>
              {proof!.targets.map((target) => (
                <Row key={target.name} data-backup-manager-region="row">
                  <HardDriveDownload size={16} aria-hidden />
                  <div>
                    <RowTitle>{target.name}</RowTitle>
                    <RowMeta>
                      {target.status} - {formatBytes(target.bytes)} - checksum{" "}
                      {target.sha256Match === false ? "mismatch" : "matched"}
                    </RowMeta>
                  </div>
                  <Badge $ok={target.status === "ok" && target.sha256Match !== false}>
                    {target.status}
                  </Badge>
                </Row>
              ))}
            </Rows>
          )}
        </UiPanel>
      </Shell>
    </AppWindow>
  );
}
