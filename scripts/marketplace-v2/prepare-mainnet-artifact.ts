import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

import { CODEC, getCodec, ProtocolsHash } from "@taquito/local-forging";

const MAX_OPERATION_DATA_LENGTH = 32_768;
const MIN_OPERATION_HEADROOM = 1_024;
const BRANCH_BYTES = 32;
const SIGNATURE_BYTES = 64;

function measureSignedOriginationOperationBytes(input: {
  code: unknown[];
  storage: unknown;
}): number {
  const encodedContents = getCodec(
    CODEC.OP_ORIGINATION,
    ProtocolsHash.PsUshuai9,
  ).encoder({
    kind: "origination",
    source: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    fee: "10000",
    counter: "99999999",
    gas_limit: "1040000",
    storage_limit: "60000",
    balance: "0",
    delegate: null,
    script: { code: input.code, storage: input.storage },
  });
  return encodedContents.length / 2 + BRANCH_BYTES + SIGNATURE_BYTES;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(
  root,
  ".agents",
  "docs",
  "archive",
  "contracts",
  "wtf-marketplace-v2",
);
const shadownetReportPath = path.join(
  docsDir,
  "shadownet-existing-e2e-report.md",
);
const buildDir = path.join(root, "build", "wtf-marketplace-v2-mainnet");

const mainnetRpc = (
  process.env.TEZOS_MAINNET_RPC_URL ?? "https://tezos-mainnet.octez.io/"
).replace(/\/+$/, "");
const shadownetRpc = (
  process.env.TEZOS_SHADOWNET_RPC_URL ?? "https://tezos-shadownet.octez.io/"
).replace(/\/+$/, "");
const mainnetAdmin = (process.env.MARKETPLACE_V2_MAINNET_ADMIN ?? "").trim();
const mainnetWtfAddress =
  process.env.WTF_MAINNET_FA2_ADDRESS ??
  "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const mainnetWtfTokenId = process.env.WTF_MAINNET_TOKEN_ID ?? "0";
const shadownetMarketplace =
  process.env.WTF_E2E_MARKETPLACE_V2_ADDRESS ??
  "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const legacyMainnetMarketplace =
  process.env.LEGACY_MARKETPLACE_CONTRACT_ADDRESS ??
  "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj";

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
    if (entry.isDirectory()) compactMichelsonOutputs(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".tz")) {
      compactMichelsonFile(fullPath);
    }
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function canonicalCodeBytes(code: unknown[]): string {
  const sections = [...code].sort((left: any, right: any) =>
    String(left?.prim ?? "").localeCompare(String(right?.prim ?? "")),
  );
  return JSON.stringify(canonicalize(sections));
}

