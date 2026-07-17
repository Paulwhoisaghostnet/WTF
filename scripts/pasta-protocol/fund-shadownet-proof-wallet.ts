#!/usr/bin/env tsx

import assert from "node:assert/strict";
import process from "node:process";

import {
  assertShadownet,
  buildToolkit,
  loadSignerSet,
  probeRpcChainId,
  signerEnv,
} from "./shadownet-proof-kit";

const amountMutez = Number(process.env.PASTA_SHADOWNET_E2E_FUND_MUTEZ || "1000000");

async function main(): Promise<void> {
  assert.equal(
    process.env.PASTA_SHADOWNET_E2E_FUND,
    "1",
    "PASTA_SHADOWNET_E2E_FUND=1 is required because this sends real Shadownet test tez",
  );
  assert.notEqual(process.env.TEZOS_NETWORK, "mainnet", "mainnet funding is forbidden");
  assert.ok(Number.isSafeInteger(amountMutez), "funding amount must be an integer number of mutez");
  assert.ok(amountMutez >= 1 && amountMutez <= 2_000_000, "funding amount must be between 1 and 2 tez");

  const rpc = await probeRpcChainId();
  const env = await signerEnv(rpc.rpcUrl, {
    socketPath: "/tmp/wtf-pasta-shadownet-fund.sock",
    authToken: "local-pasta-shadownet-fund",
    auditLog: "/tmp/wtf-pasta-shadownet-fund-audit.log",
  });
  const { creator, creatorSigner, collector, collectorTwo } = await loadSignerSet(env);
  const target = process.env.PASTA_SHADOWNET_E2E_FUND_TARGET === "collector_two" ? collectorTwo : collector;
  const tezos = buildToolkit(creatorSigner, rpc.rpcUrl);
  await assertShadownet(tezos, "before collector proof-wallet funding");

  const operation = await tezos.contract.transfer({
    to: target.address,
    amount: amountMutez,
    mutez: true,
  });
  await operation.confirmation(1);

  console.log(
    JSON.stringify({
      network: "shadownet",
      rpc: rpc.rpcUrl,
      from: creator.address,
      targetWalletId: target.id,
      to: target.address,
      amountMutez,
      operationHash: operation.hash,
    }),
  );
}

main().catch((error) => {
  console.error(`[pasta-shadownet-fund] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
