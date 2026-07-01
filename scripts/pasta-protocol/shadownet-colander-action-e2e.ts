#!/usr/bin/env tsx

import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";

import { availableActions, detectPastaContract } from "../../shared/pasta-protocol/index";
import {
  assertShadownet,
  block,
  buildToolkit,
  createLogger,
  loadSignerPair,
  normalizeBase,
  pollJson,
  probeRpcChainId,
  ProofBlocked,
  root,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  signerEnv,
  writeProofReport,
  type ProofStatus,
} from "./shadownet-proof-kit";

const LASAGNA_PROOF_CONTRACT = "KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r";
const REPORT_PATH = path.join(
  root,
  ".agents",
  "docs",
  "archive",
  "contracts",
  "pasta-protocol",
  "shadownet-colander-action-report.md",
);
const MIN_ADMIN_BALANCE_MUTEZ = Number(
  process.env.PASTA_SHADOWNET_COLANDER_E2E_MIN_BALANCE_MUTEZ || "100000",
);
let reportRpcUrl = normalizeBase(SHADOWNET_RPC_PRIMARY);
const ok = createLogger("pasta-shadownet-colander-action");

async function writeReport(status: ProofStatus, lines: string[]): Promise<void> {
  await writeProofReport({
    reportPath: REPORT_PATH,
    title: "Pasta Protocol Colander Shadownet Action Report",
    status,
    lines,
    rpcUrl: reportRpcUrl,
  });
}

function storageText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "Some" in (value as any)) return storageText((value as any).Some);
  if (typeof value === "object" && "None" in (value as any)) return "";
  if (typeof value === "object" && typeof (value as any).toString === "function") {
    return (value as any).toString();
  }
  return String(value);
}

function operationMatches(operation: any, administrator: string): boolean {
  return (
    operation?.hash &&
    operation?.sender?.address === administrator &&
    operation?.target?.address === LASAGNA_PROOF_CONTRACT &&
    operation?.parameter?.entrypoint === "set_current_revision" &&
    String(operation?.parameter?.value) === "0" &&
    operation?.status === "applied" &&
    operation?.storage?.administrator === administrator &&
    String(operation?.storage?.current_revision) === "0" &&
    String(operation?.storage?.revision_count) === "2"
  );
}

