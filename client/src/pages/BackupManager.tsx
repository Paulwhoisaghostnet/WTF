import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Separator } from "react95";
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
import { api } from "../lib/api";
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
  gap: 8px;
  min-width: 0;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div<{ $tone?: "ok" | "warn" | "error" }>`
  min-height: 66px;
  padding: 7px;
  border: 1px solid #808080;
  background: ${(p) =>
    p.$tone === "ok" ? "#d8f0d0" : p.$tone === "error" ? "#f5b5b5" : "#f5df9a"};
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const StatusLabel = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: #404040;
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: 14px;
  font-weight: bold;
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
  gap: 6px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border: 1px solid #9a9a9a;
  background: #f2f2f2;

  @media (max-width: 560px) {
    grid-template-columns: 22px minmax(0, 1fr);
  }
`;

const RowTitle = styled.div`
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const RowMeta = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: #404040;
  overflow-wrap: anywhere;
`;

const Badge = styled.div<{ $ok?: boolean }>`
  min-width: 72px;
  padding: 4px 6px;
  border: 1px solid #808080;
  background: ${(p) => (p.$ok ? "#d8f0d0" : "#f5df9a")};
  text-align: center;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;

  @media (max-width: 560px) {
    grid-column: 1 / -1;
  }
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const ActionButton = styled(Button)`
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11px;
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
    setLocation(path);
  }

  if (proofQuery.isLoading) {
    return (
      <AppWindow title="Backup Manager">
        <Shell data-testid="backup-manager">
          <GroupBox label="Restore Proof">
            <Hourglass size={30} />
          </GroupBox>
        </Shell>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Backup Manager">
      <Shell data-testid="backup-manager">
        <StatusGrid>
          <StatusCell $tone={canClaimSafety ? "ok" : "warn"}>
            <StatusLabel>Safety Claim</StatusLabel>
            <StatusValue>{canClaimSafety ? "proven" : "not proven"}</StatusValue>
          </StatusCell>
          <StatusCell $tone={latestRun?.status === "success" ? "ok" : "warn"}>
            <StatusLabel>Backup Job</StatusLabel>
            <StatusValue>{latestRun?.status ?? "missing"}</StatusValue>
          </StatusCell>
          <StatusCell $tone={proof?.restoreDrill?.status === "passed" ? "ok" : "warn"}>
            <StatusLabel>Restore Drill</StatusLabel>
            <StatusValue>{proof?.restoreDrill?.status ?? "missing"}</StatusValue>
          </StatusCell>
          <StatusCell $tone={proofQuery.isError ? "error" : "ok"}>
            <StatusLabel>Fetched</StatusLabel>
            <StatusValue>{formatDate(proofQuery.data?.fetchedAt)}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Actions>
          <ActionButton onClick={() => open("/recovery-mode", "recovery-mode")}>
            <ArchiveRestore size={14} aria-hidden />
            Recovery Mode
          </ActionButton>
          <ActionButton onClick={() => open("/admin", "admin")}>
            <FileCheck2 size={14} aria-hidden />
            Admin Logs
          </ActionButton>
          <ActionButton onClick={() => proofQuery.refetch()}>
            <HardDriveDownload size={14} aria-hidden />
            Refresh
          </ActionButton>
        </Actions>

        <Separator />

        {proofQuery.isError ? (
          <GroupBox label="Error">
            <Row>
              <ShieldAlert size={16} aria-hidden />
              <div>
                <RowTitle>Restore proof unavailable</RowTitle>
                <RowMeta>
                  {proofQuery.error instanceof Error
                    ? proofQuery.error.message
                    : "Backup proof request failed"}
                </RowMeta>
              </div>
              <Badge>error</Badge>
            </Row>
          </GroupBox>
        ) : (
          <DetailGrid>
            <GroupBox label="Requirements">
              <Rows>
                {(proof?.requirements ?? []).map((requirement) => (
                  <Row key={requirement.key}>
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
            </GroupBox>

            <GroupBox label="Artifact">
              <Rows>
                <Row>
                  <DatabaseBackup size={16} aria-hidden />
                  <div>
                    <RowTitle>{proof?.backup?.filename ?? "No backup artifact"}</RowTitle>
                    <RowMeta>
                      {formatBytes(proof?.backup?.bytes)} - {formatDate(proof?.backup?.createdAt)}
                    </RowMeta>
                  </div>
                  <Badge $ok={Boolean(proof?.backup?.sha256)}>sha</Badge>
                </Row>
                <Row>
                  <FileCheck2 size={16} aria-hidden />
                  <div>
                    <RowTitle>Checksum</RowTitle>
                    <RowMeta>{shortHash(proof?.backup?.sha256)}</RowMeta>
                  </div>
                  <Badge $ok={Boolean(proof?.backup?.sha256)}>proof</Badge>
                </Row>
                <Row>
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
            </GroupBox>
          </DetailGrid>
        )}

        <GroupBox label="Targets">
          <Rows>
            {(proof?.targets ?? []).length === 0 ? (
              <Row>
                <ShieldAlert size={16} aria-hidden />
                <div>
                  <RowTitle>No target proof</RowTitle>
                  <RowMeta>No successful local or off-host retention target was returned.</RowMeta>
                </div>
                <Badge>open</Badge>
              </Row>
            ) : (
              proof!.targets.map((target) => (
                <Row key={target.name}>
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
              ))
            )}
          </Rows>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
