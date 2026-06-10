import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { InMemorySigner } from "@taquito/signer";
import { TezosToolkit } from "@taquito/taquito";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-xtz-exchange");

const rpcUrl = process.env.SHADOWNET_RPC_URL ?? "https://rpc.shadownet.teztnets.com";
const expectedChainId = process.env.SHADOWNET_CHAIN_ID ?? "NetXsqzbfFenSTS";
const dummyWtfAddress = process.env.DUMMY_WTF_ADDRESS;
const exchangeAddress = process.env.EXCHANGE_ADDRESS;
const listingOwnerKey = process.env.LISTING_OWNER_SECRET_KEY;
const takerKey = process.env.TAKER_SECRET_KEY;

const escrowMutez = BigInt(process.env.E2E_ESCROW_MUTEZ ?? "1000000");
const rateNumeratorMutez = BigInt(process.env.E2E_RATE_NUMERATOR_MUTEZ ?? "100");
const rateDenominatorWtfUnits = BigInt(process.env.E2E_RATE_DENOMINATOR_WTF_UNITS ?? "1");
const firstFillWtf = BigInt(process.env.E2E_FIRST_FILL_WTF_UNITS ?? "1000");
const secondFillWtf = BigInt(process.env.E2E_SECOND_FILL_WTF_UNITS ?? "2000");
const mintAmount = BigInt(process.env.E2E_MINT_WTF_UNITS ?? "100000");

function nowIso(): string {
  return new Date().toISOString();
}

function requiredEnv(): string[] {
  const missing: string[] = [];
  if (!dummyWtfAddress) missing.push("DUMMY_WTF_ADDRESS");
  if (!exchangeAddress) missing.push("EXCHANGE_ADDRESS");
  if (!listingOwnerKey) missing.push("LISTING_OWNER_SECRET_KEY");
  if (!takerKey) missing.push("TAKER_SECRET_KEY");
  return missing;
}

function toBigIntValue(value: any): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (value.toString) return BigInt(value.toString());
  throw new Error(`Unable to convert value to bigint: ${JSON.stringify(value)}`);
}

