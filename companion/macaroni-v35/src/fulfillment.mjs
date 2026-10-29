import { digest } from "./journal.mjs";
import { allocationDigest, expandPhysicalSlots, simulateSwapPop } from "./protocol.mjs";
import { recoverEntropyFromKeyring } from "./crypto-store.mjs";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function setupBlockerCode(error) {
  const message = errorMessage(error);
  if (/Fulfillment reserve changed after preflight/.test(message)) return "contract_reserve_changed";
  if (/Finalizer readiness changed after preflight|Finalizer account must be revealed|Finalizer wallet has .* mutez but this operation requires/.test(message)) {
    return "finalizer_funding_or_reveal";
  }
  if (/Estimated .* cost .* exceeds .* fulfillment subsidy/.test(message)) return "fee_cap_exceeded";
  if (/(?:CAR provider|Kubo CAR import|Kubo recursive pin verification) failed with HTTP (?:401|403)/.test(message)) {
    return "pinning_authorization";
  }
  if (/CAR root does not match|did not acknowledge the precommitted CAR root|returned a root that differs from the commitment/.test(message)) {
    return "pinning_integrity";
  }
  if (/No CAR-capable pinning adapter is configured/.test(message)) return "pinning_configuration";
  return null;
}

function finalizedFailureEvidence(operation) {
  if (operation?.signed_attempt_state !== "failed") return false;
  try {
    const evidence = JSON.parse(operation.reconciliation_json || "{}");
    return evidence.operationHash === operation.operation_hash
      && Number.isSafeInteger(evidence.level)
      && Number.isSafeInteger(evidence.finalizedAtHeadLevel)
      && evidence.finalizedAtHeadLevel >= evidence.level + 2;
  } catch {
    return false;
  }
}

export class CompanionFulfillmentRuntime {
  constructor({ config, journal, watcher, projectService, blockTimingMs }) {
    this.config = config;
    this.journal = journal;
    this.watcher = watcher;
    this.projectService = projectService;
    this.blockTimingMs = blockTimingMs;
    this.running = false;
    this.timer = null;
    this.activeTick = null;
  }

  async attentionStatus(dropRef, workId = null) {
    const project = this.journal.getProject(dropRef);
    if (!project) return null;
    const rows = this.journal.listAttentionWork(dropRef);
    const selected = workId == null ? rows : rows.filter((row) => row.id === workId);
    return Promise.all(selected.map(async (row) => {
      if (row.state === "retry_wait" && ["publish_artifact_car", "publish_metadata_car"].includes(row.work_type)) {
        return {
          id: row.id, claimId: Number(row.claim_ref), workType: row.work_type, state: row.state,
          updatedAt: row.updated_at, nextAttemptAt: row.next_attempt_at, attemptNumber: row.attempt_count,
          operationHash: null, signedAttemptState: null, diagnostic: "pinning_retrying",
          chainState: "publication_retrying", retrySafe: false,
        };
      }
      const operation = this.journal.getOperationForWork(row.id);
      let chainState = "not_signed";
      if (operation?.signed_attempt_id) {
        if (["applied", "failed", "expired"].includes(operation.signed_attempt_state)) {
          chainState = operation.signed_attempt_state;
        } else {
          try {
            const input = {
              project,
              operationHash: operation.operation_hash,
              managerCounter: operation.manager_counter,
              branch: operation.branch,
              branchLevel: operation.branch_level,
            };
            const status = row.work_type === "arm_fulfillment"
              ? await this.watcher.preparedArmStatus(input)
              : row.work_type === "settle_claim"
                ? await this.watcher.preparedSettlementStatus({ ...input, claimId: Number(row.claim_ref) })
                : { state: "unsupported_work_type" };
            chainState = status.state;
          } catch {
            chainState = "chain_status_unavailable";
          }
        }
      }
      return {
        id: row.id,
        claimId: row.claim_ref == null ? null : Number(row.claim_ref),
        workType: row.work_type,
        state: row.state,
        updatedAt: row.updated_at,
        operationHash: operation?.operation_hash || null,
        attemptNumber: operation?.attempt_number || row.attempt_count || 0,
        signedAttemptState: operation?.signed_attempt_state || null,
        diagnostic: row.last_error?.startsWith("setup_blocked:") ? row.last_error.slice("setup_blocked:".length) : null,
        chainState,
        retrySafe: chainState === "not_signed" || finalizedFailureEvidence(operation) || [
          "safe_to_inject_exact_bytes", "mempool", "indexed", "chain_included", "safe_to_replace_expired",
        ].includes(chainState),
      };
    }));
  }

