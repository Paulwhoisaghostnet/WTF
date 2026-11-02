#!/usr/bin/env node
/** Verify that a standard TzKT-indexed FA2 lot clears hosted sponsor custody checks. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { TezosToolkit } from "@taquito/taquito";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";
import { verifySponsorLotCustody } from "../../server/features/wtfiap/sponsor-fa2-custody";

const rpc = "https://tezos-shadownet.octez.io/";
const escrowAddress = "KT1EpPzrYahest4Wm9UddKBAx1Ha7xBQt1YQ";
const tokenAddress = "KT1U3isJU8p1rtfjZaEWa31FCSKNeLiuL7zg";
const sponsorAddress = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
const entrantAddress = "tz1bZJgnowmGBHt3ftHZDsgANN1JzHJgRpVv";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const [envFile, proofDirectory, mode] = process.argv.slice(2);
  assert(envFile && proofDirectory && (mode === "--preflight" || mode === "--execute"),
    "Usage: test-shadownet-indexed-fa2 <signer-env> <proof-directory> --preflight|--execute");
  Object.assign(process.env, dotenv.parse(await readFile(envFile)));
  const keyring = new PlatformWalletKeyring(loadEnv());
  const [sponsor, entrant] = await Promise.all([
    keyring.getSigner("wtfiap-shadownet-referee"),
    keyring.getSigner("wtfiap-sponsor-shadownet-entrant"),
  ]);
  assert.equal(sponsor.wallet.address, sponsorAddress);
  assert.equal(entrant.wallet.address, entrantAddress);
  assert.equal(sponsor.wallet.network, "shadownet");
  assert.equal(entrant.wallet.network, "shadownet");
  const tezos = new TezosToolkit(rpc);
  assert.equal(await tezos.rpc.getChainId(), "NetXsqzbfFenSTS");
  const tokenBalancesResponse = await fetch("https://api.shadownet.tzkt.io/v1/tokens/balances?account=" +
    sponsorAddress + "&token.contract=" + tokenAddress + "&token.tokenId=0");
  assert(tokenBalancesResponse.ok);
  const tokenBalances = await tokenBalancesResponse.json();
  if (tokenBalances[0]) assert.equal(tokenBalances[0].token?.standard, "fa2");
  const xtz = await tezos.tz.getBalance(sponsorAddress);
  assert((await tezos.rpc.getScript(escrowAddress)).code.length > 0);
  console.log(JSON.stringify({ phase: "preflight", network: "shadownet", escrowAddress,
    tokenAddress, sponsorAddress, entrantAddress, sponsorTokenBalance: tokenBalances[0]?.balance || "0",
    sponsorXtzMutez: xtz.toFixed() }));
  if (mode === "--preflight") {
    assert(BigInt(tokenBalances[0]?.balance || "0") >= 1n, "Sponsor lacks one indexed FA2 lot unit.");
    return;
  }
  await mkdir(proofDirectory, { recursive: true });
  const journalPath = path.join(proofDirectory, "indexed-fa2-lifecycle.json");
  let journal: any;
  try { journal = JSON.parse(await readFile(journalPath, "utf8")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  if (!journal) {
    journal = { network: "shadownet", chainId: "NetXsqzbfFenSTS", escrowAddress,
      tokenAddress, roomId: randomBytes(32).toString("hex"),
      termsHash: randomBytes(32).toString("hex"),
      rulesHash: sha("coLILseum indexed Shadownet FA2 prize proof"),
      seedCommitment: randomBytes(32).toString("hex"),
      matchId: randomBytes(32).toString("hex"), operations: {} };
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  assert.equal(journal.escrowAddress, escrowAddress);
  assert.equal(journal.tokenAddress, tokenAddress);
  if (!journal.operations.fund) assert(BigInt(tokenBalances[0]?.balance || "0") >= 1n,
    "Sponsor lacks one indexed FA2 lot unit.");
  const save = () => writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
  async function step(name: string, signer: any, contractAddress: string,
    entrypoint: string, params: any) {
    const prior = journal.operations[name];
    if (prior?.status === "confirmed") return;
    if (prior) throw new Error(`${name} has uncertain prior send ${prior.hash || "prepared"}; reconcile before retry.`);
    const toolkit = new TezosToolkit(rpc); toolkit.setProvider({ signer });
    const contract = await toolkit.contract.at(contractAddress);
    const call = contract.methodsObject[entrypoint](params);
    const estimate = await toolkit.estimate.transfer(call.toTransferParams());
    journal.operations[name] = { status: "prepared", feeEstimateMutez: String(estimate.suggestedFeeMutez) };
    await save();
    const operation = await call.send();
    journal.operations[name] = { ...journal.operations[name], status: "injected", hash: operation.hash };
    await save();
    await operation.confirmation(2);
    journal.operations[name].status = "confirmed"; await save();
    console.log(JSON.stringify({ phase: "confirmed", name, hash: operation.hash }));
  }
  const roomHash = { room_id: journal.roomId, expected_terms_hash: journal.termsHash };
  if (!journal.operations.operator) {
    const operatorsResponse = await fetch("https://api.shadownet.tzkt.io/v1/bigmaps/43741/keys?active=true&" +
      new URLSearchParams({ "key.owner": sponsorAddress, "key.operator": escrowAddress }));
    assert(operatorsResponse.ok);
    const operators = await operatorsResponse.json();
    if (operators.some((item: any) => item.active === true &&
      item.key?.owner === sponsorAddress && item.key?.operator === escrowAddress &&
      String(item.key?.token_id) === "0")) {
      journal.operations.operator = { status: "confirmed", existingApproval: true };
      await save();
      console.log(JSON.stringify({ phase: "confirmed", name: "operator", existingApproval: true }));
    }
  }
  await step("operator", sponsor.signer, tokenAddress, "update_operators",
    [{ add_operator: { owner: sponsorAddress, operator: escrowAddress, token_id: 0 } }]);
  await step("create", sponsor.signer, escrowAddress, "create_room", {
    room_id: journal.roomId, terms_hash: journal.termsHash, rules_hash: journal.rulesHash,
    seed_commitment: journal.seedCommitment, referee: sponsorAddress, sponsor: sponsorAddress,
    mode: 0, minimum_humans: 1, entry_currency: 0, entry_amount: 0,
    pool_numerator: 0, pool_denominator: 1, designated_wallet: sponsorAddress,
    places: [{ xtz: 0, wtf: 0, pool_weight: 0 }],
    lots: [{ token_address: tokenAddress, token_id: 0, amount: 1, fixed_place: 1 }],
    pick_counts: [],
  });
  await step("fund", sponsor.signer, escrowAddress, "fund_sponsor_lot",
    { room_id: journal.roomId, index: 0, expected_terms_hash: journal.termsHash });
  const finalHeader = await tezos.rpc.getBlockHeader({ block: "head~2" });
  const record: any = { roomId: journal.roomId, termsHash: journal.termsHash,
    config: { network: "shadownet", escrowContract: escrowAddress },
    sponsor: { userId: "shadownet-indexed-proof", walletAddress: sponsorAddress },
    plan: { tokens: [{ contract: tokenAddress, tokenId: "0", amount: "1" }] },
    observations: [{ userId: "shadownet-indexed-proof", action: "sponsorToken:0",
      operationHash: journal.operations.fund.hash }] };
  const evidence = journal.custody ||
    await verifySponsorLotCustody(record, 0, [0], finalHeader.level);
  if (!evidence) {
    console.log(JSON.stringify({ phase: "custody-pending", finalizedLevel: finalHeader.level,
      fundHash: journal.operations.fund.hash,
      message: "Keep the room funded and rerun after Shadownet finality and TzKT indexing." }));
    return;
  }
  journal.custody = evidence; await save();
  console.log(JSON.stringify({ phase: "custody-verified", ...evidence }));
  await step("register", sponsor.signer, escrowAddress, "register_entrant",
    { room_id: journal.roomId, player: entrantAddress });
  await step("join", entrant.signer, escrowAddress, "join_room", roomHash);
  await step("start", sponsor.signer, escrowAddress, "start_room",
    { ...roomHash, match_id: journal.matchId });
  await step("finalize", sponsor.signer, escrowAddress, "finalize_room", {
    room_id: journal.roomId, match_id: journal.matchId,
    transcript_hash: sha("Shadownet indexed FA2 test replay"),
    result_hash: sha("Shadownet indexed FA2 test result"),
    human_ranks: [entrantAddress], lot_places: [1],
  });
  await step("claim", sponsor.signer, escrowAddress, "claim_lot",
    { room_id: journal.roomId, index: 0 });
  const claimHash = journal.operations.claim.hash;
  const claimOperationsResponse = await fetch("https://api.shadownet.tzkt.io/v1/operations/transactions/" +
    encodeURIComponent(claimHash));
  assert(claimOperationsResponse.ok);
  const claimOperations = await claimOperationsResponse.json();
  const claimTokenCall = claimOperations.find((operation: any) => operation.hash === claimHash &&
    operation.status === "applied" && operation.sender?.address === escrowAddress &&
    operation.target?.address === tokenAddress && operation.parameter?.entrypoint === "transfer");
  assert(claimTokenCall, "Claim confirmed on chain, awaiting indexed internal FA2 call.");
  const claimTransfersResponse = await fetch("https://api.shadownet.tzkt.io/v1/tokens/transfers?" +
    new URLSearchParams({ transactionId: String(claimTokenCall.id),
      "token.contract": tokenAddress, "token.tokenId": "0", from: escrowAddress, to: entrantAddress }));
  assert(claimTransfersResponse.ok);
  const claimTransfers = await claimTransfersResponse.json();
  assert(claimTransfers.some((transfer: any) => transfer.transactionId === claimTokenCall.id &&
    transfer.from?.address === escrowAddress && transfer.to?.address === entrantAddress &&
    transfer.amount === "1" && transfer.token?.standard === "fa2"),
    "Claim confirmed on chain, awaiting TzKT prize-transfer index.");
  const [recipientResponse, escrowResponse] = await Promise.all([
    fetch("https://api.shadownet.tzkt.io/v1/tokens/balances?account=" + entrantAddress +
      "&token.contract=" + tokenAddress + "&token.tokenId=0"),
    fetch("https://api.shadownet.tzkt.io/v1/tokens/balances?account=" + escrowAddress +
      "&token.contract=" + tokenAddress + "&token.tokenId=0"),
  ]);
  assert(recipientResponse.ok && escrowResponse.ok);
  const recipient = (await recipientResponse.json())[0];
  const escrow = (await escrowResponse.json())[0];
  assert(BigInt(recipient?.balance || "0") >= 1n,
    "Claim confirmed on chain, awaiting TzKT recipient balance index.");
  assert.equal(escrow?.balance || "0", "0");
  console.log(JSON.stringify({ phase: "complete", roomId: journal.roomId,
    fundHash: journal.operations.fund.hash, claimHash,
    tokenAddress, recipientBalance: recipient.balance, escrowBalance: escrow?.balance || "0" }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
