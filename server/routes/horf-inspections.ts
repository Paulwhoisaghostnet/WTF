import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { horfInspectionApprovals, horfInspectionRequests, horfStableSelections } from "@shared/schema";
import { currentHorfRole } from "../features/horf/roles";
import { isTezosWallet } from "../features/horf/model";
import { horfWalletSource, requireHorfCsrf, requireHorfWallet } from "../features/horf/wallet-scope";
import { assertCurrentOwner, loadInspectionEvidence, HorseTokenIneligibleError, HorseTokenNotFoundError, HorfTokenNotOwnedError } from "../features/horf/inspections";
import { readHorfFa2Identity, identityMatchesApproval, type HorfFa2Identity } from "../features/horf/stables/custody";
import { inspectHorseToken } from "../features/horf/stables/eligibility";

const router = Router();
const CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

function tokenKey(value: any): { tokenContract: string; tokenId: string } | null {
  const tokenContract = value?.tokenContract ?? value?.contract;
  const tokenId = value?.tokenId;
  if (typeof tokenContract !== "string" || !CONTRACT_RE.test(tokenContract) ||
      typeof tokenId !== "string" || !/^\d+$/.test(tokenId)) return null;
  return { tokenContract, tokenId: BigInt(tokenId).toString() };
}

async function adminId(req: any): Promise<number | null> {
  const role = await currentHorfRole(req);
  return role?.admin ? role.userId : null;
}

function inspectionDto(row: typeof horfInspectionRequests.$inferSelect) {
  return {
    id: row.id, submitterAddress: row.submitterAddress,
    token: { contract: row.tokenContract, tokenId: row.tokenId },
    status: row.status, objktMetadata: row.objktMetadata, chainEvidence: row.chainEvidence,
    submittedAt: row.submittedAt.toISOString(), reviewedByWalletAddress: row.reviewedByWalletAddress,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewReason: row.reviewReason,
  };
}

async function status(contract: string, tokenId: string) {
  const [[approval], [latest]] = await Promise.all([
    db.select().from(horfInspectionApprovals).where(and(
      eq(horfInspectionApprovals.tokenContract, contract), eq(horfInspectionApprovals.tokenId, tokenId),
    )).limit(1),
    db.select().from(horfInspectionRequests).where(and(
      eq(horfInspectionRequests.tokenContract, contract), eq(horfInspectionRequests.tokenId, tokenId),
    )).orderBy(desc(horfInspectionRequests.id)).limit(1),
  ]);
  if (approval?.active) return { contract, tokenId, status: "approved", inspectionId: approval.inspectionId,
    reason: latest?.id === approval.inspectionId ? latest.reviewReason : null };
  if (latest?.status === "pending") return { contract, tokenId, status: "pending", inspectionId: latest.id, reason: null };
  if (approval && !approval.active) return { contract, tokenId, status: "revoked", inspectionId: approval.inspectionId,
    reason: approval.revocationReason };
  return { contract, tokenId, status: latest?.status ?? "none", inspectionId: latest?.id ?? null,
    reason: latest?.reviewReason ?? null };
}

async function marshalId(req: any): Promise<{ userId: number; role: "admin" | "horf_marshal" } | null> {
  const current = await currentHorfRole(req);
  if (current?.admin) return { userId: current.userId, role: "admin" };
  return current?.marshal ? { userId: current.userId, role: "horf_marshal" } : null;
}

async function requireMarshal(req: any, res: any): Promise<{ userId: number; role: "admin" | "horf_marshal" } | null> {
  const marshal = await marshalId(req);
  if (!marshal) res.status(403).json({ code: "HORF_MARSHAL_REQUIRED", error: "A signed-in HORF MARSHAL role is required" });
  return marshal;
}

function sourceError(res: any, error: unknown) {
  if (error instanceof HorfTokenNotOwnedError) return res.status(422).json({ code: "HORF_TOKEN_NOT_OWNED", error: error.message });
  if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof HorseTokenIneligibleError) return res.status(422).json({ error: error.message });
  console.error("[horf] inspection source failed:", error);
  return res.status(503).json({ error: "Mainnet token inspection sources are temporarily unavailable" });
}

