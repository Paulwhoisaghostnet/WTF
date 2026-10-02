import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { encodeOpHash } from "@taquito/utils";
import { fundingCeiling, operatorFailureMessage, parseOptions, runOperator } from "../src/operator.mts";
import type { ProviderConfig } from "../src/config.mts";

const OPERATOR = "tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo";
const AGENT = "tz1acHymFHm2AAEgLKRgAh9CULY2Kbb4Qnjr";
const PROVIDER = "KT1DGd6RcA9zKErjLurg9JGQ8txNCLoFHkmv";
const ROUTER = "KT1HTY5RFTUai5K2Bh2LVySQvSid9Mx2dP4J";
const REGISTRY = "KT1E7wraYc1cgywqDQX2KGMNF4TbCADsHVL9";
const SIGNED = "aa".repeat(96); // Test bytes, not a valid signed Tezos operation.

async function fixture(t: any) {
  const stateDir = await mkdtemp(join(tmpdir(), "alea-operator-test-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const config: ProviderConfig = { network: "mainnet", chainId: "NetXdQprcVkpaWU", rpcUrl: "https://example.invalid", tzktApi: "https://indexer.invalid", router: ROUTER, registry: REGISTRY, operatorAddress: OPERATOR, agentAddress: AGENT, renderGasMutez: 500_000, stateDir };
  const state = { signs: 0, prepares: 0, estimates: 0, estimatedParams: null as any, renderGas: 500_000, injections: [] as string[], indexed: false, registered: false, revealed: false, operatorRevealed: true, operatorBalance: 0, failInjection: false, action: "origination", source: OPERATOR, observedDurableReceipt: false };
  const signer = (agent: boolean) => ({
    publicKeyHash: async () => agent ? AGENT : OPERATOR,
    sign: async () => { state.signs++; return { sbytes: (0xa9 + state.signs).toString(16).repeat(96), prefixSig: "test-signature" }; },
  });
  const estimate = async (params: any) => { state.estimates++; state.estimatedParams = params; return { suggestedFeeMutez: 2100, burnFeeMutez: 600000, gasLimit: 9000, storageLimit: 2400 }; };
  const prepare = async () => { state.prepares++; return { opOb: { branch: "test-branch", protocol: "test-protocol", contents: [{ kind: state.action, source: state.source }] } }; };
  const toolkit = {
    tz: { getBalance: async (address?: string) => ({ toString: () => address === OPERATOR ? String(state.operatorBalance) : "0" }) },
    estimate: { originate: estimate, transfer: estimate, reveal: estimate },
    prepare: { originate: prepare, transaction: prepare, reveal: prepare },
    rpc: {
      getConstants: async () => ({ cost_per_byte: "250", origination_size: 257 }),
      getManagerKey: async (address?: string) => (address === OPERATOR ? state.operatorRevealed : state.revealed) ? "public-key" : null,
      getMempoolFilter: async () => ({ minimal_fees: "100", minimal_nanotez_per_gas_unit: ["100", "1"], minimal_nanotez_per_byte: ["1000", "1"] }),
      forgeOperations: async () => "00".repeat(32),
      preapplyOperations: async () => [{ contents: [{ kind: state.action, metadata: { operation_result: { status: "applied" } } }] }],
      injectOperation: async (bytes: string) => {
        const files = await readdir(join(stateDir, "operator"));
        const receipts = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => readFile(join(stateDir, "operator", file), "utf8")));
        state.observedDurableReceipt = receipts.some((raw) => { const r = JSON.parse(raw); return r.operationHash === encodeOpHash(bytes) && r.signedBytes === bytes; });
        state.injections.push(bytes);
        if (state.failInjection) throw new Error("Transport lost after possible submission");
        return encodeOpHash(bytes);
      },
    },
  };
  const deps = {
    config: () => config,
    verify: async (value: ProviderConfig) => value,
    wallet: async (_config: ProviderConfig, agent: boolean) => ({ signer: signer(agent) }),
    toolkit: () => toolkit,
    json: async (url: string) => {
      if (url.endsWith(`/contracts/${ROUTER}/storage`)) return { registry: REGISTRY };
      if (url.includes("/operations/")) return state.indexed ? [{ type: state.action, status: "applied", sender: { address: state.source }, level: 123, originatedContract: { address: PROVIDER } }] : [];
      if (url.endsWith(`/contracts/${PROVIDER}/storage`)) return { operator: OPERATOR, agent: AGENT, render_gas: String(state.renderGas) };
      if (url.includes("/bigmaps/providers/keys/")) return state.registered ? { active: true } : null;
      throw new Error(`Unexpected public read in test: ${url}`);
    },
  };
  return { config, state, toolkit, deps, stateDir };
}