function codeSha256(code: unknown[]): string {
  return createHash("sha256").update(canonicalCodeBytes(code)).digest("hex");
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { "user-agent": "wtfos-marketplace-v2-mainnet-preflight" },
  });
  const text = await response.text();
  if (!response.ok) {
    blocker(`${url} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    blocker(`${url} returned invalid JSON`);
  }
}

if (!existsSync(shadownetReportPath)) {
  blocker(
    ".agents/docs/archive/contracts/wtf-marketplace-v2/shadownet-existing-e2e-report.md is missing",
  );
}
const shadownetReport = readFileSync(shadownetReportPath, "utf8");
if (!shadownetReport.includes("- Status: PASSED")) {
  blocker("Marketplace V2 Shadownet E2E report is not PASSED");
}
if (!shadownetReport.includes(shadownetMarketplace)) {
  blocker("Shadownet E2E report does not name the configured Marketplace V2");
}
if (!/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(mainnetAdmin)) {
  blocker(
    "MARKETPLACE_V2_MAINNET_ADMIN must name the mainnet contract-admin wallet",
  );
}
if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(mainnetWtfAddress)) {
  blocker("WTF_MAINNET_FA2_ADDRESS must be a valid KT1 address");
}
if (!/^\d+$/.test(mainnetWtfTokenId)) {
  blocker("WTF_MAINNET_TOKEN_ID must be a nat");
}

const [mainnetMetadata, shadownetMetadata, shadownetScript] =
  await Promise.all([
    fetchJson(`${mainnetRpc}/chains/main/blocks/head/metadata`),
    fetchJson(`${shadownetRpc}/chains/main/blocks/head/metadata`),
    fetchJson(
      `${shadownetRpc}/chains/main/blocks/head/context/contracts/${shadownetMarketplace}/script`,
    ),
  ]);
if (!mainnetMetadata?.protocol || mainnetMetadata.protocol !== shadownetMetadata?.protocol) {
  blocker(
    `Mainnet/Shadownet protocol mismatch: ${mainnetMetadata?.protocol ?? "missing"} vs ${shadownetMetadata?.protocol ?? "missing"}`,
  );
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
execFileSync(
  "smartpy",
  [
    "compile",
    path.join(root, "contracts", "WTFMarketplaceV2.py"),
    buildDir,
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      SMARTPY_SCENARIO_NAME: "deploy_wtf_marketplace_v2_mainnet",
      MARKETPLACE_V2_ADMIN: mainnetAdmin,
      MARKETPLACE_V2_WTF_TOKEN_ADDRESS: mainnetWtfAddress,
      MARKETPLACE_V2_WTF_TOKEN_ID: mainnetWtfTokenId,
    },
    stdio: "inherit",
  },
);
compactMichelsonOutputs(buildDir);

const contractJsonPath = path.join(
  buildDir,
  "step_001_cont_0_contract.json",
);
const storageJsonPath = path.join(
  buildDir,
  "step_001_cont_0_storage.json",
);
const contractMichelsonPath = path.join(
  buildDir,
  "step_001_cont_0_contract.tz",
);
const storageMichelsonPath = path.join(
  buildDir,
  "step_001_cont_0_storage.tz",
);
for (const requiredPath of [
  contractJsonPath,
  storageJsonPath,
  contractMichelsonPath,
  storageMichelsonPath,
]) {
  if (!existsSync(requiredPath)) blocker(`Compiled artifact missing: ${requiredPath}`);
}

const code = JSON.parse(readFileSync(contractJsonPath, "utf8"));
const storage = JSON.parse(readFileSync(storageJsonPath, "utf8"));
if (!Array.isArray(code)) blocker("Compiled Marketplace V2 code is not a Micheline array");
const compiledCodeSha256 = codeSha256(code);
const shadownetCodeSha256 = codeSha256(shadownetScript?.code ?? []);
if (compiledCodeSha256 !== shadownetCodeSha256) {
  blocker(
    `Current source does not match the Shadownet-proven contract: ${compiledCodeSha256} vs ${shadownetCodeSha256}`,
  );
}

const signedOriginationBytes = measureSignedOriginationOperationBytes({
  code,
  storage,
});
const operationHeadroomBytes =
  MAX_OPERATION_DATA_LENGTH - signedOriginationBytes;
if (operationHeadroomBytes < MIN_OPERATION_HEADROOM) {
  blocker(
    `Marketplace V2 origination leaves only ${operationHeadroomBytes} bytes of operation headroom`,
  );
}

const manifest = {
  generatedAt: new Date().toISOString(),
  network: "tezos-mainnet",
  protocol: mainnetMetadata.protocol,
  rpc: mainnetRpc,
  deployerWalletId: "wtf-os-root",
  adminWalletId: "contract-admin",
  adminAddress: mainnetAdmin,
  wtfTokenAddress: mainnetWtfAddress,
  wtfTokenId: Number(mainnetWtfTokenId),
  legacyMarketplaceAddress: legacyMainnetMarketplace,
  legacyPolicy: "preserve-live-unmodified-for-human-recovery",
  shadownetProof: {
    contractAddress: shadownetMarketplace,
    report: path.relative(root, shadownetReportPath),
    canonicalCodeSha256: shadownetCodeSha256,
  },
  artifact: {
    contractMichelson: path.relative(root, contractMichelsonPath),
    initialStorageMichelson: path.relative(root, storageMichelsonPath),
    contractJson: path.relative(root, contractJsonPath),
    initialStorageJson: path.relative(root, storageJsonPath),
    canonicalCodeSha256: compiledCodeSha256,
    signedOriginationBytes,
    operationHeadroomBytes,
    maxOperationDataLength: MAX_OPERATION_DATA_LENGTH,
  },
  postOriginationGate: [
    "verify applied origination and exact KT1",
    "compare live canonical code hash",
    "verify admin/WTF token storage",
    "pause and unpause through contract-admin",
    "restore production signer origination-disabled policy",
  ],
};

writeFileSync(
  path.join(buildDir, "mainnet-artifact-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify(manifest, null, 2));
