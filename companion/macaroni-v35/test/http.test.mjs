import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCompanionHttpServer } from "../src/http-service.mjs";

test("HTTP service enforces exact CORS, bearer admin auth, and secret-free responses", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-http-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const token = "local-admin-token-with-more-than-32-bytes";
  const adminTokenFile = path.join(directory, "admin.token");
  await writeFile(adminTokenFile, token, { mode: 0o600 });
  let leak = false;
  let adminLeak = false;
  const projectService = {
    collectorConfiguration: () => ({
      ready: false,
      code: "collector_loopback_not_exportable",
      reason: "Configure a public HTTPS buyer endpoint.",
      publicBaseUrl: "http://127.0.0.1:47835",
      collectorOrigin: "https://drop.test",
    }),
    journal: { getProject: () => ({ contract_address: "KT1-contract" }) },
    publicProjectStatus: () => leak
      ? { state: "ready", nested: { seedPreimage: "must-not-leak" } }
      : { state: "ready", containsSecrets: false },
    adminProject: () => adminLeak
      ? { state: "staging", metadataUri: "ipfs://private-token-metadata" }
      : {
          state: "staging",
          contractMetadataUri: "ipfs://public-contract-metadata",
          publicCoverUri: "ipfs://public-cover",
        },
  };
  const server = await createCompanionHttpServer({
    config: {
      adminTokenFile,
      allowedOrigins: ["https://drop.test"],
      network: "shadownet",
    },
    doctor: { ready: true },
    projectService,
    watcher: {},
    runtime: { wake: async () => undefined },
    logger: { error: () => undefined },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const denied = await fetch(`${base}/v1/public/projects/drop/status`, { headers: { origin: "https://attacker.test" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);

  const unauthorized = await fetch(`${base}/v1/admin/projects/drop`, { headers: { origin: "https://drop.test" } });
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${base}/v1/admin/projects/drop`, {
    headers: { origin: "https://drop.test", authorization: `Bearer ${token}` },
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get("access-control-allow-origin"), "https://drop.test");
  assert.equal((await authorized.json()).contractMetadataUri, "ipfs://public-contract-metadata");

  adminLeak = true;
  const blockedPrivateUri = await fetch(`${base}/v1/admin/projects/drop`, {
    headers: { origin: "https://drop.test", authorization: `Bearer ${token}` },
  });
  assert.equal(blockedPrivateUri.status, 500);
  assert.equal(JSON.stringify(await blockedPrivateUri.json()).includes("private-token-metadata"), false);
  adminLeak = false;

  const readiness = await fetch(`${base}/v1/admin/readiness`, {
    headers: { origin: "https://drop.test", authorization: `Bearer ${token}` },
  });
  assert.equal(readiness.status, 200);
  assert.deepEqual(await readiness.json(), {
    schema: "pasta.macaroni-companion-admin-readiness.v1",
    ready: true,
    network: "shadownet",
    assetStrategies: ["pin_on_claim", "public_prepin_private_manifest"],
    collectorPublishing: {
      ready: false,
      code: "collector_loopback_not_exportable",
      reason: "Configure a public HTTPS buyer endpoint.",
      publicBaseUrl: "http://127.0.0.1:47835",
      collectorOrigin: "https://drop.test",
    },
  });

  const publicStatus = await fetch(`${base}/v1/public/projects/drop/status`, { headers: { origin: "https://drop.test" } });
  assert.equal(publicStatus.status, 200);
  assert.equal(JSON.stringify(await publicStatus.json()).includes("must-not-leak"), false);

  leak = true;
  const blockedLeak = await fetch(`${base}/v1/public/projects/drop/status`, { headers: { origin: "https://drop.test" } });
  assert.equal(blockedLeak.status, 500);
  assert.equal(JSON.stringify(await blockedLeak.json()).includes("must-not-leak"), false);
});
