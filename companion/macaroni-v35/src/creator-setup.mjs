import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Parser } from "@taquito/michel-codec";
import { MichelsonMap, ParameterSchema, Schema, UnitValue } from "@taquito/michelson-encoder";
import { digest } from "./journal.mjs";
import { CompanionServiceError } from "./project-service.mjs";
import { orderedMichelsonCodeSections } from "./protocol.mjs";

const OPERATION = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const IMPLICIT = /^(tz1|tz2|tz3|tz4)[1-9A-HJ-NP-Za-km-z]{33}$/;
const BEACON_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEACON_SENDER_ID = /^[1-9A-HJ-NP-Za-km-z]+$/;
const BEACON_VERSION = /^[0-9]+(?:\.[0-9]+)*$/;

function address(value) {
  return typeof value === "string" ? value : value?.address || null;
}

function exactMichelsonCodeDigest(code) {
  const ordered = orderedMichelsonCodeSections(code);
  return ordered ? digest(ordered) : null;
}

function nat(value, label) {
  const result = value && typeof value.toNumber === "function" ? value.toNumber() : Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Invalid ${label}`);
  return result;
}

function canonicalReleasePolicy(project) {
  const policy = JSON.parse(project.release_policy_json);
  if (policy.kind === "immediate") return { immediate: UnitValue };
  if (policy.kind === "sellout") return { sellout: UnitValue };
  if (policy.kind === "rolling_delay") return { rolling_delay: policy.seconds };
  if (policy.kind === "scheduled") return { scheduled: policy.at };
  throw new Error("Unsupported release policy");
}

function normalizePlan(value, publicMetadata, project) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CompanionServiceError("invalid_creator_plan", "An immutable creator plan is required");
  if (value.contractMetadataUri !== publicMetadata.contract_metadata_uri) {
    throw new CompanionServiceError("contract_metadata_mismatch", "Creator plan must use the public TZIP-16 URI pinned for this project", 409);
  }
  const royalty = value.minterRoyalty;
  if (!royalty || typeof royalty.enabled !== "boolean" || !Number.isSafeInteger(royalty.bps)
    || royalty.bps < 0 || royalty.bps > 10_000 || !Number.isSafeInteger(royalty.mode)
    || royalty.mode < 0 || royalty.mode > 1) {
    throw new CompanionServiceError("invalid_minter_royalty", "Minter royalty must use a 0–10,000 bps value and supported mode 0 or 1");
  }
  if (!Array.isArray(value.stages) || value.stages.length === 0) throw new CompanionServiceError("invalid_stages", "At least one sale stage is required");
  const stageIds = new Set();
  const stages = value.stages.map((row) => {
    if (!row || !Number.isSafeInteger(row.stage) || row.stage < 0 || stageIds.has(row.stage)
      || !Number.isFinite(Date.parse(row.start)) || !Number.isSafeInteger(row.priceMutez) || row.priceMutez < 0
      || typeof row.useAllowlist !== "boolean"
      || !(row.maxPerWallet == null || (Number.isSafeInteger(row.maxPerWallet) && row.maxPerWallet > 0))) {
      throw new CompanionServiceError("invalid_stages", "Sale stages need unique natural ids, valid times, prices, allowlist choices, and optional positive wallet limits");
    }
    if (row.priceMutez > 0 && row.priceMutez < project.fulfillment_subsidy_mutez) {
      throw new CompanionServiceError("stage_price_below_subsidy", "Every paid mint price must cover the measured fulfillment subsidy");
    }
    stageIds.add(row.stage);
    return {
      stage: row.stage,
      start: new Date(row.start).toISOString(),
      priceMutez: row.priceMutez,
      useAllowlist: row.useAllowlist,
      maxPerWallet: row.maxPerWallet ?? null,
    };
  }).sort((left, right) => left.stage - right.stage);
  const stageMap = new Map(stages.map((stage) => [stage.stage, stage]));
  const allowlistKeys = new Set();
  const allowlist = (Array.isArray(value.allowlist) ? value.allowlist : []).map((row) => {
    const stage = stageMap.get(row?.stage);
    const key = `${row?.stage}:${row?.holder}`;
    if (!row || !stage?.useAllowlist || !IMPLICIT.test(row.holder || "")
      || !Number.isSafeInteger(row.capacity) || row.capacity < 0 || allowlistKeys.has(key)) {
      throw new CompanionServiceError("invalid_allowlist", "Allowlist rows must be unique wallets on an allowlist-enabled stage with a natural capacity");
    }
    allowlistKeys.add(key);
    return { capacity: row.capacity, holder: row.holder, stage: row.stage };
  }).sort((left, right) => left.stage - right.stage || left.holder.localeCompare(right.holder));
  return {
    contractMetadataUri: value.contractMetadataUri,
    minterRoyalty: { enabled: royalty.enabled, bps: royalty.bps, mode: royalty.mode },
    stages,
    allowlist,
  };
}

function unwrapRouting(value) {
  let cursor = value;
  while (cursor && (cursor.prim === "Left" || cursor.prim === "Right") && Array.isArray(cursor.args) && cursor.args.length === 1) cursor = cursor.args[0];
  return cursor;
}

function explanation(step) {
  const descriptions = {
    reveal_creator_key: "Reveal your creator account public key in a separate one-mutez self-transfer so origination can be estimated safely.",
    originate_contract: "Create the reviewed Macaroni V3.5 contract with the public settings and private-inventory commitments already saved here.",
    add_tokens_v35: "Add this live-sized batch of token quantities and hashes. No private CID is included.",
    append_token_slots_v35: "Add this live-sized batch of canonical edition slots used by forced FIFO allocation.",
    set_stages: "Set the saved sale times, prices, wallet limits, and allowlist switches.",
    set_allowlist: "Add this live-sized batch from the saved allowlist.",
    finalize_setup: "Irreversibly lock the complete inventory and sale configuration.",
    fund_fulfillment_reserve: "Fund the contract-held reserve using the measured fulfillment policy.",
    activate_sale: "Open purchases after Companion has proved and armed automatic fulfillment.",
    close_sale: "Irreversibly close the sale; existing purchases still finish before the automatic final sweep.",
  };
  return {
    whatYouAreSigning: descriptions[step],
    ifYouSign: "Only this saved intent is submitted. The following step stays locked until the exact operation and result are final on Tezos.",
    ifYouDoNotSign: "Nothing changes on-chain. This step remains safely resumable when you return.",
  };
}

export class CompanionCreatorSetup {
  constructor({ config, journal, watcher, projectService, runtime }) {
    this.config = config;
    this.journal = journal;
    this.watcher = watcher;
    this.projectService = projectService;
    this.runtime = runtime;
    this.artifactPromise = null;
  }

  completeMilestone(project, stepKey, expectedPostcondition, finalizedBatches = []) {
    const existing = this.journal.creatorStep(project.drop_ref, stepKey);
    if (!existing) {
      return this.journal.completeCreatorStep({
        dropRef: project.drop_ref, stepKey, network: project.network,
        signer: project.administrator, expectedPostcondition,
      });
    }
    const lastBatch = finalizedBatches.at(-1);
    const sameTally = digest(existing.expectedPostcondition) === digest(expectedPostcondition);
    const sameFinalBatch = lastBatch?.state === "complete" && Boolean(lastBatch.final_batch)
      && existing.expectedPostcondition?.finalBatch === lastBatch.batch_index;
    if (existing.state !== "complete" || (!sameTally && !sameFinalBatch)) {
      throw new CompanionServiceError("creator_milestone_conflict", `The saved ${stepKey} milestone conflicts with finalized inventory`, 409);
    }
    return existing;
  }

  async artifact() {
    this.artifactPromise ||= Promise.all([
      readFile(this.config.abiPath, "utf8").then(JSON.parse),
      readFile(this.config.templatePath, "utf8").then(JSON.parse),
      readFile(this.config.storagePath || this.config.abiPath.replace(/macaroni-v35\.contract\.json$/, "macaroni-v35.storage.tz"), "utf8"),
    ]).then(([code, manifest, storageText]) => {
      if (!Array.isArray(code)) throw new Error("Reviewed V3.5 contract artifact is invalid");
      const storageType = code.find((section) => section.prim === "storage")?.args?.[0];
      const parameterType = code.find((section) => section.prim === "parameter")?.args?.[0];
      const storageTemplate = new Parser().parseMichelineExpression(storageText);
      if (!storageType || !parameterType || !storageTemplate || !manifest.templateVersion) throw new Error("Reviewed V3.5 artifact is incomplete");
      return { code, storageType, parameterType, storageTemplate, manifest };
    });
    return this.artifactPromise;
  }

  async buildOrigination(project, plan) {
    const artifact = await this.artifact();
    const schema = new Schema(artifact.storageType);
    const storage = schema.Execute(artifact.storageTemplate);
    storage.administrator = project.administrator;
    storage.creator = project.creator;
    storage.finalizer = project.signer_address;
    storage.treasury = project.treasury;
    storage.entropy_commitment = project.entropy_head;
    storage.entropy_cursor = project.entropy_head;
    storage.entropy_length = project.entropy_length;
    storage.entropy_remaining = project.entropy_length;
    storage.fulfillment_subsidy = project.fulfillment_subsidy_mutez;
    storage.minter_royalty_config = {
      enabled: plan.minterRoyalty.enabled,
      bps: plan.minterRoyalty.bps,
      mode: plan.minterRoyalty.mode,
      updater: project.administrator,
    };
    const metadata = new MichelsonMap();
    metadata.set("", Buffer.from(plan.contractMetadataUri, "utf8").toString("hex"));
    storage.metadata = metadata;
    storage.release_policy = canonicalReleasePolicy(project);
    const encodedStorage = schema.Encode(storage);
    return {
      code: artifact.code,
      storage: encodedStorage,
      codeDigest: digest(artifact.code),
      storageDigest: digest(encodedStorage),
      abiVersion: artifact.manifest.templateVersion,
      finalizer: project.signer_address,
      contractMetadataUri: plan.contractMetadataUri,
    };
  }

  async encodeEntrypoint(step, semantic) {
    const artifact = await this.artifact();
    const schema = new ParameterSchema(artifact.parameterType);
    let wallet = semantic;
    if (step === "set_stages") {
      const stages = new MichelsonMap();
      for (const row of semantic) stages.set(row.stage, {
        start: row.start,
        price: row.price_mutez,
        use_allowlist: row.use_allowlist,
        max_per_wallet: row.max_per_wallet,
      });
      wallet = stages;
    } else if (["finalize_setup", "fund_fulfillment_reserve", "activate_sale", "close_sale"].includes(step)) {
      wallet = UnitValue;
    }
    const routedMicheline = schema.EncodeObject({ [step]: wallet });
    return { wallet: semantic, micheline: unwrapRouting(routedMicheline), routedMicheline };
  }

  async currentCreatorKey(project) {
    const observed = await this.watcher.creatorManagerKeyAtFinalized(project.administrator);
    return { ...observed, publicKey: observed.key || project.creator_public_key || null };
  }

  actionResponse(attempt) {
    const stepRow = this.journal.db.prepare("SELECT step_key FROM creator_setup_steps WHERE id=?").get(attempt.setup_step_id);
    if (!stepRow) throw new Error(`Creator setup step ${attempt.setup_step_id} is missing`);
    const step = this.journal.creatorStep(attempt.drop_ref, stepRow.step_key);
    return {
      schema: "wtfos.macaroni-v35-next-creator-action.v1",
      state: attempt.state === "awaiting_signature"
        ? "awaiting_signature"
        : attempt.state === "wallet_prompt_started"
          ? "wallet_outcome_required"
        : ["submitted", "confirming", "needs_reconciliation"].includes(attempt.state)
          ? "reconcile"
          : attempt.state,
      action: {
        attemptId: attempt.id,
        setupStepId: attempt.setup_step_id,
        step: step.logical_step,
        requestId: attempt.request_id,
        intentDigest: attempt.intent_digest,
        network: attempt.network,
        signer: attempt.signer,
        target: attempt.target,
        entrypoint: attempt.entrypoint,
        amountMutez: attempt.amount_mutez,
        parameters: attempt.parameters,
        expectedPostcondition: attempt.expectedPostcondition,
        operationHash: attempt.operation_hash,
        explanation: explanation(step.logical_step),
        liveEstimate: step.liveEstimate,
        chunk: step.chunk,
      },
    };
  }

  async prepareAction({ project, logicalStep, semantic, amountMutez = 0, batchIndex = null, finalBatch = null, liveEstimate, chunk = null, origination = null }) {
    const stepKey = batchIndex == null ? logicalStep : `${logicalStep}:${String(batchIndex).padStart(6, "0")}`;
    const oldStep = this.journal.creatorStep(project.drop_ref, stepKey);
    const prior = oldStep ? this.journal.latestCreatorAttemptForStep(oldStep.id) : null;
    const target = logicalStep === "originate_contract" ? null : logicalStep === "reveal_creator_key" ? project.administrator : project.contract_address;
    const entrypoint = logicalStep === "originate_contract" ? "origination" : logicalStep === "reveal_creator_key" ? "default" : logicalStep;
    let parameters;
    if (origination) parameters = origination;
    else if (logicalStep === "reveal_creator_key") parameters = { wallet: null, micheline: null, routedMicheline: null };
    else parameters = await this.encodeEntrypoint(logicalStep, semantic);
    const expectedPostcondition = this.expectedPostcondition({ project, logicalStep, semantic, amountMutez });
    const issuedHeadLevel = await this.watcher.currentHeadLevel();
    const attempt = this.journal.createCreatorAttempt({
      dropRef: project.drop_ref,
      stepKey,
      logicalStep,
      batchIndex,
      finalBatch,
      requestId: `v35-local:${project.drop_ref}:${logicalStep}:${randomUUID()}`,
      retryOfAttemptId: prior && ["wallet_rejected", "failed", "expired"].includes(prior.state) ? prior.id : null,
      network: project.network,
      signer: project.administrator,
      target,
      entrypoint,
      amountMutez,
      parameters,
      expectedPostcondition,
      liveEstimate,
      chunk,
      issuedHeadLevel,
    });
    return this.actionResponse(attempt);
  }

  expectedPostcondition({ project, logicalStep, semantic, amountMutez }) {
    const completed = this.journal.listCreatorSteps(project.drop_ref).filter((step) => step.state === "complete");
    if (logicalStep === "reveal_creator_key") return { managerKeyRevealed: true };
    if (logicalStep === "originate_contract") return { exactReviewedCodeAndStorage: true, codeDigest: semantic.codeDigest, storageDigest: semantic.storageDigest };
    if (logicalStep === "add_tokens_v35") {
      const prior = completed.filter((step) => step.logical_step === logicalStep).flatMap((step) => step.parameters.wallet || []);
      return {
        tokenCountAfter: prior.length + semantic.length,
        supplyAfter: [...prior, ...semantic].reduce((sum, row) => sum + row.quantity, 0),
      };
    }
    if (logicalStep === "append_token_slots_v35") {
      const prior = completed.filter((step) => step.logical_step === logicalStep).flatMap((step) => step.parameters.wallet || []);
      return { slotsLoadedAfter: [...prior, ...semantic].reduce((sum, row) => sum + row.count, 0) };
    }
    if (logicalStep === "set_stages") return { stagesMatchPlan: true, stageCount: semantic.length };
    if (logicalStep === "set_allowlist") return { allowlistRowsApplied: semantic.length };
    if (logicalStep === "finalize_setup") return { setupFinalized: true };
    if (logicalStep === "fund_fulfillment_reserve") return { minimumContractBalanceMutez: amountMutez };
    if (logicalStep === "activate_sale") return { saleActivated: true, saleActive: true };
    if (logicalStep === "close_sale") return { salePermanentlyClosed: true, saleActive: false, irreversible: true };
    throw new Error(`Unknown creator step ${logicalStep}`);
  }

  async liveTransfer(project, publicKey, logicalStep, semantic, amountMutez = 0) {
    if (logicalStep === "reveal_creator_key") {
      return this.requireInjectableSize(await this.watcher.estimateCreatorTransfer({
        project,
        publicKey,
        target: project.administrator,
        amountMutez: 1,
      }));
    }
    const encoded = await this.encodeEntrypoint(logicalStep, semantic);
    return this.requireInjectableSize(await this.watcher.estimateCreatorTransfer({
      project,
      publicKey,
      target: project.contract_address,
      amountMutez,
      parameter: { entrypoint: logicalStep, value: encoded.micheline },
    }));
  }

  async requireInjectableSize(estimate) {
    const artifact = await this.artifact();
    const limit = Number(artifact.manifest.protocolOperationDataLimitBytes);
    const finalSize = Number(estimate?.finalOperationSizeBytes);
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error("Reviewed V3.5 manifest has no protocol operation-data limit");
    }
    if (!Number.isSafeInteger(finalSize) || finalSize <= 0) {
      throw new CompanionServiceError("creator_forged_size_missing", "The RPC did not prove the final forged wallet-operation size", 409);
    }
    if (finalSize > limit) {
      throw new CompanionServiceError(
        "creator_operation_too_large",
        `The exact padded wallet operation is ${finalSize} bytes, above the reviewed ${limit}-byte Tezos limit`,
        409,
      );
    }
    return { ...estimate, protocolOperationDataLimitBytes: limit };
  }

  async largestPrefix(project, publicKey, logicalStep, rows) {
    let low = 1;
    let high = rows.length;
    let accepted = null;
    let lastError;
    while (low <= high) {
      const count = Math.floor((low + high) / 2);
      const candidate = rows.slice(0, count);
      try {
        accepted = { rows: candidate, estimate: await this.liveTransfer(project, publicKey, logicalStep, candidate) };
        low = count + 1;
      } catch (error) {
        lastError = error;
        high = count - 1;
      }
    }
    if (!accepted) throw new CompanionServiceError("creator_batch_unestimable", lastError instanceof Error ? lastError.message : `Even one ${logicalStep} row cannot be estimated`, 409);
    return accepted;
  }

  takeSlotUnits(tokens, loaded, units) {
    const rows = [];
    let remaining = units;
    for (const token of tokens) {
      if (remaining === 0) break;
      const available = token.quantity - (loaded.get(token.token_id) || 0);
      if (available <= 0) continue;
      const count = Math.min(available, remaining);
      rows.push({ token_id: token.token_id, count });
      remaining -= count;
    }
    if (remaining !== 0) throw new Error("Slot batch exceeds remaining physical supply");
    return rows;
  }

  async largestSlotPrefix(project, publicKey, tokens, loaded) {
    const total = tokens.reduce((sum, token) => sum + token.quantity - (loaded.get(token.token_id) || 0), 0);
    let low = 1;
    let high = total;
    let accepted = null;
    let lastError;
    while (low <= high) {
      const units = Math.floor((low + high) / 2);
      const rows = this.takeSlotUnits(tokens, loaded, units);
      try {
        accepted = { units, rows, estimate: await this.liveTransfer(project, publicKey, "append_token_slots_v35", rows) };
        low = units + 1;
      } catch (error) {
        lastError = error;
        high = units - 1;
      }
    }
    if (!accepted) throw new CompanionServiceError("creator_batch_unestimable", lastError instanceof Error ? lastError.message : "Even one physical slot cannot be estimated", 409);
    return accepted;
  }

  async getNext(dropRef, input = {}) {
    let project = this.journal.getProject(dropRef);
    if (!project) throw new CompanionServiceError("project_not_found", "Macaroni project was not found", 404);
    const active = this.journal.activeCreatorAttempt(dropRef);
    if (active) {
      if (active.state === "wallet_prompt_started") return this.recoverPromptStarted(project, active);
      return this.actionResponse(active);
    }
    if (input.requestPermanentClose) return this.nextClose(project);
    const publicMetadata = this.journal.getPublicContractMetadata(dropRef);
    if (!publicMetadata) return {
      schema: "wtfos.macaroni-v35-next-creator-action.v1",
      state: "blocked",
      blocker: "Upload and pin the public collection cover and canonical TZIP-16 contract metadata before asking your wallet to originate anything.",
      nextRequiredOffchainStep: "public_contract_metadata",
    };
    const supplied = input.plan ? normalizePlan(input.plan, publicMetadata, project) : null;
    const saved = this.journal.getCreatorPlan(dropRef);
    if (!saved && !supplied) throw new CompanionServiceError("creator_plan_required", "The first next-action request must include the immutable creator plan");
    if (supplied) this.journal.saveCreatorPlan(dropRef, supplied);
    const plan = this.journal.getCreatorPlan(dropRef).plan;
    const tokens = this.journal.listTokens(dropRef);
    if (tokens.reduce((sum, token) => sum + token.quantity, 0) !== project.physical_supply) return {
      schema: "wtfos.macaroni-v35-next-creator-action.v1",
      state: "blocked",
      blocker: "Upload every private artifact and optional display/thumbnail until physical supply is complete. No wallet signature is needed yet.",
      nextRequiredOffchainStep: "stage_private_assets",
    };
    this.journal.completeCreatorStep({ dropRef, stepKey: "stage_private_assets", network: project.network, signer: project.administrator, expectedPostcondition: { physicalSupply: project.physical_supply, tokenRows: tokens.length } });
    const key = await this.currentCreatorKey(project);
    if (!key.key) {
      if (!key.publicKey) return {
        schema: "wtfos.macaroni-v35-next-creator-action.v1",
        state: "blocked",
        blocker: "Reconnect the creator wallet so Studio can provide its public key for a read-only reveal estimate.",
        nextRequiredOffchainStep: "creator_public_key",
      };
      const estimate = await this.liveTransfer(project, key.publicKey, "reveal_creator_key", null, 1);
      return this.prepareAction({ project, logicalStep: "reveal_creator_key", semantic: null, amountMutez: 1, liveEstimate: estimate });
    }
    const revealedStep = this.journal.creatorStep(dropRef, "reveal_creator_key");
    if (!revealedStep) {
      this.journal.completeCreatorStep({ dropRef, stepKey: "reveal_creator_key", network: project.network, signer: project.administrator, expectedPostcondition: { managerKeyRevealed: true, finalizedBlock: key.level } });
    } else if (revealedStep.state !== "complete" || revealedStep.expectedPostcondition?.managerKeyRevealed !== true) {
      throw new CompanionServiceError("creator_reveal_step_conflict", "The saved creator-key reveal has not been safely completed", 409);
    }
    if (!project.contract_address) {
      const origination = await this.buildOrigination(project, plan);
      const estimate = await this.requireInjectableSize(await this.watcher.estimateCreatorOrigination({
        project,
        publicKey: key.key,
        code: origination.code,
        storage: origination.storage,
      }));
      return this.prepareAction({ project, logicalStep: "originate_contract", semantic: origination, origination, liveEstimate: estimate });
    }
    const steps = this.journal.listCreatorSteps(dropRef);
    const completed = steps.filter((step) => step.state === "complete");
    const completedBatches = (logical) => completed.filter((step) => step.logical_step === logical).sort((a, b) => (a.batch_index || 0) - (b.batch_index || 0));
    const tokenBatches = completedBatches("add_tokens_v35");
    const declared = new Set(tokenBatches.flatMap((step) => (step.parameters.wallet || []).map((row) => row.token_id)));
    const tokenRows = tokens.filter((token) => !declared.has(token.token_id)).map((token) => ({ token_id: token.token_id, metadata_commitment: token.metadata_commitment, quantity: token.quantity }));
    if (tokenRows.length) {
      const selected = await this.largestPrefix(project, key.key, "add_tokens_v35", tokenRows);
      const batchIndex = tokenBatches.length;
      const finalBatch = selected.rows.length === tokenRows.length;
      return this.prepareAction({ project, logicalStep: "add_tokens_v35", semantic: selected.rows, batchIndex, finalBatch, liveEstimate: selected.estimate, chunk: { batchIndex, finalBatch, rows: selected.rows.length } });
    }
    this.completeMilestone(project, "inventory_declared", { tokenRows: tokens.length }, tokenBatches);
    const slotBatches = completedBatches("append_token_slots_v35");
    const loaded = new Map();
    for (const step of slotBatches) for (const row of step.parameters.wallet || []) loaded.set(row.token_id, (loaded.get(row.token_id) || 0) + row.count);
    const slotsRemaining = tokens.reduce((sum, token) => sum + token.quantity - (loaded.get(token.token_id) || 0), 0);
    if (slotsRemaining > 0) {
      const selected = await this.largestSlotPrefix(project, key.key, tokens, loaded);
      const batchIndex = slotBatches.length;
      const finalBatch = selected.units === slotsRemaining;
      return this.prepareAction({ project, logicalStep: "append_token_slots_v35", semantic: selected.rows, batchIndex, finalBatch, liveEstimate: selected.estimate, chunk: { batchIndex, finalBatch, rows: selected.rows.length, units: selected.units } });
    }
    this.completeMilestone(project, "inventory_complete", { physicalSlots: project.physical_supply }, slotBatches);
    if (!this.journal.creatorStep(dropRef, "set_stages")?.state.includes("complete")) {
      const semantic = plan.stages.map((stage) => ({ stage: stage.stage, start: stage.start, price_mutez: stage.priceMutez, use_allowlist: stage.useAllowlist, max_per_wallet: stage.maxPerWallet }));
      return this.prepareAction({ project, logicalStep: "set_stages", semantic, liveEstimate: await this.liveTransfer(project, key.key, "set_stages", semantic) });
    }
    const allowBatches = completedBatches("set_allowlist");
    const applied = new Set(allowBatches.flatMap((step) => (step.parameters.wallet || []).map((row) => `${row.stage}:${row.holder}`)));
    const remainingAllowlist = plan.allowlist.filter((row) => !applied.has(`${row.stage}:${row.holder}`));
    if (remainingAllowlist.length) {
      const selected = await this.largestPrefix(project, key.key, "set_allowlist", remainingAllowlist);
      const batchIndex = allowBatches.length;
      const finalBatch = selected.rows.length === remainingAllowlist.length;
      return this.prepareAction({ project, logicalStep: "set_allowlist", semantic: selected.rows, batchIndex, finalBatch, liveEstimate: selected.estimate, chunk: { batchIndex, finalBatch, rows: selected.rows.length } });
    }
    this.completeMilestone(project, "allowlist_complete", { rows: plan.allowlist.length }, allowBatches);
    if (this.journal.creatorStep(dropRef, "finalize_setup")?.state !== "complete") {
      return this.prepareAction({ project, logicalStep: "finalize_setup", semantic: null, liveEstimate: await this.liveTransfer(project, key.key, "finalize_setup", null) });
    }
    const hasFreeStage = plan.stages.some((stage) => stage.priceMutez === 0);
    const operations = hasFreeStage ? Math.max(5, project.physical_supply) : 5;
    const reserve = operations * project.fulfillment_subsidy_mutez;
    if (!Number.isSafeInteger(reserve)) throw new Error("Fulfillment reserve exceeds safe integer precision");
    if (this.journal.creatorStep(dropRef, "fund_fulfillment_reserve")?.state !== "complete") {
      return this.prepareAction({ project, logicalStep: "fund_fulfillment_reserve", semantic: null, amountMutez: reserve, liveEstimate: await this.liveTransfer(project, key.key, "fund_fulfillment_reserve", null, reserve) });
    }
    project = this.journal.getProject(dropRef);
    if (!project.fulfillment_armed) {
      if (project.state !== "armed") await this.projectService.preflight(dropRef);
      await this.runtime?.wake?.();
      return {
        schema: "wtfos.macaroni-v35-next-creator-action.v1",
        state: "waiting_for_companion_fulfillment_arm",
        blocker: "No wallet signature is needed. Companion is rechecking private recovery, exact inventory, reserve, and signer readiness before its on-chain arm handshake.",
      };
    }
    if (this.journal.creatorStep(dropRef, "activate_sale")?.state !== "complete") {
      await this.projectService.verifyPublicCollectorReachability(dropRef);
      return this.prepareAction({ project, logicalStep: "activate_sale", semantic: null, liveEstimate: await this.liveTransfer(project, key.key, "activate_sale", null) });
    }
    return { schema: "wtfos.macaroni-v35-next-creator-action.v1", state: "complete", blocker: null, contract: project.contract_address };
  }

  matchingCreatorRows(attempt, rows, { appliedOnly, finalizedLevel = null } = {}) {
    return rows.filter((row) => {
      if (appliedOnly && row.status !== "applied") return false;
      if (finalizedLevel != null && (!Number.isSafeInteger(Number(row.level)) || Number(row.level) > finalizedLevel)) return false;
      if (address(row.sender) !== attempt.signer) return false;
      if (attempt.entrypoint === "origination") {
        return Number(row.contractBalance ?? 0) === attempt.amount_mutez
          && exactMichelsonCodeDigest(row.code) === exactMichelsonCodeDigest(attempt.parameters.code)
          && digest(row.storage) === digest(attempt.parameters.storage)
          && (!appliedOnly || /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(address(row.originatedContract) || ""));
      }
      return address(row.target) === attempt.target
        && Number(row.amount ?? 0) === attempt.amount_mutez
        && (attempt.entrypoint === "default"
          ? (!row.parameter || row.parameter.entrypoint === "default")
          : row.parameter?.entrypoint === attempt.entrypoint
            && digest(row.parameter.value) === digest(attempt.parameters.micheline));
    });
  }

  async recoverPromptStarted(project, attempt) {
    const window = await this.watcher.hashlessCreatorIntentWindow(attempt);
    const finalizedMatches = this.matchingCreatorRows(
      attempt,
      [...window.indexedRows, ...window.canonicalRows],
      { appliedOnly: true, finalizedLevel: window.finalized.level },
    );
    const pendingMatches = this.matchingCreatorRows(attempt, window.pendingRows, { appliedOnly: false });
    const finalizedHashes = [...new Set(finalizedMatches.map((row) => row.hash).filter((hash) => OPERATION.test(hash || "")))];
    const pendingHashes = [...new Set(pendingMatches.map((row) => row.hash).filter((hash) => OPERATION.test(hash || "")))];
    const allHashes = [...new Set([...finalizedHashes, ...pendingHashes])];
    if (allHashes.length > 1) {
      throw new CompanionServiceError("ambiguous_creator_recovery", "More than one operation matches this wallet intent. Companion stopped before advancing; inspect the creator operation journal.", 409);
    }
    if (finalizedHashes.length === 1) {
      this.journal.submitCreatorAttempt(project.drop_ref, attempt.id, finalizedHashes[0], await this.watcher.currentHeadLevel());
      return this.reconcile(project.drop_ref, attempt.id);
    }
    if (pendingHashes.length === 1) {
      const submitted = this.journal.submitCreatorAttempt(project.drop_ref, attempt.id, pendingHashes[0], await this.watcher.currentHeadLevel());
      return { ...this.actionResponse(submitted), blocker: "The exact wallet operation is still in the Tezos mempool. Do not sign it again." };
    }
    return {
      ...this.actionResponse(attempt),
      state: "wallet_outcome_required",
      blocker: "The wallet prompt started, but Companion has no operation hash yet. Paste the hash if it sent. Because the wallet can approve this request later using a fresh Tezos branch, this exact action remains quarantined until it is found or safely resolved. Do not sign it again.",
    };
  }

  async nextClose(project) {
    if (!project.contract_address) return { schema: "wtfos.macaroni-v35-next-creator-action.v1", state: "complete", blocker: null, abandonedBeforeOrigination: true };
    const finalized = await this.watcher.finalizedHeadSnapshot();
    const storage = await this.watcher.contractStorageAt(project.contract_address, finalized.blockHash);
    if (storage.sale_permanently_closed === true) return { schema: "wtfos.macaroni-v35-next-creator-action.v1", state: "complete", blocker: null, contract: project.contract_address, salePermanentlyClosed: true };
    const key = await this.currentCreatorKey(project);
    if (!key.key && !key.publicKey) throw new CompanionServiceError("creator_public_key_required", "Reconnect the creator wallet before preparing permanent close", 409);
    return this.prepareAction({ project, logicalStep: "close_sale", semantic: null, liveEstimate: await this.liveTransfer(project, key.key || key.publicKey, "close_sale", null) });
  }

  reject(dropRef, attemptId, reason, confirmNoBroadcast = false) {
    if (confirmNoBroadcast !== true) throw new CompanionServiceError("no_broadcast_confirmation_required", "Confirm that the wallet rejected before broadcasting; otherwise provide the operation hash", 409);
    return this.actionResponse(this.journal.rejectCreatorAttempt(dropRef, attemptId, reason));
  }

  async promptStarted(dropRef, attemptId, requestId) {
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new CompanionServiceError("creator_request_id_required", "Wallet prompt start must name the exact creator request", 400);
    }
    const head = await this.watcher.currentHeadLevel();
    const attempt = this.journal.startCreatorWalletPrompt(dropRef, attemptId, requestId, head);
    return {
      ...this.actionResponse(attempt),
      proceedToWalletSend: attempt.state === "wallet_prompt_started" && !attempt.operation_hash,
      promptStartedHeadLevel: attempt.prompt_started_head_level,
    };
  }

  promptAborted(dropRef, attemptId, input) {
    const attempt = this.journal.creatorAttempt(attemptId);
    if (!attempt || attempt.drop_ref !== dropRef || attempt.request_id !== input?.requestId) {
      throw new CompanionServiceError("creator_request_mismatch", "Wallet abort evidence does not belong to this exact creator action", 409);
    }
    if (input.beaconEvent !== "OPERATION_REQUEST_ERROR") {
      throw new CompanionServiceError(
        "wallet_abort_event_missing",
        "A transformed wallet exception is not retry authority; capture Beacon's raw OPERATION_REQUEST_ERROR event",
        409,
      );
    }
    const errorResponse = input.beaconErrorResponse;
    if (!errorResponse || errorResponse.type !== "error" || errorResponse.errorType !== "ABORTED_ERROR") {
      throw new CompanionServiceError(
        "wallet_abort_not_authoritative",
        "Only Beacon's raw literal ABORTED_ERROR response can resolve a started wallet prompt; preserve every other error for recovery",
        409,
      );
    }
    const walletSenderId = typeof errorResponse.senderId === "string" ? errorResponse.senderId.trim() : "";
    const walletRequestId = typeof errorResponse.id === "string" ? errorResponse.id.trim() : "";
    const beaconVersion = typeof errorResponse.version === "string" ? errorResponse.version.trim() : "";
    if (!BEACON_SENDER_ID.test(walletSenderId)
      || !BEACON_REQUEST_ID.test(walletRequestId)
      || !BEACON_VERSION.test(beaconVersion)) {
      throw new CompanionServiceError(
        "wallet_abort_identity_missing",
        "The raw wallet abort must include its valid non-empty wallet sender id, Beacon request UUID, and Beacon version; a local dApp disconnect is not retry authority",
        409,
      );
    }
    try {
      return this.actionResponse(this.journal.abortCreatorWalletPrompt(dropRef, attemptId, input.requestId, {
        beaconEvent: input.beaconEvent,
        beaconMessageType: errorResponse.type,
        walletErrorType: errorResponse.errorType,
        walletSenderId,
        walletRequestId,
        beaconVersion,
      }));
    } catch (error) {
      throw new CompanionServiceError("wallet_abort_conflict", error instanceof Error ? error.message : "Wallet abort evidence conflicted with durable state", 409);
    }
  }

  async submitted(dropRef, attemptId, operationHash) {
    if (!OPERATION.test(operationHash || "")) throw new CompanionServiceError("invalid_operation_hash", "Submitted operation hash is invalid");
    const head = await this.watcher.currentHeadLevel();
    return this.actionResponse(this.journal.submitCreatorAttempt(dropRef, attemptId, operationHash, head));
  }

  async reconcile(dropRef, attemptId) {
    const project = this.journal.getProject(dropRef);
    const attempt = this.journal.creatorAttempt(attemptId);
    if (!project || !attempt || attempt.drop_ref !== dropRef || !attempt.operation_hash) throw new CompanionServiceError("creator_attempt_not_submitted", "Creator action has no submitted operation to reconcile", 409);
    if (["applied", "expired"].includes(attempt.state)) return this.actionResponse(attempt);
    if (attempt.state === "failed") {
      // Recheck only known historical false negatives using the same durable
      // operation hash. Never reopen a terminal chain failure or supersede a
      // newer wallet attempt.
      const recoverableOrigination = attempt.entrypoint === "origination"
        && attempt.error === "Final origination does not match the exact signer, code, storage, amount, or derived KT1";
      const recoverableStage = attempt.entrypoint === "set_stages"
        && attempt.error === "Final transaction matched, but its exact expected contract result is absent";
      if (!recoverableOrigination && !recoverableStage) {
        return this.actionResponse(attempt);
      }
      const latest = this.journal.latestCreatorAttemptForStep(attempt.setup_step_id);
      if (latest?.id !== attempt.id) {
        throw new CompanionServiceError("creator_recovery_conflict", "A newer creator attempt exists; the old origination cannot be automatically recovered", 409);
      }
    }
    const status = await this.watcher.creatorSubmissionStatus(attempt);
    if (["not_indexed_within_ttl", "indexed_waiting_finality", "canonical_inclusion_not_indexed"].includes(status.state)) {
      const updated = this.journal.reconcileCreatorAttempt(dropRef, attemptId, "needs_reconciliation", status, "Exact operation is not final yet; do not sign it again");
      return this.actionResponse(updated);
    }
    if (status.state === "expired_absent") {
      const updated = this.journal.reconcileCreatorAttempt(dropRef, attemptId, "expired", status, "Operation expired and was proven absent from the canonical chain; the identical intent may now be retried");
      return { ...this.actionResponse(updated), state: "expired_safe_to_retry" };
    }
    const finalized = await this.watcher.finalizedHeadSnapshot();
    const result = attempt.entrypoint === "origination"
      ? await this.reconcileOrigination(project, attempt, status.rows, finalized)
      : await this.reconcileTransaction(project, attempt, status.rows, finalized);
    if (!result.applied) {
      const updated = this.journal.reconcileCreatorAttempt(dropRef, attemptId, "failed", result, result.reason || "Final operation did not match the immutable intent");
      return this.actionResponse(updated);
    }
    // Exact code/storage and finalized-block binding were already re-read in
    // reconcileOrigination. Persist the derived KT1 before marking the wallet
    // attempt complete so a crash can only leave a safely repeatable reconcile.
    if (result.originatedContract) this.journal.attachContract(dropRef, result.originatedContract);
    const updated = this.journal.reconcileCreatorAttempt(dropRef, attemptId, "applied", result, null, result.originatedContract || null);
    const step = this.journal.creatorStep(dropRef, this.journal.db.prepare("SELECT step_key FROM creator_setup_steps WHERE id=?").get(updated.setup_step_id).step_key);
    if (step.final_batch && step.logical_step === "add_tokens_v35") this.journal.completeCreatorStep({ dropRef, stepKey: "inventory_declared", network: project.network, signer: project.administrator, expectedPostcondition: { finalBatch: step.batch_index } });
    if (step.final_batch && step.logical_step === "append_token_slots_v35") this.journal.completeCreatorStep({ dropRef, stepKey: "inventory_complete", network: project.network, signer: project.administrator, expectedPostcondition: { finalBatch: step.batch_index } });
    if (step.final_batch && step.logical_step === "set_allowlist") this.journal.completeCreatorStep({ dropRef, stepKey: "allowlist_complete", network: project.network, signer: project.administrator, expectedPostcondition: { finalBatch: step.batch_index } });
    if (step.logical_step === "activate_sale") await this.projectService.activate(dropRef);
    if (step.logical_step === "close_sale") await this.projectService.activate(dropRef);
    return this.actionResponse(updated);
  }

  async reconcileOrigination(project, attempt, rows, finalized) {
    const match = this.matchingCreatorRows(attempt, rows, { appliedOnly: true, finalizedLevel: finalized.level })[0];
    if (!match) return { applied: false, reason: "Final origination does not match the exact signer, code, storage, amount, or derived KT1" };
    const originatedContract = address(match.originatedContract);
    await this.watcher.verifyContractBinding({ ...project, contract_address: originatedContract }, [], { requirePristine: true, atBlock: finalized.blockHash });
    return { applied: true, exactSignerCodeStorageAmount: true, inclusionLevel: Number(match.level), finalizedLevel: finalized.level, originatedContract };
  }

  async reconcileTransaction(project, attempt, rows, finalized) {
    const expectedValue = attempt.parameters.micheline;
    const match = rows.find((row) => address(row.sender) === attempt.signer
      && address(row.target) === attempt.target
      && Number(row.amount ?? 0) === attempt.amount_mutez
      && (attempt.entrypoint === "default"
        ? (!row.parameter || row.parameter.entrypoint === "default")
        : row.parameter?.entrypoint === attempt.entrypoint && digest(row.parameter.value) === digest(expectedValue))
      && Number(row.level) <= finalized.level);
    if (!match || match.status !== "applied") return { applied: false, reason: "Final transaction does not match the exact signer, target, entrypoint, amount, parameters, or applied status" };
    const observed = await this.postcondition(project, attempt, finalized.blockHash);
    return observed
      ? { applied: true, exactIntentAndPostcondition: true, inclusionLevel: Number(match.level), finalizedLevel: finalized.level }
      : { applied: false, reason: "Final transaction matched, but its exact expected contract result is absent" };
  }

  async postcondition(project, attempt, blockHash) {
    if (attempt.entrypoint === "default") return Boolean((await this.watcher.creatorManagerKeyAtFinalized(project.administrator)).key);
    const storage = await this.watcher.contractStorageAt(project.contract_address, blockHash);
    const rows = attempt.parameters.wallet;
    if (attempt.entrypoint === "add_tokens_v35") {
      if (nat(storage.token_count, "token_count") !== attempt.expectedPostcondition.tokenCountAfter
        || nat(storage.supply, "supply") !== attempt.expectedPostcondition.supplyAfter) return false;
      for (const row of rows) if (nat(await storage.token_supply.get(row.token_id), "token supply") !== row.quantity
        || String(await storage.token_commitments.get(row.token_id)).replace(/^0x/, "").toLowerCase() !== row.metadata_commitment) return false;
      return true;
    }
    if (attempt.entrypoint === "append_token_slots_v35") return nat(storage.slots_loaded, "slots_loaded") === attempt.expectedPostcondition.slotsLoadedAfter;
    if (attempt.entrypoint === "set_stages") {
      const size = Number(storage.stages.size ?? [...storage.stages.keys()].length);
      if (size !== rows.length) return false;
      for (const row of rows) {
        const stage = await storage.stages.get(String(row.stage));
        const maxPerWallet = stage?.max_per_wallet?.Some ?? null;
        if (!stage || nat(stage.price, "stage price") !== row.price_mutez || Boolean(stage.use_allowlist) !== row.use_allowlist
          || Math.floor(new Date(stage.start).getTime() / 1000) !== Math.floor(new Date(row.start).getTime() / 1000)
          || (row.max_per_wallet == null ? maxPerWallet !== null : nat(maxPerWallet, "stage wallet cap") !== row.max_per_wallet)) return false;
      }
      return true;
    }
    if (attempt.entrypoint === "set_allowlist") {
      for (const row of rows) if (nat(await storage.allowlist.get({ stage: row.stage, holder: row.holder }), "allowlist capacity") !== row.capacity) return false;
      return true;
    }
    if (attempt.entrypoint === "finalize_setup") return storage.setup_finalized === true;
    if (attempt.entrypoint === "fund_fulfillment_reserve") {
      const balance = await this.watcher.toolkit.rpc.getBalance(project.contract_address, { block: blockHash });
      return BigInt(balance.toFixed?.(0) ?? String(balance)) >= BigInt(attempt.expectedPostcondition.minimumContractBalanceMutez);
    }
    if (attempt.entrypoint === "activate_sale") return storage.sale_activated === true && storage.sale_active === true && storage.fulfillment_armed === true;
    if (attempt.entrypoint === "close_sale") return storage.sale_permanently_closed === true && storage.sale_active === false;
    return false;
  }
}
