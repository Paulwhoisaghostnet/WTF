import { and, eq, isNull, or } from "drizzle-orm";
import { db, pool } from "../../db";
import {
  macaroniV35OperationAttempts,
  macaroniV35WorkItems,
} from "@shared/schema";
import { hashMacaroniV35Payload } from "./v35-types";

export type MacaroniV35WorkType =
  | "scan_claims"
  | "arm_fulfillment"
  | "simulate_allocation"
  | "settle_claim"
  | "publish_artifact_car"
  | "publish_metadata_car"
  | "verify_nft_ready"
  | "sweep_funds";

export type MacaroniV35LeasedWork = {
  id: number;
  dropId: number;
  claimFulfillmentId?: number | null;
  dependsOnWorkItemId?: number | null;
  workType: MacaroniV35WorkType;
  semanticKey: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  state: string;
  attemptCount: number;
  operationHash: string | null;
  leaseOwner: string | null;
};

const PRIVATE_WORK_KEY_PARTS = [
  "cid",
  "privatecid",
  "preimage",
  "secret",
  "privatekey",
  "nonce",
  "artifacturi",
  "metadatauri",
] as const;

function isPrivateWorkKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return PRIVATE_WORK_KEY_PARTS.some((part) => normalized.includes(part));
}

export function assertSafeMacaroniV35WorkPayload(value: unknown, path = "payload"): void {
  if (typeof value === "string" && /^ipfs:\/\//i.test(value)) {
    throw new Error(`${path} cannot contain a plaintext IPFS URI`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeMacaroniV35WorkPayload(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isPrivateWorkKey(key)) {
      throw new Error(`${path}.${key} is forbidden; queue asset ids or encrypted references instead`);
    }
    assertSafeMacaroniV35WorkPayload(item, `${path}.${key}`);
  }
}

export async function enqueueMacaroniV35Work(input: {
  dropId: number;
  workType: MacaroniV35WorkType;
  semanticKey: string;
  payload: Record<string, unknown>;
  eligibleAt: Date;
  claimFulfillmentId?: number | null;
  dependsOnWorkItemId?: number | null;
}) {
  assertSafeMacaroniV35WorkPayload(input.payload);
  const payloadHash = hashMacaroniV35Payload(input.payload);
  const [created] = await db.insert(macaroniV35WorkItems).values({
    dropId: input.dropId,
    claimFulfillmentId: input.claimFulfillmentId ?? null,
    dependsOnWorkItemId: input.dependsOnWorkItemId ?? null,
    workType: input.workType,
    semanticKey: input.semanticKey,
    payloadHash,
    payload: input.payload,
    state: "queued",
    eligibleAt: input.eligibleAt,
    nextAttemptAt: input.eligibleAt,
  }).onConflictDoNothing({
    target: [
      macaroniV35WorkItems.dropId,
      macaroniV35WorkItems.workType,
      macaroniV35WorkItems.semanticKey,
    ],
  }).returning();
  const workItem = created ?? (await db.select().from(macaroniV35WorkItems).where(and(
    eq(macaroniV35WorkItems.dropId, input.dropId),
    eq(macaroniV35WorkItems.workType, input.workType),
    eq(macaroniV35WorkItems.semanticKey, input.semanticKey)
  )).limit(1))[0];
  if (!workItem) throw new Error("Could not persist Macaroni V3.5 work item");
  if (workItem.payloadHash !== payloadHash) {
    throw new Error("Macaroni V3.5 semantic work key is already bound to a different payload");
  }
  return { created: Boolean(created), workItem };
}

export async function leaseNextMacaroniV35Work(input: {
  leaseOwner: string;
  leaseDurationMs: number;
  now?: Date;
}): Promise<MacaroniV35LeasedWork | null> {
  if (!input.leaseOwner.trim()) throw new Error("A durable lease owner is required");
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
    throw new Error("Lease duration must be a positive integer");
  }
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: number;
      drop_id: number;
      claim_fulfillment_id: number | null;
      depends_on_work_item_id: number | null;
      work_type: MacaroniV35WorkType;
      semantic_key: string;
      payload_hash: string;
      payload: Record<string, unknown>;
      state: string;
      attempt_count: number;
      operation_hash: string | null;
      lease_owner: string | null;
    }>(`
      WITH candidate AS (
        SELECT id
          FROM macaroni_v35_work_items
         WHERE eligible_at <= $1
           AND next_attempt_at <= $1
           AND (
             depends_on_work_item_id IS NULL
             OR EXISTS (
               SELECT 1 FROM macaroni_v35_work_items dependency
                WHERE dependency.id = macaroni_v35_work_items.depends_on_work_item_id
                  AND dependency.state IN ('applied', 'completed')
             )
           )
           AND (
             state IN ('queued', 'retry_wait')
             OR (state IN ('leased', 'prepared', 'submitted') AND lease_expires_at <= $1)
           )
         ORDER BY next_attempt_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      UPDATE macaroni_v35_work_items AS work
         SET state = 'leased',
             lease_owner = $2,
             lease_expires_at = $3,
             attempt_count = work.attempt_count + 1,
             updated_at = $1
        FROM candidate
       WHERE work.id = candidate.id
      RETURNING work.id, work.drop_id, work.claim_fulfillment_id,
                work.depends_on_work_item_id, work.work_type, work.semantic_key,
                work.payload_hash, work.payload, work.state, work.attempt_count,
                work.operation_hash, work.lease_owner
    `, [now, input.leaseOwner, leaseExpiresAt]);
    await client.query("COMMIT");
    const row = result.rows[0];
    return row ? {
      id: row.id,
      dropId: row.drop_id,
      claimFulfillmentId: row.claim_fulfillment_id,
      dependsOnWorkItemId: row.depends_on_work_item_id,
      workType: row.work_type,
      semanticKey: row.semantic_key,
      payloadHash: row.payload_hash,
      payload: row.payload,
      state: row.state,
      attemptCount: row.attempt_count,
      operationHash: row.operation_hash,
      leaseOwner: row.lease_owner,
    } : null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function enqueueMacaroniV35ClaimWorkflow(input: {
  dropId: number;
  claimFulfillmentId: number;
  claimId: string;
  eligibleAt: Date;
  dependsOnPriorSettlementId?: number | null;
}) {
  const shared = {
    dropId: input.dropId,
    claimFulfillmentId: input.claimFulfillmentId,
    payload: { claimId: input.claimId, claimFulfillmentId: input.claimFulfillmentId },
    eligibleAt: input.eligibleAt,
  };
  const allocation = await enqueueMacaroniV35Work({
    ...shared,
    workType: "simulate_allocation",
    semanticKey: `${input.claimId}:simulate-forced-fifo`,
    dependsOnWorkItemId: input.dependsOnPriorSettlementId ?? null,
  });
  const settlement = await enqueueMacaroniV35Work({
    ...shared,
    workType: "settle_claim",
    semanticKey: `${input.claimId}:settle_claims_v35`,
    dependsOnWorkItemId: allocation.workItem.id,
  });
  const artifact = await enqueueMacaroniV35Work({
    ...shared,
    workType: "publish_artifact_car",
    semanticKey: `${input.claimId}:publish-committed-artifact-car`,
    dependsOnWorkItemId: settlement.workItem.id,
  });
  const metadata = await enqueueMacaroniV35Work({
    ...shared,
    workType: "publish_metadata_car",
    semanticKey: `${input.claimId}:publish-committed-metadata-car`,
    dependsOnWorkItemId: artifact.workItem.id,
  });
  const ready = await enqueueMacaroniV35Work({
    ...shared,
    workType: "verify_nft_ready",
    semanticKey: `${input.claimId}:verify-nft-ready`,
    dependsOnWorkItemId: metadata.workItem.id,
  });
  return { allocation, settlement, artifact, metadata, ready };
}

