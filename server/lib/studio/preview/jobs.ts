import { Readable } from "stream";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../db";
import { studioFiles, studioProjects } from "@shared/schema";
import { resolveDriverForProject } from "../driver-registry";
import { reserveStorage } from "../quota";
import { generatePreview } from "./pipeline";
import { register as registerJob } from "../../scheduler";
import { logSystemEvent } from "../../system-log";
import type { StorageDriver, DriverContext } from "../storage-driver";
import { broadcastStudioEvent } from "../../../websocket";
import {
  buildStudioPreviewMetadata,
  previewState,
  type StudioPreviewStatus,
} from "./metadata";

export const STUDIO_PREVIEW_JOB_NAME = "studio-preview-derivatives";

const STUDIO_PREVIEW_INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.STUDIO_PREVIEW_JOB_INTERVAL_MS || 60_000)
);
const STUDIO_PREVIEW_INITIAL_DELAY_MS = Math.max(
  5_000,
  Number(process.env.STUDIO_PREVIEW_JOB_INITIAL_DELAY_MS || 45_000)
);
const STUDIO_PREVIEW_BATCH_SIZE = Math.max(
  1,
  Math.min(25, Number(process.env.STUDIO_PREVIEW_JOB_BATCH_SIZE || 3))
);
const STUDIO_PREVIEW_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.STUDIO_PREVIEW_MAX_ATTEMPTS || 3)
);
const STUDIO_PREVIEW_SOURCE_MAX_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.STUDIO_PREVIEW_SOURCE_MAX_BYTES || 200 * 1024 * 1024)
);

const queuedFileIds = new Set<number>();

function nowIso(): string {
  return new Date().toISOString();
}

export function enqueueStudioPreview(fileId: number): void {
  if (!Number.isInteger(fileId) || fileId <= 0) return;
  queuedFileIds.add(fileId);
}

