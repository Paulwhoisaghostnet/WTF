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
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-xtz-exchange");
const buildDir = path.join(root, "build", "wtf-xtz-exchange-kiln");
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN;

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

function compiledArtifact(outDir: string, scenarioName: string): { code: string; storage: string } {
  const scenarioDir = path.join(outDir, scenarioName);
  const codePath = path.join(scenarioDir, "step_001_cont_0_contract.tz");
  const storagePath = path.join(scenarioDir, "step_001_cont_0_storage.tz");
  if (!existsSync(codePath) || !existsSync(storagePath)) {
    throw new Error(
      `SmartPy compile output missing. Expected ${codePath} and ${storagePath}.`,
    );
  }
  return {
    code: readFileSync(codePath, "utf8"),
    storage: readFileSync(storagePath, "utf8"),
  };
}

async function workflowAndDeploy(params: {
  label: string;
  code: string;
  storage: string;
  wallet: "A" | "B";
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

async function main(): Promise<void> {
  const reportLines: string[] = [
    "# Shadownet Kiln Deployment Attempt",
    "",
    `- Attempted at: ${nowIso()}`,
    `- Kiln API: ${apiBase}`,
    `- Network ID: ${networkId}`,
    "",
  ];

  try {
    const capabilities = await api("GET", `/api/kiln/capabilities?networkId=${networkId}`, undefined, undefined);
    reportLines.push("## Public Capability Probe", "");
    reportLines.push(`- HTTP status: ${capabilities.status}`);
    reportLines.push("```json", jsonPreview(capabilities.json ?? capabilities.text), "```", "");

    const unauth = await api(
      "POST",
      "/api/kiln/workflow/run",
      { networkId, source: "parameter unit; storage unit; code { CAR; NIL operation; PAIR; }" },
      undefined,
    );
    reportLines.push("## Unauthenticated Mutation Probe", "");
    reportLines.push(`- HTTP status: ${unauth.status}`);
    reportLines.push("```json", jsonPreview(unauth.json ?? unauth.text), "```", "");

    if (!kilnToken) {
      reportLines.push("## Status", "");
      reportLines.push("BLOCKED: `KILN_API_TOKEN` is not set, so protected Kiln workflow/deploy routes cannot be used.");
      reportLines.push("");
      writeReport("shadownet-deployment-log.md", reportLines.join("\n"));
      console.error("BLOCKED: KILN_API_TOKEN is not set. Wrote .agents/docs/archive/contracts/wtf-xtz-exchange/shadownet-deployment-log.md");
      process.exitCode = 2;
      return;
    }

    const balances = await api("GET", `/api/kiln/balances?networkId=${networkId}`);
    if (!balances.ok || !balances.json?.walletA?.address) {
      throw new Error(`Unable to read Kiln puppet wallet A: ${balances.status} ${balances.text}`);
    }
    const walletAAddress = balances.json.walletA.address as string;
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

    const exchangeOut = path.join(buildDir, "exchange");
    runSmartPyCompile({
      source: path.join(root, "contracts", "wtf-xtz-exchange", "WtfXtzExchange.py"),
      outDir: exchangeOut,
      env: {
        WTF_XTZ_ADMIN: walletAAddress,
        WTF_XTZ_TOKEN_ADDRESS: dummyDeployment.contractAddress,
        WTF_XTZ_TOKEN_ID: "0",
      },
    });
    const exchangeArtifact = compiledArtifact(exchangeOut, "deploy_wtf_xtz_exchange_template");
    const exchangeDeployment = await workflowAndDeploy({
      label: "WTF -> XTZ exchange",
      code: exchangeArtifact.code,
      storage: exchangeArtifact.storage,
      wallet: "A",
    });

    reportLines.push("## Status", "");
    reportLines.push("DEPLOYED");
    reportLines.push("");
    reportLines.push("## Contracts", "");
    reportLines.push(`- Dummy WTF FA2: ${dummyDeployment.contractAddress}`);
    reportLines.push(`- WTF -> XTZ exchange: ${exchangeDeployment.contractAddress}`);
    reportLines.push("");
    reportLines.push("## Raw Results", "");
    reportLines.push("```json");
    reportLines.push(
      jsonPreview({
        dummy: dummyDeployment,
        exchange: exchangeDeployment,
      }),
    );
    reportLines.push("```", "");
    writeReport("shadownet-deployment-log.md", reportLines.join("\n"));
    console.log(`Dummy WTF FA2: ${dummyDeployment.contractAddress}`);
    console.log(`WTF -> XTZ exchange: ${exchangeDeployment.contractAddress}`);
  } catch (error) {
    reportLines.push("## Status", "");
    reportLines.push("FAILED");
    reportLines.push("");
    reportLines.push("## Error", "");
    reportLines.push("```text");
    reportLines.push(error instanceof Error ? error.stack ?? error.message : String(error));
    reportLines.push("```", "");
    writeReport("shadownet-deployment-log.md", reportLines.join("\n"));
    throw error;
  }
}

await main();