  async retryAttention(dropRef, workId) {
    const status = await this.attentionStatus(dropRef, workId);
    if (!status) return null;
    if (status.length !== 1) return { accepted: false, code: "attention_work_not_found" };
    const item = status[0];
    if (!item.retrySafe) return { accepted: false, code: item.state === "retry_wait" ? "publication_already_retrying" : "signed_attempt_unresolved", item };
    this.journal.retryWork(workId, Date.now(), "Operator requested a chain-checked recovery");
    await this.wake();
    return { accepted: true, item: (await this.attentionStatus(dropRef, workId))?.[0] || null };
  }

  enqueueClaimWorkflow(project, claim, eligibleAt) {
    const priorSettlement = claim.claim_id > 0
      ? this.journal.getWorkByKey(project.drop_ref, "settle_claim", `${claim.claim_id - 1}:settle_claims_v35`)
      : null;
    const simulation = this.journal.enqueue({
      dropRef: project.drop_ref,
      claimRef: String(claim.claim_id),
      workType: "simulate_allocation",
      semanticKey: `${claim.claim_id}:simulate_forced_fifo`,
      payload: { claimId: claim.claim_id },
      dependsOnId: priorSettlement?.id ?? null,
      eligibleAt,
    });
    const settlement = this.journal.enqueue({
      dropRef: project.drop_ref,
      claimRef: String(claim.claim_id),
      workType: "settle_claim",
      semanticKey: `${claim.claim_id}:settle_claims_v35`,
      payload: { claimId: claim.claim_id },
      dependsOnId: simulation.id,
      eligibleAt,
    });
    const artifact = this.journal.enqueue({
      dropRef: project.drop_ref,
      claimRef: String(claim.claim_id),
      workType: "publish_artifact_car",
      semanticKey: `${claim.claim_id}:publish_committed_artifact_car`,
      payload: { claimId: claim.claim_id },
      dependsOnId: settlement.id,
      eligibleAt,
    });
    const display = this.journal.enqueue({
      dropRef: project.drop_ref,
      claimRef: String(claim.claim_id),
      workType: "publish_display_car",
      semanticKey: `${claim.claim_id}:publish_optional_display_car`,
      payload: { claimId: claim.claim_id },
      dependsOnId: artifact.id,
      eligibleAt,
    });
    const thumbnail = this.journal.enqueue({
      dropRef: project.drop_ref,
      claimRef: String(claim.claim_id),
      workType: "publish_thumbnail_car",
      semanticKey: `${claim.claim_id}:publish_optional_thumbnail_car`,
      payload: { claimId: claim.claim_id },
      dependsOnId: display.id,
      eligibleAt,
    });
    const metadata = this.journal.enqueue({
      dropRef: project.drop_ref,
      claimRef: String(claim.claim_id),
      workType: "publish_metadata_car",
      semanticKey: `${claim.claim_id}:publish_committed_metadata_car`,
      payload: { claimId: claim.claim_id },
      dependsOnId: thumbnail.id,
      eligibleAt,
    });
    this.journal.enqueue({
      dropRef: project.drop_ref,
      claimRef: String(claim.claim_id),
      workType: "verify_nft_ready",
      semanticKey: `${claim.claim_id}:verify_nft_ready`,
      payload: { claimId: claim.claim_id },
      dependsOnId: metadata.id,
      eligibleAt,
    });
  }

