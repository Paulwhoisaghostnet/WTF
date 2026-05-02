import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, "docs", "wtf-xtz-exchange");
const e2eReportPath = path.join(docsDir, "shadownet-e2e-report.md");
const buildDir = path.join(root, "build", "wtf-xtz-exchange-mainnet");

const mainnetWtfAddress =
  process.env.WTF_MAINNET_FA2_ADDRESS ?? "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const mainnetWtfTokenId = process.env.WTF_MAINNET_TOKEN_ID ?? "0";
const mainnetAdmin = process.env.MAINNET_ADMIN_ADDRESS;

function blocker(message: string): never {
  console.error(`BLOCKED: ${message}`);
  process.exit(2);
}

if (!existsSync(e2eReportPath)) {
  blocker("docs/wtf-xtz-exchange/shadownet-e2e-report.md is missing. Run Shadownet E2E first.");
}

const e2eReport = readFileSync(e2eReportPath, "utf8");
if (!e2eReport.includes("- Status: PASSED")) {
  blocker("Shadownet E2E report is not PASSED. Mainnet artifact generation is intentionally gated.");
}

if (!mainnetAdmin) {
  blocker("MAINNET_ADMIN_ADDRESS is required for final storage generation.");
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

execFileSync(
  "smartpy",
  [
    "compile",
    path.join(root, "contracts", "wtf-xtz-exchange", "WtfXtzExchange.py"),
    buildDir,
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      WTF_XTZ_ADMIN: mainnetAdmin,
      WTF_XTZ_TOKEN_ADDRESS: mainnetWtfAddress,
      WTF_XTZ_TOKEN_ID: mainnetWtfTokenId,
    },
    stdio: "inherit",
  },
);

const scenarioDir = path.join(buildDir, "deploy_wtf_xtz_exchange_template");
const manifest = {
  generatedAt: new Date().toISOString(),
  network: "tezos-mainnet",
  admin: mainnetAdmin,
  wtfTokenAddress: mainnetWtfAddress,
  wtfTokenId: Number(mainnetWtfTokenId),
  contractMichelson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_contract.tz")),
  initialStorageMichelson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_storage.tz")),
  contractJson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_contract.json")),
  initialStorageJson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_storage.json")),
  note: "Do not originate to mainnet until explicitly instructed by the project owner.",
};

writeFileSync(path.join(buildDir, "mainnet-artifact-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
