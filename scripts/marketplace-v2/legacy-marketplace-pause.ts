import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { InMemorySigner } from "@taquito/signer";
import { TezosToolkit } from "@taquito/taquito";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, ".agents", "docs", "archive", "contracts", "wtf-marketplace-v2");

const legacyMarketplace =
  process.env.LEGACY_MARKETPLACE_CONTRACT_ADDRESS ?? "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj";
const tzktBase = (process.env.TZKT_MAINNET_API ?? "https://api.tzkt.io").replace(/\/$/, "");
const rpcUrl =
  process.env.TEZOS_MAINNET_RPC_URL ??
  process.env.TEZOS_RPC_URL ??
  "https://mainnet.api.tez.ie";
const execute = process.argv.includes("--execute");
const secretKey = process.env.MARKETPLACE_ADMIN_SECRET_KEY ?? process.env.TEZOS_ADMIN_SECRET_KEY;

type LegacyStorage = {
  admin?: string;
  paused?: boolean;
  offers?: number;
  listings?: number;
  auctions?: number;
  wtf_token_address?: string;
  wtf_token_id?: string | number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function jsonPreview(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function writeReport(status: "DRY_RUN" | "BLOCKED" | "PAUSED" | "ALREADY_PAUSED" | "FAILED", lines: string[]): void {
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    path.join(docsDir, "legacy-marketplace-pause-run.md"),
    [
      "# Legacy Marketplace Pause Run",
      "",
      `- Status: ${status}`,
      `- Timestamp: ${nowIso()}`,
      `- Contract: ${legacyMarketplace}`,
      `- TzKT: ${tzktBase}`,
      `- RPC: ${rpcUrl}`,
      "",
      ...lines,
      "",
    ].join("\n"),
  );
}

async function tzkt<T>(route: string): Promise<T> {
  const response = await fetch(`${tzktBase}${route}`);
  if (!response.ok) {
    throw new Error(`TzKT ${route} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function readStorage(): Promise<LegacyStorage> {
  return tzkt<LegacyStorage>(`/v1/contracts/${legacyMarketplace}/storage`);
}

async function readRiskyOffers(offersBigMap: number | undefined): Promise<any[]> {
  if (!offersBigMap) return [];
  const query = new URLSearchParams({
    active: "true",
    limit: "20",
    "value.token_amount.gt": "1",
  });
  return tzkt<any[]>(`/v1/bigmaps/${offersBigMap}/keys?${query.toString()}`);
}

async function pauseLegacy(storage: LegacyStorage): Promise<string> {
  if (!secretKey) {
    throw new Error("Missing MARKETPLACE_ADMIN_SECRET_KEY or TEZOS_ADMIN_SECRET_KEY");
  }
  const signer = new InMemorySigner(secretKey);
  const signerAddress = await signer.publicKeyHash();
  if (storage.admin && signerAddress !== storage.admin) {
    throw new Error(
      `Signer mismatch: storage admin is ${storage.admin}, but provided key is ${signerAddress}`,
    );
  }
  const tezos = new TezosToolkit(rpcUrl);
  tezos.setProvider({ signer });
  const contract = await tezos.contract.at(legacyMarketplace);
  const op = await contract.methods.toggle_pause().send();
  await op.confirmation(1);
  return op.hash;
}

async function main(): Promise<void> {
  const lines: string[] = [];

  try {
    const storage = await readStorage();
    const riskyOffers = await readRiskyOffers(storage.offers);
    lines.push("## Storage", "", "```json", jsonPreview(storage), "```", "");
    lines.push("## Hidden Multi-Edition Offers", "");
    lines.push(`- Active offers with token_amount > 1 found by TzKT: ${riskyOffers.length}`);
    if (riskyOffers.length > 0) {
      lines.push("```json", jsonPreview(riskyOffers), "```", "");
    }

    if (storage.paused === true) {
      lines.push("## Action", "", "No transaction sent. Legacy marketplace is already paused.");
      writeReport("ALREADY_PAUSED", lines);
      console.log("Legacy marketplace is already paused.");
      return;
    }

    if (!execute) {
      lines.push("## Action", "");
      lines.push("No transaction sent. Re-run with `--execute` and the admin secret key to call `toggle_pause` once.");
      writeReport("DRY_RUN", lines);
      console.log("DRY RUN: legacy marketplace is not paused. No transaction sent.");
      process.exitCode = 2;
      return;
    }

    const opHash = await pauseLegacy(storage);
    const after = await readStorage();
    lines.push("## Transaction", "");
    lines.push(`- Operation hash: ${opHash}`);
    lines.push("");
    lines.push("## Storage After", "", "```json", jsonPreview(after), "```", "");
    if (after.paused !== true) {
      throw new Error("toggle_pause confirmed but TzKT storage did not report paused=true");
    }
    writeReport("PAUSED", lines);
    console.log(`Legacy marketplace paused with operation ${opHash}`);
  } catch (error) {
    lines.push("## Error", "");
    lines.push("```text");
    lines.push(error instanceof Error ? error.stack ?? error.message : String(error));
    lines.push("```");
    writeReport(execute ? "FAILED" : "BLOCKED", lines);
    throw error;
  }
}

await main();