  async scanProject(project) {
    const scanned = await this.watcher.scanClaims({
      project,
      fromClaimId: this.journal.nextUnobservedClaimId(project.drop_ref),
    });
    scanned.claims.forEach((claim) => this.journal.upsertClaim({ dropRef: project.drop_ref, ...claim }));
    const permanentlyClosed = scanned.storage.sale_permanently_closed === true;
    this.journal.updateLifecycle(project.drop_ref, {
      saleActivated: scanned.storage.sale_activated === true,
      salePermanentlyClosed: permanentlyClosed,
      fulfillmentArmed: scanned.storage.fulfillment_armed === true,
      finalSweepComplete: scanned.storage.final_sweep_complete === true,
    });

    if (project.state === "armed") {
      if (scanned.storage.sale_activated !== true) {
        if (scanned.claimsCreated !== 0 || scanned.claimsSettled !== 0) {
          throw new Error("Closed armed contract unexpectedly contains purchase claims");
        }
        if (permanentlyClosed) {
          await this.watcher.verifyContractBinding(project, this.journal.listTokens(project.drop_ref));
          if (scanned.storage.final_sweep_complete !== true) {
            throw new Error("Permanently closed pre-activation contract has not completed its final sweep");
          }
          const armWork = this.journal.getWorkByKey(project.drop_ref, "arm_fulfillment", "arm_fulfillment:v1");
          const armAttempt = armWork ? this.journal.getOperationForWork(armWork.id) : null;
          if (armWork && armWork.state !== "completed" && !armAttempt?.signed_attempt_id) {
            this.journal.retireObsoleteOperationWork(armWork.id, {
              reason: "sale_permanently_closed_before_arm_signature",
              finalizedChainLevel: scanned.level,
            });
          }
          const currentArmWork = armWork ? this.journal.getWork(armWork.id) : null;
          this.journal.setProjectState(project.drop_ref, currentArmWork && currentArmWork.state !== "completed" ? "finishing" : "complete");
        }
        this.journal.updateScanLevel(project.drop_ref, scanned.level);
        return;
      }
      const soldOut = scanned.claimsCreated === project.physical_supply;
      if (scanned.storage.sale_active !== true && !soldOut && !permanentlyClosed) {
        throw new Error("Activated contract is neither accepting purchases nor sold out");
      }
      await this.watcher.verifyContractBinding(project, this.journal.listTokens(project.drop_ref));
      this.journal.setProjectState(project.drop_ref, soldOut || permanentlyClosed ? "finishing" : "active");
      project = this.journal.getProject(project.drop_ref);
    }

    const claims = this.journal.listClaims(project.drop_ref);
    for (const claim of claims) {
      if (claim.claim_id < scanned.nextClaimToSettle) continue;
      const eligibleAt = this.watcher.releaseEligibleAt(scanned.storage, {
        purchaseTime: claim.purchase_time,
      });
      if (eligibleAt == null) continue;
      if (claim.claim_id > 0 && !this.journal.getWorkByKey(
        project.drop_ref,
        "settle_claim",
        `${claim.claim_id - 1}:settle_claims_v35`
      )) continue;
      this.enqueueClaimWorkflow(project, claim, eligibleAt);
    }
    this.journal.updateScanLevel(project.drop_ref, scanned.level);
    if ((scanned.claimsCreated === project.physical_supply || permanentlyClosed)
      && scanned.claimsSettled < scanned.claimsCreated) {
      this.journal.setProjectState(project.drop_ref, "finishing");
    }
    const stats = this.journal.publicStats(project.drop_ref);
    if (stats.ready === scanned.claimsCreated && scanned.claimsSettled === scanned.claimsCreated
      && scanned.storage.final_sweep_complete === true) {
      this.journal.setProjectState(project.drop_ref, "complete");
    }
  }