test("operation options require explicit price-independent funding and execution", () => {
  assert.equal(parseOptions(["originate"]).execute, false);
  assert.throws(() => parseOptions(["estimate"]), /requires --for/);
  assert.throws(() => parseOptions(["status", "--execute"]), /cannot execute/);
  assert.throws(() => parseOptions(["fund-agent"]), /no default/);
  assert.throws(() => parseOptions(["fund-agent", "--amount-mutez", "100", "--execute"]), /request-id/);
  assert.throws(() => parseOptions(["fund-agent", "--amount-mutez", "1.5"]), /safe integer/);
  assert.throws(() => parseOptions(["originate", "--receipt-dir", "relative"]), /absolute/);
});

test("estimate separates fee, burn and funding without signing", async (t) => {
  const f = await fixture(t);
  const result: any = await runOperator(["estimate", "--for", "originate"], f.deps);
  assert.equal(result.status, "estimated");
  assert.equal(result.estimatedFeeMutez, 2100);
  assert.equal(result.estimatedStorageBurnMutez, 600000);
  assert.equal(result.transferFundingMutez, 0);
  assert.equal(result.agentFunding.onePublicationAndRevealCeilingMutez, 82948);
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.prepares, 0);
  assert.deepEqual(f.state.injections, []);
});

test("network mismatch and missing price fail before signing", async (t) => {
  const f = await fixture(t);
  await assert.rejects(runOperator(["originate", "--execute"], { ...f.deps, verify: async () => { throw new Error("RPC chain mismatch"); } }), /chain mismatch/);
  f.config.renderGasMutez = undefined;
  await assert.rejects(runOperator(["originate", "--execute"], f.deps), /pricing has no default/);
  assert.equal(f.state.signs, 0);
});

test("uncertain submission retains receipt and resumes only the same signed operation", async (t) => {
  const f = await fixture(t);
  f.state.failInjection = true;
  await assert.rejects(runOperator(["originate", "--execute"], f.deps), /Submission remains unresolved/);
  assert.equal(f.state.observedDurableReceipt, true);
  assert.equal(f.state.signs, 1);
  f.state.failInjection = false;
  const resumed: any = await runOperator(["originate", "--execute"], f.deps);
  assert.equal(resumed.status, "submitted");
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.prepares, 1);
  assert.deepEqual(f.state.injections, [SIGNED, SIGNED]);
  assert.equal("signedBytes" in resumed, false);
});

test("confirmed origination is reused and never originates again", async (t) => {
  const f = await fixture(t);
  await runOperator(["originate", "--execute"], f.deps);
  f.state.indexed = true;
  const result: any = await runOperator(["originate", "--execute"], f.deps);
  assert.equal(result.status, "existing");
  assert.equal(result.provider, PROVIDER);
  assert.equal(result.receipt.status, "confirmed");
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.injections.length, 1);
});

test("configured existing provider and registry membership avoid duplicate operations", async (t) => {
  const f = await fixture(t);
  f.config.provider = PROVIDER;
  assert.equal((await runOperator(["originate", "--execute"], f.deps) as any).status, "existing");
  f.state.registered = true;
  assert.equal((await runOperator(["register", "--execute"], f.deps) as any).status, "already-registered");
  assert.equal(f.state.signs, 0);
});

test("funding identity rejects a changed amount after uncertain submission", async (t) => {
  const f = await fixture(t);
  f.state.action = "transaction";
  await runOperator(["fund-agent", "--amount-mutez", "82948", "--request-id", "first-publication", "--execute"], f.deps);
  await assert.rejects(runOperator(["fund-agent", "--amount-mutez", "82949", "--request-id", "first-publication", "--execute"], f.deps), /different intent/);
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.injections.length, 1);
});

