import assert from "node:assert/strict";
import test from "node:test";

import {
  CARRY_FORWARD_ARTIFACT_ID,
  buildCarryForwardDocuments,
} from "./carry-forward-completed-app-proof";

function manifestFixture() {
  return {
    schema: "pastaprotocol-app-proof@1",
    app: "macaroni",
    role: "drop-publisher",
    runId: "source-proof-run",
    capturedAt: "2026-08-08T14:48:34.493Z",
    network: { name: "shadownet", chainId: "NetXsqzbfFenSTS", rpcUrl: "https://tezos-shadownet.octez.io/" },
    contracts: [{ address: "KT1WVXyTLXniTtPaH7AfRsbGVKoG6YLXrBxP" }],
    operations: [{ hash: "ooC3ADrHy7VmNytaqaCF6RH2AiQRvMq8aksTu8SJuDz279s51Tf" }],
    tokens: [{ id: "macaroni-token", contractAddress: "KT1WVXyTLXniTtPaH7AfRsbGVKoG6YLXrBxP", tokenId: "1" }],
    screenshots: [{ stage: "drop-complete" }],
    artifacts: [{ id: "receipt", kind: "receipt", path: "artifacts/receipt.json", sha256: "a".repeat(64) }],
    capabilities: [{ id: "drop", evidence: { artifacts: ["receipt"] } }],
  };
}

test("carry-forward preserves source identity while binding the copied proof to one aggregate run", () => {
  const manifest = manifestFixture();
  const original = structuredClone(manifest);
  const sourceManifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const result = buildCarryForwardDocuments({
    app: "macaroni",
    sourceManifest: manifest,
    sourceManifestBytes,
    targetRunId: "target-proof-run",
  });

  assert.deepEqual(manifest, original, "source manifest must remain immutable");
  assert.equal(result.updatedManifest.runId, "target-proof-run");
  assert.equal(result.updatedManifest.sourceRunId, "source-proof-run");
  assert.equal(result.provenance.source.runId, "source-proof-run");
  assert.equal(result.provenance.target.runId, "target-proof-run");
  assert.equal(result.provenance.execution.signerMaterialLoaded, false);
  assert.equal(result.provenance.execution.chainWrites, 0);
  assert.equal(result.provenance.execution.ipfsWrites, 0);
  assert.ok(result.updatedManifest.capabilities[0].evidence.artifacts.includes(CARRY_FORWARD_ARTIFACT_ID));
  assert.equal(result.updatedManifest.artifacts.at(-1).sha256.length, 64);
});

test("carry-forward rejects same-run, mismatched-app, and recursively imported proofs", () => {
  const sameRun = manifestFixture();
  assert.throws(
    () => buildCarryForwardDocuments({
      app: "macaroni",
      sourceManifest: sameRun,
      sourceManifestBytes: Buffer.from("source"),
      targetRunId: sameRun.runId,
    }),
    /distinct source and target/,
  );

  const wrongApp = manifestFixture();
  assert.throws(
    () => buildCarryForwardDocuments({
      app: "gnocchi",
      sourceManifest: wrongApp,
      sourceManifestBytes: Buffer.from("source"),
      targetRunId: "target-proof-run",
    }),
    /document for gnocchi/,
  );

  const recursive = manifestFixture();
  recursive.artifacts.push({
    id: CARRY_FORWARD_ARTIFACT_ID,
    kind: "completed-app-carry-forward-provenance",
    path: "artifacts/provenance.json",
    sha256: "b".repeat(64),
  });
  assert.throws(
    () => buildCarryForwardDocuments({
      app: "macaroni",
      sourceManifest: recursive,
      sourceManifestBytes: Buffer.from("source"),
      targetRunId: "target-proof-run",
    }),
    /already a carried-forward proof/,
  );
});
