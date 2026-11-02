import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
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
