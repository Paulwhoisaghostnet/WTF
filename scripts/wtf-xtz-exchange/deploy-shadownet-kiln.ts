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
const buildDir = path.join(root, "build", "wtf-xtz-exchange-kiln");
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN ?? process.env.API_AUTH_TOKEN;
const defaultShadownetWtfAddress = "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj";
const deployDummyWtf = process.env.WTF_XTZ_DEPLOY_DUMMY_WTF === "1";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function shouldRetryApi(result: ApiResult): boolean {
  return (
    result.status === 429 ||
    result.status >= 500 ||
    /503 Service Temporarily Unavailable|ECONNRESET|ETIMEDOUT/i.test(result.text)
  );
}

async function apiWithRetry(
  method: "GET" | "POST",
  route: string,
  body?: unknown,
  token = kilnToken,
  attempts = 6,
): Promise<ApiResult> {
  let last = await api(method, route, body, token);
  for (let attempt = 1; attempt < attempts && shouldRetryApi(last); attempt += 1) {
    await sleep(1500 * attempt);
    last = await api(method, route, body, token);
  }
  return last;
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
  let scenarioDir = path.join(outDir, scenarioName);
  if (!existsSync(scenarioDir)) {
    scenarioDir = outDir;
  }
  if (!existsSync(scenarioDir)) {
    throw new Error(`SmartPy scenario output missing: ${path.join(outDir, scenarioName)}`);
  }
  const contractFile = readdirSync(scenarioDir)
    .filter((file) => /^step_\d+_cont_0_contract\.tz$/.test(file))
    .sort()
    .at(-1);
  if (!contractFile) {
    throw new Error(`SmartPy contract output missing in ${scenarioDir}`);
  }
  const prefix = contractFile.replace("_contract.tz", "");
  const codePath = path.join(scenarioDir, contractFile);
  const storagePath = path.join(scenarioDir, `${prefix}_storage.tz`);
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
  workflowStorage?: string;
  wallet: Wallet;
  allowShadownetDirectDeployOnWorkflowBlock?: boolean;
}): Promise<{
  contractAddress: string;
  workflow: any;
  upload: any;
  directDeploy: boolean;
  workflowBlockReason?: string;
}> {
  const workflowPayload = {
    networkId,
    sourceType: "michelson",
    source: params.code,
    initialStorage: params.workflowStorage ?? params.storage,
    simulationSteps: [],
  };
  const workflow = await apiWithRetry("POST", "/api/kiln/workflow/run", workflowPayload);
  let workflowBlockReason: string | undefined;
  if (!workflow.ok || !workflow.json?.success) {
    workflowBlockReason = `${params.label} Kiln workflow failed with HTTP ${workflow.status}: ${
      workflow.text.slice(0, 2000) || "(empty body)"
    }`;
  } else if (!workflow.json?.clearance?.approved) {
    workflowBlockReason = `${params.label} Kiln workflow did not approve deployment: ${
      workflow.text.slice(0, 2000) || "(empty body)"
    }`;
  }

  const directDeploy =
    Boolean(workflowBlockReason) &&
    Boolean(params.allowShadownetDirectDeployOnWorkflowBlock) &&
    networkId === "tezos-shadownet";

  if (workflowBlockReason && !directDeploy) {
    throw new Error(workflowBlockReason);
  }

  const uploadPayload: Record<string, unknown> = {
    networkId,
    code: workflow.json?.artifacts?.michelson ?? params.code,
    initialStorage: params.storage,
    wallet: params.wallet,
  };
  const clearanceId = workflow.json?.clearance?.record?.id;
  if (clearanceId && !directDeploy) uploadPayload.clearanceId = clearanceId;
  if (directDeploy) uploadPayload.allowShadownetDirectDeploy = true;

  const upload = await apiWithRetry("POST", "/api/kiln/upload", uploadPayload);
  if (!upload.ok || !upload.json?.success || !upload.json?.contractAddress) {
    throw new Error(
      `${params.label} Kiln upload failed with HTTP ${upload.status}: ${
        upload.text.slice(0, 2000) || "(empty body)"
      }`,
    );
  }

  return {
    contractAddress: upload.json.contractAddress,
    workflow: workflow.json,
    upload: upload.json,
    directDeploy,
    workflowBlockReason,
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
    if (process.env.TEZOS_NETWORK === "mainnet" || networkId.includes("mainnet")) {
      reportLines.push("## Status", "");
      reportLines.push("BLOCKED: this helper refuses to deploy WTF-XTZ exchange artifacts to mainnet.");
      reportLines.push("");
      writeReport("shadownet-deployment-log.md", reportLines.join("\n"));
      console.error("BLOCKED: refusing to deploy WTF-XTZ exchange through the Shadownet helper on mainnet.");
      process.exitCode = 2;
      return;
    }

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

    let tokenSource = "configured";
    let wtfTokenAddress =
      process.env.WTF_XTZ_TOKEN_ADDRESS ??
      process.env.WTF_TOKEN_ADDRESS ??
      process.env.DUMMY_WTF_ADDRESS;
    let dummyDeployment: Awaited<ReturnType<typeof workflowAndDeploy>> | null = null;

    if (!wtfTokenAddress && networkId === "tezos-shadownet" && !deployDummyWtf) {
      wtfTokenAddress = defaultShadownetWtfAddress;
      tokenSource = "default Kiln Shadownet WTF FA2";
    }

    if (deployDummyWtf) {
      tokenSource = "new dummy WTF FA2";
      const dummyOut = path.join(buildDir, "dummy-wtf-fa2");
      runSmartPyCompile({
        source: path.join(root, "contracts", "wtf-xtz-exchange", "DummyWtfFA2.py"),
        outDir: dummyOut,
        env: { DUMMY_WTF_ADMIN: walletAAddress },
      });
      const dummyArtifact = compiledArtifact(dummyOut, "deploy_dummy_wtf_template");
      dummyDeployment = await workflowAndDeploy({
        label: "Dummy WTF FA2",
        code: dummyArtifact.code,
        storage: dummyArtifact.storage,
        wallet: "A",
        allowShadownetDirectDeployOnWorkflowBlock: true,
      });
      wtfTokenAddress = dummyDeployment.contractAddress;
    }

    if (!wtfTokenAddress) {
      throw new Error(
        "Missing WTF token address. Set WTF_XTZ_TOKEN_ADDRESS/WTF_TOKEN_ADDRESS or run with WTF_XTZ_DEPLOY_DUMMY_WTF=1.",
      );
    }

    const exchangeOut = path.join(buildDir, "exchange");
    runSmartPyCompile({
      source: path.join(root, "contracts", "wtf-xtz-exchange", "WtfXtzExchange.py"),
      outDir: exchangeOut,
      env: {
        WTF_XTZ_ADMIN: walletAAddress,
        WTF_XTZ_TOKEN_ADDRESS: wtfTokenAddress,
        WTF_XTZ_TOKEN_ID: "0",
      },
    });
    const exchangeArtifact = compiledArtifact(exchangeOut, "deploy_wtf_xtz_exchange_template");
    const exchangeDeployment = await workflowAndDeploy({
      label: "WTF -> XTZ exchange",
      code: exchangeArtifact.code,
      storage: exchangeArtifact.storage,
      wallet: "A",
      allowShadownetDirectDeployOnWorkflowBlock: true,
    });

    reportLines.push("## Status", "");
    reportLines.push("DEPLOYED");
    reportLines.push("");
    reportLines.push("## Contracts", "");
    reportLines.push(`- WTF FA2: ${wtfTokenAddress}`);
    reportLines.push(`- WTF token source: ${tokenSource}`);
    if (dummyDeployment) reportLines.push(`- Dummy WTF FA2: ${dummyDeployment.contractAddress}`);
    reportLines.push(`- WTF -> XTZ exchange: ${exchangeDeployment.contractAddress}`);
    if (dummyDeployment) {
      reportLines.push(`- Dummy direct deploy fallback: ${dummyDeployment.directDeploy ? "yes" : "no"}`);
    }
    reportLines.push(`- Exchange direct deploy fallback: ${exchangeDeployment.directDeploy ? "yes" : "no"}`);
    reportLines.push("");
    reportLines.push("## Raw Results", "");
    reportLines.push("```json");
    reportLines.push(
      jsonPreview({
        wtfTokenAddress,
        tokenSource,
        dummy: dummyDeployment,
        exchange: exchangeDeployment,
      }),
    );
    reportLines.push("```", "");
    writeReport("shadownet-deployment-log.md", reportLines.join("\n"));
    console.log(`WTF FA2: ${wtfTokenAddress}`);
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
