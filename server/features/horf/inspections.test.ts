import assert from "node:assert/strict";
import test from "node:test";
import { loadInspectionEvidence } from "./inspections";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const tokenId = "7";

test("Marshal Open Range evidence checks a horse without inventing an owner", async () => {
  const reads: string[] = [];
  const evidence = await loadInspectionEvidence(null, contract, tokenId, {
    exclusionCheck: async () => false,
    readIndex: async (path) => {
      reads.push(path);
      if (path === "/tokens/transfers") return [{
        id: 21, token: { contract: { address: contract }, tokenId },
        from: { address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" },
        to: { address: "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6" },
        amount: "1", timestamp: "2026-11-03T12:00:00Z", transactionId: 11,
      }] as never;
      throw new Error(`Unexpected indexed read: ${path}`);
    },
    loadToken: async () => ({
      fa_contract: contract, token_id: tokenId, name: "Horse Art 2026", decimals: 0,
      thumbnail_uri: "ipfs://QmSharedThumbnail", artifact_uri: "ipfs://QmUniqueHorse", mime: "image/png",
      tags: [{ tag: { name: "horse art" } }],
    }),
    readIdentity: async () => ({
      contract, creatorAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
      codeHash: 123, codeSha256: "a".repeat(64), asOf: "2026-11-03T12:00:00Z",
      source: "Tezos Mainnet TzKT and RPC",
    }),
  });

  assert.deepEqual(reads, ["/tokens/transfers"]);
  assert.equal(evidence.chainEvidence.ownerAddress, null);
  assert.equal(evidence.chainEvidence.ownerBalance, null);
  assert.match(String(evidence.chainEvidence.note), /no owner submission or owner-balance claim/i);
  assert.equal(evidence.objktMetadata.name, "Horse Art 2026");
  assert.equal(evidence.objktMetadata.artifactUri, "https://ipfs.fileship.xyz/QmUniqueHorse");
  assert.equal(evidence.objktMetadata.mime, "image/png");
  assert.deepEqual(evidence.chainEvidence.recentTransfers, [{
    id: 21, transactionId: 11, from: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    to: "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6", amount: "1",
    timestamp: "2026-11-03T12:00:00Z",
  }]);
});

test("Marshal evidence still rejects tokens that fail Horf's horse test", async () => {
  await assert.rejects(loadInspectionEvidence(null, contract, tokenId, {
    readIndex: async () => [] as never,
    loadToken: async () => ({ fa_contract: contract, token_id: tokenId, name: "Abstract Shape", decimals: 0 }),
    readIdentity: async () => ({
      contract, creatorAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
      codeHash: 123, codeSha256: "a".repeat(64), asOf: "2026-11-03T12:00:00Z",
      source: "Tezos Mainnet TzKT and RPC",
    }),
  }), /qualifying horse mint keyword/i);
});

test("Owner-submitted evidence still requires the submitter's current Mainnet balance", async () => {
  const owner = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
  const reads: string[] = [];
  await assert.rejects(loadInspectionEvidence(owner, contract, tokenId, {
    readIndex: async (path) => {
      reads.push(path);
      if (path === "/head") return { chainId: "NetXdQprcVkpaWU" } as never;
      if (path === "/tokens/balances" || path === "/tokens/transfers") return [] as never;
      throw new Error(`Unexpected indexed read: ${path}`);
    },
    loadToken: async () => ({ fa_contract: contract, token_id: tokenId, name: "Horse Art 2026", decimals: 0,
      tags: [{ tag: { name: "horse art" } }] }),
    readIdentity: async () => ({
      contract, creatorAddress: owner, codeHash: 123, codeSha256: "a".repeat(64),
      asOf: "2026-11-03T12:00:00Z", source: "Tezos Mainnet TzKT and RPC",
    }),
  }), /does not currently hold/i);
  assert.ok(reads.includes("/tokens/balances"));
});
