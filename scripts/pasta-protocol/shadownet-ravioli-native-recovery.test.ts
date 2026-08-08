import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateOperation, ValidationResult } from "@taquito/utils";

import {
  deterministicJsonBytes,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
} from "./shadownet-proof-kit";
import {
  RAVIOLI_NATIVE_RECOVERY_CREATOR,
  RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG,
  RAVIOLI_NATIVE_RECOVERY_GNOCCHI,
  RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER,
  RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV,
  RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE,
  RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG,
  RAVIOLI_NATIVE_RECOVERY_ROTINI,
  RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER,
  RAVIOLI_NATIVE_RECOVERY_ROUTER,
  assertRavioliNativeRecoveryAfterState,
  assertRavioliNativeRecoveryBeforeState,
  assertRavioliNativeRecoveryCallMatches,
  assertRavioliNativeRecoveryExecutionAllowed,
  assertRavioliNativeRecoveryReconciliationAllowed,
  assertRavioliNativeRecoverySalesClosedState,
  assertRavioliNativeQuarantineFileHashes,
  buildRavioliNativeRecoveryReceipt,
  buildRavioliNativeRecoveryHandoff,
  executeRavioliNativeRecoveryPlan,
  loadRavioliNativeRecoveryEvidence,
  prepareRavioliNativeGeneratedOutput,
  ravioliNativeRecoveryCalls,
  ravioliNativeRecoveryAggregateCostMutez,
  ravioliNativeRecoverySendOptions,
  runRavioliNativeRecoveryReconciliation,
  validateRavioliNativeOperationRows,
  validateRavioliNativeRecoveryReceipt,
  verifyRavioliNativeRecoveryLive,
  type RavioliNativeEstimate,
  type RavioliNativeEvidence,
  type RavioliNativeGeneratedOutput,
  type RavioliNativeHandoffReadIo,
  type RavioliNativeOperation,
  type RavioliNativeReconciliationIo,
  type RavioliNativeState,
} from "./shadownet-ravioli-native-recovery";
import type { IpfsPinnedProof } from "./shadownet-proof-kit";

const runRoot = path.join(process.cwd(), "artifacts", "pasta-protocol-proof-runs", "pasta-alpha-proof-20260718a");

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fakeCid(tokenId: number, kind: "artifact" | "metadata"): string {
  const values = {
    "3:artifact": "bafkreigcitl2l4j6wfi5f3gkmqfixplp3s477p6so4b3tu46ipidxtdchm",
    "3:metadata": "bafkreih7w23hv7vag5kvfbhdnkfhbcht6ydp6hlqyjclaxjclanqgqaasi",
    "4:artifact": "bafkreie2lnu7nukcd2j3jea7ailjybqyeiqlfoiubtxcrwn3ts3wlp352u",
    "4:metadata": "bafkreifxmuxwomwzpqmz4xujhez4fykpv3ztpsgnumjdrc744vuoy2z2dy",
  } as const;
  return values[`${tokenId}:${kind}` as keyof typeof values];
}