function assertEq(actual: bigint, expected: bigint, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected.toString()}, got ${actual.toString()}`);
  }
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
      `- RPC: ${rpcUrl}`,
      `- Expected chain ID: ${expectedChainId}`,
      "",
      ...lines,
      "",
    ].join("\n"),
  );
}

async function makeToolkit(secretKey: string): Promise<{ tezos: TezosToolkit; address: string }> {
  const tezos = new TezosToolkit(rpcUrl);
  const signer = new InMemorySigner(secretKey);
  tezos.setProvider({ signer });
  return { tezos, address: await signer.publicKeyHash() };
}

async function confirm(label: string, op: any, hashes: Record<string, string>): Promise<void> {
  hashes[label] = op.hash;
  await op.confirmation();
}

async function getListing(contract: any, listingId: number): Promise<any> {
  const storage: any = await contract.storage();
  return storage.listings.get(listingId);
}

async function getLedgerBalance(token: any, owner: string): Promise<bigint> {
  const storage: any = await token.storage();
  const value = await storage.ledger.get(owner);
  return toBigIntValue(value);
}

async function main(): Promise<void> {
  const missing = requiredEnv();
  if (missing.length > 0) {
    writeMarkdownReport("BLOCKED", [
      "## Blocker",
      "",
      `Missing required environment variables: ${missing.join(", ")}`,
      "",
      "Required values:",
      "",
      "- `DUMMY_WTF_ADDRESS`: Shadownet dummy FA2 KT1 address deployed by Kiln.",
      "- `EXCHANGE_ADDRESS`: Shadownet exchange KT1 address deployed by Kiln.",
      "- `LISTING_OWNER_SECRET_KEY`: funded Shadownet secret key that is dummy token admin/listing owner.",
      "- `TAKER_SECRET_KEY`: funded Shadownet secret key that receives dummy WTF and swaps.",
    ]);
    console.error(`BLOCKED: missing env vars ${missing.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const hashes: Record<string, string> = {};
  const reportLines: string[] = [];

  try {
    const owner = await makeToolkit(listingOwnerKey!);
    const taker = await makeToolkit(takerKey!);
    const chainId = await owner.tezos.rpc.getChainId();
    if (chainId !== expectedChainId) {
      throw new Error(`Wrong chain id: expected ${expectedChainId}, got ${chainId}`);
    }

    const dummyAsOwner = await owner.tezos.contract.at(dummyWtfAddress!);
    const dummyAsTaker = await taker.tezos.contract.at(dummyWtfAddress!);
    const exchangeAsOwner = await owner.tezos.contract.at(exchangeAddress!);
    const exchangeAsTaker = await taker.tezos.contract.at(exchangeAddress!);

    await confirm(
      "mint_dummy_wtf",
      await dummyAsOwner.methodsObject
        .mint([{ to_: taker.address, amount: mintAmount.toString() }])
        .send(),
      hashes,
    );
    await confirm(
      "approve_exchange_operator",
      await dummyAsTaker.methodsObject
        .update_operators([
          {
            add_operator: {
              owner: taker.address,
              operator: exchangeAddress!,
              token_id: 0,
            },
          },
        ])
        .send(),
      hashes,
    );
    await confirm(
      "create_listing",
      await exchangeAsOwner.methodsObject
        .create_listing({
          escrow_mutez: escrowMutez.toString(),
          rate_numerator_mutez: rateNumeratorMutez.toString(),
          rate_denominator_wtf_units: rateDenominatorWtfUnits.toString(),
        })
        .send({ amount: Number(escrowMutez), mutez: true }),
      hashes,
    );

    let listing = await getListing(exchangeAsOwner, 0);
    assertEq(toBigIntValue(listing.original_escrow_mutez), escrowMutez, "original escrow after create");
    assertEq(toBigIntValue(listing.remaining_escrow_mutez), escrowMutez, "remaining escrow after create");

    const takerBalanceBeforeSwap = await taker.tezos.tz.getBalance(taker.address);
    const firstXtzOut = (firstFillWtf * rateNumeratorMutez) / rateDenominatorWtfUnits;
    await confirm(
      "first_swap",
      await exchangeAsTaker.methodsObject
        .swap({
          listing_id: 0,
          wtf_amount: firstFillWtf.toString(),
          expected_owner: owner.address,
          expected_rate_numerator_mutez: rateNumeratorMutez.toString(),
          expected_rate_denominator_wtf_units: rateDenominatorWtfUnits.toString(),
          expected_xtz_out_mutez: firstXtzOut.toString(),
        })
        .send(),
      hashes,
    );
    listing = await getListing(exchangeAsOwner, 0);
    assertEq(
      toBigIntValue(listing.remaining_escrow_mutez),
      escrowMutez - firstXtzOut,
      "remaining escrow after first fill",
    );
    assertEq(toBigIntValue(listing.total_wtf_filled), firstFillWtf, "WTF filled after first fill");
    assertEq(await getLedgerBalance(dummyAsOwner, owner.address), firstFillWtf, "owner WTF after first fill");
    const takerBalanceAfterSwap = await taker.tezos.tz.getBalance(taker.address);
    if (toBigIntValue(takerBalanceAfterSwap) <= toBigIntValue(takerBalanceBeforeSwap)) {
      throw new Error(
        `Taker XTZ balance did not increase after swap. Before=${takerBalanceBeforeSwap.toString()} after=${takerBalanceAfterSwap.toString()}`,
      );
    }

    const secondXtzOut = (secondFillWtf * rateNumeratorMutez) / rateDenominatorWtfUnits;
    await confirm(
      "second_swap_partial_fill",
      await exchangeAsTaker.methodsObject
        .swap({
          listing_id: 0,
          wtf_amount: secondFillWtf.toString(),
          expected_owner: owner.address,
          expected_rate_numerator_mutez: rateNumeratorMutez.toString(),
          expected_rate_denominator_wtf_units: rateDenominatorWtfUnits.toString(),
          expected_xtz_out_mutez: secondXtzOut.toString(),
        })
        .send(),
      hashes,
    );
    listing = await getListing(exchangeAsOwner, 0);
    assertEq(
      toBigIntValue(listing.remaining_escrow_mutez),
      escrowMutez - firstXtzOut - secondXtzOut,
      "remaining escrow after second partial fill",
    );
    assertEq(
      toBigIntValue(listing.total_wtf_filled),
      firstFillWtf + secondFillWtf,
      "WTF filled after second partial fill",
    );

    const preCancelRemaining = toBigIntValue(listing.remaining_escrow_mutez);
    await confirm(
      "cancel_listing",
      await exchangeAsOwner.methods.cancel_listing(0).send(),
      hashes,
    );
    listing = await getListing(exchangeAsOwner, 0);
    assertEq(toBigIntValue(listing.remaining_escrow_mutez), 0n, "remaining escrow after cancel");
    assertEq(toBigIntValue(listing.cancelled_refund_mutez), preCancelRemaining, "cancel refund");
    assertEq(toBigIntValue(listing.status_code), 2n, "cancel status code");

    reportLines.push("## Addresses", "");
    reportLines.push(`- Listing owner/admin: ${owner.address}`);
    reportLines.push(`- Taker: ${taker.address}`);
    reportLines.push(`- Dummy WTF FA2: ${dummyWtfAddress}`);
    reportLines.push(`- Exchange: ${exchangeAddress}`);
    reportLines.push("");
    reportLines.push("## Operation Hashes", "");
    for (const [label, hash] of Object.entries(hashes)) {
      reportLines.push(`- ${label}: ${hash}`);
    }
    reportLines.push("");
    reportLines.push("## Final Listing State", "");
    reportLines.push("```json");
    reportLines.push(JSON.stringify(listing, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
    reportLines.push("```");
    writeMarkdownReport("PASSED", reportLines);
    console.log("Shadownet E2E passed.");
    console.log(JSON.stringify({ hashes }, null, 2));
  } catch (error) {
    writeMarkdownReport("FAILED", [
      "## Error",
      "",
      "```text",
      error instanceof Error ? error.stack ?? error.message : String(error),
      "```",
      "",
      "## Operation Hashes Before Failure",
      "",
      "```json",
      JSON.stringify(hashes, null, 2),
      "```",
    ]);
    throw error;
  }
}

await main();
