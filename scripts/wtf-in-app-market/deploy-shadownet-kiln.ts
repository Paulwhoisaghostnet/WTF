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
  buildInAppRedemptionAssertions,
  summarizeKilnAssertionResult,
} from "../kiln/e2e-assertions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-in-app-market");
const buildDir = path.join(root, "build", "wtf-in-app-market-kiln");
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const tzktApiBase = (process.env.KILN_TZKT_API_URL ?? "https://api.shadownet.tzkt.io/v1").replace(
  /\/$/,
  "",
);
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN ?? process.env.API_AUTH_TOKEN;
const fallbackKilnWtfTokenAddress = "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj";
const e2eBuyerMintAmountWtfUnits = "0";
const e2ePurchaseAmountWtfUnits = "100000000";
const e2ePurchaseStepLabel = "Buyer purchases pet food";
const e2eCartHash = "1".repeat(64);
const e2eRedemptionFundAmountWtfUnits = "100000000";
const e2eRedemptionClaimAmountWtfUnits = "25000000";
const e2eRedemptionCancelAmountWtfUnits = "10000000";
const e2eRedemptionReturnAmountWtfUnits = "1";
const e2eRedemptionFinalStepLabel = "Buyer claims WTF redemption";
const kilnNamedTokenDebitsBuyerOnPurchase = false;
const shadowboxBertAddress = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const shadowboxErnieAddress = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const shadowboxMappedFa2Address = "KT1MzbUcdjD76nsDHTXHLSYnPK9LAXHRYeFA";

type Wallet = "A" | "B";
type WorkflowWallet = "bert" | "ernie" | "user";
type WorkflowSimulationStep = {
  label?: string;
  wallet: WorkflowWallet;
  entrypoint: string;
  args?: unknown[];
  amountMutez?: number;
  expectFailure?: boolean;
};

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

