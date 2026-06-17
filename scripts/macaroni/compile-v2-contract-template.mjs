#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "contracts/wtf-collections/MacaroniBlindMintFA2V2.py");
const outDir = path.join(root, "build/macaroni-v2-template");
const scenarioName = "deploy_macaroni_blind_mint_v2_template";
const publicContractDir = path.join(root, "public/creation-tools/macaroni/contract");
const contractArtifact = path.join(publicContractDir, "macaroni-v2.contract.json");
const storageTemplateArtifact = path.join(publicContractDir, "macaroni-v2.storage.tz");
const manifestPath = path.join(publicContractDir, "macaroni-v2.template.json");
const smartpyBin = process.env.SMARTPY_BIN || "smartpy";

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
assertJsonContract(compiledContract);
copyFileSync(compiledContract, contractArtifact);

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
      templateVersion: "macaroni-editions-v2",
      source: path.relative(root, source),
      scenario: scenarioName,
      compileScript: path.relative(root, fileURLToPath(import.meta.url)),
      smartpyBinaryEnv: "SMARTPY_BIN",
      compiledContract: path.relative(root, contractArtifact),
      compiledStorageTemplate: storageArtifact ? path.relative(root, storageTemplateArtifact) : "",
      entrypoints: [
        "transfer",
        "balance_of",
        "update_operators",
        "add_tokens_v2",
        "replace_tokens_v2",
        "set_stages",
        "set_allowlist",
        "mint",
        "reveal",
        "update_minter_royalty_metadata",
        "lock_minter_royalties",
        "set_pause",
        "transfer_administration",
        "accept_administration",
      ],
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Macaroni V2 contract artifact written to ${path.relative(root, contractArtifact)}`);
console.log(`Macaroni V2 template manifest written to ${path.relative(root, manifestPath)}`);
