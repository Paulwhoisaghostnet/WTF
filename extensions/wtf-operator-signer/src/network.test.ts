import assert from "node:assert/strict";
import test from "node:test";
import {
  awaitPinnedWtfIapInclusion,
  preparePinnedWtfIapRpc,
  probeRpcChainId,
  rpcProbeCandidates,
  TEZOS_RPC_PRIMARY_BY_NETWORK,
} from "./network";

test("default Shadownet probing uses only the configured primary and fallback", () => {
  assert.deepEqual(
    rpcProbeCandidates("shadownet", TEZOS_RPC_PRIMARY_BY_NETWORK.shadownet!),
    [
      "https://tezos-shadownet.octez.io",
      "https://tcinfra.net/rpc/tezos/shadownet",
    ],
  );
  assert.deepEqual(rpcProbeCandidates("custom", "https://rpc.example.test/"), [
    "https://rpc.example.test",
  ]);
});

test("chain-id probing times out a stalled primary and accepts the configured fallback", async () => {
  const result = await probeRpcChainId({
    network: "shadownet",
    rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.shadownet!,
    timeoutMs: 5,
    fetchImpl: (async (url, init) => {
      if (String(url).includes("tezos-shadownet.octez.io")) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      }
      assert.match(String(url), /tcinfra\.net\/rpc\/tezos\/shadownet\/chains\/main\/chain_id$/u);
      return new Response(JSON.stringify("NetXsqzbfFenSTS"), { status: 200 });
    }) as typeof fetch,
  });

  assert.deepEqual(result, {
    chainId: "NetXsqzbfFenSTS",
    rpcUrl: "https://tcinfra.net/rpc/tezos/shadownet",
  });
});

test("chain-id probing rejects a named-network mismatch", async () => {
  await assert.rejects(
    probeRpcChainId({
      network: "shadownet",
      rpcUrl: "https://explicit.example.test",
      timeoutMs: 20,
      fetchImpl: (async () =>
        new Response(JSON.stringify("NetXdQprcVkpaWU"), { status: 200 })) as typeof fetch,
    }),
    /expected NetXsqzbfFenSTS, got NetXdQprcVkpaWU/u,
  );
});

test("Mainnet read-only preparation falls back after primary 503 and pins chain before contract lookup", async () => {
  const calls: string[] = [];
  const prepared = await preparePinnedWtfIapRpc({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU",
    connect: rpcUrl => ({
      getChainId: async () => {
        calls.push(`chain:${rpcUrl}`);
        if (rpcUrl.includes("octez.io")) throw new Error("HTTP 503");
        return "NetXdQprcVkpaWU";
      },
      prepare: async () => { calls.push(`contract:${rpcUrl}`); return "pinned contract"; },
    }),
  });
  assert.equal(prepared.rpcUrl, "https://tcinfra.net/rpc/tezos/mainnet");
  assert.equal(prepared.value, "pinned contract");
  assert.deepEqual(calls, [
    "chain:https://tezos-mainnet.octez.io",
    "chain:https://tcinfra.net/rpc/tezos/mainnet",
    "contract:https://tcinfra.net/rpc/tezos/mainnet",
  ]);
});

test("Mainnet fallback with the wrong chain is rejected before contract lookup", async () => {
  let contractReads = 0;
  await assert.rejects(preparePinnedWtfIapRpc({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU",
    connect: rpcUrl => ({
      getChainId: async () => {
        if (rpcUrl.includes("octez.io")) throw new Error("HTTP 503");
        return "NetXsqzbfFenSTS";
      },
      prepare: async () => { contractReads++; return "unsafe"; },
    }),
  }), /expected NetXdQprcVkpaWU/u);
  assert.equal(contractReads, 0);
});

