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

function remediationFor(name, message, config) {
  switch (name) {
    case "configuration":
      return "Operator: Review environment variables or companion config; resolve configuration errors.";
    case "private-directories":
      return `Operator: Ensure data directory (${config.dataDir}) and private directories exist with secure permissions (chmod 0700).`;
    case "master-key-custody":
      return `Operator: Generate a secure 32-byte master key file at ${config.masterKeyFile} and restrict permissions: chmod 0600 ${config.masterKeyFile}`;
    case "finalizer-key-custody":
      return `Operator: Provide the finalizer Tezos private key in ${config.signerKeyFile} and restrict permissions: chmod 0600 ${config.signerKeyFile}`;
    case "admin-token-custody":
      return `Operator: Generate a secure admin token (>= 32 chars) at ${config.adminTokenFile} and restrict permissions: chmod 0600 ${config.adminTokenFile}`;
    case "sqlite-operation-journal":
      return `Operator: Ensure SQLite journal at ${config.journalPath} can be opened and written.`;
    case "reviewed-contract-artifact":
      return `Operator: Restore or re-sync the reviewed Macaroni contract JSON at ${config.abiPath}.`;
    case "reviewed-storage-template":
      return `Operator: Restore or re-sync the reviewed Macaroni storage template at ${config.storagePath}.`;
    case "compiled-pack-hash-fixture":
      return `Operator: Verify the contract template fixture at ${config.templatePath} is intact and exposes its measured startup funding policy.`;
    case "encrypted-entropy-recovery":
      return "Operator: Entropy recovery self-test failed. Verify master key integrity and file system permissions.";
    case "tezos-rpc-and-finalizer":
      if (message && message.includes("not revealed")) {
        return "Operator: Reveal the finalizer account on Tezos by sending a small transaction from that address.";
      }
      if (message && (message.includes("mutez") || message.includes("startup requires"))) {
        return "Operator: Fund the finalizer account on Tezos to meet the measured startup funding policy.";
      }
      return `Operator: Verify TEZOS_RPC_URL (${config.rpcUrl}) is reachable and responsive to the companion.`;
    case "tzkt-reconciliation-index":
      return `Operator: Verify TZKT_INDEXER_URL (${config.indexerUrl}) is reachable and returning chain head information.`;
    case "objkt-duplicate-cid-index":
      return `Operator: Verify OBJKT_API_URL (${config.duplicateCheckUrl}) is reachable, or configure DUPLICATE_CHECK_MODE=private_full_scan.`;
    case "car-publish-and-public-retrieval":
      return "Operator: Verify IPFS pinning provider credentials and public gateway retrieval.";
    default:
      return null;
  }
}

export async function runDoctor(options = {}) {
  const loaded = options.config
    ? { config: options.config, errors: options.configErrors || [] }
    : loadCompanionConfig(options.env, options.cwd);
  const { config, errors } = loaded;
  const checks = [];
  let measuredFundingPolicy = null;
  const add = (name, ok, detail = null, extra = {}) => {
    const role = extra.role || "operator";
    const remediation = !ok ? (extra.remediation || remediationFor(name, typeof detail === "string" ? detail : (Array.isArray(detail) ? detail.join("; ") : null), config)) : null;
    checks.push({
      name,
      ok,
      role,
      ...(detail ? { detail } : {}),
      ...(remediation ? { remediation } : {}),
      ...extra,
    });
  };
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
  const remediations = checks
    .filter((check) => !check.ok && check.remediation)
    .map((check) => ({
      check: check.name,
      role: check.role || "operator",
      remediation: check.remediation,
      detail: check.detail || null,
    }));
  return {
    schema: "pasta.macaroni-companion-doctor.v1",
    ready,
    config: publicConfig(config),
    checks,
    ...(remediations.length > 0 ? { remediations } : {}),
  };
}
