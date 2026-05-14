import assert from "node:assert/strict";
import test from "node:test";

import {
  pickOwnedTezosDomains,
  pickReverseTezosDomain,
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
            { name: "vault.tez", owner: "tz1owner" },
            { name: "artist.wtf.tez", owner: "tz1owner" },
            { name: "" },
            { name: null },
          ],
        },
      },
    }),
    ["vault.tez", "artist.wtf.tez"]
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