export type MacaroniV35OperationIntent = {
  requestId: string;
  intent: string;
  network: "mainnet" | "shadownet";
  signer: string | null;
  target: string | null;
  entrypoint: string;
  amountMutez: number;
  expectedPostcondition: Record<string, unknown>;
  parameters: Record<string, unknown>;
};

export function digestMacaroniV35OperationIntent(intent: MacaroniV35OperationIntent) {
  return hashMacaroniV35Payload({
    intent: intent.intent,
    network: intent.network,
    signer: intent.signer,
    target: intent.target,
    entrypoint: intent.entrypoint,
    amountMutez: intent.amountMutez,
    expectedPostcondition: intent.expectedPostcondition,
    parameters: intent.parameters,
  });
}

export type MacaroniV35WorkerRepository = {
  createReadyAttempt(work: MacaroniV35LeasedWork, intent: MacaroniV35OperationIntent, digest: string): Promise<void>;
  persistSubmitted(work: MacaroniV35LeasedWork, intent: MacaroniV35OperationIntent, digest: string, operationHash: string): Promise<void>;
  markConfirming(work: MacaroniV35LeasedWork, operationHash: string): Promise<void>;
  markApplied(work: MacaroniV35LeasedWork, operationHash: string): Promise<void>;
  markNeedsReconciliation(work: MacaroniV35LeasedWork, operationHash: string, error: unknown): Promise<void>;
  markManualReview(work: MacaroniV35LeasedWork, reason: string): Promise<void>;
};