  async reconstructAllocation(project, targetClaimId) {
    const tokens = this.journal.listTokens(project.drop_ref);
    let slots = expandPhysicalSlots(tokens);
    if (slots.length !== project.physical_supply) throw new Error("Private slot pool no longer matches fixed physical supply");
    const entropy = await recoverEntropyFromKeyring({
      encryptedPath: project.entropy_keyring_path,
      masterKeyFile: this.config.masterKeyFile,
      expectedHead: project.entropy_head,
      expectedLength: project.entropy_length,
    });
    const claims = this.journal.listClaims(project.drop_ref);
    let target = null;
    for (let claimId = 0; claimId <= targetClaimId; claimId += 1) {
      const claim = claims[claimId];
      if (!claim || claim.claim_id !== claimId) throw new Error(`Local FIFO claim ${claimId} is missing`);
      const entropyPreimage = entropy.preimages[claimId];
      const hash = allocationDigest({
        chainId: this.config.expectedChainId,
        contractAddress: project.contract_address,
        creator: project.creator,
        claimId,
        buyer: claim.buyer,
        recipient: claim.recipient,
        unit: claim.unit,
        purchaseLevel: claim.purchase_level,
        entropyPreimage,
      });
      const slotsBefore = slots;
      const selected = simulateSwapPop({ slots: slotsBefore, allocationDigest: hash });
      if (claimId < targetClaimId && (claim.token_id !== selected.tokenId || claim.allocation_digest !== hash)) {
        throw new Error(`Persisted allocation for earlier claim ${claimId} no longer matches the committed FIFO replay`);
      }
      if (claimId === targetClaimId) {
        target = {
          claim,
          entropyPreimage,
          slotsBefore,
          result: { ...selected, allocationDigest: hash },
          token: tokens.find((token) => token.token_id === selected.tokenId),
        };
      }
      slots = selected.remainingSlots;
    }
    if (!target?.token) throw new Error("Forced allocation selected an unstaged token row");
    return target;
  }

  async processSimulation(work, project, claimId) {
    const allocation = await this.reconstructAllocation(project, claimId);
    await this.watcher.verifyAllocationBoundary({
      project,
      claim: allocation.claim,
      token: allocation.token,
      entropyPreimage: allocation.entropyPreimage,
      localSlots: allocation.slotsBefore,
      result: allocation.result,
    });
    this.journal.setClaimAllocation(project.drop_ref, claimId, allocation.result.tokenId, allocation.result.allocationDigest);
    this.journal.completeWork(work.id);
  }

  async persistPreparedAttempt({ work, project, operationRef, prepare }) {
    const signed = await prepare();
    const custody = await this.projectService.storeSignedOperation({
      dropRef: project.drop_ref,
      operationRef,
      signedBytes: signed.signedBytes,
      expectedSha256: signed.signedBytesSha256,
    });
    return this.journal.persistSigned({
      workItemId: work.id,
      operationHash: signed.operationHash,
      signedBytesPath: custody.signedBytesPath,
      signedBytesSha256: custody.signedBytesSha256,
      branch: signed.branch,
      branchLevel: signed.branchLevel,
      managerCounter: signed.managerCounter,
    });
  }

  async ensureExactAttemptInjected({ work, project, operationRef, prepare, status }) {
    let attempt = this.journal.getOperationForWork(work.id);
    if (!attempt?.signed_attempt_id || ["expired", "failed"].includes(attempt.signed_attempt_state)) {
      attempt = await this.persistPreparedAttempt({ work, project, operationRef, prepare });
    }

    let preparedStatus = await status(attempt);
    if (preparedStatus.state === "safe_to_replace_expired") {
      this.journal.expireSignedAttempt(work.id, {
        reason: preparedStatus.reason,
        priorAttemptNumber: attempt.attempt_number,
        branchLevel: preparedStatus.branchLevel,
        headLevel: preparedStatus.headLevel,
        maxOperationsTtl: preparedStatus.maxOperationsTtl,
      });
      attempt = await this.persistPreparedAttempt({ work, project, operationRef, prepare });
      preparedStatus = await status(attempt);
      if (preparedStatus.state === "safe_to_replace_expired") {
        this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, "Fresh signed attempt needs another liveness check before injection");
        return null;
      }
    }

