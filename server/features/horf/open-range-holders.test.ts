import assert from "node:assert/strict";
import test from "node:test";
import { createOpenRangeHolderFilter } from "./open-range-holders";
import type { OpenRangeItem } from "./open-range-source";

const contract = "KT1EKNnM4kKS7k6CMMsEtMYvPDPawnTtsdeK";
const burn = "tz1burnburnburnburnburnburnburjAYjjX";

function horse(tokenId: string): OpenRangeItem {
  return { contract, tokenId, name: "Makiuma", description: null, image: null,
    artifactUri: null, mime: "image/png", mintedAt: "2026-11-04T17:00:00.000Z",
    creatorAddress: null, eligibility: "auto" };
}

test("Open Range omits burn-only remints from a cached mint page and keeps live or mixed-held editions", async () => {
  let now = 0;
  let burnRows = [
    { id: 1, "account.address": burn, "token.contract.address": contract,
      "token.tokenId": "4", balance: "100", "token.totalSupply": "100" },
    { id: 2, "account.address": burn, "token.contract.address": contract,
      "token.tokenId": "5", balance: "100", "token.totalSupply": "100" },
    { id: 3, "account.address": burn, "token.contract.address": contract,
      "token.tokenId": "6", balance: "1", "token.totalSupply": "100" },
  ];
  const calls: string[] = [];
  const read = async <T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> => {
    calls.push(path);
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU" } as T;
    assert.equal(path, "/tokens/balances");
    assert.equal(params?.account, burn);
    assert.equal(params?.["token.contract"], contract);
    assert.equal(params?.["token.tokenId.in"], "4,5,6");
    return burnRows as T;
  };
  const filter = createOpenRangeHolderFilter(read, () => now);
  const cachedMintPage = [horse("4"), horse("5"), horse("6")];
  assert.deepEqual((await filter(cachedMintPage)).items.map((item) => item.tokenId), ["6"]);
  assert.deepEqual((await filter(cachedMintPage)).items.map((item) => item.tokenId), ["6"]);
  assert.deepEqual(calls, ["/head", "/tokens/balances"]);

  // Ownership changed after the cached mint page was stored. Refresh the
  // holder verdict after one Mainnet block, without rediscovering mint tags.
  now = 6_000;
  burnRows = burnRows.filter((row) => row["token.tokenId"] !== "4");
  assert.deepEqual((await filter(cachedMintPage)).items.map((item) => item.tokenId), ["4", "6"]);
});

test("Open Range refuses holder verdicts from a non-Mainnet index", async () => {
  const reads: string[] = [];
  const filter = createOpenRangeHolderFilter(async <T>(path: string): Promise<T> => {
    reads.push(path);
    return { chainId: "NetXnHfVqm9iesp" } as T;
  });
  await assert.rejects(filter([horse("4")]), /Mainnet/);
  assert.deepEqual(reads, ["/head"]);
});

test("Open Range checks exact contract groups without a cross-product or uncontrolled burst", async () => {
  const otherContracts = Array.from({ length: 18 }, (_, index) =>
    `KT1${"A".repeat(32)}${String.fromCharCode(65 + index)}`);
  const items = otherContracts.map((address) => ({ ...horse("1"), contract: address })).concat(horse("4"));
  let active = 0;
  let peak = 0;
  const groups: string[] = [];
  const filter = createOpenRangeHolderFilter(async <T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> => {
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU" } as T;
    assert.equal(params?.["token.tokenId.in"], params?.["token.contract"] === contract ? "4" : "1");
    assert.equal(params?.limit, 2);
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
    groups.push(String(params?.["token.contract"]));
    return (params?.["token.contract"] === contract
      ? [{ "account.address": burn, "token.contract.address": contract,
        "token.tokenId": "4", balance: "100", "token.totalSupply": "100" }]
      : []) as T;
  });
  const visible = await filter(items);
  assert.equal(visible.items.length, 18);
  assert.equal(visible.items.some((item) => item.contract === contract), false);
  assert.equal(groups.length, 19);
  assert.ok(peak <= 4);
});

test("Open Range keeps verified burn exclusions during a temporary index outage", async () => {
  let now = 0;
  let outage = false;
  let attempts = 0;
  const filter = createOpenRangeHolderFilter(async <T>(path: string): Promise<T> => {
    if (path === "/head") {
      attempts += 1;
      if (outage) throw new Error("TzKT temporarily unavailable");
      return { chainId: "NetXdQprcVkpaWU" } as T;
    }
    return [{ id: 1, "account.address": burn, "token.contract.address": contract,
      "token.tokenId": "4", balance: "100", "token.totalSupply": "100" }] as T;
  }, () => now);
  const items = [horse("4"), horse("6")];
  assert.deepEqual((await filter(items)).items.map((item) => item.tokenId), ["6"]);
  now = 6_000;
  outage = true;
  const stale = await filter(items);
  assert.equal(stale.holderStatus, "stale");
  assert.deepEqual(stale.items.map((item) => item.tokenId), ["6"]);
  assert.equal((await filter(items)).holderStatus, "stale");
  assert.equal(attempts, 2, "an outage does not trigger a retry storm within the same block");
});
