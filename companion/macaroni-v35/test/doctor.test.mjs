import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runDoctor } from "../src/doctor-lib.mjs";
import { encryptEntropyForKeyring, encryptPrivateBytes, generateEntropyChain } from "../src/crypto-store.mjs";
import { openJournal } from "../src/journal.mjs";

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

test("stopped snapshot restores at its original root and refuses relocated or incomplete private custody", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-restore-"));
  const backup = `${root}-backup`;
  const relocated = `${root}-relocated`;
  t.after(async () => {
    await Promise.all([root, backup, relocated].map((directory) => rm(directory, { recursive: true, force: true })));
  });
  const configFor = (directory) => ({
    dataDir: directory,
    privateAssetDir: path.join(directory, "private-assets"),
    uploadDir: path.join(directory, "uploads"),
    tempDir: path.join(directory, "tmp"),
    journalPath: path.join(directory, "companion.sqlite"),
    masterKeyFile: path.join(directory, "master.key"),
    signerKeyFile: path.join(directory, "finalizer.key"),
    adminTokenFile: path.join(directory, "admin.token"),
    abiPath: fileURLToPath(new URL("../contract/macaroni-v35.contract.json", import.meta.url)),
    storagePath: fileURLToPath(new URL("../contract/macaroni-v35.storage.tz", import.meta.url)),
    templatePath: fileURLToPath(new URL("../contract/macaroni-v35.template.json", import.meta.url)),
    network: "shadownet",
    expectedChainId: "NetXsqzbfFenSTS",
    publicBaseUrl: "https://companion.test",
    rpcTrustMode: "creator_controlled",
    duplicateCheckMode: "private_full_scan",
    pinning: { adapter: "kubo" },
  });
  const config = configFor(root);
  for (const [name, file] of [["abiSha256", config.abiPath], ["storageSha256", config.storagePath], ["templateSha256", config.templatePath]]) {
    config[name] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  await mkdir(config.privateAssetDir, { recursive: true, mode: 0o700 });
  await mkdir(path.join(config.privateAssetDir, "signed-operations"), { recursive: true, mode: 0o700 });
  await Promise.all([
    writeFile(config.masterKeyFile, Buffer.alloc(32, 7), { mode: 0o600 }),
    writeFile(config.signerKeyFile, "isolated-shadownet-test-signer", { mode: 0o600 }),
    writeFile(config.adminTokenFile, "a".repeat(32), { mode: 0o600 }),
  ]);
  const dropRef = "10000000-0000-4000-8000-000000000001";
  const chain = generateEntropyChain(1, () => Buffer.alloc(32, 9));
  const entropy = await encryptEntropyForKeyring({
    chain, dropRef, privateAssetDir: config.privateAssetDir,
    masterKeyFile: config.masterKeyFile, keyVersion: "master-key-v1",
  });
  const journal = openJournal(config.journalPath);
  try {
    journal.createProject({
      dropRef, network: "shadownet", creator: "tz1creator", administrator: "tz1creator",
      treasury: "tz1treasury", physicalSupply: 1, assetStrategy: "pin_on_claim",
      releasePolicy: { kind: "immediate" }, fulfillmentSubsidyMutez: 1000,
      entropyHead: chain.publicHead, entropyLength: chain.chainLength,
      entropyKeyringPath: entropy.encryptedPath, signerAddress: "tz1finalizer",
    });
    journal.attachContract(dropRef, "KT1isolatedtestcontract");
    journal.setProjectState(dropRef, "active");
    const artifactPath = path.join(config.privateAssetDir, `${dropRef}.artifact.car.enc`);
    const metadataPath = path.join(config.privateAssetDir, `${dropRef}.metadata.car.enc`);
    const manifestPath = path.join(config.privateAssetDir, `${dropRef}.manifest.enc`);
    await Promise.all([artifactPath, metadataPath, manifestPath].map((file) => writeFile(file, "isolated-private-fixture", { mode: 0o600 })));
    journal.saveStagedToken({ dropRef, tokenId: 0, quantity: 1, metadataCommitment: "a".repeat(64),
      privateManifestPath: manifestPath, artifactChecksum: "b".repeat(64), artifactEncryptedPath: artifactPath,
      metadataChecksum: "c".repeat(64), metadataEncryptedPath: metadataPath, uploadIds: [] });
    const work = journal.enqueue({ dropRef, workType: "settle_claim", semanticKey: "0:settle_claims_v35", payload: { claimId: 0 } });
    journal.createReadyAttempt({ workItemId: work.id, requestId: `${dropRef}:settle`, intentIdentity: { claimId: 0 },
      expectedPostcondition: { claimId: 0 }, network: "shadownet", signer: "tz1finalizer",
      target: "KT1isolatedtestcontract", entrypoint: "settle_claims_v35", amountMutez: 0 });
    const signed = Buffer.from("isolated-signed-operation", "utf8");
    const signedPath = path.join(config.privateAssetDir, "signed-operations", `${dropRef}.signed.enc`);
    const stored = await encryptPrivateBytes({ plaintext: signed, destinationPath: signedPath,
      masterKeyFile: config.masterKeyFile, keyVersion: "master-key-v1" });
    journal.persistSigned({ workItemId: work.id, operationHash: "isolated-operation", signedBytesPath: signedPath,
      signedBytesSha256: stored.plaintextSha256, branch: "BMisolated", branchLevel: 100, managerCounter: "1" });
  } finally {
    journal.close();
  }

  await cp(root, backup, { recursive: true });
  await rm(root, { recursive: true, force: true });
  await cp(backup, root, { recursive: true });
  const restored = await runDoctor({ config, skipNetwork: true, allowSkippedNetwork: true });
  assert.equal(restored.ready, true, JSON.stringify(restored.checks));
  assert.deepEqual(restored.checks.find((check) => check.name === "stored-private-recovery-custody")?.detail,
    { nonterminalProjects: 1, storedPrivateFiles: 3, unresolvedSignedAttempts: 1 });

  await cp(backup, relocated, { recursive: true });
  const moved = await runDoctor({ config: { ...config, ...configFor(relocated) }, skipNetwork: true, allowSkippedNetwork: true });
  assert.equal(moved.ready, false);
  assert.match(moved.checks.find((check) => check.name === "stored-private-recovery-custody")?.detail || "", /original absolute path/);

  await rm(path.join(root, "private-assets", "signed-operations", `${dropRef}.signed.enc`));
  const incomplete = await runDoctor({ config, skipNetwork: true, allowSkippedNetwork: true });
  assert.equal(incomplete.ready, false);
  assert.match(incomplete.checks.find((check) => check.name === "stored-private-recovery-custody")?.detail || "", /unresolved signed attempt cannot be recovered/);

  await cp(path.join(backup, "private-assets", "signed-operations", `${dropRef}.signed.enc`),
    path.join(root, "private-assets", "signed-operations", `${dropRef}.signed.enc`));
  await rm(path.join(root, "private-assets", `${dropRef}.artifact.car.enc`));
  const missingAsset = await runDoctor({ config, skipNetwork: true, allowSkippedNetwork: true });
  assert.equal(missingAsset.ready, false);
  assert.match(missingAsset.checks.find((check) => check.name === "stored-private-recovery-custody")?.detail || "", /artifact CAR is missing/);
});