router.get("/api/horf/inspectors/status", async (req, res) => {
  try {
    const marshal = await marshalId(req);
    return res.json({ active: !!marshal, role: marshal?.role ?? null });
  } catch (error) {
    console.error("[horf] marshal status failed:", error);
    return res.status(503).json({ error: "Marshal status is temporarily unavailable" });
  }
});

router.get("/api/horf/stable-selections", async (req, res) => {
  const address = req.query.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid owner wallet is required" });
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const rows = await db.select().from(horfStableSelections)
      .where(eq(horfStableSelections.ownerWalletAddress, address))
      .orderBy(asc(horfStableSelections.selectedAt), asc(horfStableSelections.id));
    const selections = await Promise.all(rows.map(async (row) => {
      const review = await status(row.tokenContract, row.tokenId);
      return { id: row.id, ownerAddress: address, tokenContract: row.tokenContract,
        tokenId: row.tokenId, selectedAt: row.selectedAt.toISOString(),
        token: { name: row.tokenName || `Token #${row.tokenId}`, image: row.tokenImage },
        inspectionStatus: review.status, inspectionId: review.inspectionId };
    }));
    return res.json({ selections });
  } catch (error) {
    console.error("[horf] stable selections failed:", error);
    return res.status(503).json({ error: "Personal Stable selections are temporarily unavailable" });
  }
});

router.post("/api/horf/stable-selections", requireHorfCsrf, async (req, res) => {
  const address = req.body?.address;
  const key = tokenKey(req.body);
  if (!isTezosWallet(address) || !key) return res.status(400).json({ error: "Owner wallet and FA2 token are required" });
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const [, token] = await Promise.all([assertCurrentOwner(address, key.tokenContract, key.tokenId),
      inspectHorseToken(key.tokenContract, key.tokenId)]);
    await db.insert(horfStableSelections).values({ ownerWalletAddress: address, ...key,
      tokenName: token.name, tokenImage: token.image })
      .onConflictDoNothing({ target: [horfStableSelections.ownerWalletAddress, horfStableSelections.tokenContract, horfStableSelections.tokenId] });
    const [row] = await db.select().from(horfStableSelections).where(and(
      eq(horfStableSelections.ownerWalletAddress, address), eq(horfStableSelections.tokenContract, key.tokenContract),
      eq(horfStableSelections.tokenId, key.tokenId),
    )).limit(1);
    const review = await status(key.tokenContract, key.tokenId);
    return res.json({ id: row.id, ownerAddress: address, ...key, selectedAt: row.selectedAt.toISOString(),
      token: { name: row.tokenName || `Token #${row.tokenId}`, image: row.tokenImage },
      inspectionStatus: review.status, inspectionId: review.inspectionId });
  } catch (error) { return sourceError(res, error); }
});

