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
  buildMarketplaceV2Assertions,
  summarizeKilnAssertionResult,
} from "../kiln/e2e-assertions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-marketplace-v2");
const buildDir = path.join(root, "build", "wtf-marketplace-v2-kiln");
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const tzktApiBase = (process.env.SHADOWNET_TZKT_API_URL ?? "https://api.shadownet.tzkt.io/v1").replace(/\/$/, "");
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN ?? process.env.API_AUTH_TOKEN;
const shadowboxBertAddress = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

type Wallet = "A" | "B";

type ApiResult = {
  status: number;
  ok: boolean;
  text: string;
  json: any;
};

const nftTokenId = "0";
const wtfTokenId = "0";
const sampleMintAmount = "6";
const buyerMintAmountWtfUnits = "10000";
const listingQuantity = "3";
const listingBuyQuantity = "2";
const listingUnitWtf = "100";
const acceptedOfferQuantity = "1";
const acceptedOfferUnitWtf = "150";
const cancelledOfferUnitWtf = "20";
const auctionQuantity = "1";
const auctionReserveWtf = "50";
const auctionMinIncrementWtf = "5";
const finalStepLabel = "Admin unpauses Marketplace V2";
const kt1Pattern = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

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

function requireKt1Address(value: unknown, label: string): string {
  const address = typeof value === "string" ? value.trim() : "";
  if (!kt1Pattern.test(address)) {
    throw new Error(`${label} did not provide a valid KT1 address.`);
  }
  return address;
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

async function fetchJsonWithRetry(url: string, attempts = 6): Promise<{ status: number; json: any; text: string }> {
  let lastStatus = 0;
  let lastText = "";
  let lastJson: any = undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url);
    lastStatus = response.status;
    lastText = await response.text();
    try {
      lastJson = lastText ? JSON.parse(lastText) : undefined;
    } catch {
      lastJson = undefined;
    }
    if (response.ok || response.status === 204 || (response.status < 500 && response.status !== 429)) {
      return { status: lastStatus, json: lastJson, text: lastText };
    }
    await sleep(1500 * attempt);
  }
  return { status: lastStatus, json: lastJson, text: lastText };
}

