import assert from "node:assert/strict";
import test from "node:test";
import {
  asFileManagerArray,
  resolveIpfsGatewayPolicy,
  resolveMediaServiceContract,
  resolveProjectBundleManifest,
} from "./file-manager-model";

test("File Manager falls back from auth error envelopes to local doctrine contracts", () => {
  assert.deepEqual(asFileManagerArray({ error: "Not authenticated" }), []);

  const projectBundleManifest = resolveProjectBundleManifest({
    error: "Not authenticated",
  });
  assert.ok(projectBundleManifest.sections.length > 0);

  const mediaServiceContract = resolveMediaServiceContract({
    error: "Not authenticated",
  });
  assert.ok(mediaServiceContract.capabilities.length > 0);

  const ipfsGatewayPolicy = resolveIpfsGatewayPolicy({
    error: "Not authenticated",
  });
  assert.ok(ipfsGatewayPolicy.gateways.length > 0);
});