router.delete("/api/horf/stable-selections/:id", requireHorfCsrf, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid Stable selection" });
  try {
    const [row] = await db.select().from(horfStableSelections).where(eq(horfStableSelections.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Stable selection not found" });
    if (!(await requireHorfWallet(req, res, row.ownerWalletAddress))) return;
    await db.delete(horfStableSelections).where(and(eq(horfStableSelections.id, id),
      eq(horfStableSelections.ownerWalletAddress, row.ownerWalletAddress)));
    return res.status(204).end();
  } catch (error) {
    console.error("[horf] Stable selection removal failed:", error);
    return res.status(503).json({ error: "Stable selection could not be removed" });
  }
});

router.get("/api/horf/inspections/status", async (req, res) => {
  const key = tokenKey(req.query);
  if (!key) return res.status(400).json({ error: "FA2 contract and token ID are required" });
  try { return res.json(await status(key.tokenContract, key.tokenId)); }
  catch (error) {
    console.error("[horf] inspection status failed:", error);
    return res.status(503).json({ error: "Inspection status is temporarily unavailable" });
  }
});

router.post("/api/horf/inspections", requireHorfCsrf, async (req, res) => {
  const address = req.body?.address;
  const key = tokenKey(req.body);
  if (!isTezosWallet(address) || !key) return res.status(400).json({ error: "Owner wallet and FA2 token are required" });
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    const [selection] = await db.select({ id: horfStableSelections.id }).from(horfStableSelections)
      .where(and(eq(horfStableSelections.ownerWalletAddress, address),
        eq(horfStableSelections.tokenContract, key.tokenContract), eq(horfStableSelections.tokenId, key.tokenId))).limit(1);
    if (!selection) return res.status(409).json({ error: "Add this owned horse to your Personal Stable before submitting it" });
    const review = await status(key.tokenContract, key.tokenId);
    if (review.status === "approved") return res.status(409).json({ code: "HORF_ALREADY_APPROVED", error: "This token is already approved globally" });
    const [pending] = await db.select().from(horfInspectionRequests)
      .where(and(eq(horfInspectionRequests.tokenContract, key.tokenContract),
        eq(horfInspectionRequests.tokenId, key.tokenId), eq(horfInspectionRequests.status, "pending")))
      .orderBy(desc(horfInspectionRequests.id)).limit(1);
    if (pending) return res.json(inspectionDto(pending));
    const evidence = await loadInspectionEvidence(address, key.tokenContract, key.tokenId);
    const [row] = await db.insert(horfInspectionRequests).values({ submitterAddress: address,
      ...key, status: "pending", ...evidence }).onConflictDoNothing().returning();
    if (row) return res.status(201).json(inspectionDto(row));
    const [concurrent] = await db.select().from(horfInspectionRequests)
      .where(and(eq(horfInspectionRequests.tokenContract, key.tokenContract),
        eq(horfInspectionRequests.tokenId, key.tokenId), eq(horfInspectionRequests.status, "pending"))).limit(1);
    return concurrent ? res.json(inspectionDto(concurrent))
      : res.status(409).json({ error: "Inspection state changed; refresh its status" });
  } catch (error) { return sourceError(res, error); }
});

router.get("/api/horf/inspections/pending", async (req, res) => {
  try {
    if (!(await requireMarshal(req, res))) return;
    const rows = await db.select().from(horfInspectionRequests)
      .where(eq(horfInspectionRequests.status, "pending"))
      .orderBy(asc(horfInspectionRequests.submittedAt), asc(horfInspectionRequests.id));
    return res.json({ inspections: rows.map(inspectionDto) });
  } catch (error) {
    console.error("[horf] inspector queue failed:", error);
    return res.status(503).json({ error: "Inspection queue is temporarily unavailable" });
  }
});

router.get("/api/horf/inspections/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid inspection" });
  try {
    if (!(await requireMarshal(req, res))) return;
    const [row] = await db.select().from(horfInspectionRequests).where(eq(horfInspectionRequests.id, id)).limit(1);
    return row ? res.json(inspectionDto(row)) : res.status(404).json({ error: "Inspection not found" });
  } catch (error) {
    console.error("[horf] inspector detail failed:", error);
    return res.status(503).json({ error: "Inspection detail is temporarily unavailable" });
  }
});

