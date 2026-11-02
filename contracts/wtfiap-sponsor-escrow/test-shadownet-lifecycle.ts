#!/usr/bin/env node
/** Real Shadownet paid/free sponsor escrow path using only hosted test wallets. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { TezosToolkit } from "@taquito/taquito";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";

const contractAddress = "KT1EpPzrYahest4Wm9UddKBAx1Ha7xBQt1YQ";
const refereeAddress = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
const entrantAddress = "tz1bZJgnowmGBHt3ftHZDsgANN1JzHJgRpVv";
const treasuryAddress = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const rpc = "https://tezos-shadownet.octez.io/";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const [envFile, proofDir, mode] = process.argv.slice(2);
  assert(envFile && proofDir && (mode === "--preflight" || mode === "--execute"),
    "Usage: test-shadownet-lifecycle <signer-env> <proof-dir> --preflight|--execute");
  Object.assign(process.env, dotenv.parse(await readFile(envFile)));
  const keyring = new PlatformWalletKeyring(loadEnv());
  const [referee, entrant] = await Promise.all([
    keyring.getSigner("wtfiap-shadownet-referee"),
    keyring.getSigner("wtfiap-sponsor-shadownet-entrant"),
  ]);
  assert.equal(referee.wallet.address, refereeAddress);
  assert.equal(entrant.wallet.address, entrantAddress);
  assert.equal(referee.wallet.network, "shadownet");
  assert.equal(entrant.wallet.network, "shadownet");
  const tezos = new TezosToolkit(rpc);
  assert.equal(await tezos.rpc.getChainId(), "NetXsqzbfFenSTS");
  const [refereeBalance, entrantBalance] = await Promise.all([
    tezos.tz.getBalance(refereeAddress), tezos.tz.getBalance(entrantAddress),
  ]);
  const script = await tezos.rpc.getScript(contractAddress);
  assert(script.code.length > 0);
  console.log(JSON.stringify({ phase: "preflight", contractAddress,
    refereeAddress, entrantAddress,
    refereeBalanceMutez: refereeBalance.toFixed(),
    entrantBalanceMutez: entrantBalance.toFixed() }));
  if (mode === "--preflight") return;
  await mkdir(proofDir, { recursive: true });
  const journalPath = path.join(proofDir, "lifecycle.json");
  let journal: any;
  try { journal = JSON.parse(await readFile(journalPath, "utf8")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  if (!journal) {
    journal = { network: "shadownet", chainId: "NetXsqzbfFenSTS", contractAddress,
      paid: { roomId: randomBytes(32).toString("hex"), termsHash: randomBytes(32).toString("hex"),
        rulesHash: sha("coLILseum sponsor Shadownet paid lifecycle"),
        seedCommitment: randomBytes(32).toString("hex"), matchId: randomBytes(32).toString("hex") },
      free: { roomId: randomBytes(32).toString("hex"), termsHash: randomBytes(32).toString("hex"),
        rulesHash: sha("coLILseum sponsor Shadownet free lifecycle"),
        seedCommitment: randomBytes(32).toString("hex"), matchId: randomBytes(32).toString("hex") },
      operations: {} };
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  assert.equal(journal.contractAddress, contractAddress);
  async function step(name: string, signer: any, entrypoint: string, params: any, mutez = 0) {
    const prior = journal.operations[name];
    if (prior?.status === "confirmed") return;
    if (prior) throw new Error(`${name} has an uncertain prior send. Reconcile ${prior.hash || "prepared"} before retry.`);
    const tk = new TezosToolkit(rpc);
    tk.setProvider({ signer });
    const contract = await tk.contract.at(contractAddress);
    const call = contract.methodsObject[entrypoint](params);
    const estimate = await tk.estimate.transfer(call.toTransferParams({ amount: mutez, mutez: true }));
    journal.operations[name] = { status: "prepared", entrypoint,
      feeEstimateMutez: String(estimate.suggestedFeeMutez), amountMutez: String(mutez) };
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
    const operation = await call.send({ amount: mutez, mutez: true });
    journal.operations[name] = { ...journal.operations[name], status: "injected", hash: operation.hash };
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ phase: "injected", name, hash: operation.hash }));
    await operation.confirmation(2);
    journal.operations[name].status = "confirmed";
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ phase: "confirmed", name, hash: operation.hash }));
  }
  function createParams(test: any, paid: boolean) {
    return { room_id: test.roomId, terms_hash: test.termsHash,
      rules_hash: test.rulesHash, seed_commitment: test.seedCommitment,
      referee: refereeAddress, sponsor: refereeAddress, mode: 0,
      minimum_humans: paid ? 2 : 1,
      entry_currency: paid ? 1 : 0, entry_amount: paid ? 100000 : 0,
      pool_numerator: paid ? 1 : 0, pool_denominator: paid ? 2 : 1,
      designated_wallet: refereeAddress,
      places: paid ? [
        { xtz: 10000, wtf: 0, pool_weight: 1 },
        { xtz: 10000, wtf: 0, pool_weight: 1 },
      ] : [{ xtz: 10000, wtf: 0, pool_weight: 0 }],
      lots: [], pick_counts: [] };
  }
  const paid = journal.paid, free = journal.free;
  await step("paid:create", referee.signer, "create_room", createParams(paid, true));
  await step("paid:fund", referee.signer, "fund_sponsor_xtz",
    { room_id: paid.roomId, expected_terms_hash: paid.termsHash }, 20000);
  for (const [name, wallet] of [["referee", refereeAddress], ["entrant", entrantAddress]] as const)
    await step(`paid:register:${name}`, referee.signer, "register_entrant", { room_id: paid.roomId, player: wallet });
  await step("paid:join:referee", referee.signer, "join_room",
    { room_id: paid.roomId, expected_terms_hash: paid.termsHash }, 100000);
  await step("paid:join:entrant", entrant.signer, "join_room",
    { room_id: paid.roomId, expected_terms_hash: paid.termsHash }, 100000);
  await step("paid:start", referee.signer, "start_room",
    { room_id: paid.roomId, expected_terms_hash: paid.termsHash, match_id: paid.matchId });
  await step("paid:finalize", referee.signer, "finalize_room",
    { room_id: paid.roomId, match_id: paid.matchId,
      transcript_hash: sha("shadownet paid test replay"), result_hash: sha("shadownet paid test result"),
      human_ranks: [entrantAddress, refereeAddress], lot_places: [] });
  for (const [name, wallet] of [["winner", entrantAddress], ["sponsor", refereeAddress], ["treasury", treasuryAddress]] as const)
    await step(`paid:claim:${name}`, referee.signer, "claim_cash",
      { room_id: paid.roomId, recipient: wallet, currency: 0 });

  await step("free:create", referee.signer, "create_room", createParams(free, false));
  await step("free:fund", referee.signer, "fund_sponsor_xtz",
    { room_id: free.roomId, expected_terms_hash: free.termsHash }, 10000);
  await step("free:register", referee.signer, "register_entrant", { room_id: free.roomId, player: entrantAddress });
  await step("free:join", entrant.signer, "join_room",
    { room_id: free.roomId, expected_terms_hash: free.termsHash });
  await step("free:start", referee.signer, "start_room",
    { room_id: free.roomId, expected_terms_hash: free.termsHash, match_id: free.matchId });
  await step("free:finalize", referee.signer, "finalize_room",
    { room_id: free.roomId, match_id: free.matchId,
      transcript_hash: sha("shadownet free test replay"), result_hash: sha("shadownet free test result"),
      human_ranks: [entrantAddress], lot_places: [] });
  await step("free:claim", referee.signer, "claim_cash",
    { room_id: free.roomId, recipient: entrantAddress, currency: 0 });
  const finalStorage: any = await tezos.contract.getStorage(contractAddress);
  const paidRoom: any = await finalStorage.rooms.get(paid.roomId);
  const freeRoom: any = await finalStorage.rooms.get(free.roomId);
  assert.equal(Number(paidRoom.status), 2); assert.equal(Number(freeRoom.status), 2);
  assert.equal(paidRoom.held_xtz.toFixed(), "0"); assert.equal(freeRoom.held_xtz.toFixed(), "0");
  console.log(JSON.stringify({ phase: "complete", paidRoomId: paid.roomId,
    freeRoomId: free.roomId, paidHeldMutez: paidRoom.held_xtz.toFixed(),
    freeHeldMutez: freeRoom.held_xtz.toFixed() }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