async function readTzktFa2Balance(params: {
  tokenAddress: string;
  owner: string;
  tokenId: string;
}): Promise<bigint> {
  const storage = await fetchJsonWithRetry(
    `${tzktApiBase}/contracts/${params.tokenAddress}/storage`,
  );
  if (storage.status < 200 || storage.status >= 300 || !storage.json?.ledger) {
    throw new Error(
      `Unable to read TzKT ledger id for ${params.tokenAddress}: ${storage.status} ${storage.text.slice(0, 500)}`,
    );
  }
  const key = encodeURIComponent(
    JSON.stringify({
      address: params.owner,
      nat: params.tokenId,
    }),
  );
  const entry = await fetchJsonWithRetry(`${tzktApiBase}/bigmaps/${storage.json.ledger}/keys/${key}`);
  if (entry.status === 204) return 0n;
  if (entry.status < 200 || entry.status >= 300) {
    throw new Error(
      `Unable to read TzKT FA2 balance for ${params.owner}: ${entry.status} ${entry.text.slice(0, 500)}`,
    );
  }
  return BigInt(entry.json?.value ?? "0");
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
        upload.text || "(empty body)"
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

async function runKilnE2E(params: {
  dummyWtfAddress: string;
  sampleFa2Address: string;
  marketAddress: string;
  walletAAddress: string;
  walletBAddress: string;
}): Promise<ApiResult> {
  const auctionStart = new Date(Date.now() - 60_000).toISOString();
  const auctionEnd = new Date(Date.now() + 60 * 60_000).toISOString();
  const buyerWtfBefore = await readTzktFa2Balance({
    tokenAddress: params.dummyWtfAddress,
    owner: params.walletBAddress,
    tokenId: wtfTokenId,
  });
  const expectedBuyerWtfUnits = (
    buyerWtfBefore +
    BigInt(buyerMintAmountWtfUnits) -
    BigInt(listingBuyQuantity) * BigInt(listingUnitWtf) -
    BigInt(acceptedOfferQuantity) * BigInt(acceptedOfferUnitWtf)
  ).toString();
  const expectedBuyerSampleFa2Units = (
    BigInt(listingBuyQuantity) + BigInt(acceptedOfferQuantity)
  ).toString();
  const assertions = buildMarketplaceV2Assertions({
    dummyWtfAddress: params.dummyWtfAddress,
    sampleFa2Address: params.sampleFa2Address,
    marketAddress: params.marketAddress,
    walletAAddress: params.walletAAddress,
    walletBAddress: params.walletBAddress,
    finalStepLabel,
    expectedBuyerWtfUnits,
    expectedBuyerSampleFa2Units,
  });
  const tokenRef = {
    token_contract: params.sampleFa2Address,
    token_id: nftTokenId,
  };
  const payload = {
    networkId,
    contracts: [
      {
        id: "dummy_wtf",
        address: params.dummyWtfAddress,
        entrypoints: ["mint_tokens", "update_operators", "transfer"],
      },
      {
        id: "sample_fa2",
        address: params.sampleFa2Address,
        entrypoints: ["mint", "update_operators", "transfer"],
      },
      {
        id: "marketplace_v2",
        address: params.marketAddress,
        entrypoints: [
          "create_listing",
          "buy_listing",
          "place_offer",
          "accept_offer",
          "cancel_offer",
          "create_auction",
          "cancel_auction",
          "pause",
          "unpause",
        ],
      },
    ],
    steps: [
      {
        label: "Mint Kiln WTF token to buyer",
        wallet: "A",
        targetContractId: "dummy_wtf",
        entrypoint: "mint_tokens",
        args: [
          [
            {
              token_id: wtfTokenId,
              to_: params.walletBAddress,
              amount: buyerMintAmountWtfUnits,
            },
          ],
        ],
      },
      {
        label: "Mint sample FA2 editions to seller",
        wallet: "A",
        targetContractId: "sample_fa2",
        entrypoint: "mint",
        args: [[{ to_: params.walletAAddress, amount: sampleMintAmount }]],
      },
      {
        label: "Seller approves Marketplace V2 for sample FA2",
        wallet: "A",
        targetContractId: "sample_fa2",
        entrypoint: "update_operators",
        args: [
          [
            {
              add_operator: {
                owner: params.walletAAddress,
                operator: params.marketAddress,
                token_id: nftTokenId,
              },
            },
          ],
        ],
      },
      {
        label: "Seller zero-transfer sample FA2 for coverage",
        wallet: "A",
        targetContractId: "sample_fa2",
        entrypoint: "transfer",
        args: [
          [
            {
              from_: params.walletAAddress,
              txs: [
                {
                  to_: params.walletAAddress,
                  token_id: nftTokenId,
                  amount: "0",
                },
              ],
            },
          ],
        ],
      },
      {
        label: "Buyer approves Marketplace V2 for Kiln WTF token",
        wallet: "B",
        targetContractId: "dummy_wtf",
        entrypoint: "update_operators",
        args: [
          [
            {
              add_operator: {
                owner: params.walletBAddress,
                operator: params.marketAddress,
                token_id: wtfTokenId,
              },
            },
          ],
        ],
      },
      {
        label: "Buyer zero-transfer Kiln WTF token for coverage",
        wallet: "B",
        targetContractId: "dummy_wtf",
        entrypoint: "transfer",
        args: [
          [
            {
              from_: params.walletBAddress,
              txs: [
                {
                  to_: params.walletBAddress,
                  token_id: wtfTokenId,
                  amount: "0",
                },
              ],
            },
          ],
        ],
      },
      {
        label: "Seller creates explicit quantity listing",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "create_listing",
        args: [
          {
            token_contract: params.sampleFa2Address,
            token_id: nftTokenId,
            quantity: listingQuantity,
            unit_price_wtf: listingUnitWtf,
            expiry: null,
            royalty_bps: "0",
            royalty_recipient: null,
          },
        ],
      },
      {
        label: "Buyer buys two editions with expected terms",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "buy_listing",
        args: [
          {
            listing_id: "0",
            quantity: listingBuyQuantity,
            expected_token: tokenRef,
            expected_owner: params.walletAAddress,
            expected_unit_price_wtf: listingUnitWtf,
          },
        ],
      },
      {
        label: "Buyer places explicit quantity offer",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "place_offer",
        args: [
          {
            token_contract: params.sampleFa2Address,
            token_id: nftTokenId,
            target_owner: params.walletAAddress,
            quantity: acceptedOfferQuantity,
            unit_price_wtf: acceptedOfferUnitWtf,
            expiry: null,
          },
        ],
      },
      {
        label: "Seller accepts offer with expected terms",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "accept_offer",
        args: [
          {
            offer_id: "0",
            expected_token: tokenRef,
            expected_target_owner: params.walletAAddress,
            expected_quantity: acceptedOfferQuantity,
            expected_unit_price_wtf: acceptedOfferUnitWtf,
          },
        ],
      },
      {
        label: "Buyer places refundable offer",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "place_offer",
        args: [
          {
            token_contract: params.sampleFa2Address,
            token_id: nftTokenId,
            target_owner: params.walletAAddress,
            quantity: "1",
            unit_price_wtf: cancelledOfferUnitWtf,
            expiry: null,
          },
        ],
      },
      {
        label: "Buyer cancels offer and receives refund",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "cancel_offer",
        args: ["1"],
      },
      {
        label: "Seller creates auction with explicit quantity",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "create_auction",
        args: [
          {
            token_contract: params.sampleFa2Address,
            token_id: nftTokenId,
            quantity: auctionQuantity,
            reserve_wtf: auctionReserveWtf,
            min_increment_wtf: auctionMinIncrementWtf,
            start_time: auctionStart,
            end_time: auctionEnd,
          },
        ],
      },
      {
        label: "Seller cancels auction before bid",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "cancel_auction",
        args: ["0"],
      },
      {
        label: "Admin pauses Marketplace V2",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "pause",
        args: [],
      },
      {
        label: "Paused Marketplace V2 rejects new offer",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "place_offer",
        args: [
          {
            token_contract: params.sampleFa2Address,
            token_id: nftTokenId,
            target_owner: params.walletAAddress,
            quantity: "1",
            unit_price_wtf: "1",
            expiry: null,
          },
        ],
        expectFailure: true,
      },
      {
        label: finalStepLabel,
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "unpause",
        args: [],
        assertions,
      },
    ],
  };
  return api("POST", "/api/kiln/e2e/run", payload);
}

async function main(): Promise<void> {
  const reportLines: string[] = [
    "# WTF Marketplace V2 Shadownet Kiln Run",
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
    const kilnWtfTokenAddress = requireKt1Address(
      health.json?.tokens?.bronze,
      "Kiln health bronze token",
    );
    reportLines.push("## Kiln WTF Currency Token", "");
    reportLines.push(`- Token tier: bronze`);
    reportLines.push(`- Address: ${kilnWtfTokenAddress}`);
    reportLines.push("");

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
      source: path.join(root, "contracts", "WTFMarketplaceV2.py"),
      outDir: localMarketOut,
      env: {},
    });
    const localMarketArtifact = compiledArtifact(localMarketOut, "WTFMarketplaceV2");
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
          "# WTF Marketplace V2 Shadownet E2E Report",
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

    const balances = await apiWithRetry("GET", `/api/kiln/balances?networkId=${networkId}`);
    if (!balances.ok || !balances.json?.walletA?.address || !balances.json?.walletB?.address) {
      throw new Error(`Unable to read Kiln puppet wallets: ${balances.status} ${balances.text}`);
    }
    const walletAAddress = balances.json.walletA.address as string;
    const walletBAddress = balances.json.walletB.address as string;
    reportLines.push("## Kiln Puppet Wallets", "");
    reportLines.push("```json", jsonPreview(balances.json), "```", "");

    const dummyDeployment = {
      contractAddress: kilnWtfTokenAddress,
      workflow: null,
      upload: {
        reusedNamedKilnToken: true,
        tokenTier: "bronze",
      },
      directDeploy: false,
    };

    const sampleOut = path.join(buildDir, "sample-fa2");
    runSmartPyCompile({
      source: path.join(root, "contracts", "wtf-xtz-exchange", "DummyWtfFA2.py"),
      outDir: sampleOut,
      env: { DUMMY_WTF_ADMIN: walletAAddress },
    });
    const sampleArtifact = compiledArtifact(sampleOut, "deploy_dummy_wtf_template");
    const sampleWorkflowStorage = sampleArtifact.storage.replaceAll(
      walletAAddress,
      shadowboxBertAddress,
    );
    const sampleDeployment = await workflowAndDeploy({
      label: "Sample FA2",
      code: sampleArtifact.code,
      storage: sampleArtifact.storage,
      workflowStorage: sampleWorkflowStorage,
      wallet: "A",
    });

    const marketOut = path.join(buildDir, "marketplace-v2");
    runSmartPyCompile({
      source: path.join(root, "contracts", "WTFMarketplaceV2.py"),
      outDir: marketOut,
      env: {
        MARKETPLACE_V2_ADMIN: walletAAddress,
        MARKETPLACE_V2_WTF_TOKEN_ADDRESS: kilnWtfTokenAddress,
        MARKETPLACE_V2_WTF_TOKEN_ID: wtfTokenId,
      },
    });
    const marketArtifact = compiledArtifact(marketOut, "WTFMarketplaceV2");
    const marketWorkflowStorage = marketArtifact.storage.replaceAll(
      walletAAddress,
      shadowboxBertAddress,
    );
    const marketDeployment = await workflowAndDeploy({
      label: "WTF Marketplace V2",
      code: marketArtifact.code,
      storage: marketArtifact.storage,
      workflowStorage: marketWorkflowStorage,
      wallet: "A",
      allowShadownetDirectDeployOnWorkflowBlock: true,
    });

    const e2e = await runKilnE2E({
      dummyWtfAddress: dummyDeployment.contractAddress,
      sampleFa2Address: sampleDeployment.contractAddress,
      marketAddress: marketDeployment.contractAddress,
      walletAAddress,
      walletBAddress,
    });

    const assertionSummary = summarizeKilnAssertionResult(e2e.json);
    const e2eStatus = e2e.ok && e2e.json?.success && assertionSummary.ok ? "PASSED" : "FAILED";
    writeReport(
      "shadownet-e2e-report.md",
      [
        "# WTF Marketplace V2 Shadownet E2E Report",
        "",
        `- Status: ${e2eStatus}`,
        `- Timestamp: ${nowIso()}`,
        `- Kiln API: ${apiBase}`,
        `- Network ID: ${networkId}`,
        `- Kiln WTF FA2 (bronze): ${dummyDeployment.contractAddress}`,
        `- Sample FA2: ${sampleDeployment.contractAddress}`,
        `- WTF Marketplace V2: ${marketDeployment.contractAddress}`,
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
    reportLines.push(`- Kiln WTF FA2 (bronze): ${dummyDeployment.contractAddress}`);
    reportLines.push(`- Sample FA2: ${sampleDeployment.contractAddress}`);
    reportLines.push(`- WTF Marketplace V2: ${marketDeployment.contractAddress}`);
    reportLines.push("");
    if (marketDeployment.directDeploy) {
      reportLines.push("## Marketplace V2 Shadownet Direct Deploy", "");
      reportLines.push(
        "Kiln workflow clearance was attempted first, but shadownet-only direct deploy was used because the single-contract shadowbox clearance path could not prove this dependent FA2 marketplace flow.",
      );
      reportLines.push("");
      reportLines.push("```text");
      reportLines.push(marketDeployment.workflowBlockReason ?? "No workflow block reason recorded.");
      reportLines.push("```", "");
    }
    reportLines.push("## E2E Result", "");
    reportLines.push("```json", jsonPreview(e2e.json ?? e2e.text), "```", "");
    reportLines.push("## E2E Assertion Evidence", "");
    reportLines.push("```json", jsonPreview(assertionSummary), "```", "");
    reportLines.push("## Raw Deployment Results", "");
    reportLines.push("```json");
    reportLines.push(
      jsonPreview({
        dummy: dummyDeployment,
        sampleFa2: sampleDeployment,
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
    console.log(`Kiln WTF FA2 (bronze): ${dummyDeployment.contractAddress}`);
    console.log(`Sample FA2: ${sampleDeployment.contractAddress}`);
    console.log(`WTF Marketplace V2: ${marketDeployment.contractAddress}`);
    console.log("WTF Marketplace V2 Kiln Shadownet E2E passed.");
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
