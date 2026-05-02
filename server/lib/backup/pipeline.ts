import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { syncRuns } from "@shared/schema";
import type { JobResult } from "../scheduler";
import { logSystemEvent } from "../system-log";
import { latestLocalDump } from "./fallback";
import { createPgDump } from "./producer";
import { localTarget, sweepLocalBackups } from "./targets/local";
import { supabaseTarget } from "./targets/supabase";
import type { BackupProducer, BackupTargetResult } from "./targets/base";

const BACKUP_JOB_NAME = "supabase-backup";
const COOLDOWN_MS = Number(process.env.BACKUP_COOLDOWN_MS || 23 * 60 * 60 * 1000);

export type BackupRunSummary = {
  jobName: "backup-pipeline";
  startedAt: string;
  finishedAt: string;
  producer:
    | {
        kind: "pg_dump";
        status: "ok";
        bytes: number;
        sha256: string;
        filename: string;
      }
    | { kind: "pg_dump"; status: "error"; error: string }
    | {
        kind: "fallback";
        status: "ok";
        sourceTarget: string;
        bytes: number;
        sha256: string;
        filename: string;
      };
  targets: BackupTargetResult[];
  summary: { ok: number; skipped: number; failed: number };
};

async function shouldSkipForCooldown(): Promise<{ skip: boolean; lastSuccess?: Date }> {
  const rows = await db
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.jobName, BACKUP_JOB_NAME), eq(syncRuns.status, "success")))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
    .catch(() => []);

  const lastSuccess = rows[0]?.startedAt;
  if (!lastSuccess) return { skip: false };
  return {
    skip: Date.now() - lastSuccess.getTime() < COOLDOWN_MS,
    lastSuccess,
  };
}

function producerSummary(artifact: BackupProducer): BackupRunSummary["producer"] {
  if (artifact.kind === "fallback") {
    return {
      kind: "fallback",
      status: "ok",
      sourceTarget: artifact.sourceTarget,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      filename: artifact.filename,
    };
  }
  return {
    kind: "pg_dump",
    status: "ok",
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    filename: artifact.filename,
  };
}

function summarizeTargets(targets: BackupTargetResult[]) {
  return {
    ok: targets.filter((target) => target.status === "ok").length,
    skipped: targets.filter((target) => target.status === "skipped").length,
    failed: targets.filter((target) => target.status === "error").length,
  };
}

function severityForSummary(summary: BackupRunSummary["summary"]) {
  if (summary.failed === 0) return summary.skipped > 0 ? "warn" : "info";
  return summary.ok > 0 ? "warn" : "error";
}

async function produceArtifact(): Promise<BackupProducer> {
  try {
    return await createPgDump();
  } catch (error) {
    logSystemEvent({
      source: "backup",
      eventType: "producer_failed",
      severity: "error",
      message: "pg_dump failed; attempting latest-local fallback",
      error,
    });
    const fallback = await latestLocalDump();
    if (fallback) return fallback;
    throw error;
  }
}

export async function runBackupPipeline(): Promise<JobResult & { skipped?: boolean; reason?: string }> {
  const startupSweep = await sweepLocalBackups();
  const cooldown = await shouldSkipForCooldown();
  if (cooldown.skip) {
    return {
      skipped: true,
      reason: "cooldown",
      cursorAfter: {
        skipped: true,
        reason: "cooldown",
        lastSuccess: cooldown.lastSuccess?.toISOString(),
        startupSweep,
      },
    };
  }

  const startedAt = new Date().toISOString();
  let artifact: BackupProducer;
  try {
    artifact = await produceArtifact();
  } catch (error) {
    const summary: BackupRunSummary = {
      jobName: "backup-pipeline",
      startedAt,
      finishedAt: new Date().toISOString(),
      producer: {
        kind: "pg_dump",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      targets: [],
      summary: { ok: 0, skipped: 0, failed: 0 },
    };
    logSystemEvent({
      source: "backup",
      eventType: "producer_failed_no_fallback",
      severity: "error",
      message: "Backup producer failed and no fallback dump exists",
      metadata: summary,
      error,
    });
    throw error;
  }

  const settled = await Promise.allSettled([
    localTarget.run(artifact),
    supabaseTarget.run(artifact),
  ]);
  const targets = settled.map((result, index): BackupTargetResult => {
    const name = index === 0 ? "local" : "supabase";
    if (result.status === "fulfilled") return result.value;
    return {
      name,
      status: "error",
      bytes: 0,
      durationMs: 0,
      error:
        result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  const summary: BackupRunSummary = {
    jobName: "backup-pipeline",
    startedAt,
    finishedAt: new Date().toISOString(),
    producer: producerSummary(artifact),
    targets,
    summary: summarizeTargets(targets),
  };

  logSystemEvent({
    source: "backup",
    eventType:
      summary.summary.failed > 0 || summary.summary.skipped > 0
        ? "backup_pipeline_degraded"
        : "backup_pipeline_succeeded",
    severity: severityForSummary(summary.summary),
    message: `Backup pipeline finished: ${summary.summary.ok} ok, ${summary.summary.skipped} skipped, ${summary.summary.failed} failed`,
    metadata: summary,
  });

  return {
    itemsIn: artifact.bytes,
    itemsOut: summary.summary.ok,
    cursorAfter: summary,
  };
}
