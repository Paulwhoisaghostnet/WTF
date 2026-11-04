import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { horfInspectionApprovals, horfInspectionRequests, horfTokenNonhorseDecisions } from "@shared/schema";
import { db } from "../db";
import { loadInspectionEvidence, HorseTokenIneligibleError, HorseTokenNotFoundError } from "../features/horf/inspections";
import { invalidateHorseTokenEligibilityCache } from "../features/horf/stables/eligibility";
import { currentHorfRole } from "../features/horf/roles";
import { requireHorfCsrf } from "../features/horf/wallet-scope";

const router = Router();
const CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

function tokenKey(body: any): { tokenContract: string; tokenId: string } | null {
  const tokenContract = body?.tokenContract;
  const tokenId = body?.tokenId;
  if (typeof tokenContract !== "string" || !CONTRACT_RE.test(tokenContract) ||
      typeof tokenId !== "string" || !/^\d+$/.test(tokenId)) return null;
  return { tokenContract, tokenId: BigInt(tokenId).toString() };
}

function pendingReport(evidence: Record<string, unknown>): boolean {
  const report = evidence.communityReport;
  return !!report && typeof report === "object" && !Array.isArray(report) &&
    (report as { resolution?: unknown }).resolution === "pending";
}

function reportEvidence(evidence: Record<string, unknown>, reportedAt: string) {
  return { ...evidence, communityReport: { source: "rider", reportedAt, resolution: "pending" } };
}

/** A report enters the existing Marshal queue; it does not hide the card by itself. */
router.post("/api/horf/reports/not-a-horse", requireHorfCsrf, async (req, res) => {
  const key = tokenKey(req.body);
  if (!key) return res.status(400).json({ error: "An exact FA2 contract and token ID are required" });
  try {
    const [pending] = await db.select().from(horfInspectionRequests).where(and(
      eq(horfInspectionRequests.tokenContract, key.tokenContract),
      eq(horfInspectionRequests.tokenId, key.tokenId),
      eq(horfInspectionRequests.status, "pending"),
    )).orderBy(desc(horfInspectionRequests.id)).limit(1);
    if (pending) {
      if (!pendingReport(pending.chainEvidence)) {
        await db.update(horfInspectionRequests).set({
          chainEvidence: reportEvidence(pending.chainEvidence, new Date().toISOString()),
        }).where(and(eq(horfInspectionRequests.id, pending.id), eq(horfInspectionRequests.status, "pending")));
      }
      return res.json({ status: "pending", inspectionId: pending.id });
    }

    // Fresh Objkt metadata and chain identity are captured server-side. The
    // review mode admits HAHA-only candidates without presenting them publicly.
    const evidence = await loadInspectionEvidence(null, key.tokenContract, key.tokenId);
    const [row] = await db.insert(horfInspectionRequests).values({
      submitterAddress: null, source: "community_report", ...key, status: "pending",
      objktMetadata: evidence.objktMetadata,
      chainEvidence: reportEvidence(evidence.chainEvidence, new Date().toISOString()),
    }).onConflictDoNothing().returning();
    if (row) return res.status(201).json({ status: "pending", inspectionId: row.id });
    const [concurrent] = await db.select().from(horfInspectionRequests).where(and(
      eq(horfInspectionRequests.tokenContract, key.tokenContract),
      eq(horfInspectionRequests.tokenId, key.tokenId),
      eq(horfInspectionRequests.status, "pending"),
    )).limit(1);
    if (concurrent) return res.json({ status: "pending", inspectionId: concurrent.id });
    return res.status(409).json({ error: "Marshal queue changed; refresh and try again" });
  } catch (error) {
    if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof HorseTokenIneligibleError) return res.status(422).json({ error: error.message });
    console.error("[horf] not-a-horse report failed:", error);
    return res.status(503).json({ error: "Marshal report queue is temporarily unavailable" });
  }
});

/** A Marshal's direct Hide uses only the selected exact token key. It never
 * waits for Objkt or chain evidence before removing a known false positive. */
