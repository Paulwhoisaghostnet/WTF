import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  GNOCCHI_HISTORICAL_ARTIFACT_ID,
  applyHistoricalSnapshotToManifest,
  assertGnocchiHistoricalSupplementAllowed,
  buildGnocchiHistoricalIndexerArtifact,
  type TzktProofFetch,
} from "./supplement-gnocchi-historical-indexer-proof";
import { deterministicJsonBytes, root } from "./shadownet-proof-kit";

const CONTRACT = "KT1NJJ55w4TLkRVfuweeRfvT9jvWFf4viaup";
const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const COLLECTOR_ONE = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
const COLLECTOR_TWO = "tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ";
const LATER_RAVIOLI_ROUTER = "KT1MqcjkuKQuZXpShy4jsomTKoSpCDtv1KqH";
const OPERATION_HASHES = [
  "ooqQerwmFGorWABitNHN2fHYiTszK9VYB7UJhaRSciFp1pBEXKD",
  "ooFzVQJ1tbZNtDjdt4gSjrdGLv5AEdFo8PWrPXcgvFHaDLU7HjY",
  "opAv3ywQ4VpdbJerun4YxfGLpePAroaEigGK724LmTsiQHCcSG2",
] as const;

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

function manifestFixture() {
  const tokens = [0, 1, 2].map((tokenId) => ({
    id: `gnocchi-token-${tokenId}`,
    contractAddress: CONTRACT,
    tokenId: String(tokenId),
    explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}/tokens/${tokenId}`,
    metadataArtifactId: `token-${tokenId}-metadata`,
    mediaArtifactId: `token-${tokenId}-media`,
    metadataUri: `ipfs://bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${tokenId}`,
    artifactUri: `ipfs://bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb${tokenId}`,
  }));
  return {
    schema: "pastaprotocol-app-proof@1",
    app: "gnocchi",
    role: "token-publisher",
    runId: "gnocchi-historical-fixture",
    capturedAt: "2026-07-19T04:15:01.231Z",
    network: {
      name: "shadownet",
      chainId: "NetXsqzbfFenSTS",
      rpcUrl: "https://tezos-shadownet.octez.io/",
    },
    screenshots: [],
    artifacts: [],
    contracts: [{ address: CONTRACT }],
    operations: [
      {
        hash: OPERATION_HASHES[0],
        kind: "origination",
        contractAddress: CONTRACT,
        status: "applied",
      },
      {
        hash: OPERATION_HASHES[1],
        kind: "create",
        contractAddress: CONTRACT,
        entrypoint: "create_open_edition",
        status: "applied",
      },
      {
        hash: OPERATION_HASHES[2],
        kind: "mint",
        contractAddress: CONTRACT,
        entrypoint: "open_mint",
        status: "applied",
      },
    ],
    tokens,
    roleEvidence: [],
    capabilities: [{
      id: "three-policy-proof",
      description: "fixture",
      evidence: {
        screenshots: ["complete"],
        artifacts: [],
        contracts: [CONTRACT],
        operations: [...OPERATION_HASHES],
        tokens: tokens.map((token) => token.id),
        roleEvidence: [],
        urls: [],
      },
    }],
  };
}

function row(account: string, tokenId: string, balance: string) {
  return {
    account: { address: account },
    token: { contract: { address: CONTRACT }, tokenId, standard: "fa2" },
    balance,
  };
}

function fixtureFetcher(options: { failTerminalOperation?: boolean } = {}): {
  fetcher: TzktProofFetch;
  urls: string[];
} {
  const urls: string[] = [];
  const historical = {
    "0": [row(CREATOR, "0", "2"), row(COLLECTOR_ONE, "0", "1"), row(COLLECTOR_TWO, "0", "1")],
    "1": [row(CREATOR, "1", "2"), row(COLLECTOR_ONE, "1", "1"), row(COLLECTOR_TWO, "1", "1")],
    "2": [row(CREATOR, "2", "1"), row(COLLECTOR_ONE, "2", "1"), row(COLLECTOR_TWO, "2", "1")],
  };
  const current = {
    "0": [row(COLLECTOR_ONE, "0", "1"), row(COLLECTOR_TWO, "0", "1"), row(LATER_RAVIOLI_ROUTER, "0", "2")],
    "1": [row(CREATOR, "1", "1"), row(COLLECTOR_ONE, "1", "1"), row(COLLECTOR_TWO, "1", "1"), row(LATER_RAVIOLI_ROUTER, "1", "1")],
    "2": historical["2"],
  };
  const operationLevels = new Map([
    [OPERATION_HASHES[0], 100],
    [OPERATION_HASHES[1], 101],
    [OPERATION_HASHES[2], 105],
  ]);
  const fetcher: TzktProofFetch = async (url) => {
    urls.push(url);
    const parsed = new URL(url);
    let json: unknown;
    if (parsed.pathname.includes("/operations/")) {
      const hash = parsed.pathname.split("/").pop()!;
      const level = operationLevels.get(hash as typeof OPERATION_HASHES[number]);
      assert.ok(level, `unexpected operation request ${url}`);
      const index = OPERATION_HASHES.indexOf(hash as typeof OPERATION_HASHES[number]);
      json = [{
        hash,
        level,
        status: options.failTerminalOperation && hash === OPERATION_HASHES[2] ? "failed" : "applied",
        type: index === 0 ? "origination" : "transaction",
        ...(index === 0
          ? { originatedContract: { address: CONTRACT } }
          : {
              target: { address: CONTRACT },
              parameter: { entrypoint: index === 1 ? "create_open_edition" : "open_mint" },
            }),
      }];
    } else {
      const tokenId = parsed.searchParams.get("token.tokenId")!;
      assert.equal(parsed.searchParams.get("token.contract"), CONTRACT);
      assert.ok(["0", "1", "2"].includes(tokenId));
      json = parsed.pathname.includes("/historical_balances/105")
        ? historical[tokenId as keyof typeof historical]
        : current[tokenId as keyof typeof current];
    }
    const text = JSON.stringify(json);
    return { status: 200, json, text };
  };
  return { fetcher, urls };
}

