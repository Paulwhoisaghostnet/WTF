#!/usr/bin/env tsx
/** Read-only Tezos Mainnet origination plan for an exact $WTF code clone. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TezosToolkit } from "@taquito/taquito";
import { getPkhfromPk } from "@taquito/utils";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const SOURCE_WTF = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const WTF_TEZ_WALLET = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const WTF_INITIAL_RAW_SUPPLY = "100000000000000";
const RPC_ENDPOINTS = [
  "https://tezos-mainnet.octez.io/",
  "https://tcinfra.net/rpc/tezos/mainnet",
];
const TOKEN_DESCRIPTION =
  "HORSE recognizes participation in WTF OS horse trading and support for the horse trading community.";

type Micheline = { prim?: string; args?: unknown[]; string?: string; int?: string; bytes?: string } | unknown[];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bytes(value: string): Micheline {
  return { bytes: Buffer.from(value, "utf8").toString("hex") };
}

function pair(left: Micheline, right: Micheline): Micheline {
  return { prim: "Pair", args: [left, right] };
}

function elt(key: Micheline, value: Micheline): Micheline {
  return { prim: "Elt", args: [key, value] };
}

function tokenInfo() {
  const entries: Record<string, string> = {
    decimals: "8",
    description: TOKEN_DESCRIPTION,
    name: "HORSE",
    shouldPreferSymbol: "true",
    symbol: "HORSE",
  };
  return Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => elt({ string: key }, bytes(value)));
}

/** Same WTF FA2 storage shape, token 0, 8 decimals, and 1,000,000 initial units. */
export function horseInit(admin = WTF_TEZ_WALLET): Micheline {
  assert(/^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$/.test(admin));
  const ledger = [elt(pair({ string: admin }, { int: "0" }), { int: WTF_INITIAL_RAW_SUPPLY })];
  const tokenMetadata = [elt({ int: "0" }, pair({ int: "0" }, tokenInfo()))];
  const totalSupply = [elt({ int: "0" }, { int: WTF_INITIAL_RAW_SUPPLY })];
  const contractMetadata = {
    version: "v0.0.1",
    name: "HORSE token contract",
    description: TOKEN_DESCRIPTION,
    authors: ["WTF OS"],
    source: { tools: ["Ligo"] },
    interfaces: ["TZIP-012", "TZIP-016"],
  };
  const metadata = [
    elt({ string: "" }, bytes("tezos-storage:contents")),
    elt({ string: "contents" }, bytes(JSON.stringify(contractMetadata))),
  ];
  return pair(
    pair(
      pair(pair({ string: admin }, { prim: "False" }), { prim: "None" }),
      pair(pair(ledger, []), pair(tokenMetadata, totalSupply)),
    ),
    metadata,
  );
}

async function postRpc(rpc: string, block: string, endpoint: string, body: unknown): Promise<unknown> {
  const url = `${rpc.replace(/\/+$/, "")}/chains/main/blocks/${block}/helpers/scripts/${endpoint}`;
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${endpoint} failed: ${JSON.stringify(result)}`);
  return result;
}

async function prepareAt(rpcUrl: string) {
  const tezos = new TezosToolkit(rpcUrl);
  assert.equal(await tezos.rpc.getChainId(), MAINNET_CHAIN_ID, "HORSE may only originate on Tezos Mainnet");
  const block = await tezos.rpc.getBlockHash();
  const [header, metadata, constants, balance, managerKey, wtfScript] = await Promise.all([
    tezos.rpc.getBlockHeader({ block }),
    tezos.rpc.getBlockMetadata({ block }),
    tezos.rpc.getConstants({ block }),
    tezos.rpc.getBalance(WTF_TEZ_WALLET, { block }),
    tezos.rpc.getManagerKey(WTF_TEZ_WALLET, { block }),
    tezos.rpc.getScript(SOURCE_WTF, { block }),
  ]);
  const code = JSON.parse(await readFile(path.join(HERE, "wtf-code.json"), "utf8"));
  assert.deepEqual(code, wtfScript.code, "Bundled code differs from live $WTF on Mainnet");
  const init = horseInit();
  const storageType = code.find((node: { prim?: string }) => node.prim === "storage")?.args?.[0];
  assert(storageType, "WTF storage type is missing");
  const gas = constants.hard_gas_limit_per_operation.toString();
  await postRpc(rpcUrl, block, "typecheck_code", { program: code, gas, show_types: false });
  await postRpc(rpcUrl, block, "typecheck_data", { data: init, type: storageType, gas });
  const scriptSize = await postRpc(rpcUrl, block, "script_size", { program: code, storage: init, gas });
  assert(typeof managerKey === "string", "wtf.tez manager public key is not revealed");
  assert.equal(getPkhfromPk(managerKey), WTF_TEZ_WALLET, "Manager key does not belong to wtf.tez");
  tezos.setProvider({ signer: {
    publicKeyHash: async () => WTF_TEZ_WALLET,
    publicKey: async () => managerKey,
    secretKey: async (): Promise<never> => { throw new Error("Read-only preflight has no secret key"); },
    sign: async (): Promise<never> => { throw new Error("Read-only preflight cannot sign"); },
  } });
  const estimate = await tezos.estimate.originate({ code, init });
  const requiredMutez = BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
  assert(BigInt(balance.toFixed()) >= requiredMutez, "wtf.tez has insufficient XTZ for origination");
  const plan = {
    schemaVersion: 1,
    mode: "read-only",
    network: "mainnet",
    chainId: MAINNET_CHAIN_ID,
    rpcUrl,
    block,
    level: header.level,
    protocol: metadata.protocol,
    sourceWtfContract: SOURCE_WTF,
    sourceWtfCodeSha256: sha256(JSON.stringify(code)),
    sourceWtfTzktCodeHash: 1454653741,
    sourceWallet: WTF_TEZ_WALLET,
    sourceDomain: "wtf.tez",
    token: { name: "HORSE", symbol: "HORSE", tokenId: "0", decimals: 8,
      initialRawSupply: WTF_INITIAL_RAW_SUPPLY, initialSupply: "1000000" },
    initSha256: sha256(JSON.stringify(init)),
    sourceBalanceMutez: balance.toFixed(),
    scriptSize,
    estimate: {
      suggestedFeeMutez: String(estimate.suggestedFeeMutez),
      burnFeeMutez: String(estimate.burnFeeMutez),
      gasLimit: String(estimate.gasLimit),
      storageLimit: String(estimate.storageLimit),
      requiredMutez: String(requiredMutez),
    },
  };
  const output = path.join(HERE, "plan");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "origination.json"), JSON.stringify({ code, init }, null, 2) + "\n");
  await writeFile(path.join(output, "preflight.json"), JSON.stringify(plan, null, 2) + "\n");
  return plan;
}

async function main() {
  assert(process.env.TEZOS_NETWORK === "mainnet", "Set TEZOS_NETWORK=mainnet explicitly");
  const urls = process.env.TEZOS_RPC_URL ? [process.env.TEZOS_RPC_URL] : RPC_ENDPOINTS;
  let lastError: unknown;
  for (const url of urls) {
    try {
      const plan = await prepareAt(url);
      console.log(JSON.stringify({ mode: plan.mode, network: plan.network,
        sourceWallet: plan.sourceWallet, token: plan.token, estimate: plan.estimate,
        codeSha256: plan.sourceWtfCodeSha256, plan: path.join(HERE, "plan/preflight.json") }));
      return;
    } catch (error) {
      lastError = error;
      console.error(`HORSE read-only preflight failed at ${url}:`, error);
    }
  }
  throw lastError;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
