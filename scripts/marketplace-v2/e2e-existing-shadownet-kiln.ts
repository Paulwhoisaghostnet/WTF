import { mkdirSync, writeFileSync } from "node:fs";
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
const apiBase = (process.env.KILN_API_URL ?? "https://kiln.wtfgameshow.app").replace(/\/$/, "");
const tzktApiBase = (process.env.SHADOWNET_TZKT_API_URL ?? "https://api.shadownet.tzkt.io/v1").replace(/\/$/, "");
const networkId = process.env.KILN_NETWORK_ID ?? "tezos-shadownet";
const kilnToken = process.env.KILN_API_TOKEN ?? process.env.API_AUTH_TOKEN;

type ApiResult = {
  status: number;
  ok: boolean;
  text: string;
  json: any;
};

const marketAddress =
  process.env.WTF_E2E_MARKETPLACE_V2_ADDRESS ??
  process.env.MARKETPLACE_CONTRACT_ADDRESS ??
  "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const dummyWtfAddress =
  process.env.WTF_E2E_MARKETPLACE_WTF_FA2 ??
  process.env.WTF_TOKEN_CONTRACT ??
  "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj";
const sampleFa2Address =
  process.env.WTF_E2E_MARKETPLACE_SAMPLE_FA2 ??
  "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V";

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
const finalStepLabel = "Admin unpauses existing Marketplace V2";

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