test("confirmation reads configured Mainnet fallback when the primary fails", async () => {
  const hash = "o" + "1".repeat(50);
  const calls: string[] = [];
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: rpcUrl => ({
      getChainId: async () => {
        calls.push(rpcUrl);
        if (rpcUrl.includes("octez.io")) throw new Error("HTTP 503");
        return "NetXdQprcVkpaWU";
      },
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? 101 : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 60 }),
      getBlockHash: async ({ block }) => `B${block}`,
      getBlock: async ({ block }) => ({ hash: `B${block}`,
        operations: block === "101" ? [[{ hash }]] : [[]] }),
    }),
    waitForNextHead: async () => assert.fail("inclusion should be visible already"),
  });
  assert.equal(result, "included");
  assert.deepEqual(calls, [
    "https://tezos-mainnet.octez.io",
    "https://tcinfra.net/rpc/tezos/mainnet",
  ]);
});

test("confirmation ignores a wrong-chain primary and waits for a pinned reader", async () => {
  const hash = "o" + "1".repeat(50);
  const calls: string[] = [];
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: rpcUrl => ({
      getChainId: async () => {
        calls.push(rpcUrl);
        return rpcUrl.includes("octez.io") ? "NetXsqzbfFenSTS" : "NetXdQprcVkpaWU";
      },
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? 101 : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 60 }),
      getBlockHash: async ({ block }) => `B${block}`,
      getBlock: async ({ block }) => ({ hash: `B${block}`, operations: [[{ hash }]] }),
    }),
    waitForNextHead: async () => assert.fail("pinned fallback has the operation"),
  });
  assert.equal(result, "included");
  assert.deepEqual(calls, [
    "https://tezos-mainnet.octez.io",
    "https://tcinfra.net/rpc/tezos/mainnet",
  ]);
});

test("confirmation keeps waiting when every configured reader is temporarily unavailable", async () => {
  const hash = "o" + "1".repeat(50);
  let available = false;
  let waits = 0;
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: () => ({
      getChainId: async () => {
        if (!available) throw new Error("HTTP 503");
        return "NetXdQprcVkpaWU";
      },
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? 101 : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 60 }),
      getBlockHash: async ({ block }) => `B${block}`,
      getBlock: async ({ block }) => ({ hash: `B${block}`, operations: [[{ hash }]] }),
    }),
    waitForNextHead: async () => { waits++; available = true; },
  });
  assert.equal(result, "included");
  assert.equal(waits, 1);
});

test("fallback rescans blocks skipped by a failing primary before declaring expiry", async () => {
  const hash = "o" + "1".repeat(50);
  const reads: string[] = [];
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: rpcUrl => ({
      getChainId: async () => "NetXdQprcVkpaWU",
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? 103 : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 2 }),
      getBlockHash: async ({ block }) => `B${block}`,
      getBlock: async ({ block }) => {
        const source = rpcUrl.includes("octez.io") ? "primary" : "fallback";
        reads.push(`${source}:${block}`);
        if (source === "primary" && block === "102") throw new Error("HTTP 503");
        return { hash: `B${block}`, operations: source === "fallback" && block === "101"
          ? [[{ hash }]] : [[]] };
      },
    }),
    waitForNextHead: async () => assert.fail("fallback must see inclusion before expiry"),
  });
  assert.equal(result, "included");
  assert.deepEqual(reads, ["primary:101", "primary:102", "fallback:101"]);
});

test("confirmation rescans from the signed branch when the active endpoint changes", async () => {
  const hash = "o" + "1".repeat(50);
  let primaryDown = false;
  const reads: string[] = [];
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: rpcUrl => {
      const source = rpcUrl.includes("octez.io") ? "primary" : "fallback";
      return {
        getChainId: async () => {
          if (source === "primary" && primaryDown) throw new Error("HTTP 503");
          return "NetXdQprcVkpaWU";
        },
        getBlockHeader: async ({ block }) => ({ level: block === "head" ? (primaryDown ? 102 : 101) : 100 }),
        getConstants: async () => ({ max_operations_time_to_live: 3 }),
        getBlockHash: async ({ block }) => `${source}:${block}`,
        getBlock: async ({ block }) => {
          reads.push(`${source}:${block}`);
          return { hash: `${source}:${block}`, operations: source === "fallback" && block === "101"
            ? [[{ hash }]] : [[]] };
        },
      };
    },
    waitForNextHead: async () => { primaryDown = true; },
  });
  assert.equal(result, "included");
  assert.deepEqual(reads, ["primary:101", "fallback:101"]);
});

