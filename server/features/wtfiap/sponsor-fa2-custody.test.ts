import assert from "node:assert/strict";
import test from "node:test";
import { verifySponsorLotCustody } from "./sponsor-fa2-custody";
import type { SponsorRecord } from "./sponsor-funding";

const opHash = "o" + "a".repeat(50), roomId = "b".repeat(64), termsHash = "c".repeat(64);
const fixture = (): SponsorRecord => ({
  roomId, termsHash,
  config: { network: "shadownet", escrowContract: "KT1Escrow" },
  sponsor: { userId: "sponsor-account", walletAddress: "tz1Sponsor" },
  plan: { tokens: [{ contract: "KT1Token", tokenId: "42", amount: "2" }] },
  observations: [{ userId: "sponsor-account", action: "sponsorToken:0", operationHash: opHash,
    observedAt: "2026-11-02T22:00:00Z" }],
}) as unknown as SponsorRecord;
const parent = { id: 100, hash: opHash, level: 50, status: "applied",
  sender: { address: "tz1Sponsor" }, target: { address: "KT1Escrow" },
  parameter: { entrypoint: "fund_sponsor_lot", value: {
    room_id: roomId, index: 0, expected_terms_hash: termsHash,
  } } };
const tokenCall = { id: 101, hash: opHash, level: 50, status: "applied",
  sender: { address: "KT1Escrow" }, target: { address: "KT1Token" },
  parameter: { entrypoint: "transfer" } };
const transfer = { transactionId: 101, level: 50,
  from: { address: "tz1Sponsor" }, to: { address: "KT1Escrow" },
  token: { contract: { address: "KT1Token" }, tokenId: "42", standard: "fa2" }, amount: "2" };
const balance = { account: { address: "KT1Escrow" },
  token: { contract: { address: "KT1Token" }, tokenId: "42", standard: "fa2" }, balance: "2" };

function indexer(overrides: { operations?: unknown; transfers?: unknown; balances?: unknown } = {}) {
  const paths: string[] = [];
  const responses: Record<string, unknown> = {
    "/v1/operations/transactions/": overrides.operations ?? [parent, tokenCall],
    "/v1/tokens/transfers": overrides.transfers ?? [transfer],
    "/v1/tokens/balances": overrides.balances ?? [balance],
  };
  const fetcher = (async (url: string) => {
    paths.push(url);
    const key = Object.keys(responses).find(path => url.includes(path));
    return { ok: !!key, status: key ? 200 : 404, async json() { return responses[key!]; } };
  }) as typeof fetch;
  return { fetcher, paths };
}

test("a finalized exact FA2 transfer and escrow balance verifies its funded lot", async () => {
  const value = fixture(), api = indexer();
  const proof = await verifySponsorLotCustody(value, 0, [0], 52, api.fetcher);
  assert.deepEqual(proof, { operationHash: opHash, operationLevel: 50,
    tokenTransactionId: 101, escrowBalance: "2" });
  assert.ok(api.paths[1].includes("transactionId=101"));
  assert.ok(api.paths[2].includes("account=KT1Escrow"));
});

test("unfinalized, unobserved, wrong recipient and missing escrow holdings fail closed", async () => {
  assert.equal(await verifySponsorLotCustody(fixture(), 0, [0], 49, indexer().fetcher), null);
  const missing = fixture(); missing.observations = [];
  assert.equal(await verifySponsorLotCustody(missing, 0, [0], 52, indexer().fetcher), null);
  assert.equal(await verifySponsorLotCustody(fixture(), 0, [0], 52,
    indexer({ transfers: [{ ...transfer, to: { address: "tz1Other" } }] }).fetcher), null);
  assert.equal(await verifySponsorLotCustody(fixture(), 0, [0], 52,
    indexer({ balances: [{ ...balance, balance: "1" }] }).fetcher), null);
  assert.equal(await verifySponsorLotCustody(fixture(), 0, [0], 52,
    indexer({ operations: [{ ...parent, parameter: { ...parent.parameter, value: {
      ...parent.parameter.value, index: 1,
    } } }, tokenCall] }).fetcher), null);
});

test("two lots of the same token need enough aggregate escrow balance", async () => {
  const value = fixture(); value.plan.tokens.push({ contract: "KT1Token", tokenId: "42", amount: "2" });
  assert.equal(await verifySponsorLotCustody(value, 0, [0, 1], 52, indexer().fetcher), null);
  assert.ok(await verifySponsorLotCustody(value, 0, [0, 1], 52,
    indexer({ balances: [{ ...balance, balance: "4" }] }).fetcher));
});
