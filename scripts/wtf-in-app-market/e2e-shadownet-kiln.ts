import { mkdirSync, writeFileSync } from "node:fs";
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
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN;
const mintAmountWtfUnits = "100000000000";
const purchaseAmountWtfUnits = "2500000000";
const purchaseStepLabel = "Buyer purchases pet medicine";

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

function writeMarkdownReport(status: "BLOCKED" | "FAILED" | "PASSED", lines: string[]): void {
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    path.join(docsDir, "shadownet-e2e-report.md"),
    [
      "# WTF In-App Market Shadownet E2E Report",
      "",
      `- Status: ${status}`,
      `- Timestamp: ${nowIso()}`,
      `- Kiln API: ${apiBase}`,
      `- Network ID: ${networkId}`,
      "",
      ...lines,
      "",
    ].join("\n"),
  );
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

async function main(): Promise<void> {
  const dummyWtfAddress = process.env.DUMMY_WTF_ADDRESS;
  const marketAddress = process.env.IN_APP_MARKET_ADDRESS ?? process.env.WTF_IN_APP_MARKET_ADDRESS;

  const missing: string[] = [];
  if (!dummyWtfAddress) missing.push("DUMMY_WTF_ADDRESS");
  if (!marketAddress) missing.push("IN_APP_MARKET_ADDRESS");
  if (missing.length > 0) {
    writeMarkdownReport("BLOCKED", [
      "## Blocker",
      "",
      `Missing required environment variables: ${missing.join(", ")}`,
      "",
      "- `DUMMY_WTF_ADDRESS`: Shadownet dummy FA2 KT1 address deployed through Kiln.",
      "- `IN_APP_MARKET_ADDRESS`: Shadownet market KT1 address deployed through Kiln.",
    ]);
    console.error(`BLOCKED: missing env vars ${missing.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const health = await api("GET", "/api/health", undefined, undefined);
  const paymentTokenAddress =
    typeof health.json?.tokens?.bronze === "string"
      ? health.json.tokens.bronze
      : dummyWtfAddress;

  const balances = await api("GET", `/api/kiln/balances?networkId=${networkId}`);
  if (!balances.ok) {
    const status = balances.status === 401 || balances.status === 403 ? "BLOCKED" : "FAILED";
    writeMarkdownReport(status, [
      "## Kiln Balances Probe",
      "",
      `HTTP ${balances.status}`,
      "",
      "```json",
      jsonPreview(balances.json ?? balances.text),
      "```",
    ]);
    console.error(`Kiln balances probe failed with HTTP ${balances.status}`);
    process.exitCode = status === "BLOCKED" ? 2 : 1;
    return;
  }

  const walletAAddress = String(balances.json?.walletA?.address ?? "");
  const walletBAddress = String(balances.json?.walletB?.address ?? "");
  if (!walletAAddress || !walletBAddress) {
    writeMarkdownReport("FAILED", [
      "Kiln did not return both puppet wallet addresses.",
      "",
      "```json",
      jsonPreview(balances.json),
      "```",
    ]);
    process.exitCode = 1;
    return;
  }

  const purchaseRef = `kiln-rerun-${Date.now().toString(36)}`;
  const assertions = buildInAppMarketAssertions({
    dummyWtfAddress,
    paymentTokenAddress,
    marketAddress,
    walletAAddress,
    walletBAddress,
    mintAmountWtfUnits,
    purchaseAmountWtfUnits,
    purchaseStepLabel,
  });
  const payload = {
    networkId,
    contracts: [
      {
        id: "dummy_wtf",
        address: dummyWtfAddress,
        entrypoints: ["mint", "update_operators", "transfer"],
      },
      {
        id: "in_app_market",
        address: marketAddress,
        entrypoints: ["purchase"],
      },
    ],
    steps: [
      {
        label: "Mint dummy WTF to buyer",
        wallet: "A",
        targetContractId: "dummy_wtf",
        entrypoint: "mint",
        args: [[{ to_: walletBAddress, amount: mintAmountWtfUnits }]],
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
                owner: walletBAddress,
                operator: marketAddress,
                token_id: "0",
              },
            },
          ],
        ],
      },
      {
        label: purchaseStepLabel,
        wallet: "B",
        targetContractId: "in_app_market",
        entrypoint: "purchase",
        args: [
          {
            listing_id: 1,
            amount_wtf_units: purchaseAmountWtfUnits,
            purchase_ref: purchaseRef,
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
              from_: walletBAddress,
              txs: [
                {
                  to_: walletAAddress,
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
            listing_id: 1,
            amount_wtf_units: "2500000000",
            purchase_ref: `${purchaseRef}-xtz`,
          },
        ],
        amountMutez: 1,
        expectFailure: true,
      },
    ],
  };

  const e2e = await api("POST", "/api/kiln/e2e/run", payload);
  const assertionSummary = summarizeKilnAssertionResult(e2e.json);
  const status = e2e.ok && e2e.json?.success && assertionSummary.ok ? "PASSED" : "FAILED";
  writeMarkdownReport(status, [
    "## Addresses",
    "",
    `- Dummy WTF FA2: ${dummyWtfAddress}`,
    `- Payment WTF FA2: ${paymentTokenAddress}`,
    `- WTF in-app market: ${marketAddress}`,
    `- Kiln wallet A: ${walletAAddress}`,
    `- Kiln wallet B: ${walletBAddress}`,
    "",
    "## Result",
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
  ]);

  if (status !== "PASSED") {
    console.error(
      `Kiln E2E failed with HTTP ${e2e.status}; missing assertion kinds: ${
        assertionSummary.missingKinds.join(", ") || "none"
      }`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("WTF in-app market Kiln Shadownet E2E passed.");
}

await main();
