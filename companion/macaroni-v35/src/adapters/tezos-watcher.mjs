import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { InMemorySigner } from "@taquito/signer";
import { MichelCodecPacker, TezosToolkit } from "@taquito/taquito";
import { encodeOpHash } from "@taquito/utils";
import { allocationDigest, asSafeNat, hashEntropyLink, normalizedHex, orderedMichelsonCodeSections, timestampMs } from "../protocol.mjs";

const KT1 = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const OPERATION = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const CREATOR_GAS_CAP = 1_040_000;
const CREATOR_STORAGE_CAP = 60_000;

function paddedCreatorLimits(estimate) {
  const gasLimit = Math.min(CREATOR_GAS_CAP, Math.ceil(estimate.gasLimit * 1.65) + 40_000);
  const storageLimit = Math.min(CREATOR_STORAGE_CAP, Math.ceil(estimate.storageLimit * 1.5) + 120);
  const bufferedEstimateFee = Math.ceil(estimate.suggestedFeeMutez * 1.35) + 500;
  // Keep this byte/gas fee floor identical to Macaroni Studio's
  // paddedSecureActionLimits/MD.feeFloorForGasLimit defaults.
  const paddedGasFeeFloor = Math.ceil((100 + estimate.opSize + gasLimit * 0.1) * 1.2 + 1_000);
  return { gasLimit, storageLimit, fee: Math.max(bufferedEstimateFee, paddedGasFeeFloor) };
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
}

function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function address(value) {
  return typeof value === "string" ? value : value?.address || null;
}

function noneOption(value) {
  return value == null || (typeof value === "object" && Object.hasOwn(value, "None"));
}

function operationRows(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function creatorRowsFromOperationGroups(value, fallbackLevel = null) {
  const groups = [];
  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (candidate && typeof candidate === "object" && Array.isArray(candidate.contents)) groups.push(candidate);
  };
  visit(value);
  return groups.flatMap((group) => group.contents.flatMap((content) => {
    if (content.kind !== "transaction" && content.kind !== "origination") return [];
    const result = content.metadata?.operation_result || {};
    const common = {
      hash: group.hash,
      status: result.status || "pending",
      sender: { address: content.source },
      level: Number(group.level ?? content.level ?? fallbackLevel),
    };
    if (content.kind === "origination") {
      return [{
        ...common,
        contractBalance: Number(content.balance || 0),
        code: content.script?.code,
        storage: content.script?.storage,
        originatedContract: { address: result.originated_contracts?.[0] || null },
      }];
    }
    return [{
      ...common,
      target: { address: content.destination },
      amount: Number(content.amount || 0),
      parameter: content.parameters || null,
    }];
  }));
}

function normalizedReleasePolicy(value) {
  if (value && Object.hasOwn(value, "immediate")) return { kind: "immediate" };
  if (value && Object.hasOwn(value, "sellout")) return { kind: "sellout" };
  if (value && Object.hasOwn(value, "rolling_delay")) return { kind: "rolling_delay", seconds: asSafeNat(value.rolling_delay, "rolling delay") };
  if (value && Object.hasOwn(value, "scheduled")) return { kind: "scheduled", at: new Date(timestampMs(value.scheduled)).toISOString() };
  throw new Error("Unsupported V3.5 release policy in contract storage");
}

function firstSettlementItem(parameterValue) {
  if (Array.isArray(parameterValue)) return parameterValue[0] || null;
  if (Array.isArray(parameterValue?.items)) return parameterValue.items[0] || null;
  return null;
}

export class TezosWatcher {
  constructor({ rpcUrl, indexerUrl, duplicateCheckUrl, duplicateCheckMode = "private_full_scan", network, expectedChainId, signerKeyFile, abiPath, toolkit = null, signer = null, fetchImpl = null }) {
    this.rpcUrl = rpcUrl.replace(/\/$/, "");
    this.indexerUrl = indexerUrl.replace(/\/$/, "");
    this.duplicateCheckUrl = duplicateCheckUrl;
    this.duplicateCheckMode = duplicateCheckMode;
    this.network = network;
    this.expectedChainId = expectedChainId;
    this.signerKeyFile = signerKeyFile;
    this.abiPath = abiPath;
    this.toolkit = toolkit;
    this.signer = signer;
    this.fetch = fetchImpl || fetch;
    this.contractCache = new Map();
  }

  async initialize() {
    if (!this.signer) {
      const secret = (await readFile(this.signerKeyFile, "utf8")).trim();
      if (!secret) throw new Error("Finalizer signer key file is empty");
      this.signer = await InMemorySigner.fromSecretKey(secret);
    }
    if (!this.toolkit) this.toolkit = new TezosToolkit(this.rpcUrl);
    this.toolkit.setPackerProvider(new MichelCodecPacker());
    this.toolkit.setProvider({ signer: this.signer });
    const [chainId, signerAddress] = await Promise.all([this.chainId(), this.signer.publicKeyHash()]);
    if (chainId !== this.expectedChainId) throw new Error(`Configured ${this.network} RPC returned ${chainId}, expected ${this.expectedChainId}`);
    this.signerAddress = signerAddress;
    return { chainId, signerAddress };
  }

  async chainId() {
    if (this.toolkit?.rpc?.getChainId) return this.toolkit.rpc.getChainId();
    const response = await this.fetch(`${this.rpcUrl}/chains/main/chain_id`);
    if (!response.ok) throw new Error(`Tezos RPC returned HTTP ${response.status}`);
    return response.json();
  }

  async blockTimingMs() {
    const constants = await this.toolkit.rpc.getConstants();
    const seconds = Number(constants.minimal_block_delay);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("RPC protocol constants omit minimal_block_delay");
    return Math.ceil(seconds * 1000);
  }

  async currentHeadLevel() {
    return Number((await this.toolkit.rpc.getBlockHeader()).level);
  }

  async creatorManagerKeyAtFinalized(creator) {
    const finalized = await this.finalizedHeadSnapshot();
    const response = await this.fetch(`${this.rpcUrl}/chains/main/blocks/${encodeURIComponent(finalized.blockHash)}/context/contracts/${encodeURIComponent(creator)}/manager_key`);
    if (!response.ok) throw new Error(`Creator manager-key lookup failed with HTTP ${response.status}`);
    const value = await response.json();
    const key = typeof value === "string" ? value : value?.key || null;
    return { ...finalized, key };
  }

  creatorEstimateToolkit(project, publicKey) {
    if (!publicKey) throw new Error("Creator public key is required for a read-only live estimate");
    const toolkit = new TezosToolkit(this.rpcUrl);
    toolkit.setPackerProvider(new MichelCodecPacker());
    toolkit.setProvider({
      signer: {
        publicKeyHash: async () => project.administrator,
        publicKey: async () => publicKey,
        secretKey: async () => { throw new Error("Creator estimator has no secret key"); },
        sign: async () => { throw new Error("Creator estimator cannot sign"); },
      },
    });
    return toolkit;
  }