export type MacaroniV35WorkerHandler = {
  buildIntent(work: MacaroniV35LeasedWork): Promise<MacaroniV35OperationIntent>;
  submit(intent: MacaroniV35OperationIntent): Promise<{ operationHash: string }>;
  reconcile(operationHash: string, expectedPostcondition: Record<string, unknown>): Promise<"applied" | "pending" | "failed">;
};

/**
 * Submission and reconciliation are separate durability boundaries.  A work
 * item that already has an operation hash is never submitted again.
 */
export async function executeMacaroniV35LeasedWork(input: {
  work: MacaroniV35LeasedWork;
  repository: MacaroniV35WorkerRepository;
  handler?: MacaroniV35WorkerHandler;
}) {
  if (!input.handler) {
    await input.repository.markManualReview(input.work, "No validated handler exists for this work type");
    return { status: "manual_review" as const };
  }
  const intent = await input.handler.buildIntent(input.work);
  const digest = digestMacaroniV35OperationIntent(intent);
  let operationHash = input.work.operationHash;
  if (!operationHash) {
    await input.repository.createReadyAttempt(input.work, intent, digest);
    const submitted = await input.handler.submit(intent);
    operationHash = submitted.operationHash;
    // This write completes before any confirmation check begins.
    await input.repository.persistSubmitted(input.work, intent, digest, operationHash);
  }
  try {
    await input.repository.markConfirming(input.work, operationHash);
    const result = await input.handler.reconcile(operationHash, intent.expectedPostcondition);
    if (result === "applied") {
      await input.repository.markApplied(input.work, operationHash);
      return { status: "applied" as const, operationHash };
    }
    await input.repository.markNeedsReconciliation(input.work, operationHash, result);
    return { status: "needs_reconciliation" as const, operationHash };
  } catch (error) {
    await input.repository.markNeedsReconciliation(input.work, operationHash, error);
    return { status: "needs_reconciliation" as const, operationHash };
  }
}

export async function persistMacaroniV35SubmittedOperation(input: {
  work: MacaroniV35LeasedWork;
  intent: MacaroniV35OperationIntent;
  digest: string;
  operationHash: string;
}) {
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(macaroniV35OperationAttempts)
      .where(eq(macaroniV35OperationAttempts.requestId, input.intent.requestId)).limit(1))[0];
    if (existing && (existing.intentDigest !== input.digest
      || (existing.operationHash != null && existing.operationHash !== input.operationHash))) {
      throw new Error("Operation request id is already bound to a different intent or operation hash");
    }
    if (!existing) {
      await tx.insert(macaroniV35OperationAttempts).values({
        dropId: input.work.dropId,
        workItemId: input.work.id,
        requestId: input.intent.requestId,
        intent: input.intent.intent,
        intentDigest: input.digest,
        expectedPostcondition: input.intent.expectedPostcondition,
        parameters: input.intent.parameters,
        network: input.intent.network,
        signer: input.intent.signer,
        target: input.intent.target,
        entrypoint: input.intent.entrypoint,
        amountMutez: input.intent.amountMutez,
        state: "submitted",
        operationHash: input.operationHash,
        submittedAt: new Date(),
      });
    } else if (!existing.operationHash) {
      await tx.update(macaroniV35OperationAttempts).set({
        state: "submitted",
        operationHash: input.operationHash,
        submittedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(macaroniV35OperationAttempts.id, existing.id),
        isNull(macaroniV35OperationAttempts.operationHash)
      ));
    }
    const [updated] = await tx.update(macaroniV35WorkItems).set({
      operationHash: input.operationHash,
      state: "submitted",
      submittedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(macaroniV35WorkItems.id, input.work.id),
      eq(macaroniV35WorkItems.payloadHash, input.work.payloadHash),
      or(
        isNull(macaroniV35WorkItems.operationHash),
        eq(macaroniV35WorkItems.operationHash, input.operationHash)
      )
    )).returning();
    if (!updated || updated.operationHash !== input.operationHash) {
      throw new Error("Could not durably bind submitted operation to work item");
    }
    return updated;
  });
}

