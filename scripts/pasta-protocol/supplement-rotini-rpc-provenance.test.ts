import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import {
  applyRotiniRpcSupplement,
  assertRotiniRpcSupplementAllowed,
  buildRotiniRpcProvenance,
  ROTINI_RPC_SUPPLEMENT_ARTIFACT_ID,
  ROTINI_RPC_SUPPLEMENT_EXECUTE_FLAG,
  ROTINI_RPC_SUPPLEMENT_RELATIVE_PATH,
} from "./supplement-rotini-rpc-provenance";
import { deterministicJsonBytes, SHADOWNET_CHAIN_ID } from "./shadownet-proof-kit";

const CONTRACT = "KT1Ckw2WQ88vSzrVqeC2LnjmdspeFupTSpZt";
const CID = "bafybeigdyrzt5sfp7udm7hu76fbsclnmgqz3u7mvqfl5x7g4xkv7szm2vi";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
  "base64",
);
const CONTRACT_CODE = Object.freeze([
  Object.freeze({ prim: "parameter", args: [Object.freeze({ prim: "unit" })] }),
  Object.freeze({ prim: "storage", args: [Object.freeze({ prim: "unit" })] }),
  Object.freeze({ prim: "code", args: [Object.freeze([])] }),
]);
const OPERATIONS = Object.freeze([
  Object.freeze({
    kind: "origination",
    hash: "ooQtCA6kjmLW9aWxKviC9iiKQmZAD226FJpWhivNBEBeTw4mLjY",
  }),
  Object.freeze({
    kind: "reserve",
    entrypoint: "reserve_iteration",
    hash: "oowFmok23pe2Q4SNMbLMDEkemA4YWHgYyh24NVZb2HbjCApEqTJ",
  }),
  Object.freeze({
    kind: "finalize",
    entrypoint: "finalize_iteration",
    hash: "oocUh6ZQw6pit8SrmCkg2hNw3E6V34P1dPGHCGMLSC68pnyWDf6",
  }),
]);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function persist(
  appRoot: string,
  relativePath: string,
  bytes: Uint8Array,
): Promise<{ path: string; sha256: string }> {
  await mkdir(path.dirname(path.join(appRoot, relativePath)), { recursive: true });
  await writeFile(path.join(appRoot, relativePath), bytes);
  return { path: relativePath, sha256: sha256(bytes) };
}

async function createSyntheticRotiniProof(runRoot: string): Promise<void> {
  const appRoot = path.join(runRoot, "rotini");
  const screenshots = [];
  for (const stage of ["configure", "submit", "confirmed"]) {
    const bytes = Buffer.concat([PNG, Buffer.from(`\nrotini:${stage}\n`, "utf8")]);
    const written = await persist(appRoot, `screenshots/${stage}.png`, bytes);
    screenshots.push({
      stage,
      path: written.path,
      sha256: written.sha256,
      caption: `Synthetic Rotini ${stage} proof stage`,
    });
  }

  const metadata = await persist(
    appRoot,
    "artifacts/token-metadata.json",
    deterministicJsonBytes({ name: "Synthetic Rotini proof token" }),
  );
  const media = await persist(appRoot, "artifacts/token-media.png", PNG);
  const contractCode = await persist(
    appRoot,
    "artifacts/rotini-current-contract-code.json",
    deterministicJsonBytes(CONTRACT_CODE),
  );
  const reconciliation = await persist(
    appRoot,
    "artifacts/rotini-chain-reconciliation-snapshot.json",
    deterministicJsonBytes({
      schema: "pastaprotocol-rotini-chain-reconciliation@1",
      chainId: SHADOWNET_CHAIN_ID,
      contract: {
        address: CONTRACT,
        artifactCodeSha256: hashMichelsonScriptCode(CONTRACT_CODE),
      },
      operations: [{ level: 4_324_351 }],
    }),
  );
  await mkdir(
    path.join(appRoot, "artifacts", "rotini-ui-live-checkpoint"),
    { recursive: true },
  );

  const artifacts = [
    {
      id: "token-metadata",
      kind: "token-metadata",
      ...metadata,
      ipfsUri: `ipfs://${CID}/rotini-metadata.json`,
      gatewayUrl: `https://ipfs.io/ipfs/${CID}/rotini-metadata.json`,
      retrievedSha256: metadata.sha256,
    },
    {
      id: "token-media",
      kind: "token-media",
      ...media,
      ipfsUri: `ipfs://${CID}/rotini-media.png`,
      gatewayUrl: `https://ipfs.io/ipfs/${CID}/rotini-media.png`,
      retrievedSha256: media.sha256,
    },
    {
      id: "rotini-current-contract-code",
      kind: "contract-code",
      ...contractCode,
    },
    {
      id: "rotini-chain-reconciliation-snapshot",
      kind: "chain-reconciliation",
      ...reconciliation,
    },
  ];
  const operations = OPERATIONS.map((operation) => ({
    ...operation,
    contractAddress: CONTRACT,
    status: "applied",
    explorerUrl: `https://shadownet.tzkt.io/${operation.hash}`,
  }));
  const token = {
    id: "proof-token",
    contractAddress: CONTRACT,
    tokenId: "0",
    explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}/tokens/0`,
    metadataArtifactId: "token-metadata",
    mediaArtifactId: "token-media",
    metadataUri: `ipfs://${CID}/rotini-metadata.json`,
    artifactUri: `ipfs://${CID}/rotini-media.png`,
  };
  const manifest = {
    schema: "pastaprotocol-app-proof@1",
    app: "rotini",
    role: "token-publisher",
    runId: "synthetic-rotini-rpc-proof",
    capturedAt: "2026-08-08T13:44:00.000Z",
    network: {
      name: "shadownet",
      chainId: SHADOWNET_CHAIN_ID,
      rpcUrl: null,
    },
    capabilities: [{
      id: "complete-app-story",
      description: "Minimal synthetic Rotini proof boundary for RPC supplementation",
      evidence: {
        screenshots: screenshots.map(({ stage }) => stage),
        artifacts: artifacts.map(({ id }) => id),
        contracts: [CONTRACT],
        operations: operations.map(({ hash }) => hash),
        tokens: [token.id],
        roleEvidence: [],
        urls: [],
      },
    }],
    screenshots,
    artifacts,
    contracts: [{
      address: CONTRACT,
      kind: "rotini-contract",
      explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}`,
    }],
    operations,
    tokens: [token],
    roleEvidence: [],
  };
  await writeFile(path.join(appRoot, "manifest.json"), deterministicJsonBytes(manifest));
}

function mockRpcFetch(corruptFallbackChain = false): typeof fetch {
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
      value = { code: CONTRACT_CODE, storage: { prim: "Unit" } };
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
  await createSyntheticRotiniProof(runRoot);
  const fetchImpl = mockRpcFetch();
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
  await createSyntheticRotiniProof(runRoot);
  const appRoot = path.join(runRoot, "rotini");
  const manifestBytes = await readFile(path.join(appRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const reconciliation = JSON.parse((await readFile(path.join(
    appRoot,
    "artifacts",
    "rotini-chain-reconciliation-snapshot.json",
  ))).toString("utf8"));
  const fetchImpl = mockRpcFetch(true);
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