function proof(input: { cid: string; fileName: string; mimeType: string; bytes: Uint8Array }): IpfsPinnedProof {
  return {
    cid: input.cid,
    uri: `ipfs://${input.cid}`,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteLength: input.bytes.byteLength,
    sha256: digest(input.bytes),
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${input.cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${input.cid}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

async function generatedOutput(tokenId: 3 | 4): Promise<RavioliNativeGeneratedOutput> {
  return prepareRavioliNativeGeneratedOutput({
    tokenId,
    pinBytes: async ({ bytes, fileName, mimeType }) => proof({ cid: fakeCid(tokenId, "artifact"), bytes, fileName, mimeType }),
    pinJson: async ({ value, fileName }) => {
      const bytes = deterministicJsonBytes(value);
      return proof({ cid: fakeCid(tokenId, "metadata"), bytes, fileName, mimeType: "application/json" });
    },
  });
}

function project(minted: number, reserved: number) {
  return {
    active: true,
    name: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.name,
    symbol: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.symbol,
    generatorUri: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.generator_uri,
    displayUri: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.display_uri,
    outputMode: RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE.output_mode,
    price: 0,
    treasury: RAVIOLI_NATIVE_RECOVERY_CREATOR,
    maxSupply: 3,
    maxPerWallet: 3,
    reservationTtl: 3_600,
    minted,
    reserved,
  };
}

function sale(active: boolean, remaining: number, price: number) {
  return { active, remaining, price, seller: RAVIOLI_NATIVE_RECOVERY_CREATOR, treasury: RAVIOLI_NATIVE_RECOVERY_CREATOR };
}

function beforeState(): RavioliNativeState {
  return {
    level: 4_260_300,
    router: {
      administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
      nextTokenId: 5,
      creatorBalances: { "0": 0, "1": 1, "2": 1, "3": 1, "4": 1 },
      minted: { "0": 1, "1": 2, "2": 1, "3": 1, "4": 1 },
      opened: { "0": 1, "1": 1, "2": 0, "3": 0, "4": 0 },
      totalSupply: { "0": 0, "1": 1, "2": 1, "3": 1, "4": 1 },
      sales: {
        "0": sale(true, 0, 0),
        "1": sale(true, 1, 1),
        "2": sale(true, 1, 1),
        "3": sale(true, 1, 1),
        "4": sale(true, 1, 1),
      },
    },
    gnocchi: {
      administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
      creatorBalances: { "0": 0, "1": 0 },
      routerBalances: { "0": 0, "1": 2 },
      totalSupply: { "0": 6, "1": 5 },
      totalReserved: { "0": 2, "1": 0 },
    },
    rotini: {
      administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
      nextTokenId: 3,
      nextProjectId: 3,
      project0: project(1, 2),
      project3: null,
      generatedTokens: { "3": null, "4": null },
    },
    adapters: {
      gnocchiReservations: { "2:0": 1, "4:1": 1 },
      rotiniReservations: { "3:0": 1, "4:1": 1 },
    },
  };
}

function afterState(generated: readonly [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput]): RavioliNativeState {
  const tokens = Object.fromEntries(generated.map((output) => [String(output.tokenId), {
    ownerBalance: 1,
    totalSupply: 1,
    metadataUri: output.metadataPin.uri,
    artifactUri: output.artifact.uri,
    displayUri: output.artifact.uri,
    thumbnailUri: output.artifact.uri,
    mimeType: "image/png",
    artifactHash: output.artifact.sha256,
  }]));
  return {
    level: 4_260_400,
    router: {
      administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
      nextTokenId: 5,
      creatorBalances: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 },
      minted: { "0": 1, "1": 2, "2": 1, "3": 1, "4": 1 },
      opened: { "0": 1, "1": 2, "2": 1, "3": 1, "4": 1 },
      totalSupply: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 },
      sales: {
        "0": sale(false, 0, 0),
        "1": sale(false, 1, 1),
        "2": sale(false, 1, 1),
        "3": sale(false, 1, 1),
        "4": sale(false, 1, 1),
      },
    },
    gnocchi: {
      administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
      creatorBalances: { "0": 2, "1": 2 },
      routerBalances: { "0": 0, "1": 0 },
      totalSupply: { "0": 8, "1": 5 },
      totalReserved: { "0": 0, "1": 0 },
    },
    rotini: {
      administrator: RAVIOLI_NATIVE_RECOVERY_CREATOR,
      nextTokenId: 5,
      nextProjectId: 4,
      project0: project(3, 0),
      project3: project(0, 0),
      generatedTokens: tokens,
    },
    adapters: { gnocchiReservations: {}, rotiniReservations: {} },
  };
}

function salesClosedState(): RavioliNativeState {
  const state = beforeState();
  for (const sale of Object.values(state.router.sales)) sale.active = false;
  state.level += 5;
  return state;
}

function internalEntrypoints(index: number): string[] {
  return [[], [], [], [], [], ["transfer"], ["fulfill", "mint_reserved"], ["fulfill", "mint_pack_iteration"], ["fulfill", "fulfill", "mint_pack_iteration", "mint_reserved", "transfer"], []][index];
}

function liveInternalOperations(call: any, generated: any[]): any[] {
  if (call.entrypoint !== "open_pack") return [];
  const tokenId = Number(call.payload.token_id);
  const serial = tokenId === 1 ? 1 : 0;
  const transfer = (assetTokenId: number) => ({
    sender: RAVIOLI_NATIVE_RECOVERY_ROUTER,
    target: RAVIOLI_NATIVE_RECOVERY_GNOCCHI,
    entrypoint: "transfer",
    payload: [{
      from_: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      txs: [{ to_: RAVIOLI_NATIVE_RECOVERY_CREATOR, token_id: assetTokenId, amount: 1 }],
    }],
  });
  const allocated = (resourceId: number) => [
    {
      sender: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      target: RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER,
      entrypoint: "fulfill",
      payload: {
        recipient: RAVIOLI_NATIVE_RECOVERY_CREATOR,
        pack_contract: RAVIOLI_NATIVE_RECOVERY_ROUTER,
        pack_token_id: tokenId,
        open_serial: serial,
        resource_id: resourceId,
        payload: "",
      },
    },
    {
      sender: RAVIOLI_NATIVE_RECOVERY_GNOCCHI_ADAPTER,
      target: RAVIOLI_NATIVE_RECOVERY_GNOCCHI,
      entrypoint: "mint_reserved",
      payload: { to_: RAVIOLI_NATIVE_RECOVERY_CREATOR, token_id: 0, amount: 1 },
    },
  ];
  const generative = (resourceId: number, output: any) => [
    {
      sender: RAVIOLI_NATIVE_RECOVERY_ROUTER,
      target: RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER,
      entrypoint: "fulfill",
      payload: {
        recipient: RAVIOLI_NATIVE_RECOVERY_CREATOR,
        pack_contract: RAVIOLI_NATIVE_RECOVERY_ROUTER,
        pack_token_id: tokenId,
        open_serial: serial,
        resource_id: resourceId,
        payload: output.payload,
      },
    },
    {
      sender: RAVIOLI_NATIVE_RECOVERY_ROTINI_ADAPTER,
      target: RAVIOLI_NATIVE_RECOVERY_ROTINI,
      entrypoint: "mint_pack_iteration",
      payload: {
        recipient: RAVIOLI_NATIVE_RECOVERY_CREATOR,
        pack_contract: RAVIOLI_NATIVE_RECOVERY_ROUTER,
        pack_token_id: tokenId,
        open_serial: serial,
        project_id: 0,
        metadata_uri: Buffer.from(output.metadataPin.uri).toString("hex"),
        artifact_uri: Buffer.from(output.artifact.uri).toString("hex"),
        display_uri: Buffer.from(output.artifact.uri).toString("hex"),
        thumbnail_uri: Buffer.from(output.artifact.uri).toString("hex"),
        mime_type: Buffer.from("image/png").toString("hex"),
        artifact_hash: output.artifact.sha256,
      },
    },
  ];
  if (tokenId === 1) return [transfer(1)];
  if (tokenId === 2) return allocated(0);
  if (tokenId === 3) return generative(0, generated[0]);
  return [transfer(1), ...allocated(1), ...generative(1, generated[1])];
}

function liveOperationRows(receipt: any, index: number): any[] {
  const operation = receipt.operations[index];
  const top = {
    hash: operation.hash,
    status: "applied",
    nonce: null,
    counter: operation.counter,
    level: operation.level,
    timestamp: operation.timestamp,
    amount: 0,
    sender: { address: RAVIOLI_NATIVE_RECOVERY_CREATOR },
    target: { address: operation.call.contractAddress },
    parameter: { entrypoint: operation.call.entrypoint, value: operation.call.payload },
  };
  const internals = liveInternalOperations(operation.call, receipt.generatedOutputs).map((expected, nonce) => ({
    hash: operation.hash,
    status: "applied",
    nonce,
    amount: 0,
    initiator: { address: RAVIOLI_NATIVE_RECOVERY_CREATOR },
    sender: { address: expected.sender },
    target: { address: expected.target },
    parameter: { entrypoint: expected.entrypoint, value: expected.payload },
  }));
  return [top, ...internals];
}

async function liveVerifierFixture(): Promise<{
  receipt: any;
  receiptBytes: Uint8Array;
  publicBytes: Map<string, Uint8Array>;
  observed: { operations: string[]; lanes: string[]; publicUrls: string[]; stateReads: number };
  io: RavioliNativeHandoffReadIo;
}> {
  const recoveryRoot = path.join(runRoot, "ravioli-native-recovery");
  const receiptPath = path.join(recoveryRoot, "artifacts", "ravioli-native-recovery.json");
  const receiptBytes = await readFile(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  const publicBytes = new Map<string, Uint8Array>();
  for (const output of receipt.generatedOutputs) {
    publicBytes.set(
      output.artifact.publicGatewayUrl,
      await readFile(path.join(recoveryRoot, "artifacts", "generated", output.artifactFileName)),
    );
    publicBytes.set(
      output.metadataPin.publicGatewayUrl,
      await readFile(path.join(recoveryRoot, "artifacts", "generated", `ravioli-generated-${output.tokenId}-metadata.json`)),
    );
  }
  const observed = { operations: [] as string[], lanes: [] as string[], publicUrls: [] as string[], stateReads: 0 };
  const terminalCounter = Number(receipt.operations.at(-1).counter);
  const io: RavioliNativeHandoffReadIo = {
    loadEvidence: loadRavioliNativeRecoveryEvidence,
    readReceiptBytes: async () => Uint8Array.from(receiptBytes),
    readOperationRows: async (operationHash) => {
      observed.operations.push(operationHash);
      const index = receipt.operations.findIndex((operation: any) => operation.hash === operationHash);
      assert.ok(index >= 0);
      return structuredClone(liveOperationRows(receipt, index));
    },
    readState: async () => {
      observed.stateReads += 1;
      return structuredClone(receipt.after);
    },
    readLane: async (rpcUrl) => {
      observed.lanes.push(rpcUrl);
      return { counter: terminalCounter + 2, balanceMutez: 26_000_000, activeOperationCount: 0 };
    },
    readPublicBytes: async (url) => {
      observed.publicUrls.push(url);
      const bytes = publicBytes.get(url);
      assert.ok(bytes, `unexpected public IPFS URL ${url}`);
      return Uint8Array.from(bytes);
    },
  };
  return { receipt, receiptBytes, publicBytes, observed, io };
}

async function fixture(): Promise<{
  evidence: RavioliNativeEvidence;
  generated: [RavioliNativeGeneratedOutput, RavioliNativeGeneratedOutput];
}> {
  const [evidence, token3, token4] = await Promise.all([
    loadRavioliNativeRecoveryEvidence(runRoot),
    generatedOutput(3),
    generatedOutput(4),
  ]);
  return { evidence, generated: [token3, token4] };
}

test("native recovery is exact-run, explicit, Shadownet-only, and override-free", () => {
  const environment = {
    [RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG]: "1",
    [RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]: `/tmp/${path.basename(runRoot)}`,
    TEZOS_NETWORK: "shadownet",
  };
  assert.equal(assertRavioliNativeRecoveryExecutionAllowed(environment), path.resolve(environment[RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]));
  assert.throws(() => assertRavioliNativeRecoveryExecutionAllowed({ ...environment, [RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG]: "" }), /explicit/);
  assert.throws(() => assertRavioliNativeRecoveryExecutionAllowed({ ...environment, TEZOS_NETWORK: "mainnet" }), /Shadownet/);
  assert.throws(() => assertRavioliNativeRecoveryExecutionAllowed({ ...environment, PASTA_SHADOWNET_RAVIOLI_NATIVE_RECOVERY_ROUTER: RAVIOLI_NATIVE_RECOVERY_ROUTER }), /forbids override/);
  assert.throws(() => assertRavioliNativeRecoveryExecutionAllowed({ ...environment, [RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]: "/tmp/another-run" }), /exact accepted run/);
  const reconciliationEnvironment = {
    [RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG]: "1",
    [RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]: `/tmp/${path.basename(runRoot)}`,
    TEZOS_NETWORK: "shadownet",
  };
  assert.equal(assertRavioliNativeRecoveryReconciliationAllowed(reconciliationEnvironment), path.resolve(reconciliationEnvironment[RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]));
  assert.throws(() => assertRavioliNativeRecoveryReconciliationAllowed({
    ...reconciliationEnvironment,
    [RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG]: "1",
  }), /forbids the execute flag/);
});

test("native recovery binds the immutable rejection, all five real kits, and accepted proof hashes", async () => {
  const evidence = await loadRavioliNativeRecoveryEvidence(runRoot);
  assert.equal(evidence.kits.length, 5);
  assert.deepEqual(evidence.kits.map((kit) => kit.tokenId), [0, 1, 2, 3, 4]);
  assert.deepEqual(evidence.kits.map((kit) => kit.contract), Array(5).fill(RAVIOLI_NATIVE_RECOVERY_ROUTER));
  assert.equal(evidence.inventorySha256, "bedb986a20c1aba8045043cc9d1a3759ae93171725762b6e3137ec48c58e7759");
  assert.equal(Object.keys(evidence.quarantineFileHashes).length, 36);
  const mutated = { ...evidence.quarantineFileHashes };
  mutated["screenshots/015-buy-and-atomically-open-five-pack-modes-collector-one-bought-blind-funded-pool.png"] = "0".repeat(64);
  assert.throws(() => assertRavioliNativeQuarantineFileHashes(mutated), /inventory changed/);
  assert.equal(evidence.acceptedHashes.rotiniManifestSha256, "45267c22d619a576efe07af7e38d463fc04b5fa5b8c73f7cd63c39295438ef2e");
});

test("generated recovery outputs use the real page's PNG, metadata, public pins, and Michelson payload mechanism", async () => {
  const output = await generatedOutput(3);
  assert.equal(output.tokenId, 3);
  assert.equal(output.artifactFileName, "ravioli-generated-3.png");
  assert.equal(output.artifact.publicGatewayVerified, true);
  assert.equal(output.metadataPin.publicGatewayVerified, true);
  assert.equal(output.metadata.name, "Ravioli UI-LIVE blind_generative_mint #1");
  assert.deepEqual(output.metadata.creators, [RAVIOLI_NATIVE_RECOVERY_CREATOR]);
  assert.equal(output.metadata.artifactUri, output.artifact.uri);
  assert.match(output.payload, /^[0-9a-f]+$/);
  assert.ok(output.payload.length > 200);
  const siteSource = await readFile(path.join(process.cwd(), "public", "creation-tools", "ravioli", "js", "site.js"), "utf8");
  for (const marker of ["ravioliGenerativePayload", "ravioli-generated-token.json", "MichelCodecPacker", "sha256Hex", "thumbnailUri", "nestedBytesType"]) {
    assert.match(siteSource, new RegExp(marker));
  }
});

test("exact call plan closes every sale before four native opens and creates only project 3", async () => {
  const { evidence, generated } = await fixture();
  const calls = ravioliNativeRecoveryCalls(evidence, generated);
  assert.equal(calls.length, 10);
  assert.deepEqual(calls.slice(0, 5).map((call) => [call.entrypoint, call.payload]), [0, 1, 2, 3, 4].map((token_id) => ["set_sale_active", { token_id, active: false }]));
  assert.deepEqual(calls.slice(5, 9).map((call) => [call.entrypoint, call.payload.token_id]), [
    ["open_pack", 1],
    ["open_pack", 2],
    ["open_pack", 3],
    ["open_pack", 4],
  ]);
  assert.equal(calls[5].payload.nonce, evidence.kits[1].recipes[1].nonce);
  assert.equal(calls[8].payload.actions.length, 3);
  assert.equal(calls[9].entrypoint, "create_project");
  assert.equal(calls[9].contractAddress, RAVIOLI_NATIVE_RECOVERY_ROTINI);
  assert.deepEqual(calls[9].payload, RAVIOLI_NATIVE_RECOVERY_PROJECT_CLONE);
  assert.ok(calls.every((call) => !["mint", "recover_asset", "recover_adapter", "cancel_pack"].includes(call.entrypoint)));
});

test("exact call validation accepts bridge-decoded null-prototype payloads and rejects value drift", async () => {
  const { evidence, generated } = await fixture();
  const expected = ravioliNativeRecoveryCalls(evidence, generated)[0];
  const bridgePayload = Object.assign(Object.create(null), expected.payload);
  assert.doesNotThrow(() => assertRavioliNativeRecoveryCallMatches({
    contractAddress: expected.contractAddress,
    entrypoint: expected.entrypoint,
    payload: bridgePayload,
  }, expected));
  assert.throws(() => assertRavioliNativeRecoveryCallMatches({
    contractAddress: expected.contractAddress,
    entrypoint: expected.entrypoint,
    payload: Object.assign(Object.create(null), expected.payload, { active: true }),
  }, expected), /exact canonical plan/);
});

test("before and after state contracts bind exact inventory, supplies, reservations, wrapper burn, and new project", async () => {
  const { generated } = await fixture();
  assert.doesNotThrow(() => assertRavioliNativeRecoveryBeforeState(beforeState()));
  assert.doesNotThrow(() => assertRavioliNativeRecoverySalesClosedState(salesClosedState()));
  assert.doesNotThrow(() => assertRavioliNativeRecoveryAfterState(afterState(generated), generated));
  const wrongBefore = structuredClone(beforeState());
  wrongBefore.rotini.project0.reserved = 1;
  assert.throws(() => assertRavioliNativeRecoveryBeforeState(wrongBefore), /deep-equal|Expected values/);
  const wrongAfter = structuredClone(afterState(generated));
  wrongAfter.gnocchi.totalSupply["0"] = 6;
  assert.throws(() => assertRavioliNativeRecoveryAfterState(wrongAfter, generated), /deep-equal|Expected values/);
  const strandedSale = structuredClone(afterState(generated));
  strandedSale.router.sales["3"].active = true;
  assert.throws(() => assertRavioliNativeRecoveryAfterState(strandedSale, generated), /deep-equal|Expected values/);
  const racedWrapper = salesClosedState();
  racedWrapper.router.creatorBalances["3"] = 0;
  assert.throws(() => assertRavioliNativeRecoverySalesClosedState(racedWrapper), /deep-equal|Expected values/);
});

test("all ten estimates complete before any bounded exact send", async () => {
  const { evidence, generated } = await fixture();
  const calls = ravioliNativeRecoveryCalls(evidence, generated);
  const observed: string[] = [];
  const session = {
    async handle(request: any) {
      observed.push(request.action);
      const index = Number(String(request.id).match(/(\d+)$/)?.[1]);
      if (request.action === "estimate_call") {
        return {
          contractAddress: calls[index].contractAddress,
          entrypoint: calls[index].entrypoint,
          estimate: {
            gasLimit: 10_000 + index,
            storageLimit: index,
            suggestedFeeMutez: 1_000 + index,
            minimalFeeMutez: 900 + index,
            burnFeeMutez: index * 250,
          },
        };
      }
      const expected = ravioliNativeRecoverySendOptions({
        gasLimit: 10_000 + index,
        storageLimit: index,
        suggestedFeeMutez: 1_000 + index,
        minimalFeeMutez: 900 + index,
        burnFeeMutez: index * 250,
      });
      assert.deepEqual(request.payload.sendOptions, expected);
      return { ok: true };
    },
  };
  const estimates = await executeRavioliNativeRecoveryPlan({
    session: session as any,
    calls,
    beforeSubmit: async (accepted) => {
      assert.equal(accepted.length, 10);
      assert.deepEqual(observed, Array(10).fill("estimate_call"));
    },
    afterAppliedCall: async (index) => {
      if (index === 4) observed.push("sale-closure-checkpoint");
    },
  });
  assert.equal(estimates.length, 10);
  assert.equal(ravioliNativeRecoveryAggregateCostMutez(estimates), estimates.reduce((sum, estimate) => sum + estimate.sendOptions.fee + estimate.raw.burnFeeMutez, 0));
  assert.deepEqual(observed, [...Array(10).fill("estimate_call"), ...Array(5).fill("call"), "sale-closure-checkpoint", ...Array(5).fill("call")]);
  assert.throws(() => ravioliNativeRecoverySendOptions({ gasLimit: 499_999, storageLimit: 0, suggestedFeeMutez: 1, minimalFeeMutez: 1, burnFeeMutez: 0 }), /padded.*gas/);
  const unaffordable = structuredClone(estimates);
  unaffordable[9].raw.burnFeeMutez = 8_000_000;
  unaffordable[9].sendOptions = ravioliNativeRecoverySendOptions(unaffordable[9].raw);
  assert.throws(() => ravioliNativeRecoveryAggregateCostMutez(unaffordable), /exceeds the fixed reserve/);
});

async function operationHashes(): Promise<string[]> {
  const hashes: string[] = [];
  for (const app of ["gnocchi", "rotini", "penne", "spaghetti", "macaroni"]) {
    const manifest = JSON.parse(await readFile(path.join(runRoot, app, "manifest.json"), "utf8"));
    for (const operation of manifest.operations || []) {
      if (validateOperation(operation.hash) === ValidationResult.VALID && !hashes.includes(operation.hash)) hashes.push(operation.hash);
    }
  }
  assert.ok(hashes.length >= 10);
  return hashes.slice(0, 10);
}

test("receipt validator returns the exact fresh dependency handoff and rejects drift", async () => {
  const { evidence, generated } = await fixture();
  const calls = ravioliNativeRecoveryCalls(evidence, generated);
  const estimates: RavioliNativeEstimate[] = calls.map((call, index) => {
    const raw = { gasLimit: 10_000 + index, storageLimit: index, suggestedFeeMutez: 1_000, minimalFeeMutez: 900, burnFeeMutez: 0 };
    return { call, raw, sendOptions: ravioliNativeRecoverySendOptions(raw) };
  });
  const hashes = await operationHashes();
  const operations: RavioliNativeOperation[] = calls.map((call, index) => ({
    hash: hashes[index],
    counter: 23_831_466 + index,
    level: 4_260_350 + index,
    timestamp: new Date(Date.UTC(2026, 6, 19, 14, index)).toISOString(),
    explorerUrl: `https://shadownet.tzkt.io/${hashes[index]}`,
    call,
    internalEntrypoints: internalEntrypoints(index),
  }));
  const receipt = buildRavioliNativeRecoveryReceipt({
    startedAt: "2026-07-19T14:00:00.000Z",
    completedAt: "2026-07-19T14:20:00.000Z",
    rpcUrl: "https://tezos-shadownet.octez.io/",
    evidence,
    before: beforeState(),
    generated,
    calls,
    estimates,
    operations,
    after: afterState(generated),
  });
  assert.deepEqual(validateRavioliNativeRecoveryReceipt(receipt, evidence), buildRavioliNativeRecoveryHandoff());
  const supplyDrift = structuredClone(receipt);
  supplyDrift.after.gnocchi.totalSupply["0"] = 7;
  assert.throws(() => validateRavioliNativeRecoveryReceipt(supplyDrift, evidence), /deep-equal|Expected values/);
  const orderDrift = structuredClone(receipt);
  [orderDrift.exactCallPlan[0], orderDrift.exactCallPlan[5]] = [orderDrift.exactCallPlan[5], orderDrift.exactCallPlan[0]];
  assert.throws(() => validateRavioliNativeRecoveryReceipt(orderDrift, evidence), /deep-equal|Expected values/);
  const duplicateHash = structuredClone(receipt);
  duplicateHash.operations[1].hash = duplicateHash.operations[0].hash;
  assert.throws(() => validateRavioliNativeRecoveryReceipt(duplicateHash, evidence), /unique/);
  const internalSummaryDrift = structuredClone(receipt);
  internalSummaryDrift.operations[5].internalEntrypoints = [];
  assert.throws(() => validateRavioliNativeRecoveryReceipt(internalSummaryDrift, evidence), /internal entrypoint summary drift/);

  const intent = {
    schema: "pastaprotocol-ravioli-native-recovery-intent@1",
    status: "AUTHORIZED-NOT-YET-SUBMITTED",
    startedAt: receipt.startedAt,
    initialCounter: operations[0].counter - 1,
    network: receipt.network,
    quarantinedEvidence: {
      rejectionSha256: evidence.rejectionSha256,
      inventorySha256: evidence.inventorySha256,
      progressSha256: evidence.progressSha256,
      kitHashes: evidence.kitHashes,
    },
    acceptedEvidenceHashes: evidence.acceptedHashes,
    before: receipt.before,
    generatedOutputs: receipt.generatedOutputs,
    exactCallPlan: calls,
    estimates,
    aggregateEstimatedCostMutez: ravioliNativeRecoveryAggregateCostMutez(estimates),
  };
  let written: any;
  let evidenceReads = 0;
  const io: RavioliNativeReconciliationIo = {
    loadEvidence: async () => { evidenceReads += 1; return evidence; },
    readIntent: async () => intent,
    readProgress: async () => ({
      schema: "pastaprotocol-ravioli-native-recovery-progress@1",
      status: "APPLIED",
      before: receipt.before,
      appliedOperations: operations,
    }),
    readOperations: async () => operations,
    readState: async () => receipt.after,
    readLane: async (_rpcUrl, expectedCounter) => ({ counter: expectedCounter, balanceMutez: 20_000_000, activeOperationCount: 0 }),
    writeReceipt: async (_root, value) => { written = value; return "/tmp/ravioli-native-recovery.json"; },
    now: () => "2026-07-19T14:20:00.000Z",
  };
  const reconciled = await runRavioliNativeRecoveryReconciliation({
    environment: {
      [RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG]: "1",
      [RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]: runRoot,
      TEZOS_NETWORK: "shadownet",
    },
    io,
  });
  assert.deepEqual(reconciled, receipt);
  assert.deepEqual(written, receipt);
  assert.equal(evidenceReads, 2, "reconciliation must re-read immutable evidence before receipt");

  let driftReceiptWrites = 0;
  const counterDrift = structuredClone(operations);
  counterDrift[6].counter += 1;
  await assert.rejects(() => runRavioliNativeRecoveryReconciliation({
    environment: {
      [RAVIOLI_NATIVE_RECOVERY_RECONCILE_FLAG]: "1",
      [RAVIOLI_NATIVE_RECOVERY_OUTPUT_ENV]: runRoot,
      TEZOS_NETWORK: "shadownet",
    },
    io: {
      ...io,
      readOperations: async () => counterDrift,
      writeReceipt: async () => { driftReceiptWrites += 1; return "/tmp/forbidden.json"; },
    },
  }), /counter drift/);
  assert.equal(driftReceiptWrites, 0, "reconciliation evidence drift must suppress receipt creation");
});

test("TzKT operation validator proves exact native transfer tree and rejects extra internals", async () => {
  const { evidence, generated } = await fixture();
  const call = ravioliNativeRecoveryCalls(evidence, generated)[5];
  const hash = (await operationHashes())[0];
  const top = {
    hash,
    status: "applied",
    nonce: null,
    counter: 23_831_471,
    level: 4_260_371,
    timestamp: "2026-07-19T14:21:00.000Z",
    amount: 0,
    sender: { address: RAVIOLI_NATIVE_RECOVERY_CREATOR },
    target: { address: RAVIOLI_NATIVE_RECOVERY_ROUTER },
    parameter: { entrypoint: "open_pack", value: call.payload },
  };
  const internal = {
    hash,
    status: "applied",
    nonce: 0,
    amount: 0,
    initiator: { address: RAVIOLI_NATIVE_RECOVERY_CREATOR },
    sender: { address: RAVIOLI_NATIVE_RECOVERY_ROUTER },
    target: { address: RAVIOLI_NATIVE_RECOVERY_GNOCCHI },
    parameter: {
      entrypoint: "transfer",
      value: [{ from_: RAVIOLI_NATIVE_RECOVERY_ROUTER, txs: [{ to_: RAVIOLI_NATIVE_RECOVERY_CREATOR, token_id: "1", amount: "1" }] }],
    },
  };
  const operation = validateRavioliNativeOperationRows([top, internal], {
    operationHash: hash,
    expectedCounter: 23_831_471,
    call,
    generated,
  });
  assert.deepEqual(operation.internalEntrypoints, ["transfer"]);
  assert.throws(() => validateRavioliNativeOperationRows([top, internal, { ...internal, nonce: 1 }], {
    operationHash: hash,
    expectedCounter: 23_831_471,
    call,
    generated,
  }), /internal operation count drift/);
});

test("live recovery verifier replays all ten exact trees, both RPC lanes, terminal state, and four public pins", async () => {
  const fixture = await liveVerifierFixture();
  const verification = await verifyRavioliNativeRecoveryLive(runRoot, {
    io: fixture.io,
    now: () => "2026-07-22T20:00:00.000Z",
  });
  assert.equal(verification.schema, "pastaprotocol-ravioli-native-recovery-live-verification@1");
  assert.equal(verification.verifiedAt, "2026-07-22T20:00:00.000Z");
  assert.equal(verification.operations.length, 10);
  assert.deepEqual(verification.operations.map((operation) => operation.hash), fixture.receipt.operations.map((operation: any) => operation.hash));
  assert.equal(new Set(fixture.observed.operations).size, 10);
  assert.deepEqual(fixture.observed.operations, fixture.receipt.operations.map((operation: any) => operation.hash));
  assert.deepEqual(fixture.observed.lanes.sort(), [SHADOWNET_RPC_FALLBACK, SHADOWNET_RPC_PRIMARY].sort());
  assert.equal(fixture.observed.stateReads, 1);
  assert.equal(verification.publicIpfs.length, 4);
  assert.equal(new Set(fixture.observed.publicUrls).size, 4);
  assert.deepEqual(new Set(fixture.observed.publicUrls), new Set(fixture.publicBytes.keys()));
  assert.deepEqual(verification.terminalState, fixture.receipt.after);
  assert.equal(verification.lanes.primary.counter, verification.lanes.fallback.counter);
  assert.equal(verification.lanes.minimumRecoveryCounter, fixture.receipt.operations.at(-1).counter);
});

test("live recovery verifier rejects receipt, operation-tree, RPC, terminal-state, and public-byte drift", async () => {
  {
    const fixture = await liveVerifierFixture();
    const changed = Buffer.concat([Buffer.from(fixture.receiptBytes), Buffer.from("\n")]);
    await assert.rejects(
      () => verifyRavioliNativeRecoveryLive(runRoot, { io: { ...fixture.io, readReceiptBytes: async () => changed } }),
      /receipt SHA-256 drift/,
    );
    assert.deepEqual(fixture.observed, { operations: [], lanes: [], publicUrls: [], stateReads: 0 });
  }
  {
    const fixture = await liveVerifierFixture();
    const targetHash = fixture.receipt.operations[8].hash;
    await assert.rejects(
      () => verifyRavioliNativeRecoveryLive(runRoot, {
        io: {
          ...fixture.io,
          readOperationRows: async (operationHash) => {
            const index = fixture.receipt.operations.findIndex((operation: any) => operation.hash === operationHash);
            const rows = structuredClone(liveOperationRows(fixture.receipt, index));
            if (operationHash === targetHash) rows.push({ ...rows.at(-1), nonce: 99 });
            return rows;
          },
        },
      }),
      /internal operation count drift/,
    );
  }
  {
    const fixture = await liveVerifierFixture();
    await assert.rejects(
      () => verifyRavioliNativeRecoveryLive(runRoot, {
        io: {
          ...fixture.io,
          readLane: async (rpcUrl) => ({
            counter: rpcUrl === SHADOWNET_RPC_PRIMARY ? 23_831_477 : 23_831_478,
            balanceMutez: 26_000_000,
            activeOperationCount: 0,
          }),
        },
      }),
      /RPC counters disagree/,
    );
    await assert.rejects(
      () => verifyRavioliNativeRecoveryLive(runRoot, {
        io: {
          ...fixture.io,
          readLane: async () => ({ counter: 23_831_477, balanceMutez: 26_000_000, activeOperationCount: 1 } as any),
        },
      }),
      /active creator operation/,
    );
  }
  {
    const fixture = await liveVerifierFixture();
    const state = structuredClone(fixture.receipt.after);
    state.adapters.rotiniReservations["4:1"] = 1;
    await assert.rejects(
      () => verifyRavioliNativeRecoveryLive(runRoot, { io: { ...fixture.io, readState: async () => state } }),
      /deep-equal|Expected values/,
    );
  }
  {
    const fixture = await liveVerifierFixture();
    const firstUrl = fixture.receipt.generatedOutputs[0].artifact.publicGatewayUrl;
    await assert.rejects(
      () => verifyRavioliNativeRecoveryLive(runRoot, {
        io: {
          ...fixture.io,
          readPublicBytes: async (url) => {
            const bytes = fixture.publicBytes.get(url)!;
            if (url !== firstUrl) return Uint8Array.from(bytes);
            const changed = Uint8Array.from(bytes);
            changed[0] ^= 0xff;
            return changed;
          },
        },
      }),
      /public IPFS SHA-256 drift/,
    );
    await assert.rejects(
      () => verifyRavioliNativeRecoveryLive(runRoot, {
        io: {
          ...fixture.io,
          readPublicBytes: async (url) => {
            const bytes = fixture.publicBytes.get(url)!;
            return url === firstUrl ? bytes.slice(0, -1) : Uint8Array.from(bytes);
          },
        },
      }),
      /public IPFS byte length drift/,
    );
  }
});

test("source policy keeps recovery native, strict, public-IPFS-verified, and non-executing by default", async () => {
  const source = await readFile(path.join(process.cwd(), "scripts", "pasta-protocol", "shadownet-ravioli-native-recovery.ts"), "utf8");
  assert.match(source, /set_sale_active/);
  assert.match(source, /open_pack/);
  assert.match(source, /create_project/);
  assert.match(source, /publicGatewayVerified/);
  assert.match(source, /assertRavioliNativeSignerLaneClear\(SHADOWNET_RPC_PRIMARY/);
  assert.match(source, /assertRavioliNativeSignerLaneClear\(SHADOWNET_RPC_FALLBACK/);
  assert.match(source, /all estimates must finish before native recovery submission/);
  assert.doesNotMatch(source, /entrypoint:\s*["']mint["']/);
  assert.doesNotMatch(source, /entrypoint:\s*["']recover_(?:asset|adapter)["']/);
  assert.match(source, new RegExp(RAVIOLI_NATIVE_RECOVERY_EXECUTE_FLAG));
  assert.match(source, /if \(process\.argv\[1\].*pathToFileURL/);
});
