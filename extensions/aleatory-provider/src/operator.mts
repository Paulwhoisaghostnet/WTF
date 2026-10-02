import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_FEE_PARAMS, Estimate, feeParamsFromMempoolFilter, MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { encodeOpHash } from "@taquito/utils";
import { readConfig, verifyNetwork, type ProviderConfig } from "./config.mts";
import { agentWallet, operatorWallet } from "./custody.mts";
import { feeFor } from "../vendor/provider/fees.ts";

dotenv.config({ path: process.env.WTF_ALEATORY_ENV_FILE, quiet: true });

type Action = "originate" | "register" | "fund-agent" | "reveal-agent" | "set-price";
type Options = { command: Action | "estimate" | "status"; action?: Action; execute: boolean; amount?: number; price?: number; requestId?: string; receiptDir?: string };
type Receipt = {
  version: 1; action: Action; network: string; chainId: string; source: string;
  requestDigest: string; intent: Record<string, unknown>; operationHash: string;
  signedBytes: string; status: "prepared" | "submitted" | "confirmed" | "failed";
  createdAt: string; provider?: string; confirmedLevel?: number;
};
type Dependencies = {
  config: () => ProviderConfig;
  verify: (config: ProviderConfig) => Promise<ProviderConfig>;
  wallet: (config: ProviderConfig, agent: boolean) => Promise<{ signer: any }>;
  toolkit: (rpcUrl: string, signer?: any) => any;
  json: (url: string) => Promise<any>;
};

class OperatorCommandError extends Error {}

export function operatorFailureMessage(error: unknown) {
  return error instanceof OperatorCommandError ? error.message : "Operator command failed in configuration, custody, filesystem, or chain access. Dependency error text is suppressed to avoid exposing signing material or authenticated URLs.";
}