router.post("/api/horf/reports/not-a-horse/direct", requireHorfCsrf, async (req, res) => {
  const key = tokenKey(req.body);
  if (!key) return res.status(400).json({ error: "An exact FA2 contract and token ID are required" });
  try {
    const role = await currentHorfRole(req);
    if (!role?.admin && !role?.marshal) return res.status(403).json({ error: "HORF MARSHAL role required" });
    const now = new Date();
    const reason = typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim() : "Marshal confirmed this token is not a horse.";
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(horfTokenNonhorseDecisions).where(and(
        eq(horfTokenNonhorseDecisions.tokenContract, key.tokenContract),
        eq(horfTokenNonhorseDecisions.tokenId, key.tokenId),
      )).limit(1).for("update");
      if (current?.active) return { status: "hidden" as const, inspectionId: current.inspectionId,
        tokenContract: key.tokenContract, tokenId: key.tokenId };

      const [pending] = await tx.select().from(horfInspectionRequests).where(and(
        eq(horfInspectionRequests.tokenContract, key.tokenContract),
        eq(horfInspectionRequests.tokenId, key.tokenId),
        eq(horfInspectionRequests.status, "pending"),
      )).orderBy(desc(horfInspectionRequests.id)).limit(1).for("update");
      let inspectionId: number;
      if (pending) {
        const prior = (pending.chainEvidence.communityReport ?? {}) as Record<string, unknown>;
        const [updated] = await tx.update(horfInspectionRequests).set({
          status: "rejected", reviewedByUserId: role.userId, reviewedAt: now, reviewReason: reason,
          chainEvidence: { ...pending.chainEvidence, communityReport: { ...prior,
            source: "marshal_direct", resolution: "hide", reason,
            reviewedByUserId: role.userId, reviewedAt: now.toISOString() } },
        }).where(and(eq(horfInspectionRequests.id, pending.id),
          eq(horfInspectionRequests.status, "pending"))).returning({ id: horfInspectionRequests.id });
        if (!updated) throw new Error("Pending horse report changed during direct Hide");
        inspectionId = updated.id;
      } else {
        const [created] = await tx.insert(horfInspectionRequests).values({
          submitterAddress: null, source: "open_range",
          ...key, status: "rejected", reviewedByUserId: role.userId,
          reviewedAt: now, reviewReason: reason,
          objktMetadata: { source: "not_fetched", checkedAt: null, name: null,
            description: null, image: null, artifactUri: null, mime: null,
            decimals: null, tags: [] },
          chainEvidence: { source: "not_fetched", checkedAt: null,
            ownerAddress: null, ownerBalance: null, identity: null,
            recentTransfers: [], note: "Objkt and chain evidence not fetched for direct Marshal Hide.",
            communityReport: { source: "marshal_direct", reportedAt: now.toISOString(),
              resolution: "hide", reason, reviewedByUserId: role.userId,
              reviewedAt: now.toISOString() } },
        }).returning({ id: horfInspectionRequests.id });
        inspectionId = created.id;
      }
      await tx.insert(horfTokenNonhorseDecisions).values({
        tokenContract: key.tokenContract, tokenId: key.tokenId, active: true,
        inspectionId, marshalUserId: role.userId, reason, decidedAt: now,
      }).onConflictDoUpdate({
        target: [horfTokenNonhorseDecisions.tokenContract, horfTokenNonhorseDecisions.tokenId],
        set: { active: true, inspectionId, marshalUserId: role.userId, reason, decidedAt: now },
      });
      await tx.update(horfInspectionApprovals).set({ active: false,
        revokedByUserId: role.userId, revokedAt: now,
        revocationReason: `Not a horse: ${reason}` }).where(and(
        eq(horfInspectionApprovals.tokenContract, key.tokenContract),
        eq(horfInspectionApprovals.tokenId, key.tokenId),
        eq(horfInspectionApprovals.active, true),
      ));
      await tx.execute(sql`UPDATE public.horf_season_sync
        SET policy_version = 'marshal-horse-decision-changed', updated_at = now()`);
      return { status: "hidden" as const, inspectionId,
        tokenContract: key.tokenContract, tokenId: key.tokenId };
    });
    invalidateHorseTokenEligibilityCache(result.tokenContract, result.tokenId);
    return res.json(result);
  } catch (error) {
    console.error("[horf] direct Marshal Hide failed:", error);
    return res.status(503).json({ error: "Marshal horse decision is temporarily unavailable" });
  }
});

