import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  inAppInventoryItems,
  tokenArchiveJobs,
  tokenMetadata,
  walletHoldings,
} from "@shared/schema";
import { DEFAULT_IPFS_GATEWAYS, extractIpfsPath } from "@shared/ipfs-gateways";
import { register, type JobResult } from "./scheduler";

export const ARCHIVER_SKU = "artifact-archiver-pass";
export const DEFAULT_ARCHIVE_GATEWAY = DEFAULT_IPFS_GATEWAYS[0].replace(/\/+$/, "");

type InventoryLike = {
  sku: string;
  quantity: number;
};

type ArchiveTarget = {
  cidPath: string;
  sourceUri: string;
  archiveUrl: string;
};

type QueueArchiveInput = {
  userId: number;
  tokenContract: string;
  tokenId: string;
};

type WaybackSaveResult = {
  jobId: string | null;
  waybackUrl: string | null;
};

export function hasArchiverEntitlement(inventory: InventoryLike[]): boolean {
  return inventory.some((item) => item.sku === ARCHIVER_SKU && Number(item.quantity) > 0);
}

function ipfsCidPathFromUri(rawUri: string): string | null {
  const path = extractIpfsPath(rawUri);
  return path ? path.split(/[?#]/)[0] || null : null;
}

export function normalizeIpfsArchiveUrl(
  sourceUri: string,
  gatewayBase = DEFAULT_ARCHIVE_GATEWAY
): ArchiveTarget | null {
  const cidPath = ipfsCidPathFromUri(sourceUri);
  if (!cidPath) return null;
  const base = gatewayBase.replace(/\/+$/, "");
  return {
    cidPath,
    sourceUri: String(sourceUri || "").trim(),
    archiveUrl: `${base}/${cidPath.replace(/^\/+/, "")}`,
  };
}

function metadataString(
  meta: Record<string, any>,
  camelKey: string,
  snakeKey: string
): string {
  return String(meta?.[camelKey] || meta?.[snakeKey] || "").trim();
}

export function extractArchiveTargetFromMetadata(
  metadata: Record<string, any> | null | undefined
): ArchiveTarget | null {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const candidates: string[] = [];
  const artifactUri = metadataString(meta, "artifactUri", "artifact_uri");
  const displayUri = metadataString(meta, "displayUri", "display_uri");
  const thumbnailUri = metadataString(meta, "thumbnailUri", "thumbnail_uri");

  if (artifactUri) candidates.push(artifactUri);
  if (displayUri) candidates.push(displayUri);
  if (thumbnailUri) candidates.push(thumbnailUri);

  const formats = Array.isArray(meta.formats) ? meta.formats : [];
  for (const row of formats) {
    const uri = String(row?.uri || "").trim();
    if (uri && !candidates.includes(uri)) candidates.push(uri);
  }

  for (const uri of candidates) {
    const target = normalizeIpfsArchiveUrl(uri);
    if (target) return target;
  }

  return null;
}

export async function userHasArchiverAccess(userId: number): Promise<boolean> {
  const rows = await db
    .select({
      sku: inAppInventoryItems.sku,
      quantity: inAppInventoryItems.quantity,
    })
    .from(inAppInventoryItems)
    .where(
      and(
        eq(inAppInventoryItems.userId, userId),
        eq(inAppInventoryItems.sku, ARCHIVER_SKU)
      )
    )
    .limit(1);
  return hasArchiverEntitlement(rows);
}

export async function assertUserOwnsToken(input: QueueArchiveInput): Promise<boolean> {
  const rows = await db
    .select({ id: walletHoldings.id })
    .from(walletHoldings)
    .where(
      and(
        eq(walletHoldings.userId, input.userId),
        eq(walletHoldings.tokenContract, input.tokenContract),
        eq(walletHoldings.tokenId, input.tokenId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

function mergeTokenMetadata(row: {
  raw: unknown;
  name: string | null;
  thumbnail: string | null;
  artifactUri: string | null;
  displayUri: string | null;
  mimeType: string | null;
  formats: unknown;
}): Record<string, any> {
  const raw = row.raw && typeof row.raw === "object" ? { ...(row.raw as Record<string, any>) } : {};
  if (row.name && !raw.name) raw.name = row.name;
  if (row.thumbnail && !raw.thumbnailUri && !raw.thumbnail_uri) raw.thumbnailUri = row.thumbnail;
  if (row.artifactUri && !raw.artifactUri && !raw.artifact_uri) raw.artifactUri = row.artifactUri;
  if (row.displayUri && !raw.displayUri && !raw.display_uri) raw.displayUri = row.displayUri;
  if (row.mimeType && !raw.mimeType && !raw.mime_type) raw.mimeType = row.mimeType;
  if (row.formats && !raw.formats) raw.formats = row.formats;
  return raw;
}

export async function enqueueTokenArchive(input: QueueArchiveInput): Promise<{
  id: number;
  target: ArchiveTarget;
}> {
  const [row] = await db
    .select({
      raw: tokenMetadata.raw,
      name: tokenMetadata.name,
      thumbnail: tokenMetadata.thumbnail,
      artifactUri: tokenMetadata.artifactUri,
      displayUri: tokenMetadata.displayUri,
      mimeType: tokenMetadata.mimeType,
      formats: tokenMetadata.formats,
    })
    .from(tokenMetadata)
    .where(
      and(
        eq(tokenMetadata.tokenContract, input.tokenContract),
        eq(tokenMetadata.tokenId, input.tokenId)
      )
    )
    .limit(1);

  if (!row) throw new Error("Token metadata not found");

  const target = extractArchiveTargetFromMetadata(mergeTokenMetadata(row));
  if (!target) throw new Error("No IPFS artifact found to archive");

  const [job] = await db
    .insert(tokenArchiveJobs)
    .values({
      requesterUserId: input.userId,
      tokenContract: input.tokenContract,
      tokenId: input.tokenId,
      cidPath: target.cidPath,
      sourceUri: target.sourceUri,
      archiveUrl: target.archiveUrl,
      status: "pending",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        tokenArchiveJobs.tokenContract,
        tokenArchiveJobs.tokenId,
        tokenArchiveJobs.cidPath,
      ],
      set: {
        requesterUserId: input.userId,
        sourceUri: target.sourceUri,
        archiveUrl: target.archiveUrl,
        updatedAt: new Date(),
      },
    })
    .returning({ id: tokenArchiveJobs.id });

  if (!job) throw new Error("Failed to queue archive job");
  return { id: job.id, target };
}

async function submitWaybackSave(archiveUrl: string): Promise<WaybackSaveResult> {
  const accessKey = process.env.ARCHIVE_ACCESS || process.env.WAYBACK_ACCESS_KEY || "";
  const secretKey = process.env.ARCHIVE_SECRET || process.env.WAYBACK_SECRET_KEY || "";
  if (!accessKey || !secretKey) {
    throw new Error("Wayback credentials are not configured");
  }

  const body = new URLSearchParams({
    url: archiveUrl,
    capture_all: "1",
    skip_first_archive: "1",
  });
  const response = await fetch("https://web.archive.org/save", {
    method: "POST",
    headers: {
      Authorization: `LOW ${accessKey}:${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Wayback save failed: ${response.status} ${text.slice(0, 500)}`);
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }

  const jobId = String(parsed?.job_id || parsed?.jobId || "").trim() || null;
  const waybackUrl =
    String(parsed?.wayback_url || parsed?.waybackUrl || parsed?.url || "").trim() ||
    `https://web.archive.org/web/*/${archiveUrl}`;

  return { jobId, waybackUrl };
}

export async function runTokenArchiveWorker(limit = 10): Promise<JobResult> {
  const rows = await db
    .select()
    .from(tokenArchiveJobs)
    .where(inArray(tokenArchiveJobs.status, ["pending", "retry"]))
    .orderBy(tokenArchiveJobs.createdAt)
    .limit(Math.max(1, Math.min(limit, 50)));

  let archived = 0;
  for (const row of rows) {
    const attempts = row.attempts + 1;
    try {
      await db
        .update(tokenArchiveJobs)
        .set({
          status: "submitted",
          attempts,
          submittedAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(eq(tokenArchiveJobs.id, row.id));

      const saved = await submitWaybackSave(row.archiveUrl);

      await db
        .update(tokenArchiveJobs)
        .set({
          status: "archived",
          waybackJobId: saved.jobId,
          waybackUrl: saved.waybackUrl,
          archivedAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(eq(tokenArchiveJobs.id, row.id));
      archived += 1;
    } catch (err) {
      await db
        .update(tokenArchiveJobs)
        .set({
          status: attempts >= 5 ? "failed" : "retry",
          attempts,
          lastError: err instanceof Error ? err.message.slice(0, 1000) : String(err),
          updatedAt: new Date(),
        })
        .where(eq(tokenArchiveJobs.id, row.id));
    }
  }

  return { itemsIn: rows.length, itemsOut: archived };
}

export function registerTokenArchiveWorker(): void {
  register({
    name: "token-archive-worker",
    fn: () => runTokenArchiveWorker(),
    intervalMs: Math.max(
      5 * 60_000,
      Number(process.env.TOKEN_ARCHIVE_INTERVAL_MS || 15 * 60_000)
    ),
    initialDelayMs: 2 * 60_000,
  });
}
