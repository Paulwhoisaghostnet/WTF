import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateLexiconRecord,
  type MediaPinItem,
  type MediaPinManifest,
  type MediaPinPolicy,
} from "@shared/atproto";
import { PASTA_WTFME_PROOF_CONTRACTS, buildPastaHostedPageSnapshots } from "../wtf-sites/pasta-hosting";
import {
  PASTA_PINNING_CONTRACT_ARTIFACTS,
  buildPastaPublishPinningProof,
} from "./pasta-proof";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const HOST = "wtf-admin.wtfos.me";
const REPO_DID = `did:web:${HOST}`;
const WALLET = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const PUBLISHED_AT = "2026-07-01T00:00:00.000Z";

function contractArtifacts() {
  return PASTA_PINNING_CONTRACT_ARTIFACTS.map((artifact) => ({
    ...artifact,
    bytes: readFileSync(path.join(REPO_ROOT, artifact.sourcePath)),
  }));
}

test("Pasta publish pinning proof covers artifacts, metadata, files, redundancy, accessibility, and recovery", () => {
  const proof = buildPastaPublishPinningProof({
    host: HOST,
    repoDid: REPO_DID,
    walletAddress: WALLET,
    publishedAt: PUBLISHED_AT,
    pages: buildPastaHostedPageSnapshots(),
    contractArtifacts: contractArtifacts(),
  });

  const policy = validateLexiconRecord<MediaPinPolicy>("app.wtfos.media.pinPolicy", proof.policyRecord);
  assert.equal(policy.scopeType, "project_bundle");
  assert.equal(policy.publicDiscovery, true);
  assert.equal(policy.scopeRef, `pasta-protocol:shadownet:${HOST}`);
  assert.equal(policy.walletAddress, WALLET);
  assert.deepEqual(policy.subdomainRefs, [{ kind: "wtfos.me", host: HOST }]);

  const manifest = validateLexiconRecord<MediaPinManifest>("app.wtfos.media.pinManifest", proof.manifestRecord);
  assert.equal(manifest.scopeType, "project_bundle");
  assert.equal(manifest.itemCount, proof.itemRecords.length);
  assert.equal(manifest.storageRef.porcupinProviderKey, "wtfos-porcupin-hetzner");
  assert.match(manifest.storageRef.s3Key ?? "", /pasta-protocol-shadownet\.json$/);
  assert.match(manifest.storageRef.checksumSha256 ?? "", /^[a-f0-9]{64}$/);

  for (const record of proof.itemRecords) {
    const item = validateLexiconRecord<MediaPinItem>("app.wtfos.media.pinItem", record);
    assert.equal(item.scopeType, "project_bundle");
    assert.match(item.cid, /^bafybeipastaproof/);
    assert.equal(item.storageRef.porcupinProviderKey, "wtfos-porcupin-hetzner");
    assert.match(item.storageRef.s3Key ?? "", /ipfs-pinning\/users\/pasta-protocol\/proofs/);
    assert.match(item.storageRef.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
  }

  assert.deepEqual(proof.coverage, {
    artifactPinning: true,
    metadataPinning: true,
    filePinning: true,
    redundancy: true,
    accessibility: true,
    recovery: true,
  });

  const kinds = new Set(proof.manifestPayload.items.map((item) => item.kind));
  assert.deepEqual(
    [...kinds].sort(),
    ["contract_artifact", "hosted_page", "relationship_metadata", "token_metadata"]
  );
  assert.equal(
    proof.manifestPayload.items.filter((item) => item.kind === "contract_artifact").length,
    PASTA_PINNING_CONTRACT_ARTIFACTS.length
  );
  assert.equal(
    proof.manifestPayload.items.filter((item) => item.kind === "hosted_page").length,
    3
  );

  for (const contract of PASTA_WTFME_PROOF_CONTRACTS) {
    assert.match(JSON.stringify(proof.manifestPayload), new RegExp(contract.contract));
    assert.match(JSON.stringify(proof.manifestPayload), new RegExp(contract.relationshipGroup));
  }

  assert.equal(proof.recovery.wellKnownPinsUrl, `https://${HOST}/.well-known/wtfos-pins`);
  assert.equal(proof.recovery.manifestAtUri, `at://${REPO_DID}/app.wtfos.media.pinManifest/pasta-protocol-shadownet`);
  assert.deepEqual(proof.recovery.requiredKinds, [
    "hosted_page",
    "contract_artifact",
    "token_metadata",
    "relationship_metadata",
  ]);

  const serialized = JSON.stringify(proof);
  assert.doesNotMatch(serialized, /X-Amz-Signature=|Bearer\s+|file:\/\//i);
  assert.match(serialized, /https:\/\/ipfs\.io\/ipfs\/bafybeipastaproof/);
  assert.match(serialized, new RegExp(`https://${HOST}/collection`));
});