test("builds a deterministic level-bound Gnocchi snapshot and separates later Ravioli balances", async () => {
  const manifest = manifestFixture();
  const firstFixture = fixtureFetcher();
  const first = await buildGnocchiHistoricalIndexerArtifact({
    manifest,
    sourceManifestSha256: sha256(deterministicJsonBytes(manifest)),
    tzktApiBase: "https://api.shadownet.tzkt.io/v1/",
    fetcher: firstFixture.fetcher,
  });
  const secondFixture = fixtureFetcher();
  const second = await buildGnocchiHistoricalIndexerArtifact({
    manifest: manifestFixture(),
    sourceManifestSha256: sha256(deterministicJsonBytes(manifestFixture())),
    tzktApiBase: "https://api.shadownet.tzkt.io/v1",
    fetcher: secondFixture.fetcher,
  });

  assert.deepEqual(deterministicJsonBytes(first), deterministicJsonBytes(second));
  assert.equal(first.proofLevel, 105);
  assert.equal(first.terminalAcceptedOperation.hash, OPERATION_HASHES[2]);
  assert.deepEqual(
    first.tokens.map((token) => [token.tokenId, token.proofState.totalSupply, token.proofState.holdersCount]),
    [["0", "4", 3], ["1", "4", 3], ["2", "3", 3]],
  );
  assert.deepEqual(
    first.tokens.map((token) => [token.tokenId, token.currentComparison.state.totalSupply, token.currentComparison.state.holdersCount]),
    [["0", "4", 3], ["1", "4", 4], ["2", "3", 3]],
  );
  assert.deepEqual(first.tokens[0].currentComparison.changes, [
    { account: LATER_RAVIOLI_ROUTER, proofBalance: "0", currentBalance: "2" },
    { account: CREATOR, proofBalance: "2", currentBalance: "0" },
  ].sort((a, b) => a.account.localeCompare(b.account)));
  assert.equal(first.tokens[1].currentComparison.mutationDetected, true);
  assert.equal(first.tokens[2].currentComparison.mutationDetected, false);

  const historicalUrls = firstFixture.urls.filter((url) => url.includes("/tokens/historical_balances/"));
  assert.equal(historicalUrls.length, 3);
  for (const url of historicalUrls) {
    assert.match(url, /\/tokens\/historical_balances\/105\?/);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("token.contract"), CONTRACT);
    assert.ok(parsed.searchParams.get("token.tokenId"));
  }
  for (const operation of first.acceptedOperations) {
    assert.match(operation.request.sha256, /^[a-f0-9]{64}$/);
    assert.match(operation.response.rawSha256, /^[a-f0-9]{64}$/);
    assert.match(operation.response.canonicalSha256, /^[a-f0-9]{64}$/);
  }
  for (const token of first.tokens) {
    assert.match(token.historicalRequest.request.sha256, /^[a-f0-9]{64}$/);
    assert.match(token.historicalRequest.response.rawSha256, /^[a-f0-9]{64}$/);
    assert.match(token.historicalRequest.response.canonicalSha256, /^[a-f0-9]{64}$/);
  }
});

