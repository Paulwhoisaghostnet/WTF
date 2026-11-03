import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ParameterSchema } from "@taquito/michelson-encoder";
import { sponsorArtifactScriptHash, tezosSponsorChain } from "./sponsor-funding-chain";

test("settled sponsor escrow reads flattened Taquito cash and FA2 lot keys", async () => {
  const roomId = "aa".repeat(32);
  const sponsor = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
  const treasury = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
  const entrant = "tz1bZJgnowmGBHt3ftHZDsgANN1JzHJgRpVv";
  const cashKeys: unknown[] = [], lotKeys: unknown[] = [];
  const code = JSON.parse(readFileSync("contracts/wtfiap-sponsor-escrow/artifacts/contract.json", "utf8"));
  const storage = {
    room_creator: sponsor, wtf_token_address: "KT1U3isJU8p1rtfjZaEWa31FCSKNeLiuL7zg",
    wtf_token_id: 0, treasury_address: treasury, xtz_paid_room_house_fee: 0,
    xtz_quantum: 10000, wtf_quantum: 1000000,
    rooms: { get: async () => ({ status: 2, terms_hash: "bb".repeat(32),
      rules_hash: "cc".repeat(32), seed_commitment: "dd".repeat(32),
      sponsor, referee: sponsor, minimum_humans: 1, entry_currency: 0,
      entry_amount: 0, mode: 0, pool_numerator: 0, pool_denominator: 1,
      designated_wallet: sponsor, places: [{ xtz: 10000, wtf: 0, pool_weight: 0 }],
      lots: [], pick_counts: [], entrants: [entrant], paid: [entrant],
      sponsor_xtz_funded: true, sponsor_wtf_funded: false, funded_lots: [],
      prize_xtz: 10000, prize_wtf: 0, house_fee: 0, held_xtz: 0, held_wtf: 0,
      match_id: { Some: "ee".repeat(32) }, result_hash: { Some: "ff".repeat(32) },
      transcript_hash: { Some: "11".repeat(32) }, void_reason_hash: null,
      void_evidence_hash: null }) },
    cash_claims: { get: async (key: unknown) => { cashKeys.push(key); return null; } },
    lot_claims: { get: async (key: unknown) => { lotKeys.push(key); return null; } },
  };
  const toolkit = () => ({ rpc: {
    getChainId: async () => "NetXsqzbfFenSTS",
    getBlockHash: async () => "BMock",
    getBlockHeader: async () => ({ level: 42 }),
    getScript: async () => ({ code }),
  }, contract: { getStorage: async () => storage } });
  const record: any = { roomId,
    config: { network: "shadownet", chainId: "NetXsqzbfFenSTS",
      rpcUrl: "https://tezos-shadownet.octez.io/", escrowContract: "KT1EpPzrYahest4Wm9UddKBAx1Ha7xBQt1YQ",
      scriptHash: sponsorArtifactScriptHash(), roomCreator: sponsor, referee: sponsor,
      treasury, wtfToken: { contract: storage.wtf_token_address, tokenId: "0" }, houseFeeAtomic: "0" },
    sponsor: { walletAddress: sponsor }, bindings: [{ walletAddress: entrant }],
    plan: { entry: { designatedWallet: sponsor }, tokens: [{}] } };
  const room = await tezosSponsorChain(toolkit as any).read(record);
  assert.equal(room?.status, "settled");
  assert.deepEqual(cashKeys, [
    [roomId, sponsor, 0], [roomId, sponsor, 1],
    [roomId, treasury, 0], [roomId, treasury, 1],
    [roomId, entrant, 0], [roomId, entrant, 1],
  ]);
  assert.deepEqual(lotKeys, [[roomId, 0]]);
});