test("steady confirmation scans only newly reached blocks while the last block hash is stable", async () => {
  const hash = "o" + "1".repeat(50);
  let headLevel = 101;
  const reads: string[] = [];
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: "https://configured-mainnet-rpc.example",
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: () => ({
      getChainId: async () => "NetXdQprcVkpaWU",
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? headLevel : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 3 }),
      getBlockHash: async ({ block }) => `stable:${block}`,
      getBlock: async ({ block }) => {
        reads.push(block);
        return { hash: `stable:${block}`, operations: block === "103" ? [[{ hash }]] : [[]] };
      },
    }),
    waitForNextHead: async () => { headLevel++; },
  });
  assert.equal(result, "included");
  assert.deepEqual(reads, ["101", "102", "103"]);
});

test("confirmation rescans an earlier level after a same-endpoint reorg", async () => {
  const hash = "o" + "1".repeat(50);
  let reorged = false;
  const reads: string[] = [];
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: "https://configured-mainnet-rpc.example",
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: () => ({
      getChainId: async () => "NetXdQprcVkpaWU",
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? (reorged ? 102 : 101) : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 2 }),
      getBlockHash: async ({ block }) => `${reorged ? "new" : "old"}:${block}`,
      getBlock: async ({ block }) => {
        reads.push(block);
        return { hash: `${reorged ? "new" : "old"}:${block}`,
          operations: reorged && block === "101" ? [[{ hash }]] : [[]] };
      },
    }),
    waitForNextHead: async () => { reorged = true; },
  });
  assert.equal(result, "included");
  assert.deepEqual(reads, ["101", "101"]);
});

test("an expired primary cannot release the lane before the fallback scans its fork", async () => {
  const hash = "o" + "1".repeat(50);
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: rpcUrl => ({
      getChainId: async () => "NetXdQprcVkpaWU",
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? 103 : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 2 }),
      getBlockHash: async ({ block }) => `B${block}`,
      getBlock: async ({ block }) => ({ hash: `B${block}`,
        operations: rpcUrl.includes("tcinfra.net") && block === "101"
        ? [[{ hash }]] : [[]] }),
    }),
    waitForNextHead: async () => assert.fail("all candidates have already reached the horizon"),
  });
  assert.equal(result, "included");
});

test("confirmation holds until inclusion or the protocol branch horizon", async () => {
  const hash = "o" + "1".repeat(50);
  let headLevel = 100;
  let waits = 0;
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: hash,
    branchHash: "B" + "2".repeat(50),
    connect: () => ({
      getChainId: async () => "NetXdQprcVkpaWU",
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? headLevel : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 60 }),
      getBlockHash: async ({ block }) => `B${block}`,
      getBlock: async ({ block }) => ({ hash: `B${block}`,
        operations: block === "102" ? [[{ hash }]] : [[]] }),
    }),
    waitForNextHead: async () => { waits++; headLevel++; },
  });
  assert.equal(result, "included");
  assert.equal(waits, 2);
});

test("confirmation releases an absent operation only after the protocol TTL", async () => {
  const readLevels: string[] = [];
  const result = await awaitPinnedWtfIapInclusion({
    network: "mainnet", rpcUrl: TEZOS_RPC_PRIMARY_BY_NETWORK.mainnet!,
    expectedChainId: "NetXdQprcVkpaWU", operationHash: "o" + "1".repeat(50),
    branchHash: "B" + "2".repeat(50),
    connect: () => ({
      getChainId: async () => "NetXdQprcVkpaWU",
      getBlockHeader: async ({ block }) => ({ level: block === "head" ? 161 : 100 }),
      getConstants: async () => ({ max_operations_time_to_live: 60 }),
      getBlockHash: async ({ block }) => `B${block}`,
      getBlock: async ({ block }) => { readLevels.push(block);
        return { hash: `B${block}`, operations: [[]] }; },
    }),
    waitForNextHead: async () => assert.fail("signed branch has already expired"),
  });
  assert.equal(result, "expired");
  assert.equal(readLevels[0], "101");
  assert.equal(readLevels.at(-1), "160");
});
