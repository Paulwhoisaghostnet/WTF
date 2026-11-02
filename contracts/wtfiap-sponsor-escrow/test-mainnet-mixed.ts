#!/usr/bin/env node
/** Journaled Mainnet XTZ, WTF, and FA2 sponsor-prize smoke. No preflight write. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";
import { TezosToolkit } from "@taquito/taquito";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";
import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";
import { hashTypedScript } from "../wtfiap-escrow/script-identity";
import { sponsorArtifactScriptHash, tezosSponsorChain } from "../../server/features/wtfiap/sponsor-funding-chain";
import type { SponsorRecord } from "../../server/features/wtfiap/sponsor-funding";

const rpcEndpoints = ["https://tezos-mainnet.octez.io/",
  "https://tcinfra.net/rpc/tezos/mainnet"] as const;
const rpc = process.env.WTFIAP_MAINNET_SMOKE_RPC || rpcEndpoints[0];
assert(rpcEndpoints.includes(rpc as typeof rpcEndpoints[number]),
  "Use only the configured Tezos Mainnet primary or fallback RPC.");
const chainId = "NetXdQprcVkpaWU";
const escrowAddress = "KT1MmvdGHAaTbRLvSwNuw1W94scbGMtpQs4u";
const scriptHash = "77947dbf0ef86261826f76a1affe4a4e52b80593f07253ad46bbbf527a296aae";
const tokenAddress = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const refereeAddress = "tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo";
const sponsorAddress = "tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u";
const treasuryAddress = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const xtzPrizeAtomic = "10000"; // 0.01 XTZ, the contract's exact payout quantum.
const wtfPrizeAtomic = "1000000"; // 0.01 WTF, the contract's exact payout quantum.
const lotAtomic = "1"; // One base unit of the standard FA2 token.
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function indexedBalance(account: string): Promise<bigint> {
  const response = await fetch("https://api.tzkt.io/v1/tokens/balances?" + new URLSearchParams({
    account, "token.contract": tokenAddress, "token.tokenId": "0",
  }));
  assert(response.ok, `Mainnet token indexer returned ${response.status}.`);
  const rows = await response.json();
  assert(Array.isArray(rows), "Mainnet token indexer returned invalid balances.");
  const row = rows.find((item: any) => item.account?.address === account &&
    item.token?.contract?.address === tokenAddress &&
    String(item.token?.tokenId) === "0" && item.token?.standard === "fa2");
  return row ? BigInt(row.balance) : 0n;
}

async function main() {
  const [envFile, proofDirectory, mode] = process.argv.slice(2);
  assert(envFile && proofDirectory && (mode === "--preflight" || mode === "--execute"),
    "Usage: test-mainnet-mixed <signer-env or - for preflight> <proof-directory> --preflight|--execute");
  const tezos = new TezosToolkit(rpc);
  assert.equal(await tezos.rpc.getChainId(), chainId);
  let referee: any, sponsor: any;
  if (mode === "--preflight") {
    const readOnly = async (address: string) => {
      const publicKey = await tezos.rpc.getManagerKey(address);
      assert(publicKey, `Mainnet wallet ${address} has no revealed public key.`);
      return { wallet: { address, network: "mainnet" }, signer: {
        publicKeyHash: async () => address, publicKey: async () => publicKey,
        secretKey: async () => { throw Error("Read-only preflight cannot sign."); },
        sign: async () => { throw Error("Read-only preflight cannot sign."); },
      } };
    };
    [referee, sponsor] = await Promise.all([
      readOnly(refereeAddress), readOnly(sponsorAddress),
    ]);
  } else {
    assert(envFile !== "-", "Execution requires a signer environment file.");
    Object.assign(process.env, dotenv.parse(await readFile(envFile)));
    const keyring = new PlatformWalletKeyring(loadEnv());
    [referee, sponsor] = await Promise.all([
      keyring.getSigner("contract-admin"), keyring.getSigner("reward-disburser"),
    ]);
  }
  assert.equal(referee.wallet.address, refereeAddress);
  assert.equal(sponsor.wallet.address, sponsorAddress);
  assert.equal(referee.wallet.network, "mainnet");
  assert.equal(sponsor.wallet.network, "mainnet");
  assert.equal(sponsorArtifactScriptHash(), scriptHash);
  const block = await tezos.rpc.getBlockHash({ block: "head~2" });
  const script = await tezos.rpc.getScript(escrowAddress, { block });
  assert.equal(hashTypedScript(script.code), scriptHash);
  const storage: any = await tezos.contract.getStorage(escrowAddress, script, block);
  assert.equal(storage.room_creator, refereeAddress);
  assert.equal(storage.wtf_token_address, tokenAddress);
  assert.equal(storage.wtf_token_id.toString(), "0");
  assert.equal(storage.treasury_address, treasuryAddress);
  assert.equal(storage.xtz_paid_room_house_fee.toString(), "500000");
  assert.equal(storage.xtz_quantum.toString(), "10000");
  assert.equal(storage.wtf_quantum.toString(), wtfPrizeAtomic);
  const [sponsorWtfBefore, sponsorXtz, refereeXtz, winnerWtfBefore] = await Promise.all([
    indexedBalance(sponsorAddress), tezos.tz.getBalance(sponsorAddress),
    tezos.tz.getBalance(refereeAddress), indexedBalance(refereeAddress),
  ]);
  assert(sponsorWtfBefore >= BigInt(wtfPrizeAtomic) + BigInt(lotAtomic),
    "Sponsor lacks the 0.01 WTF prize and one FA2 lot unit.");
  tezos.setProvider({ signer: referee.signer });
  const contract = await tezos.contract.at(escrowAddress);
  const preview = { room_id: "a".repeat(64), terms_hash: "b".repeat(64),
    rules_hash: "c".repeat(64), seed_commitment: "d".repeat(64),
    referee: refereeAddress, sponsor: sponsorAddress, mode: 0,
    minimum_humans: 2, entry_currency: 0, entry_amount: 0,
    pool_numerator: 0, pool_denominator: 1, designated_wallet: treasuryAddress,
    places: [{ xtz: xtzPrizeAtomic, wtf: wtfPrizeAtomic, pool_weight: 0 }],
    lots: [{ token_address: tokenAddress, token_id: 0, amount: lotAtomic,
      fixed_place: 1 }], pick_counts: [] };
  const createEstimate = await tezos.estimate.transfer(
    contract.methodsObject.create_room(preview).toTransferParams());
  const sponsorTezos = new TezosToolkit(rpc);
  sponsorTezos.setProvider({ signer: sponsor.signer });
  const token = await sponsorTezos.contract.at(tokenAddress);
  const operatorParams = [{ add_operator: {
    owner: sponsorAddress, operator: escrowAddress, token_id: 0,
  } }];
  const operatorEstimate = await sponsorTezos.estimate.transfer(
    token.methodsObject.update_operators(operatorParams).toTransferParams());
  assert(BigInt(refereeXtz.toFixed()) >
    BigInt(createEstimate.suggestedFeeMutez) + BigInt(createEstimate.burnFeeMutez),
  "Referee cannot afford the estimated room creation fee and storage.");
  assert(BigInt(sponsorXtz.toFixed()) > BigInt(xtzPrizeAtomic) +
    BigInt(operatorEstimate.suggestedFeeMutez) + BigInt(operatorEstimate.burnFeeMutez),
  "Sponsor cannot afford the XTZ prize and estimated operator authorization.");
  console.log(JSON.stringify({ phase: "preflight", network: "mainnet", chainId,
    escrowAddress, scriptHash, sponsorAddress, refereeAddress,
    sponsorWtfAtomic: sponsorWtfBefore.toString(), winnerWtfAtomic: winnerWtfBefore.toString(),
    sponsorXtzMutez: sponsorXtz.toFixed(), refereeXtzMutez: refereeXtz.toFixed(),
    createFeeMutez: String(createEstimate.suggestedFeeMutez),
    createStorageBurnMutez: String(createEstimate.burnFeeMutez),
    operatorFeeMutez: String(operatorEstimate.suggestedFeeMutez),
    operatorStorageBurnMutez: String(operatorEstimate.burnFeeMutez),
    entryFeeAtomic: "0", houseFeeAtomic: "0", prizeXtzAtomic: xtzPrizeAtomic,
    prizeWtfAtomic: wtfPrizeAtomic, lotAtomic }));
  if (mode === "--preflight") return;
  assert.equal(process.env.WTF_COLILSEUM_MAINNET_SPONSOR_SMOKE, "1",
    "Mainnet writes require explicit sponsor-smoke opt-in.");
  await mkdir(proofDirectory, { recursive: true });
  const journalPath = `${proofDirectory}/mainnet-mixed-lifecycle.json`;
  let journal: any;
  try { journal = JSON.parse(await readFile(journalPath, "utf8")); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  if (!journal) {
    journal = { network: "mainnet", chainId, escrowAddress, tokenAddress,
      sponsorAddress, refereeAddress, xtzPrizeAtomic, wtfPrizeAtomic, lotAtomic,
      roomId: randomBytes(32).toString("hex"), termsHash: randomBytes(32).toString("hex"),
      rulesHash: sha("coLILseum Mainnet free mixed sponsor proof"),
      seedCommitment: randomBytes(32).toString("hex"), matchId: randomBytes(32).toString("hex"),
      winnerWtfBefore: winnerWtfBefore.toString(), operations: {} };
    await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  for (const [key, value] of Object.entries({ network: "mainnet", chainId,
    escrowAddress, tokenAddress, sponsorAddress, refereeAddress,
    xtzPrizeAtomic, wtfPrizeAtomic, lotAtomic }))
    assert.equal(journal[key], value, `Saved Mainnet intent changed: ${key}.`);
  const save = () => writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
  async function step(name: string, signer: any, address: string,
    entrypoint: string, params: any, amountMutez = 0) {
    const prior = journal.operations[name];
    if (prior?.status === "confirmed") return;
    if (prior) throw new Error(`${name} may have been sent already; reconcile ${prior.hash || "prepared"}.`);
    const toolkit = new TezosToolkit(rpc); toolkit.setProvider({ signer });
    const target = await toolkit.contract.at(address);
    const call = target.methodsObject[entrypoint](params);
    const estimate = await toolkit.estimate.transfer(
      call.toTransferParams({ amount: amountMutez, mutez: true }));
    journal.operations[name] = { status: "prepared",
      feeEstimateMutez: String(estimate.suggestedFeeMutez),
      burnEstimateMutez: String(estimate.burnFeeMutez) };
    await save();
    const operation = await call.send({ amount: amountMutez, mutez: true });
    journal.operations[name] = { ...journal.operations[name], status: "injected", hash: operation.hash };
    await save();
    console.log(JSON.stringify({ phase: "injected", name, hash: operation.hash }));
    // The hosted reader pins head~2; inclusion plus two successors is required.
    await operation.confirmation(3);
    journal.operations[name].status = "confirmed"; await save();
    console.log(JSON.stringify({ phase: "confirmed", name, hash: operation.hash }));
  }
  const roomHash = { room_id: journal.roomId, expected_terms_hash: journal.termsHash };
  const record: SponsorRecord = {
    schemaVersion: 1, roomCode: "mainnet-wtf-proof", roomId: journal.roomId,
    config: { enabled: true, network: "mainnet", chainId, rpcUrl: rpc,
      escrowContract: escrowAddress, scriptHash, roomCreator: refereeAddress,
      referee: refereeAddress, walletId: "contract-admin", treasury: treasuryAddress,
      wtfToken: { contract: tokenAddress, tokenId: "0" }, houseFeeAtomic: "500000",
      rulesHash: journal.rulesHash },
    plan: { mode: "fixed", minimumHumans: 2,
      entry: { currency: "FREE", entryAtomic: "0", poolNumerator: "0",
        poolDenominator: "1", designatedWallet: null },
      places: [{ place: 1, xtzAtomic: xtzPrizeAtomic,
        wtfAtomic: wtfPrizeAtomic, poolWeight: "0" }],
      tokens: [{ contract: tokenAddress, tokenId: "0", amount: lotAtomic, place: 1 }],
      deposit: { xtzAtomic: xtzPrizeAtomic, wtfAtomic: wtfPrizeAtomic } },
    sponsor: { userId: "mainnet-test-sponsor", walletAddress: sponsorAddress },
    bindings: [
      { userId: "mainnet-test-sponsor", playerId: "sponsor", walletAddress: sponsorAddress,
        name: "Sponsor" },
      { userId: "mainnet-test-winner", playerId: "winner", walletAddress: refereeAddress,
        name: "Winner" },
    ],
    lock: null, termsHash: journal.termsHash, startRequested: false, status: "test",
    chain: null, intents: [], observations: [], finalResult: null, technicalVoid: null,
    error: null, lastReconciledAt: null,
  };
  const reader = tezosSponsorChain();
  await step("operator", sponsor.signer, tokenAddress, "update_operators",
    operatorParams);
  await step("create", referee.signer, escrowAddress, "create_room", {
    ...preview, room_id: journal.roomId, terms_hash: journal.termsHash,
    rules_hash: journal.rulesHash, seed_commitment: journal.seedCommitment,
  });
  await step("fund:xtz", sponsor.signer, escrowAddress, "fund_sponsor_xtz",
    roomHash, Number(xtzPrizeAtomic));
  await step("fund:wtf", sponsor.signer, escrowAddress, "fund_sponsor_wtf", roomHash);
  await step("fund:lot", sponsor.signer, escrowAddress, "fund_sponsor_lot",
    { ...roomHash, index: 0 });
  record.observations.push({ userId: "mainnet-test-sponsor", action: "sponsorToken:0",
    operationHash: journal.operations["fund:lot"].hash,
    observedAt: new Date().toISOString() });
  let view = await reader.read(record);
  assert(view && view.status === "funding" && view.sponsorXtzFunded &&
    view.sponsorWtfFunded && view.heldXtz === xtzPrizeAtomic &&
    view.heldWtf === wtfPrizeAtomic &&
    view.verifiedLots.includes(0),
  "Hosted reader did not verify all three prize deposits.");
  console.log(JSON.stringify({ phase: "host-verified", roomId: journal.roomId,
    heldXtz: view.heldXtz, heldWtf: view.heldWtf,
    verifiedLots: view.verifiedLots }));
  for (const [name, wallet] of [["sponsor", sponsorAddress],
    ["winner", refereeAddress]] as const)
    await step(`register:${name}`, referee.signer, escrowAddress,
      "register_entrant", { room_id: journal.roomId, player: wallet });
  await step("join:sponsor", sponsor.signer, escrowAddress, "join_room", roomHash);
  await step("join:winner", referee.signer, escrowAddress, "join_room", roomHash);
  await step("start", referee.signer, escrowAddress, "start_room",
    { ...roomHash, match_id: journal.matchId });
  await step("finalize", referee.signer, escrowAddress, "finalize_room", {
    room_id: journal.roomId, match_id: journal.matchId,
    transcript_hash: sha("Mainnet mixed sponsor test replay"),
    result_hash: sha("Mainnet mixed sponsor test result"),
    human_ranks: [refereeAddress, sponsorAddress], lot_places: [1],
  });
  view = await reader.read(record);
  assert(view?.status === "settled" &&
    view.cashClaims[`${refereeAddress}:XTZ`]?.amount === xtzPrizeAtomic &&
    view.cashClaims[`${refereeAddress}:WTF`]?.amount === wtfPrizeAtomic &&
    view.lotClaims[0]?.recipient === refereeAddress &&
    view.lotClaims[0]?.claimed === false,
  "Hosted reader did not find all three unclaimed winner prizes.");
  await step("claim:xtz", referee.signer, escrowAddress, "claim_cash",
    { room_id: journal.roomId, recipient: refereeAddress, currency: 0 });
  await step("claim:wtf", referee.signer, escrowAddress, "claim_cash",
    { room_id: journal.roomId, recipient: refereeAddress, currency: 1 });
  await step("claim:lot", referee.signer, escrowAddress, "claim_lot",
    { room_id: journal.roomId, index: 0 });
  view = await reader.read(record);
  assert(view?.cashClaims[`${refereeAddress}:XTZ`]?.claimed === true &&
    view.cashClaims[`${refereeAddress}:WTF`]?.claimed === true &&
    view.lotClaims[0]?.claimed === true && view.heldXtz === "0" &&
    view.heldWtf === "0", "Hosted reader did not verify all three payouts.");
  console.log(JSON.stringify({ phase: "complete", roomId: journal.roomId,
    winner: refereeAddress, xtzClaimedAtomic: xtzPrizeAtomic,
    wtfClaimedAtomic: wtfPrizeAtomic, lotClaimedAtomic: lotAtomic,
    heldXtz: view.heldXtz, heldWtf: view.heldWtf }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
