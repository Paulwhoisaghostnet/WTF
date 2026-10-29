import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runDoctor } from "../src/doctor-lib.mjs";

test("offline doctor proves local custody, journal, reviewed ABI, and SmartPy fixture", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-doctor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const masterKeyFile = path.join(directory, "master.key");
  const signerKeyFile = path.join(directory, "signer.key");
  const adminTokenFile = path.join(directory, "admin.token");
  await Promise.all([
    writeFile(masterKeyFile, Buffer.alloc(32, 1), { mode: 0o600 }),
    writeFile(signerKeyFile, "unencrypted-test-signer-placeholder", { mode: 0o600 }),
    writeFile(adminTokenFile, "a".repeat(32), { mode: 0o600 }),
  ]);
  const abiPath = new URL("../contract/macaroni-v35.contract.json", import.meta.url);
  const storagePath = new URL("../contract/macaroni-v35.storage.tz", import.meta.url);
  const templatePath = new URL("../contract/macaroni-v35.template.json", import.meta.url);
  const config = {
    dataDir: directory,
    privateAssetDir: path.join(directory, "private-assets"),
    uploadDir: path.join(directory, "uploads"),
    tempDir: path.join(directory, "tmp"),
    journalPath: path.join(directory, "journal.sqlite"),
    masterKeyFile,
    signerKeyFile,
    adminTokenFile,
    abiPath: fileURLToPath(abiPath),
    storagePath: fileURLToPath(storagePath),
    templatePath: fileURLToPath(templatePath),
    abiSha256: createHash("sha256").update(await readFile(abiPath)).digest("hex"),
    storageSha256: createHash("sha256").update(await readFile(storagePath)).digest("hex"),
    templateSha256: createHash("sha256").update(await readFile(templatePath)).digest("hex"),
    network: "shadownet",
    expectedChainId: "NetXsqzbfFenSTS",
    publicBaseUrl: "https://companion.test",
    rpcTrustMode: "creator_controlled",
    duplicateCheckMode: "private_full_scan",
    pinning: { adapter: "kubo" },
  };
  const report = await runDoctor({ config, skipNetwork: true, allowSkippedNetwork: true });
  assert.equal(report.ready, true, JSON.stringify(report.checks));
  assert.equal(report.checks.find((check) => check.name === "reviewed-contract-artifact")?.ok, true);
  assert.equal(report.checks.find((check) => check.name === "reviewed-storage-template")?.ok, true);
  assert.equal(report.checks.find((check) => check.name === "compiled-pack-hash-fixture")?.ok, true);
});
