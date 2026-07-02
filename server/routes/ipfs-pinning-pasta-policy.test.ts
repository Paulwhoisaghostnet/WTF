import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("server/routes/ipfs-pinning.ts", "utf8");
const serviceSource = readFileSync("server/features/ipfs-pinning/service.ts", "utf8");

test("Pasta project-bundle pin publish route is permission-gated", () => {
  assert.match(routeSource, /publishPastaProjectBundlePinning/);
  assert.match(routeSource, /"\/api\/ipfs-pinning\/pasta-protocol\/publish"/);
  assert.match(
    routeSource,
    /"\/api\/ipfs-pinning\/pasta-protocol\/publish",\s*requirePermission\("use_wtfos_pinning"\)/
  );
  assert.match(routeSource, /res\.status\(201\)\.json\(await publishPastaProjectBundlePinning\(user\)\)/);
});

test("Pasta project-bundle pin publish fails closed before live writes", () => {
  assert.match(serviceSource, /function isTezosWalletAddress/);
  assert.match(serviceSource, /home\.site\.status !== "published"/);
  assert.match(serviceSource, /Set up an active wtfos\.me PDS\/repo/);
  assert.match(serviceSource, /Link a Tezos wallet before publishing Pasta pin recovery/);
  assert.match(serviceSource, /async function requirePastaObjectStorageReady/);
  assert.match(serviceSource, /"object_storage_required"/);
  assert.match(serviceSource, /"object_storage_unavailable"/);
  const storageGate = serviceSource.indexOf("await requirePastaObjectStorageReady();");
  const artifactLoad = serviceSource.indexOf("const contractArtifacts = await loadPastaContractArtifacts();");
  const policyWrite = serviceSource.indexOf("const policyResult = await savePinPolicy");
  assert.ok(storageGate > -1, "object storage gate should be present");
  assert.ok(artifactLoad > storageGate, "Pasta artifacts should be loaded after storage preflight");
  assert.ok(policyWrite > artifactLoad, "policy write should happen only after publish inputs are assembled");
});

test("Pasta project-bundle pin publish reuses existing manifests instead of duplicating rows", () => {
  assert.match(serviceSource, /async function existingPastaProjectBundleManifest/);
  assert.match(serviceSource, /eq\(ipfsPinningManifests\.scopeType, "project_bundle"\)/);
  assert.match(serviceSource, /inArray\(ipfsPinningManifests\.pdsStatus, \["pending_identity", "queued", "published"\]\)/);
  assert.match(serviceSource, /async function existingPastaPublishResponse/);
  assert.match(serviceSource, /existing: true/);
  assert.match(serviceSource, /"pasta_pinning_publish_in_progress"/);
  assert.match(
    serviceSource,
    /const existingManifest = await existingPastaProjectBundleManifest\(user\.id, scopeRef\);[\s\S]*?return existingPastaPublishResponse\(\{ user, home, manifest: existingManifest \}\);[\s\S]*?await requirePastaObjectStorageReady\(\);/
  );
});

test("Pasta project-bundle pin publish writes a mirrored recovery bundle", () => {
  assert.match(serviceSource, /buildPastaHostedPageSnapshots/);
  assert.match(serviceSource, /PASTA_PINNING_CONTRACT_ARTIFACTS/);
  assert.match(serviceSource, /buildPastaPinSourceItems/);
  assert.match(serviceSource, /source: "pasta_protocol"/);
  assert.match(serviceSource, /scopeType: "project_bundle"/);
  assert.match(serviceSource, /sourceChain: "tezos-shadownet"/);
  assert.match(serviceSource, /"object_mirror_required"/);
  assert.match(serviceSource, /await enqueueManifestRecord/);
  assert.match(serviceSource, /await upsertSubdomainBinding/);
  assert.match(serviceSource, /PINNING_EVENTS\.restoreProofCreated/);
});
