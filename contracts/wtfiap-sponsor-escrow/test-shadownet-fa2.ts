#!/usr/bin/env node
/** Real Shadownet FA2 lot custody-to-claim proof using the hosted test wallets. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { Schema } from "@taquito/michelson-encoder";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";

const rpc = "https://tezos-shadownet.octez.io/";
const chainId = "NetXsqzbfFenSTS";
const escrowAddress = "KT1EpPzrYahest4Wm9UddKBAx1Ha7xBQt1YQ";
const tokenCodeSha256 = "ccd4a6aeae3a992722c29e27939e05639d601bd7094a5fb88e8264a58d8f1c9a";
const refereeAddress = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
const entrantAddress = "tz1bZJgnowmGBHt3ftHZDsgANN1JzHJgRpVv";
const tokenId = 7;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const [envFile, proofDirectory, mode] = process.argv.slice(2);
  assert(envFile && proofDirectory && (mode === "--preflight" || mode === "--execute"),
    "Usage: test-shadownet-fa2 <signer-env> <proof-directory> --preflight|--execute");
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
  tezos.setProvider({ signer: referee.signer });
  assert.equal(await tezos.rpc.getChainId(), chainId);
  const codeBytes = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),
    "artifacts/dummy-prize-fa2-contract.json"));
  assert.equal(createHash("sha256").update(codeBytes).digest("hex"), tokenCodeSha256,
    "Shadownet test FA2 code differs from the reviewed fixture.");
  const code = JSON.parse(codeBytes.toString("utf8"));
  const schema = new Schema(code.find((section: any) => section.prim === "storage").args[0]);
  const storage = schema.Encode({ admin: refereeAddress, ledger: new MichelsonMap(), operators: [] });
  const [refereeBalance, entrantBalance] = await Promise.all([
    tezos.tz.getBalance(refereeAddress), tezos.tz.getBalance(entrantAddress),
  ]);
  assert((await tezos.rpc.getScript(escrowAddress)).code.length > 0);
  if (mode === "--preflight") {
    const estimate = await tezos.estimate.originate({ code, init: storage });
    const needed = BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
    console.log(JSON.stringify({ phase: "preflight", network: "shadownet", escrowAddress,
      refereeAddress, entrantAddress, refereeBalanceMutez: refereeBalance.toFixed(),
      entrantBalanceMutez: entrantBalance.toFixed(), tokenOriginationFeeAndStorageMutez: needed.toString(),
      enoughForTokenOrigination: BigInt(refereeBalance.toFixed()) > needed }));
    return;
  }
  await mkdir(proofDirectory, { recursive: true });
  const journalPath = path.join(proofDirectory, "fa2-lifecycle.json");
  let journal: any;
  try { journal = JSON.parse(await readFile(journalPath, "utf8")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  if (!journal) {
    journal = { network: "shadownet", chainId, escrowAddress, tokenId,
      roomId: randomBytes(32).toString("hex"), termsHash: randomBytes(32).toString("hex"),
      rulesHash: sha("coLILseum Shadownet FA2 custody proof"),
      seedCommitment: randomBytes(32).toString("hex"), matchId: randomBytes(32).toString("hex"),
      operations: {} };
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  assert.equal(journal.network, "shadownet");
  assert.equal(journal.escrowAddress, escrowAddress);
  async function save() {
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
  }
  if (!journal.tokenAddress) {
    if (journal.operations.originate) throw new Error("Reconcile uncertain FA2 origination before retrying.");
    const tk = new TezosToolkit(rpc); tk.setProvider({ signer: referee.signer });
    const estimate = await tk.estimate.originate({ code, init: storage });
    const needed = BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
    assert(BigInt(refereeBalance.toFixed()) > needed, "Referee needs more Shadownet XTZ.");
    journal.operations.originate = { status: "prepared" }; await save();
    const operation = await tk.contract.originate({ code, init: storage });
    journal.operations.originate = { status: "injected", hash: operation.hash }; await save();
    await operation.confirmation(2);
    journal.tokenAddress = (await operation.contract()).address;
    journal.operations.originate.status = "confirmed"; await save();
    console.log(JSON.stringify({ phase: "confirmed", name: "originate", hash: operation.hash,
      tokenAddress: journal.tokenAddress }));
  }
  async function step(name: string, signer: any, contractAddress: string, entrypoint: string,
    params: any, mutez = 0) {
    const prior = journal.operations[name];
    if (prior?.status === "confirmed") return;
    if (prior) throw new Error(`${name} has uncertain prior send ${prior.hash || "prepared"}; reconcile before retry.`);
    const tk = new TezosToolkit(rpc); tk.setProvider({ signer });
    const contract = await tk.contract.at(contractAddress);
    const call = contract.methodsObject[entrypoint](params);
    const estimate = await tk.estimate.transfer(call.toTransferParams({ amount: mutez, mutez: true }));
    journal.operations[name] = { status: "prepared", feeEstimateMutez: String(estimate.suggestedFeeMutez) };
    await save();
    const operation = await call.send({ amount: mutez, mutez: true });
    journal.operations[name] = { ...journal.operations[name], status: "injected", hash: operation.hash };
    await save();
    await operation.confirmation(2);
    journal.operations[name].status = "confirmed"; await save();
    console.log(JSON.stringify({ phase: "confirmed", name, hash: operation.hash }));
  }
  const roomHash = { room_id: journal.roomId, expected_terms_hash: journal.termsHash };
  await step("mint", referee.signer, journal.tokenAddress, "mint",
    { to_: refereeAddress, token_id: tokenId, amount: 1 });
  await step("operator", referee.signer, journal.tokenAddress, "update_operators",
    [{ add_operator: { owner: refereeAddress, operator: escrowAddress, token_id: tokenId } }]);
  await step("create", referee.signer, escrowAddress, "create_room", {
    room_id: journal.roomId, terms_hash: journal.termsHash, rules_hash: journal.rulesHash,
    seed_commitment: journal.seedCommitment, referee: refereeAddress, sponsor: refereeAddress,
    mode: 0, minimum_humans: 1, entry_currency: 0, entry_amount: 0,
    pool_numerator: 0, pool_denominator: 1, designated_wallet: refereeAddress,
    places: [{ xtz: 0, wtf: 0, pool_weight: 0 }],
    lots: [{ token_address: journal.tokenAddress, token_id: tokenId, amount: 1, fixed_place: 1 }],
    pick_counts: [],
  });
  await step("fund", referee.signer, escrowAddress, "fund_sponsor_lot",
    { room_id: journal.roomId, index: 0, expected_terms_hash: journal.termsHash });
  await step("register", referee.signer, escrowAddress, "register_entrant",
    { room_id: journal.roomId, player: entrantAddress });
  await step("join", entrant.signer, escrowAddress, "join_room", roomHash);
  await step("start", referee.signer, escrowAddress, "start_room",
    { ...roomHash, match_id: journal.matchId });
  await step("finalize", referee.signer, escrowAddress, "finalize_room", {
    room_id: journal.roomId, match_id: journal.matchId,
    transcript_hash: sha("Shadownet FA2 test replay"), result_hash: sha("Shadownet FA2 test result"),
    human_ranks: [entrantAddress], lot_places: [1],
  });
  await step("claim", referee.signer, escrowAddress, "claim_lot",
    { room_id: journal.roomId, index: 0 });
  const token: any = await tezos.contract.at(journal.tokenAddress);
  const tokenStorage: any = await token.storage();
  const recipientBalance = await tokenStorage.ledger.get([entrantAddress, tokenId]);
  const contractBalance = await tokenStorage.ledger.get([escrowAddress, tokenId]);
  assert.equal(recipientBalance?.toFixed(), "1");
  assert.equal(contractBalance?.toFixed(), "0");
  console.log(JSON.stringify({ phase: "complete", roomId: journal.roomId,
    tokenAddress: journal.tokenAddress, recipientBalance: recipientBalance.toFixed(),
    escrowBalance: contractBalance.toFixed() }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