const ACTIONS = new Set<Action>(["originate", "register", "fund-agent", "reveal-agent", "set-price"]);
const ARTIFACT = new URL("../contract/artifacts/AleatoryProvider.json", import.meta.url);
const ARTIFACT_SHA256 = "abb456bed19b4699140315a21cec7c9ffc653a116be832e23b2f64ce32b046be";
const METADATA = {
  name: "wtfOS",
  description: "Rendering and IPFS metadata delivery for Aleatory generators by wtfOS.",
  homepage: "https://wtfos.app",
  interfaces: ["TZIP-016"],
};
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export function parseOptions(argv: string[]): Options {
  const [command, ...args] = argv;
  if (!ACTIONS.has(command as Action) && command !== "estimate" && command !== "status") {
    throw new OperatorCommandError("Command must be estimate, originate, register, fund-agent, reveal-agent, set-price, or status");
  }
  const result: Options = { command: command as Options["command"], execute: false };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new OperatorCommandError(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === "--execute") { result.execute = true; continue; }
    if (!["--for", "--amount-mutez", "--price-mutez", "--request-id", "--receipt-dir"].includes(flag)) throw new OperatorCommandError(`Unknown option: ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new OperatorCommandError(`Missing value for ${flag}`);
    if (flag === "--for") {
      if (!ACTIONS.has(value as Action)) throw new OperatorCommandError("--for must name an onboarding action");
      result.action = value as Action;
    }
    if (flag === "--amount-mutez") {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new OperatorCommandError("--amount-mutez must be an explicit positive safe integer");
      result.amount = Number(value);
    }
    if (flag === "--price-mutez") {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new OperatorCommandError("--price-mutez must be an explicit nonnegative safe integer");
      result.price = Number(value);
    }
    if (flag === "--request-id") {
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new OperatorCommandError("--request-id must contain only letters, numbers, underscores or hyphens");
      result.requestId = value;
    }
    if (flag === "--receipt-dir") {
      if (!isAbsolute(value)) throw new OperatorCommandError("--receipt-dir must be an absolute private operator directory");
      result.receiptDir = value;
    }
  }
  if (command === "estimate" && !result.action) throw new OperatorCommandError("estimate requires --for <action>");
  if (command !== "estimate" && result.action) throw new OperatorCommandError("--for is only valid with estimate");
  if ((command === "estimate" || command === "status") && result.execute) throw new OperatorCommandError(`${command} cannot execute operations`);
  const action = result.action ?? command;
  if (action === "fund-agent" && result.amount === undefined) throw new OperatorCommandError("fund-agent requires --amount-mutez; funding has no default");
  if (action === "set-price" && result.price === undefined) throw new OperatorCommandError("set-price requires --price-mutez; repricing has no default");
  if (["fund-agent", "set-price"].includes(action) && result.execute && !result.requestId) throw new OperatorCommandError(`${action} --execute requires --request-id for safe replay`);
  if (action !== "fund-agent" && result.amount !== undefined) throw new OperatorCommandError("Funding amount is only valid for fund-agent");
  if (action !== "set-price" && result.price !== undefined) throw new OperatorCommandError("Price is only valid for set-price");
  if (!["fund-agent", "set-price"].includes(action) && result.requestId) throw new OperatorCommandError("Request ID is only valid for fund-agent or set-price");
  return result;
}

const defaults: Dependencies = {
  config: readConfig,
  verify: verifyNetwork,
  wallet: (config, agent) => agent ? agentWallet(config) : operatorWallet(config),
  toolkit: (rpcUrl, signer) => {
    const toolkit = new TezosToolkit(rpcUrl);
    if (signer) toolkit.setProvider({ signer });
    return toolkit;
  },
  json: async (url) => {
    const response = await fetch(url);
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw new OperatorCommandError(`Public chain read failed: HTTP ${response.status}`);
    return response.json();
  },
};

async function readReceipt(path: string): Promise<Receipt | null> {
  try {
    const receipt = JSON.parse(await readFile(path, "utf8")) as Receipt;
    if (receipt.version !== 1 || encodeOpHash(receipt.signedBytes) !== receipt.operationHash) throw new OperatorCommandError("Operation receipt integrity check failed");
    return receipt;
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeReceipt(path: string, receipt: Receipt) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(receipt, null, 2) + "\n"); await file.sync(); }
  finally { await file.close(); }
  await rename(temporary, path);
  const directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

function publicReceipt(receipt: Receipt) {
  const { signedBytes: _signedBytes, ...publicFields } = receipt;
  return publicFields;
}

function pathFor(config: ProviderConfig, dir: string, action: Action, requestId?: string) {
  return join(dir, `${config.network}-${config.operatorAddress}-${action}${requestId ? `-${requestId}` : ""}.json`);
}

async function reconcile(receipt: Receipt, path: string, config: ProviderConfig, deps: Dependencies) {
  const rows = await deps.json(`${config.tzktApi}/v1/operations/${receipt.operationHash}`);
  if (!Array.isArray(rows) || rows.length === 0) return receipt;
  const expectedType = receipt.action === "originate" ? "origination" : receipt.action === "reveal-agent" ? "reveal" : "transaction";
  const operation = rows.find((row: any) => row.type === expectedType && row.sender?.address === receipt.source);
  if (!operation) throw new OperatorCommandError("Indexed operation does not match the stored operation intent");
  if (rows.some((row: any) => row.status !== "applied")) {
    receipt.status = "failed";
  } else {
    receipt.status = "confirmed";
    receipt.confirmedLevel = operation.level;
    if (receipt.action === "originate") {
      if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(operation.originatedContract?.address ?? "")) throw new OperatorCommandError("Confirmed origination has no provider address");
      receipt.provider = operation.originatedContract.address;
    }
  }
  await writeReceipt(path, receipt);
  return receipt;
}

async function providerState(config: ProviderConfig, provider: string, deps: Dependencies, checkPrice = true) {
  const state = await deps.json(`${config.tzktApi}/v1/contracts/${provider}/storage`);
  if (!state || state.operator !== config.operatorAddress) throw new OperatorCommandError("Provider is not controlled by the configured operator");
  if (config.agentAddress && state.agent !== config.agentAddress) throw new OperatorCommandError("Provider agent differs from configured agent");
  if (checkPrice && config.renderGasMutez !== undefined && BigInt(state.render_gas) !== BigInt(config.renderGasMutez)) throw new OperatorCommandError("Provider price differs from explicitly configured price; synchronize ALEA_RENDER_GAS_MUTEZ after a confirmed set-price operation");
  const entry = await deps.json(`${config.tzktApi}/v1/contracts/${config.registry}/bigmaps/providers/keys/${provider}`);
  return { provider, storage: state, registered: entry?.active === true };
}

export function fundingCeiling(costPerByte: number, agentRevealed: boolean, balance: number) {
  // Exact limits and fee formula from the pinned upstream provider.mts:
  // publish gas 50_000, storage 300, payload 400; reveal gas 5_000,
  // storage 0, payload 100. This is a maximum funding requirement under
  // those limits, NOT measured burn or an operating runway recommendation.
  const publicationFeeMutez = feeFor({ gas: 50_000, bytes: 400 });
  const publicationStorageCeilingMutez = 300 * costPerByte;
  const revealFeeMutez = agentRevealed ? 0 : feeFor({ gas: 5_000, bytes: 100 });
  const total = publicationFeeMutez + publicationStorageCeilingMutez + revealFeeMutez;
  return {
    basis: "Pinned upstream publication/reveal limits plus live protocol cost_per_byte; ceiling, not measured cost or recommended runway",
    publicationFeeMutez, publicationStorageCeilingMutez, revealFeeMutez,
    onePublicationAndRevealCeilingMutez: total,
    currentAgentBalanceMutez: balance,
    shortfallAgainstCeilingMutez: Math.max(0, total - balance),
  };
}

async function fundingEvidence(config: ProviderConfig, toolkit: any) {
  if (!config.agentAddress) return null;
  const [constants, balance, managerKey] = await Promise.all([
    toolkit.rpc.getConstants(), toolkit.tz.getBalance(config.agentAddress), toolkit.rpc.getManagerKey(config.agentAddress),
  ]);
  return fundingCeiling(Number(constants.cost_per_byte), Boolean(managerKey), Number(balance.toString()));
}

function checkPreapply(results: any[]) {
  const failures: unknown[] = [];
  for (const result of results) for (const content of result.contents ?? []) {
    if (content.metadata?.operation_result?.status !== "applied") failures.push(content.kind);
    for (const internal of content.metadata?.internal_operation_results ?? []) if (internal.result?.status !== "applied") failures.push(internal.kind);
  }
  if (failures.length || !results.length) throw new OperatorCommandError("Preapplication did not apply every operation; nothing submitted");
}

async function insufficientOriginationQuote(error: any, params: any, source: string, toolkit: any) {
  const expectedFundingError = (entry: any) => typeof entry?.id === "string" &&
    /(?:^|\.)(?:cannot_pay_storage_fee|balance_too_low|tez\.subtraction_underflow)$/.test(entry.id);
  const rows = error?.operationsWithResults;
  const errors = error?.errors;
  if (error?.name !== "TezosOperationError" || !Array.isArray(errors) ||
      !errors.some((entry) => entry.id?.endsWith(".cannot_pay_storage_fee")) ||
      !errors.every(expectedFundingError) || !Array.isArray(rows) || rows.length !== 1 ||
      rows[0].kind !== "origination" || rows[0].source !== source || !source.startsWith("tz1")) return null;
  const result = rows[0].metadata?.operation_result;
  if (result?.status !== "backtracked" || result.originated_contracts?.length !== 1 ||
      rows[0].metadata?.internal_operation_results?.length ||
      !Array.isArray(result.errors) || !result.errors.every(expectedFundingError)) return null;
  const integer = (value: any) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value));
  if (!integer(result.consumed_milligas) || Number(result.consumed_milligas) <= 0 ||
      !integer(result.paid_storage_size_diff) || Number(result.paid_storage_size_diff) <= 0) return null;
  // This reconstruction is only for an already revealed tz1 with one
  // origination. Other operation groups must retain their original error.
  if (!await toolkit.rpc.getManagerKey(source)) return null;
  const [constants, balance, prepared] = await Promise.all([
    toolkit.rpc.getConstants(), toolkit.tz.getBalance(source), toolkit.prepare.originate(params),
  ]);
  if (!integer(constants.cost_per_byte) || Number(constants.cost_per_byte) <= 0 ||
      !integer(constants.origination_size) || Number(constants.origination_size) <= 0 ||
      !integer(balance.toString())) return null;
  const { branch, contents } = prepared.opOb;
  if (contents.length !== 1 || contents[0].kind !== "origination" || contents[0].source !== source) return null;
  const forged = await toolkit.rpc.forgeOperations({ branch, contents });
  if (typeof forged !== "string" || !/^(?:[a-fA-F0-9]{2})+$/.test(forged)) return null;
  let feeParams = DEFAULT_FEE_PARAMS;
  let feeParametersSource = "Taquito 25 default fee parameters (RPC mempool filter unavailable)";
  try {
    feeParams = feeParamsFromMempoolFilter(await toolkit.rpc.getMempoolFilter({ include_default: true }));
    feeParametersSource = "Live RPC mempool filter";
  } catch { /* Same default fallback used by Taquito 25's estimator. */ }
  const paidStorageBytes = Number(result.paid_storage_size_diff);
  const allocationBytes = Number(constants.origination_size);
  const costPerByte = Number(constants.cost_per_byte);
  const consumedMilligas = Number(result.consumed_milligas);
  // Match Taquito 25 RPCEstimateProvider buffers and tz1 signature size:
  // 100000 milligas, 20 storage bytes, and 64 signature bytes respectively.
  const estimate = new Estimate(consumedMilligas + 100_000, paidStorageBytes + allocationBytes + 20,
    forged.length / 2 + 64, costPerByte, undefined, feeParams);
  const measuredStorageBurnMutez = (paidStorageBytes + allocationBytes) * costPerByte;
  const estimatedOperationCostMutez = estimate.suggestedFeeMutez + estimate.burnFeeMutez;
  if (![measuredStorageBurnMutez, estimatedOperationCostMutez].every(Number.isSafeInteger)) return null;
  const currentOperatorBalanceMutez = Number(balance.toString());
  return {
    status: "insufficient-funds", executed: false,
    basis: "Origination simulation completed but storage payment was backtracked. Measured burn excludes SDK buffers; the quote and required top-up include Taquito 25's gas/storage buffers and apply only to origination.",
    measuredStorageBurnMutez, paidStorageBytes, allocationBytes, consumedMilligas,
    estimatedFeeMutez: estimate.suggestedFeeMutez,
    estimatedStorageBurnMutez: estimate.burnFeeMutez,
    estimatedOperationCostMutez, gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit,
    currentOperatorBalanceMutez,
    requiredTopUpForOriginationMutez: Math.max(0, estimatedOperationCostMutez - currentOperatorBalanceMutez),
    feeParametersSource, transferFundingMutez: 0,
  };
}

export async function runOperator(argv: string[], overrides: Partial<Dependencies> = {}) {
  const options = parseOptions(argv);
  const deps = { ...defaults, ...overrides };
  const config = await deps.verify(deps.config());
  const router = await deps.json(`${config.tzktApi}/v1/contracts/${config.router}/storage`);
  if (router?.registry !== config.registry) throw new OperatorCommandError("Registry does not match the configured official router");
  const dir = options.receiptDir ?? join(config.stateDir, "operator");
  const originPath = pathFor(config, dir, "originate");
  let origin = await readReceipt(originPath);
  if (origin && (origin.chainId !== config.chainId || origin.source !== config.operatorAddress)) throw new OperatorCommandError("Origination receipt network or operator mismatch");
  if (origin && origin.status !== "confirmed") origin = await reconcile(origin, originPath, config, deps);
  if (config.provider && origin?.provider && config.provider !== origin.provider) throw new OperatorCommandError("Configured provider differs from confirmed origination receipt");
  const provider = config.provider ?? origin?.provider;

  if (options.command === "status") {
    const toolkit = deps.toolkit(config.rpcUrl);
    return {
      network: config.network, chainId: config.chainId, operator: config.operatorAddress,
      operatorBalanceMutez: (await toolkit.tz.getBalance(config.operatorAddress)).toString(),
      agent: config.agentAddress, agentFunding: await fundingEvidence(config, toolkit),
      directory: provider ? await providerState(config, provider, deps) : null,
      origination: origin ? publicReceipt(origin) : null,
    };
  }
  const action = options.action ?? options.command as Action;
  if (action === "originate" && provider) return { status: "existing", ...await providerState(config, provider, deps), receipt: origin ? publicReceipt(origin) : null };
  if (!config.agentAddress) throw new OperatorCommandError("ALEA_AGENT_ADDRESS must identify the existing independent agent wallet");
  if (config.agentAddress === config.operatorAddress) throw new OperatorCommandError("Agent and operator must be different wallets");
  if (action === "originate" && config.renderGasMutez === undefined) throw new OperatorCommandError("ALEA_RENDER_GAS_MUTEZ is required; provider pricing has no default");
  if (action === "register" && !provider) throw new OperatorCommandError("Registration requires ALEA_PROVIDER_ADDRESS or a confirmed origination receipt");
  if (action === "set-price" && !provider) throw new OperatorCommandError("Repricing requires ALEA_PROVIDER_ADDRESS or a confirmed origination receipt");
  if (action === "register") {
    const state = await providerState(config, provider!, deps);
    if (state.registered) return { status: "already-registered", ...state };
  }
  // A repricing intentionally changes this expectation. Its receipt can be
  // resumed both before and after the local service configuration is updated.
  if (action === "set-price") await providerState(config, provider!, deps, false);
  const configurationAfterConfirmation = action === "set-price" ? {
    ALEA_RENDER_GAS_MUTEZ: String(options.price),
    instruction: "After chain confirmation, set ALEA_RENDER_GAS_MUTEZ to this value in operator/service configuration and restart the provider so strict price checks match the new on-chain price.",
  } : undefined;
  const { signer } = await deps.wallet(config, action === "reveal-agent");
  const source = await signer.publicKeyHash();
  if (source !== (action === "reveal-agent" ? config.agentAddress : config.operatorAddress)) throw new OperatorCommandError("Signer does not match configured action owner");
  if (action !== "reveal-agent") {
    const { signer: agentSigner } = await deps.wallet(config, true);
    if (await agentSigner.publicKeyHash() !== config.agentAddress) throw new OperatorCommandError("Agent custody does not match configured agent address");
  }
  const toolkit = deps.toolkit(config.rpcUrl, signer);
  if (action === "reveal-agent" && await toolkit.rpc.getManagerKey(source)) return { status: "already-revealed", agent: source };
  const intent: Record<string, unknown> = { action, network: config.network, chainId: config.chainId, source };
  let params: any;
  if (action === "originate") {
    const bytes = await readFile(ARTIFACT);
    if (hash(bytes) !== ARTIFACT_SHA256) throw new OperatorCommandError("Compiled provider artifact checksum mismatch");
    Object.assign(intent, { artifactSha256: ARTIFACT_SHA256, operator: config.operatorAddress, agent: config.agentAddress, renderGasMutez: config.renderGasMutez, metadata: METADATA });
    params = { code: JSON.parse(bytes.toString()), balance: 0, storage: {
      operator: config.operatorAddress, agent: config.agentAddress, render_gas: config.renderGasMutez,
      metadata: MichelsonMap.fromLiteral({ "": Buffer.from("tezos-storage:content").toString("hex"), content: Buffer.from(JSON.stringify(METADATA)).toString("hex") }),
    } };
  } else if (action === "register") {
    Object.assign(intent, { registry: config.registry, provider });
    params = { to: config.registry, amount: 0, mutez: true, parameter: { entrypoint: "register", value: { string: provider } } };
  } else if (action === "fund-agent") {
    Object.assign(intent, { to: config.agentAddress, amountMutez: options.amount, requestId: options.requestId ?? null });
    params = { to: config.agentAddress, amount: options.amount, mutez: true };
  } else if (action === "set-price") {
    Object.assign(intent, { provider, priceMutez: options.price, requestId: options.requestId ?? null });
    params = { to: provider, amount: 0, mutez: true, parameter: { entrypoint: "set_render_gas", value: { int: String(options.price) } } };
  } else {
    Object.assign(intent, { agent: source });
    params = {};
  }
  const requestDigest = hash(JSON.stringify(intent));
  const path = pathFor(config, dir, action, options.requestId);

  const resume = async (receipt: Receipt) => {
    if (receipt.requestDigest !== requestDigest || receipt.chainId !== config.chainId || receipt.source !== source) throw new OperatorCommandError("Receipt belongs to a different intent; refusing to overwrite or replay it");
    receipt = await reconcile(receipt, path, config, deps);
    if (receipt.status === "confirmed") return { ...publicReceipt(receipt), receiptPath: path, configurationAfterConfirmation };
    if (receipt.status === "failed") throw new OperatorCommandError(`Recorded operation failed on chain (${receipt.operationHash}); inspect it before any replacement`);
    if (!options.execute) return { ...publicReceipt(receipt), receiptPath: path, resumed: false, configurationAfterConfirmation };
    // Reinject exactly the original signed bytes. Its counter and operation
    // hash cannot create a second origination or a second transfer.
    try {
      const injected = await toolkit.rpc.injectOperation(receipt.signedBytes);
      if (injected !== receipt.operationHash) throw new OperatorCommandError("RPC returned an unexpected operation hash");
      receipt.status = "submitted";
      await writeReceipt(path, receipt);
    } catch {
      const reconciled = await reconcile(receipt, path, config, deps);
      if (reconciled.status === "confirmed") return { ...publicReceipt(reconciled), receiptPath: path, configurationAfterConfirmation };
      throw new OperatorCommandError(`Submission remains unresolved for ${receipt.operationHash}; receipt retained at ${path}. No replacement operation was created.`);
    }
    receipt = await reconcile(receipt, path, config, deps);
    return { ...publicReceipt(receipt), receiptPath: path, configurationAfterConfirmation };
  };

  const estimateAndMaybeSend = async () => {
    const prior = await readReceipt(path);
    if (prior) return resume(prior);
    const estimator = action === "originate" ? toolkit.estimate.originate.bind(toolkit.estimate) : action === "reveal-agent" ? toolkit.estimate.reveal.bind(toolkit.estimate) : toolkit.estimate.transfer.bind(toolkit.estimate);
    let estimate;
    try { estimate = await estimator(params); }
    catch (error) {
      if (action === "originate") {
        const quote = await insufficientOriginationQuote(error, params, source, toolkit);
        if (quote) {
          if (options.execute) throw new OperatorCommandError("Origination simulation cannot pay storage fees; nothing signed or submitted. Run estimate --for originate to review the measured funding shortfall.");
          return { ...quote, action, network: config.network, source, intent, agentFunding: await fundingEvidence(config, toolkit) };
        }
      }
      throw error;
    }
    if (!estimate) throw new OperatorCommandError("Estimator returned no operation; refresh status before proceeding");
    const quote = {
      action, network: config.network, source, intent,
      estimatedFeeMutez: estimate.suggestedFeeMutez,
      estimatedStorageBurnMutez: estimate.burnFeeMutez,
      estimatedOperationCostMutez: estimate.suggestedFeeMutez + estimate.burnFeeMutez,
      transferFundingMutez: action === "fund-agent" ? options.amount : 0,
      gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit,
      agentFunding: await fundingEvidence(config, toolkit),
      configurationAfterConfirmation,
    };
    if (!options.execute) return { status: "estimated", ...quote, executed: false };
    const limits = { fee: estimate.suggestedFeeMutez, gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit };
    const prepared = action === "originate" ? await toolkit.prepare.originate({ ...params, ...limits }) : action === "reveal-agent" ? await toolkit.prepare.reveal(limits) : await toolkit.prepare.transaction({ ...params, ...limits });
    const { branch, contents, protocol } = prepared.opOb;
    const forged = await toolkit.rpc.forgeOperations({ branch, contents });
    const signed = await signer.sign(forged, new Uint8Array([3]));
    const operationHash = encodeOpHash(signed.sbytes);
    checkPreapply(await toolkit.rpc.preapplyOperations([{ branch, contents, protocol, signature: signed.prefixSig }]));
    const receipt: Receipt = { version: 1, action, network: config.network, chainId: config.chainId, source, requestDigest, intent, operationHash, signedBytes: signed.sbytes, status: "prepared", createdAt: new Date().toISOString() };
    // fsync the receipt and directory before injection. The public signature
    // and operation bytes are retained, never any secret key.
    await writeReceipt(path, receipt);
    return { ...await resume(receipt), estimate: quote };
  };
  if (!options.execute) return estimateAndMaybeSend();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lockPath = join(dir, `${config.network}-${source}.lock`);
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error: any) { if (error.code === "EEXIST") throw new OperatorCommandError(`Signer is locked at ${lockPath}; inspect the active process/receipts before removing a stale lock`); throw error; }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, action, createdAt: new Date().toISOString() }));
    await lock.sync();
    return await estimateAndMaybeSend();
  } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runOperator(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    // Never print provider internals, an RPC body, wallet objects or signing
    // inputs; those can contain credentials in dependency error properties.
    console.error(operatorFailureMessage(error));
    process.exitCode = 1;
  });
}