function drainQueuedIds(limit: number): number[] {
  const ids: number[] = [];
  for (const id of queuedFileIds) {
    ids.push(id);
    queuedFileIds.delete(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

async function streamToBuffer(
  driver: StorageDriver,
  context: DriverContext,
  uri: string
): Promise<Buffer> {
  const result = await driver.stream(context, uri);
  if (result.sizeBytes > STUDIO_PREVIEW_SOURCE_MAX_BYTES) {
    throw new Error(
      `Studio preview source exceeds ${STUDIO_PREVIEW_SOURCE_MAX_BYTES} bytes`
    );
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of result.stream as Readable) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > STUDIO_PREVIEW_SOURCE_MAX_BYTES) {
      throw new Error(
        `Studio preview source exceeded ${STUDIO_PREVIEW_SOURCE_MAX_BYTES} bytes while streaming`
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total);
}

async function selectQueuedCandidateIds(limit: number): Promise<number[]> {
  const rows = await db
    .select({ id: studioFiles.id })
    .from(studioFiles)
    .where(sql`
      ${studioFiles.deletedAt} IS NULL
      AND ${studioFiles.archived} = false
      AND (
        ${studioFiles.mimeType} LIKE 'image/%'
        OR ${studioFiles.mimeType} LIKE 'video/%'
        OR ${studioFiles.mimeType} LIKE 'audio/%'
        OR ${studioFiles.mimeType} = 'application/pdf'
      )
      AND (
        ${studioFiles.mimeType} LIKE 'audio/%'
        OR ${studioFiles.mimeType} = 'application/pdf'
        OR ${studioFiles.previewUri} IS NULL
        OR ${studioFiles.thumbnailUri} IS NULL
      )
      AND (
        (${studioFiles.metadata}->'studioPreview'->>'status') IS NULL
        OR (${studioFiles.metadata}->'studioPreview'->>'status') = 'queued'
        OR (
          (${studioFiles.metadata}->'studioPreview'->>'status') = 'processing'
          AND ${studioFiles.updatedAt} < NOW() - INTERVAL '15 minutes'
        )
        OR (
          (${studioFiles.metadata}->'studioPreview'->>'status') = 'failed'
          AND COALESCE((${studioFiles.metadata}->'studioPreview'->>'attempts')::int, 0) < ${STUDIO_PREVIEW_MAX_ATTEMPTS}
        )
      )
    `)
    .orderBy(asc(studioFiles.updatedAt), asc(studioFiles.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

async function loadFiles(ids: number[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      file: studioFiles,
      project: studioProjects,
    })
    .from(studioFiles)
    .innerJoin(studioProjects, eq(studioFiles.projectId, studioProjects.id))
    .where(and(inArray(studioFiles.id, ids), isNull(studioFiles.deletedAt)));
}

async function markFile(
  fileId: number,
  metadata: Record<string, unknown>
): Promise<void> {
  await db
    .update(studioFiles)
    .set({ metadata: metadata as any, updatedAt: new Date() })
    .where(eq(studioFiles.id, fileId));
}

async function processStudioPreviewFile(row: Awaited<ReturnType<typeof loadFiles>>[number]): Promise<"ready" | "skipped" | "failed"> {
  const { file, project } = row;
  const previous = previewState(file.metadata);
  const attempts = Number(previous.attempts || 0) + 1;
  await markFile(
    file.id,
    buildStudioPreviewMetadata(file.metadata, {
      status: "processing",
      startedAt: nowIso(),
      attempts,
      source: String(previous.source || "scheduler"),
      previewUri: file.previewUri,
      thumbnailUri: file.thumbnailUri,
    })
  );

  try {
    const { driver, context } = resolveDriverForProject(project);
    const buffer = await streamToBuffer(driver, context, file.sourceUri);
    const output = await generatePreview(driver, context, {
      buffer,
      mimeType: file.mimeType,
      filename: file.name || "studio-file",
    });

    let previewUri = output.preview?.uri ?? file.previewUri;
    let thumbnailUri = output.thumbnail?.uri ?? file.thumbnailUri;
    let derivativeBytes =
      (output.preview?.sizeBytes ?? 0) + (output.thumbnail?.sizeBytes ?? 0);
    let status: StudioPreviewStatus = "ready";

    if (derivativeBytes > 0) {
      try {
        await reserveStorage(file.projectId, derivativeBytes);
      } catch {
        if (output.preview?.uri) {
          await driver.remove(context, output.preview.uri).catch(() => null);
          previewUri = file.previewUri;
        }
        if (output.thumbnail?.uri) {
          await driver.remove(context, output.thumbnail.uri).catch(() => null);
          thumbnailUri = file.thumbnailUri;
        }
        derivativeBytes = 0;
        status = "quota_skipped";
      }
    }

    const hasDerivative = Boolean(previewUri || thumbnailUri);
    const hasMetadata = Object.keys(output.metadata || {}).length > 0;
    if (!hasDerivative && !hasMetadata && status === "ready") {
      status = "skipped";
    }

    await db
      .update(studioFiles)
      .set({
        previewUri,
        thumbnailUri,
        metadata: buildStudioPreviewMetadata(
          file.metadata,
          {
            status,
            attempts,
            finishedAt: nowIso(),
            source: String(previous.source || "scheduler"),
            previewUri,
            thumbnailUri,
          },
          output.metadata
        ) as any,
        updatedAt: new Date(),
      })
      .where(eq(studioFiles.id, file.id));

    broadcastStudioEvent(file.projectId, "studio_file_updated", {
      fileId: file.id,
      source: "studio-preview-derivatives",
      hasPreview: Boolean(previewUri),
      hasThumbnail: Boolean(thumbnailUri),
      previewStatus: status,
    });

    if (status === "quota_skipped") {
      logSystemEvent({
        source: "studio",
        eventType: "studio.preview.quota_skipped",
        severity: "warn",
        message: `Studio preview derivatives exceeded project quota for file ${file.id}`,
        metadata: { fileId: file.id, projectId: file.projectId, derivativeBytes },
      });
      return "skipped";
    }
    return status === "skipped" ? "skipped" : "ready";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalStatus: StudioPreviewStatus =
      attempts >= STUDIO_PREVIEW_MAX_ATTEMPTS ? "failed" : "queued";
    await markFile(
      file.id,
      buildStudioPreviewMetadata(file.metadata, {
        status: finalStatus,
        attempts,
        finishedAt: nowIso(),
        source: String(previous.source || "scheduler"),
        lastError: message.slice(0, 500),
        previewUri: file.previewUri,
        thumbnailUri: file.thumbnailUri,
      })
    );
    logSystemEvent({
      source: "studio",
      eventType: "studio.preview.failed",
      severity: finalStatus === "failed" ? "error" : "warn",
      message: `Studio preview generation failed for file ${file.id}`,
      metadata: { fileId: file.id, projectId: file.projectId, attempts },
      error: err,
    });
    return "failed";
  }
}

export async function runStudioPreviewDerivativeJob() {
  const directIds = drainQueuedIds(STUDIO_PREVIEW_BATCH_SIZE);
  const remaining = Math.max(0, STUDIO_PREVIEW_BATCH_SIZE - directIds.length);
  const scannedIds =
    remaining > 0 ? await selectQueuedCandidateIds(remaining) : [];
  const ids = Array.from(new Set([...directIds, ...scannedIds]));
  const rows = await loadFiles(ids);

  let ready = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processStudioPreviewFile(row);
    if (result === "ready") ready += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  return {
    itemsIn: ids.length,
    itemsOut: ready,
    cursorAfter: {
      queuedMemory: queuedFileIds.size,
      ready,
      skipped,
      failed,
    },
  };
}

export function registerStudioPreviewDerivativeJob(): void {
  registerJob({
    name: STUDIO_PREVIEW_JOB_NAME,
    fn: runStudioPreviewDerivativeJob,
    intervalMs: STUDIO_PREVIEW_INTERVAL_MS,
    initialDelayMs: STUDIO_PREVIEW_INITIAL_DELAY_MS,
  });
}