function writeReport(status: "BLOCKED" | "FAILED" | "PASSED", lines: string[]): void {
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    path.join(docsDir, "shadownet-existing-e2e-report.md"),
    [
      "# WTF Marketplace V2 Existing Shadownet E2E Report",
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

function shouldRetry(result: ApiResult | { status: number; text: string }): boolean {
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

async function fetchJsonWithRetry(
  url: string,
  attempts = 6,
): Promise<{ status: number; json: any; text: string }> {
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

async function main(): Promise<void> {
  const reportLines: string[] = [
    "## Addresses",
    "",
    `- Existing Marketplace V2: ${marketAddress}`,
    `- Kiln WTF FA2: ${dummyWtfAddress}`,
    `- Existing sample FA2: ${sampleFa2Address}`,
    "",
  ];

  if (process.env.TEZOS_NETWORK === "mainnet" || networkId.includes("mainnet")) {
    writeReport("BLOCKED", [
      ...reportLines,
      "Refusing to run existing-contract E2E on mainnet.",
    ]);
    throw new Error("Refusing to run existing-contract E2E on mainnet.");
  }

  if (!kilnToken) {
    writeReport("BLOCKED", [
      ...reportLines,
      "Missing `KILN_API_TOKEN` or `API_AUTH_TOKEN`; Kiln protected routes cannot be called.",
    ]);
    console.error("BLOCKED: missing KILN_API_TOKEN or API_AUTH_TOKEN.");
    process.exitCode = 2;
    return;
  }

  const balances = await apiWithRetry("GET", `/api/kiln/balances?networkId=${networkId}`);
  if (!balances.ok || !balances.json?.walletA?.address || !balances.json?.walletB?.address) {
    writeReport("FAILED", [
      ...reportLines,
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
  const marketStorage = await readStorage(marketAddress);
  if (marketStorage.admin !== walletAAddress) {
    writeReport("BLOCKED", [
      ...reportLines,
      `Marketplace admin ${marketStorage.admin} does not match Kiln wallet A ${walletAAddress}.`,
    ]);
    throw new Error("Existing marketplace admin does not match Kiln wallet A.");
  }
  if (marketStorage.paused) {
    writeReport("BLOCKED", [
      ...reportLines,
      "Existing marketplace is paused before the test; refusing to stack an E2E run on top of a paused contract.",
    ]);
    throw new Error("Existing marketplace is paused before the test.");
  }
  if (marketStorage.wtf_token_address !== dummyWtfAddress) {
    writeReport("BLOCKED", [
      ...reportLines,
      `Marketplace WTF token ${marketStorage.wtf_token_address} does not match configured ${dummyWtfAddress}.`,
    ]);
    throw new Error("Existing marketplace WTF token does not match configured dummy WTF.");
  }

  const listingId = String(marketStorage.next_listing_id ?? "0");
  const offerId = BigInt(marketStorage.next_offer_id ?? "0");
  const auctionId = String(marketStorage.next_auction_id ?? "0");
  const auctionStart = new Date(Date.now() - 60_000).toISOString();
  const auctionEnd = new Date(Date.now() + 60 * 60_000).toISOString();
  const buyerWtfBefore = await readFa2Balance({
    tokenAddress: dummyWtfAddress,
    owner: walletBAddress,
    tokenId: wtfTokenId,
  });
  const buyerSampleFa2Before = await readFa2Balance({
    tokenAddress: sampleFa2Address,
    owner: walletBAddress,
    tokenId: nftTokenId,
  });
  const expectedBuyerWtfUnits = (
    buyerWtfBefore +
    BigInt(buyerMintAmountWtfUnits) -
    BigInt(listingBuyQuantity) * BigInt(listingUnitWtf) -
    BigInt(acceptedOfferQuantity) * BigInt(acceptedOfferUnitWtf)
  ).toString();
  const expectedBuyerSampleFa2Units = (
    buyerSampleFa2Before +
    BigInt(listingBuyQuantity) +
    BigInt(acceptedOfferQuantity)
  ).toString();
  const tokenRef = {
    token_contract: sampleFa2Address,
    token_id: nftTokenId,
  };
  const assertions = buildMarketplaceV2Assertions({
    dummyWtfAddress,
    sampleFa2Address,
    marketAddress,
    walletAAddress,
    walletBAddress,
    finalStepLabel,
    expectedBuyerWtfUnits,
    expectedBuyerSampleFa2Units,
  });
  const payload = {
    networkId,
    contracts: [
      {
        id: "dummy_wtf",
        address: dummyWtfAddress,
        entrypoints: ["mint_tokens", "update_operators", "transfer"],
      },
      {
        id: "sample_fa2",
        address: sampleFa2Address,
        entrypoints: ["mint", "update_operators", "transfer"],
      },
      {
        id: "marketplace_v2",
        address: marketAddress,
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
              to_: walletBAddress,
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
        args: [[{ to_: walletAAddress, amount: sampleMintAmount }]],
      },
      {
        label: "Seller approves existing Marketplace V2 for sample FA2",
        wallet: "A",
        targetContractId: "sample_fa2",
        entrypoint: "update_operators",
        args: [
          [
            {
              add_operator: {
                owner: walletAAddress,
                operator: marketAddress,
                token_id: nftTokenId,
              },
            },
          ],
        ],
      },
      {
        label: "Buyer approves existing Marketplace V2 for Kiln WTF token",
        wallet: "B",
        targetContractId: "dummy_wtf",
        entrypoint: "update_operators",
        args: [
          [
            {
              add_operator: {
                owner: walletBAddress,
                operator: marketAddress,
                token_id: wtfTokenId,
              },
            },
          ],
        ],
      },
      {
        label: "Seller zero-transfers sample FA2 for coverage",
        wallet: "A",
        targetContractId: "sample_fa2",
        entrypoint: "transfer",
        args: [
          [
            {
              from_: walletAAddress,
              txs: [
                {
                  to_: walletAAddress,
                  token_id: nftTokenId,
                  amount: "0",
                },
              ],
            },
          ],
        ],
      },
      {
        label: "Buyer zero-transfers Kiln WTF token for coverage",
        wallet: "B",
        targetContractId: "dummy_wtf",
        entrypoint: "transfer",
        args: [
          [
            {
              from_: walletBAddress,
              txs: [
                {
                  to_: walletBAddress,
                  token_id: wtfTokenId,
                  amount: "0",
                },
              ],
            },
          ],
        ],
      },
      {
        label: "Seller creates explicit quantity listing on existing Marketplace V2",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "create_listing",
        args: [
          {
            token_contract: sampleFa2Address,
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
        label: "Buyer stale expected price is rejected",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "buy_listing",
        args: [
          {
            listing_id: listingId,
            quantity: "1",
            expected_token: tokenRef,
            expected_owner: walletAAddress,
            expected_unit_price_wtf: "999999",
          },
        ],
        expectFailure: true,
      },
      {
        label: "Buyer buys two editions with expected terms",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "buy_listing",
        args: [
          {
            listing_id: listingId,
            quantity: listingBuyQuantity,
            expected_token: tokenRef,
            expected_owner: walletAAddress,
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
            token_contract: sampleFa2Address,
            token_id: nftTokenId,
            target_owner: walletAAddress,
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
            offer_id: offerId.toString(),
            expected_token: tokenRef,
            expected_target_owner: walletAAddress,
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
            token_contract: sampleFa2Address,
            token_id: nftTokenId,
            target_owner: walletAAddress,
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
        args: [(offerId + 1n).toString()],
      },
      {
        label: "Seller creates auction with explicit quantity",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "create_auction",
        args: [
          {
            token_contract: sampleFa2Address,
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
        args: [auctionId],
      },
      {
        label: "Admin pauses existing Marketplace V2",
        wallet: "A",
        targetContractId: "marketplace_v2",
        entrypoint: "pause",
        args: [],
      },
      {
        label: "Paused existing Marketplace V2 rejects new offer",
        wallet: "B",
        targetContractId: "marketplace_v2",
        entrypoint: "place_offer",
        args: [
          {
            token_contract: sampleFa2Address,
            token_id: nftTokenId,
            target_owner: walletAAddress,
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

  const e2e = await apiWithRetry("POST", "/api/kiln/e2e/run", payload);
  const assertionSummary = summarizeKilnAssertionResult(e2e.json);
  const status = e2e.ok && e2e.json?.success && assertionSummary.ok ? "PASSED" : "FAILED";
  writeReport(status, [
    ...reportLines,
    "## Puppets",
    "",
    `- Kiln wallet A/admin/seller: ${walletAAddress}`,
    `- Kiln wallet B/buyer: ${walletBAddress}`,
    "",
    "## Reused IDs",
    "",
    `- Listing id: ${listingId}`,
    `- Accepted offer id: ${offerId.toString()}`,
    `- Cancelled offer id: ${(offerId + 1n).toString()}`,
    `- Auction id: ${auctionId}`,
    "",
    "## Expected Final Balances",
    "",
    `- Buyer WTF units: ${expectedBuyerWtfUnits}`,
    `- Buyer sample FA2 units: ${expectedBuyerSampleFa2Units}`,
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
      `Existing Marketplace V2 Kiln E2E failed with HTTP ${e2e.status}; missing assertion kinds: ${
        assertionSummary.missingKinds.join(", ") || "none"
      }: ${e2e.text}`,
    );
  }

  console.log(`Existing Marketplace V2: ${marketAddress}`);
  console.log(`Kiln WTF FA2: ${dummyWtfAddress}`);
  console.log(`Sample FA2: ${sampleFa2Address}`);
  console.log(`Kiln wallet A/admin/seller: ${walletAAddress}`);
  console.log(`Kiln wallet B/buyer: ${walletBAddress}`);
  console.log("Existing Marketplace V2 Kiln Shadownet E2E passed.");
}

await main();
