import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildInAppMarketAssertions,
  summarizeKilnAssertionResult,
} from "../kiln/e2e-assertions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-in-app-market");
const buildDir = path.join(root, "build", "wtf-in-app-market-kiln");
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN;
const e2eMintAmountWtfUnits = "100000000000";
const e2ePurchaseAmountWtfUnits = "1000000000";
const e2ePurchaseStepLabel = "Buyer purchases pet food";

type Wallet = "A" | "B";

type ApiResult = {
  status: number;
  ok: boolean;
  text: string;
  json: any;
};

function nowIso(): string {
  return new Date().toISOString();
}

function jsonPreview(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function writeReport(fileName: string, content: string): void {
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(path.join(docsDir, fileName), content);
}

async function api(
  method: "GET" | "POST",
  route: string,
  body?: unknown,
  token = kilnToken,
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["x-kiln-token"] = token;
  const response = await fetch(`${apiBase}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, ok: response.ok, text, json };
}

function runSmartPyCompile(params: {
  source: string;
  outDir: string;
  env: Record<string, string>;
}): void {
  rmSync(params.outDir, { recursive: true, force: true });
  mkdirSync(params.outDir, { recursive: true });
  execFileSync("smartpy", ["compile", params.source, params.outDir], {
    cwd: root,
    env: { ...process.env, ...params.env },
    stdio: "inherit",
  });
}

function compactMichelson(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/[ \t]*#.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function compiledArtifact(outDir: string, scenarioName: string): { code: string; storage: string } {
  const scenarioDir = path.join(outDir, scenarioName);
  if (!existsSync(scenarioDir)) {
    throw new Error(`SmartPy scenario output missing: ${scenarioDir}`);
  }
  const contractFile = readdirSync(scenarioDir)
    .filter((file) => /^step_\d+_cont_0_contract\.tz$/.test(file))
    .sort()
    .at(-1);
  if (!contractFile) {
    throw new Error(`SmartPy contract output missing in ${scenarioDir}`);
  }
  const prefix = contractFile.replace("_contract.tz", "");
  const storageFile = `${prefix}_storage.tz`;
  const codePath = path.join(scenarioDir, contractFile);
  const storagePath = path.join(scenarioDir, storageFile);
  if (!existsSync(storagePath)) {
    throw new Error(`SmartPy storage output missing: ${storagePath}`);
  }
  return {
    code: compactMichelson(readFileSync(codePath, "utf8")),
    storage: compactMichelson(readFileSync(storagePath, "utf8")),
  };
}

async function workflowAndDeploy(params: {
  label: string;
  code: string;
  storage: string;
  wallet: Wallet;
}): Promise<{ contractAddress: string; workflow: any; upload: any }> {
  const workflowPayload = {
    networkId,
    sourceType: "michelson",
    source: params.code,
    initialStorage: params.storage,
    simulationSteps: [],
  };
  const workflow = await api("POST", "/api/kiln/workflow/run", workflowPayload);
  if (!workflow.ok || !workflow.json?.success) {
    throw new Error(
      `${params.label} Kiln workflow failed with HTTP ${workflow.status}: ${
        workflow.text || "(empty body)"
      }`,
    );
  }
  if (!workflow.json?.clearance?.approved) {
    throw new Error(`${params.label} Kiln workflow did not approve deployment: ${workflow.text}`);
  }

  const uploadPayload: Record<string, unknown> = {
    networkId,
    code: workflow.json.artifacts?.michelson ?? params.code,
    initialStorage: workflow.json.artifacts?.initialStorage ?? params.storage,
    wallet: params.wallet,
  };
  const clearanceId = workflow.json.clearance?.record?.id;
  if (clearanceId) uploadPayload.clearanceId = clearanceId;

  const upload = await api("POST", "/api/kiln/upload", uploadPayload);
  if (!upload.ok || !upload.json?.success || !upload.json?.contractAddress) {
    throw new Error(
      `${params.label} Kiln upload failed with HTTP ${upload.status}: ${
        upload.text || "(empty body)"
      }`,
    );
  }

  return {
    contractAddress: upload.json.contractAddress,
    workflow: workflow.json,
    upload: upload.json,
  };
}

async function runKilnE2E(params: {
  dummyWtfAddress: string;
  marketAddress: string;
  walletAAddress: string;
  walletBAddress: string;
}): Promise<ApiResult> {
  const purchaseRef = `kiln-${Date.now().toString(36)}`;
  const payload = {
    networkId,
    contracts: [
      {
        id: "dummy_wtf",
        address: params.dummyWtfAddress,
        entrypoints: ["mint", "update_operators", "transfer"],
      },
      {
        id: "in_app_market",
        address: params.marketAddress,
        entrypoints: ["purchase"],
      },
    ],
    steps: [
      {
        label: "Mint dummy WTF to buyer",
        wallet: "A",
        targetContractId: "dummy_wtf",
        entrypoint: "mint",
        args: [[{ to_: params.walletBAddress, amount: e2eMintAmountWtfUnits }]],
      },
      {
        label: "Buyer approves market operator",
        wallet: "B",
        targetContractId: "dummy_wtf",
        entrypoint: "update_operators",
        args: [
          [
            {
              add_operator: {
                owner: params.walletBAddress,
                operator: params.marketAddress,
                token_id: "0",
              },
            },
          ],
        ],
      },
      {
        label: e2ePurchaseStepLabel,
        wallet: "B",
        targetContractId: "in_app_market",
        entrypoint: "purchase",
        args: [e2ePurchaseAmountWtfUnits, "0", purchaseRef],
      },
      {
        label: "Reject XTZ attached to purchase",
        wallet: "B",
        targetContractId: "in_app_market",
        entrypoint: "purchase",
        args: ["1000000000", "0", `${purchaseRef}-xtz`],
        amountMutez: 1,
        expectFailure: true,
      },
    ],
    assertions: buildInAppMarketAssertions({
      dummyWtfAddress: params.dummyWtfAddress,
      marketAddress: params.marketAddress,
      walletAAddress: params.walletAAddress,
      walletBAddress: params.walletBAddress,
      mintAmountWtfUnits: e2eMintAmountWtfUnits,
      purchaseAmountWtfUnits: e2ePurchaseAmountWtfUnits,
      purchaseStepLabel: e2ePurchaseStepLabel,
    }),
  };
  return api("POST", "/api/kiln/e2e/run", payload);
}

async function main(): Promise<void> {
  const reportLines: string[] = [
    "# WTF In-App Market Shadownet Kiln Run",
    "",
    `- Attempted at: ${nowIso()}`,
    `- Kiln API: ${apiBase}`,
    `- Network ID: ${networkId}`,
    "",
  ];

  try {
    const health = await api("GET", "/api/health", undefined, undefined);
    reportLines.push("## Health Probe", "");
    reportLines.push(`- HTTP status: ${health.status}`);
    reportLines.push("```json", jsonPreview(health.json ?? health.text), "```", "");

    const capabilities = await api("GET", `/api/kiln/capabilities?networkId=${networkId}`, undefined, undefined);
    reportLines.push("## Capability Probe", "");
    reportLines.push(`- HTTP status: ${capabilities.status}`);
    reportLines.push("```json", jsonPreview(capabilities.json ?? capabilities.text), "```", "");

    const unauth = await api(
      "POST",
      "/api/kiln/workflow/run",
      {
        networkId,
        sourceType: "michelson",
        source: "parameter unit; storage unit; code { CAR; NIL operation; PAIR; }",
        initialStorage: "Unit",
        simulationSteps: [],
      },
      undefined,
    );
    reportLines.push("## Unauthenticated Mutation Probe", "");
    reportLines.push(`- HTTP status: ${unauth.status}`);
    reportLines.push("```json", jsonPreview(unauth.json ?? unauth.text), "```", "");

    const localMarketOut = path.join(buildDir, "market-size-check");
    runSmartPyCompile({
      source: path.join(root, "contracts", "wtf-in-app-market", "WtfInAppMarket.py"),
      outDir: localMarketOut,
      env: {},
    });
    const localMarketArtifact = compiledArtifact(
      localMarketOut,
      "deploy_wtf_in_app_market_template",
    );
    reportLines.push("## Local Compact Compile", "");
    reportLines.push(`- Contract Michelson bytes: ${Buffer.byteLength(localMarketArtifact.code, "utf8")}`);
    reportLines.push(`- Initial storage bytes: ${Buffer.byteLength(localMarketArtifact.storage, "utf8")}`);
    reportLines.push("");

    if (!kilnToken && (unauth.status === 401 || unauth.status === 403)) {
      reportLines.push("## Status", "");
      reportLines.push("BLOCKED: `KILN_API_TOKEN` is not set and Kiln is currently in token-required mode.");
      reportLines.push("");
      writeReport("shadownet-kiln-run.md", reportLines.join("\n"));
      writeReport(
        "shadownet-e2e-report.md",
        [
          "# WTF In-App Market Shadownet E2E Report",
          "",
          "- Status: BLOCKED",
          `- Timestamp: ${nowIso()}`,
          `- Kiln API: ${apiBase}`,
          `- Network ID: ${networkId}`,
          "",
          "Kiln rejected unauthenticated mutation routes and no `KILN_API_TOKEN` was available.",
          "",
        ].join("\n"),
      );
      console.error("BLOCKED: KILN_API_TOKEN is missing and Kiln requires token auth.");
      process.exitCode = 2;
      return;
    }

    const balances = await api("GET", `/api/kiln/balances?networkId=${networkId}`);
    if (!balances.ok || !balances.json?.walletA?.address || !balances.json?.walletB?.address) {
      throw new Error(`Unable to read Kiln puppet wallets: ${balances.status} ${balances.text}`);
    }
    const walletAAddress = balances.json.walletA.address as string;
    const walletBAddress = balances.json.walletB.address as string;
    reportLines.push("## Kiln Puppet Wallets", "");
    reportLines.push("```json", jsonPreview(balances.json), "```", "");

    const dummyOut = path.join(buildDir, "dummy-wtf-fa2");
    runSmartPyCompile({
      source: path.join(root, "contracts", "wtf-xtz-exchange", "DummyWtfFA2.py"),
      outDir: dummyOut,
      env: { DUMMY_WTF_ADMIN: walletAAddress },
    });
    const dummyArtifact = compiledArtifact(dummyOut, "deploy_dummy_wtf_template");
    const dummyDeployment = await workflowAndDeploy({
      label: "Dummy WTF FA2",
      code: dummyArtifact.code,
      storage: dummyArtifact.storage,
      wallet: "A",
    });

    const marketOut = path.join(buildDir, "market");
    runSmartPyCompile({
      source: path.join(root, "contracts", "wtf-in-app-market", "WtfInAppMarket.py"),
      outDir: marketOut,
      env: {
        WTF_IN_APP_MARKET_TREASURY: walletAAddress,
        WTF_IN_APP_MARKET_TOKEN_ADDRESS: dummyDeployment.contractAddress,
        WTF_IN_APP_MARKET_TOKEN_ID: "0",
      },
    });
    const marketArtifact = compiledArtifact(marketOut, "deploy_wtf_in_app_market_template");
    const marketDeployment = await workflowAndDeploy({
      label: "WTF in-app market",
      code: marketArtifact.code,
      storage: marketArtifact.storage,
      wallet: "A",
    });

    const e2e = await runKilnE2E({
      dummyWtfAddress: dummyDeployment.contractAddress,
      marketAddress: marketDeployment.contractAddress,
      walletAAddress,
      walletBAddress,
    });

    const assertionSummary = summarizeKilnAssertionResult(e2e.json);
    const e2eStatus = e2e.ok && e2e.json?.success && assertionSummary.ok ? "PASSED" : "FAILED";
    writeReport(
      "shadownet-e2e-report.md",
      [
        "# WTF In-App Market Shadownet E2E Report",
        "",
        `- Status: ${e2eStatus}`,
        `- Timestamp: ${nowIso()}`,
        `- Kiln API: ${apiBase}`,
        `- Network ID: ${networkId}`,
        `- Dummy WTF FA2: ${dummyDeployment.contractAddress}`,
        `- WTF in-app market: ${marketDeployment.contractAddress}`,
        "",
        "```json",
        jsonPreview(e2e.json ?? e2e.text),
        "```",
        "",
        "## Assertion Evidence",
        "",
        "```json",
        jsonPreview(assertionSummary),
        "```",
        "",
      ].join("\n"),
    );

    reportLines.push("## Status", "");
    reportLines.push(e2eStatus);
    reportLines.push("");
    reportLines.push("## Contracts", "");
    reportLines.push(`- Dummy WTF FA2: ${dummyDeployment.contractAddress}`);
    reportLines.push(`- WTF in-app market: ${marketDeployment.contractAddress}`);
    reportLines.push("");
    reportLines.push("## E2E Result", "");
    reportLines.push("```json", jsonPreview(e2e.json ?? e2e.text), "```", "");
    reportLines.push("## E2E Assertion Evidence", "");
    reportLines.push("```json", jsonPreview(assertionSummary), "```", "");
    reportLines.push("## Raw Deployment Results", "");
    reportLines.push("```json");
    reportLines.push(
      jsonPreview({
        dummy: dummyDeployment,
        market: marketDeployment,
      }),
    );
    reportLines.push("```", "");
    writeReport("shadownet-kiln-run.md", reportLines.join("\n"));

    if (e2eStatus !== "PASSED") {
      throw new Error(
        `Kiln E2E failed with HTTP ${e2e.status}; missing assertion kinds: ${
          assertionSummary.missingKinds.join(", ") || "none"
        }: ${e2e.text}`,
      );
    }
    console.log(`Dummy WTF FA2: ${dummyDeployment.contractAddress}`);
    console.log(`WTF in-app market: ${marketDeployment.contractAddress}`);
    console.log("WTF in-app market Kiln Shadownet E2E passed.");
  } catch (error) {
    reportLines.push("## Status", "");
    reportLines.push("FAILED");
    reportLines.push("");
    reportLines.push("## Error", "");
    reportLines.push("```text");
    reportLines.push(error instanceof Error ? error.stack ?? error.message : String(error));
    reportLines.push("```", "");
    writeReport("shadownet-kiln-run.md", reportLines.join("\n"));
    throw error;
  }
}

await main();