test("preapply failure submits nothing and leaves no operation receipt", async (t) => {
  const f = await fixture(t);
  f.toolkit.rpc.preapplyOperations = async () => [{ contents: [{ kind: "origination", metadata: { operation_result: { status: "failed" } } }] }];
  await assert.rejects(runOperator(["originate", "--execute"], f.deps), /nothing submitted/);
  assert.deepEqual(f.state.injections, []);
  assert.deepEqual(await readdir(join(f.stateDir, "operator")), []);
});

test("receipt corruption is rejected before injection", async (t) => {
  const f = await fixture(t);
  await runOperator(["originate", "--execute"], f.deps);
  const path = join(f.stateDir, "operator", `mainnet-${OPERATOR}-originate.json`);
  const receipt = JSON.parse(await readFile(path, "utf8"));
  receipt.signedBytes = "bb".repeat(96);
  await writeFile(path, JSON.stringify(receipt));
  await assert.rejects(runOperator(["originate", "--execute"], f.deps), /integrity check failed/);
  assert.equal(f.state.injections.length, 1);
});

test("one-publication allowance uses live storage price and omits an existing reveal", () => {
  const result = fundingCeiling(300, true, 7000);
  assert.equal(result.publicationStorageCeilingMutez, 90000);
  assert.equal(result.revealFeeMutez, 0);
  assert.equal(result.shortfallAgainstCeilingMutez, 89614);
});

test("repricing requires an explicit valid price and an execution request ID", () => {
  assert.throws(() => parseOptions(["set-price"]), /repricing has no default/);
  assert.throws(() => parseOptions(["set-price", "--price-mutez", "500000", "--execute"]), /request-id/);
  assert.throws(() => parseOptions(["set-price", "--price-mutez", "-1"]), /nonnegative safe integer/);
  assert.throws(() => parseOptions(["originate", "--price-mutez", "500000"]), /only valid for set-price/);
  assert.equal(parseOptions(["set-price", "--price-mutez", "0"]).price, 0);
});

test("repricing estimates the operator-only setter with zero transferred tez and config synchronization", async (t) => {
  const f = await fixture(t);
  f.config.provider = PROVIDER;
  const result: any = await runOperator(["estimate", "--for", "set-price", "--price-mutez", "500000"], f.deps);
  assert.deepEqual(f.state.estimatedParams, { to: PROVIDER, amount: 0, mutez: true, parameter: { entrypoint: "set_render_gas", value: { int: "500000" } } });
  assert.equal(result.configurationAfterConfirmation.ALEA_RENDER_GAS_MUTEZ, "500000");
  assert.equal(result.transferFundingMutez, 0);
  assert.equal(f.state.signs, 0);
});

test("repricing receipt resumes across config synchronization and rejects changed intent", async (t) => {
  const f = await fixture(t);
  f.config.provider = PROVIDER;
  f.state.action = "transaction";
  const args = ["set-price", "--price-mutez", "250000", "--request-id", "revision-one", "--execute"];
  await runOperator(args, f.deps);
  f.state.renderGas = 250000;
  f.state.indexed = true;
  const result: any = await runOperator(args, f.deps);
  assert.equal(result.status, "confirmed");
  assert.equal(f.state.signs, 1);
  await assert.rejects(runOperator(["status"], f.deps), /synchronize ALEA_RENDER_GAS_MUTEZ/);
  f.config.renderGasMutez = 250000;
  assert.equal((await runOperator(args, f.deps) as any).status, "confirmed");
  await assert.rejects(runOperator(["set-price", "--price-mutez", "500000", "--request-id", "revision-one", "--execute"], f.deps), /different intent/);
  assert.equal(f.state.injections.length, 1);
  f.state.indexed = false;
  await runOperator(["set-price", "--price-mutez", "500000", "--request-id", "revision-two", "--execute"], f.deps);
  assert.equal(f.state.signs, 2);
  assert.equal(f.state.injections.length, 2);
});