for (const network of ["mainnet", "shadownet"] as const) test(`${network} wallet failure requires exact finalized sponsor escrow contents`, async () => {
  const wallet = "tz1T9d8Qi4ZmWHNWgtbU6DwArwu191NfRnHe";
  const contract = "KT1EpPzrYahest4Wm9UddKBAx1Ha7xBQt1YQ";
  const chainId = network === "mainnet" ? "NetXdQprcVkpaWU" : "NetXsqzbfFenSTS";
  const operationHash = "o" + "1".repeat(50);
  const roomId = "aa".repeat(32), termsHash = "bb".repeat(32);
  const entrypoint = "fund_sponsor_xtz";
  const api = JSON.parse(readFileSync("contracts/wtfiap-sponsor-escrow/artifacts/interface.json", "utf8"));
  const encoded = new ParameterSchema(api.entrypoints[entrypoint]).EncodeObject({
    room_id: roomId, expected_terms_hash: termsHash,
  });
  const record: any = { roomId, termsHash,
    sponsor: { userId: "1", walletAddress: wallet }, bindings: [],
    config: { network, chainId, rpcUrl: `https://local.${network}.invalid`,
      indexerUrl: `https://indexer.${network}.invalid`, escrowContract: contract,
      houseFeeAtomic: network === "mainnet" ? "500000" : "0" },
    plan: { entry: { currency: "XTZ" }, deposit: { xtzAtomic: "1000000" }, tokens: [] } };
  const observation: any = { userId: "1", action: "sponsorXtz", operationHash,
    observedAt: "2026-11-03T00:00:00Z" };
  const finalized: any = { blockHash: "Bfinal", level: 100 };
  let liveChainId = chainId, included = "Bincluded", operation = operationHash;
  let candidateLevel = 99, status = "failed", amount = network === "mainnet" ? "1500000" : "1000000";
  let parameters = encoded, indexerAvailable = true, rpcAvailable = true;
  const rpc: any = {
    async getChainId() { if (!rpcAvailable) throw Error("RPC unavailable"); return liveChainId; },
    async getBlockHeader({ block }: any) { assert.equal(block, "Bfinal"); return { level: 100 }; },
    async getEntrypoints(_contract: any, { block }: any) { assert.equal(block, "Bfinal");
      return { entrypoints: { [entrypoint]: api.entrypoints[entrypoint] } }; },
    async getBlockHash({ block }: any) { assert.equal(block, `Bfinal~${100 - candidateLevel}`);
      return "Bincluded"; },
    async getBlock({ block }: any) { assert.equal(block, "Bincluded");
      return { operations: [[{ hash: operation, contents: [{ kind: "transaction", source: wallet,
        destination: contract, amount, parameters: { entrypoint, value: parameters },
        metadata: { operation_result: { status } } }] }]] }; },
  };
  const chain = tezosSponsorChain(() => ({ rpc }));
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    if (!indexerAvailable) throw Error("indexer unavailable");
    return new Response(JSON.stringify([{ sender: { address: wallet },
      target: { address: contract }, parameter: { entrypoint }, level: candidateLevel,
      block: included, status: "failed" }]));
  };
  try {
    const failures = () => chain.failedObservations!(record, finalized, [observation]);
    assert.equal((await failures()).length, 1);
    status = "backtracked"; assert.equal((await failures()).length, 1);
    status = "skipped"; assert.equal((await failures()).length, 1);
    status = "applied"; assert.deepEqual(await failures(), []);
    status = "failed"; amount = "1"; assert.deepEqual(await failures(), []);
    amount = network === "mainnet" ? "1500000" : "1000000";
    parameters = { bytes: "wrong" }; assert.deepEqual(await failures(), []);
    parameters = encoded; operation = "o" + "2".repeat(50); assert.deepEqual(await failures(), []);
    operation = operationHash; included = "Bunrelated"; assert.deepEqual(await failures(), []);
    included = "Bincluded"; candidateLevel = 101; assert.deepEqual(await failures(), []);
    candidateLevel = 99; liveChainId = network === "mainnet" ? "NetXsqzbfFenSTS" : "NetXdQprcVkpaWU";
    await assert.rejects(failures(), /chain mismatch/);
    liveChainId = chainId; indexerAvailable = false; assert.deepEqual(await failures(), []);
    indexerAvailable = true; rpcAvailable = false; await assert.rejects(failures(), /RPC unavailable/);
  } finally { globalThis.fetch = previous; }
});