export async function createMacaroniV35WorkerReadyAttempt(input: {
  work: MacaroniV35LeasedWork;
  intent: MacaroniV35OperationIntent;
  digest: string;
}) {
  const [created] = await db.insert(macaroniV35OperationAttempts).values({
    dropId: input.work.dropId,
    workItemId: input.work.id,
    requestId: input.intent.requestId,
    intent: input.intent.intent,
    intentDigest: input.digest,
    expectedPostcondition: input.intent.expectedPostcondition,
    parameters: input.intent.parameters,
    network: input.intent.network,
    signer: input.intent.signer,
    target: input.intent.target,
    entrypoint: input.intent.entrypoint,
    amountMutez: input.intent.amountMutez,
    state: "ready",
  }).onConflictDoNothing({
    target: macaroniV35OperationAttempts.requestId,
  }).returning();
  const attempt = created ?? (await db.select().from(macaroniV35OperationAttempts)
    .where(eq(macaroniV35OperationAttempts.requestId, input.intent.requestId)).limit(1))[0];
  if (!attempt || attempt.dropId !== input.work.dropId || attempt.workItemId !== input.work.id
    || attempt.intentDigest !== input.digest) {
    throw new Error("Worker request id is already bound to a different immutable intent");
  }
  return attempt;
}

export async function replaceExpiredMacaroniV35WorkerAttempt(input: {
  work: MacaroniV35LeasedWork;
  priorAttemptId: number;
  priorOperationHash: string;
  replacementIntent: MacaroniV35OperationIntent;
  digest: string;
  proof: {
    absentFromIndexer: true;
    absentFromMempool: true;
    signedBranchExpired: true;
    branchLevel: number;
    indexedHeadLevel: number;
    protocolMaxOperationsTtl: number;
    exactPostconditionStillPending: true;
  };
}) {
  return db.transaction(async (tx) => {
    const prior = (await tx.select().from(macaroniV35OperationAttempts).where(and(
      eq(macaroniV35OperationAttempts.id, input.priorAttemptId),
      eq(macaroniV35OperationAttempts.workItemId, input.work.id),
      eq(macaroniV35OperationAttempts.operationHash, input.priorOperationHash)
    )).limit(1))[0];
    if (!prior || prior.intentDigest !== input.digest || prior.reconciledAt || !prior.encryptedSignedBytes) {
      throw new Error("Expired operation replacement is not linked to one unreconciled immutable signed attempt");
    }
    if (digestMacaroniV35OperationIntent(input.replacementIntent) !== input.digest) {
      throw new Error("Replacement operation changed the immutable semantic intent");
    }
    const now = new Date();
    const [closed] = await tx.update(macaroniV35OperationAttempts).set({
      state: "failed",
      error: "Signed Tezos branch expired after the operation was proven absent; a linked identical replacement was opened",
      reconciliation: input.proof,
      reconciledAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35OperationAttempts.id, prior.id),
      isNull(macaroniV35OperationAttempts.reconciledAt)
    )).returning();
    if (!closed) throw new Error("Expired operation attempt changed during replacement reconciliation");
    const [reset] = await tx.update(macaroniV35WorkItems).set({
      operationHash: null,
      state: "leased",
      submittedAt: null,
      lastError: null,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35WorkItems.id, input.work.id),
      eq(macaroniV35WorkItems.payloadHash, input.work.payloadHash),
      eq(macaroniV35WorkItems.operationHash, input.priorOperationHash)
    )).returning();
    if (!reset) throw new Error("Expired operation work item changed before linked replacement");
    const [replacement] = await tx.insert(macaroniV35OperationAttempts).values({
      dropId: input.work.dropId,
      workItemId: input.work.id,
      retryOfAttemptId: prior.id,
      requestId: input.replacementIntent.requestId,
      intent: input.replacementIntent.intent,
      intentDigest: input.digest,
      expectedPostcondition: input.replacementIntent.expectedPostcondition,
      parameters: input.replacementIntent.parameters,
      network: input.replacementIntent.network,
      signer: input.replacementIntent.signer,
      target: input.replacementIntent.target,
      entrypoint: input.replacementIntent.entrypoint,
      amountMutez: input.replacementIntent.amountMutez,
      state: "ready",
      createdAt: now,
      updatedAt: now,
    }).returning();
    return replacement;
  });
}

