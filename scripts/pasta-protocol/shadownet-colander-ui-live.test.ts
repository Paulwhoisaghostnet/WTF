import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertColanderManagementRequest,
  assertColanderUiLiveExecutionAllowed,
  buildColanderRoleManifest,
  buildColanderUiLiveProxySource,
  selectColanderTarget,
  verifyColanderTzktEvidence,
  type ColanderContractSnapshot,
  type ContractApp,
} from "./shadownet-colander-ui-live";
import { SHADOWNET_CHAIN_ID, root } from "./shadownet-proof-kit";

const CONTRACTS: Record<ContractApp, string> = {
  macaroni: "KT1JB1BjgT9QaN56BgfvAbrcRTrp6TMU4oCq",
  spaghetti: "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
  gnocchi: "KT1DxL652xGhAwWnsaC32TcdDP7BL7KwrStw",
  ravioli: "KT1BGhhFjsctuKtXToAZBbpNtgYjH7FTGqGS",
  rotini: "KT1BYMrRC1ZvoHJWaSvFpiRsd5ZM2YcRh3Ls",
  penne: "KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz",
  lasagna: "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy",
};
const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const OPERATION = "onobWdgobH4Gbm3kNYeXQFNtGe9bx8RMB4jp6VCqB8PgwjYtexq";

function snapshot(app: ContractApp): ColanderContractSnapshot {
  const adapterKind: Record<ContractApp, string> = {
    macaroni: "blind_mint_collection",
    spaghetti: "standard_collection",
    gnocchi: "open_edition_collection",
    ravioli: "bundle_collection",
    rotini: "generative_collection",
    penne: "distribution",
    lasagna: "exhibition",
  };
  return {
    app,
    address: CONTRACTS[app],
    manifestKind: `${app}-contract`,
    explorerUrl: `https://shadownet.tzkt.io/${CONTRACTS[app]}`,
    entrypoints: [],
    adapterKind: adapterKind[app],
    adapterLabel: `${app} adapter`,
    actionIds: [],
    actionLabels: [],
    administrator: CREATOR,
    pendingAdministrator: null,
    nextTokenId: 1,
    tokenCount: null,
    revisionCount: app === "lasagna" ? 2 : null,
    currentRevision: app === "lasagna" ? 1 : null,
    metadataHex: "697066733a2f2f6261666b72656974657374",
    metadataUri: "ipfs://bafkreitest",
    metadataArtifactId: `${app}-metadata`,
    metadataArtifactPath: `${app}/artifacts/metadata.json`,
    metadataSha256: "a".repeat(64),
    metadataGatewayUrl: `https://ipfs.io/ipfs/bafkreitest/${app}.json`,
    relationship: null,
  };
}

