import assert from "node:assert/strict";
import test from "node:test";

import {
  pickOwnedTezosDomains,
  pickReverseTezosDomain,
  primaryTezosDomain,
  resolveTezosDomainsIdentity,
  tezosDomainsQuery,
} from "./tezos-domains";

test("extracts reverse Tezos Domain from GraphQL reverseRecord payload", () => {
  assert.equal(
    pickReverseTezosDomain({
      data: {
        reverseRecord: {
          domain: { name: "  Joshua.WTF.TEZ  " },
        },
      },
    }),
    "joshua.wtf.tez"
  );
});

test("extracts owned Tezos Domains from GraphQL domains items", () => {
  assert.deepEqual(
    pickOwnedTezosDomains({
      data: {
        domains: {
          items: [
            { name: "artist.wtf.tez", owner: "tz1owner" },
            { name: "vault.tez", owner: "tz1owner" },
            { name: "" },
            { name: null },
          ],
        },
      },
    }),
    ["artist.wtf.tez", "vault.tez"]
  );
});

test("selects reverse domain first and owned-domain fallback second", () => {
  assert.equal(
    primaryTezosDomain({
      reverseDomain: "reverse.tez",
      ownedDomains: ["owned.tez"],
    }),
    "reverse.tez"
  );

  assert.equal(
    primaryTezosDomain({
      reverseDomain: null,
      ownedDomains: ["owned.tez"],
    }),
    "owned.tez"
  );

  assert.equal(
    primaryTezosDomain({ reverseDomain: null, ownedDomains: [] }, "stored.tez"),
    "stored.tez"
  );
});

test("uses GraphQL reverse and owner-domain queries with valid record filters", () => {
  assert.match(tezosDomainsQuery, /reverseRecord\(address: \$address, validity: VALID\)/);
  assert.match(tezosDomainsQuery, /domains\(first: \$limit, where: \{ owner: \{ equalTo: \$address \}, validity: VALID \}/);
});

test("caches Tezos Domains GraphQL identity lookups by address", async () => {
  let calls = 0;
  const client = {
    async postJson<T>() {
      calls += 1;
      return {
        data: {
          reverseRecord: { domain: { name: "cache.tez" } },
          domains: { items: [{ name: "cache.tez" }] },
        },
      } as T;
    },
  };

  await resolveTezosDomainsIdentity("tz1Cache111111111111111111111111111", { client });
  await resolveTezosDomainsIdentity("tz1Cache111111111111111111111111111", { client });

  assert.equal(calls, 1);
});

test("coalesces concurrent identity lookups into a single upstream call", async () => {
  let calls = 0;
  const client = {
    async postJson<T>() {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        data: {
          reverseRecord: { domain: { name: "single.tez" } },
          domains: { items: [{ name: "single.tez" }] },
        },
      } as T;
    },
  };

  const addr = "tz1SingleFlight2222222222222222222222";
  const results = await Promise.all(
    Array.from({ length: 20 }, () => resolveTezosDomainsIdentity(addr, { client })),
  );

  assert.equal(calls, 1);
  for (const result of results) {
    assert.equal(result.reverseDomain, "single.tez");
  }
});

test("negatively caches failed lookups so a failing upstream is not re-queried", async () => {
  let calls = 0;
  const client = {
    async postJson<T>(): Promise<T> {
      calls += 1;
      throw new Error("upstream unavailable");
    },
  };

  const addr = "tz1NegativeCache33333333333333333333";
  const first = await resolveTezosDomainsIdentity(addr, { client });
  const second = await resolveTezosDomainsIdentity(addr, { client });

  // Failure is swallowed (empty identity), and the second call is served from
  // the negative cache rather than hitting the upstream again.
  assert.deepEqual(first, { reverseDomain: null, ownedDomains: [] });
  assert.deepEqual(second, { reverseDomain: null, ownedDomains: [] });
  assert.equal(calls, 1);
});