  normalizeCreatorEstimate(estimate) {
    const numeric = (value, label) => {
      const result = value && typeof value.toNumber === "function" ? value.toNumber() : Number(value);
      if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Tezos live estimate returned an invalid ${label}`);
      return result;
    };
    const opSize = numeric(estimate.opSize, "operation size");
    if (opSize <= 0) throw new Error("Tezos live estimate returned an empty operation size");
    return {
      source: "live_tezos_rpc_estimate",
      gasLimit: numeric(estimate.gasLimit, "gas limit"),
      storageLimit: numeric(estimate.storageLimit, "storage limit"),
      suggestedFeeMutez: numeric(estimate.suggestedFeeMutez, "suggested fee"),
      totalCostMutez: numeric(estimate.totalCost, "total cost"),
      opSize,
    };
  }

  async measureFinalCreatorOperation({ toolkit, project, estimate, kind, code = null, storage = null, target = null, amountMutez = 0, parameter = undefined }) {
    const limits = paddedCreatorLimits(estimate);
    const prepared = kind === "origination"
      ? await toolkit.prepare.originate({
          code,
          init: storage,
          balance: amountMutez,
          mutez: true,
          fee: limits.fee,
          gasLimit: limits.gasLimit,
          storageLimit: limits.storageLimit,
        })
      : await toolkit.prepare.transaction({
          to: target,
          amount: amountMutez,
          mutez: true,
          fee: limits.fee,
          gasLimit: limits.gasLimit,
          storageLimit: limits.storageLimit,
          ...(parameter ? { parameter } : {}),
        });
    const forgedHex = await toolkit.rpc.forgeOperations(toolkit.prepare.toForge(prepared));
    if (typeof forgedHex !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(forgedHex)) {
      throw new Error("Tezos RPC returned invalid forged creator operation bytes");
    }
    // forgeOperations omits the operation-group signature. tz4/BLS signatures
    // are 96 bytes; the other supported Tezos manager curves use 64 bytes.
    const signatureBytes = project.administrator.startsWith("tz4") ? 96 : 64;
    return {
      ...estimate,
      finalOperationSizeBytes: forgedHex.length / 2 + signatureBytes,
      paddedLimits: limits,
    };
  }

  async estimateCreatorTransfer({ project, publicKey, target, amountMutez, parameter = undefined }) {
    const toolkit = this.creatorEstimateToolkit(project, publicKey);
    const estimate = this.normalizeCreatorEstimate(await toolkit.estimate.transfer({
      to: target,
      amount: amountMutez,
      mutez: true,
      ...(parameter ? { parameter } : {}),
    }));
    return this.measureFinalCreatorOperation({ toolkit, project, estimate, kind: "transaction", target, amountMutez, parameter });
  }

  async estimateCreatorOrigination({ project, publicKey, code, storage }) {
    const toolkit = this.creatorEstimateToolkit(project, publicKey);
    const estimate = this.normalizeCreatorEstimate(await toolkit.estimate.originate({ code, init: storage }));
    return this.measureFinalCreatorOperation({ toolkit, project, estimate, kind: "origination", code, storage });
  }

  async finalizedHeadSnapshot() {
    const head = await this.toolkit.rpc.getBlockHeader();
    const observedHeadLevel = Number(head.level);
    if (!Number.isSafeInteger(observedHeadLevel) || observedHeadLevel < 2) {
      throw new Error("RPC head is too early to derive a finalized contract snapshot");
    }
    const level = observedHeadLevel - 2;
    const blockHash = await this.toolkit.rpc.getBlockHash({ block: String(level) });
    if (typeof blockHash !== "string" || blockHash.length === 0) {
      throw new Error("RPC did not return the finalized contract-snapshot block hash");
    }
    return { level, blockHash, observedHeadLevel };
  }

  async activationFunding(project, storage = null) {
    const observed = storage || await this.contractStorage(project.contract_address);
    const stages = typeof observed.stages?.values === "function"
      ? [...observed.stages.values()]
      : Object.values(observed.stages || {});
    if (stages.length === 0) throw new Error("Contract has no sale stages");
    const hasFreeStage = stages.some((stage) => asSafeNat(stage.price, "stage price") === 0);
    const operationsToFund = hasFreeStage
      ? (BigInt(project.physical_supply) > 5n ? BigInt(project.physical_supply) : 5n)
      : 5n;
    const requiredMutez = BigInt(project.fulfillment_subsidy_mutez) * operationsToFund;
    const balance = await this.toolkit.rpc.getBalance(project.contract_address);
    const balanceMutez = BigInt(balance.toFixed?.(0) ?? String(balance));
    return {
      hasFreeStage,
      requiredMutez,
      balanceMutez,
      sufficient: balanceMutez >= requiredMutez,
    };
  }

  estimatedManagerSpend(estimate) {
    const fee = Number(estimate.suggestedFeeMutez);
    const burn = Number(estimate.burnFeeMutez);
    const total = fee + burn;
    if (!Number.isSafeInteger(fee) || fee < 0 || !Number.isSafeInteger(burn) || burn < 0
      || !Number.isSafeInteger(total) || total < 0) {
      throw new Error("Taquito did not provide a safe manager-operation cost estimate");
    }
    return total;
  }

  async finalizerFunding(requiredMutez) {
    if (!Number.isSafeInteger(requiredMutez) || requiredMutez < 0) throw new Error("Finalizer funding requirement is invalid");
    const [balance, managerKey] = await Promise.all([
      this.toolkit.rpc.getBalance(this.signerAddress),
      this.toolkit.rpc.getManagerKey(this.signerAddress),
    ]);
    const balanceMutez = BigInt(balance.toFixed?.(0) ?? String(balance));
    return {
      revealed: typeof managerKey === "string" && managerKey.length > 0,
      balanceMutez,
      requiredMutez: BigInt(requiredMutez),
      sufficient: balanceMutez >= BigInt(requiredMutez),
    };
  }

  async estimateArmFulfillmentCost(contractAddress) {
    const contract = await this.contractAt(contractAddress);
    if (typeof contract.methodsObject?.arm_fulfillment !== "function") throw new Error("Attached contract has no arm_fulfillment entrypoint");
    const estimate = await this.toolkit.estimate.contractCall(contract.methodsObject.arm_fulfillment());
    return this.estimatedManagerSpend(estimate);
  }

  async contractAt(contractAddress) {
    if (!KT1.test(contractAddress)) throw new Error("invalid KT1 contract");
    if (!this.contractCache.has(contractAddress)) {
      this.contractCache.set(contractAddress, await this.toolkit.contract.at(contractAddress));
    }
    return this.contractCache.get(contractAddress);
  }

  async contractStorage(contractAddress) {
    return (await this.contractAt(contractAddress)).storage();
  }

  async contractStorageAt(contractAddress, block) {
    if (!KT1.test(contractAddress)) throw new Error("invalid KT1 contract");
    const contract = await this.toolkit.contract.at(contractAddress, undefined, block);
    return contract.storage();
  }

  async verifyContractCode(contractAddress, block = "head") {
    const [onchain, artifact] = await Promise.all([
      this.toolkit.rpc.getScript(contractAddress, { block }),
      readFile(this.abiPath, "utf8").then(JSON.parse),
    ]);
    if (!Array.isArray(artifact) || !Array.isArray(onchain?.code)) throw new Error("Could not compare V3.5 contract code");
    const expected = digest(orderedMichelsonCodeSections(artifact));
    const observed = digest(orderedMichelsonCodeSections(onchain.code));
    if (expected !== observed) throw new Error("Attached contract code does not match the reviewed V3.5 artifact");
    return { expected, observed };
  }

  async verifyContractBinding(project, tokens = [], options = {}) {
    const chainId = await this.chainId();
    if (chainId !== this.expectedChainId || project.network !== this.network) throw new Error("Project, signer, and RPC networks do not match");
    const block = options.atBlock || "head";
    const code = await this.verifyContractCode(project.contract_address, block);
    const contract = block === "head"
      ? await this.contractAt(project.contract_address)
      : await this.toolkit.contract.at(project.contract_address, undefined, block);
    if (typeof contract.methodsObject?.settle_claims_v35 !== "function"
      || typeof contract.methodsObject?.arm_fulfillment !== "function") {
      throw new Error("Attached contract is missing a required V3.5 fulfillment entrypoint");
    }
    const storage = await contract.storage();
    if (String(storage.creator) !== project.creator) throw new Error("Contract creator does not match the registered project");
    if (String(storage.administrator) !== project.administrator) throw new Error("Contract administrator does not match the registered project");
    if (String(storage.treasury) !== project.treasury) throw new Error("Contract treasury does not match the registered project");
    if (String(storage.finalizer) !== this.signerAddress) throw new Error("Contract finalizer does not match the Companion signer");
    if (asSafeNat(storage.fulfillment_subsidy, "fulfillment_subsidy") !== project.fulfillment_subsidy_mutez) {
      throw new Error("Contract fulfillment subsidy does not match the registered project");
    }
    const expectedRelease = typeof project.release_policy_json === "string" ? JSON.parse(project.release_policy_json) : project.releasePolicy;
    if (canonical(normalizedReleasePolicy(storage.release_policy)) !== canonical(expectedRelease)) {
      throw new Error("Contract release policy does not match the registered project");
    }
    if (normalizedHex(storage.entropy_commitment, 32) !== project.entropy_head) throw new Error("Contract entropy head does not match private recovery custody");
    if (asSafeNat(storage.entropy_length, "entropy_length") !== project.entropy_length) throw new Error("Contract entropy length does not match physical supply");
    if (storage.sale_activated === true) {
      const stages = typeof storage.stages?.values === "function"
        ? [...storage.stages.values()]
        : Object.values(storage.stages || {});
      if (stages.length === 0) throw new Error("Activated contract has no sale stages");
      const hasFreeStage = stages.some((stage) => asSafeNat(stage.price, "stage price") === 0);
      const operationCount = hasFreeStage
        ? (BigInt(project.physical_supply) > 5n ? BigInt(project.physical_supply) : 5n)
        : 5n;
      const expectedReserve = BigInt(project.fulfillment_subsidy_mutez) * operationCount;
      if (BigInt(storage.activation_reserve_required?.toFixed?.(0) ?? String(storage.activation_reserve_required)) !== expectedReserve) {
        throw new Error("Contract activation reserve record does not match the selected stages and fixed supply");
      }
      if (storage.fulfillment_armed !== true) throw new Error("Activated contract does not retain the required fulfillment handshake");
    }
    if (tokens.length > 0) {
      const supply = tokens.reduce((sum, token) => sum + token.quantity, 0);
      if (supply !== project.physical_supply) throw new Error("Private token quantities do not equal fixed physical supply");
      if (asSafeNat(storage.token_count, "token_count") !== tokens.length) {
        throw new Error("Contract token row count does not match private staging");
      }
      if (asSafeNat(storage.supply, "supply") !== project.physical_supply) {
        throw new Error("Contract physical supply does not match private staging");
      }
      if (asSafeNat(storage.slots_loaded, "slots_loaded") !== project.physical_supply
        || asSafeNat(storage.next_slot_token_id, "next_slot_token_id") !== tokens.length) {
        throw new Error("Contract canonical physical-slot loading is incomplete");
      }
      for (const token of tokens) {
        const commitment = normalizedHex(await storage.token_commitments.get(token.token_id), 32);
        if (commitment !== token.metadata_commitment) throw new Error(`Token ${token.token_id} commitment differs from private staging`);
        const quantity = asSafeNat(await storage.token_supply.get(token.token_id), `token ${token.token_id} supply`);
        if (quantity !== token.quantity) throw new Error(`Token ${token.token_id} quantity differs from private staging`);
        const slotsLoaded = asSafeNat(await storage.token_slots_loaded.get(token.token_id), `token ${token.token_id} slots loaded`);
        if (slotsLoaded !== token.quantity) throw new Error(`Token ${token.token_id} canonical slots are incomplete`);
      }
    }
    if (options.requirePristine) {
      const pristine = storage.setup_finalized === false
        && storage.sale_activated === false
        && storage.sale_active === false
        && storage.sale_permanently_closed === false
        && storage.fulfillment_armed === false
        && storage.paused === false
        && noneOption(storage.pending_administrator)
        && noneOption(storage.pending_finalizer)
        && storage.final_sweep_complete === false
        && asSafeNat(storage.token_count, "token_count") === 0
        && asSafeNat(storage.supply, "supply") === 0
        && asSafeNat(storage.slots_loaded, "slots_loaded") === 0
        && asSafeNat(storage.next_slot_token_id, "next_slot_token_id") === 0
        && asSafeNat(storage.claims_created, "claims_created") === 0
        && asSafeNat(storage.claims_settled, "claims_settled") === 0
        && asSafeNat(storage.next_claim_to_settle, "next_claim_to_settle") === 0
        && asSafeNat(storage.entropy_remaining, "entropy_remaining") === project.entropy_length
        && asSafeNat(storage.activation_reserve_required, "activation_reserve_required") === 0
        && asSafeNat(storage.total_sales_received, "total_sales_received") === 0
        && asSafeNat(storage.total_treasury_paid, "total_treasury_paid") === 0
        && asSafeNat(storage.total_subsidy_retained, "total_subsidy_retained") === 0
        && asSafeNat(storage.total_reimbursements, "total_reimbursements") === 0
        && asSafeNat(storage.final_sweep_amount, "final_sweep_amount") === 0;
      if (!pristine) throw new Error("Companion can only attach while the originated V3.5 contract is pristine and closed");
    }
    return { chainId, code, storage };
  }

  async scanClaims({ project, fromClaimId }) {
    const head = await this.toolkit.rpc.getBlockHeader();
    const headLevel = Number(head.level);
    if (!Number.isSafeInteger(headLevel) || headLevel < 2) throw new Error("RPC head is too early to derive a finalized claim snapshot");
    const finalizedLevel = headLevel - 2;
    const finalizedBlock = await this.toolkit.rpc.getBlockHash({ block: String(finalizedLevel) });
    const storage = await this.contractStorageAt(project.contract_address, finalizedBlock);
    const claimsCreated = asSafeNat(storage.claims_created, "claims_created");
    const claimsSettled = asSafeNat(storage.claims_settled, "claims_settled");
    const nextClaimToSettle = asSafeNat(storage.next_claim_to_settle, "next_claim_to_settle");
    const supply = asSafeNat(storage.supply, "supply");
    const claims = [];
    for (let claimId = fromClaimId; claimId < claimsCreated; claimId += 1) {
      const claim = await storage.claims.get(claimId);
      if (!claim) throw new Error(`On-chain claim ${claimId} is missing`);
      claims.push({
        claimId,
        buyer: String(claim.buyer),
        recipient: String(claim.recipient),
        unit: asSafeNat(claim.unit, "claim unit"),
        purchaseLevel: asSafeNat(claim.purchase_level, "purchase level"),
        purchaseTime: timestampMs(claim.purchase_time),
        stageId: asSafeNat(claim.stage_id, "stage id"),
      });
    }
    return { storage, claims, claimsCreated, claimsSettled, nextClaimToSettle, supply, level: finalizedLevel, observedHeadLevel: headLevel, finalizedBlock };
  }

  releaseEligibleAt(storage, claim, now = Date.now()) {
    const policy = storage.release_policy;
    if (policy && Object.hasOwn(policy, "immediate")) return now;
    if (policy && Object.hasOwn(policy, "rolling_delay")) {
      return claim.purchaseTime + asSafeNat(policy.rolling_delay, "rolling delay") * 1000;
    }
    if (policy && Object.hasOwn(policy, "scheduled")) return timestampMs(policy.scheduled);
    if (policy && Object.hasOwn(policy, "sellout")) {
      return asSafeNat(storage.claims_created, "claims_created") === asSafeNat(storage.supply, "supply")
        || storage.sale_permanently_closed === true
        ? now
        : null;
    }
    throw new Error("Unsupported V3.5 release policy in contract storage");
  }

  async verifyAllocationBoundary({ project, claim, token, entropyPreimage, localSlots, result }) {
    const storage = await this.contractStorage(project.contract_address);
    if (String(storage.creator) !== project.creator
      || String(storage.administrator) !== project.administrator
      || String(storage.treasury) !== project.treasury
      || String(storage.finalizer) !== this.signerAddress
      || asSafeNat(storage.fulfillment_subsidy, "fulfillment_subsidy") !== project.fulfillment_subsidy_mutez
      || canonical(normalizedReleasePolicy(storage.release_policy)) !== canonical(JSON.parse(project.release_policy_json))
      || normalizedHex(storage.entropy_commitment, 32) !== project.entropy_head) {
      throw new Error("Contract custody or immutable project binding changed before settlement");
    }
    if (asSafeNat(storage.next_claim_to_settle, "next_claim_to_settle") !== claim.claim_id) throw new Error("Contract FIFO cursor changed before settlement");
    if (hashEntropyLink(entropyPreimage) !== normalizedHex(storage.entropy_cursor, 32)) throw new Error("Private entropy preimage does not open the current contract cursor");
    const remaining = asSafeNat(storage.supply, "supply") - asSafeNat(storage.claims_settled, "claims_settled");
    if (remaining !== localSlots.length || result.last !== remaining - 1) throw new Error("Local slot pool does not match on-chain remaining supply");
    const [drawToken, lastToken, commitment] = await Promise.all([
      storage.slots.get(result.draw),
      storage.slots.get(result.last),
      storage.token_commitments.get(result.tokenId),
    ]);
    if (asSafeNat(drawToken, "draw token") !== result.tokenId) throw new Error("Local forced allocation differs from the contract draw slot");
    if (asSafeNat(lastToken, "last token") !== localSlots[result.last]) throw new Error("Local forced allocation differs from the contract last slot");
    if (normalizedHex(commitment, 32) !== token.metadata_commitment) throw new Error("Selected metadata commitment changed on-chain");
    const expectedDigest = allocationDigest({
      chainId: this.expectedChainId,
      contractAddress: project.contract_address,
      creator: project.creator,
      claimId: claim.claim_id,
      buyer: claim.buyer,
      recipient: claim.recipient,
      unit: claim.unit,
      purchaseLevel: claim.purchase_level,
      entropyPreimage,
    });
    if (expectedDigest !== result.allocationDigest) throw new Error("Allocation digest changed before settlement");
    return { storage, expectedDigest };
  }

  async prepareManagerCall({ method, contractAddress, entrypoint, maximumCostMutez = null }) {
    const estimate = await this.toolkit.estimate.contractCall(method);
    const estimatedTotalCostMutez = this.estimatedManagerSpend(estimate);
    if (maximumCostMutez != null && estimatedTotalCostMutez > maximumCostMutez) {
      throw new Error(`Estimated ${entrypoint} cost ${estimatedTotalCostMutez} mutez exceeds the ${maximumCostMutez} mutez fulfillment subsidy`);
    }
    const finalizer = await this.finalizerFunding(estimatedTotalCostMutez);
    if (!finalizer.revealed) throw new Error("Finalizer account must be revealed before an automated manager operation can be signed");
    if (!finalizer.sufficient) {
      throw new Error(`Finalizer wallet has ${finalizer.balanceMutez} mutez but this operation requires ${finalizer.requiredMutez} mutez`);
    }
    const prepared = await this.toolkit.prepare.transaction(method.toTransferParams({
      fee: estimate.suggestedFeeMutez,
      gasLimit: estimate.gasLimit,
      storageLimit: estimate.storageLimit,
    }));
    const forgedBytes = await this.toolkit.rpc.forgeOperations(this.toolkit.prepare.toForge(prepared));
    const signed = await this.signer.sign(forgedBytes, new Uint8Array([3]));
    const preapply = await this.toolkit.rpc.preapplyOperations([{
      ...prepared.opOb,
      signature: signed.prefixSig,
    }]);
    if (!Array.isArray(preapply) || preapply.length === 0) throw new Error("Settlement preapply returned no operation result");
    const failures = [];
    let resultCount = 0;
    for (const group of preapply) {
      if (!Array.isArray(group.contents) || group.contents.length === 0) throw new Error("Settlement preapply returned no operation contents");
      for (const content of group.contents) {
        const result = content.metadata?.operation_result;
        if (!result?.status) throw new Error("Settlement preapply omitted an operation result status");
        resultCount += 1;
        if (result?.status && result.status !== "applied") failures.push(result.status);
      }
    }
    if (resultCount === 0) throw new Error("Settlement preapply returned no applied result");
    if (failures.length > 0) throw new Error(`Settlement preapply failed: ${failures.join(",")}`);
    const transaction = [...prepared.opOb.contents].reverse().find((content) => content.kind === "transaction");
    if (!transaction || address(transaction.destination) !== contractAddress
      || transaction.parameters?.entrypoint !== entrypoint) {
      throw new Error("Prepared settlement operation changed target or entrypoint");
    }
    const operationHash = encodeOpHash(signed.sbytes);
    if (!OPERATION.test(operationHash)) throw new Error("Signed settlement did not produce a canonical operation hash");
    const branchHeader = await this.toolkit.rpc.getBlockHeader({ block: prepared.opOb.branch });
    const branchLevel = Number(branchHeader.level);
    if (!Number.isSafeInteger(branchLevel) || branchLevel < 0) throw new Error("Signed settlement branch level is unavailable");
    return {
      operationHash,
      signedBytes: signed.sbytes,
      signedBytesSha256: createHash("sha256").update(Buffer.from(signed.sbytes, "hex")).digest("hex"),
      branch: prepared.opOb.branch,
      branchLevel,
      managerCounter: String(transaction.counter),
      estimatedTotalCostMutez,
    };
  }

  async prepareSettlement({ contractAddress, claimId, entropyPreimage, metadataUri, metadataNonce, maximumCostMutez }) {
    const contract = await this.contractAt(contractAddress);
    return this.prepareManagerCall({
      contractAddress,
      entrypoint: "settle_claims_v35",
      maximumCostMutez,
      method: contract.methodsObject.settle_claims_v35([{
        claim_id: claimId,
        entropy_preimage: normalizedHex(entropyPreimage, 32),
        metadata_uri: Buffer.from(metadataUri, "utf8").toString("hex"),
        metadata_nonce: normalizedHex(metadataNonce, 32),
      }]),
    });
  }

  async prepareArmFulfillment(contractAddress) {
    const contract = await this.contractAt(contractAddress);
    if (typeof contract.methodsObject?.arm_fulfillment !== "function") throw new Error("Attached contract has no arm_fulfillment entrypoint");
    return this.prepareManagerCall({
      contractAddress,
      entrypoint: "arm_fulfillment",
      method: contract.methodsObject.arm_fulfillment(),
    });
  }

  async operationPoolState(operationHash) {
    const indexed = await this.exactOperation(operationHash);
    if (indexed.length > 0) return { state: "indexed" };
    const pending = await this.toolkit.rpc.getPendingOperations();
    const rejected = [
      ...(pending.refused || []),
      ...(pending.branch_refused || []),
      ...(pending.outdated || []),
    ];
    const rejectedRow = rejected.find((row) => row.hash === operationHash);
    const waiting = [
      ...(pending.validated || []),
      ...(pending.branch_delayed || []),
      ...(pending.unprocessed || []),
    ];
    if (waiting.some((row) => row.hash === operationHash)) return { state: "mempool" };
    return rejectedRow ? { state: "rejected" } : { state: "absent" };
  }

  async branchExpiryEvidence({ branch, branchLevel }) {
    let signedAtLevel = Number(branchLevel);
    if (!Number.isSafeInteger(signedAtLevel) || signedAtLevel <= 0) {
      signedAtLevel = Number((await this.toolkit.rpc.getBlockHeader({ block: branch })).level);
    }
    const [head, constants] = await Promise.all([
      this.toolkit.rpc.getBlockHeader(),
      this.toolkit.rpc.getConstants(),
    ]);
    const headLevel = Number(head.level);
    const maxOperationsTtl = Number(constants.max_operations_time_to_live);
    if (!Number.isSafeInteger(signedAtLevel) || signedAtLevel < 0
      || !Number.isSafeInteger(headLevel) || headLevel < signedAtLevel
      || !Number.isSafeInteger(maxOperationsTtl) || maxOperationsTtl < 0) {
      throw new Error("RPC did not provide authoritative operation branch-lifetime evidence");
    }
    return {
      branchLevel: signedAtLevel,
      headLevel,
      maxOperationsTtl,
      expired: headLevel - signedAtLevel > maxOperationsTtl,
    };
  }

  async canonicalOperationLevel(operationHash, fromLevel, throughLevel) {
    for (let level = fromLevel; level <= throughLevel; level += 1) {
      const response = await this.fetch(`${this.rpcUrl}/chains/main/blocks/${level}/operation_hashes`);
      if (!response.ok) throw new Error(`RPC canonical operation proof failed with HTTP ${response.status}`);
      const groups = await response.json();
      if (!Array.isArray(groups)) throw new Error("RPC canonical operation proof was malformed");
      if (groups.some((pass) => Array.isArray(pass) && pass.includes(operationHash))) return level;
    }
    return null;
  }

  async replacementEvidence({ operationHash, branch, branchLevel, managerCounter, chainCounter, rejected = false }) {
    const expiry = await this.branchExpiryEvidence({ branch, branchLevel });
    const counterConsumed = chainCounter >= BigInt(managerCounter);
    if (!expiry.expired) {
      return counterConsumed || rejected
        ? { state: "wait_for_branch_expiry", reason: rejected ? "one_rpc_reports_rejected" : "manager_counter_changed_without_final_absence_proof", ...expiry }
        : { state: "safe_to_inject_exact_bytes" };
    }
    const canonicalInclusionLevel = await this.canonicalOperationLevel(
      operationHash,
      expiry.branchLevel + 1,
      Math.min(expiry.headLevel, expiry.branchLevel + expiry.maxOperationsTtl + 1),
    );
    if (canonicalInclusionLevel != null) return { state: "chain_included", canonicalInclusionLevel };
    return { state: "safe_to_replace_expired", reason: "branch_beyond_protocol_ttl", ...expiry };
  }

  async preparedSettlementStatus({ project, claimId, operationHash, managerCounter, branch, branchLevel }) {
    const pool = await this.operationPoolState(operationHash);
    if (pool.state === "indexed" || pool.state === "mempool") return pool;
    const storage = await this.contractStorage(project.contract_address);
    const [observedToken, signerAccount] = await Promise.all([
      storage.claim_token.get(claimId),
      this.toolkit.rpc.getContract(this.signerAddress),
    ]);
    if (observedToken != null) return { state: "claim_already_settled" };
    if (asSafeNat(storage.next_claim_to_settle, "next_claim_to_settle") !== claimId) {
      return { state: "fifo_cursor_changed" };
    }
    const chainCounter = BigInt(signerAccount.counter || "0");
    return this.replacementEvidence({ operationHash, branch, branchLevel, managerCounter, chainCounter, rejected: pool.state === "rejected" });
  }

  async preparedArmStatus({ project, operationHash, managerCounter, branch, branchLevel }) {
    const pool = await this.operationPoolState(operationHash);
    if (pool.state === "indexed" || pool.state === "mempool") return pool;
    const storage = await this.contractStorage(project.contract_address);
    const signerAccount = await this.toolkit.rpc.getContract(this.signerAddress);
    if (storage.fulfillment_armed === true) return { state: "arm_state_changed" };
    if (storage.sale_permanently_closed === true) {
      const expiry = await this.branchExpiryEvidence({ branch, branchLevel });
      if (!expiry.expired) {
        return { state: "wait_for_branch_expiry", reason: "sale_permanently_closed_before_arm_resolution", ...expiry };
      }
      const canonicalInclusionLevel = await this.canonicalOperationLevel(
        operationHash,
        expiry.branchLevel + 1,
        Math.min(expiry.headLevel, expiry.branchLevel + expiry.maxOperationsTtl + 1),
      );
      if (canonicalInclusionLevel != null) return { state: "chain_included", canonicalInclusionLevel };
      return { state: "safe_to_retire_closed", reason: "closed_sale_and_expired_arm_absent_from_canonical_window", ...expiry };
    }
    if (storage.setup_finalized !== true || storage.sale_activated !== false
      || storage.sale_permanently_closed !== false || asSafeNat(storage.claims_created, "claims_created") !== 0) {
      return { state: "arm_precondition_changed" };
    }
    const chainCounter = BigInt(signerAccount.counter || "0");
    return this.replacementEvidence({ operationHash, branch, branchLevel, managerCounter, chainCounter, rejected: pool.state === "rejected" });
  }

  async injectSignedSettlement({ signedBytes, operationHash }) {
    const computedHash = encodeOpHash(normalizedHex(signedBytes));
    if (computedHash !== operationHash) throw new Error("Persisted signed settlement bytes do not match their operation hash");
    const injectedHash = await this.toolkit.rpc.injectOperation(signedBytes);
    if (injectedHash !== operationHash) throw new Error("RPC returned a different operation hash for the persisted signed bytes");
    return { operationHash };
  }

  async exactOperation(operationHash) {
    if (!OPERATION.test(operationHash)) throw new Error("invalid Tezos operation hash");
    const response = await this.fetch(`${this.indexerUrl}/operations/transactions/${encodeURIComponent(operationHash)}`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`TzKT operation lookup failed with HTTP ${response.status}`);
    return operationRows(await response.json());
  }

  async exactOrigination(operationHash) {
    if (!OPERATION.test(operationHash)) throw new Error("invalid Tezos operation hash");
    const response = await this.fetch(`${this.indexerUrl}/operations/originations/${encodeURIComponent(operationHash)}?micheline=2`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`TzKT origination lookup failed with HTTP ${response.status}`);
    return operationRows(await response.json());
  }

  async canonicalCreatorOperationRows(operationHash, inclusionLevel) {
    if (!OPERATION.test(operationHash) || !Number.isSafeInteger(inclusionLevel) || inclusionLevel < 0) {
      throw new Error("Creator operation has no valid canonical inclusion identity");
    }
    const blockHash = await this.toolkit.rpc.getBlockHash({ block: String(inclusionLevel) });
    const response = await this.fetch(`${this.rpcUrl}/chains/main/blocks/${encodeURIComponent(blockHash)}/operations`);
    if (!response.ok) throw new Error(`RPC canonical creator operation lookup failed with HTTP ${response.status}`);
    return creatorRowsFromOperationGroups(await response.json(), inclusionLevel)
      .filter((row) => row.hash === operationHash);
  }

  async creatorSubmissionStatus(attempt) {
    const rows = attempt.entrypoint === "origination"
      ? await this.exactOrigination(attempt.operation_hash)
      : await this.exactOperation(attempt.operation_hash);
    const headLevel = await this.currentHeadLevel();
    if (rows.length > 0) {
      const levels = rows.map((row) => Number(row.level)).filter(Number.isSafeInteger);
      const inclusionLevel = levels.length ? Math.min(...levels) : null;
      if (inclusionLevel != null && headLevel >= inclusionLevel + 2) {
        const canonicalRows = await this.canonicalCreatorOperationRows(attempt.operation_hash, inclusionLevel);
        return canonicalRows.length > 0
          ? { state: "indexed_final", rows: canonicalRows, inclusionLevel, headLevel }
          : { state: "canonical_inclusion_not_indexed", rows: [], inclusionLevel, headLevel };
      }
      return {
        state: "indexed_waiting_finality",
        rows,
        inclusionLevel,
        headLevel,
      };
    }
    const constants = await this.toolkit.rpc.getConstants();
    const ttl = Number(constants.max_operations_time_to_live);
    const submittedHeadLevel = Number(attempt.submitted_head_level);
    const issuedHeadLevel = Number(attempt.issued_head_level);
    if (!Number.isSafeInteger(ttl) || ttl < 0 || !Number.isSafeInteger(submittedHeadLevel) || submittedHeadLevel < 0) {
      throw new Error("Creator submission is missing authoritative protocol-TTL evidence");
    }
    if (!Number.isSafeInteger(issuedHeadLevel) || issuedHeadLevel < 0 || issuedHeadLevel > submittedHeadLevel) {
      throw new Error("Creator submission has no safe issuance-to-submission canonical window");
    }
    if (headLevel - submittedHeadLevel <= ttl + 2) {
      return { state: "not_indexed_within_ttl", rows: [], headLevel, submittedHeadLevel, maxOperationsTtl: ttl };
    }
    // The renderer may report a hash long after wallet broadcast. Scan from
    // the durable issuance level through every finalized block, rather than a
    // window centered on the late report time, before declaring it absent.
    const fromLevel = issuedHeadLevel;
    const throughLevel = headLevel - 2;
    const canonicalInclusionLevel = await this.canonicalOperationLevel(attempt.operation_hash, fromLevel, throughLevel);
    return canonicalInclusionLevel == null
      ? { state: "expired_absent", rows: [], headLevel, submittedHeadLevel, maxOperationsTtl: ttl, fromLevel, throughLevel }
      : { state: "canonical_inclusion_not_indexed", rows: [], headLevel, canonicalInclusionLevel };
  }

  async findFinalCreatorIntentCandidates(attempt) {
    const finalized = await this.finalizedHeadSnapshot();
    const issued = Number(attempt.issued_head_level);
    if (!Number.isSafeInteger(issued) || issued < 0 || issued > finalized.level) return { finalized, rows: [] };
    const endpoint = attempt.entrypoint === "origination" ? "originations" : "transactions";
    const url = new URL(`${this.indexerUrl}/operations/${endpoint}`);
    url.searchParams.set("sender", attempt.signer);
    if (attempt.target) url.searchParams.set("target", attempt.target);
    if (attempt.entrypoint !== "origination") url.searchParams.set("entrypoint", attempt.entrypoint);
    url.searchParams.set("level.ge", String(issued));
    url.searchParams.set("level.le", String(finalized.level));
    url.searchParams.set("micheline", "2");
    const response = await this.fetch(url);
    if (!response.ok) throw new Error(`TzKT hashless creator-intent lookup failed with HTTP ${response.status}`);
    const indexedRows = operationRows(await response.json());
    const identities = new Set(indexedRows
      .filter((row) => OPERATION.test(row.hash || "") && Number.isSafeInteger(Number(row.level)) && Number(row.level) <= finalized.level)
      .map((row) => `${row.level}:${row.hash}`));
    const rows = [];
    for (const identity of identities) {
      const [level, hash] = identity.split(":");
      rows.push(...await this.canonicalCreatorOperationRows(hash, Number(level)));
    }
    return { finalized, rows };
  }

  async hashlessCreatorIntentWindow(attempt) {
    const promptHeadLevel = Number(attempt.prompt_started_head_level);
    const issuedHeadLevel = Number(attempt.issued_head_level);
    if (!Number.isSafeInteger(promptHeadLevel) || promptHeadLevel < 0
      || !Number.isSafeInteger(issuedHeadLevel) || issuedHeadLevel < 0
      || issuedHeadLevel > promptHeadLevel) {
      throw new Error("Creator wallet prompt has no authoritative issuance horizon");
    }
    const [{ finalized, rows: indexedRows }, pending] = await Promise.all([
      this.findFinalCreatorIntentCandidates(attempt),
      this.toolkit.rpc.getPendingOperations(),
    ]);
    const pendingRows = creatorRowsFromOperationGroups([
      ...(pending.validated || []),
      ...(pending.branch_delayed || []),
      ...(pending.unprocessed || []),
      ...(pending.refused || []),
      ...(pending.branch_refused || []),
      ...(pending.outdated || []),
    ]);
    // A high-level Beacon wallet request has no fixed branch or counter when
    // the prompt opens. The wallet can remain open, then forge against a fresh
    // branch much later. Consequently no passage of chain time can prove this
    // hashless request expired or make a duplicate retry safe.
    return { finalized, indexedRows, canonicalRows: [], pendingRows, expired: false, promptHeadLevel };
  }

  async recoverSubmittedSettlement({ project, claimId, entropyPreimage, metadataUri, metadataNonce, earliestLevel }) {
    const url = new URL(`${this.indexerUrl}/operations/transactions`);
    url.searchParams.set("sender", this.signerAddress);
    url.searchParams.set("target", project.contract_address);
    url.searchParams.set("entrypoint", "settle_claims_v35");
    url.searchParams.set("level.ge", String(earliestLevel));
    url.searchParams.set("sort.desc", "id");
    const response = await this.fetch(url);
    if (!response.ok) throw new Error(`TzKT lost-hash reconciliation failed with HTTP ${response.status}`);
    const rows = operationRows(await response.json());
    const metadataUriHex = Buffer.from(metadataUri, "utf8").toString("hex");
    const matches = rows.filter((row) => {
      const item = firstSettlementItem(row.parameter?.value);
      if (!item) return false;
      try {
        return Number(item.claim_id ?? item.claimId) === claimId
          && normalizedHex(item.entropy_preimage ?? item.entropyPreimage, 32) === normalizedHex(entropyPreimage, 32)
          && normalizedHex(item.metadata_uri ?? item.metadataUri) === metadataUriHex
          && normalizedHex(item.metadata_nonce ?? item.metadataNonce, 32) === normalizedHex(metadataNonce, 32);
      } catch {
        return false;
      }
    });
    const hashes = [...new Set(matches.map((row) => row.hash).filter((hash) => OPERATION.test(hash || "")))];
    if (hashes.length > 1) throw new Error("More than one operation matches the exact lost-hash settlement intent");
    return hashes[0] || null;
  }

  async reconcileSettlement({ project, claimId, tokenId, allocationDigest: expectedDigest, metadataUri, operationHash }) {
    const rows = await this.exactOperation(operationHash);
    if (rows.length === 0) return { status: "pending", reason: "operation_not_indexed" };
    const matching = rows.filter((row) => address(row.target) === project.contract_address
      && address(row.sender) === this.signerAddress
      && row.parameter?.entrypoint === "settle_claims_v35");
    if (matching.length !== 1) return { status: "attention_required", reason: "exact_operation_identity_mismatch" };
    const head = await this.toolkit.rpc.getBlockHeader();
    if (!Number.isSafeInteger(Number(matching[0].level)) || Number(head.level) < Number(matching[0].level) + 2) {
      return { status: "pending", reason: "waiting_for_tenderbake_finality" };
    }
    if (matching[0].status !== "applied") {
      return {
        status: "terminal_failed",
        reason: `operation_${matching[0].status || "not_applied"}`,
        level: Number(matching[0].level),
        finalizedAtHeadLevel: Number(head.level),
      };
    }
    const storage = await this.contractStorage(project.contract_address);
    const [observedToken, observedDigest, tokenMetadata] = await Promise.all([
      storage.claim_token.get(claimId),
      storage.claim_allocation_digest.get(claimId),
      storage.token_metadata.get(tokenId),
    ]);
    const tokenInfo = tokenMetadata?.token_info;
    const observedUri = typeof tokenInfo?.get === "function" ? tokenInfo.get("") : tokenInfo?.[""];
    if (asSafeNat(observedToken, "settled token") !== tokenId
      || normalizedHex(observedDigest, 32) !== expectedDigest
      || normalizedHex(observedUri) !== Buffer.from(metadataUri, "utf8").toString("hex")) {
      return { status: "pending", reason: "chain_postcondition_not_observed" };
    }
    return {
      status: "applied",
      transactionId: matching[0].id,
      level: matching[0].level,
      finalizedAtHeadLevel: Number(head.level),
      confirmations: Number(head.level) - Number(matching[0].level) + 1,
    };
  }

  async reconcileArmFulfillment({ project, operationHash }) {
    const rows = await this.exactOperation(operationHash);
    if (rows.length === 0) return { status: "pending", reason: "operation_not_indexed" };
    const matching = rows.filter((row) => address(row.target) === project.contract_address
      && address(row.sender) === this.signerAddress
      && row.parameter?.entrypoint === "arm_fulfillment");
    if (matching.length !== 1) return { status: "attention_required", reason: "exact_operation_identity_mismatch" };
    const head = await this.toolkit.rpc.getBlockHeader();
    if (!Number.isSafeInteger(Number(matching[0].level)) || Number(head.level) < Number(matching[0].level) + 2) {
      return { status: "pending", reason: "waiting_for_tenderbake_finality" };
    }
    if (matching[0].status !== "applied") {
      return {
        status: "terminal_failed",
        reason: `operation_${matching[0].status || "not_applied"}`,
        transactionId: matching[0].id,
        level: Number(matching[0].level),
        finalizedAtHeadLevel: Number(head.level),
        confirmations: Number(head.level) - Number(matching[0].level) + 1,
      };
    }
    const { storage } = await this.verifyContractBinding(project);
    if (storage.fulfillment_armed !== true) return { status: "pending", reason: "fulfillment_handshake_not_observed" };
    return {
      status: "applied",
      transactionId: matching[0].id,
      level: matching[0].level,
      finalizedAtHeadLevel: Number(head.level),
      confirmations: Number(head.level) - Number(matching[0].level) + 1,
    };
  }

  async purchaseStatus({ contractAddress, operationHash }) {
    const rows = await this.exactOperation(operationHash);
    if (rows.length === 0) return { state: "pending", claimIds: [] };
    const matching = rows.filter((row) => address(row.target) === contractAddress && row.parameter?.entrypoint === "purchase");
    if (matching.length !== 1) return { state: "not_a_purchase", claimIds: [] };
    const transaction = matching[0];
    if (transaction.status !== "applied") return { state: transaction.status || "failed", claimIds: [] };
    const head = await this.toolkit.rpc.getBlockHeader();
    if (!Number.isSafeInteger(Number(transaction.level)) || Number(head.level) < Number(transaction.level) + 2) {
      return { state: "confirming", claimIds: [], level: transaction.level };
    }
    const eventsUrl = new URL(`${this.indexerUrl}/contracts/events`);
    eventsUrl.searchParams.set("contract", contractAddress);
    eventsUrl.searchParams.set("tag", "purchase_claim");
    eventsUrl.searchParams.set("transactionId", String(transaction.id));
    const response = await this.fetch(eventsUrl);
    if (!response.ok) throw new Error(`TzKT purchase event lookup failed with HTTP ${response.status}`);
    const events = await response.json();
    const sender = address(transaction.sender);
    const validEvents = (Array.isArray(events) ? events : []).filter((event) => {
      const payload = event?.payload;
      return payload && address(payload.buyer) === sender && address(payload.recipient);
    });
    const claimIds = validEvents
      .map((event) => Number(event.payload.claim_id))
      .filter((claimId) => Number.isSafeInteger(claimId) && claimId >= 0)
      .sort((a, b) => a - b);
    return {
      state: claimIds.length > 0 ? "purchase_confirmed" : "indexing_events",
      claimIds,
      buyer: sender,
      level: transaction.level,
      confirmations: Number(head.level) - Number(transaction.level) + 1,
    };
  }

  async duplicateIndexProbe() {
    const query = `query MacaroniPublicCidProbe { token(order_by: { pk: asc }, limit: 1) { pk } }`;
    const response = await this.fetch(this.duplicateCheckUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.errors || !Array.isArray(payload?.data?.token)) {
      throw new Error(`Objkt duplicate-index probe failed${response.ok ? "" : ` with HTTP ${response.status}`}`);
    }
    return { mode: this.duplicateCheckMode, queryAccepted: true };
  }

  async directDuplicateCidCheck(rows) {
    const query = `query DuplicateMacaroniCid($artifact: String!, $metadata: String!) {
      token(where: { _or: [ { artifact_uri: { _eq: $artifact } }, { metadata: { _eq: $metadata } } ] }, limit: 10) {
        pk token_id artifact_uri metadata fa_contract flag
      }
    }`;
    const matches = [];
    for (const row of rows) {
      const response = await this.fetch(this.duplicateCheckUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { artifact: row.artifactUri, metadata: row.metadataUri } }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.errors || !Array.isArray(payload?.data?.token)) {
        throw new Error(`Objkt duplicate-CID check failed${response.ok ? "" : ` with HTTP ${response.status}`}`);
      }
      for (const match of payload.data.token) {
        matches.push({ tokenId: row.tokenId, existingContract: match.fa_contract, existingTokenId: match.token_id, flag: match.flag });
      }
    }
    return { checked: rows.length, matches };
  }

  async privateFullScanDuplicateCidCheck(rows) {
    const targets = new Map();
    for (const row of rows) {
      for (const [kind, uri] of [["artifact", row.artifactUri], ["metadata", row.metadataUri]]) {
        const entries = targets.get(uri) || [];
        entries.push({ tokenId: row.tokenId, kind });
        targets.set(uri, entries);
      }
    }
    const query = `query MacaroniPublicCidPage($cursor: bigint!, $pageSize: Int!) {
      token(where: { pk: { _gt: $cursor } }, order_by: { pk: asc }, limit: $pageSize) {
        pk token_id artifact_uri metadata fa_contract flag
      }
    }`;
    const matches = [];
    const seenMatches = new Set();
    let cursor = "-1";
    // The live Objkt Shadownet endpoint returned 429 after roughly 40 pages
    // when queried without spacing. One request per second is below that
    // observed burst rate; a 429 pauses at the same cursor before retrying.
    const pageSpacingMs = 1_000;
    let nextRequestAt = 0;
    while (true) {
      const waitMs = nextRequestAt - Date.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      const response = await this.fetch(this.duplicateCheckUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // This transport page size does not cap the audit: every page is read
        // until the public index is exhausted, and target CIDs are never sent.
        body: JSON.stringify({ query, variables: { cursor, pageSize: 1000 } }),
      });
      nextRequestAt = Date.now() + pageSpacingMs;
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          nextRequestAt = Date.now() + Math.max(pageSpacingMs, retryAfterSeconds * 1_000);
        }
        continue;
      }
      const payload = await response.json().catch(() => null);
      const page = payload?.data?.token;
      if (!response.ok || payload?.errors || !Array.isArray(page)) {
        throw new Error(`Objkt private full-scan duplicate check failed${response.ok ? "" : ` with HTTP ${response.status}`}`);
      }
      if (page.length === 0) break;
      for (const existing of page) {
        for (const existingUri of [existing.artifact_uri, existing.metadata]) {
          for (const target of targets.get(existingUri) || []) {
            const key = `${target.tokenId}:${target.kind}:${existing.fa_contract}:${existing.token_id}`;
            if (seenMatches.has(key)) continue;
            seenMatches.add(key);
            matches.push({
              tokenId: target.tokenId,
              matchedField: target.kind,
              existingContract: existing.fa_contract,
              existingTokenId: existing.token_id,
              flag: existing.flag,
            });
          }
        }
      }
      const next = String(page.at(-1)?.pk ?? "");
      if (!/^\d+$/.test(next) || BigInt(next) <= BigInt(cursor)) throw new Error("Objkt duplicate scan cursor did not advance");
      cursor = next;
    }
    return { checked: rows.length, matches, mode: "private_full_scan" };
  }

  async duplicateCidCheck(rows) {
    if (this.duplicateCheckMode === "private_full_scan") return this.privateFullScanDuplicateCidCheck(rows);
    if (this.duplicateCheckMode === "external_direct_lookup") {
      const result = await this.directDuplicateCidCheck(rows);
      return { ...result, mode: "external_direct_lookup" };
    }
    throw new Error("Unsupported duplicate-CID check privacy mode");
  }
}
