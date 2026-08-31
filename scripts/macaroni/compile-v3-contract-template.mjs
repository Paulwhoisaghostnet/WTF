#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_OPERATION_DATA_LENGTH,
  MIN_OPERATION_HEADROOM,
  measureSignedOriginationOperationBytes,
} from "../pasta-protocol/check-smartpy-origination-size.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "contracts/wtf-collections/MacaroniBlindMintFA2V3.py");
const outDir = path.join(root, "build/macaroni-v3-template");
const scenarioName = "deploy_macaroni_blind_mint_v3_template";
const publicContractDir = path.join(root, "public/creation-tools/macaroni/contract");
const contractArtifact = path.join(publicContractDir, "macaroni-v3.contract.json");
const storageTemplateArtifact = path.join(publicContractDir, "macaroni-v3.storage.tz");
const manifestPath = path.join(publicContractDir, "macaroni-v3.template.json");
const smartpyBin = process.env.SMARTPY_BIN || path.join(root, "scripts/smartpy-cli-wrapper.sh");

function walk(dir, suffix, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, suffix, found);
    else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(full);
  }
  return found;
}

function latestArtifact(suffix) {
  const scenarioDir = path.join(outDir, scenarioName);
  const searchRoot = existsSync(scenarioDir) ? scenarioDir : outDir;
  const found = walk(searchRoot, suffix).sort();
  const latest = found.at(-1);
  if (!latest) throw new Error(`SmartPy artifact missing: *${suffix}`);
  return latest;
}

function assertJsonContract(file) {
  const text = readFileSync(file, "utf8");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(`${file} is not a Micheline code array`);
  return parsed;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(publicContractDir, { recursive: true });

try {
  execFileSync(smartpyBin, ["compile", source, outDir], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SMARTPY_PYTHON: process.env.SMARTPY_PYTHON || "python3",
      SMARTPY_SCENARIO_NAME: scenarioName,
    },
  });
} catch (error) {
  if (error?.code === "ENOENT") {
    console.error(
      `SmartPy compiler not found: ${smartpyBin}. Install SmartPy or set SMARTPY_BIN to the compiler executable.`
    );
    process.exit(1);
  }
  throw error;
}

const compiledContract = latestArtifact("_contract.json");
const compiledCode = assertJsonContract(compiledContract);
copyFileSync(compiledContract, contractArtifact);

const compiledStorageJson = latestArtifact("_storage.json");
const compiledStorage = JSON.parse(readFileSync(compiledStorageJson, "utf8"));
const encodedContract = JSON.stringify(compiledCode);
const requiredEntrypoints = [
  "transfer",
  "balance_of",
  "update_operators",
  "add_tokens_v3",
  "replace_tokens_v3",
  "set_stages",
  "set_allowlist",
  "mint",
  "reveal_tokens_v3",
  "update_minter_royalty_metadata",
  "lock_minter_royalties",
  "set_pause",
  "transfer_administration",
  "accept_administration",
];
for (const entrypoint of requiredEntrypoints) {
  if (!encodedContract.includes(entrypoint)) {
    throw new Error(`Macaroni V3 compiled artifact is missing ${entrypoint}`);
  }
}
const signedOriginationBytes = measureSignedOriginationOperationBytes({
  code: compiledCode,
  storage: compiledStorage,
});
const protocolHeadroomBytes = MAX_OPERATION_DATA_LENGTH - signedOriginationBytes;
if (protocolHeadroomBytes < MIN_OPERATION_HEADROOM) {
  throw new Error(
    `Macaroni V3 signed origination is ${signedOriginationBytes} bytes, leaving only ${protocolHeadroomBytes} bytes below ${MAX_OPERATION_DATA_LENGTH}`
  );
}

let storageArtifact = "";
try {
  storageArtifact = latestArtifact("_storage.tz");
  copyFileSync(storageArtifact, storageTemplateArtifact);
} catch (_) {
  storageArtifact = "";
}

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      templateVersion: "macaroni-commitment-v3",
      source: path.relative(root, source),
      scenario: scenarioName,
      compileScript: path.relative(root, fileURLToPath(import.meta.url)),
      smartpyBinaryEnv: "SMARTPY_BIN",
      compiledContract: path.relative(root, contractArtifact),
      compiledStorageTemplate: storageArtifact ? path.relative(root, storageTemplateArtifact) : "",
      entrypoints: requiredEntrypoints,
      signedOriginationBytes,
      protocolHeadroomBytes,
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Macaroni V3 contract artifact written to ${path.relative(root, contractArtifact)}`);
console.log(`Macaroni V3 template manifest written to ${path.relative(root, manifestPath)}`);
console.log(
  `Macaroni V3 artifact: ${signedOriginationBytes} signed-origination bytes; ${protocolHeadroomBytes} bytes protocol headroom`
);
