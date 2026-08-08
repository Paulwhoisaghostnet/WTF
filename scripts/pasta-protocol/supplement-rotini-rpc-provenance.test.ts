import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyRotiniRpcSupplement,
  assertRotiniRpcSupplementAllowed,
  buildRotiniRpcProvenance,
  ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID,
  ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG,
  ROTINI_RPC_SUPPLEMENT_RELATIVE_PATH,
} from "./supplement-rotini-rpc-provenance";
import { deterministicJsonBytes, root } from "./shadownet-proof-kit";

const sourceRun = path.join(
  root,
  "artifacts",
  "pasta-protocol-proof-runs",
  "pasta-alpha-proof-20260724t053947z",
);

async function resetToMissingRpcBoundary(runRoot: string): Promise<void> {
  const manifestPath = path.join(runRoot, "rotini", "manifest.json");
  const manifest = JSON.parse((await readFile(manifestPath)).toString("utf8"));
  manifest.network.rpcUrl = null;
  manifest.artifacts = manifest.artifacts.filter(
    (artifact: any) => artifact.id !== ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID,
  );
  for (const capability of manifest.capabilities) {
    capability.evidence.artifacts = capability.evidence.artifacts.filter(
      (id: string) => id !== ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID,
    );
  }
  await rm(path.join(runRoot, "rotini", ROTINI_RPC_SUPPLEMENT_RELATIVE_PATH), { force: true });
  await writeFile(manifestPath, deterministicJsonBytes(manifest));
}

async function mockRpcFetch(runRoot: string, corruptFallbackChain = false): Promise<typeof fetch> {
  const artifact = JSON.parse((await readFile(path.join(
    runRoot,
    "rotini",
    "artifacts",
    "rotini-current-contract-code.json",
  ))).toString("utf8"));
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const isFallback = url.hostname === "fallback.example";
    let value: unknown;
    if (url.pathname.endsWith("/chain_id")) {
      value = corruptFallbackChain && isFallback ? "NetXWrong" : "NetXsqzbfFenSTS";
    } else if (url.pathname.endsWith("/hash")) {
      value = "BLockHash1111111111111111111111111111111111111111111111111";
    } else if (url.pathname.endsWith("/header")) {
      value = { level: 4_324_351, timestamp: "2026-07-24T06:00:45Z" };
    } else if (url.pathname.endsWith("/script")) {
      value = { code: artifact, storage: { prim: "Unit" } };
    } else {
      return new Response("missing", { status: 404 });
    }
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("Rotini RPC supplement authenticates two historical Shadownet RPC views and is idempotent", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "rotini-rpc-proof-"));
  t.after(async () => rm(temporary, { recursive: true, force: true }));
  const runRoot = path.join(temporary, "proof-run");
  await cp(sourceRun, runRoot, { recursive: true, errorOnExist: true, force: false });
  await resetToMissingRpcBoundary(runRoot);
  const fetchImpl = await mockRpcFetch(runRoot);
  const options = {
    runRoot,
    fetchImpl,
    observedAt: "2026-08-08T13:45:00.000Z",
    primaryRpcUrl: "https://primary.example/",
    fallbackRpcUrl: "https://fallback.example/",
  };
  const result = await applyRotiniRpcSupplement(options);
  assert.equal(result.status, "SUPPLEMENTED");
  const manifest = JSON.parse((await readFile(path.join(runRoot, "rotini", "manifest.json"))).toString("utf8"));
  assert.equal(manifest.network.rpcUrl, "https://primary.example/");
  assert.equal(manifest.artifacts.at(-1).id, ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID);
  assert.ok(manifest.capabilities[0].evidence.artifacts.includes(ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID));
  assert.equal((await applyRotiniRpcSupplement(options)).status, "ALREADY_SUPPLEMENTED");
});

test("Rotini RPC provenance rejects endpoint chain disagreement before local mutation", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "rotini-rpc-reject-"));
  t.after(async () => rm(temporary, { recursive: true, force: true }));
  const runRoot = path.join(temporary, "proof-run");
  await cp(sourceRun, runRoot, { recursive: true, errorOnExist: true, force: false });
  await resetToMissingRpcBoundary(runRoot);
  const appRoot = path.join(runRoot, "rotini");
  const manifestBytes = await readFile(path.join(appRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const reconciliation = JSON.parse((await readFile(path.join(
    appRoot,
    "artifacts",
    "rotini-chain-reconciliation-snapshot.json",
  ))).toString("utf8"));
  const fetchImpl = await mockRpcFetch(runRoot, true);
  await assert.rejects(
    () => buildRotiniRpcProvenance({
      manifestBytes,
      manifest,
      reconciliation,
      fetchImpl,
      observedAt: "2026-08-08T13:45:00.000Z",
      primaryRpcUrl: "https://primary.example/",
      fallbackRpcUrl: "https://fallback.example/",
    }),
    /not Shadownet/,
  );
  await assert.rejects(
    () => readFile(path.join(appRoot, ROTINI_RPC_SUPPLEMENT_RELATIVE_PATH)),
    /ENOENT/,
  );
});

test("Rotini RPC supplement guard is explicit and Shadownet-only", () => {
  assert.throws(() => assertRotiniRpcSupplementAllowed({}), new RegExp(ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG));
  assert.throws(() => assertRotiniRpcSupplementAllowed({
    [ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG]: "1",
    TEZOS_NETWORK: "mainnet",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
  }), /Shadownet-only/);
  assert.equal(assertRotiniRpcSupplementAllowed({
    [ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG]: "1",
    TEZOS_NETWORK: "shadownet",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
  }), "/tmp/proof");
});