test("adds one pinned snapshot reference to every Gnocchi token without mutating source input", async () => {
  const manifest = manifestFixture();
  const original = structuredClone(manifest);
  const fixture = fixtureFetcher();
  const artifact = await buildGnocchiHistoricalIndexerArtifact({
    manifest,
    sourceManifestSha256: sha256(deterministicJsonBytes(manifest)),
    tzktApiBase: "https://api.shadownet.tzkt.io/v1",
    fetcher: fixture.fetcher,
  });
  const artifactBytes = deterministicJsonBytes(artifact);
  const updated = applyHistoricalSnapshotToManifest(manifest, artifact, {
    id: GNOCCHI_HISTORICAL_ARTIFACT_ID,
    kind: "historical-indexer-snapshot",
    path: "artifacts/gnocchi-proof-time-indexer-snapshot.json",
    sha256: sha256(artifactBytes),
    ipfsUri: "ipfs://bafkreihistoricalproofsnapshot00000000000000000000000000000000",
    gatewayUrl: "https://ipfs.io/ipfs/bafkreihistoricalproofsnapshot00000000000000000000000000000000",
    retrievedSha256: sha256(artifactBytes),
  });

  assert.deepEqual(manifest, original);
  assert.equal(updated.artifacts.at(-1).id, GNOCCHI_HISTORICAL_ARTIFACT_ID);
  assert.ok(updated.capabilities[0].evidence.artifacts.includes(GNOCCHI_HISTORICAL_ARTIFACT_ID));
  assert.deepEqual(
    updated.tokens.map((token: any) => ({
      tokenId: token.tokenId,
      artifactId: token.historicalStateArtifactId,
      level: token.proofLevel,
      supply: token.proofTotalSupply,
      holders: token.proofHoldersCount,
    })),
    [
      { tokenId: "0", artifactId: GNOCCHI_HISTORICAL_ARTIFACT_ID, level: 105, supply: "4", holders: 3 },
      { tokenId: "1", artifactId: GNOCCHI_HISTORICAL_ARTIFACT_ID, level: 105, supply: "4", holders: 3 },
      { tokenId: "2", artifactId: GNOCCHI_HISTORICAL_ARTIFACT_ID, level: 105, supply: "3", holders: 3 },
    ],
  );
});

test("rejects missing RPC provenance before applying a historical supplement", async () => {
  const manifest = manifestFixture();
  (manifest.network as { rpcUrl: string | null }).rpcUrl = null;
  const artifact = await buildGnocchiHistoricalIndexerArtifact({
    manifest: manifestFixture(),
    sourceManifestSha256: "a".repeat(64),
    tzktApiBase: "https://api.shadownet.tzkt.io/v1",
    fetcher: fixtureFetcher().fetcher,
  });
  assert.throws(
    () => applyHistoricalSnapshotToManifest(manifest as any, artifact, {
      id: GNOCCHI_HISTORICAL_ARTIFACT_ID,
      kind: "historical-indexer-snapshot",
      path: "artifacts/gnocchi-proof-time-indexer-snapshot.json",
      sha256: "b".repeat(64),
      ipfsUri: "ipfs://bafkreihistoricalproofsnapshot00000000000000000000000000000000",
      gatewayUrl: "https://ipfs.io/ipfs/bafkreihistoricalproofsnapshot00000000000000000000000000000000",
      retrievedSha256: "b".repeat(64),
    }),
    /valid HTTP\(S\) Shadownet RPC URL/,
  );
});

test("fails closed when an accepted operation is not applied at the expected target/entrypoint", async () => {
  const fixture = fixtureFetcher({ failTerminalOperation: true });
  await assert.rejects(
    () => buildGnocchiHistoricalIndexerArtifact({
      manifest: manifestFixture(),
      sourceManifestSha256: "a".repeat(64),
      tzktApiBase: "https://api.shadownet.tzkt.io/v1",
      fetcher: fixture.fetcher,
    }),
    /no applied TzKT record matching accepted operation/,
  );
});

test("fails before fetching when the historical source is not the official Shadownet TzKT API", async () => {
  let fetchCount = 0;
  await assert.rejects(
    () => buildGnocchiHistoricalIndexerArtifact({
      manifest: manifestFixture(),
      sourceManifestSha256: "a".repeat(64),
      tzktApiBase: "https://example.invalid/v1",
      fetcher: async () => {
        fetchCount += 1;
        throw new Error("must not fetch");
      },
    }),
    /requires the official Shadownet TzKT HTTPS API/,
  );
  assert.equal(fetchCount, 0);
});

test("supplement execution is explicit, Shadownet-only, and contains no signer access", async () => {
  assert.throws(() => assertGnocchiHistoricalSupplementAllowed({}), /explicit historical supplement flag/);
  assert.throws(
    () => assertGnocchiHistoricalSupplementAllowed({
      PASTA_GNOCCHI_HISTORICAL_PROOF_EXECUTE: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/proof",
      TEZOS_NETWORK: "mainnet",
    }),
    /only permits Shadownet/,
  );
  assert.doesNotThrow(() => assertGnocchiHistoricalSupplementAllowed({
    PASTA_GNOCCHI_HISTORICAL_PROOF_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/proof",
    TEZOS_NETWORK: "shadownet",
  }));
  const source = await readFile(
    path.join(root, "scripts", "pasta-protocol", "supplement-gnocchi-historical-indexer-proof.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /loadSigner|signerEnv|buildToolkit|\.contract\.at|\.wallet\./);
  assert.match(source, /pinIpfsProofJson/);
  assert.match(source, /historical_balances/);
});
