import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { TezosWatcher } from "./adapters/tezos-watcher.mjs";
import { createPinningAdapter } from "./adapters/pinning.mjs";
import { loadCompanionConfig, publicConfig } from "./config.mjs";
import {
  decryptPrivateFile,
  encryptEntropyForKeyring,
  generateEntropyChain,
  recoverEntropyFromKeyring,
  removePrivateFile,
} from "./crypto-store.mjs";
import { openJournal } from "./journal.mjs";
import { stageToCar } from "./private-staging.mjs";
import { verifyCrossLanguageFixture } from "./protocol.mjs";

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function secureFile(filePath, minimumBytes) {
  const [contents, info] = await Promise.all([readFile(filePath), stat(filePath)]);
  const privateMode = process.platform === "win32" || ((info.mode & 0o077) === 0);
  return {
    ok: info.isFile() && contents.byteLength >= minimumBytes && privateMode,
    detail: !info.isFile()
      ? "path is not a regular file"
      : contents.byteLength < minimumBytes
        ? `file must contain at least ${minimumBytes} bytes`
        : !privateMode
          ? "file must not be group/world accessible"
          : null,
  };
}

function requireCurrentPrivatePath(filePath, privateDir, label) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error(`${label} has no absolute private custody path`);
  }
  const relative = path.relative(path.resolve(privateDir), path.resolve(filePath));
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} points outside this Companion's private data directory; restore the stopped snapshot to its original absolute path`);
  }
}

async function requireStoredPrivateFile(filePath, privateDir, label) {
  requireCurrentPrivatePath(filePath, privateDir, label);
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("not a regular file");
  } catch {
    throw new Error(`${label} is missing from this stopped snapshot`);
  }
}