export async function persistMacaroniV35PreparedSignedOperation(input: {
  work: MacaroniV35LeasedWork;
  intent: MacaroniV35OperationIntent;
  digest: string;
  operationHash: string;
  encryptedSignedBytes: string;
  signedBytesKeyVersion: string;
  signedOperationBranch: string;
  signedBranchLevel: number;
  signerCounter: number;
}) {
  if (!/^B[1-9A-HJ-NP-Za-km-z]{50}$/.test(input.signedOperationBranch)
    || !Number.isSafeInteger(input.signedBranchLevel) || input.signedBranchLevel < 0
    || !Number.isSafeInteger(input.signerCounter) || input.signerCounter < 0) {
    throw new Error("Prepared signed operation is missing a valid immutable branch or signer counter");
  }
  return db.transaction(async (tx) => {
    const attempt = (await tx.select().from(macaroniV35OperationAttempts)
      .where(eq(macaroniV35OperationAttempts.requestId, input.intent.requestId)).limit(1))[0];
    if (!attempt || attempt.workItemId !== input.work.id || attempt.intentDigest !== input.digest) {
      throw new Error("Signed operation has no matching durable ready intent");
    }
    if (attempt.operationHash && (attempt.operationHash !== input.operationHash
      || attempt.encryptedSignedBytes !== input.encryptedSignedBytes
      || attempt.signedBytesKeyVersion !== input.signedBytesKeyVersion
      || attempt.signedOperationBranch !== input.signedOperationBranch
      || attempt.signedBranchLevel !== input.signedBranchLevel
      || attempt.signerCounter !== input.signerCounter)) {
      throw new Error("Prepared signed operation cannot replace prior signed bytes or operation hash");
    }
    if (!attempt.operationHash) {
      await tx.update(macaroniV35OperationAttempts).set({
        operationHash: input.operationHash,
        encryptedSignedBytes: input.encryptedSignedBytes,
        signedBytesKeyVersion: input.signedBytesKeyVersion,
        signedOperationBranch: input.signedOperationBranch,
        signedBranchLevel: input.signedBranchLevel,
        signerCounter: input.signerCounter,
        updatedAt: new Date(),
      }).where(and(
        eq(macaroniV35OperationAttempts.id, attempt.id),
        isNull(macaroniV35OperationAttempts.operationHash)
      ));
    }
    const [workItem] = await tx.update(macaroniV35WorkItems).set({
      operationHash: input.operationHash,
      state: "prepared",
      updatedAt: new Date(),
    }).where(and(
      eq(macaroniV35WorkItems.id, input.work.id),
      eq(macaroniV35WorkItems.payloadHash, input.work.payloadHash),
      or(isNull(macaroniV35WorkItems.operationHash), eq(macaroniV35WorkItems.operationHash, input.operationHash))
    )).returning();
    if (!workItem) throw new Error("Could not durably persist signed operation before injection");
    return workItem;
  });
}

export async function markMacaroniV35SignedOperationInjected(input: {
  workId: number;
  requestId: string;
  operationHash: string;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [attempt] = await tx.update(macaroniV35OperationAttempts).set({
      state: "submitted",
      submittedAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35OperationAttempts.requestId, input.requestId),
      eq(macaroniV35OperationAttempts.operationHash, input.operationHash)
    )).returning();
    if (!attempt) throw new Error("Injected operation is not bound to its durable signed bytes");
    const [work] = await tx.update(macaroniV35WorkItems).set({
      state: "submitted",
      submittedAt: now,
      updatedAt: now,
    }).where(and(
      eq(macaroniV35WorkItems.id, input.workId),
      eq(macaroniV35WorkItems.operationHash, input.operationHash)
    )).returning();
    if (!work) throw new Error("Injected operation is not bound to its durable work item");
    return { attempt, work };
  });
}