router.post("/api/horf/inspections/:id/decision", requireHorfCsrf, async (req, res) => {
  const id = Number(req.params.id);
  const address = req.body?.address;
  const decision = req.body?.decision;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isSafeInteger(id) || id <= 0 || (address != null && !isTezosWallet(address)) ||
      (decision !== "approve" && decision !== "reject") || !reason) {
    return res.status(400).json({ error: "Inspection, decision, reason, and optional Tezos wallet are required" });
  }
  try {
    const marshal = await requireMarshal(req, res);
    if (!marshal) return;
    if (address && !(await horfWalletSource(req, address))) {
      return res.status(403).json({ error: "Reviewer wallet must be proven in this session or linked to this account" });
    }
    const [request] = await db.select().from(horfInspectionRequests).where(eq(horfInspectionRequests.id, id)).limit(1);
    if (!request) return res.status(404).json({ error: "Inspection not found" });
    if (request.status !== "pending") return res.status(409).json({ error: "Inspection has already been decided" });
    let identity: HorfFa2Identity | null = null;
    if (decision === "approve") {
      await inspectHorseToken(request.tokenContract, request.tokenId);
      identity = await readHorfFa2Identity(request.tokenContract);
      const submitted = request.chainEvidence.identity as HorfFa2Identity | undefined;
      if (!submitted || !identityMatchesApproval(identity, { active: true,
        tokenContract: request.tokenContract, creatorAddress: submitted.creatorAddress,
        codeHash: submitted.codeHash, codeSha256: submitted.codeSha256 })) {
        return res.status(422).json({ code: "HORF_IDENTITY_CHANGED", error: "FA2 identity changed since submission; submit a fresh inspection" });
      }
    }
    const reviewedAt = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(horfInspectionRequests).set({
        status: decision === "approve" ? "approved" : "rejected",
        reviewedByWalletAddress: address || null, reviewedByUserId: marshal.userId,
        reviewedAt, reviewReason: reason,
      }).where(and(eq(horfInspectionRequests.id, id), eq(horfInspectionRequests.status, "pending"))).returning();
      if (!row) return null;
      if (identity) {
        await tx.insert(horfInspectionApprovals).values({ tokenContract: row.tokenContract, tokenId: row.tokenId,
          active: true, inspectionId: row.id, inspectorWalletAddress: address || null,
          inspectorUserId: marshal.userId, approvedAt: reviewedAt,
          creatorAddress: identity.creatorAddress, codeHash: identity.codeHash, codeSha256: identity.codeSha256,
        }).onConflictDoUpdate({ target: [horfInspectionApprovals.tokenContract, horfInspectionApprovals.tokenId],
          set: { active: true, inspectionId: row.id, inspectorWalletAddress: address || null,
            inspectorUserId: marshal.userId, approvedAt: reviewedAt,
            creatorAddress: identity.creatorAddress, codeHash: identity.codeHash, codeSha256: identity.codeSha256,
            revokedByUserId: null, revokedAt: null, revocationReason: null } });
      }
      return row;
    });
    return updated ? res.json(inspectionDto(updated)) : res.status(409).json({ error: "Inspection has already been decided" });
  } catch (error) { return sourceError(res, error); }
});

router.post("/api/horf/admin/inspection-approvals/:contract/:tokenId/revoke", requireHorfCsrf, async (req, res) => {
  const actor = await adminId(req);
  if (!actor) return res.status(403).json({ error: "Horf admin access required" });
  const key = tokenKey({ contract: req.params.contract, tokenId: req.params.tokenId });
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!key || !reason) return res.status(400).json({ error: "Approved token and revocation reason are required" });
  try {
    const [row] = await db.update(horfInspectionApprovals).set({ active: false,
      revokedByUserId: actor, revokedAt: new Date(), revocationReason: reason })
      .where(and(eq(horfInspectionApprovals.tokenContract, key.tokenContract),
        eq(horfInspectionApprovals.tokenId, key.tokenId), eq(horfInspectionApprovals.active, true))).returning();
    if (!row) return res.status(404).json({ error: "Active token approval not found" });
    return res.json({ ...(await status(key.tokenContract, key.tokenId)),
      existingPermitsMayRemainValid: true,
      requiredOnChainAction: "The Stable admin must bump oracle_epoch to invalidate previously issued one-use permits. The HORSE Market admin must set_token_blocked for this contract and token ID to stop direct on-chain purchases of existing listings." });
  } catch (error) {
    console.error("[horf] approval revocation failed:", error);
    return res.status(503).json({ error: "Token approval could not be revoked" });
  }
});

export default router;
