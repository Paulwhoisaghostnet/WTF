#!/usr/bin/env node
/**
 * Compile a Pasta Protocol FA2 template to a Micheline contract artifact the static publisher apps can
 * originate client-side via Taquito (`tezos.wallet.originate({ code, storage })`), mirroring the proven
 * Macaroni compile (scripts/macaroni/compile-v2-contract-template.mjs).
 *
 * Default: fa2_mintable -> public/creation-tools/spaghetti/contract/fa2-mintable.contract.json
 *
 * Requires the SmartPy CLI. Install: pip install smartpy (or set SMARTPY_BIN).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

// Default: Pasta's own standard collection FA2 (contracts/pasta-protocol). A second arg may point at a
// different SmartPy source (path relative to repo root); the third arg overrides the artifact slug; the
// fourth arg selects which static app's contract/ dir receives the artifact (default: spaghetti).
const sourceArg = process.argv[2] || "contracts/pasta-protocol/PastaStandardCollectionFA2.py";
const artifactSlug = process.argv[3] || "pasta-standard-collection";
const appDir = process.argv[4] || "spaghetti";

const source = path.isAbsolute(sourceArg) ? sourceArg : path.join(root, sourceArg);
if (!existsSync(source)) {
  console.error(`Template source not found: ${path.relative(root, source)}`);
  process.exit(1);
}
const templateName = path.basename(source, ".py");

const outDir = path.join(root, `build/pasta-fa2/${templateName}`);
const publicContractDir = path.join(root, `public/creation-tools/${appDir}/contract`);
const contractArtifact = path.join(publicContractDir, `${artifactSlug}.contract.json`);
const manifestPath = path.join(publicContractDir, `${artifactSlug}.template.json`);
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
  const found = walk(outDir, suffix).sort();
  const latest = found.at(-1);
  if (!latest) throw new Error(`SmartPy artifact missing: *${suffix}`);
  return latest;
}

function assertJsonContract(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${file} is not a Micheline code array`);
  return parsed;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(publicContractDir, { recursive: true });

try {
  execFileSync(smartpyBin, ["compile", source, outDir], { cwd: root, stdio: "inherit" });
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

const ENTRYPOINTS_BY_TEMPLATE = {
  PastaStandardCollectionFA2: [
    "transfer",
    "update_operators",
    "balance_of",
    "create_token",
    "mint",
    "burn",
    "set_sale",
    "set_sale_active",
    "buy",
    "add_minter",
    "remove_minter",
    "set_token_metadata",
    "transfer_administration",
    "accept_administration",
  ],
  PastaOpenEditionFA2: [
    "transfer",
    "update_operators",
    "balance_of",
    "create_open_edition",
    "set_sale",
    "set_sale_active",
    "lock_sale_policy",
    "open_mint",
    "mint",
    "reserve_mint_capacity",
    "mint_reserved",
    "release_mint_capacity",
    "burn",
    "add_minter",
    "remove_minter",
    "set_token_metadata",
    "transfer_administration",
    "accept_administration",
  ],
  PastaBundleFA2: [
    "transfer",
    "update_operators",
    "balance_of",
    "create_bundle",
    "set_bundle_contents",
    "redeem",
    "set_sale",
    "set_sale_active",
    "buy",
    "mint",
    "burn",
    "add_minter",
    "remove_minter",
    "set_token_metadata",
    "transfer_administration",
    "accept_administration",
  ],
  PastaPackRouterFA2: [
    "transfer",
    "update_operators",
    "balance_of",
    "create_pack",
    "commit_recipe",
    "finalize_pack",
    "open_pack",
    "cancel_pack",
    "recover_asset",
    "recover_adapter",
    "set_pack_contents",
    "mint",
    "set_sale",
    "set_sale_active",
    "buy",
    "add_minter",
    "remove_minter",
    "set_token_metadata",
    "transfer_administration",
    "accept_administration",
  ],
  PastaGenerativeCollectionFA2: [
    "transfer",
    "update_operators",
    "balance_of",
    "create_project",
    "set_project_active",
    "reserve_iteration",
    "finalize_iteration",
    "cancel_expired_reservation",
    "add_pack_minter",
    "remove_pack_minter",
    "reserve_pack_capacity",
    "release_pack_capacity",
    "mint_pack_iteration",
    "transfer_administration",
    "accept_administration",
  ],
  PastaGnocchiPackAdapter: [
    "create_allocation",
    "set_allocation_active",
    "add_router",
    "remove_router",
    "reserve",
    "fulfill",
    "release",
    "transfer_administration",
    "accept_administration",
  ],
  PastaRotiniPackAdapter: [
    "create_resource",
    "set_resource_active",
    "add_router",
    "remove_router",
    "reserve",
    "fulfill",
    "release",
    "transfer_administration",
    "accept_administration",
  ],
  PastaDistributionFA2: [
    "transfer",
    "update_operators",
    "balance_of",
    "create_token",
    "set_allocations",
    "open_claim",
    "claim",
    "airdrop",
    "mint",
    "burn",
    "add_minter",
    "remove_minter",
    "set_token_metadata",
    "transfer_administration",
    "accept_administration",
  ],
  PastaExhibitionRegistry: [
    "add_curator",
    "remove_curator",
    "publish_revision",
    "set_current_revision",
    "set_metadata",
    "transfer_administration",
    "accept_administration",
  ],
};
const entrypoints = ENTRYPOINTS_BY_TEMPLATE[templateName] || [];

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      templateName,
      artifactSlug,
      source: path.relative(root, source),
      compileScript: path.relative(root, fileURLToPath(import.meta.url)),
      smartpyBinaryEnv: "SMARTPY_BIN",
      compiledContract: path.relative(root, contractArtifact),
      storage: {
        note: "Origination storage uses an administrator address, TZIP-16 metadata map, app-specific counters, and empty app-specific big_maps.",
      },
      entrypoints,
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Pasta FA2 contract artifact written to ${path.relative(root, contractArtifact)}`);
console.log(`Pasta FA2 template manifest written to ${path.relative(root, manifestPath)}`);
