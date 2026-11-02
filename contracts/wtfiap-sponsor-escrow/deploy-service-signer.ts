#!/usr/bin/env node
/** Originate the additive sponsor escrow using the existing hosted signer keyring.
 * Run this on the signer host as its service user; do not export key material.
 * The default mode is read-only. An execute journal blocks uncertain resends.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, open, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { Schema } from "@taquito/michelson-encoder";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";
import { assertTypedScriptIdentity } from "../wtfiap-escrow/script-identity";

type PublicConfig = { network: "mainnet" | "shadownet"; rpcUrl: string;
  source: string; roomCreator: string; wtfTokenAddress: string; wtfTokenId: string;
  treasuryAddress: string; xtzPaidRoomHouseFee: string };
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const clean = (value: any): any => value?.constructor?.name === "BigNumber" ? value.toFixed()
  : value?.constructor?.name === "MichelsonMap" ? [...value.entries()].map(([key, item]: any) => [clean(key), clean(item)])
  : Array.isArray(value) ? value.map(clean)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]))
  : value;
async function save(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp";
  const handle = await open(temporary, "w", 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + "\n"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
  const directory = await open(path.dirname(file), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
async function main() {
  const args = process.argv.slice(2), execute = args.includes("--execute");
  const positional = args.filter(value => value !== "--execute");
  assert.equal(positional.length, 5,
    "Usage: deploy-service-signer <signer-env> <public-config> <artifact> <proof-directory> <wallet-id> [--execute]");
  const [envPath, configPath, artifactPath, proofDirectory, walletId] = positional;
  Object.assign(process.env, dotenv.parse(await readFile(envPath)));
  const config = JSON.parse(await readFile(configPath, "utf8")) as PublicConfig;
  const expected = config.network === "mainnet" ? {
    rpc: "https://tezos-mainnet.octez.io/", chain: "NetXdQprcVkpaWU",
    walletId: "reward-disburser", fee: "500000",
  } : config.network === "shadownet" ? {
    rpc: "https://tezos-shadownet.octez.io/", chain: "NetXsqzbfFenSTS",
    walletId: "wtfiap-shadownet-referee", fee: "0",
  } : null;
  assert(expected, "Choose Tezos Mainnet or Shadownet explicitly.");
  assert.equal(config.rpcUrl, expected.rpc); assert.equal(walletId, expected.walletId);
  assert.equal(String(config.xtzPaidRoomHouseFee), expected.fee);
  const codeBytes = await readFile(artifactPath), code = JSON.parse(codeBytes.toString());
  const artifactHash = hash(codeBytes);
  const schema = new Schema(code.find((node: any) => node.prim === "storage").args[0]);
  const initialStorage = {
    cash_claims: new MichelsonMap(), lot_claims: new MichelsonMap(), rooms: new MichelsonMap(),
    room_creator: config.roomCreator, wtf_token_address: config.wtfTokenAddress,
    wtf_token_id: config.wtfTokenId, treasury_address: config.treasuryAddress,
    xtz_paid_room_house_fee: config.xtzPaidRoomHouseFee,
    xtz_quantum: "10000", wtf_quantum: "1000000",
  };
  assert(schema.Typecheck(initialStorage), "Compiled storage type differs from sponsor init.");
  const init = schema.Encode(initialStorage);
  const configHash = hash(JSON.stringify({ config, walletId, artifactHash, init }));
  const file = path.join(proofDirectory, "origination.json");
  let journal: any;
  try { journal = JSON.parse(await readFile(file, "utf8")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  if (journal) assert.equal(journal.configHash, configHash,
    "Saved origination intent is for different code or storage.");
  const tezos = new TezosToolkit(config.rpcUrl);
  assert.equal(await tezos.rpc.getChainId(), expected.chain, "RPC chain mismatch.");
  if (!execute) {
    console.log(JSON.stringify({ mode: "read-only", network: config.network,
      source: config.source, walletId, artifactHash, journalStatus: journal?.status || null }));
    return;
  }
  if (journal?.status === "applied") {
    const script = await tezos.rpc.getScript(journal.contractAddress);
    assert.equal(assertTypedScriptIdentity(script.code, code, "On-chain code changed."),
      journal.canonicalCodeSha256);
    console.log(JSON.stringify({ status: "applied", contractAddress: journal.contractAddress,
      operationHash: journal.operationHash, artifactHash }));
    return;
  }
  if (journal?.status === "prepared" && !journal.operationHash)
    throw new Error("Prepared send outcome unknown. Reconcile the source counter before any resend.");
  if (!journal) journal = { schemaVersion: 1, configHash, network: config.network,
    chainId: expected.chain, source: config.source, walletId, artifactHash };
  if (!journal.operationHash) {
    const keyring = new PlatformWalletKeyring(loadEnv());
    const { wallet, signer } = await keyring.getSigner(walletId);
    assert.equal(wallet.network, config.network); assert.equal(wallet.address, config.source);
    assert.equal(await signer.publicKeyHash(), config.source);
    tezos.setProvider({ signer });
    const estimate = await tezos.estimate.originate({ code, init });
    const required = BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
    const balance = BigInt((await tezos.tz.getBalance(config.source)).toFixed());
    assert(balance >= required, `Origination needs ${required} mutez; source has ${balance}.`);
    journal.status = "prepared";
    journal.preparedLevel = (await tezos.rpc.getBlockHeader()).level;
    journal.estimate = { requiredMutez: String(required), balanceMutez: String(balance),
      suggestedFeeMutez: String(estimate.suggestedFeeMutez),
      burnFeeMutez: String(estimate.burnFeeMutez) };
    await save(file, journal);
    const operation = await tezos.contract.originate({ code, init });
    journal.operationHash = operation.hash; journal.status = "injected";
    await save(file, journal);
    console.log(JSON.stringify({ status: "injected", operationHash: operation.hash }));
    await operation.confirmation(3);
  }
  const finalized = await tezos.rpc.getBlockHeader({ block: "head~2" });
  let found: { operation: any; level: number; blockHash: string } | null = null;
  for (let level = journal.preparedLevel; level <= finalized.level; level++) {
    const block = await tezos.rpc.getBlock({ block: String(level) });
    const operation = block.operations.flat().find((value: any) => value.hash === journal.operationHash);
    if (operation) { found = { operation, level, blockHash: block.hash }; break; }
  }
  assert(found, "Injected origination is not finalized. Keep the journal and resume.");
  const originations = found.operation.contents.filter((value: any) => value.kind === "origination");
  assert.equal(originations.length, 1);
  const origination = originations[0];
  assert.equal(origination.source, config.source); assert.equal(origination.balance, "0");
  assertTypedScriptIdentity(origination.script.code, code, "Applied code differs.");
  assert.deepEqual(clean(schema.Execute(origination.script.storage)), clean(schema.Execute(init)),
    "Applied storage init differs.");
  for (const content of found.operation.contents) {
    assert.equal(content.metadata.operation_result.status, "applied");
    for (const internal of content.metadata.internal_operation_results || [])
      assert.equal(internal.result.status, "applied");
  }
  const addresses = origination.metadata.operation_result.originated_contracts;
  assert.equal(addresses.length, 1);
  const script = await tezos.rpc.getScript(addresses[0], { block: String(finalized.level) });
  const canonicalCodeSha256 = assertTypedScriptIdentity(script.code, code,
    "Finalized code differs.");
  const storage = clean(schema.Execute(script.storage));
  assert.equal(storage.room_creator, config.roomCreator);
  assert.equal(storage.wtf_token_address, config.wtfTokenAddress);
  assert.equal(storage.wtf_token_id, String(config.wtfTokenId));
  assert.equal(storage.treasury_address, config.treasuryAddress);
  assert.equal(storage.xtz_paid_room_house_fee, String(config.xtzPaidRoomHouseFee));
  assert.equal(storage.xtz_quantum, "10000"); assert.equal(storage.wtf_quantum, "1000000");
  journal.status = "applied"; journal.contractAddress = addresses[0];
  journal.canonicalCodeSha256 = canonicalCodeSha256;
  journal.inclusion = { level: found.level, blockHash: found.blockHash };
  journal.finalized = { level: finalized.level }; journal.storage = storage;
  await save(file, journal);
  console.log(JSON.stringify({ status: "applied", contractAddress: addresses[0],
    operationHash: journal.operationHash, canonicalCodeSha256 }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