/** Hide is an exact-token exclusion; Keep dismisses the report only. */
router.post("/api/horf/reports/not-a-horse/:id/decision", requireHorfCsrf, async (req, res) => {
  const id = Number(req.params.id);
  const decision = req.body?.decision;
  const suppliedReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isSafeInteger(id) || id <= 0 || (decision !== "hide" && decision !== "keep") ||
      (decision === "keep" && !suppliedReason)) {
    return res.status(400).json({ error: "Report and Hide or Keep decision are required; Keep also needs a reason" });
  }
  const reason = suppliedReason || "Marshal confirmed this token is not a horse.";
  try {
    const role = await currentHorfRole(req);
    if (!role?.admin && !role?.marshal) return res.status(403).json({ error: "HORF MARSHAL role required" });
    const result = await db.transaction(async (tx) => {
      const [report] = await tx.select().from(horfInspectionRequests)
        .where(eq(horfInspectionRequests.id, id)).limit(1);
      if (!report) return { kind: "missing" as const };
      if (report.status !== "pending" ||
          (report.source !== "community_report" && !pendingReport(report.chainEvidence))) {
        return { kind: "decided" as const };
      }
      const now = new Date();
      const communityReport = (report.chainEvidence.communityReport ?? {}) as Record<string, unknown>;
      const chainEvidence = { ...report.chainEvidence,
        communityReport: { ...communityReport, resolution: decision,
          reason, reviewedByUserId: role.userId, reviewedAt: now.toISOString() } };
      // An owner-submitted inspection can remain pending after the report is
      // dismissed. A confirmed non-horse closes it, since approval is unsafe.
      const nextStatus = decision === "hide" ? "rejected"
        : report.source === "community_report" ? "approved" : "pending";
      const [updated] = await tx.update(horfInspectionRequests).set({
        status: nextStatus, chainEvidence,
        ...(nextStatus !== "pending" ? { reviewedByUserId: role.userId, reviewedAt: now,
          reviewReason: reason } : {}),
      }).where(and(eq(horfInspectionRequests.id, id), eq(horfInspectionRequests.status, "pending"))).returning();
      if (!updated) return { kind: "decided" as const };
      let reclassify = false;
      if (decision === "hide") {
        await tx.insert(horfTokenNonhorseDecisions).values({
          tokenContract: report.tokenContract, tokenId: report.tokenId, active: true,
          inspectionId: id, marshalUserId: role.userId, reason, decidedAt: now,
        }).onConflictDoUpdate({
          target: [horfTokenNonhorseDecisions.tokenContract, horfTokenNonhorseDecisions.tokenId],
          set: { active: true, inspectionId: id, marshalUserId: role.userId, reason, decidedAt: now },
        });
        await tx.update(horfInspectionApprovals).set({ active: false, revokedByUserId: role.userId,
          revokedAt: now, revocationReason: `Not a horse: ${reason}` }).where(and(
          eq(horfInspectionApprovals.tokenContract, report.tokenContract),
          eq(horfInspectionApprovals.tokenId, report.tokenId),
          eq(horfInspectionApprovals.active, true),
        ));
        reclassify = true;
      } else {
        const lifted = await tx.update(horfTokenNonhorseDecisions).set({ active: false, inspectionId: id,
          marshalUserId: role.userId, reason, decidedAt: now }).where(and(
          eq(horfTokenNonhorseDecisions.tokenContract, report.tokenContract),
          eq(horfTokenNonhorseDecisions.tokenId, report.tokenId),
          eq(horfTokenNonhorseDecisions.active, true),
        )).returning({ tokenId: horfTokenNonhorseDecisions.tokenId });
        reclassify = lifted.length > 0;
      }
      // Any change in exact-token horse status must replay all season ledgers
      // before a new reward permit can be issued from stale entitlements.
      if (reclassify) await tx.execute(sql`UPDATE public.horf_season_sync
        SET policy_version = 'marshal-horse-decision-changed', updated_at = now()`);
      return { kind: "ok" as const, status: decision === "hide" ? "hidden" : "kept",
        inspectionId: id, tokenContract: report.tokenContract, tokenId: report.tokenId };
    });
    if (result.kind === "missing") return res.status(404).json({ error: "Report not found" });
    if (result.kind === "decided") return res.status(409).json({ error: "Report has already been decided" });
    invalidateHorseTokenEligibilityCache(result.tokenContract, result.tokenId);
    return res.json(result);
  } catch (error) {
    console.error("[horf] not-a-horse decision failed:", error);
    return res.status(503).json({ error: "Marshal horse decision is temporarily unavailable" });
  }
});

export default router;
