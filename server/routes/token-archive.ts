import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { tokenArchiveJobs } from "@shared/schema";
import {
  assertUserOwnsToken,
  enqueueTokenArchive,
  userHasArchiverAccess,
} from "../lib/token-archive";

const router = Router();

const tokenRefPayload = z.object({
  contract: z.string().trim().regex(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/),
  tokenId: z.string().trim().regex(/^[0-9]+$/),
});

function serializeJob(job: typeof tokenArchiveJobs.$inferSelect) {
  return {
    id: job.id,
    tokenContract: job.tokenContract,
    tokenId: job.tokenId,
    cidPath: job.cidPath,
    sourceUri: job.sourceUri,
    archiveUrl: job.archiveUrl,
    waybackUrl: job.waybackUrl,
    status: job.status,
    attempts: job.attempts,
    lastError: job.lastError,
    submittedAt: job.submittedAt,
    archivedAt: job.archivedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

router.get("/api/archive/token", isAuthenticated, async (req: any, res) => {
  try {
    const user = req.user as { id: number };
    const parsed = tokenRefPayload.safeParse({
      contract: req.query.contract,
      tokenId: req.query.tokenId,
    });
    if (!parsed.success) return res.status(400).json({ error: "Invalid token reference" });
    const rows = await db
      .select()
      .from(tokenArchiveJobs)
      .where(
        and(
          eq(tokenArchiveJobs.tokenContract, parsed.data.contract),
          eq(tokenArchiveJobs.tokenId, parsed.data.tokenId)
        )
      )
      .orderBy(desc(tokenArchiveJobs.createdAt))
      .limit(10);
    res.json({
      access: await userHasArchiverAccess(user.id),
      jobs: rows.map(serializeJob),
    });
  } catch (err) {
    console.error("[token-archive] status failed:", err);
    res.status(500).json({ error: "Failed to load archive status" });
  }
});

router.post("/api/archive/token", isAuthenticated, async (req: any, res) => {
  try {
    const user = req.user as { id: number };
    const parsed = tokenRefPayload.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid token reference" });

    const hasAccess = await userHasArchiverAccess(user.id);
    if (!hasAccess) {
      return res.status(403).json({
        error: "Artifact Archiver Pass required",
        sku: "artifact-archiver-pass",
      });
    }

    const owns = await assertUserOwnsToken({
      userId: user.id,
      tokenContract: parsed.data.contract,
      tokenId: parsed.data.tokenId,
    });
    if (!owns) return res.status(404).json({ error: "Token not found in your holdings" });

    const queued = await enqueueTokenArchive({
      userId: user.id,
      tokenContract: parsed.data.contract,
      tokenId: parsed.data.tokenId,
    });
    res.status(202).json({
      ok: true,
      jobId: queued.id,
      target: queued.target,
      message: "Artifact queued for preservation",
    });
  } catch (err) {
    console.error("[token-archive] enqueue failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to queue archive job" });
  }
});

export default router;
