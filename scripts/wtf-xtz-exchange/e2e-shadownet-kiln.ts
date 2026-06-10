import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildWtfXtzExchangeAssertions,
  summarizeKilnAssertionResult,
} from "../kiln/e2e-assertions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-xtz-exchange");
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const tzktApiBase = (process.env.SHADOWNET_TZKT_API_URL ?? "https://api.shadownet.tzkt.io/v1").replace(/\/$/, "");
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN ?? process.env.API_AUTH_TOKEN;

const configuredWtfAddress = process.env.WTF_TOKEN_ADDRESS ?? process.env.DUMMY_WTF_ADDRESS;
const exchangeAddress = process.env.EXCHANGE_ADDRESS;
const kilnNamedWtfAddress = "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj";
const wtfTokenId = process.env.WTF_TOKEN_ID ?? "0";

const escrowMutez = BigInt(process.env.E2E_ESCROW_MUTEZ ?? "1000000");
const rateNumeratorMutez = BigInt(process.env.E2E_RATE_NUMERATOR_MUTEZ ?? "100");
const rateDenominatorWtfUnits = BigInt(process.env.E2E_RATE_DENOMINATOR_WTF_UNITS ?? "1");
const firstFillWtf = BigInt(process.env.E2E_FIRST_FILL_WTF_UNITS ?? "1000");
const secondFillWtf = BigInt(process.env.E2E_SECOND_FILL_WTF_UNITS ?? "2000");
const overfillWtf = BigInt(process.env.E2E_OVERFILL_WTF_UNITS ?? "8000");
const mintAmount = BigInt(process.env.E2E_MINT_WTF_UNITS ?? "100000");
const finalStepLabel = "Listing owner cancels remaining escrow";

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

