import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, "docs", "wtf-in-app-market");
const e2eReportPath = path.join(docsDir, "shadownet-e2e-report.md");
const buildDir = path.join(root, "build", "wtf-in-app-market-mainnet");

const mainnetWtfAddress =
  process.env.WTF_MAINNET_FA2_ADDRESS ?? "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const mainnetWtfTokenId = process.env.WTF_MAINNET_TOKEN_ID ?? "0";
const mainnetTreasury =
  process.env.MAINNET_TREASURY_ADDRESS ?? "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";

function blocker(message: string): never {
  console.error(`BLOCKED: ${message}`);
  process.exit(2);
}

function compactMichelsonFile(filePath: string): void {
  const compacted = readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.replace(/[ \t]*#.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  writeFileSync(filePath, `${compacted}\n`);
}

function compactMichelsonOutputs(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      compactMichelsonOutputs(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".tz")) {
      compactMichelsonFile(fullPath);
    }
  }
}

if (!existsSync(e2eReportPath)) {
  blocker("docs/wtf-in-app-market/shadownet-e2e-report.md is missing. Run Shadownet E2E first.");
}

const e2eReport = readFileSync(e2eReportPath, "utf8");
if (!e2eReport.includes("- Status: PASSED")) {
  blocker("Shadownet E2E report is not PASSED. Mainnet artifact generation is intentionally gated.");
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

execFileSync(
  "smartpy",
  [
    "compile",
    path.join(root, "contracts", "wtf-in-app-market", "WtfInAppMarket.py"),
    buildDir,
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      WTF_IN_APP_MARKET_TREASURY: mainnetTreasury,
      WTF_IN_APP_MARKET_TOKEN_ADDRESS: mainnetWtfAddress,
      WTF_IN_APP_MARKET_TOKEN_ID: mainnetWtfTokenId,
    },
    stdio: "inherit",
  },
);

compactMichelsonOutputs(buildDir);

const scenarioDir = path.join(buildDir, "deploy_wtf_in_app_market_template");
const manifest = {
  generatedAt: new Date().toISOString(),
  network: "tezos-mainnet",
  treasury: mainnetTreasury,
  wtfTokenAddress: mainnetWtfAddress,
  wtfTokenId: Number(mainnetWtfTokenId),
  initialListings: [
    { listingId: 0, sku: "pet-food", priceWtfUnits: "1000000000" },
    { listingId: 1, sku: "pet-medicine", priceWtfUnits: "2500000000" },
    { listingId: 2, sku: "shoebox", priceWtfUnits: "5000000000" },
  ],
  contractMichelson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_contract.tz")),
  initialStorageMichelson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_storage.tz")),
  contractJson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_contract.json")),
  initialStorageJson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_storage.json")),
  note: "Do not originate to mainnet until explicitly instructed by the project owner.",
};

writeFileSync(path.join(buildDir, "mainnet-artifact-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