    if (preparedStatus.state === "safe_to_inject_exact_bytes" || !attempt.injected_at) {
      if (preparedStatus.state === "safe_to_inject_exact_bytes") {
        const signedBytes = await this.projectService.loadSignedOperation({
          signedBytesPath: attempt.signed_bytes_path,
          expectedSha256: attempt.signed_bytes_sha256,
        });
        try {
          await this.watcher.injectSignedSettlement({ signedBytes, operationHash: attempt.operation_hash });
        } catch (error) {
          // The immutable hash and exact signed bytes were durable before this
          // call. A restart reconciles that exact operation before deciding
          // whether the same bytes or a proven-safe linked attempt may run.
          this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, `Exact signed operation injection is unresolved: ${errorMessage(error)}`);
          return null;
        }
        attempt = this.journal.markInjected(work.id);
      } else if (["mempool", "indexed", "chain_included"].includes(preparedStatus.state)) {
        attempt = this.journal.markInjected(work.id);
      } else if (["claim_already_settled", "arm_state_changed", "wait_for_branch_expiry"].includes(preparedStatus.state)) {
        this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, "On-chain state changed while the exact operation is still awaiting index reconciliation");
        return null;
      } else {
        const reason = `Persisted signed operation cannot proceed safely: ${preparedStatus.state}`;
        // A changed precondition is not evidence that the exact signed bytes
        // failed or expired. Keep the signed intent's single-flight guard until
        // canonical reconciliation proves an irreversible outcome.
        this.journal.manualReviewWork(work.id, reason);
        return null;
      }
    }
    return attempt;
  }

  async processArmFulfillment(work, project) {
    let attempt = this.journal.getOperationForWork(work.id);
    if (!attempt) {
      const headLevelBeforeSubmit = await this.watcher.currentHeadLevel();
      attempt = this.journal.createReadyAttempt({
        workItemId: work.id,
        requestId: `${project.network}:${project.contract_address}:arm-fulfillment:v1`,
        intentIdentity: {
          protocol: "macaroni-v35-arm-fulfillment.v1",
          contract: project.contract_address,
          entropyHead: project.entropy_head,
          entropyLength: project.entropy_length,
        },
        expectedPostcondition: { fulfillmentArmed: true, headLevelBeforeSubmit },
        network: project.network,
        signer: project.signer_address,
        target: project.contract_address,
        entrypoint: "arm_fulfillment",
        amountMutez: 0,
      });
    }
    if (project.sale_permanently_closed) {
      if (!attempt.signed_attempt_id) {
        this.journal.retireObsoleteOperationWork(work.id, {
          reason: "sale_permanently_closed_before_arm_signature",
          finalizedChainLevel: project.last_chain_level,
        });
        return;
      }
      if (attempt.signed_attempt_state === "applied") {
        this.journal.completeWork(work.id);
        return;
      }
      const preparedStatus = await this.watcher.preparedArmStatus({
        project,
        operationHash: attempt.operation_hash,
        managerCounter: attempt.manager_counter,
        branch: attempt.branch,
        branchLevel: attempt.branch_level,
      });
      if (preparedStatus.state === "safe_to_retire_closed") {
        this.journal.expireSignedAttempt(work.id, {
          reason: preparedStatus.reason,
          branchLevel: preparedStatus.branchLevel,
          headLevel: preparedStatus.headLevel,
          maxOperationsTtl: preparedStatus.maxOperationsTtl,
        });
        this.journal.retireObsoleteOperationWork(work.id, {
          reason: "sale_permanently_closed_and_signed_arm_expired_unincluded",
          headLevel: preparedStatus.headLevel,
        });
        return;
      }
      if (["wait_for_branch_expiry", "mempool", "arm_state_changed"].includes(preparedStatus.state)) {
        this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, preparedStatus.reason || "Exact arm operation is still resolving after permanent close");
        return;
      }
      if (["indexed", "chain_included"].includes(preparedStatus.state)) {
        if (!attempt.injected_at) attempt = this.journal.markInjected(work.id);
        const reconciliation = await this.watcher.reconcileArmFulfillment({ project, operationHash: attempt.operation_hash });
        if (reconciliation.status === "pending") {
          this.journal.reconcileOperation(work.id, "confirming", { reason: reconciliation.reason });
          this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, reconciliation.reason);
          return;
        }
        if (reconciliation.status === "applied") {
          this.journal.reconcileOperation(work.id, "applied", reconciliation);
          this.journal.completeWork(work.id);
          return;
        }
        if (reconciliation.status === "terminal_failed") {
          this.journal.reconcileOperation(work.id, "failed", { ...reconciliation, operationHash: attempt.operation_hash });
          this.journal.retireObsoleteOperationWork(work.id, {
            reason: "sale_permanently_closed_after_final_failed_arm",
            operationHash: attempt.operation_hash,
            inclusionLevel: reconciliation.level,
            finalizedAtHeadLevel: reconciliation.finalizedAtHeadLevel,
          });
          return;
        }
      }
      const reason = `Closed-sale arm operation cannot be retired safely: ${preparedStatus.state}`;
      this.journal.manualReviewWork(work.id, reason);
      return;
    }
    attempt = await this.ensureExactAttemptInjected({
      work,
      project,
      operationRef: "arm-fulfillment",
      prepare: async () => {
        // Re-prove the complete advertised setup immediately before every new
        // signature. Do not repeat these pre-signing gates while reconciling
        // already-durable bytes: the arm fee has then been spent and the
        // contract may have been terminally closed by its creator.
        await this.watcher.verifyContractBinding(project, this.journal.listTokens(project.drop_ref));
        const funding = await this.watcher.activationFunding(project);
        if (!funding.sufficient) {
          throw new Error("Fulfillment reserve changed after preflight; on-chain arming remains blocked");
        }
        const measuredFunding = await this.projectService.fundingPolicy();
        const armCostMutez = await this.watcher.estimateArmFulfillmentCost(project.contract_address);
        const finalizerFunding = await this.watcher.finalizerFunding(
          measuredFunding.fiveSettlementStartupMutez + armCostMutez,
        );
        if (!finalizerFunding.revealed || !finalizerFunding.sufficient) {
          throw new Error("Finalizer readiness changed after preflight; on-chain arming remains blocked");
        }
        return this.watcher.prepareArmFulfillment(project.contract_address);
      },
      status: (current) => this.watcher.preparedArmStatus({
        project,
        operationHash: current.operation_hash,
        managerCounter: current.manager_counter,
        branch: current.branch,
        branchLevel: current.branch_level,
      }),
    });
    if (!attempt) return;
    const reconciliation = await this.watcher.reconcileArmFulfillment({
      project,
      operationHash: attempt.operation_hash,
    });
    if (reconciliation.status === "pending") {
      this.journal.reconcileOperation(work.id, "confirming", { reason: reconciliation.reason });
      this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, reconciliation.reason);
      return;
    }
    if (reconciliation.status === "terminal_failed") {
      this.journal.reconcileOperation(work.id, "failed", { ...reconciliation, operationHash: attempt.operation_hash });
      this.journal.manualReviewWork(work.id, reconciliation.reason);
      return;
    }
    if (reconciliation.status !== "applied") {
      this.journal.manualReviewWork(work.id, reconciliation.reason || "Exact arm operation needs review");
      return;
    }
    this.journal.reconcileOperation(work.id, "applied", {
      transactionId: reconciliation.transactionId,
      inclusionLevel: reconciliation.level,
      finalizedAtHeadLevel: reconciliation.finalizedAtHeadLevel,
      confirmations: reconciliation.confirmations,
    });
    this.journal.updateLifecycle(project.drop_ref, {
      saleActivated: false,
      salePermanentlyClosed: false,
      fulfillmentArmed: true,
      finalSweepComplete: false,
    });
    this.journal.completeWork(work.id);
  }

  async processSettlement(work, project, claimId) {
    const policy = JSON.parse(project.release_policy_json);
    if (policy.kind === "rolling_delay" && project.claim_interval_seconds > 0 && claimId > 0) {
      const previous = this.journal.getClaim(project.drop_ref, claimId - 1);
      if (!previous?.settled_at) throw new Error("FIFO interval pacing is missing the prior finalized settlement time");
      const eligibleAt = previous.settled_at + project.claim_interval_seconds * 1000;
      if (!Number.isSafeInteger(eligibleAt)) throw new Error("FIFO interval pacing timestamp exceeds the local journal range");
      if (eligibleAt > Date.now()) {
        this.journal.retryWork(work.id, eligibleAt, "Waiting for the creator-selected FIFO claim interval");
        return;
      }
    }
    const allocation = await this.reconstructAllocation(project, claimId);
    const { material } = await this.projectService.privateTokenMaterial(project.drop_ref, allocation.result.tokenId);
    let attempt = this.journal.getOperationForWork(work.id);
    if (!attempt) {
      await this.watcher.verifyAllocationBoundary({
        project,
        claim: allocation.claim,
        token: allocation.token,
        entropyPreimage: allocation.entropyPreimage,
        localSlots: allocation.slotsBefore,
        result: allocation.result,
      });
      const headLevelBeforeSubmit = await this.watcher.currentHeadLevel();
      const privateParameterDigest = digest({
        claimId,
        entropyPreimage: allocation.entropyPreimage,
        metadataUri: material.metadataUri,
        metadataNonce: material.metadataNonce,
      });
      attempt = this.journal.createReadyAttempt({
        workItemId: work.id,
        requestId: `${project.network}:${project.contract_address}:claim:${claimId}:settle:v1`,
        intentIdentity: {
          protocol: "macaroni-v35-settle.v1",
          claimId,
          tokenId: allocation.result.tokenId,
          allocationDigest: allocation.result.allocationDigest,
          privateParameterDigest,
        },
        expectedPostcondition: {
          claimId,
          tokenId: allocation.result.tokenId,
          allocationDigest: allocation.result.allocationDigest,
          headLevelBeforeSubmit,
        },
        network: project.network,
        signer: project.signer_address,
        target: project.contract_address,
        entrypoint: "settle_claims_v35",
        amountMutez: 0,
      });
    }

    attempt = await this.ensureExactAttemptInjected({
      work,
      project,
      operationRef: `claim-${claimId}`,
      prepare: () => this.watcher.prepareSettlement({
        contractAddress: project.contract_address,
        claimId,
        entropyPreimage: allocation.entropyPreimage,
        metadataUri: material.metadataUri,
        metadataNonce: material.metadataNonce,
        maximumCostMutez: project.fulfillment_subsidy_mutez,
      }),
      status: (current) => this.watcher.preparedSettlementStatus({
        project,
        claimId,
        operationHash: current.operation_hash,
        managerCounter: current.manager_counter,
        branch: current.branch,
        branchLevel: current.branch_level,
      }),
    });
    if (!attempt) {
      if (this.journal.getWork(work.id)?.state === "manual_review") {
        this.journal.setClaimState(project.drop_ref, claimId, "attention_required", { error: "Settlement requires operator review" });
      }
      return;
    }

    const operationHash = attempt.operation_hash;

    const reconciliation = await this.watcher.reconcileSettlement({
      project,
      claimId,
      tokenId: allocation.result.tokenId,
      allocationDigest: allocation.result.allocationDigest,
      metadataUri: material.metadataUri,
      operationHash,
    });
    if (reconciliation.status === "pending") {
      this.journal.reconcileOperation(work.id, "confirming", { reason: reconciliation.reason });
      this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, reconciliation.reason);
      return;
    }
    if (reconciliation.status === "terminal_failed") {
      this.journal.reconcileOperation(work.id, "failed", { ...reconciliation, operationHash: attempt.operation_hash });
      this.journal.manualReviewWork(work.id, reconciliation.reason);
      this.journal.setClaimState(project.drop_ref, claimId, "attention_required", { error: reconciliation.reason });
      return;
    }
    if (reconciliation.status !== "applied") {
      this.journal.manualReviewWork(work.id, reconciliation.reason || "Exact settlement operation needs review");
      this.journal.setClaimState(project.drop_ref, claimId, "attention_required", { error: reconciliation.reason });
      return;
    }
    this.journal.reconcileOperation(work.id, "applied", {
      transactionId: reconciliation.transactionId,
      inclusionLevel: reconciliation.level,
      finalizedAtHeadLevel: reconciliation.finalizedAtHeadLevel,
      confirmations: reconciliation.confirmations,
    });
    this.journal.setClaimState(project.drop_ref, claimId, "artwork_secured", { operationHash });
    this.journal.completeWork(work.id);
  }

  async processPublish(work, project, claimId, kind) {
    const claim = this.journal.getClaim(project.drop_ref, claimId);
    if (!["artwork_secured", "publishing_to_ipfs", "nft_ready"].includes(claim?.state)) throw new Error("CAR publication was requested before finalized NFT settlement");
    this.journal.setClaimState(project.drop_ref, claimId, "publishing_to_ipfs", { operationHash: claim.settlement_operation_hash });
    await this.projectService.publishAsset(project.drop_ref, claim.token_id, kind);
    this.journal.completeWork(work.id);
  }

  async processReady(work, project, claimId) {
    const claim = this.journal.getClaim(project.drop_ref, claimId);
    const token = this.journal.getToken(project.drop_ref, claim.token_id);
    if (token.artifact_state !== "verified" || token.metadata_state !== "verified") throw new Error("Committed CARs are not publicly verified");
    if ((token.display_state && token.display_state !== "verified")
      || (token.thumbnail_state && token.thumbnail_state !== "verified")) {
      throw new Error("Optional display or thumbnail CAR is not publicly verified");
    }
    const attempt = this.journal.getWorkByKey(project.drop_ref, "settle_claim", `${claimId}:settle_claims_v35`);
    const { material } = await this.projectService.privateTokenMaterial(project.drop_ref, claim.token_id);
    const reconciliation = await this.watcher.reconcileSettlement({
      project,
      claimId,
      tokenId: claim.token_id,
      allocationDigest: claim.allocation_digest,
      metadataUri: material.metadataUri,
      operationHash: attempt.operation_hash,
    });
    if (reconciliation.status !== "applied") throw new Error("Final on-chain settlement postcondition is no longer proven");
    this.journal.setClaimState(project.drop_ref, claimId, "nft_ready", { operationHash: claim.settlement_operation_hash });
    this.journal.completeWork(work.id);
  }

  async processWork(work) {
    const project = this.journal.getProject(work.drop_ref);
    if (!project) throw new Error("Work project is missing");
    if (work.work_type === "arm_fulfillment") return this.processArmFulfillment(work, project);
    const claimId = Number(work.payload.claimId);
    if (!Number.isSafeInteger(claimId) || claimId < 0) throw new Error("Work claim id is invalid");
    switch (work.work_type) {
      case "simulate_allocation":
        return this.processSimulation(work, project, claimId);
      case "settle_claim":
        return this.processSettlement(work, project, claimId);
      case "publish_artifact_car":
        return this.processPublish(work, project, claimId, "artifact");
      case "publish_display_car":
        return this.processPublish(work, project, claimId, "display");
      case "publish_thumbnail_car":
        return this.processPublish(work, project, claimId, "thumbnail");
      case "publish_metadata_car":
        return this.processPublish(work, project, claimId, "metadata");
      case "verify_nft_ready":
        return this.processReady(work, project, claimId);
      default:
        throw new Error(`Unsupported work type ${work.work_type}`);
    }
  }

  async tickOnce() {
    for (const project of this.journal.listRunnableProjects()) {
      try {
        await this.scanProject(project);
        this.journal.setProjectError(project.drop_ref, null);
      } catch (error) {
        this.journal.setProjectError(project.drop_ref, errorMessage(error));
      }
    }
    while (true) {
      const work = this.journal.leaseNext({
        owner: this.config.workerOwner,
        // Three minimal block intervals cover inclusion plus the two blocks on
        // top required before attachment/readiness/publication is irreversible.
        durationMs: this.blockTimingMs * 3,
      });
      if (!work) break;
      try {
        await this.processWork(work);
      } catch (error) {
        const preSignWork = ["arm_fulfillment", "settle_claim"].includes(work.work_type)
          && !this.journal.getOperationForWork(work.id)?.signed_attempt_id;
        const publicationWork = ["publish_artifact_car", "publish_metadata_car"].includes(work.work_type);
        const blocker = preSignWork || publicationWork ? setupBlockerCode(error) : null;
        if (blocker) this.journal.manualReviewWork(work.id, `setup_blocked:${blocker}`);
        else this.journal.retryWork(work.id, Date.now() + this.blockTimingMs, errorMessage(error));
      }
    }
    for (const project of this.journal.listRunnableProjects()) {
      try {
        await this.scanProject(project);
      } catch (error) {
        this.journal.setProjectError(project.drop_ref, errorMessage(error));
      }
    }
  }

  wake() {
    if (!this.activeTick) {
      this.activeTick = this.tickOnce().finally(() => { this.activeTick = null; });
    }
    return this.activeTick;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const cycle = async () => {
      if (!this.running) return;
      await this.wake().catch(() => undefined);
      if (this.running) this.timer = setTimeout(cycle, this.blockTimingMs);
    };
    void cycle();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