function writeMarkdownReport(status: "BLOCKED" | "FAILED" | "PASSED", lines: string[]): void {
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    path.join(docsDir, "shadownet-e2e-report.md"),
    [
      "# Shadownet E2E Report",
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

function shouldRetry(result: { status: number; text: string }): boolean {
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
  for (let attempt = 1; attempt < attempts && shouldRetry(last); attempt += 1) {
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
    if (response.ok || response.status === 204 || !shouldRetry({ status: response.status, text: lastText })) {
      return { status: lastStatus, json: lastJson, text: lastText };
    }
    await sleep(1500 * attempt);
  }
  return { status: lastStatus, json: lastJson, text: lastText };
}

async function readStorage(contractAddress: string): Promise<any> {
  const storage = await fetchJsonWithRetry(`${tzktApiBase}/contracts/${contractAddress}/storage`);
  if (storage.status < 200 || storage.status >= 300 || !storage.json) {
    throw new Error(
      `Unable to read storage for ${contractAddress}: ${storage.status} ${storage.text.slice(0, 500)}`,
    );
  }
  return storage.json;
}

async function readBigMapKey(bigMapId: number | string, key: unknown): Promise<any | null> {
  const encoded = encodeURIComponent(typeof key === "string" ? key : JSON.stringify(key));
  const entry = await fetchJsonWithRetry(`${tzktApiBase}/bigmaps/${bigMapId}/keys/${encoded}`);
  if (entry.status === 204 || entry.status === 404) return null;
  if (entry.status < 200 || entry.status >= 300) {
    throw new Error(
      `Unable to read big map ${bigMapId} key ${encoded}: ${entry.status} ${entry.text.slice(0, 500)}`,
    );
  }
  return entry.json;
}

async function readFa2Balance(params: {
  tokenAddress: string;
  owner: string;
  tokenId: string;
}): Promise<bigint> {
  const storage = await readStorage(params.tokenAddress);
  if (!storage.ledger) {
    throw new Error(`Unable to read TzKT ledger id for ${params.tokenAddress}`);
  }
  const pairKey = {
    address: params.owner,
    nat: params.tokenId,
  };
  const pairEntry = await readBigMapKey(storage.ledger, pairKey);
  if (pairEntry) return BigInt(pairEntry.value ?? "0");
  const addressEntry = await readBigMapKey(storage.ledger, params.owner);
  if (addressEntry) return BigInt(addressEntry.value ?? "0");
  return 0n;
}

function swapArgs(params: {
  listingId: string;
  wtfAmount: bigint;
  owner: string;
  expectedXtzOut?: bigint;
}) {
  const expectedXtzOut =
    params.expectedXtzOut ??
    (params.wtfAmount * rateNumeratorMutez) / rateDenominatorWtfUnits;
  return {
    listing_id: params.listingId,
    wtf_amount: params.wtfAmount.toString(),
    expected_owner: params.owner,
    expected_rate_numerator_mutez: rateNumeratorMutez.toString(),
    expected_rate_denominator_wtf_units: rateDenominatorWtfUnits.toString(),
    expected_xtz_out_mutez: expectedXtzOut.toString(),
  };
}

async function main(): Promise<void> {
  const missing: string[] = [];
  if (!exchangeAddress) missing.push("EXCHANGE_ADDRESS");
  if (!kilnToken) missing.push("KILN_API_TOKEN or API_AUTH_TOKEN");
  if (missing.length > 0) {
    writeMarkdownReport("BLOCKED", [
      "## Blocker",
      "",
      `Missing required environment variables: ${missing.join(", ")}`,
      "",
      "- `EXCHANGE_ADDRESS`: Shadownet exchange KT1 address deployed through Kiln.",
      "- `KILN_API_TOKEN` or `API_AUTH_TOKEN`: token for protected Kiln mutation routes.",
    ]);
    console.error(`BLOCKED: missing env vars ${missing.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const balances = await apiWithRetry("GET", `/api/kiln/balances?networkId=${networkId}`);
  if (!balances.ok || !balances.json?.walletA?.address || !balances.json?.walletB?.address) {
    writeMarkdownReport("FAILED", [
      "## Kiln Balances Probe",
      "",
      `HTTP ${balances.status}`,
      "",
      "```json",
      jsonPreview(balances.json ?? balances.text),
      "```",
    ]);
    throw new Error(`Unable to read Kiln puppet wallets: ${balances.status} ${balances.text}`);
  }

  const walletAAddress = String(balances.json.walletA.address);
  const walletBAddress = String(balances.json.walletB.address);
  const exchangeStorage = await readStorage(exchangeAddress!);
  const exchangeWtfTokenAddress = String(exchangeStorage.wtf_token_address ?? configuredWtfAddress ?? "");
  if (!exchangeWtfTokenAddress) {
    throw new Error(`Exchange storage for ${exchangeAddress} does not expose wtf_token_address.`);
  }
  const listingId = String(exchangeStorage.next_listing_id ?? "0");
  const mintEntrypoint =
    process.env.WTF_TOKEN_MINT_ENTRYPOINT ??
    (exchangeWtfTokenAddress === kilnNamedWtfAddress ? "mint_tokens" : "mint");
  const mintArgs =
    mintEntrypoint === "mint_tokens"
      ? [[{ token_id: wtfTokenId, to_: walletBAddress, amount: mintAmount.toString() }]]
      : [[{ to_: walletBAddress, amount: mintAmount.toString() }]];
  const ownerWtfBefore = await readFa2Balance({
    tokenAddress: exchangeWtfTokenAddress,
    owner: walletAAddress,
    tokenId: wtfTokenId,
  });
  const buyerWtfBefore = await readFa2Balance({
    tokenAddress: exchangeWtfTokenAddress,
    owner: walletBAddress,
    tokenId: wtfTokenId,
  });
  const firstXtzOut = (firstFillWtf * rateNumeratorMutez) / rateDenominatorWtfUnits;
  const secondXtzOut = (secondFillWtf * rateNumeratorMutez) / rateDenominatorWtfUnits;
  const overfillXtzOut = (overfillWtf * rateNumeratorMutez) / rateDenominatorWtfUnits;
  const expectedOwnerWtfUnits = (ownerWtfBefore + firstFillWtf + secondFillWtf).toString();
  const expectedBuyerWtfUnits = (buyerWtfBefore + mintAmount - firstFillWtf - secondFillWtf).toString();
  const assertions = buildWtfXtzExchangeAssertions({
    wtfTokenAddress: exchangeWtfTokenAddress,
    exchangeAddress: exchangeAddress!,
    walletAAddress,
    walletBAddress,
    finalStepLabel,
    expectedExchangeBalanceMutez: "0",
    expectedOwnerWtfUnits,
    expectedBuyerWtfUnits,
  });

  const payload = {
    networkId,
    contracts: [
      {
        id: "wtf_token",
        address: exchangeWtfTokenAddress,
        entrypoints: [mintEntrypoint, "update_operators", "transfer"],
      },
      {
        id: "wtf_xtz_exchange",
        address: exchangeAddress,
        entrypoints: ["create_listing", "swap", "cancel_listing", "pause", "unpause"],
      },
    ],
    steps: [
      {
        label: "Mint configured WTF to taker",
        wallet: "A",
        targetContractId: "wtf_token",
        entrypoint: mintEntrypoint,
        args: mintArgs,
      },
      {
        label: "Taker approves exchange as WTF operator",
        wallet: "B",
        targetContractId: "wtf_token",
        entrypoint: "update_operators",
        args: [
          [
            {
              add_operator: {
                owner: walletBAddress,
                operator: exchangeAddress,
                token_id: wtfTokenId,
              },
            },
          ],
        ],
      },
      {
        label: "Taker zero-transfers configured WTF for coverage",
        wallet: "B",
        targetContractId: "wtf_token",
        entrypoint: "transfer",
        args: [
          [
            {
              from_: walletBAddress,
              txs: [{ to_: walletBAddress, token_id: wtfTokenId, amount: "0" }],
            },
          ],
        ],
      },
      {
        label: "Reject mismatched explicit escrow amount",
        wallet: "A",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "create_listing",
        amountMutez: 1,
        args: [
          {
            escrow_mutez: "2",
            rate_numerator_mutez: rateNumeratorMutez.toString(),
            rate_denominator_wtf_units: rateDenominatorWtfUnits.toString(),
          },
        ],
        expectFailure: true,
      },
      {
        label: "Listing owner creates fixed-rate XTZ escrow listing",
        wallet: "A",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "create_listing",
        amountMutez: Number(escrowMutez),
        args: [
          {
            escrow_mutez: escrowMutez.toString(),
            rate_numerator_mutez: rateNumeratorMutez.toString(),
            rate_denominator_wtf_units: rateDenominatorWtfUnits.toString(),
          },
        ],
      },
      {
        label: "Admin pauses exchange",
        wallet: "A",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "pause",
        args: [],
      },
      {
        label: "Paused exchange rejects swap",
        wallet: "B",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "swap",
        args: [swapArgs({ listingId, wtfAmount: firstFillWtf, owner: walletAAddress })],
        expectFailure: true,
      },
      {
        label: "Admin unpauses exchange",
        wallet: "A",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "unpause",
        args: [],
      },
      {
        label: "Reject stale expected XTZ output",
        wallet: "B",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "swap",
        args: [
          swapArgs({
            listingId,
            wtfAmount: firstFillWtf,
            owner: walletAAddress,
            expectedXtzOut: firstXtzOut - 1n,
          }),
        ],
        expectFailure: true,
      },
      {
        label: "Taker swaps first partial fill",
        wallet: "B",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "swap",
        args: [
          swapArgs({
            listingId,
            wtfAmount: firstFillWtf,
            owner: walletAAddress,
            expectedXtzOut: firstXtzOut,
          }),
        ],
      },
      {
        label: "Taker swaps second partial fill",
        wallet: "B",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "swap",
        args: [
          swapArgs({
            listingId,
            wtfAmount: secondFillWtf,
            owner: walletAAddress,
            expectedXtzOut: secondXtzOut,
          }),
        ],
      },
      {
        label: "Reject swap above remaining escrow",
        wallet: "B",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "swap",
        args: [
          swapArgs({
            listingId,
            wtfAmount: overfillWtf,
            owner: walletAAddress,
            expectedXtzOut: overfillXtzOut,
          }),
        ],
        expectFailure: true,
      },
      {
        label: finalStepLabel,
        wallet: "A",
        targetContractId: "wtf_xtz_exchange",
        entrypoint: "cancel_listing",
        args: [listingId],
        assertions,
      },
    ],
  };

  const e2e = await api("POST", "/api/kiln/e2e/run", payload);
  const assertionSummary = summarizeKilnAssertionResult(e2e.json);
  const status = e2e.ok && e2e.json?.success && assertionSummary.ok ? "PASSED" : "FAILED";
  writeMarkdownReport(status, [
    "## Addresses",
    "",
    `- Listing owner/admin: ${walletAAddress}`,
    `- Taker: ${walletBAddress}`,
    `- Configured WTF FA2: ${exchangeWtfTokenAddress}`,
    `- Exchange: ${exchangeAddress}`,
    `- Listing id: ${listingId}`,
    `- Mint entrypoint: ${mintEntrypoint}`,
    `- Token source: ${configuredWtfAddress === exchangeWtfTokenAddress ? "env matches storage" : "exchange storage"}`,
    "",
    "## Economic Terms",
    "",
    `- Escrow mutez: ${escrowMutez.toString()}`,
    `- Rate numerator mutez: ${rateNumeratorMutez.toString()}`,
    `- Rate denominator WTF units: ${rateDenominatorWtfUnits.toString()}`,
    `- First fill WTF units: ${firstFillWtf.toString()}`,
    `- First fill XTZ out mutez: ${firstXtzOut.toString()}`,
    `- Second fill WTF units: ${secondFillWtf.toString()}`,
    `- Second fill XTZ out mutez: ${secondXtzOut.toString()}`,
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
    throw new Error(
      `WTF-XTZ Kiln E2E failed with HTTP ${e2e.status}; missing assertion kinds: ${
        assertionSummary.missingKinds.join(", ") || "none"
      }: ${e2e.text}`,
    );
  }

  console.log("WTF-XTZ Kiln Shadownet E2E passed.");
}

await main();