export async function runDoctor(options = {}) {
  const loaded = options.config
    ? { config: options.config, errors: options.configErrors || [] }
    : loadCompanionConfig(options.env, options.cwd);
  const { config, errors } = loaded;
  const checks = [];
  let measuredFundingPolicy = null;
  const add = (name, ok, detail = null, extra = {}) => checks.push({ name, ok, ...(detail ? { detail } : {}), ...extra });
  const attempt = async (name, callback) => {
    try {
      const detail = await callback();
      add(name, true, detail || null);
      return detail;
    } catch (error) {
      add(name, false, error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  add("configuration", errors.length === 0, errors.length > 0 ? errors : null);
  await attempt("private-directories", async () => {
    await Promise.all([
      mkdir(config.privateAssetDir, { recursive: true, mode: 0o700 }),
      mkdir(config.uploadDir, { recursive: true, mode: 0o700 }),
      mkdir(config.tempDir, { recursive: true, mode: 0o700 }),
    ]);
    await access(config.dataDir, constants.R_OK | constants.W_OK);
  });
  await attempt("master-key-custody", async () => {
    const result = await secureFile(config.masterKeyFile, 32);
    if (!result.ok) throw new Error(result.detail);
  });
  await attempt("finalizer-key-custody", async () => {
    const result = await secureFile(config.signerKeyFile, 1);
    if (!result.ok) throw new Error(result.detail);
  });
  await attempt("admin-token-custody", async () => {
    const result = await secureFile(config.adminTokenFile, 32);
    if (!result.ok) throw new Error(result.detail);
  });
  await attempt("sqlite-operation-journal", async () => {
    const journal = openJournal(config.journalPath);
    journal.close();
  });
  await attempt("stored-private-recovery-custody", async () => {
    const journal = openJournal(config.journalPath);
    try {
      const projects = journal.db.prepare("SELECT drop_ref, entropy_head, entropy_length, entropy_keyring_path FROM companion_projects WHERE state != 'complete'").all();
      for (const project of projects) {
        requireCurrentPrivatePath(project.entropy_keyring_path, config.privateAssetDir, `project ${project.drop_ref} entropy`);
        try {
          await recoverEntropyFromKeyring({
            encryptedPath: project.entropy_keyring_path,
            masterKeyFile: config.masterKeyFile,
            expectedHead: project.entropy_head,
            expectedLength: project.entropy_length,
          });
        } catch {
          throw new Error(`project ${project.drop_ref} entropy cannot be recovered from this stopped snapshot`);
        }
      }
      const privateFiles = [
        ...journal.db.prepare(`SELECT p.drop_ref, 'uploaded asset' AS kind, u.encrypted_path AS file_path
          FROM private_uploads u JOIN companion_projects p ON p.drop_ref = u.drop_ref
          WHERE p.state != 'complete' AND u.state = 'uploaded'`).all().map((row) => ({ ...row, directory: config.uploadDir })),
        ...journal.db.prepare(`SELECT p.drop_ref, 'token manifest' AS kind, t.private_manifest_path AS file_path
          FROM token_inventory t JOIN companion_projects p ON p.drop_ref = t.drop_ref
          WHERE p.state != 'complete'`).all().map((row) => ({ ...row, directory: config.privateAssetDir })),
        ...journal.db.prepare(`SELECT p.drop_ref, a.kind || ' CAR' AS kind, a.encrypted_car_path AS file_path
          FROM custodied_assets a JOIN companion_projects p ON p.drop_ref = a.drop_ref
          WHERE p.state != 'complete'`).all().map((row) => ({ ...row, directory: config.privateAssetDir })),
        ...journal.db.prepare(`SELECT p.drop_ref, a.kind || ' CAR' AS kind, a.encrypted_car_path AS file_path
          FROM token_aux_assets a JOIN companion_projects p ON p.drop_ref = a.drop_ref
          WHERE p.state != 'complete'`).all().map((row) => ({ ...row, directory: config.privateAssetDir })),
      ];
      for (const item of privateFiles) {
        await requireStoredPrivateFile(item.file_path, item.directory, `project ${item.drop_ref} ${item.kind}`);
      }
      const attempts = journal.db.prepare(`SELECT w.drop_ref, a.signed_bytes_path, a.signed_bytes_sha256
        FROM signed_operation_attempts a
        JOIN operation_journal o ON o.id = a.operation_journal_id
        JOIN work_items w ON w.id = o.work_item_id
        WHERE a.state IN ('signed', 'submitted')`).all();
      for (const attemptRow of attempts) {
        requireCurrentPrivatePath(attemptRow.signed_bytes_path, path.join(config.privateAssetDir, "signed-operations"), `project ${attemptRow.drop_ref} signed attempt`);
        try {
          const signedBytes = await decryptPrivateFile({
            encryptedPath: attemptRow.signed_bytes_path,
            masterKeyFile: config.masterKeyFile,
          });
          if (createHash("sha256").update(signedBytes).digest("hex") !== attemptRow.signed_bytes_sha256) {
            throw new Error("signed bytes changed");
          }
        } catch {
          throw new Error(`project ${attemptRow.drop_ref} unresolved signed attempt cannot be recovered from this stopped snapshot`);
        }
      }
      return { nonterminalProjects: projects.length, storedPrivateFiles: privateFiles.length, unresolvedSignedAttempts: attempts.length };
    } finally {
      journal.close();
    }
  });

  await attempt("reviewed-contract-artifact", async () => {
    const [fileDigest, text] = await Promise.all([sha256File(config.abiPath), readFile(config.abiPath, "utf8")]);
    if (fileDigest !== config.abiSha256) throw new Error("artifact hash does not match the configured reviewed SHA-256");
    const artifact = JSON.parse(text);
    const encoded = JSON.stringify(artifact);
    if (!Array.isArray(artifact)
      || !["%append_token_slots_v35", "%arm_fulfillment", "%close_sale", "%settle_claims_v35"].every((entrypoint) => encoded.includes(entrypoint))) {
      throw new Error("artifact does not expose every required V3.5 setup, handshake, close, and settlement entrypoint");
    }
    return { sha256: fileDigest };
  });
  await attempt("reviewed-storage-template", async () => {
    const fileDigest = await sha256File(config.storagePath);
    if (fileDigest !== config.storageSha256) throw new Error("storage hash does not match the configured reviewed SHA-256");
    const storageText = await readFile(config.storagePath, "utf8");
    if (!storageText.trim()) throw new Error("reviewed storage template is empty");
    return { sha256: fileDigest };
  });
  await attempt("compiled-pack-hash-fixture", async () => {
    const [templateDigest, templateText] = await Promise.all([
      sha256File(config.templatePath),
      readFile(config.templatePath, "utf8"),
    ]);
    if (templateDigest !== config.templateSha256) {
      throw new Error("template hash does not match the configured reviewed SHA-256");
    }
    const template = JSON.parse(templateText);
    measuredFundingPolicy = template.measuredFundingPolicy;
    if (!Number.isSafeInteger(measuredFundingPolicy?.fiveSettlementStartupMutez)
      || measuredFundingPolicy.fiveSettlementStartupMutez <= 0) {
      throw new Error("reviewed template omits its measured five-settlement funding policy");
    }
    return { sha256: templateDigest, ...verifyCrossLanguageFixture(template), measuredFundingPolicy };
  });
  await attempt("encrypted-entropy-recovery", async () => {
    const chain = generateEntropyChain(1);
    const encrypted = await encryptEntropyForKeyring({
      chain,
      dropRef: `doctor-${randomUUID()}`,
      privateAssetDir: config.tempDir,
      masterKeyFile: config.masterKeyFile,
      keyVersion: "master-key-v1",
    });
    try {
      const recovered = await recoverEntropyFromKeyring({
        encryptedPath: encrypted.encryptedPath,
        masterKeyFile: config.masterKeyFile,
        expectedHead: chain.publicHead,
        expectedLength: chain.chainLength,
      });
      if (recovered.publicHead !== chain.publicHead || recovered.preimages[0] !== chain.preimages[0]) {
        throw new Error("entropy recovery changed the committed chain");
      }
    } finally {
      await removePrivateFile(encrypted.encryptedPath);
    }
  });

  let watcher = options.watcher || null;
  if (options.skipNetwork) {
    add("tezos-rpc-and-finalizer", Boolean(options.allowSkippedNetwork), "network check skipped", { skipped: true });
    add("tzkt-reconciliation-index", Boolean(options.allowSkippedNetwork), "network check skipped", { skipped: true });
    add("objkt-duplicate-cid-index", Boolean(options.allowSkippedNetwork), "network check skipped", { skipped: true });
    add("car-publish-and-public-retrieval", Boolean(options.allowSkippedNetwork), "network check skipped", { skipped: true });
  } else {
    await attempt("tezos-rpc-and-finalizer", async () => {
      watcher ||= new TezosWatcher({
        rpcUrl: config.rpcUrl,
        indexerUrl: config.indexerUrl,
        duplicateCheckUrl: config.duplicateCheckUrl,
        duplicateCheckMode: config.duplicateCheckMode,
        network: config.network,
        expectedChainId: config.expectedChainId,
        signerKeyFile: config.signerKeyFile,
        abiPath: config.abiPath,
        fetchImpl: options.fetchImpl,
      });
      const initialized = await watcher.initialize();
      const blockTimingMs = await watcher.blockTimingMs();
      const funding = await watcher.finalizerFunding(measuredFundingPolicy.fiveSettlementStartupMutez);
      if (!funding.revealed) throw new Error("Finalizer account is not revealed on Tezos");
      if (!funding.sufficient) {
        throw new Error(`Finalizer has ${funding.balanceMutez} mutez; measured startup requires at least ${funding.requiredMutez} mutez before the per-drop arm estimate`);
      }
      return {
        chainId: initialized.chainId,
        finalizer: initialized.signerAddress,
        minimalBlockDelayMs: blockTimingMs,
        finalizerBalanceMutez: funding.balanceMutez.toString(),
        measuredStartupMutez: funding.requiredMutez.toString(),
      };
    });
    await attempt("tzkt-reconciliation-index", async () => {
      const response = await (options.fetchImpl || fetch)(`${config.indexerUrl}/head`);
      if (!response.ok) throw new Error(`TzKT head probe failed with HTTP ${response.status}`);
      const head = await response.json();
      if (!Number.isSafeInteger(Number(head?.level))) throw new Error("TzKT head probe omitted a chain level");
      return { level: Number(head.level), attribution: "Data provided by TzKT API" };
    });
    await attempt("objkt-duplicate-cid-index", async () => {
      if (!watcher) throw new Error("Tezos watcher did not initialize");
      return watcher.duplicateIndexProbe();
    });
    await attempt("car-publish-and-public-retrieval", async () => {
      const adapter = options.pinningAdapter || createPinningAdapter(config.pinning);
      const root = await mkdtemp(path.join(tmpdir(), "macaroni-v35-doctor-"));
      const carPath = path.join(root, "readiness.car");
      try {
        const staged = await stageToCar({
          source: Readable.from(Buffer.from("macaroni-v35-companion-readiness-v1", "utf8")),
          carPath,
        });
        await adapter.publishCommittedCar({ carPath, expectedCid: staged.cid });
        await adapter.verifyPublishedCid(staged.cid);
        return { committedProbeRetrieved: true };
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  const ready = checks.every((check) => check.ok);
  return {
    schema: "pasta.macaroni-companion-doctor.v1",
    ready,
    config: publicConfig(config),
    checks,
  };
}