test("Colander UI-live execution is explicit, Shadownet-only, and fresh-run only", () => {
  assert.throws(() => assertColanderUiLiveExecutionAllowed({}), /execute flag is required/);
  assert.throws(
    () => assertColanderUiLiveExecutionAllowed({
      PASTA_SHADOWNET_COLANDER_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/pasta-proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.throws(
    () => assertColanderUiLiveExecutionAllowed({
      PASTA_SHADOWNET_COLANDER_UI_LIVE_EXECUTE: "1",
      TEZOS_NETWORK: "shadownet",
    }),
    /proof run directory is required/,
  );
  assert.throws(
    () => assertColanderUiLiveExecutionAllowed({
      PASTA_SHADOWNET_COLANDER_UI_LIVE_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/pasta-proof",
      TEZOS_NETWORK: "shadownet",
      PASTA_SHADOWNET_COLANDER_UI_LIVE_RESUME: "1",
    }),
    /may not resume/,
  );
  assert.doesNotThrow(() => assertColanderUiLiveExecutionAllowed({
    PASTA_SHADOWNET_COLANDER_UI_LIVE_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/pasta-proof",
    TEZOS_NETWORK: "shadownet",
  }));
});

test("target selection requires the owner adapter and a material app action", () => {
  const selected = selectColanderTarget("macaroni", [
    { address: CONTRACTS.spaghetti, adapterKind: "generic_fa2", actionIds: ["transfer"] },
    { address: CONTRACTS.gnocchi, adapterKind: "blind_mint_collection", actionIds: ["set_paused"] },
    { address: CONTRACTS.macaroni, adapterKind: "blind_mint_collection", actionIds: ["set_pause", "reveal"] },
  ]);
  assert.equal(selected.address, CONTRACTS.macaroni);
  assert.throws(
    () => selectColanderTarget("ravioli", [{ address: CONTRACTS.ravioli, adapterKind: "generic_fa2", actionIds: ["transfer"] }]),
    /no contract detected as bundle_collection/,
  );
  assert.throws(
    () => selectColanderTarget("penne", [{ address: CONTRACTS.penne, adapterKind: "distribution", actionIds: ["airdrop"] }]),
    /exposing claim/,
  );
});

test("management request validator permits only same-run Lasagna set_current_revision(0)", () => {
  assert.doesNotThrow(() => assertColanderManagementRequest({
    action: "contract_call",
    contractAddress: CONTRACTS.lasagna,
    entrypoint: "set_current_revision",
    payload: 0,
  }, CONTRACTS.lasagna));
  assert.throws(() => assertColanderManagementRequest({
    action: "contract_call",
    contractAddress: CONTRACTS.spaghetti,
    entrypoint: "set_current_revision",
    payload: 0,
  }, CONTRACTS.lasagna), /not the same-run Lasagna/);
  assert.throws(() => assertColanderManagementRequest({
    action: "contract_call",
    contractAddress: CONTRACTS.lasagna,
    entrypoint: "publish_revision",
    payload: 0,
  }, CONTRACTS.lasagna), /not allowlisted/);
  assert.throws(() => assertColanderManagementRequest({
    action: "contract_call",
    contractAddress: CONTRACTS.lasagna,
    entrypoint: "set_current_revision",
    payload: 1,
  }, CONTRACTS.lasagna), /only permits/);
});

test("browser proxy is syntactically valid and contains public routing facts only", () => {
  const source = buildColanderUiLiveProxySource(CREATOR);
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /__wtfColanderTezosHarness/);
  assert.match(source, new RegExp(SHADOWNET_CHAIN_ID));
  assert.match(source, new RegExp(CREATOR));
  assert.doesNotMatch(source, /(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}/);
  assert.doesNotMatch(source, /private[_ -]?key|seed[_ -]?phrase|mnemonic/i);
});

test("generated proxy performs read and send requests without receiving signer material", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const fakeWindow: any = {
    localStorage: {
      values: new Map<string, string>(),
      setItem(key: string, value: string) { this.values.set(key, value); },
      removeItem(key: string) { this.values.delete(key); },
    },
    async __colanderNodeBridge(request: Record<string, unknown>) {
      requests.push(request);
      if (request.action === "connect" || request.action === "chain_check") {
        return { address: CREATOR, chainId: SHADOWNET_CHAIN_ID };
      }
      if (request.action === "contract_read") {
        return {
          ...snapshot("lasagna"),
          entrypoints: ["publish_revision", "add_curator", "set_current_revision"],
        };
      }
      if (request.action === "contract_call") {
        return { operationHash: OPERATION, confirmationLevel: 1 };
      }
      throw new Error(`unexpected action ${String(request.action)}`);
    },
  };
  new Function("window", buildColanderUiLiveProxySource(CREATOR))(fakeWindow);
  const connection = await fakeWindow.__wtfColanderTezosHarness.connectWallet();
  assert.deepEqual(connection, { address: CREATOR, providerName: "octez.connect" });
  const toolkit = await fakeWindow.__wtfColanderTezosHarness.getTezos();
  const contract = await toolkit.contract.at(CONTRACTS.lasagna);
  assert.deepEqual(Object.keys(contract.entrypoints.entrypoints), ["publish_revision", "add_curator", "set_current_revision"]);
  assert.equal((await contract.storage()).revision_count, 2);
  const operation = await contract.methodsObject.set_current_revision(0).send();
  assert.equal(operation.hash, OPERATION);
  assert.equal(await operation.confirmation(), 1);
  assert.deepEqual(requests.at(-1), {
    action: "contract_call",
    contractAddress: CONTRACTS.lasagna,
    entrypoint: "set_current_revision",
    payload: 0,
  });
  assert.equal(JSON.stringify(requests).includes("private"), false);
});

test("role manifest is management-only and cannot claim contracts or tokens", () => {
  const manifest = buildColanderRoleManifest({
    runId: "pasta-proof-test",
    capturedAt: "2026-07-18T12:00:00.000Z",
    rpcUrl: "https://tezos-shadownet.octez.io",
    screenshots: [],
    artifacts: [],
    operations: [{ kind: "manage" }],
    roleEvidence: [{ kind: "contract-discovery" }, { kind: "management-action" }],
    capabilities: [],
  });
  assert.equal(manifest.schema, "pastaprotocol-app-proof@1");
  assert.equal(manifest.app, "colander");
  assert.equal(manifest.role, "management");
  assert.deepEqual(manifest.contracts, []);
  assert.deepEqual(manifest.tokens, []);
  assert.deepEqual(manifest.network, {
    name: "shadownet",
    chainId: SHADOWNET_CHAIN_ID,
    rpcUrl: "https://tezos-shadownet.octez.io",
  });
});

test("TzKT verifier requires all discovered contracts and the exact applied management call", async (context) => {
  const snapshots = (Object.keys(CONTRACTS) as ContractApp[]).map(snapshot);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = context.mock.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const contract = snapshots.find((candidate) => url.pathname.endsWith(`/contracts/${candidate.address}`));
    if (contract) {
      return new Response(JSON.stringify({ address: contract.address, kind: "smart_contract", firstActivity: 1, lastActivity: 2 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.endsWith(`/operations/transactions/${OPERATION}`)) {
      return new Response(JSON.stringify([{
        hash: OPERATION,
        status: "applied",
        sender: { address: CREATOR },
        target: { address: CONTRACTS.lasagna },
        parameter: { entrypoint: "set_current_revision", value: "0" },
        level: 123,
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const evidence = await verifyColanderTzktEvidence({
      snapshots,
      operationHash: OPERATION,
      creatorAddress: CREATOR,
      lasagnaAddress: CONTRACTS.lasagna,
      pollOptions: { attempts: 1, delayMs: 0 },
    });
    assert.equal((evidence.contracts as unknown[]).length, 7);
    assert.deepEqual((evidence.managementOperation as Record<string, unknown>).entrypoint, "set_current_revision");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("direct command without execute authority writes no proof output", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "colander-ui-live-noexecute-"));
  const runRoot = path.join(temporary, "pasta-proof-test");
  await mkdir(runRoot);
  try {
    const result = spawnSync(
      path.join(root, "node_modules/.bin/tsx"),
      [path.join(root, "scripts/pasta-protocol/shadownet-colander-ui-live.ts")],
      {
        cwd: root,
        env: {
          ...process.env,
          PASTA_PROOF_RUN_DIR: runRoot,
          TEZOS_NETWORK: "shadownet",
          PASTA_SHADOWNET_COLANDER_UI_LIVE_EXECUTE: "",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /"status": "BLOCKED"/);
    assert.equal(existsSync(path.join(runRoot, "colander")), false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("missing sibling proofs block before Colander creates its output directory", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "colander-ui-live-order-"));
  const runRoot = path.join(temporary, "pasta-proof-test");
  await mkdir(runRoot);
  try {
    const result = spawnSync(
      path.join(root, "node_modules/.bin/tsx"),
      [path.join(root, "scripts/pasta-protocol/shadownet-colander-ui-live.ts")],
      {
        cwd: root,
        env: {
          ...process.env,
          PASTA_PROOF_RUN_DIR: runRoot,
          TEZOS_NETWORK: "shadownet",
          PASTA_SHADOWNET_COLANDER_UI_LIVE_EXECUTE: "1",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /requires every earlier app proof/);
    assert.equal(existsSync(path.join(runRoot, "colander")), false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("production Colander runner journals before send and uses dual-RPC plus exact-hash finality", async () => {
  const source = await readFile(path.join(root, "scripts/pasta-protocol/shadownet-colander-ui-live.ts"), "utf8");
  assert.match(source, /PastaProofRestartJournal\.(?:create|open)/);
  assert.match(source, /readPastaProofRestartRpcSnapshot\(SHADOWNET_RPC_PRIMARY/);
  assert.match(source, /readPastaProofRestartRpcSnapshot\(SHADOWNET_RPC_FALLBACK/);
  const prepared = source.indexOf('restartJournal.beforeOperationSubmit("creator", prepared)');
  const sent = source.indexOf("methodsObject.set_current_revision(0).send()");
  const submitted = source.indexOf('restartJournal.onOperationSubmitted("creator", submitted)');
  const exactHash = source.indexOf("Colander exact-hash finality");
  const applied = source.indexOf('restartJournal.onReceipt("creator", receipt)');
  assert.ok(prepared >= 0 && prepared < sent, "Colander must durably PREPARE before send");
  assert.ok(sent < submitted && submitted < exactHash, "Colander must durably retain the submitted hash before finality");
  assert.ok(exactHash < applied, "Colander must prove exact-hash application before APPLIED");
  assert.doesNotMatch(source, /operation\.confirmation\(/);
});
