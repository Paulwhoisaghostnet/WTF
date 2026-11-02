#!/usr/bin/env node
/** Real Shadownet WTF prize custody, hosted chain-reader, and payout proof. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";
import { TezosToolkit } from "@taquito/taquito";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";
import { sponsorArtifactScriptHash, tezosSponsorChain } from "../../server/features/wtfiap/sponsor-funding-chain";
import type { SponsorRecord } from "../../server/features/wtfiap/sponsor-funding";

const rpc = "https://tezos-shadownet.octez.io/";
const chainId = "NetXsqzbfFenSTS";
const escrowAddress = "KT1EpPzrYahest4Wm9UddKBAx1Ha7xBQt1YQ";
const tokenAddress = "KT1U3isJU8p1rtfjZaEWa31FCSKNeLiuL7zg";
const sponsorAddress = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
const refereeAddress = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
const entrantAddress = "tz1bZJgnowmGBHt3ftHZDsgANN1JzHJgRpVv";
const treasuryAddress = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const prizeAtomic = "1000000"; // One authorized 0.01 WTF quantum.
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const [envFile, proofDirectory, mode] = process.argv.slice(2);
  assert(envFile && proofDirectory && (mode === "--preflight" || mode === "--execute"),
    "Usage: test-shadownet-wtf <signer-env> <proof-directory> --preflight|--execute");
  Object.assign(process.env, dotenv.parse(await readFile(envFile)));
  const keyring = new PlatformWalletKeyring(loadEnv());
  const [sponsor, referee, entrant] = await Promise.all([
    keyring.getSigner("wtfiap-shadownet-referee"),
    keyring.getSigner("wtfiap-shadownet-referee"),
    keyring.getSigner("wtfiap-sponsor-shadownet-entrant"),
  ]);
  assert.equal(sponsor.wallet.address, sponsorAddress);
  assert.equal(referee.wallet.address, refereeAddress);
  assert.equal(entrant.wallet.address, entrantAddress);
  for (const wallet of [sponsor.wallet, referee.wallet, entrant.wallet])
    assert.equal(wallet.network, "shadownet");
  const tezos = new TezosToolkit(rpc);
  assert.equal(await tezos.rpc.getChainId(), chainId);
  const scriptHash = sponsorArtifactScriptHash();
  assert.equal(scriptHash, "77947dbf0ef86261826f76a1affe4a4e52b80593f07253ad46bbbf527a296aae");
  const tokenResponse = await fetch("https://api.shadownet.tzkt.io/v1/tokens/balances?" +
    new URLSearchParams({ account: sponsorAddress, "token.contract": tokenAddress, "token.tokenId": "0" }));
  assert(tokenResponse.ok, "TzKT token balance query failed.");
  const balances = await tokenResponse.json();
  const balance = balances.find((row: any) => row.account?.address === sponsorAddress &&
    row.token?.contract?.address === tokenAddress && String(row.token?.tokenId) === "0" &&
    row.token?.standard === "fa2");
  if (mode === "--preflight") assert(balance && BigInt(balance.balance) >= BigInt(prizeAtomic),
    "Sponsor needs at least one WTF prize quantum.");
  const [sponsorXtz, refereeXtz, entrantXtz] = await Promise.all([
    tezos.tz.getBalance(sponsorAddress), tezos.tz.getBalance(refereeAddress),
    tezos.tz.getBalance(entrantAddress),
  ]);
  console.log(JSON.stringify({ phase: "preflight", network: "shadownet", escrowAddress,
    tokenAddress, sponsorAddress, refereeAddress, entrantAddress,
    sponsorWtfAtomic: balance?.balance || "0", sponsorXtzMutez: sponsorXtz.toFixed(),
    refereeXtzMutez: refereeXtz.toFixed(), entrantXtzMutez: entrantXtz.toFixed() }));
  if (mode === "--preflight") return;
  await mkdir(proofDirectory, { recursive: true });
  const journalPath = `${proofDirectory}/wtf-lifecycle.json`;
  let journal: any;
  try { journal = JSON.parse(await readFile(journalPath, "utf8")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  if (!journal) {
    journal = { network: "shadownet", chainId, escrowAddress, tokenAddress,
      roomId: randomBytes(32).toString("hex"), termsHash: randomBytes(32).toString("hex"),
      rulesHash: sha("coLILseum Shadownet WTF sponsor prize proof"),
      seedCommitment: randomBytes(32).toString("hex"), matchId: randomBytes(32).toString("hex"),
      operations: {} };
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  assert.equal(journal.network, "shadownet");
  assert.equal(journal.escrowAddress, escrowAddress);
  assert.equal(journal.tokenAddress, tokenAddress);
  const save = () => writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
  async function step(name: string, signer: any, contractAddress: string,
    entrypoint: string, params: any) {
    const prior = journal.operations[name];
    if (prior?.status === "confirmed") return;
    if (prior) throw new Error(`${name} may have been sent already; reconcile ${prior.hash || "prepared"}.`);
    const tk = new TezosToolkit(rpc); tk.setProvider({ signer });
    const contract = await tk.contract.at(contractAddress);
    const call = contract.methodsObject[entrypoint](params);
    const estimate = await tk.estimate.transfer(call.toTransferParams());
    journal.operations[name] = { status: "prepared", feeEstimateMutez: String(estimate.suggestedFeeMutez) };
    await save();
    const operation = await call.send();
    journal.operations[name] = { ...journal.operations[name], status: "injected", hash: operation.hash };
    await save();
    console.log(JSON.stringify({ phase: "injected", name, hash: operation.hash }));
    // The host reader uses head~2, so the read needs a third block.
    await operation.confirmation(3);
    journal.operations[name].status = "confirmed"; await save();
    console.log(JSON.stringify({ phase: "confirmed", name, hash: operation.hash }));
  }
  const roomHash = { room_id: journal.roomId, expected_terms_hash: journal.termsHash };
  const record: SponsorRecord = {
    schemaVersion: 1, roomCode: "shadownet-wtf-proof", roomId: journal.roomId,
    config: { enabled: true, network: "shadownet", chainId, rpcUrl: rpc,
      escrowContract: escrowAddress, scriptHash, roomCreator: refereeAddress,
      referee: refereeAddress, walletId: "wtfiap-shadownet-referee",
      treasury: treasuryAddress, wtfToken: { contract: tokenAddress, tokenId: "0" },
      houseFeeAtomic: "0", rulesHash: journal.rulesHash },
    plan: { mode: "fixed", minimumHumans: 1,
      entry: { currency: "FREE", entryAtomic: "0", poolNumerator: "0",
        poolDenominator: "1", designatedWallet: null },
      places: [{ place: 1, xtzAtomic: "0", wtfAtomic: prizeAtomic, poolWeight: "0" }],
      tokens: [], deposit: { xtzAtomic: "0", wtfAtomic: prizeAtomic } },
    sponsor: { userId: "shadownet-test-sponsor", walletAddress: sponsorAddress },
    bindings: [{ userId: "shadownet-test-entrant", playerId: "test-entrant",
      walletAddress: entrantAddress, name: "Test entrant" }],
    lock: null, termsHash: journal.termsHash, startRequested: false, status: "test",
    chain: null, intents: [], observations: [], finalResult: null, technicalVoid: null,
    error: null, lastReconciledAt: null,
  };
  const reader = tezosSponsorChain();
  await step("operator", sponsor.signer, tokenAddress, "update_operators",
    [{ add_operator: { owner: sponsorAddress, operator: escrowAddress, token_id: 0 } }]);
  await step("create", referee.signer, escrowAddress, "create_room", {
    room_id: journal.roomId, terms_hash: journal.termsHash, rules_hash: journal.rulesHash,
    seed_commitment: journal.seedCommitment, referee: refereeAddress, sponsor: sponsorAddress,
    mode: 0, minimum_humans: 1, entry_currency: 0, entry_amount: 0,
    pool_numerator: 0, pool_denominator: 1, designated_wallet: treasuryAddress,
    places: [{ xtz: 0, wtf: prizeAtomic, pool_weight: 0 }], lots: [], pick_counts: [],
  });
  await step("fund", sponsor.signer, escrowAddress, "fund_sponsor_wtf", roomHash);
  let view = await reader.read(record);
  console.log(JSON.stringify({ phase: "host-read-after-fund", status: view?.status,
    heldWtf: view?.heldWtf, sponsorWtfFunded: view?.sponsorWtfFunded }));
  assert(view && view.sponsorWtfFunded &&
    (view.heldWtf === prizeAtomic || view.heldWtf === "0") &&
    ["funding", "active", "settled"].includes(view.status),
  "Hosted chain reader did not verify the WTF deposit.");
  console.log(JSON.stringify({ phase: "host-verified", roomId: journal.roomId,
    heldWtf: view.heldWtf, sponsorWtfFunded: view.sponsorWtfFunded }));
  await step("register", referee.signer, escrowAddress, "register_entrant",
    { room_id: journal.roomId, player: entrantAddress });
  await step("join", entrant.signer, escrowAddress, "join_room", roomHash);
  await step("start", referee.signer, escrowAddress, "start_room",
    { ...roomHash, match_id: journal.matchId });
  await step("finalize", referee.signer, escrowAddress, "finalize_room", {
    room_id: journal.roomId, match_id: journal.matchId,
    transcript_hash: sha("Shadownet WTF test replay"), result_hash: sha("Shadownet WTF test result"),
    human_ranks: [entrantAddress], lot_places: [],
  });
  view = await reader.read(record);
  const claimAlreadyConfirmed = journal.operations.claim?.status === "confirmed";
  assert(view?.status === "settled" &&
    view.cashClaims[`${entrantAddress}:WTF`]?.amount === prizeAtomic &&
    view.cashClaims[`${entrantAddress}:WTF`]?.claimed === claimAlreadyConfirmed,
  "Hosted chain reader did not find the expected WTF winner claim state.");
  await step("claim", referee.signer, escrowAddress, "claim_cash",
    { room_id: journal.roomId, recipient: entrantAddress, currency: 1 });
  view = await reader.read(record);
  assert(view?.cashClaims[`${entrantAddress}:WTF`]?.claimed === true &&
    view.heldWtf === "0", "Hosted chain reader did not verify the WTF payout.");
  console.log(JSON.stringify({ phase: "complete", roomId: journal.roomId,
    winner: entrantAddress, claimedAtomic: prizeAtomic, heldWtf: view.heldWtf }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