async function main(): Promise<void> {
  if (process.env.PASTA_SHADOWNET_COLANDER_E2E_EXECUTE !== "1") {
    block("explicit execute flag is required", [
      "`PASTA_SHADOWNET_COLANDER_E2E_EXECUTE=1` is required because this proof submits a real Shadownet Colander management action and spends test tez.",
    ]);
  }
  if ((process.env.TEZOS_NETWORK || "shadownet") === "mainnet") {
    throw new Error("Refusing to run Pasta Colander Shadownet action proof with TEZOS_NETWORK=mainnet");
  }

  const rpc = await probeRpcChainId();
  reportRpcUrl = rpc.rpcUrl;
  ok(`Shadownet RPC ${rpc.rpcUrl} returned ${rpc.chainId}`);

  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-colander-action.sock",
    authToken: "local-pasta-shadownet-colander-action",
    auditLog: "/tmp/wtf-pasta-shadownet-colander-action-audit.log",
  });
  const { collector: administrator, collectorSigner: administratorSigner } = await loadSignerPair(env);
  const tezos = buildToolkit(administratorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "administrator startup");

  const balance = await tezos.tz.getBalance(administrator.address);
  const balanceMutez = Number(balance.toString());
  if (balanceMutez < MIN_ADMIN_BALANCE_MUTEZ) {
    block("administrator wallet has insufficient Shadownet balance", [
      `Administrator \`${administrator.address}\` has only \`${balance.toString()}\` mutez on Shadownet.`,
      "Fund the signer with Shadownet test tez, then rerun with `PASTA_SHADOWNET_COLANDER_E2E_EXECUTE=1`.",
    ]);
  }
  ok(`administrator ${administrator.address} has ${balance.toString()} mutez`);

  const contract = await tezos.contract.at(LASAGNA_PROOF_CONTRACT);
  const entrypoints = Object.keys((contract as any).entrypoints?.entrypoints ?? {});
  const adapter = detectPastaContract(entrypoints);
  assert.equal(adapter?.kind, "exhibition", "Lasagna proof contract should detect as the exhibition adapter");
  const actions = availableActions(adapter, entrypoints);
  const action = actions.find((candidate) => candidate.id === "set_current_revision");
  assert.ok(action, "Colander adapter should expose set_current_revision for Lasagna");
  assert.equal(action.access, "curator");
  assert.equal(action.group, "curation");

  const storageBefore: any = await contract.storage();
  assert.equal(storageBefore.administrator, administrator.address, "collector signer should be current Lasagna administrator");
  assert.equal(storageBefore.pending_administrator, null, "Lasagna proof contract should not have pending admin");
  assert.equal(storageText(storageBefore.current_revision), "0");
  assert.equal(storageText(storageBefore.revision_count), "2");
  ok(`opened Lasagna proof contract ${LASAGNA_PROOF_CONTRACT} through adapter action ${action.id}`);

  const call = (contract as any).methodsObject.set_current_revision(0);
  const estimate = await tezos.estimate.transfer(call.toTransferParams());
  const requiredBalanceMutez = Number(estimate.suggestedFeeMutez) + 25_000;
  if (balanceMutez < requiredBalanceMutez) {
    block("administrator wallet balance cannot cover estimated Colander action fee", [
      `Administrator \`${administrator.address}\` has \`${balance.toString()}\` mutez.`,
      `Estimated fee for \`set_current_revision(0)\` is \`${estimate.suggestedFeeMutez}\` mutez; required headroom is \`${requiredBalanceMutez}\` mutez.`,
      "Fund the signer with more Shadownet test tez, then rerun.",
    ]);
  }
  ok(`estimated set_current_revision fee=${estimate.suggestedFeeMutez} gas=${estimate.gasLimit}`);

  await assertShadownet(tezos, "before Colander set_current_revision");
  const op = await (contract as any).methodsObject.set_current_revision(0).send();
  await op.confirmation(1);
  ok(`submitted Colander adapter management action with ${op.hash}`);

  const operationUrl = `${normalizeBase(SHADOWNET_TZKT_API)}/operations/transactions/${encodeURIComponent(op.hash)}`;
  const indexedOperations = await pollJson(
    "Colander action operation",
    operationUrl,
    (json) => Array.isArray(json) && json.some((operation) => operationMatches(operation, administrator.address)),
    { attempts: 30, delayMs: 4_000 },
  );
  const indexedOperation = indexedOperations.find((operation: any) =>
    operationMatches(operation, administrator.address),
  );
  assert.ok(indexedOperation, "TzKT should index the Colander action operation");

  await writeReport("PASSED", [
    "## Summary",
    "",
    "- Proof type: signer-backed Colander adapter management action.",
    `- Contract: \`${LASAGNA_PROOF_CONTRACT}\` (Lasagna / exhibition).`,
    `- Signer wallet id: \`${administrator.id}\`.`,
    `- Signer address: \`${administrator.address}\`.`,
    "- Adapter action: `set_current_revision(0)`.",
    `- Operation hash: \`${op.hash}\`.`,
    `- TzKT level: \`${indexedOperation.level}\`.`,
    "",
    "## Evidence",
    "",
    "- Shadownet RPC chain id matched `NetXsqzbfFenSTS` before signer load and before operation submission.",
    "- The opened contract entrypoints detected the shared `exhibition` adapter through `detectPastaContract`.",
    "- `availableActions` exposed Colander action `set_current_revision` in the `curation` group.",
    "- Pre-operation storage had administrator equal to the collector signer, no pending administrator, revision count `2`, and current revision `0`.",
    "- Taquito confirmed the submitted operation after one Shadownet confirmation.",
    "- TzKT indexed the operation as an applied transaction from the administrator to the Lasagna proof contract with entrypoint `set_current_revision` and parameter `0`.",
    "- Indexed post-operation storage still reports administrator, revision count `2`, and current revision `0`.",
    "",
    "## Scope Boundary",
    "",
    "- This proves a real signer-backed Colander management action against a current Shadownet Pasta proof contract.",
    "- It intentionally uses an idempotent current-revision update so the proof does not alter the live proof graph semantics.",
    "- It does not prove browser wallet UI submission, production WTF.ME hosting, live pin recovery, mainnet readiness, or every Colander action.",
  ]);
}

main().catch(async (error) => {
  if (error instanceof ProofBlocked) {
    await writeReport("BLOCKED", error.lines);
    console.error(`[pasta-shadownet-colander-action] blocked: ${error.message}`);
    process.exit(2);
  }
  await writeReport("FAILED", [
    "## Failure",
    "",
    error instanceof Error ? error.stack || error.message : String(error),
  ]);
  console.error(error);
  process.exit(1);
});