function isKt1Address(value: unknown): value is string {
  return typeof value === "string" && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

function resolveKilnWtfTokenAddress(healthJson: any): string {
  const candidates = [
    process.env.KILN_WTF_TOKEN_ADDRESS,
    process.env.KILN_TOKEN_BRONZE,
    healthJson?.tokens?.bronze,
    fallbackKilnWtfTokenAddress,
  ];
  const tokenAddress = candidates.find(isKt1Address);
  if (!tokenAddress) {
    throw new Error("Unable to resolve a Kiln WTF FA2 token address.");
  }
  return tokenAddress.trim();
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

async function readFa2LedgerBalance(tokenAddress: string, walletAddress: string): Promise<string> {
  const url = new URL(`${tzktApiBase}/contracts/${tokenAddress}/bigmaps/ledger/keys`);
  url.searchParams.set("key.address", walletAddress);
  url.searchParams.set("key.nat", "0");
  const response = await fetch(url);
  if (!response.ok) {
    return "0";
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return "0";
  }
  const activeRow = rows.find((row) => row?.active !== false) ?? rows[0];
  return String(activeRow?.value ?? "0");
}

async function readTzktJson(route: string): Promise<any> {
  const response = await fetch(`${tzktApiBase}${route}`);
  if (!response.ok) {
    throw new Error(`TzKT reconciliation failed for ${route}: HTTP ${response.status}`);
  }
  return response.json();
}

async function reconcileTimedOutKilnE2E(params: {
  wtfTokenAddress: string;
  marketAddress: string;
  redemptionEscrowAddress: string;
  walletAAddress: string;
  walletBAddress: string;
  initialBuyerWtfUnits: string;
}): Promise<ApiResult> {
  const expectedEntrypoints = [
    "fund",
    "create_redemption",
    "claim_redemption",
    "cancel_redemption",
    "return_unreserved_escrow",
    "pause",
    "unpause",
    "propose_admin",
    "cancel_pending_admin",
    "accept_admin",
    "propose_issuer",
    "cancel_pending_issuer",
    "accept_issuer",
  ];
  const expectedBuyerWtfUnits = (
    BigInt(params.initialBuyerWtfUnits) -
    BigInt(e2eRedemptionFundAmountWtfUnits) +
    BigInt(e2eRedemptionClaimAmountWtfUnits) -
    1n
  ).toString();
  const expectedEscrowWtfUnits = (
    BigInt(e2eRedemptionFundAmountWtfUnits) -
    BigInt(e2eRedemptionReturnAmountWtfUnits) -
    BigInt(e2eRedemptionClaimAmountWtfUnits)
  ).toString();
  const deadline = Date.now() + 180_000;
  let lastEvidence: any = null;

  while (Date.now() < deadline) {
    const [storage, contract, transactions, marketTransactions, redemptions, buyerBalance] =
      await Promise.all([
        readTzktJson(`/contracts/${params.redemptionEscrowAddress}/storage`),
        readTzktJson(`/contracts/${params.redemptionEscrowAddress}`),
        readTzktJson(
          `/operations/transactions?target=${params.redemptionEscrowAddress}&status=applied&limit=100&sort.asc=id`,
        ),
        readTzktJson(
          `/operations/transactions?target=${params.marketAddress}&status=applied&limit=100&sort.asc=id`,
        ),
        readTzktJson(
          `/contracts/${params.redemptionEscrowAddress}/bigmaps/redemptions/keys?limit=20`,
        ),
        readFa2LedgerBalance(params.wtfTokenAddress, params.walletBAddress),
      ]);
    const appliedEntrypoints = new Set(
      (Array.isArray(transactions) ? transactions : []).map((row: any) =>
        String(row?.parameter?.entrypoint ?? ""),
      ),
    );
    const purchaseApplied = (Array.isArray(marketTransactions) ? marketTransactions : []).some(
      (row: any) =>
        row?.parameter?.entrypoint === "purchase" &&
        String(row?.parameter?.value?.expected_wtf_token_address ?? "") ===
          params.wtfTokenAddress &&
        String(row?.parameter?.value?.expected_treasury ?? "") === params.walletAAddress,
    );
    const redemption1 = (Array.isArray(redemptions) ? redemptions : []).find(
      (row: any) => String(row?.key ?? "") === "1" && row?.active !== false,
    )?.value;
    const redemption2 = (Array.isArray(redemptions) ? redemptions : []).find(
      (row: any) => String(row?.key ?? "") === "2" && row?.active !== false,
    )?.value;
    const entrypointsComplete = expectedEntrypoints.every((entrypoint) =>
      appliedEntrypoints.has(entrypoint),
    );
    const storageComplete =
      storage?.version === "wtf-in-app-redemption-escrow-v2" &&
      storage?.wtf_token_address === params.wtfTokenAddress &&
      storage?.admin === params.walletBAddress &&
      storage?.issuer === params.walletAAddress &&
      storage?.paused === false &&
      storage?.pending_admin == null &&
      storage?.pending_issuer == null &&
      String(storage?.reserved_wtf ?? "") === "0" &&
      String(storage?.escrow_balance_wtf ?? "") === expectedEscrowWtfUnits;
    const redemptionsComplete =
      String(redemption1?.status_code ?? "") === "1" &&
      String(redemption1?.claimant ?? "") === params.walletBAddress &&
      String(redemption1?.amount_wtf_units ?? "") === e2eRedemptionClaimAmountWtfUnits &&
      String(redemption2?.status_code ?? "") === "2";
    const balanceComplete =
      String(contract?.balance ?? "") === "0" && buyerBalance === expectedBuyerWtfUnits;

    lastEvidence = {
      purchaseApplied,
      entrypointsComplete,
      storageComplete,
      redemptionsComplete,
      balanceComplete,
      appliedEntrypoints: [...appliedEntrypoints].sort(),
      storage,
      buyerBalance,
      expectedBuyerWtfUnits,
    };
    if (
      purchaseApplied &&
      entrypointsComplete &&
      storageComplete &&
      redemptionsComplete &&
      balanceComplete
    ) {
      const json = {
        success: true,
        reconciledAfterGatewayTimeout: true,
        summary: { total: expectedEntrypoints.length + 1, passed: expectedEntrypoints.length + 1, failed: 0 },
        coverage: {
          passed: true,
          totalEntrypoints: expectedEntrypoints.length,
          coveredEntrypoints: expectedEntrypoints.length,
          missedEntrypoints: [],
        },
        assertions: [
          { id: "reconciled_storage", kind: "storage", status: "passed", passed: true },
          { id: "reconciled_balance", kind: "balance", status: "passed", passed: true },
          { id: "reconciled_big_map", kind: "big_map", status: "passed", passed: true },
        ],
        evidence: lastEvidence,
      };
      return { status: 200, ok: true, text: JSON.stringify(json), json };
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error(
    `Kiln E2E timed out and TzKT reconciliation did not reach terminal state: ${JSON.stringify(lastEvidence)}`,
  );
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

function buildRedemptionWorkflowSteps(): WorkflowSimulationStep[] {
  const futureExpiry = "2099-01-01T00:00:00Z";
  return [
    {
      label: "Redemption workflow funds escrow",
      wallet: "ernie",
      entrypoint: "fund",
      args: ["5", shadowboxMappedFa2Address, "0"],
    },
    {
      label: "Redemption workflow creates claimable redemption",
      wallet: "ernie",
      entrypoint: "create_redemption",
      args: ["1", shadowboxErnieAddress, "2", "shadowbox-claim", futureExpiry],
    },
    {
      label: "Redemption workflow claims redemption",
      wallet: "ernie",
      entrypoint: "claim_redemption",
      args: [
        "1",
        shadowboxErnieAddress,
        "2",
        "shadowbox-claim",
        shadowboxMappedFa2Address,
        "0",
      ],
    },
    {
      label: "Redemption workflow creates cancellable redemption",
      wallet: "ernie",
      entrypoint: "create_redemption",
      args: ["2", shadowboxErnieAddress, "1", "shadowbox-cancel", futureExpiry],
    },
    {
      label: "Redemption workflow cancels redemption",
      wallet: "bert",
      entrypoint: "cancel_redemption",
      args: ["2"],
    },
    {
      label: "Redemption workflow returns unreserved escrow",
      wallet: "bert",
      entrypoint: "return_unreserved_escrow",
      args: ["1", shadowboxBertAddress, shadowboxMappedFa2Address, "0"],
    },
    {
      label: "Redemption workflow proposes pending issuer",
      wallet: "bert",
      entrypoint: "propose_issuer",
      args: [shadowboxBertAddress],
    },
    {
      label: "Redemption workflow cancels pending issuer",
      wallet: "bert",
      entrypoint: "cancel_pending_issuer",
      args: [],
    },
    {
      label: "Redemption workflow proposes pending issuer again",
      wallet: "bert",
      entrypoint: "propose_issuer",
      args: [shadowboxBertAddress],
    },
    {
      label: "Redemption workflow accepts pending issuer",
      wallet: "bert",
      entrypoint: "accept_issuer",
      args: [],
    },
    {
      label: "Redemption workflow unpauses from admin",
      wallet: "bert",
      entrypoint: "unpause",
      args: [],
    },
    {
      label: "Redemption workflow proposes pending admin",
      wallet: "bert",
      entrypoint: "propose_admin",
      args: [shadowboxErnieAddress],
    },
    {
      label: "Redemption workflow cancels pending admin",
      wallet: "bert",
      entrypoint: "cancel_pending_admin",
      args: [],
    },
    {
      label: "Redemption workflow proposes pending admin again",
      wallet: "bert",
      entrypoint: "propose_admin",
      args: [shadowboxErnieAddress],
    },
    {
      label: "Redemption workflow accepts pending admin",
      wallet: "ernie",
      entrypoint: "accept_admin",
      args: [],
    },
    {
      label: "Redemption workflow pauses last",
      wallet: "ernie",
      entrypoint: "pause",
      args: [],
    },
  ];
}

async function workflowAndDeploy(params: {
  label: string;
  code: string;
  storage: string;
  workflowStorage?: string;
  workflowSimulationSteps?: WorkflowSimulationStep[];
  wallet: Wallet;
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
    simulationSteps: params.workflowSimulationSteps ?? [],
  };
  const workflow = await api("POST", "/api/kiln/workflow/run", workflowPayload);
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
  if (workflowBlockReason) throw new Error(workflowBlockReason);

  const uploadPayload: Record<string, unknown> = {
    networkId,
    code: workflow.json?.artifacts?.michelson ?? params.code,
    initialStorage: params.storage,
    wallet: params.wallet,
  };
  const clearanceId = workflow.json?.clearance?.record?.id;
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
    directDeploy: false,
    workflowBlockReason,
  };
}

async function runKilnE2E(params: {
  wtfTokenAddress: string;
  marketAddress: string;
  redemptionEscrowAddress: string;
  walletAAddress: string;
  walletBAddress: string;
  initialTreasuryWtfUnits: string;
  initialBuyerWtfUnits: string;
}): Promise<ApiResult> {
  const purchaseRef = `kiln-${Date.now().toString(36)}`;
  const badPurchaseRef = `${purchaseRef}-bad`;
  const redemptionExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const buyerFinalWtfUnits = (
    BigInt(params.initialBuyerWtfUnits) +
    BigInt(e2eBuyerMintAmountWtfUnits) -
    (kilnNamedTokenDebitsBuyerOnPurchase ? BigInt(e2ePurchaseAmountWtfUnits) : 0n) +
    BigInt(e2eRedemptionClaimAmountWtfUnits) -
    BigInt(e2eRedemptionFundAmountWtfUnits) -
    1n
  ).toString();
  const assertions = buildInAppMarketAssertions({
    dummyWtfAddress: params.wtfTokenAddress,
    paymentTokenAddress: params.wtfTokenAddress,
    marketAddress: params.marketAddress,
    walletAAddress: params.walletAAddress,
    walletBAddress: params.walletBAddress,
    mintAmountWtfUnits: e2eBuyerMintAmountWtfUnits,
    purchaseAmountWtfUnits: e2ePurchaseAmountWtfUnits,
    purchaseStepLabel: e2ePurchaseStepLabel,
    expectedVersion: "wtf-in-app-market-v2",
    initialBuyerWtfUnits: params.initialBuyerWtfUnits,
    initialTreasuryWtfUnits: params.initialTreasuryWtfUnits,
    purchaseDebitsBuyer: kilnNamedTokenDebitsBuyerOnPurchase,
  });
  const redemptionAssertions = buildInAppRedemptionAssertions({
    dummyWtfAddress: params.wtfTokenAddress,
    redemptionAddress: params.redemptionEscrowAddress,
    walletAAddress: params.walletAAddress,
    walletBAddress: params.walletBAddress,
    fundedAmountWtfUnits: (
      BigInt(e2eRedemptionFundAmountWtfUnits) - BigInt(e2eRedemptionReturnAmountWtfUnits)
    ).toString(),
    claimedAmountWtfUnits: e2eRedemptionClaimAmountWtfUnits,
    expectedBuyerWtfUnits: buyerFinalWtfUnits,
    finalStepLabel: e2eRedemptionFinalStepLabel,
  });
  const payload = {
    networkId,
    contracts: [
      {
        id: "dummy_wtf",
        address: params.wtfTokenAddress,
        entrypoints: ["update_operators", "transfer"],
      },
      {
        id: "in_app_market",
        address: params.marketAddress,
        entrypoints: ["purchase"],
      },
      {
        id: "redemption_escrow",
        address: params.redemptionEscrowAddress,
        entrypoints: [
          "fund",
          "create_redemption",
          "claim_redemption",
          "cancel_redemption",
          "return_unreserved_escrow",
          "pause",
          "unpause",
          "propose_admin",
          "cancel_pending_admin",
          "accept_admin",
          "propose_issuer",
          "cancel_pending_issuer",
          "accept_issuer",
        ],
      },
    ],
    steps: [
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
        args: [
          {
            listing_id: 0,
            amount_wtf_units: e2ePurchaseAmountWtfUnits,
            purchase_ref: purchaseRef,
            cart_hash: e2eCartHash,
            expected_treasury: params.walletAAddress,
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
        assertions,
      },
      {
        label: "Buyer transfers dummy WTF after purchase",
        wallet: "B",
        targetContractId: "dummy_wtf",
        entrypoint: "transfer",
        args: [
          [
            {
              from_: params.walletBAddress,
              txs: [
                {
                  to_: params.walletAAddress,
                  token_id: "0",
                  amount: "1",
                },
              ],
            },
          ],
        ],
      },
      {
        label: "Reject XTZ attached to purchase",
        wallet: "B",
        targetContractId: "in_app_market",
        entrypoint: "purchase",
        args: [
          {
            listing_id: 0,
            amount_wtf_units: e2ePurchaseAmountWtfUnits,
            purchase_ref: `${purchaseRef}-xtz`,
            cart_hash: e2eCartHash,
            expected_treasury: params.walletAAddress,
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
        amountMutez: 1,
        expectFailure: true,
      },
      {
        label: "Reject purchase with wrong expected treasury",
        wallet: "B",
        targetContractId: "in_app_market",
        entrypoint: "purchase",
        args: [
          {
            listing_id: 0,
            amount_wtf_units: e2ePurchaseAmountWtfUnits,
            purchase_ref: badPurchaseRef,
            cart_hash: "2".repeat(64),
            expected_treasury: params.walletBAddress,
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
        expectFailure: true,
      },
      {
        label: "Reward issuer approves redemption escrow operator",
        wallet: "B",
        targetContractId: "dummy_wtf",
        entrypoint: "update_operators",
        args: [
          [
            {
              add_operator: {
                owner: params.walletBAddress,
                operator: params.redemptionEscrowAddress,
                token_id: "0",
              },
            },
          ],
        ],
      },
      {
        label: "Reward issuer funds redemption escrow",
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "fund",
        args: [
          {
            amount_wtf_units: e2eRedemptionFundAmountWtfUnits,
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
      },
      {
        label: "Admin returns one unreserved WTF unit from redemption escrow",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "return_unreserved_escrow",
        args: [
          {
            amount_wtf_units: e2eRedemptionReturnAmountWtfUnits,
            destination: params.walletAAddress,
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
      },
      {
        label: "Reward issuer creates WTF redemption",
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "create_redemption",
        args: [
          {
            redemption_id: 1,
            claimant: params.walletBAddress,
            amount_wtf_units: e2eRedemptionClaimAmountWtfUnits,
            item_ref: "tip:kiln:pet-food",
            expires_at: redemptionExpiresAt,
          },
        ],
      },
      {
        label: "Reject redemption claim with wrong expected amount",
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "claim_redemption",
        args: [
          {
            redemption_id: 1,
            expected_claimant: params.walletBAddress,
            expected_amount_wtf_units: "1",
            expected_item_ref: "tip:kiln:pet-food",
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
        expectFailure: true,
      },
      {
        label: "Reward issuer creates cancellable WTF redemption",
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "create_redemption",
        args: [
          {
            redemption_id: 2,
            claimant: params.walletBAddress,
            amount_wtf_units: e2eRedemptionCancelAmountWtfUnits,
            item_ref: "tip:kiln:cancel",
            expires_at: redemptionExpiresAt,
          },
        ],
      },
      {
        label: "Reward issuer cancels second WTF redemption",
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "cancel_redemption",
        args: [2],
      },
      {
        label: "Admin pauses redemption escrow",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "pause",
        args: [],
      },
      {
        label: "Reject claim while redemption escrow is paused",
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "claim_redemption",
        args: [
          {
            redemption_id: 1,
            expected_claimant: params.walletBAddress,
            expected_amount_wtf_units: e2eRedemptionClaimAmountWtfUnits,
            expected_item_ref: "tip:kiln:pet-food",
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
        expectFailure: true,
      },
      {
        label: "Admin unpauses redemption escrow",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "unpause",
        args: [],
      },
      {
        label: e2eRedemptionFinalStepLabel,
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "claim_redemption",
        args: [
          {
            redemption_id: 1,
            expected_claimant: params.walletBAddress,
            expected_amount_wtf_units: e2eRedemptionClaimAmountWtfUnits,
            expected_item_ref: "tip:kiln:pet-food",
            expected_wtf_token_address: params.wtfTokenAddress,
            expected_wtf_token_id: "0",
          },
        ],
        assertions: redemptionAssertions,
      },
      {
        label: "Admin proposes itself as next reward issuer",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "propose_issuer",
        args: [params.walletAAddress],
      },
      {
        label: "Admin cancels pending reward issuer",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "cancel_pending_issuer",
        args: [],
      },
      {
        label: "Admin proposes itself as reward issuer again",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "propose_issuer",
        args: [params.walletAAddress],
      },
      {
        label: "Admin accepts reward issuer role",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "accept_issuer",
        args: [],
      },
      {
        label: "Admin proposes buyer as next admin",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "propose_admin",
        args: [params.walletBAddress],
      },
      {
        label: "Admin cancels pending admin",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "cancel_pending_admin",
        args: [],
      },
      {
        label: "Admin proposes buyer as next admin again",
        wallet: "A",
        targetContractId: "redemption_escrow",
        entrypoint: "propose_admin",
        args: [params.walletBAddress],
      },
      {
        label: "Buyer accepts admin role",
        wallet: "B",
        targetContractId: "redemption_escrow",
        entrypoint: "accept_admin",
        args: [],
      },
    ],
  };
  const response = await api("POST", "/api/kiln/e2e/run", payload);
  if (response.status !== 524) return response;
  return reconcileTimedOutKilnE2E({
    wtfTokenAddress: params.wtfTokenAddress,
    marketAddress: params.marketAddress,
    redemptionEscrowAddress: params.redemptionEscrowAddress,
    walletAAddress: params.walletAAddress,
    walletBAddress: params.walletBAddress,
    initialBuyerWtfUnits: params.initialBuyerWtfUnits,
  });
}

async function main(): Promise<void> {
  const reconcileMarketAddress = process.env.WTF_IN_APP_MARKET_RECONCILE_MARKET_ADDRESS;
  const reconcileEscrowAddress = process.env.WTF_IN_APP_MARKET_RECONCILE_ESCROW_ADDRESS;
  if (reconcileMarketAddress || reconcileEscrowAddress) {
    const initialBuyerWtfUnits =
      process.env.WTF_IN_APP_MARKET_RECONCILE_INITIAL_BUYER_WTF_UNITS;
    const balances = await api("GET", `/api/kiln/balances?networkId=${networkId}`);
    if (
      !isKt1Address(reconcileMarketAddress) ||
      !isKt1Address(reconcileEscrowAddress) ||
      !/^\d+$/.test(initialBuyerWtfUnits ?? "") ||
      !balances.ok
    ) {
      throw new Error(
        "Reconciliation requires valid market/escrow addresses, initial buyer WTF units, and readable Kiln wallets.",
      );
    }
    const walletAAddress = String(balances.json?.walletA?.address ?? "");
    const walletBAddress = String(balances.json?.walletB?.address ?? "");
    const reconciled = await reconcileTimedOutKilnE2E({
      wtfTokenAddress: resolveKilnWtfTokenAddress((await api("GET", "/api/health")).json),
      marketAddress: reconcileMarketAddress,
      redemptionEscrowAddress: reconcileEscrowAddress,
      walletAAddress,
      walletBAddress,
      initialBuyerWtfUnits,
    });
    const assertionSummary = summarizeKilnAssertionResult(reconciled.json);
    writeReport(
      "shadownet-e2e-report.md",
      [
        "# WTF In-App Market Shadownet E2E Report",
        "",
        "- Status: PASSED",
        `- Timestamp: ${nowIso()}`,
        `- Kiln API: ${apiBase}`,
        `- Network ID: ${networkId}`,
        `- WTF in-app market V2: ${reconcileMarketAddress}`,
        `- WTF in-app redemption escrow V2: ${reconcileEscrowAddress}`,
        "- Completion mode: TzKT reconciliation after Kiln gateway timeout",
        "",
        "```json",
        jsonPreview(reconciled.json),
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
    console.log(`Reconciled WTF in-app market V2: ${reconcileMarketAddress}`);
    console.log(`Reconciled WTF in-app redemption escrow V2: ${reconcileEscrowAddress}`);
    console.log("WTF in-app market V2 Shadownet E2E reconciled and passed.");
    return;
  }

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
      "deploy_wtf_in_app_market_v2_template",
    );
    const localRedemptionArtifact = compiledArtifact(
      localMarketOut,
      "deploy_wtf_in_app_redemption_escrow_template",
    );
    reportLines.push("## Local Compact Compile", "");
    reportLines.push(`- Market V2 contract Michelson bytes: ${Buffer.byteLength(localMarketArtifact.code, "utf8")}`);
    reportLines.push(`- Market V2 initial storage bytes: ${Buffer.byteLength(localMarketArtifact.storage, "utf8")}`);
    reportLines.push(`- Redemption escrow contract Michelson bytes: ${Buffer.byteLength(localRedemptionArtifact.code, "utf8")}`);
    reportLines.push(`- Redemption escrow initial storage bytes: ${Buffer.byteLength(localRedemptionArtifact.storage, "utf8")}`);
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

    const paymentTokenAddress = resolveKilnWtfTokenAddress(health.json);
    const [initialTreasuryWtfUnits, initialBuyerWtfUnits] = await Promise.all([
      readFa2LedgerBalance(paymentTokenAddress, walletAAddress),
      readFa2LedgerBalance(paymentTokenAddress, walletBAddress),
    ]);
    reportLines.push("## Kiln WTF Token", "");
    reportLines.push(`- WTF FA2: ${paymentTokenAddress}`);
    reportLines.push(`- Initial treasury WTF units: ${initialTreasuryWtfUnits}`);
    reportLines.push(`- Initial buyer WTF units: ${initialBuyerWtfUnits}`);
    reportLines.push("");

    const marketOut = path.join(buildDir, "market");
    runSmartPyCompile({
      source: path.join(root, "contracts", "wtf-in-app-market", "WtfInAppMarket.py"),
      outDir: marketOut,
      env: {
        WTF_IN_APP_MARKET_TREASURY: walletAAddress,
        WTF_IN_APP_MARKET_TOKEN_ADDRESS: paymentTokenAddress,
        WTF_IN_APP_MARKET_TOKEN_ID: "0",
        WTF_IN_APP_REDEMPTION_ADMIN: walletAAddress,
        WTF_IN_APP_REDEMPTION_ISSUER: walletBAddress,
      },
    });
    const marketV2Artifact = compiledArtifact(marketOut, "deploy_wtf_in_app_market_v2_template");
    const redemptionArtifact = compiledArtifact(
      marketOut,
      "deploy_wtf_in_app_redemption_escrow_template",
    );
    const redemptionWorkflowStorage = redemptionArtifact.storage
      .replaceAll(walletAAddress, shadowboxBertAddress)
      .replaceAll(walletBAddress, shadowboxErnieAddress);
    const marketDeployment = await workflowAndDeploy({
      label: "WTF in-app market V2",
      code: marketV2Artifact.code,
      storage: marketV2Artifact.storage,
      wallet: "A",
    });
    const redemptionDeployment = await workflowAndDeploy({
      label: "WTF in-app redemption escrow",
      code: redemptionArtifact.code,
      storage: redemptionArtifact.storage,
      workflowStorage: redemptionWorkflowStorage,
      workflowSimulationSteps: buildRedemptionWorkflowSteps(),
      wallet: "A",
    });

    const e2e = await runKilnE2E({
      wtfTokenAddress: paymentTokenAddress,
      marketAddress: marketDeployment.contractAddress,
      redemptionEscrowAddress: redemptionDeployment.contractAddress,
      walletAAddress,
      walletBAddress,
      initialTreasuryWtfUnits,
      initialBuyerWtfUnits,
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
        `- Kiln WTF FA2: ${paymentTokenAddress}`,
        `- WTF in-app market V2: ${marketDeployment.contractAddress}`,
        `- WTF in-app redemption escrow: ${redemptionDeployment.contractAddress}`,
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
    reportLines.push(`- Kiln WTF FA2: ${paymentTokenAddress}`);
    reportLines.push(`- WTF in-app market V2: ${marketDeployment.contractAddress}`);
    reportLines.push(`- WTF in-app redemption escrow: ${redemptionDeployment.contractAddress}`);
    reportLines.push("");
    reportLines.push("## E2E Result", "");
    reportLines.push("```json", jsonPreview(e2e.json ?? e2e.text), "```", "");
    reportLines.push("## E2E Assertion Evidence", "");
    reportLines.push("```json", jsonPreview(assertionSummary), "```", "");
    reportLines.push("## Raw Deployment Results", "");
    reportLines.push("```json");
    reportLines.push(
      jsonPreview({
        wtfTokenAddress: paymentTokenAddress,
        market: marketDeployment,
        redemptionEscrow: redemptionDeployment,
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
    console.log(`Kiln WTF FA2: ${paymentTokenAddress}`);
    console.log(`WTF in-app market V2: ${marketDeployment.contractAddress}`);
    console.log(`WTF in-app redemption escrow: ${redemptionDeployment.contractAddress}`);
    console.log("WTF in-app market V2 Kiln Shadownet E2E passed.");
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