test("CLI diagnostics never relay dependency errors containing signing material", () => {
  const result = operatorFailureMessage(new Error("secret-key-at-authenticated-rpc"));
  assert.doesNotMatch(result, /secret-key-at-authenticated-rpc/);
  assert.match(result, /suppressed/);
  try { parseOptions(["originate", "--execute", "--execute"]); }
  catch (error) { assert.match(operatorFailureMessage(error), /Duplicate option/); }
});

function insufficientBalanceError() {
  const errors = [
    { id: "proto.025-PsUshuai.cannot_pay_storage_fee" },
    { id: "proto.025-PsUshuai.contract.balance_too_low", balance: "232369", amount: "374500" },
    { id: "proto.025-PsUshuai.tez.subtraction_underflow" },
  ];
  return Object.assign(new Error("RPC payload must never be output"), {
    name: "TezosOperationError", errors,
    operationsWithResults: [{ kind: "origination", source: OPERATOR, metadata: { operation_result: {
      status: "backtracked", consumed_milligas: "1403743", paid_storage_size_diff: "1498",
      originated_contracts: ["SIMULATED-CONTRACT-ONLY"], errors,
    } } }],
  });
}

test("underfunded origination reports measured allocation-inclusive burn and SDK quote without signing", async (t) => {
  const f = await fixture(t);
  f.state.operatorBalance = 232369;
  f.toolkit.estimate.originate = async () => { throw insufficientBalanceError(); };
  const result: any = await runOperator(["estimate", "--for", "originate"], f.deps);
  assert.equal(result.status, "insufficient-funds");
  assert.equal(result.measuredStorageBurnMutez, 438750);
  assert.equal(result.estimatedStorageBurnMutez, 443750);
  assert.equal(result.gasLimit, 1504);
  assert.equal(result.storageLimit, 1775);
  assert.equal(result.estimatedFeeMutez, 367); // Fixture forge is32bytes plus64-byte tz1 signature.
  assert.equal(result.estimatedOperationCostMutez, 444117);
  assert.equal(result.requiredTopUpForOriginationMutez, 211748);
  assert.equal(result.currentOperatorBalanceMutez, 232369);
  assert.equal(result.agentFunding.onePublicationAndRevealCeilingMutez, 82948);
  assert.doesNotMatch(JSON.stringify(result), /SIMULATED-CONTRACT|RPC payload/);
  assert.equal(result.executed, false);
  assert.equal(f.state.signs, 0);
  assert.deepEqual(f.state.injections, []);
});

test("underfunded execution refuses before signing and never creates a submission receipt", async (t) => {
  const f = await fixture(t);
  f.toolkit.estimate.originate = async () => { throw insufficientBalanceError(); };
  await assert.rejects(runOperator(["originate", "--execute"], f.deps), /nothing signed or submitted/);
  assert.equal(f.state.signs, 0);
  assert.deepEqual(f.state.injections, []);
  assert.deepEqual(await readdir(join(f.stateDir, "operator")), []);
});

test("unrelated or combined simulation failures retain their original error", async (t) => {
  const f = await fixture(t);
  const unrelated = new Error("Unrelated RPC failure");
  f.toolkit.estimate.originate = async () => { throw unrelated; };
  await assert.rejects(runOperator(["estimate", "--for", "originate"], f.deps), (error) => error === unrelated);
  const mixed = insufficientBalanceError();
  mixed.errors.push({ id: "proto.025-PsUshuai.michelson_v1.script_rejected" });
  f.toolkit.estimate.originate = async () => { throw mixed; };
  await assert.rejects(runOperator(["estimate", "--for", "originate"], f.deps), (error) => error === mixed);
  assert.equal(f.state.prepares, 0);
});

test("funding reconstruction refuses unrevealed sources and multi-operation groups", async (t) => {
  const f = await fixture(t);
  const error = insufficientBalanceError();
  f.toolkit.estimate.originate = async () => { throw error; };
  f.state.operatorRevealed = false;
  await assert.rejects(runOperator(["estimate", "--for", "originate"], f.deps), (caught) => caught === error);
  f.state.operatorRevealed = true;
  error.operationsWithResults.push(error.operationsWithResults[0]);
  await assert.rejects(runOperator(["estimate", "--for", "originate"], f.deps), (caught) => caught === error);
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.prepares, 0);
});
