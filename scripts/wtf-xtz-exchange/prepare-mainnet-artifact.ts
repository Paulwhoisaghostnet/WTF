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
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-xtz-exchange");
const e2eReportPath = path.join(docsDir, "shadownet-e2e-report.md");
const buildDir = path.join(root, "build", "wtf-xtz-exchange-mainnet");

const mainnetWtfAddress =
  process.env.WTF_MAINNET_FA2_ADDRESS ?? "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const mainnetWtfTokenId = process.env.WTF_MAINNET_TOKEN_ID ?? "0";
const mainnetAdmin = process.env.MAINNET_ADMIN_ADDRESS;
const mainnetTzktApiBase = (process.env.MAINNET_TZKT_API_URL ?? "https://api.tzkt.io/v1").replace(/\/$/, "");
const kt1Pattern = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const tzPattern = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;

type TokenProbe = {
  ok: boolean;
  status: number;
  token?: {
    contract?: { address?: string };
    tokenId?: string;
    standard?: string;
    metadata?: Record<string, unknown>;
    totalSupply?: string;
  };
  text: string;
};

function blocker(message: string): never {
  console.error(`BLOCKED: ${message}`);
  process.exit(2);
}

function nowIso(): string {
  return new Date().toISOString();
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

function writeReadinessReport(params: {
  status: "BLOCKED" | "READY";
  reasons: string[];
  tokenProbe?: TokenProbe;
  manifest?: unknown;
}): void {
  mkdirSync(docsDir, { recursive: true });
  const token = params.tokenProbe?.token;
  writeFileSync(
    path.join(docsDir, "mainnet-readiness-report.md"),
    [
      "# Mainnet Readiness Report",
      "",
      `- Status: ${params.status}`,
      `- Timestamp: ${nowIso()}`,
      `- Network: tezos-mainnet`,
      `- WTF FA2: ${mainnetWtfAddress}`,
      `- WTF token id: ${mainnetWtfTokenId}`,
      `- Native payout asset: XTZ / mutez`,
      `- Admin: ${mainnetAdmin ?? "(missing)"}`,
      "",
      "## Gate Reasons",
      "",
      ...params.reasons.map((reason) => `- ${reason}`),
      "",
      "## WTF Token Probe",
      "",
      "```json",
      JSON.stringify(
        {
          ok: params.tokenProbe?.ok ?? false,
          status: params.tokenProbe?.status ?? null,
          contract: token?.contract?.address,
          tokenId: token?.tokenId,
          standard: token?.standard,
          symbol: token?.metadata?.symbol,
          decimals: token?.metadata?.decimals,
          totalSupply: token?.totalSupply,
        },
        null,
        2,
      ),
      "```",
      "",
      ...(params.manifest
        ? [
            "## Artifact Manifest",
            "",
            "```json",
            JSON.stringify(params.manifest, null, 2),
            "```",
            "",
          ]
        : []),
      "No mainnet origination was attempted by this script.",
      "",
    ].join("\n"),
  );
}

async function fetchMainnetWtfToken(): Promise<TokenProbe> {
  const response = await fetch(
    `${mainnetTzktApiBase}/tokens?contract=${encodeURIComponent(mainnetWtfAddress)}&tokenId=${encodeURIComponent(
      mainnetWtfTokenId,
    )}&limit=1`,
  );
  const text = await response.text();
  let token: TokenProbe["token"] | undefined;
  try {
    token = text ? JSON.parse(text)[0] : undefined;
  } catch {
    token = undefined;
  }
  return {
    ok: response.ok && Boolean(token),
    status: response.status,
    token,
    text,
  };
}

async function main(): Promise<void> {
  const reasons: string[] = [];

  if (!existsSync(e2eReportPath)) {
    reasons.push("Shadownet E2E report is missing. Run `npm run contract:e2e:wtf-xtz:shadownet` first.");
  } else {
    const e2eReport = readFileSync(e2eReportPath, "utf8");
    if (!e2eReport.includes("- Status: PASSED")) {
      reasons.push("Shadownet E2E report is not PASSED.");
    }
  }

  if (!kt1Pattern.test(mainnetWtfAddress)) {
    reasons.push(`WTF_MAINNET_FA2_ADDRESS is not a KT1 address: ${mainnetWtfAddress}`);
  }
  if (!/^\d+$/.test(mainnetWtfTokenId)) {
    reasons.push(`WTF_MAINNET_TOKEN_ID is not a nat: ${mainnetWtfTokenId}`);
  }
  if (!mainnetAdmin) {
    reasons.push("MAINNET_ADMIN_ADDRESS is required for final mainnet storage generation.");
  } else if (!tzPattern.test(mainnetAdmin)) {
    reasons.push(`MAINNET_ADMIN_ADDRESS is not a tz address: ${mainnetAdmin}`);
  }

  const tokenProbe = await fetchMainnetWtfToken();
  const token = tokenProbe.token;
  if (!tokenProbe.ok) {
    reasons.push(`Unable to verify WTF mainnet token through TzKT: HTTP ${tokenProbe.status}.`);
  } else {
    if (token?.contract?.address !== mainnetWtfAddress) {
      reasons.push("TzKT token probe returned a different contract address.");
    }
    if (String(token?.tokenId) !== mainnetWtfTokenId) {
      reasons.push("TzKT token probe returned a different token id.");
    }
    if (String(token?.standard).toLowerCase() !== "fa2") {
      reasons.push(`TzKT token probe standard is not FA2: ${String(token?.standard)}`);
    }
    if (String(token?.metadata?.symbol ?? "").toUpperCase() !== "WTF") {
      reasons.push(`TzKT token symbol is not WTF: ${String(token?.metadata?.symbol ?? "")}`);
    }
    if (String(token?.metadata?.decimals ?? "") !== "8") {
      reasons.push(`TzKT token decimals are not 8: ${String(token?.metadata?.decimals ?? "")}`);
    }
  }

  if (reasons.length > 0) {
    writeReadinessReport({ status: "BLOCKED", reasons, tokenProbe });
    blocker(reasons.join(" "));
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
        WTF_XTZ_ADMIN: mainnetAdmin!,
        WTF_XTZ_TOKEN_ADDRESS: mainnetWtfAddress,
        WTF_XTZ_TOKEN_ID: mainnetWtfTokenId,
      },
      stdio: "inherit",
    },
  );

  compactMichelsonOutputs(buildDir);

  const scenarioDir = path.join(buildDir, "deploy_wtf_xtz_exchange_template");
  const manifest = {
    generatedAt: nowIso(),
    network: "tezos-mainnet",
    admin: mainnetAdmin,
    wtfTokenAddress: mainnetWtfAddress,
    wtfTokenId: Number(mainnetWtfTokenId),
    nativePayoutAsset: {
      symbol: "XTZ",
      unit: "mutez",
      tokenContract: null,
    },
    requiredCreateListingTerms: ["escrow_mutez", "rate_numerator_mutez", "rate_denominator_wtf_units"],
    requiredSwapTerms: [
      "listing_id",
      "wtf_amount",
      "expected_owner",
      "expected_rate_numerator_mutez",
      "expected_rate_denominator_wtf_units",
      "expected_xtz_out_mutez",
    ],
    contractMichelson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_contract.tz")),
    initialStorageMichelson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_storage.tz")),
    contractJson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_contract.json")),
    initialStorageJson: path.relative(root, path.join(scenarioDir, "step_001_cont_0_storage.json")),
    note: "Mainnet-ready artifact only. Do not originate to mainnet until explicitly instructed by the project owner.",
  };

  writeFileSync(path.join(buildDir, "mainnet-artifact-manifest.json"), JSON.stringify(manifest, null, 2));
  writeReadinessReport({ status: "READY", reasons: ["Mainnet artifact generated; no origination attempted."], tokenProbe, manifest });
  console.log(JSON.stringify(manifest, null, 2));
}

await main();
